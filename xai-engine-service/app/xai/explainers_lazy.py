"""
Module XAI avec lazy loading pour réduire la consommation mémoire.
Les librairies lourdes ne sont importées qu'au moment de leur utilisation.
"""
import logging
from typing import Dict, Any, List, Optional, Tuple, Union
import io
import base64

logger = logging.getLogger(__name__)

# Lazy loading des librairies lourdes
_shap = None
_lime = None
_lime_tabular = None
_np = None
_pd = None
_plt = None
_sns = None
_joblib = None
_sklearn_loaded = False
_sklearn_modules = {}

def _lazy_import_shap():
    global _shap
    if _shap is None:
        logger.info("Chargement de SHAP...")
        import shap
        _shap = shap
    return _shap

def _lazy_import_lime():
    global _lime, _lime_tabular
    if _lime is None:
        logger.info("Chargement de LIME...")
        import lime
        import lime.lime_tabular
        _lime = lime
        _lime_tabular = lime.lime_tabular
    return _lime, _lime_tabular

def _lazy_import_numpy():
    global _np
    if _np is None:
        logger.info("Chargement de NumPy...")
        import numpy
        _np = numpy
    return _np

def _lazy_import_pandas():
    global _pd
    if _pd is None:
        logger.info("Chargement de Pandas...")
        import pandas
        _pd = pandas
    return _pd

def _lazy_import_matplotlib():
    global _plt
    if _plt is None:
        logger.info("Chargement de Matplotlib...")
        import matplotlib
        matplotlib.use('Agg')  # Backend non-interactif
        import matplotlib.pyplot as plt
        _plt = plt
    return _plt

def _lazy_import_seaborn():
    global _sns
    if _sns is None:
        logger.info("Chargement de Seaborn...")
        import seaborn
        _sns = seaborn
    return _sns

def _lazy_import_joblib():
    global _joblib
    if _joblib is None:
        logger.info("Chargement de Joblib...")
        import joblib
        _joblib = joblib
    return _joblib

def _lazy_import_sklearn():
    global _sklearn_loaded, _sklearn_modules
    if not _sklearn_loaded:
        logger.info("Chargement de scikit-learn...")
        from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
        from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
        from sklearn.preprocessing import LabelEncoder
        
        _sklearn_modules = {
            'RandomForestClassifier': RandomForestClassifier,
            'RandomForestRegressor': RandomForestRegressor,
            'DecisionTreeClassifier': DecisionTreeClassifier,
            'DecisionTreeRegressor': DecisionTreeRegressor,
            'LabelEncoder': LabelEncoder
        }
        _sklearn_loaded = True
    return _sklearn_modules

class BaseExplainer:
    """Classe de base pour tous les explainers XAI avec lazy loading."""
    
    def __init__(self, model, X_train, feature_names: List[str]):
        self.model = model
        self.X_train = X_train
        self.feature_names = feature_names
        self.model_type = self._detect_model_type()
        self.task_type = self._detect_task_type()
        
    def _detect_model_type(self) -> str:
        """Détecter le type de modèle."""
        sklearn = _lazy_import_sklearn()
        
        if isinstance(self.model, (sklearn['RandomForestClassifier'], sklearn['RandomForestRegressor'])):
            return "random_forest"
        elif isinstance(self.model, (sklearn['DecisionTreeClassifier'], sklearn['DecisionTreeRegressor'])):
            return "decision_tree"
        else:
            return "unknown"
    
    def _detect_task_type(self) -> str:
        """Détecter si c'est classification ou régression."""
        sklearn = _lazy_import_sklearn()
        
        if isinstance(self.model, (sklearn['RandomForestClassifier'], sklearn['DecisionTreeClassifier'])):
            return "classification"
        elif isinstance(self.model, (sklearn['RandomForestRegressor'], sklearn['DecisionTreeRegressor'])):
            return "regression"
        else:
            # Essayer de détecter via la méthode predict_proba
            if hasattr(self.model, 'predict_proba'):
                return "classification"
            else:
                return "regression"

