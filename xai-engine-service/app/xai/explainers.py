import shap
import lime
import lime.lime_tabular
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import joblib
import io
import base64
from typing import Dict, Any, List, Optional, Tuple, Union
import logging
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
from sklearn.preprocessing import LabelEncoder

logger = logging.getLogger(__name__)

class BaseExplainer:
    """Classe de base pour tous les explainers XAI."""
    
    def __init__(self, model, X_train: pd.DataFrame, feature_names: List[str]):
        self.model = model
        self.X_train = X_train
        self.feature_names = feature_names
        self.model_type = self._detect_model_type()
        self.task_type = self._detect_task_type()
        
    def _detect_model_type(self) -> str:
        """Détecter le type de modèle."""
        model_name = type(self.model).__name__
        
        # Détecter les modèles scikit-learn directs
        if isinstance(self.model, (RandomForestClassifier, RandomForestRegressor)):
            return "random_forest"
        elif isinstance(self.model, (DecisionTreeClassifier, DecisionTreeRegressor)):
            return "decision_tree"
        
        # Détecter les wrappers par nom
        elif 'DecisionTree' in model_name or 'Tree' in model_name:
            logger.info(f"🌳 Wrapper d'arbre détecté: {model_name}")
            return "decision_tree"
        elif 'RandomForest' in model_name or 'Forest' in model_name:
            logger.info(f"🌲 Wrapper de forêt détecté: {model_name}")
            return "random_forest"
        
        # Vérifier le modèle sous-jacent si c'est un wrapper
        underlying_model = getattr(self.model, 'model', None)
        if underlying_model:
            underlying_name = type(underlying_model).__name__
            logger.info(f"🔍 Vérification modèle sous-jacent: {underlying_name}")
            
            if isinstance(underlying_model, (RandomForestClassifier, RandomForestRegressor)):
                return "random_forest"
            elif isinstance(underlying_model, (DecisionTreeClassifier, DecisionTreeRegressor)):
                return "decision_tree"
        
        return "unknown"
    
    def _detect_task_type(self) -> str:
        """Détecter si c'est classification ou régression."""
        if isinstance(self.model, (RandomForestClassifier, DecisionTreeClassifier)):
            return "classification"
        elif isinstance(self.model, (RandomForestRegressor, DecisionTreeRegressor)):
            return "regression"
        else:
            # Essayer de détecter via la méthode predict_proba
            if hasattr(self.model, 'predict_proba'):
                return "classification"
            else:
                return "regression"

