from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
import numpy as np
from typing import Dict, Any, Optional, Union, List

class BaseModelWrapper:
    """Base class for sklearn model wrappers"""
    
    def __init__(self, **kwargs):
        self.model = None
        self.hyperparameters = kwargs
        self.is_fitted = False
        
    def fit(self, X, y):
        """Train the model"""
        self.model.fit(X, y)
        self.is_fitted = True
        return self
        
    def predict(self, X):
        """Make predictions"""
        if not self.is_fitted:
            raise ValueError("Model must be fitted before making predictions")
        return self.model.predict(X)
        
    def predict_proba(self, X):
        """Get prediction probabilities (for classifiers)"""
        if not self.is_fitted:
            raise ValueError("Model must be fitted before making predictions")
        if hasattr(self.model, 'predict_proba'):
            return self.model.predict_proba(X)
        raise NotImplementedError("This model doesn't support probability predictions")
        
    def get_feature_importance(self, feature_names: Optional[List[str]] = None) -> Optional[Dict[str, Any]]:
        """Get feature importance scores avec vrais noms de features si fournis"""
        if not self.is_fitted:
            return None
        if hasattr(self.model, 'feature_importances_'):
            importances = self.model.feature_importances_
            indices = np.argsort(importances)[::-1]
            
            # ✅ UTILISER LES VRAIS NOMS DE FEATURES si disponibles
            if feature_names is not None and len(feature_names) >= len(indices):
                actual_feature_names = [feature_names[i] for i in indices]
            else:
                actual_feature_names = [f'feature_{i}' for i in indices]
            
            return {
                'features': actual_feature_names,
                'importance': importances[indices].tolist()
            }
        return None
    
    def get_tree_structure(self) -> Optional[Dict[str, Any]]:
        """Get tree structure for visualization (for decision trees only)"""
        if not self.is_fitted:
            return None
        
        # Cette méthode peut être implémentée pour extraire la structure d'arbre
        # Pour l'instant, placeholder pour évaluation de faisabilité
        return None

