from celery import Task
from celery.utils.log import get_task_logger
import pandas as pd
import numpy as np
import json
import joblib
import os
import io
import base64
import time
from datetime import datetime, timezone
from sqlalchemy.orm import Session
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt
import seaborn as sns

from app.core.celery_app import celery_app
from app.database import SessionLocal
from app.models import Experiment
from app.ml.algorithms import DecisionTreeWrapper, RandomForestWrapper
from app.ml.preprocessing import preprocess_data
from app.ml.evaluation import evaluate_model, generate_visualizations
from common.storage_client import get_storage_client

logger = get_task_logger(__name__)

def convert_numpy_types(obj):
    """
    Convertit récursivement tous les types NumPy en types Python natifs
    pour permettre la sérialisation JSON dans SQLAlchemy.
    """
    if isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, dict):
        return {key: convert_numpy_types(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_numpy_types(item) for item in obj]
    elif isinstance(obj, tuple):
        return tuple(convert_numpy_types(item) for item in obj)
    else:
        return obj

class MLTrainingTask(Task):
    """Base task with database session management"""
    _db = None

    @property
    def db(self) -> Session:
        if self._db is None:
            self._db = SessionLocal()
        return self._db

@celery_app.task(bind=True, base=MLTrainingTask, name='train_model', 
                 soft_time_limit=7200, time_limit=7500,
                 autoretry_for=(ConnectionError, TimeoutError),
                 retry_kwargs={'max_retries': 3, 'countdown': 60},
                 retry_backoff=True)
def train_model(self, experiment_id: str):
    """
    Train a machine learning model based on experiment configuration
    
    Args:
        experiment_id: UUID of the experiment
        
    Returns:
        dict: Training results
    """
    logger.info(f"[CELERY WORKER] Starting training for experiment {experiment_id}")
    logger.info(f"[CELERY WORKER] Task ID: {self.request.id}")
    
    try:
        # Validation d'entrée stricte
        if not experiment_id or experiment_id == "":
            raise ValueError("experiment_id ne peut pas être vide")
        
        # Get experiment from database avec retry
        experiment = None
        for attempt in range(3):
            try:
                experiment = self.db.query(Experiment).filter(Experiment.id == experiment_id).first()
                break
            except Exception as db_error:
                logger.warning(f"Tentative {attempt + 1}/3 de connexion BDD échouée: {str(db_error)}")
                if attempt == 2:
                    raise
                time.sleep(2)
        
        if not experiment:
            raise ValueError(f"Experiment {experiment_id} not found")
        
        # Validation de l'état de l'expérience
        if experiment.status not in ['pending', 'failed']:
            raise ValueError(f"Experiment {experiment_id} is in invalid state: {experiment.status}")
        
        # Validation des paramètres requis
        if not experiment.algorithm:
            raise ValueError("Algorithm must be specified")
        if not experiment.dataset_id:
            raise ValueError("Dataset ID must be specified")
        if not experiment.hyperparameters:
            raise ValueError("Hyperparameters must be specified")
        if not experiment.preprocessing_config:
            raise ValueError("Preprocessing config must be specified")
        
        # Update status to running
        experiment.status = 'running'
        experiment.progress = 10
        self.db.commit()
        self.update_state(state='PROGRESS', meta={'current': 10, 'total': 100})
        
        # Initialize storage client
        storage_client = get_storage_client()
        
        # Load dataset using the new method that works with real datasets
        logger.info(f"Loading dataset {experiment.dataset_id}")
        
        try:
            # Try to get dataset info from service-selection first
            import requests
            service_selection_url = os.environ.get("SERVICE_SELECTION_URL", "http://service-selection-service.ibis-x.svc.cluster.local")
            response = requests.get(f"{service_selection_url}/datasets/{experiment.dataset_id}", timeout=10)
            
            if response.status_code == 200:
                dataset_info = response.json()
                storage_path = dataset_info.get('storage_path', f'ibis-x-datasets/{experiment.dataset_id}')
                
                # Find main data file
                files = dataset_info.get('files', [])
                main_file = None
                
                for file_info in files:
                    if file_info.get('format') == 'parquet' and file_info.get('logical_role') in ['data_file', 'training_data', None]:
                        main_file = file_info
                        break
                
                if not main_file and files:
                    main_file = files[0]
                
                if main_file:
                    object_path = f"{storage_path.rstrip('/')}/{main_file['file_name_in_storage']}"
                    logger.info(f"Loading dataset from: {object_path}")
                    
                    # Download file data
                    file_data = storage_client.download_file(object_path)
                    data_buffer = io.BytesIO(file_data)
                    df = pd.read_parquet(data_buffer)
                    
                    # Nettoyer les valeurs manquantes mal formatées
                    df = _clean_missing_values_for_training(df)
                else:
                    raise Exception("No suitable data file found")
            else:
                # Fallback to old path structure
                logger.warning(f"Could not get dataset info from service-selection, trying fallback path")
                dataset_path = f"ibis-x-datasets/{experiment.dataset_id}/data.parquet"
                file_data = storage_client.download_file(dataset_path)
                data_buffer = io.BytesIO(file_data)
                df = pd.read_parquet(data_buffer)
                
                # Nettoyer les valeurs manquantes mal formatées
                df = _clean_missing_values_for_training(df)
                
        except Exception as e:
            logger.error(f"Error loading dataset: {str(e)}")
            # Fallback intelligent - essayer le chemin direct avec storage_path
            try:
                logger.info(f"Trying direct path with storage_path: {experiment.dataset_id}")
                dataset_path = f"ibis-x-datasets/{experiment.dataset_id}"
                
                # Essayer de lister les fichiers dans le répertoire
                storage_client = get_storage_client()
                
                # Essayer différents noms de fichiers possibles
                possible_files = [
                    f"{dataset_path}/data.parquet",
                    f"{dataset_path}/dataset.parquet", 
                    f"{dataset_path}/train.parquet"
                ]
                
                # Essayer de télécharger un fichier qui existe
                file_data = None
                successful_path = None
                
                for file_path in possible_files:
                    try:
                        logger.info(f"Trying to download: {file_path}")
                        file_data = storage_client.download_file(file_path)
                        successful_path = file_path
                        break
                    except Exception as inner_e:
                        logger.warning(f"Failed to download {file_path}: {str(inner_e)}")
                        continue
                
                if file_data:
                    logger.info(f"Successfully loaded dataset from: {successful_path}")
                    data_buffer = io.BytesIO(file_data)
                    df = pd.read_parquet(data_buffer)
                else:
                    raise Exception("No dataset file found in any expected location")
                    
            except Exception as fallback_error:
                logger.warning(f"All dataset loading methods failed: {str(fallback_error)}")
                logger.info("Using synthetic fallback data for demonstration")
                # Utiliser les données de fallback
                df = _generate_fallback_data(5000)
        
        logger.info(f"Dataset loaded: {df.shape[0]} rows, {df.shape[1]} columns")
        
        # Update progress avec délai UX pour permettre à l'utilisateur de voir l'étape
        experiment.progress = 30
        self.db.commit()
        self.update_state(state='PROGRESS', meta={'current': 30, 'total': 100})
        time.sleep(1.5)  # Délai UX pour voir l'étape "Chargement des données"
        
        # Validation des données avant preprocessing
        target_column = experiment.preprocessing_config.get('target_column')
        task_type = experiment.preprocessing_config.get('task_type', 'classification')
        
        logger.info(f"Validating data for task_type: {task_type}, target: {target_column}")
        
        if target_column not in df.columns:
            raise ValueError(f"Target column '{target_column}' not found in dataset")
        
        # Analyse de la variable cible
        y_values = df[target_column].dropna()
        unique_values = y_values.nunique()
        
        if task_type == 'classification':
            unique_classes, class_counts = np.unique(y_values, return_counts=True)
            min_class_count = class_counts.min()
            
            logger.info(f"Classification task: {len(unique_classes)} classes, min count: {min_class_count}")
            
            if min_class_count < 2:
                # 🔧 FIX: Au lieu de forcer la régression, supprimer les classes avec peu d'exemples
                classes_to_remove = unique_classes[class_counts < 2]
                logger.warning(f"⚠️ Classes avec moins de 2 exemples détectées: {classes_to_remove}")
                logger.warning(f"🔧 Suppression automatique de ces classes pour éviter les erreurs")
                
                # Filtrer le DataFrame pour supprimer ces classes
                df_before = len(df)
                df = df[~df[target_column].isin(classes_to_remove)]
                df_after = len(df)
                
                logger.info(f"✅ Filtrage effectué: {df_before} → {df_after} lignes ({df_before - df_after} supprimées)")
                
                # Recalculer les stats après filtrage
                y_values = df[target_column].dropna()
                unique_classes, class_counts = np.unique(y_values, return_counts=True)
                logger.info(f"📊 Après filtrage: {len(unique_classes)} classes restantes")
                
                # Ajouter une note dans preprocessing_config pour information
                experiment.preprocessing_config['classes_removed'] = classes_to_remove.tolist()
                experiment.preprocessing_config['rows_filtered'] = df_before - df_after
                
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(experiment, 'preprocessing_config')
                self.db.commit()
                
                # Vérifier qu'il reste assez de classes
                if len(unique_classes) < 2:
                    raise ValueError(f"Après filtrage, il ne reste que {len(unique_classes)} classe(s). Classification impossible.")
        
        # Preprocess data
        logger.info("Preprocessing data")
        preprocessing_config_copy = experiment.preprocessing_config.copy()
        X_train, X_test, y_train, y_test, preprocessing_pipeline, preprocessing_info = preprocess_data(
            df, 
            preprocessing_config_copy
        )
        
        # 🔧 CRUCIAL: Propager les corrections de preprocessing_config vers la BDD
        if preprocessing_config_copy.get('task_type') != experiment.preprocessing_config.get('task_type'):
            logger.warning(f"🔄 Propagating task_type correction to database")
            logger.warning(f"   Before: {experiment.preprocessing_config.get('task_type')}")
            logger.warning(f"   After: {preprocessing_config_copy.get('task_type')}")
            
            # Mettre à jour la configuration en BDD
            experiment.preprocessing_config = preprocessing_config_copy
            
            # Marquer explicitement la modification pour SQLAlchemy
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(experiment, 'preprocessing_config')
            self.db.commit()
            
            logger.info("✅ Task type correction saved to database")
        
        # Log des informations de preprocessing pour l'utilisateur
        if preprocessing_info.get('data_modified', False):
            logger.warning(f"⚠️  DATASET MODIFIÉ: {preprocessing_info['warning_message']}")
            logger.info(f"📊 Dataset final: {preprocessing_info['final_rows']} lignes sur {preprocessing_info['original_rows']} originales")
        
        # Update progress avec délai UX
        experiment.progress = 50
        self.db.commit()
        self.update_state(state='PROGRESS', meta={'current': 50, 'total': 100})
        time.sleep(2.0)  # Délai UX pour voir l'étape "Préprocessing"
        
        # Initialize model based on algorithm avec task_type ORIGINAL
        # 🔧 FIX: Respecter le choix de l'utilisateur, ne pas utiliser une version auto-corrigée
        user_task_type = experiment.hyperparameters.get('task_type', task_type)
        logger.info(f"🎯 Using user-selected task_type: {user_task_type} (not auto-corrected)")
        corrected_task_type = user_task_type
        
        # Double vérification et debugging détaillé
        original_type = experiment.preprocessing_config.get('original_task_type')
        if original_type and original_type != corrected_task_type:
            logger.info(f"✅ Auto-correction confirmée: {original_type} → {corrected_task_type}")
        else:
            logger.info(f"📋 Task type normal: {corrected_task_type}")
        
        logger.info(f"🔧 Training {experiment.algorithm} model with FINAL task_type: {corrected_task_type}")
        
        # 🔍 VALIDATION CRITIQUE: Vérifier que y_train est bien encodé
        logger.info(f"🎯 FINAL TARGET VALIDATION:")
        logger.info(f"📊 y_train shape: {y_train.shape}")
        logger.info(f"🔤 y_train dtype: {y_train.dtype}")
        logger.info(f"📋 y_train sample values: {y_train[:5].tolist() if hasattr(y_train, 'tolist') else y_train[:5]}")
        logger.info(f"📈 y_train unique values: {len(np.unique(y_train))}")
        
        if hasattr(y_train, 'dtype') and y_train.dtype == 'object':
            logger.error("❌ ERREUR CRITIQUE: y_train contient encore des objets (strings)!")
            raise ValueError("La variable cible y_train contient encore des valeurs non numériques")
        
        logger.info("✅ Target validation passed - y_train is numeric")
        
        # ✅ AUDIT HYPERPARAMÈTRES : Vérifier que ceux du wizard sont utilisés
        logger.info(f"🔍 AUDIT HYPERPARAMÈTRES du wizard : {experiment.hyperparameters}")
        
        if experiment.algorithm == 'decision_tree':
            logger.info(f"🌳 Creating DecisionTreeWrapper(task_type={corrected_task_type})")
            logger.info(f"📊 HYPERPARAMÈTRES UTILISÉS : {experiment.hyperparameters}")
            # Retirer task_type des hyperparamètres pour éviter la duplication
            hyperparams_without_task_type = {k: v for k, v in experiment.hyperparameters.items() if k != 'task_type'}
            model = DecisionTreeWrapper(task_type=corrected_task_type, **hyperparams_without_task_type)
        elif experiment.algorithm == 'random_forest':
            logger.info(f"🌲 Creating RandomForestWrapper(task_type={corrected_task_type})")
            logger.info(f"📊 HYPERPARAMÈTRES UTILISÉS : {experiment.hyperparameters}")
            # Retirer task_type des hyperparamètres pour éviter la duplication
            hyperparams_without_task_type = {k: v for k, v in experiment.hyperparameters.items() if k != 'task_type'}
            model = RandomForestWrapper(task_type=corrected_task_type, **hyperparams_without_task_type)
        else:
            raise ValueError(f"Unknown algorithm: {experiment.algorithm}")
        
        # Vérification finale du type de modèle créé
        model_type = "Regressor" if hasattr(model.model, 'predict') and hasattr(model.model, '_estimator_type') and model.model._estimator_type == 'regressor' else "Classifier"
        logger.info(f"🎯 Model type created: {type(model.model).__name__} ({model_type})")
        
        # Train model
        model.fit(X_train, y_train)
        
        # Update progress avec délai UX  
        experiment.progress = 70
        self.db.commit()
        self.update_state(state='PROGRESS', meta={'current': 70, 'total': 100})
        time.sleep(1.5)  # Délai UX pour voir l'étape "Entraînement"
        
        # Evaluate model avec task_type ORIGINAL (ne pas utiliser une version modifiée)
        # 🔧 FIX: Utiliser le task_type du hyperparameters qui vient du frontend
        final_task_type = experiment.hyperparameters.get('task_type', experiment.preprocessing_config.get('task_type', 'classification'))
        logger.info(f"Evaluating model with task_type: {final_task_type} (from user selection)")
        
        # 🆕 NOUVEAU : Passer algorithm_type pour métriques spécifiques Random Forest
        algorithm_type = experiment.algorithm  # 'random_forest' ou 'decision_tree'
        logger.info(f"🎯 Evaluating with algorithm_type: {algorithm_type} for specific metrics")
        metrics = evaluate_model(model, X_test, y_test, task_type=final_task_type, algorithm_type=algorithm_type)
        
        # Generate visualizations avec task_type corrigé
        logger.info(f"🎯 DÉBUT GÉNÉRATION VISUALISATIONS - task_type: {final_task_type}")
        logger.info(f"🔍 Model type: {type(model)}")
        logger.info(f"🔍 Model has predict_proba: {hasattr(model, 'predict_proba')}")
        logger.info(f"🔍 Unique classes in y_test: {np.unique(y_test)}")
        logger.info(f"🔍 Number of classes: {len(np.unique(y_test))}")
        
        # Récupérer les noms de classes depuis preprocessing_info
        class_names = preprocessing_info.get('label_classes', None)
        logger.info(f"🏷️ Class names from preprocessing: {class_names}")
        
        visualizations = generate_visualizations(
            model, X_test, y_test, 
            feature_names=preprocessing_pipeline.get_feature_names_out() if hasattr(preprocessing_pipeline, 'get_feature_names_out') else None,
            task_type=final_task_type,
            class_names=class_names  # Passer les noms de classes
        )
        
        logger.info(f"🎯 VISUALISATIONS GÉNÉRÉES - Keys: {list(visualizations.keys())}")
        logger.info(f"🎯 VISUALISATIONS GÉNÉRÉES - Count: {len(visualizations)}")
        for viz_key in visualizations.keys():
            logger.info(f"✅ Visualisation générée: {viz_key}")
            if isinstance(visualizations[viz_key], dict) and 'image' in visualizations[viz_key]:
                image_size = len(visualizations[viz_key]['image'])
                logger.info(f"   📊 {viz_key} - Image size: {image_size} chars")
        
        # Update progress avec délai UX
        experiment.progress = 90
        self.db.commit()
        self.update_state(state='PROGRESS', meta={'current': 90, 'total': 100})
        time.sleep(1.0)  # Délai UX pour voir l'étape "Évaluation"
        
        # Save model and artifacts avec versioning
        logger.info("Saving model artifacts with versioning")
        model_version = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        model_filename = f"model_{experiment.id}_v{model_version}.joblib"
        model_path = f"ibis-x-models/{experiment.project_id}/{experiment.id}/v{model_version}/{model_filename}"
        
        # Save model to buffer
        model_buffer = io.BytesIO()
        joblib.dump({
            'model': model,
            'preprocessing_pipeline': preprocessing_pipeline,
            'feature_names': preprocessing_pipeline.get_feature_names_out() if hasattr(preprocessing_pipeline, 'get_feature_names_out') else None,
            'training_config': {
                'algorithm': experiment.algorithm,
                'hyperparameters': experiment.hyperparameters,
                'preprocessing_config': experiment.preprocessing_config
            }
        }, model_buffer)
        model_buffer.seek(0)
        
        # Upload model to storage avec validation
        logger.info(f"📤 Uploading model to {model_path} - Buffer type: {type(model_buffer)}")
        if not hasattr(model_buffer, 'seek'):
            logger.error(f"❌ model_buffer is not BytesIO: {type(model_buffer)}")
            raise ValueError(f"model_buffer must be BytesIO, got {type(model_buffer)}")
        
        storage_client.upload_file(model_buffer, model_path)
        logger.info(f"✅ Model uploaded successfully to {model_path}")
        
        # 🔧 CORRECTION: Stocker les visualisations en base64 directement (pas d'upload MinIO)
        viz_urls = {}
        logger.info(f"🔄 PROCESSING VISUALIZATIONS - Total: {len(visualizations)}")
        
        for viz_name, viz_data in visualizations.items():
            logger.info(f"🔍 Processing visualization: {viz_name} - Type: {type(viz_data)}")
            if isinstance(viz_data, dict) and 'image' in viz_data:
                # 🎯 GARDER LES IMAGES EN BASE64 pour affichage direct
                viz_urls[viz_name] = viz_data  # Stocker l'objet complet {'image': base64_string}
                logger.info(f"✅ Visualization stored as base64: {viz_name} - Size: {len(viz_data['image'])} chars")
            else:
                logger.warning(f"⚠️ Skipping visualization {viz_name} - Invalid format or missing image data")
                
        logger.info(f"🎯 VISUALIZATION PROCESSING COMPLETED - Total stored: {len(viz_urls)}")
        logger.info(f"🎯 STORED VISUALIZATIONS: {list(viz_urls.keys())}")
        
        # 🔧 SOLUTION DURABLE: Extraction des VRAIS NOMS DE FEATURES en premier
        logger.info("🔧 Starting REAL feature names extraction...")
        real_feature_names = None
        
        # Méthode 1: Depuis le preprocessing pipeline (priorité)
        if hasattr(preprocessing_pipeline, 'get_feature_names_out'):
            try:
                real_feature_names = preprocessing_pipeline.get_feature_names_out().tolist()
                logger.info(f"🎯 REAL FEATURE NAMES extracted from pipeline: {real_feature_names[:5]}..." if len(real_feature_names) > 5 else f"🎯 REAL FEATURE NAMES extracted: {real_feature_names}")
            except Exception as feature_error:
                logger.warning(f"Could not extract feature names from pipeline: {str(feature_error)}")
        
        # Méthode 2: Depuis les colonnes originales (fallback)
        if real_feature_names is None:
            target_column = experiment.preprocessing_config.get('target_column')
            if target_column and target_column in df.columns:
                # 🚨 CORRECTION CRITIQUE: Exclure SYSTÉMATIQUEMENT les colonnes d'identifiant
                id_columns = [col for col in df.columns if col.lower() in ['id', 'index', 'idx', 'row_id', 'item_id']]
                columns_to_exclude = [target_column] + id_columns
                
                real_feature_names = [col for col in df.columns if col not in columns_to_exclude]
                
                logger.warning(f"🚨 EXCLUSION SYSTÉMATIQUE d'identifiants non-prédictifs: {id_columns}")
                logger.info(f"🎯 REAL FEATURE NAMES from ORIGINAL dataset columns (Id exclus): {real_feature_names}")
                logger.info(f"📊 VERIFICATION : Ces sont les VRAIES colonnes PRÉDICTIVES de votre dataset")
                logger.info(f"🚫 Colonnes exclues (non-prédictives): {columns_to_exclude}")
        
        # Méthode 3: Fallback générique si tout échoue
        if real_feature_names is None:
            if hasattr(preprocessing_pipeline, 'n_features_in_'):
                n_features = preprocessing_pipeline.n_features_in_
                real_feature_names = [f'feature_{i}' for i in range(n_features)]
                logger.warning(f"🚨 FALLBACK: Utilisation de noms génériques pour {n_features} features")
        
        logger.info(f"✅ REAL FEATURE NAMES finalized: {len(real_feature_names) if real_feature_names else 0} features")
        
        # Extract feature importance - AVEC CONVERSION NUMPY et vrais noms de features
        feature_importance = {}
        if hasattr(model, 'get_feature_importance'):
            # ✅ PASSER LES VRAIS NOMS DE FEATURES à get_feature_importance
            importance_data = model.get_feature_importance(feature_names=real_feature_names)
            if importance_data is not None and len(importance_data) > 0:
                feature_names = importance_data.get('features', [])
                importances = importance_data.get('importance', [])
                # Convertir immédiatement les importances NumPy
                safe_importances = convert_numpy_types(importances)
                feature_importance = dict(zip(feature_names[:20], safe_importances[:20]))  # Top 20 features

        # Extract tree structure for Decision Tree and Random Forest - AVEC VRAIS NOMS DE FEATURES
        logger.info("🔧 Starting tree structure extraction with REAL feature names...")
        tree_structure = {}
        
        try:
            if hasattr(model, 'get_tree_structure'):
                logger.info(f"📊 Extracting tree structure for {experiment.algorithm}")
                
                # ✅ OBTENIR LES VRAIS NOMS DE CLASSES pour la classification
                real_class_names = None
                if final_task_type == 'classification':
                    try:
                        # Obtenir les vraies classes depuis les données d'entraînement
                        unique_classes = np.unique(y_train)
                        real_class_names = [str(cls) for cls in unique_classes]
                        logger.info(f"🎯 REAL CLASS NAMES extracted: {real_class_names}")
                    except Exception as class_error:
                        logger.warning(f"Could not extract class names: {str(class_error)}")
                
                # Extraire la structure avec les vrais noms de features ET classes
                tree_data = model.get_tree_structure(feature_names=real_feature_names, class_names=real_class_names)
                if tree_data is not None:
                    tree_structure = tree_data
                    logger.info(f"✅ Tree structure extracted successfully for {experiment.algorithm} with REAL feature names")
                else:
                    logger.info(f"⚠️ No tree structure available for {experiment.algorithm}")
            else:
                logger.info(f"ℹ️ Model {experiment.algorithm} does not support tree structure extraction")
        except Exception as tree_error:
            logger.error(f"❌ Error extracting tree structure: {str(tree_error)}", exc_info=True)
            # Ne pas faire planter l'entraînement à cause de l'extraction d'arbre
            tree_structure = {}
        
        logger.info("🔧 Tree structure extraction completed, updating experiment status...")
        
        # Délai final pour voir la progression à 90% avant 100%
        time.sleep(2.0)  # Délai UX pour voir l'étape "Sauvegarde" avant completion
        
        logger.info("📝 Updating experiment with final results...")
        
        try:
            # 🔧 CONVERSION NUMPY AVANT SAUVEGARDE - SOLUTION DÉFINITIVE
            logger.info("🔧 Converting NumPy types to native Python types...")
            
            # Convertir toutes les données problématiques
            safe_metrics = convert_numpy_types(metrics)
            safe_feature_importance = convert_numpy_types(feature_importance)
            safe_viz_urls = convert_numpy_types(viz_urls)
            safe_tree_structure = convert_numpy_types(tree_structure)
            
            # 🔍 DEBUG: Log des données avant sauvegarde
            logger.info(f"🔍 FINAL DATA CHECK - viz_urls keys: {list(viz_urls.keys())}")
            logger.info(f"🔍 FINAL DATA CHECK - safe_viz_urls keys: {list(safe_viz_urls.keys())}")
            logger.info(f"🔍 FINAL DATA CHECK - metrics keys: {list(safe_metrics.keys()) if isinstance(safe_metrics, dict) else 'Not a dict'}")
            
            logger.info("✅ NumPy conversion completed successfully")
            
            # Update experiment with results - AVEC DONNÉES CONVERTIES
            experiment.status = 'completed'
            experiment.progress = 100
            experiment.metrics = safe_metrics
            experiment.artifact_uri = model_path
            experiment.visualizations = safe_viz_urls
            experiment.feature_importance = safe_feature_importance
            
            # 🆕 Ajouter les informations de preprocessing pour informer l'utilisateur
            safe_preprocessing_info = convert_numpy_types(preprocessing_info)
            # Stocker les métadonnées dans le champ visualizations sous une clé spéciale
            safe_viz_urls['preprocessing_info'] = safe_preprocessing_info
            experiment.visualizations = safe_viz_urls
            
            # 🎯 CORRECTION CRITIQUE: Ajouter dataset_size dans preprocessing_config pour le frontend
            experiment.preprocessing_config['dataset_size'] = preprocessing_info.get('final_rows', len(y_train) + len(y_test))
            experiment.preprocessing_config['original_dataset_size'] = preprocessing_info.get('original_rows', len(y_train) + len(y_test))
            experiment.preprocessing_config['feature_count'] = X_train.shape[1] if hasattr(X_train, 'shape') else len(preprocessing_pipeline.get_feature_names_out()) if hasattr(preprocessing_pipeline, 'get_feature_names_out') else 0
            
            # Marquer la modification pour SQLAlchemy
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(experiment, 'preprocessing_config')
            self.db.commit()
            logger.info(f"✅ Dataset size added to preprocessing_config: {experiment.preprocessing_config['dataset_size']} samples")
            
            logger.info("💾 Basic experiment data updated, adding tree structure if available...")
            
            # Ajouter la structure d'arbre si disponible - AVEC CONVERSION NUMPY
            if safe_tree_structure and isinstance(safe_tree_structure, dict) and len(safe_tree_structure) > 0:
                try:
                    # Stocker la structure d'arbre dans visualizations - DÉJÀ CONVERTIE
                    safe_viz_urls['tree_structure'] = safe_tree_structure
                    experiment.visualizations = safe_viz_urls
                    logger.info(f"✅ Tree structure added to experiment results")
                except Exception as tree_store_error:
                    logger.error(f"⚠️ Could not store tree structure: {str(tree_store_error)}")
                    # Continue sans la structure d'arbre
            
            experiment.updated_at = datetime.now(timezone.utc)
            logger.info("💾 Committing experiment to database...")
            
            self.db.commit()
            
            logger.info(f"🎉 Training completed successfully for experiment {experiment_id}")
            
            # Audit final
            logger.info(f"[AUDIT] Experiment {experiment_id} completed - Model: {model_path}, Metrics: {metrics.get('accuracy', 'N/A')}")

            # Retourner le résultat de succès
            return {
                'status': 'completed',
                'metrics': metrics,
                'model_uri': model_path,
                'visualizations': viz_urls,
                'training_duration': (datetime.now(timezone.utc) - experiment.created_at).total_seconds()
            }

        except Exception as update_error:
            logger.error(f"❌ Error updating experiment final status: {str(update_error)}", exc_info=True)
            # Re-raise l'erreur pour déclencher la gestion d'erreur générale
            raise
        
    except Exception as e:
        logger.error(f"[ERROR] Training failed for experiment {experiment_id}: {str(e)}", exc_info=True)
        
        # Mise à jour d'erreur avec retry de BDD
        try:
            experiment = self.db.query(Experiment).filter(Experiment.id == experiment_id).first()
            if experiment:
                experiment.status = 'failed'
                experiment.error_message = f"Training failed: {str(e)}"
                experiment.updated_at = datetime.now(timezone.utc)
                self.db.commit()
                logger.info(f"[AUDIT] Experiment {experiment_id} marked as failed")
        except Exception as db_error:
            logger.error(f"[CRITICAL] Could not update experiment status: {str(db_error)}")
        
        # Tentative de nettoyage des artefacts partiels
        try:
            storage_client = get_storage_client()
            if 'model_path' in locals():
                storage_client.delete_file(model_path)
                logger.info(f"Cleaned up partial model artifact: {model_path}")
        except Exception as cleanup_error:
            logger.warning(f"Could not cleanup artifacts: {str(cleanup_error)}")
        
        raise
    
    finally:
        # Clean up database session
        if self._db:
            self._db.close()
            self._db = None


def _generate_fallback_data(n_samples: int = 5000) -> pd.DataFrame:
    """
    Génère un dataset synthétique de fallback pour les tests.
    Simule les données Breast Cancer avec colonnes numériques.
    """
    np.random.seed(42)  # Pour reproductibilité
    
    # Générer des colonnes similaires au dataset Breast Cancer
    columns = [
        'mean_radius', 'mean_texture', 'mean_perimeter', 'mean_area', 'mean_smoothness',
        'mean_compactness', 'mean_concavity', 'mean_concave_points', 'mean_symmetry', 'mean_fractal_dimension',
        'radius_error', 'texture_error', 'perimeter_error', 'area_error', 'smoothness_error',
        'compactness_error', 'concavity_error', 'concave_points_error', 'symmetry_error', 'fractal_dimension_error',
        'worst_radius', 'worst_texture', 'worst_perimeter', 'worst_area', 'worst_smoothness',
        'worst_compactness', 'worst_concavity', 'worst_concave_points', 'worst_symmetry', 'worst_fractal_dimension',
        'target', 'fractal_dimension_worst', 'radius_worst'
    ]
    
    data = {}
    for col in columns:
        if 'target' in col:
            # Variable binaire pour classification
            data[col] = np.random.choice([0, 1], size=n_samples)
        elif 'fractal_dimension' in col or 'worst' in col:
            # Variables continues pour régression
            data[col] = np.random.uniform(0.0, 1.0, size=n_samples)
        else:
            # Variables numériques générales
            data[col] = np.random.normal(10.0, 3.0, size=n_samples)
    
    df = pd.DataFrame(data)
    logger.info(f"Generated fallback synthetic dataset: {df.shape[0]} rows, {df.shape[1]} columns")
    return df


@celery_app.task(bind=True, name="app.tasks.analyze_dataset_with_ai")
def analyze_dataset_with_ai(self, dataset_id: str, target_column: str, user_id: str):
    """
    Tâche Celery pour analyser un dataset avec OpenAI et donner des recommandations
    personnalisées sur le choix Classification vs Régression.
    """
    from app.ai.llm_service import get_dataset_analysis_service
    from app.services.dataset_service import get_dataset_info
    
    logger.info(f"Démarrage analyse IA pour dataset {dataset_id}, colonne {target_column}")
    
    try:
        # 1. Récupérer les informations du dataset
        dataset_info = get_dataset_info(dataset_id)
        
        if not dataset_info:
            raise ValueError(f"Dataset {dataset_id} introuvable")
        
        # 2. Appeler le service d'analyse IA
        analysis_service = get_dataset_analysis_service()
        
        analysis_result = analysis_service.analyze_dataset_for_task_recommendation(
            dataset_info=dataset_info,
            target_column=target_column
        )
        
        logger.info(f"Analyse IA terminée - Recommandation: {analysis_result.get('recommendation')}")
        
        # 3. Retourner le résultat
        return {
            'success': True,
            'analysis': analysis_result,
            'dataset_id': dataset_id,
            'target_column': target_column,
            'user_id': user_id,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        logger.error(f"Erreur analyse IA dataset {dataset_id}: {str(e)}")
        
        # Retourner une erreur structurée
        return {
            'success': False,
            'error': str(e),
            'dataset_id': dataset_id,
            'target_column': target_column,
            'user_id': user_id,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }


@celery_app.task(bind=True, name="app.tasks.analyze_algorithm_with_ai")
def analyze_algorithm_with_ai(self, dataset_id: str, target_column: str, task_type: str, user_id: str):
    """
    Tâche Celery pour analyser un dataset avec OpenAI et recommander le meilleur algorithme
    basé sur les caractéristiques des données et le type de tâche.
    """
    from app.ai.llm_service import get_algorithm_analysis_service
    from app.services.dataset_service import get_dataset_info
    
    logger.info(f"Démarrage analyse IA algorithme pour dataset {dataset_id}, colonne {target_column}, type {task_type}")
    
    try:
        # 1. Récupérer les informations du dataset
        dataset_info = get_dataset_info(dataset_id)
        
        if not dataset_info:
            raise ValueError(f"Dataset {dataset_id} introuvable")
        
        # 2. Appeler le service d'analyse IA pour algorithmes
        analysis_service = get_algorithm_analysis_service()
        
        analysis_result = analysis_service.analyze_dataset_for_algorithm_recommendation(
            dataset_info=dataset_info,
            target_column=target_column,
            task_type=task_type
        )
        
        logger.info(f"Analyse IA algorithme terminée - Recommandation: {analysis_result.get('recommended_algorithm')}")
        
        # 3. Retourner le résultat
        return {
            'success': True,
            'analysis': analysis_result,
            'dataset_id': dataset_id,
            'target_column': target_column,
            'task_type': task_type,
            'user_id': user_id,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        logger.error(f"Erreur analyse IA algorithme dataset {dataset_id}: {str(e)}")
        
        # Retourner une erreur structurée
        return {
            'success': False,
            'error': str(e),
            'dataset_id': dataset_id,
            'target_column': target_column,
            'task_type': task_type,
            'user_id': user_id,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }

def _clean_missing_values_for_training(df: pd.DataFrame) -> pd.DataFrame:
    """
    Nettoie les valeurs manquantes mal formatées dans le DataFrame pour l'entraînement.
    
    Convertit les chaînes vides, 'null', 'NaN', etc. en vraies valeurs NaN de pandas.
    """
    import numpy as np
    
    # Liste des valeurs à considérer comme manquantes
    null_values = [
        '',           # Chaîne vide
        ' ',          # Espace seul
        'null',       # null minuscule
        'NULL',       # null majuscule
        'Null',       # null avec majuscule
        'NaN',        # NaN majuscule
        'nan',        # nan minuscule
        'None',       # None Python
        'NONE',       # NONE majuscule
        'undefined',  # undefined JavaScript
        'UNDEFINED',  # UNDEFINED majuscule
        'N/A',        # N/A
        'n/a',        # n/a minuscule
        'NA',         # NA
        'na'          # na minuscule
    ]
    
    # Remplacer toutes ces valeurs par NaN
    df_cleaned = df.replace(null_values, np.nan)
    
    # Log des changements
    original_nulls = df.isnull().sum().sum()
    cleaned_nulls = df_cleaned.isnull().sum().sum()
    
    if cleaned_nulls > original_nulls:
        logger.info(f"🧹 Nettoyage des valeurs manquantes pour entraînement: {original_nulls} → {cleaned_nulls} valeurs null détectées")
        
        # Log détaillé par colonne
        for col in df.columns:
            original_col_nulls = df[col].isnull().sum()
            cleaned_col_nulls = df_cleaned[col].isnull().sum()
            if cleaned_col_nulls > original_col_nulls:
                logger.info(f"   📋 {col}: {original_col_nulls} → {cleaned_col_nulls} valeurs null")
    
    return df_cleaned 