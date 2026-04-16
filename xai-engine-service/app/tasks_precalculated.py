"""
Tâches Celery optimisées pour utiliser le contexte ML avec SHAP pré-calculé
PAS de recalcul, PAS de nouvelles visualisations - juste passer le contexte au chat
"""

import time
import logging
from datetime import datetime
from typing import Dict, Any

from celery import Task
from app.core.celery_app import celery_app
from app.models import ExplanationRequest
from app.schemas import RequestStatus
from app.database import get_sync_session

logger = logging.getLogger(__name__)

def get_algorithm_display_name(algorithm: str) -> str:
    """Mapper les noms d'algorithmes vers leurs noms d'affichage (identique au frontend)."""
    names = {
        'decision_tree': 'Decision Tree',
        'random_forest': 'Random Forest',
        'gradient_boosting': 'Gradient Boosting',
        'svm': 'Support Vector Machine',
        'logistic_regression': 'Logistic Regression',
        'neural_network': 'Neural Network'
    }
    return names.get(algorithm, algorithm)


class XAITaskPrecalculated(Task):
    """Tâche de base pour XAI avec contexte pré-calculé."""
    
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Gérer les échecs de tâche."""
        logger.error(f"Tâche XAI échouée: {exc}")
        request_id = args[0] if args else None
        if request_id:
            session = get_sync_session()
            try:
                request = session.query(ExplanationRequest).filter(
                    ExplanationRequest.id == request_id
                ).first()
                if request:
                    request.status = RequestStatus.FAILED
                    request.error_message = str(exc)
                    request.updated_at = datetime.utcnow()
                    session.commit()
            finally:
                session.close()


@celery_app.task(base=XAITaskPrecalculated, bind=True, 
                 name="app.tasks.generate_explanation_with_precalculated_shap")
def generate_explanation_with_precalculated_shap(self, request_id: str):
    """
    NE FAIT PAS de calcul SHAP, NE CRÉE PAS de visualisations.
    Stocke juste le contexte ML pour que le chat puisse l'utiliser.
    """
    logger.info(f"✅ Stockage du contexte ML avec SHAP pré-calculé pour request {request_id}")
    logger.info(f"📌 PAS de recalcul, PAS de nouvelles visualisations - juste le contexte pour le chat")
    
    session = get_sync_session()
    start_time = time.time()
    
    try:
        # 1. Récupérer la demande d'explication
        request = session.query(ExplanationRequest).filter(
            ExplanationRequest.id == request_id
        ).first()
        
        if not request:
            raise ValueError(f"Demande d'explication {request_id} introuvable")
        
        # Mettre à jour le statut
        request.status = RequestStatus.RUNNING
        request.progress = 50
        request.task_id = self.request.id
        request.updated_at = datetime.utcnow()
        session.commit()
        
        # 2. Extraire le contexte ML (qui contient déjà tout)
        user_preferences = request.user_preferences or {}
        ml_context = user_preferences.get('ml_context', {})
        
        if not ml_context:
            logger.warning("⚠️ Contexte ML vide, utilisation de valeurs par défaut")
            ml_context = {
                'dataset_name': 'Dataset non spécifié',
                'algorithm': 'Algorithme non spécifié',
                'task_type': 'classification',
                'feature_importance': {},
                'metrics': {}
            }
        
        # Log du contexte disponible
        logger.info(f"📊 Contexte ML disponible :")
        logger.info(f"  - Dataset: {ml_context.get('dataset_name', 'N/A')}")
        logger.info(f"  - Algorithme: {ml_context.get('algorithm', 'N/A')}")
        logger.info(f"  - Type de tâche: {ml_context.get('task_type', 'N/A')}")
        logger.info(f"  - Features SHAP: {len(ml_context.get('feature_importance', {}))}")
        logger.info(f"  - Métriques: {list(ml_context.get('metrics', {}).keys())}")
        
        request.progress = 80
        session.commit()
        
        # 3. Stocker le contexte directement dans la demande (PAS de nouvelles visualisations)
        # Les visualisations SHAP sont DÉJÀ dans les résultats ML
        request.shap_values = ml_context.get('feature_importance', {})  # Stocker les valeurs SHAP existantes
        request.visualizations = {}  # PAS de nouvelles visualisations, elles sont déjà dans ML Pipeline
        request.method_used = 'precalculated_context'
        request.processing_time_seconds = 0.1  # Quasi instantané
        
        # 🎯 UTILISER DIRECTEMENT LE CONTEXTE fetchMLContextDirectly() DÉJÀ FOURNI !  
        try:
            from .xai.llm_service import get_llm_service
            
            llm_service = get_llm_service()
            
            # 🚀 Le frontend a DÉJÀ appelé fetchMLContextDirectly() et l'a envoyé !
            logger.info(f"🎯 Utilisation du contexte fetchMLContextDirectly() DÉJÀ fourni par le frontend")
            logger.info(f"  📊 Dataset: {ml_context.get('dataset_name', 'N/A')}")
            logger.info(f"  🤖 Algorithm: {ml_context.get('algorithm_display', 'N/A')}")
            logger.info(f"  📈 Performance: {ml_context.get('metrics', {}).get('overall_score', 'N/A')}%")
            logger.info(f"  👤 AI Level: {ml_context.get('user_profile', {}).get('ai_familiarity', 3)}")
            
            # Préparer les données d'explication avec le contexte DÉJÀ fourni
            explanation_data = {
                'method': 'shap',
                'feature_importance': ml_context.get('feature_importance', {})
            }
            
            # Contexte enrichi pour le LLM
            enriched_context = {
                'audience_level': request.audience_level,
                'language': request.language,
                'model_algorithm': ml_context.get('algorithm_display', 'Modèle ML')
            }
            
            # User preferences avec le contexte fetchMLContextDirectly DÉJÀ fourni
            user_prefs = request.user_preferences or {}
            enriched_user_prefs = {
                'ai_familiarity': ml_context.get('user_profile', {}).get('ai_familiarity', 3),
                'full_ml_context': ml_context  # 🎯 CONTEXTE fetchMLContextDirectly DÉJÀ FOURNI
            }
            
            logger.info(f"🎯 Appel LLM avec le contexte fetchMLContextDirectly DÉJÀ fourni")
            
            llm_result = llm_service.generate_explanation(
                explanation_data,
                enriched_user_prefs,
                enriched_context
            )
            
            logger.info(f"🐛 DEBUG LLM RESULT: {llm_result}")
            
            if llm_result.get('success') and llm_result.get('text_explanation'):
                request.text_explanation = llm_result['text_explanation']
                logger.info(f"✅ Description OpenAI générée avec contexte fetchMLContextDirectly ({len(llm_result['text_explanation'])} caractères)")
            else:
                error_msg = llm_result.get('error', 'Erreur inconnue')
                logger.error(f"❌ ÉCHEC LLM: {error_msg}")
                request.text_explanation = f"[ERREUR LLM] {error_msg}"
                
        except Exception as e:
            logger.error(f"Erreur génération description textuelle: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            request.text_explanation = f"[DEBUG] Erreur lors de la génération: {str(e)[:200]}"
        
        # 4. Marquer la demande comme complétée
        request.status = RequestStatus.COMPLETED
        request.progress = 100
        request.completed_at = datetime.utcnow()
        session.commit()
        
        processing_time = time.time() - start_time
        logger.info(f"✅ Contexte ML stocké en {processing_time:.2f}s - Chat prêt !")
        logger.info(f"💬 Le chat peut maintenant utiliser ce contexte pour répondre aux questions")
        
        return {
            'request_id': str(request.id),
            'status': 'completed',
            'processing_time': processing_time,
            'method_used': 'precalculated_context',
            'context_ready': True
        }
        
    except Exception as e:
        logger.error(f"❌ Erreur stockage contexte: {e}")
        
        # Mettre à jour le statut d'erreur
        if session:
            request = session.query(ExplanationRequest).filter(
                ExplanationRequest.id == request_id
            ).first()
            
            if request:
                request.status = RequestStatus.FAILED
                request.error_message = str(e)
                request.updated_at = datetime.utcnow()
                session.commit()
        
        raise
    
    finally:
        session.close()