class DecisionTreeWrapper(BaseModelWrapper):
    """Wrapper for Decision Tree models"""
    
    def __init__(self, task_type: str = 'classification', **kwargs):
        super().__init__(**kwargs)
        
        # Filter valid parameters
        valid_params = {}
        for param in ['criterion', 'max_depth', 'min_samples_split', 
                     'min_samples_leaf', 'max_features', 'random_state']:
            if param in kwargs:
                valid_params[param] = kwargs[param]
        
        # Set defaults
        if 'random_state' not in valid_params:
            valid_params['random_state'] = 42
            
        if task_type == 'classification':
            self.model = DecisionTreeClassifier(**valid_params)
        else:
            # For regression, criterion must be appropriate
            if 'criterion' in valid_params and valid_params['criterion'] in ['gini', 'entropy']:
                valid_params['criterion'] = 'squared_error'
            self.model = DecisionTreeRegressor(**valid_params)
            
        self.task_type = task_type
    
    def get_tree_structure(self, feature_names: Optional[List[str]] = None, class_names: Optional[List[str]] = None) -> Optional[Dict[str, Any]]:
        """Extrait la structure d'arbre pour visualisation avec vrais noms de features et classes"""
        if not self.is_fitted or not hasattr(self.model, 'tree_'):
            return None
            
        tree = self.model.tree_
        # ✅ UTILISER LES VRAIS NOMS DE FEATURES si fournis
        if feature_names is not None and len(feature_names) >= tree.n_features:
            actual_feature_names = feature_names[:tree.n_features]
        else:
            actual_feature_names = [f'feature_{i}' for i in range(tree.n_features)]
        
        # ✅ UTILISER LES VRAIS NOMS DE CLASSES si fournis
        actual_class_names = class_names or [f'Classe_{i}' for i in range(tree.n_classes[0] if hasattr(tree, 'n_classes') else 2)]
        
        print(f"🔍 TREE EXTRACTION - Using feature names: {actual_feature_names}")
        print(f"🔍 TREE EXTRACTION - Using class names: {actual_class_names}")
        
        def build_tree_node(node_id: int) -> Dict[str, Any]:
            """Construit récursivement un nœud d'arbre pour ECharts"""
            
            # Informations du nœud
            is_leaf = tree.children_left[node_id] == tree.children_right[node_id]
            samples = tree.n_node_samples[node_id]
            
            if is_leaf:
                # Nœud feuille
                value = tree.value[node_id][0]
                if self.task_type == 'classification':
                    predicted_class = np.argmax(value)
                    # ✅ UTILISER LE VRAI NOM DE CLASSE au lieu de "Classe 0"
                    class_name = actual_class_names[predicted_class] if predicted_class < len(actual_class_names) else f"Classe_{predicted_class}"
                    name = class_name
                    condition = f"n={samples}"
                else:
                    predicted_value = value[0]
                    name = f"Valeur: {predicted_value:.3f}"
                    condition = f"n={samples}"
                    
                return {
                    "name": name,
                    "condition": condition,
                    "samples": samples,
                    "is_leaf": True,
                    "value": predicted_value if self.task_type == 'regression' else predicted_class,
                    "class_name": class_name if self.task_type == 'classification' else None
                }
            else:
                # Nœud interne
                feature_idx = tree.feature[node_id]
                threshold = tree.threshold[node_id]
                feature_name = actual_feature_names[feature_idx] if feature_idx < len(actual_feature_names) else f'feature_{feature_idx}'
                
                name = f"{feature_name}"
                condition = f"≤ {threshold:.3f}"
                
                # Construire les enfants récursivement
                left_child = build_tree_node(tree.children_left[node_id])
                right_child = build_tree_node(tree.children_right[node_id])
                
                return {
                    "name": feature_name,  # ✅ Afficher le vrai nom de feature
                    "condition": f"≤ {threshold:.3f}",  # ✅ Format cohérent
                    "samples": samples,
                    "is_leaf": False,
                    "feature": feature_name,  # ✅ Nom complet pour tooltips
                    "threshold": threshold,
                    "children": [left_child, right_child]
                }
        
        # Construire l'arbre complet depuis la racine
        root_node = build_tree_node(0)
        
        return {
            "tree_data": root_node,
            "metadata": {
                "max_depth": tree.max_depth,
                "n_nodes": tree.node_count,
                "n_features": tree.n_features,
                "n_classes": tree.n_classes[0] if hasattr(tree, 'n_classes') else 1
            }
        }

