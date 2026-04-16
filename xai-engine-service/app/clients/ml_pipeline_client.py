"""
Client pour communiquer avec le ML Pipeline Service
Récupère les vraies données ML pour des explications contextualisées
"""

import httpx
import logging
from typing import Dict, Any, Optional, List
from ..core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class MLPipelineClient:
    """Client pour récupérer les données du ML Pipeline Service."""
    
    def __init__(self):
        self.base_url = getattr(settings, 'ml_pipeline_service_url', 'http://ml-pipeline-service:8082')
        self.timeout = httpx.Timeout(30.0)
        self.api_prefix = "/api/v1"
    
    async def get_experiment_results(self, experiment_id: str) -> Dict[str, Any]:
        """
        Récupérer les résultats complets d'une expérience ML.
        
        Returns:
            Dict contenant metrics, visualizations, preprocessing_config, etc.
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                url = f"{self.base_url}{self.api_prefix}/experiments/{experiment_id}/results"
                logger.info(f"📊 Récupération résultats ML: {url}")
                
                response = await client.get(url)
                response.raise_for_status()
                results = response.json()
                
                logger.info(f"✅ Résultats ML récupérés pour {experiment_id}")
                logger.debug(f"📈 Métriques disponibles: {list(results.get('metrics', {}).keys())}")
                logger.debug(f"📊 Visualisations disponibles: {list(results.get('visualizations', {}).keys())}")
                
                return results
                
        except httpx.HTTPError as e:
            logger.error(f"❌ Erreur HTTP récupération résultats ML: {e}")
            if hasattr(e, 'response') and e.response:
                logger.error(f"❌ Status: {e.response.status_code}, Body: {e.response.text}")
            return {}
        except Exception as e:
            logger.error(f"❌ Erreur générale récupération résultats ML: {e}")
            return {}
    
    async def get_experiment_status(self, experiment_id: str) -> Dict[str, Any]:
        """
        Récupérer le statut d'une expérience ML.
        
        Returns:
            Dict contenant status, algorithm, dataset_id, etc.
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                url = f"{self.base_url}{self.api_prefix}/experiments/{experiment_id}"
                logger.info(f"📋 Récupération statut expérience: {url}")
                
                response = await client.get(url)
                response.raise_for_status()
                status = response.json()
                
                logger.info(f"✅ Statut expérience récupéré: {status.get('status', 'unknown')}")
                return status
                
        except Exception as e:
            logger.error(f"❌ Erreur récupération statut expérience: {e}")
            return {}
    
    async def get_confusion_matrix_analysis(self, experiment_id: str) -> Dict[str, Any]:
        """
        Récupérer spécifiquement l'analyse de la matrice de confusion.
        
        Returns:
            Dict contenant matrix, class_names, n_classes, erreurs principales
        """
        results = await self.get_experiment_results(experiment_id)
        
        if not results:
            logger.warning("⚠️ Pas de résultats disponibles pour analyser la matrice de confusion")
            return {}
        
        visualizations = results.get('visualizations', {})
        confusion_viz = visualizations.get('confusion_matrix', {})
        
        if not confusion_viz:
            logger.warning("⚠️ Pas de matrice de confusion disponible")
            return {}
        
        # Extraire les métadonnées de la matrice
        if isinstance(confusion_viz, dict):
            metadata = confusion_viz.get('metadata', {})
            matrix_data = metadata.get('matrix', [])
            class_names = metadata.get('class_names', [])
            n_classes = metadata.get('n_classes', 0)
            
            # Analyser les erreurs principales
            confusion_errors = self._analyze_confusion_errors(matrix_data, class_names)
            
            return {
                'matrix': matrix_data,
                'class_names': class_names,
                'n_classes': n_classes,
                'confusion_errors': confusion_errors,
                'has_confusion_data': True
            }
        
        logger.warning("⚠️ Format de matrice de confusion non reconnu")
        return {'has_confusion_data': False}
    
    async def get_tree_structure_analysis(self, experiment_id: str) -> Dict[str, Any]:
        """
        Récupérer et analyser la structure de l'arbre de décision.
        
        Returns:
            Dict contenant tree_data, depth, n_nodes, feature_names
        """
        results = await self.get_experiment_results(experiment_id)
        
        if not results:
            return {}
        
        visualizations = results.get('visualizations', {})
        tree_viz = visualizations.get('tree_structure', {})
        
        if not tree_viz or not isinstance(tree_viz, dict):
            logger.warning("⚠️ Pas de structure d'arbre disponible")
            return {'has_tree_data': False}
        
        tree_data = tree_viz.get('tree_data', {})
        metadata = tree_viz.get('metadata', {})
        
        return {
            'tree_data': tree_data,
            'metadata': metadata,
            'has_tree_data': bool(tree_data),
            'tree_depth': metadata.get('max_depth', 0),
            'n_nodes': metadata.get('n_nodes', 0),
            'feature_names': metadata.get('feature_names', [])
        }
    
    async def get_feature_importance_analysis(self, experiment_id: str) -> Dict[str, Any]:
        """
        Récupérer l'analyse de l'importance des features.
        
        Returns:
            Dict avec feature_importance, top_features, feature_names
        """
        results = await self.get_experiment_results(experiment_id)
        
        if not results:
            return {}
        
        feature_importance = results.get('feature_importance', {})
        
        if not feature_importance:
            logger.warning("⚠️ Pas d'importance des features disponible")
            return {'has_feature_importance': False}
        
        # Analyser les top features
        top_features = sorted(
            feature_importance.items(), 
            key=lambda x: abs(x[1]), 
            reverse=True
        )[:10]  # Top 10
        
        return {
            'feature_importance': feature_importance,
            'top_features': top_features,
            'has_feature_importance': True,
            'n_features': len(feature_importance)
        }
    
    async def get_complete_context_for_xai(self, experiment_id: str) -> Dict[str, Any]:
        """
        🎯 MÉTHODE PRINCIPALE - Récupérer TOUT le contexte nécessaire pour XAI.
        
        Cette méthode combine toutes les données ML pour créer un contexte complet
        qui sera utilisé par le LLM pour des explications personnalisées.
        
        Returns:
            Dict complet avec toutes les données contextuelles ML
        """
        logger.info(f"🎯 Récupération contexte complet XAI pour expérience: {experiment_id}")
        
        try:
            # Récupération parallèle de toutes les données
            import asyncio
            
            # Lancer toutes les requêtes en parallèle
            results_task = self.get_experiment_results(experiment_id)
            status_task = self.get_experiment_status(experiment_id)
            confusion_task = self.get_confusion_matrix_analysis(experiment_id)
            tree_task = self.get_tree_structure_analysis(experiment_id)
            features_task = self.get_feature_importance_analysis(experiment_id)
            
            # Attendre toutes les réponses
            results, status, confusion, tree, features = await asyncio.gather(
                results_task,
                status_task, 
                confusion_task,
                tree_task,
                features_task,
                return_exceptions=True
            )
            
            # Gérer les exceptions
            results = results if not isinstance(results, Exception) else {}
            status = status if not isinstance(status, Exception) else {}
            confusion = confusion if not isinstance(confusion, Exception) else {}
            tree = tree if not isinstance(tree, Exception) else {}
            features = features if not isinstance(features, Exception) else {}
            
            # Construire le contexte complet avec mappings pour le LLM
            complete_context = {
                # === INFORMATIONS EXPÉRIENCE ===
                'experiment_id': experiment_id,
                'experiment_status': status.get('status', 'unknown'),
                'algorithm': status.get('algorithm', 'unknown'),
                'algorithm_display': status.get('algorithm', 'Modèle ML'),  # 🎯 Pour le LLM
                'created_at': status.get('created_at'),
                
                # === DONNÉES RÉSULTATS ML ===
                'ml_results': results,
                'metrics': results.get('metrics', {}),
                'preprocessing_config': results.get('preprocessing_config', {}),
                
                # 🎯 DONNÉES POUR LE LLM (extraction depuis les résultats)
                'dataset_name': status.get('dataset_name') or results.get('dataset_name') or f"Dataset-{experiment_id[:8]}",
                'dataset_size': results.get('dataset_size', 1000),
                'task_type': results.get('task_type', 'classification'),
                
                # === ANALYSE MATRICE DE CONFUSION ===
                'confusion_analysis': confusion,
                'has_confusion_matrix': confusion.get('has_confusion_data', False),
                'class_names': confusion.get('class_names', []),
                'n_classes': confusion.get('n_classes', 0),
                'main_confusion_errors': confusion.get('confusion_errors', []),
                'confusion_errors': confusion.get('confusion_errors', []),  # 🎯 Alias pour le LLM
                
                # === ANALYSE ARBRE DE DÉCISION ===
                'tree_analysis': tree,
                'has_tree_structure': tree.get('has_tree_data', False),
                'tree_depth': tree.get('tree_depth', 0),
                'tree_nodes': tree.get('n_nodes', 0),
                
                # === ANALYSE FEATURES ===
                'feature_analysis': features,
                'has_feature_importance': features.get('has_feature_importance', False),
                'feature_importance': features.get('feature_importance', {}),
                'top_features': features.get('top_features', []),
                'n_features': features.get('n_features', 0),
                
                # === MÉTADONNÉES CONTEXTUELLES ===
                'context_quality': self._assess_context_quality(results, confusion, tree, features),
                'timestamp': self._get_current_timestamp()
            }
            
            logger.info(f"✅ Contexte XAI complet généré - Qualité: {complete_context['context_quality']}")
            logger.debug(f"📊 Contexte contient {len(complete_context)} champs principaux")
            
            return complete_context
            
        except Exception as e:
            logger.error(f"❌ Erreur construction contexte XAI complet: {e}")
            import traceback
            traceback.print_exc()
            
            # Retourner contexte minimal en cas d'erreur
            return {
                'experiment_id': experiment_id,
                'error': str(e),
                'context_quality': 'error',
                'timestamp': self._get_current_timestamp()
            }
    
    def _analyze_confusion_errors(self, matrix: List[List[int]], class_names: List[str]) -> List[Dict[str, Any]]:
        """Analyser les erreurs principales dans la matrice de confusion."""
        errors = []
        
        if not matrix or not class_names:
            return errors
        
        try:
            for i, row in enumerate(matrix):
                if not isinstance(row, list):
                    continue
                    
                for j, count in enumerate(row):
                    # Erreur si pas sur la diagonale et count > 0
                    if i != j and count > 0:
                        true_class = class_names[i] if i < len(class_names) else f"Classe {i+1}"
                        predicted_class = class_names[j] if j < len(class_names) else f"Classe {j+1}"
                        
                        errors.append({
                            'true_class': true_class,
                            'predicted_class': predicted_class,
                            'count': count,
                            'error_type': 'misclassification'
                        })
            
            # Trier par nombre d'erreurs décroissant
            errors.sort(key=lambda x: x['count'], reverse=True)
            
        except Exception as e:
            logger.error(f"❌ Erreur analyse matrice confusion: {e}")
        
        return errors[:5]  # Top 5 erreurs
    
    def _assess_context_quality(self, results: Dict, confusion: Dict, tree: Dict, features: Dict) -> str:
        """Évaluer la qualité du contexte récupéré."""
        quality_score = 0
        max_score = 4
        
        # Résultats ML disponibles
        if results and results.get('metrics'):
            quality_score += 1
        
        # Matrice de confusion disponible
        if confusion.get('has_confusion_data'):
            quality_score += 1
            
        # Structure d'arbre disponible  
        if tree.get('has_tree_data'):
            quality_score += 1
            
        # Importance des features disponible
        if features.get('has_feature_importance'):
            quality_score += 1
        
        if quality_score == max_score:
            return 'excellent'
        elif quality_score >= 3:
            return 'good'
        elif quality_score >= 2:
            return 'fair'
        elif quality_score >= 1:
            return 'poor'
        else:
            return 'no_data'
    
    def _get_current_timestamp(self) -> str:
        """Récupérer timestamp actuel."""
        from datetime import datetime
        return datetime.utcnow().isoformat()


# Instance globale
ml_pipeline_client = MLPipelineClient()


def get_ml_pipeline_client() -> MLPipelineClient:
    """Récupérer l'instance du client ML Pipeline."""
    return ml_pipeline_client