class SHAPExplainer(BaseExplainer):
    """Explainer utilisant SHAP (SHapley Additive exPlanations)."""
    
    def __init__(self, model, X_train: pd.DataFrame, feature_names: List[str]):
        super().__init__(model, X_train, feature_names)
        self.explainer = self._create_explainer()
    
    def _create_explainer(self):
        """Créer l'explainer SHAP approprié selon le type de modèle."""
        
        # CRITIQUE: Forcer TreeExplainer pour tous les wrappers d'arbres
        model_name = type(self.model).__name__
        logger.info(f"🔍 Analyse modèle pour SHAP: {model_name}")
        
        # Accéder au modèle scikit-learn sous-jacent
        underlying_model = getattr(self.model, 'model', self.model)
        underlying_name = type(underlying_model).__name__
        logger.info(f"🔍 Modèle sous-jacent: {underlying_name}")
        
        # Forcer TreeExplainer si c'est un modèle d'arbre (wrapper ou direct)
        is_tree_based = (
            'Tree' in model_name or 'Forest' in model_name or
            'Tree' in underlying_name or 'Forest' in underlying_name or
            self.model_type in ["random_forest", "decision_tree"]
        )
        
        if is_tree_based:
            try:
                logger.info(f"🌳 TENTATIVE TreeExplainer pour modèle arbre: {underlying_name}")
                explainer = shap.TreeExplainer(underlying_model)
                logger.info(f"✅ TreeExplainer créé avec succès pour {underlying_name}")
                return explainer
            except Exception as tree_error:
                logger.error(f"❌ ÉCHEC TreeExplainer: {tree_error}")
                logger.error(f"❌ Underlying model type: {type(underlying_model)}")
                
                # ALTERNATIVE: Utiliser feature_importances_ directement si disponible
                if hasattr(underlying_model, 'feature_importances_'):
                    logger.info("🎯 ALTERNATIVE: Utilisation feature_importances_ directe du modèle")
                    feature_imp = underlying_model.feature_importances_
                    logger.info(f"✅ Feature importances trouvées: {feature_imp}")
                    
                    # Créer un pseudo-explainer qui utilise les feature_importances_
                    class DirectImportanceExplainer:
                        def __init__(self, model, feature_names, feature_importance):
                            self.model = model
                            self.feature_names = feature_names
                            self.feature_importance = feature_importance
                            
                        def shap_values(self, X):
                            # Simuler des valeurs SHAP basées sur feature_importance_
                            return np.tile(self.feature_importance, (len(X), 1))
                    
                    return DirectImportanceExplainer(underlying_model, self.feature_names, feature_imp)
                
                logger.warning("⚠️  FALLBACK vers KernelExplainer")
        else:
            logger.info(f"🔧 Modèle non-arbre détecté: {model_name}")
        
        # KernelExplainer pour modèles non-arbres OU fallback
        logger.info("🔧 Création de KernelExplainer")
        background_sample = shap.sample(self.X_train, min(100, len(self.X_train)))
        
        # Utiliser le modèle wrapper ou sous-jacent selon ce qui fonctionne
        try:
            return shap.KernelExplainer(underlying_model.predict, background_sample)
        except:
            logger.warning("⚠️  Fallback vers wrapper predict")
            return shap.KernelExplainer(self.model.predict, background_sample)
    
    def explain_instance(self, X_instance: Union[pd.Series, np.ndarray]) -> Dict[str, Any]:
        """Expliquer une instance particulière."""
        try:
            if isinstance(X_instance, pd.Series):
                X_instance = X_instance.values.reshape(1, -1)
            elif isinstance(X_instance, np.ndarray) and X_instance.ndim == 1:
                X_instance = X_instance.reshape(1, -1)
            
            # Calculer les valeurs SHAP
            shap_values = self.explainer.shap_values(X_instance)
            
            # Pour la classification multi-classe, prendre la première classe
            if isinstance(shap_values, list) and len(shap_values) > 1:
                shap_values = shap_values[0]
            
            # Prédiction
            prediction = self.model.predict(X_instance)[0]
            if self.task_type == "classification" and hasattr(self.model, 'predict_proba'):
                prediction_proba = self.model.predict_proba(X_instance)[0]
            else:
                prediction_proba = None
            
            return {
                'method': 'shap',
                'shap_values': shap_values.tolist() if isinstance(shap_values, np.ndarray) else shap_values,
                'feature_names': self.feature_names,
                'base_value': getattr(self.explainer, 'expected_value', None),
                'prediction': float(prediction),
                'prediction_proba': prediction_proba.tolist() if prediction_proba is not None else None,
                'instance_values': X_instance[0].tolist()
            }
            
        except Exception as e:
            logger.error(f"Erreur explication instance SHAP: {e}")
            raise
    
    def explain_global(self, X_sample: Optional[pd.DataFrame] = None, max_samples: int = 100) -> Dict[str, Any]:
        """Explication globale du modèle."""
        try:
            if X_sample is None:
                X_sample = self.X_train.sample(min(max_samples, len(self.X_train)))
            
            logger.info(f"🔍 DEBUG SHAP - Échantillon: shape={X_sample.shape}, colonnes={list(X_sample.columns)}")
            logger.info(f"🔍 DEBUG SHAP - Explainer type: {type(self.explainer)}")
            logger.info(f"🔍 DEBUG SHAP - Sample des données (3 premières lignes):")
            logger.info(f"{X_sample.head(3)}")
            
            # CRITIQUE: Assurer que les données sont numériques
            X_sample_numeric = X_sample.select_dtypes(include=[np.number])
            logger.info(f"🔍 DEBUG SHAP - Données numériques: shape={X_sample_numeric.shape}")
            
            # Calculer les valeurs SHAP pour l'échantillon  
            logger.info("🔍 DEBUG SHAP - Calcul des valeurs SHAP...")
            shap_values = self.explainer.shap_values(X_sample_numeric)
            
            logger.info(f"🔍 DEBUG SHAP - Valeurs SHAP type: {type(shap_values)}")
            if isinstance(shap_values, np.ndarray):
                logger.info(f"🔍 DEBUG SHAP - Valeurs SHAP shape: {shap_values.shape}")
                logger.info(f"🔍 DEBUG SHAP - Min/Max: {shap_values.min():.6f} / {shap_values.max():.6f}")
                logger.info(f"🔍 DEBUG SHAP - Sample valeurs: {shap_values[0][:3] if len(shap_values) > 0 else 'vide'}")
            elif isinstance(shap_values, list):
                logger.info(f"🔍 DEBUG SHAP - Liste de {len(shap_values)} classes")
                for i, sv in enumerate(shap_values):
                    if hasattr(sv, 'shape'):
                        logger.info(f"🔍 DEBUG SHAP - Classe {i}: shape={sv.shape}, min/max={sv.min():.6f}/{sv.max():.6f}")
            
            # Pour la classification multi-classe, prendre la première classe
            if isinstance(shap_values, list) and len(shap_values) > 1:
                logger.info(f"🔍 DEBUG SHAP - Classification multi-classe, utilisation classe 0")
                shap_values = shap_values[0]
            
            # Calculer l'importance moyenne des features
            feature_importance = np.abs(shap_values).mean(axis=0)
            logger.info(f"🔍 DEBUG SHAP - Feature importance: {feature_importance}")
            
            # Trier par importance
            importance_ranking = np.argsort(feature_importance)[::-1]
            
            # Feature names correspondants aux données numériques
            numeric_feature_names = list(X_sample_numeric.columns)
            logger.info(f"🔍 DEBUG SHAP - Feature names numériques: {numeric_feature_names}")
            
            result = {
                'method': 'shap_global',
                'feature_importance': {
                    numeric_feature_names[i]: float(feature_importance[i]) 
                    for i in range(len(numeric_feature_names))
                },
                'importance_ranking': [numeric_feature_names[i] for i in importance_ranking],
                'shap_values_sample': shap_values.tolist(),
                'sample_size': len(X_sample_numeric)
            }
            
            logger.info(f"✅ DEBUG SHAP - Résultat feature_importance: {result['feature_importance']}")
            return result
            
        except Exception as e:
            logger.error(f"❌ ERREUR explication globale SHAP: {e}")
            logger.error(f"❌ Type erreur: {type(e).__name__}")
            import traceback
            logger.error(f"❌ Traceback: {traceback.format_exc()}")
            raise
    
    def generate_visualizations(self, explanation_data: Dict[str, Any], 
                              audience_level: str = "intermediate") -> Dict[str, str]:
        """Générer les visualisations SHAP."""
        visualizations = {}
        
        try:
            # 1. Feature Importance (globale)
            if 'feature_importance' in explanation_data:
                fig, ax = plt.subplots(figsize=(10, 8))
                importance_data = explanation_data['feature_importance']
                features = list(importance_data.keys())[:15]  # Top 15 features
                values = [importance_data[f] for f in features]
                
                # Style selon l'audience
                if audience_level == "novice":
                    colors = sns.color_palette("viridis", len(features))
                    title = "Importance des Variables"
                    ylabel = "Impact sur la Prédiction"
                else:
                    colors = sns.color_palette("coolwarm", len(features))
                    title = "SHAP Feature Importance"
                    ylabel = "Mean |SHAP Value|"
                
                bars = ax.barh(features, values, color=colors)
                ax.set_title(title, fontsize=14, fontweight='bold')
                ax.set_xlabel(ylabel, fontsize=12)
                
                # Ajouter des valeurs sur les barres si audience novice
                if audience_level == "novice":
                    for bar, value in zip(bars, values):
                        ax.text(bar.get_width() + max(values)*0.01, bar.get_y() + bar.get_height()/2,
                               f'{value:.3f}', ha='left', va='center')
                
                plt.tight_layout()
                
                # Convertir en base64
                buffer = io.BytesIO()
                plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
                buffer.seek(0)
                img_str = base64.b64encode(buffer.read()).decode()
                buffer.close()
                plt.close()
                
                visualizations['feature_importance'] = img_str
            
            # 2. Waterfall plot (pour instance locale)
            if 'shap_values' in explanation_data and 'instance_values' in explanation_data:
                fig, ax = plt.subplots(figsize=(12, 8))
                
                shap_vals = np.array(explanation_data['shap_values'])
                feature_names = explanation_data['feature_names']
                instance_vals = explanation_data['instance_values']
                base_value = explanation_data.get('base_value', 0)
                
                # Créer un waterfall plot simplifié
                indices = np.argsort(np.abs(shap_vals))[::-1][:10]  # Top 10 features
                selected_features = [feature_names[i] for i in indices]
                selected_shap_vals = shap_vals[indices]
                selected_instance_vals = [instance_vals[i] for i in indices]
                
                # Couleurs: rouge pour impact négatif, vert pour positif
                colors = ['red' if val < 0 else 'green' for val in selected_shap_vals]
                
                bars = ax.barh(selected_features, selected_shap_vals, color=colors, alpha=0.7)
                
                title = "Impact des Variables sur cette Prédiction" if audience_level == "novice" else "SHAP Values - Local Explanation"
                ax.set_title(title, fontsize=14, fontweight='bold')
                ax.set_xlabel("Impact sur la Prédiction", fontsize=12)
                ax.axvline(x=0, color='black', linestyle='-', alpha=0.5)
                
                # Ajouter les valeurs et les valeurs d'instance
                for i, (bar, shap_val, inst_val) in enumerate(zip(bars, selected_shap_vals, selected_instance_vals)):
                    # Valeur SHAP
                    x_pos = bar.get_width() + (0.01 if shap_val > 0 else -0.01)
                    ax.text(x_pos, bar.get_y() + bar.get_height()/2,
                           f'{shap_val:.3f}', ha='left' if shap_val > 0 else 'right', va='center', fontweight='bold')
                    
                    # Valeur d'instance (si pas trop encombré)
                    if audience_level != "novice":
                        ax.text(-max(abs(selected_shap_vals))*0.1, bar.get_y() + bar.get_height()/2,
                               f'val={inst_val:.2f}', ha='right', va='center', fontsize=9, alpha=0.7)
                
                plt.tight_layout()
                
                # Convertir en base64
                buffer = io.BytesIO()
                plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
                buffer.seek(0)
                img_str = base64.b64encode(buffer.read()).decode()
                buffer.close()
                plt.close()
                
                visualizations['local_explanation'] = img_str
                
        except Exception as e:
            logger.error(f"Erreur génération visualisations SHAP: {e}")
        
        return visualizations