class RandomForestWrapper(BaseModelWrapper):
    """Wrapper for Random Forest models"""
    
    def __init__(self, task_type: str = 'classification', **kwargs):
        super().__init__(**kwargs)
        
        # Filter valid parameters
        valid_params = {}
        for param in ['n_estimators', 'max_depth', 'min_samples_split', 
                     'min_samples_leaf', 'max_features', 'bootstrap', 
                     'random_state', 'n_jobs']:
            if param in kwargs:
                valid_params[param] = kwargs[param]
        
        # Set defaults
        if 'random_state' not in valid_params:
            valid_params['random_state'] = 42
        if 'n_jobs' not in valid_params:
            valid_params['n_jobs'] = -1  # Use all available cores
            
        # 🆕 NOUVEAU : Activer OOB Score pour Random Forest Classification
        if task_type == 'classification' and 'oob_score' not in valid_params:
            valid_params['oob_score'] = True  # Validation interne automatique
            print(f"✅ Random Forest - OOB Score activé par défaut")
            
        if task_type == 'classification':
            self.model = RandomForestClassifier(**valid_params)
        else:
            self.model = RandomForestRegressor(**valid_params)
            
        self.task_type = task_type
    
    def get_tree_structure(self, feature_names: Optional[List[str]] = None, class_names: Optional[List[str]] = None) -> Optional[Dict[str, Any]]:
        """Extrait la structure du premier arbre de la forêt avec vrais noms de features et classes"""
        if not self.is_fitted or not hasattr(self.model, 'estimators_'):
            return None
            
        # Utiliser le premier estimateur de la forêt comme représentatif
        first_tree = self.model.estimators_[0]
        tree = first_tree.tree_
        
        # ✅ UTILISER LES VRAIS NOMS DE FEATURES si fournis
        if feature_names is not None and len(feature_names) >= tree.n_features:
            actual_feature_names = feature_names[:tree.n_features]
        else:
            actual_feature_names = [f'feature_{i}' for i in range(tree.n_features)]
        
        # ✅ UTILISER LES VRAIS NOMS DE CLASSES si fournis
        actual_class_names = class_names or [f'C{i}' for i in range(tree.n_classes[0] if hasattr(tree, 'n_classes') else 2)]
        
        print(f"🔍 RANDOM FOREST EXTRACTION - Using feature names: {actual_feature_names}")
        print(f"🔍 RANDOM FOREST EXTRACTION - Using class names: {actual_class_names}")
        
        def build_forest_node(node_id: int, depth: int = 0) -> Dict[str, Any]:
            """Construit un nœud simplifié pour Random Forest (moins détaillé)"""
            
            # Limiter la profondeur pour éviter des arbres trop complexes
            if depth > 4:
                return {
                    "name": "...",
                    "condition": "Profondeur max atteinte",
                    "is_leaf": True
                }
            
            is_leaf = tree.children_left[node_id] == tree.children_right[node_id]
            samples = tree.n_node_samples[node_id]
            
            if is_leaf:
                value = tree.value[node_id][0]
                if self.task_type == 'classification':
                    predicted_class = np.argmax(value)
                    # ✅ UTILISER LE VRAI NOM DE CLASSE
                    class_name = actual_class_names[predicted_class] if predicted_class < len(actual_class_names) else f"C{predicted_class}"
                    name = class_name
                else:
                    predicted_value = value[0]
                    name = f"{predicted_value:.2f}"
                    
                return {
                    "name": name,
                    "condition": f"n={samples}",
                    "samples": samples,
                    "is_leaf": True,
                    "depth": depth,
                    "class_name": class_name if self.task_type == 'classification' else None,
                    "value": predicted_value if self.task_type == 'regression' else predicted_class
                }
            else:
                feature_idx = tree.feature[node_id]
                threshold = tree.threshold[node_id]
                # ✅ NOUVELLE LOGIQUE : Raccourcissement intelligent des noms de features
                original_feature_name = actual_feature_names[feature_idx] if feature_idx < len(actual_feature_names) else f'feature_{feature_idx}'
                
                # Stratégie de raccourcissement intelligent
                if len(original_feature_name) <= 15:
                    feature_name = original_feature_name  # Garder nom complet si raisonnable
                else:
                    # Raccourcir intelligemment : garder début et fin si possible
                    if "_" in original_feature_name:
                        parts = original_feature_name.split("_")
                        if len(parts) >= 2:
                            # Ex: "num__Very_Long_Feature_Name" → "num_VeryLong"
                            feature_name = f"{parts[0]}_{parts[-1][:8]}"
                        else:
                            feature_name = original_feature_name[:12] + "..."
                    else:
                        # Pas d'underscore, prendre les premiers caractères
                        feature_name = original_feature_name[:12] + "..."
                
                # Construire les enfants (limités en profondeur)
                children = []
                if depth < 4:
                    left_child = build_forest_node(tree.children_left[node_id], depth + 1)
                    right_child = build_forest_node(tree.children_right[node_id], depth + 1)
                    children = [left_child, right_child]
                
                return {
                    "name": feature_name,
                    "condition": f"≤ {threshold:.2f}",
                    "samples": samples,
                    "is_leaf": False,
                    "feature": original_feature_name,  # ✅ Stocker le nom complet pour tooltips
                    "threshold": threshold,
                    "depth": depth,
                    "children": children
                }
        
        # Construire l'arbre simplifié
        root_node = build_forest_node(0)
        
        return {
            "tree_data": root_node,
            "metadata": {
                "tree_index": 0,  # Premier arbre de la forêt
                "n_estimators": len(self.model.estimators_),
                "max_depth": tree.max_depth,
                "n_features": tree.n_features,
                "note": "Premier arbre de la Random Forest (représentatif)"
            }
        } 