class SHAPExplainer(BaseExplainer):
    """Explainer utilisant SHAP avec lazy loading."""
    
    def __init__(self, model, X_train, feature_names: List[str]):
        super().__init__(model, X_train, feature_names)
        self.explainer = None
        
    def _initialize_explainer(self):
        """Initialiser l'explainer SHAP (lazy)."""
        if self.explainer is None:
            shap = _lazy_import_shap()
            np = _lazy_import_numpy()
            
            logger.info(f"Initialisation de SHAP Explainer pour {self.model_type}")
            
            if self.model_type in ["random_forest", "decision_tree"]:
                self.explainer = shap.TreeExplainer(self.model)
            else:
                # Fallback to KernelExplainer for unknown models
                self.explainer = shap.KernelExplainer(
                    self.model.predict,
                    shap.sample(self.X_train, 100)
                )
    
    def explain_global(self) -> Dict[str, Any]:
        """Générer des explications globales."""
        self._initialize_explainer()
        shap = _lazy_import_shap()
        np = _lazy_import_numpy()
        pd = _lazy_import_pandas()
        plt = _lazy_import_matplotlib()
        
        logger.info("Génération des explications globales SHAP")
        
        # Calculer les valeurs SHAP
        shap_values = self.explainer.shap_values(self.X_train)
        
        # Pour classification multi-classe, prendre la moyenne
        if isinstance(shap_values, list):
            shap_values = np.array(shap_values).mean(axis=0)
        
        # Feature importance moyenne
        feature_importance = np.abs(shap_values).mean(axis=0)
        
        # Créer le summary plot
        plt.figure(figsize=(10, 8))
        shap.summary_plot(
            shap_values, 
            self.X_train, 
            feature_names=self.feature_names,
            show=False
        )
        
        # Convertir en base64
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', bbox_inches='tight', dpi=150)
        buffer.seek(0)
        summary_plot_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        plt.close()
        
        return {
            "method": "shap",
            "type": "global",
            "feature_importance": {
                name: float(importance) 
                for name, importance in zip(self.feature_names, feature_importance)
            },
            "visualizations": {
                "summary_plot": f"data:image/png;base64,{summary_plot_base64}"
            },
            "metrics": {
                "num_samples": len(self.X_train),
                "num_features": len(self.feature_names)
            }
        }
    
    def explain_local(self, instance, instance_index: Optional[int] = None) -> Dict[str, Any]:
        """Générer des explications locales pour une instance."""
        self._initialize_explainer()
        shap = _lazy_import_shap()
        np = _lazy_import_numpy()
        pd = _lazy_import_pandas()
        plt = _lazy_import_matplotlib()
        
        logger.info(f"Génération des explications locales SHAP pour l'instance {instance_index}")
        
        # S'assurer que l'instance est un DataFrame
        if not isinstance(instance, pd.DataFrame):
            instance = pd.DataFrame([instance], columns=self.feature_names)
        
        # Calculer les valeurs SHAP pour cette instance
        shap_values = self.explainer.shap_values(instance)
        
        # Pour classification multi-classe, prendre la classe prédite
        if isinstance(shap_values, list):
            prediction = self.model.predict(instance)[0]
            if self.task_type == "classification":
                shap_values = shap_values[int(prediction)]
            else:
                shap_values = np.array(shap_values).mean(axis=0)
        
        # S'assurer que c'est un array 1D
        if len(shap_values.shape) > 1:
            shap_values = shap_values[0]
        
        # Créer le waterfall plot
        plt.figure(figsize=(10, 6))
        shap.waterfall_plot(
            shap.Explanation(
                values=shap_values,
                base_values=self.explainer.expected_value if not isinstance(self.explainer.expected_value, list) 
                            else self.explainer.expected_value[0],
                data=instance.values[0],
                feature_names=self.feature_names
            ),
            show=False
        )
        
        # Convertir en base64
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', bbox_inches='tight', dpi=150)
        buffer.seek(0)
        waterfall_plot_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        plt.close()
        
        # Préparer les contributions des features
        feature_contributions = {
            name: float(value) 
            for name, value in zip(self.feature_names, shap_values)
        }
        
        return {
            "method": "shap",
            "type": "local",
            "instance_index": instance_index,
            "feature_contributions": feature_contributions,
            "base_value": float(self.explainer.expected_value) if not isinstance(self.explainer.expected_value, list)
                         else float(self.explainer.expected_value[0]),
            "prediction": float(self.model.predict(instance)[0]),
            "visualizations": {
                "waterfall_plot": f"data:image/png;base64,{waterfall_plot_base64}"
            }
        }