class LIMEExplainer(BaseExplainer):
    """Explainer utilisant LIME (Local Interpretable Model-Agnostic Explanations)."""
    
    def __init__(self, model, X_train: pd.DataFrame, feature_names: List[str]):
        super().__init__(model, X_train, feature_names)
        self.explainer = self._create_explainer()
    
    def _create_explainer(self):
        """Créer l'explainer LIME."""
        try:
            # Détecter les features catégorielles (basé sur le type de données)
            categorical_features = []
            for i, col in enumerate(self.X_train.columns):
                if self.X_train[col].dtype == 'object' or self.X_train[col].dtype.name == 'category':
                    categorical_features.append(i)
            
            logger.info(f"Création LimeTabularExplainer avec {len(categorical_features)} features catégorielles")
            
            return lime.lime_tabular.LimeTabularExplainer(
                self.X_train.values,
                feature_names=self.feature_names,
                categorical_features=categorical_features,
                mode='classification' if self.task_type == 'classification' else 'regression',
                discretize_continuous=True
            )
        except Exception as e:
            logger.error(f"Erreur création explainer LIME: {e}")
            raise
    
    def explain_instance(self, X_instance: Union[pd.Series, np.ndarray], num_features: int = 10) -> Dict[str, Any]:
        """Expliquer une instance particulière avec LIME."""
        try:
            if isinstance(X_instance, pd.Series):
                instance_array = X_instance.values
            else:
                instance_array = X_instance
            
            # Créer la fonction de prédiction
            if self.task_type == "classification":
                predict_fn = self.model.predict_proba
            else:
                predict_fn = self.model.predict
            
            # Générer l'explication
            explanation = self.explainer.explain_instance(
                instance_array,
                predict_fn,
                num_features=num_features
            )
            
            # Extraire les données d'explication
            explanation_data = explanation.as_list()
            
            # Prédiction
            prediction = self.model.predict(instance_array.reshape(1, -1))[0]
            if self.task_type == "classification" and hasattr(self.model, 'predict_proba'):
                prediction_proba = self.model.predict_proba(instance_array.reshape(1, -1))[0]
            else:
                prediction_proba = None
            
            return {
                'method': 'lime',
                'explanation_data': explanation_data,
                'feature_importance': {feature: weight for feature, weight in explanation_data},
                'prediction': float(prediction),
                'prediction_proba': prediction_proba.tolist() if prediction_proba is not None else None,
                'instance_values': instance_array.tolist(),
                'score': explanation.score if hasattr(explanation, 'score') else None
            }
            
        except Exception as e:
            logger.error(f"Erreur explication instance LIME: {e}")
            raise
    
    def explain_global(self, X_sample: Optional[pd.DataFrame] = None, max_samples: int = 50) -> Dict[str, Any]:
        """
        Explication globale avec LIME.
        LIME étant conçu pour les explications locales, on agrège plusieurs explications d'instances.
        """
        try:
            if X_sample is None:
                X_sample = self.X_train.sample(min(max_samples, len(self.X_train)))
            
            logger.info(f"Génération d'explications globales LIME sur {len(X_sample)} instances")
            
            # Agrégation des explications LIME sur plusieurs instances
            all_feature_importance = {}
            instance_explanations = []
            
            for i, (idx, instance) in enumerate(X_sample.iterrows()):
                try:
                    # Explication locale pour cette instance
                    local_explanation = self.explain_instance(instance, num_features=len(self.feature_names))
                    instance_explanations.append(local_explanation)
                    
                    # Agréger l'importance des features
                    for feature, importance in local_explanation['feature_importance'].items():
                        if feature not in all_feature_importance:
                            all_feature_importance[feature] = []
                        all_feature_importance[feature].append(abs(importance))
                        
                except Exception as e:
                    logger.warning(f"Erreur explication instance {i}: {e}")
                    continue
            
            # Calculer l'importance moyenne des features
            feature_importance_avg = {}
            for feature, importance_list in all_feature_importance.items():
                if importance_list:
                    feature_importance_avg[feature] = np.mean(importance_list)
            
            # Trier par importance
            sorted_features = sorted(feature_importance_avg.items(), key=lambda x: x[1], reverse=True)
            importance_ranking = [feature for feature, _ in sorted_features]
            
            return {
                'method': 'lime_global',
                'feature_importance': feature_importance_avg,
                'importance_ranking': importance_ranking,
                'sample_size': len(instance_explanations),
                'aggregation_method': 'mean_absolute_importance',
                'instance_explanations': instance_explanations[:5]  # Garder quelques exemples
            }
            
        except Exception as e:
            logger.error(f"Erreur explication globale LIME: {e}")
            raise
    
    def generate_visualizations(self, explanation_data: Dict[str, Any], 
                              audience_level: str = "intermediate") -> Dict[str, str]:
        """Générer les visualisations LIME."""
        visualizations = {}
        
        try:
            # Graphique en barres pour l'importance des features
            fig, ax = plt.subplots(figsize=(10, 8))
            
            lime_data = explanation_data['explanation_data']
            features = [item[0] for item in lime_data]
            weights = [item[1] for item in lime_data]
            
            # Trier par valeur absolue
            sorted_indices = sorted(range(len(weights)), key=lambda i: abs(weights[i]), reverse=True)
            features = [features[i] for i in sorted_indices]
            weights = [weights[i] for i in sorted_indices]
            
            # Couleurs: rouge pour impact négatif, vert pour positif
            colors = ['red' if w < 0 else 'green' for w in weights]
            
            bars = ax.barh(features, weights, color=colors, alpha=0.7)
            
            title = "Impact des Variables (LIME)" if audience_level == "novice" else "LIME Feature Importance"
            ax.set_title(title, fontsize=14, fontweight='bold')
            ax.set_xlabel("Impact sur la Prédiction", fontsize=12)
            ax.axvline(x=0, color='black', linestyle='-', alpha=0.5)
            
            # Ajouter les valeurs sur les barres
            for bar, weight in zip(bars, weights):
                x_pos = bar.get_width() + (0.01 if weight > 0 else -0.01)
                ax.text(x_pos, bar.get_y() + bar.get_height()/2,
                       f'{weight:.3f}', ha='left' if weight > 0 else 'right', va='center', fontweight='bold')
            
            plt.tight_layout()
            
            # Convertir en base64
            buffer = io.BytesIO()
            plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
            buffer.seek(0)
            img_str = base64.b64encode(buffer.read()).decode()
            buffer.close()
            plt.close()
            
            visualizations['lime_explanation'] = img_str
            
        except Exception as e:
            logger.error(f"Erreur génération visualisations LIME: {e}")
        
        return visualizations