class LIMEExplainer(BaseExplainer):
    """Explainer utilisant LIME avec lazy loading."""
    
    def __init__(self, model, X_train, feature_names: List[str]):
        super().__init__(model, X_train, feature_names)
        self.explainer = None
        
    def _initialize_explainer(self):
        """Initialiser l'explainer LIME (lazy)."""
        if self.explainer is None:
            lime, lime_tabular = _lazy_import_lime()
            np = _lazy_import_numpy()
            
            logger.info("Initialisation de LIME Explainer")
            
            mode = "classification" if self.task_type == "classification" else "regression"
            
            self.explainer = lime_tabular.LimeTabularExplainer(
                np.array(self.X_train),
                feature_names=self.feature_names,
                mode=mode,
                random_state=42
            )
    
    def explain_local(self, instance, instance_index: Optional[int] = None) -> Dict[str, Any]:
        """Générer des explications locales avec LIME."""
        self._initialize_explainer()
        np = _lazy_import_numpy()
        pd = _lazy_import_pandas()
        plt = _lazy_import_matplotlib()
        
        logger.info(f"Génération des explications LIME pour l'instance {instance_index}")
        
        # S'assurer que l'instance est un array numpy
        if isinstance(instance, pd.DataFrame):
            instance_array = instance.values[0]
        else:
            instance_array = np.array(instance)
        
        # Générer l'explication
        if self.task_type == "classification":
            exp = self.explainer.explain_instance(
                instance_array,
                self.model.predict_proba,
                num_features=len(self.feature_names)
            )
        else:
            exp = self.explainer.explain_instance(
                instance_array,
                self.model.predict,
                num_features=len(self.feature_names)
            )
        
        # Obtenir les contributions
        contributions = exp.as_list()
        feature_contributions = {}
        
        for feature_desc, contribution in contributions:
            # Extraire le nom de la feature de la description
            for fname in self.feature_names:
                if fname in feature_desc:
                    feature_contributions[fname] = float(contribution)
                    break
        
        # Créer la visualisation
        fig = exp.as_pyplot_figure()
        
        # Convertir en base64
        buffer = io.BytesIO()
        fig.savefig(buffer, format='png', bbox_inches='tight', dpi=150)
        buffer.seek(0)
        plot_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        plt.close()
        
        return {
            "method": "lime",
            "type": "local",
            "instance_index": instance_index,
            "feature_contributions": feature_contributions,
            "prediction": float(self.model.predict([instance_array])[0]),
            "visualizations": {
                "explanation_plot": f"data:image/png;base64,{plot_base64}"
            },
            "metrics": {
                "local_fidelity": exp.score
            }
        }

def choose_best_explainer(
    model,
    X_train,
    feature_names: List[str],
    explanation_type: str,
    method_requested: Optional[str] = None
) -> BaseExplainer:
    """Choisir le meilleur explainer basé sur le modèle et les préférences."""
    logger.info(f"Sélection de l'explainer - Type: {explanation_type}, Méthode demandée: {method_requested}")
    
    # Si une méthode spécifique est demandée
    if method_requested:
        if method_requested.lower() == "shap":
            return SHAPExplainer(model, X_train, feature_names)
        elif method_requested.lower() == "lime":
            return LIMEExplainer(model, X_train, feature_names)
    
    # Choix automatique basé sur le type d'explication
    if explanation_type == "global":
        # SHAP est meilleur pour les explications globales
        return SHAPExplainer(model, X_train, feature_names)
    else:
        # Pour local, utiliser SHAP pour tree-based models, LIME pour les autres
        model_type = BaseExplainer(model, X_train, feature_names).model_type
        if model_type in ["random_forest", "decision_tree"]:
            return SHAPExplainer(model, X_train, feature_names)
        else:
            return LIMEExplainer(model, X_train, feature_names)

def load_model_and_data(
    model_path: str,
    dataset_path: str,
    storage_client
) -> Tuple[Any, Any, List[str]]:
    """Charger le modèle et les données depuis le stockage avec lazy loading."""
    joblib = _lazy_import_joblib()
    pd = _lazy_import_pandas()
    
    logger.info(f"Chargement du modèle depuis {model_path}")
    
    # Télécharger et charger le modèle
    model_data = storage_client.download_file_to_memory(model_path)
    model = joblib.load(io.BytesIO(model_data))
    
    logger.info(f"Chargement des données depuis {dataset_path}")
    
    # Télécharger et charger les données
    data_bytes = storage_client.download_file_to_memory(dataset_path)
    
    # Déterminer le format et charger
    if dataset_path.endswith('.parquet'):
        df = pd.read_parquet(io.BytesIO(data_bytes))
    elif dataset_path.endswith('.csv'):
        df = pd.read_csv(io.BytesIO(data_bytes))
    else:
        raise ValueError(f"Format de fichier non supporté: {dataset_path}")
    
    # 🚨 CORRECTION SYSTÉMATIQUE: Extraire SEULEMENT les features prédictives (exclure target ET identifiants)
    target_columns = ['target', 'Target', 'y', 'label', 'Label', 'class', 'Class', 'Species', 'species'] 
    id_columns = ['Id', 'ID', 'id', 'index', 'Index', 'idx', 'row_id', 'item_id', 'record_id']
    columns_to_exclude = target_columns + id_columns
    
    feature_columns = []
    excluded_found = []
    
    for col in df.columns:
        if col in columns_to_exclude:
            excluded_found.append(col)
            continue
        feature_columns.append(col)
    
    logger.warning(f"🚨 EXCLUSIONS XAI LAZY LOADING: {excluded_found}")
    logger.info(f"✅ Features prédictives retenues: {feature_columns}")
    
    if not feature_columns:
        raise ValueError("Aucune feature prédictive trouvée après exclusion systématique")
    
    X = df[feature_columns]
    feature_names = feature_columns
    
    logger.info(f"🎯 Données finales chargées: {len(X)} lignes, {len(feature_columns)} features prédictives")
    
    return model, X, feature_names