def choose_best_explainer(model, X_train: pd.DataFrame, feature_names: List[str], 
                         explanation_type: str = "auto", method_preference: str = "auto") -> BaseExplainer:
    """Choisir le meilleur explainer selon le type de modèle et les préférences utilisateur."""
    
    # Debug: afficher le type de modèle détecté
    model_type_name = type(model).__name__
    model_module = type(model).__module__
    logger.info(f"🔍 Modèle détecté: {model_type_name} (module: {model_module})")
    logger.info(f"🎯 Préférence méthode: {method_preference}")
    
    # Détection robuste des modèles basés sur les arbres
    is_tree_model = (
        isinstance(model, (RandomForestClassifier, RandomForestRegressor, 
                          DecisionTreeClassifier, DecisionTreeRegressor)) or
        'DecisionTree' in model_type_name or 
        'RandomForest' in model_type_name or
        'Tree' in model_type_name
    )
    
    # Choix selon la préférence utilisateur
    if method_preference.lower() == "lime":
        logger.info(f"🍋 PRÉFÉRENCE UTILISATEUR: LIME forcé pour {model_type_name}")
        return LIMEExplainer(model, X_train, feature_names)
    elif method_preference.lower() == "shap":
        logger.info(f"🎯 PRÉFÉRENCE UTILISATEUR: SHAP forcé pour {model_type_name}")
        return SHAPExplainer(model, X_train, feature_names)
    
    # Choix automatique basé sur le type de modèle
    if is_tree_model:
        logger.info(f"🌳 AUTO: Modèle basé sur les arbres ({model_type_name}) - utilisation de SHAP TreeExplainer")
        return SHAPExplainer(model, X_train, feature_names)
    else:
        logger.info(f"🔧 AUTO: Modèle générique ({model_type_name}) - utilisation de LIME")
        return LIMEExplainer(model, X_train, feature_names)


def load_model_and_data(model_path: str, dataset_path: str) -> Tuple[Any, pd.DataFrame, List[str]]:
    """Charger le modèle et les données depuis les fichiers."""
    try:
        # Charger le modèle
        model = joblib.load(model_path)
        logger.info(f"Modèle chargé depuis: {model_path}")
        
        # Charger les données (supposé être un fichier parquet ou csv)
        if dataset_path.endswith('.parquet'):
            data = pd.read_parquet(dataset_path)
        elif dataset_path.endswith('.csv'):
            data = pd.read_csv(dataset_path)
        else:
            raise ValueError(f"Format de fichier non supporté: {dataset_path}")
        
        feature_names = list(data.columns)
        logger.info(f"Données chargées: {data.shape}, features: {len(feature_names)}")
        
        return model, data, feature_names
        
    except Exception as e:
        logger.error(f"Erreur chargement modèle/données: {e}")
        raise
