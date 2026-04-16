from celery import Task
import logging
import time
import traceback
from typing import Dict, Any, Optional, List  # 🔧 FIX: Ajouter List
import uuid
from datetime import datetime

from .core.celery_app import celery_app
from .database import get_sync_session
from .models import ExplanationRequest, ExplanationArtifact
from .schemas import RequestStatus
from .xai.explainers import choose_best_explainer, load_model_and_data
from .xai.llm_service import get_llm_service
from common.storage_client import get_storage_client

logger = logging.getLogger(__name__)

class XAITask(Task):
    """Classe de base pour les tâches XAI avec gestion d'état automatique."""
    
    def on_success(self, retval, task_id, args, kwargs):
        """Appelé en cas de succès de la tâche."""
        logger.info(f"Tâche {task_id} terminée avec succès")
    
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Appelé en cas d'échec de la tâche."""
        logger.error(f"Tâche {task_id} échouée: {exc}")
        logger.error(f"Traceback: {einfo}")
        
        # Mettre à jour le statut en base
        if len(args) > 0:
            request_id = args[0]
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
            except Exception as e:
                logger.error(f"Erreur mise à jour statut échec: {e}")
            finally:
                session.close()

@celery_app.task(base=XAITask, bind=True, name="app.tasks.generate_explanation_task")
def generate_explanation_task(self, request_id: str):
    """
    Tâche principale pour générer une explication XAI complète.
    
    Cette tâche orchestre tout le processus :
    1. Chargement du modèle et des données
    2. Génération des explications SHAP/LIME
    3. Création des visualisations
    4. Génération de l'explication textuelle avec LLM
    5. Sauvegarde des artefacts
    """
    logger.info(f"Démarrage génération explication pour request {request_id}")
    
    session = get_sync_session()
    start_time = time.time()
    
    try:
        # 1. Récupérer la demande d'explication
        request = session.query(ExplanationRequest).filter(
            ExplanationRequest.id == request_id
        ).first()
        
        if not request:
            raise ValueError(f"Demande d'explication {request_id} introuvable")
        
        # Mettre à jour le statut à "running"
        request.status = RequestStatus.RUNNING
        request.progress = 10
        request.task_id = self.request.id
        request.updated_at = datetime.utcnow()
        session.commit()
        
        # 2. Charger le modèle depuis l'expérience ML Pipeline
        logger.info(f"Chargement modèle pour expérience {request.experiment_id}")
        model_info = _load_model_from_experiment(request.experiment_id)
        
        request.progress = 25
        request.model_algorithm = model_info['algorithm']
        session.commit()
        
        # 3. Charger les données du dataset
        logger.info(f"Chargement dataset {request.dataset_id}")
        dataset_info = _load_dataset_for_explanation(request.dataset_id)
        
        request.progress = 30
        session.commit()
        
        # 🎯 SOLUTION SIMPLE : Récupérer les données DIRECTEMENT depuis la DB
        logger.info(f"📊 Récupération des données ML depuis la base de données pour expérience {request.experiment_id}")
        
        # Import SQLAlchemy pour accéder à la DB
        from sqlalchemy import create_engine, text
        from app.core.config import settings
        
        # Connexion à la DB PostgreSQL
        engine = create_engine(settings.database_url.replace("+asyncpg", ""))
        
        # Requête SQL simple pour récupérer TOUTES les données de l'expérience
        with engine.connect() as conn:
            # SIMPLIFICATION: Ne récupérer que depuis la table experiments
            result = conn.execute(text("""
                SELECT 
                    algorithm,
                    metrics,
                    feature_importance,
                    preprocessing_config,
                    dataset_id
                FROM experiments
                WHERE id = :experiment_id
            """), {"experiment_id": str(request.experiment_id)})
            
            row = result.fetchone()
            
            if row:
                # Extraire les données RÉELLES depuis la DB
                metrics = row.metrics or {}
                ml_context = {
                    'experiment_id': str(request.experiment_id),
                    'dataset_name': f"Dataset {str(row.dataset_id)[:8]}",  # Nom temporaire basé sur l'ID
                    'algorithm': row.algorithm or 'unknown',
                    'algorithm_display': (row.algorithm or 'unknown').replace('_', ' ').title(),
                    'metrics': {
                        'overall_score': metrics.get('accuracy', 0) * 100,
                        'accuracy': metrics.get('accuracy', 0),
                        'f1_score': metrics.get('f1_macro', metrics.get('f1_score', 0)),
                        'precision': metrics.get('precision_macro', metrics.get('precision', 0)),
                        'recall': metrics.get('recall_macro', metrics.get('recall', 0)),
                        'confusion_matrix': metrics.get('confusion_matrix', {})
                    },
                    'feature_importance': row.feature_importance or {},
                    'preprocessing_config': row.preprocessing_config or {}
                }
                logger.info(f"✅ Données récupérées depuis DB: {ml_context['dataset_name']} / {ml_context['algorithm_display']} / accuracy={ml_context['metrics']['accuracy']}")
                ml_context_source = "database"
            else:
                logger.warning(f"⚠️ Aucune donnée trouvée pour l'expérience {request.experiment_id}")
                ml_context = {}
                ml_context_source = "empty"
        
        # Récupérer le profil utilisateur
        user_preferences = request.user_preferences or {}
        frontend_user_profile = user_preferences.get('user_profile', {})
        
        if frontend_user_profile and frontend_user_profile.get('ai_familiarity'):
            logger.info(f"👤 Utilisation profil utilisateur depuis frontend")
            user_context = frontend_user_profile
            user_context['profile_complete'] = True
            user_context_source = "frontend"
        else:
            logger.info(f"👤 Profil utilisateur par défaut")
            user_context = {
                'ai_familiarity': 3,
                'education_level': 'intermediate',
                'profile_complete': False
            }
            user_context_source = "default"
        
        logger.info(f"📊 Sources contexte: ML={ml_context_source}, Utilisateur={user_context_source}")
        
        request.progress = 40
        session.commit()
        
        # 4. Créer l'explainer approprié
        logger.info(f"Création explainer {request.method_requested or 'auto'}")
        explainer = choose_best_explainer(
            model_info['model'], 
            dataset_info['X_train'], 
            dataset_info['feature_names'],
            request.explanation_type,
            request.method_requested or "auto"  # ✅ Permettre choix LIME/SHAP
        )
        
        # Déterminer la méthode utilisée
        method_used = 'shap' if 'SHAP' in str(type(explainer)) else 'lime'
        request.method_used = method_used
        request.progress = 50
        session.commit()
        
        # 5. Générer les explications
        logger.info(f"Génération explications {request.explanation_type}")
        if request.explanation_type == 'local' and request.instance_data:
            explanation_data = explainer.explain_instance(request.instance_data)
        elif request.explanation_type == 'global':
            explanation_data = explainer.explain_global()
        else:
            # Feature importance par défaut
            explanation_data = explainer.explain_global()
        
        request.progress = 70
        if method_used == 'shap':
            request.shap_values = explanation_data
        else:
            request.lime_explanation = explanation_data
        session.commit()
        
        # 6. Générer les visualisations
        logger.info("Génération visualisations")
        visualizations = explainer.generate_visualizations(
            explanation_data, 
            request.audience_level
        )
        
        # Sauvegarder les visualisations dans le stockage d'objets
        visualization_urls = _save_visualizations(request_id, visualizations)
        request.visualizations = visualization_urls
        request.progress = 85
        session.commit()
        
        # 7. Générer l'explication textuelle avec LLM ENRICHI
        logger.info("🤖 Génération explication textuelle LLM avec contexte dynamique")
        llm_service = get_llm_service()
        
        # 🎯 CONTEXTE LLM ENRICHI - Source unifiée (frontend prioritaire)
        enriched_context = {
            'audience_level': user_context.get('audience_level', request.audience_level),
            'language': user_context.get('language', request.language),
            'model_algorithm': request.model_algorithm,
            'task_type': ml_context.get('task_type', model_info.get('task_type', 'unknown')),
            'explanation_type': request.explanation_type,
            
            # 📊 DONNÉES ML CONTEXTUELLES (source unifiée)
            'dataset_name': ml_context.get('dataset_name', 'Dataset'),
            'dataset_size': ml_context.get('dataset_size', 0),
            'algorithm_display': ml_context.get('algorithm_display', ml_context.get('algorithm', 'unknown')),
            'class_names': ml_context.get('class_names', []),
            'confusion_errors': ml_context.get('confusion_errors', []),
            'feature_importance': ml_context.get('feature_importance', {}),
            'tree_structure': ml_context.get('tree_structure', {}),
            'metrics': ml_context.get('metrics', {}),
            
            # 👤 PROFIL UTILISATEUR UNIFIÉ
            'user_ai_level': user_context.get('ai_familiarity', 3),
            'user_education': user_context.get('education_level', 'intermediate'),
            'user_language': user_context.get('locale', 'fr')
        }
        
        # 🎯 Enrichir user_preferences avec le contexte complet pour le LLM
        enriched_user_prefs = {
            **user_preferences,
            'ai_familiarity': user_context.get('ai_familiarity', 3),
            'education_level': user_context.get('education_level', 'intermediate'),
            'audience_level': user_context.get('audience_level', request.audience_level),
            'preferred_language': user_context.get('locale', request.language),
            # 🎯 CLEF CRITIQUE: Contexte ML complet pour _build_contextual_explanation_prompt
            'full_ml_context': ml_context
        }
        
        logger.info(f"🎯 Contexte LLM final préparé:")
        logger.info(f"  📊 Dataset: {ml_context.get('dataset_name', 'N/A')}")
        logger.info(f"  🤖 Algorithme: {ml_context.get('algorithm_display', 'N/A')}")  
        logger.info(f"  📈 Performance: {ml_context.get('metrics', {}).get('overall_score', 'N/A')}%")
        logger.info(f"  👤 Niveau IA: {user_context.get('ai_familiarity', 3)}")
        logger.info(f"  🎭 Audience: {user_context.get('audience_level', request.audience_level)}")
        
        logger.info(f"🎯 Contexte LLM enrichi - Dataset: {enriched_context.get('dataset_name')}, "
                   f"Algorithm: {enriched_context.get('algorithm_display')}, Niveau IA: {enriched_context.get('user_ai_level')}")
        
        llm_result = llm_service.generate_explanation(
            explanation_data,
            enriched_user_prefs,
            enriched_context
        )
        
        if llm_result['success']:
            request.text_explanation = llm_result['text_explanation']
        else:
            logger.warning(f"Échec génération LLM: {llm_result.get('error')}")
        
        # 8. Finaliser
        end_time = time.time()
        request.processing_time_seconds = end_time - start_time
        request.status = RequestStatus.COMPLETED
        request.progress = 100
        request.completed_at = datetime.utcnow()
        request.updated_at = datetime.utcnow()
        session.commit()
        
        logger.info(f"Explication générée avec succès en {request.processing_time_seconds:.2f}s")
        
        return {
            'request_id': request_id,
            'status': 'completed',
            'processing_time': request.processing_time_seconds,
            'method_used': method_used
        }
        
    except Exception as e:
        logger.error(f"Erreur génération explication {request_id}: {e}")
        logger.error(traceback.format_exc())
        
        # Mettre à jour le statut d'erreur
        if 'request' in locals():
            request.status = RequestStatus.FAILED
            request.error_message = str(e)
            request.updated_at = datetime.utcnow()
            session.commit()
        
        raise
        
    finally:
        session.close()

@celery_app.task(name="app.tasks.process_chat_question")
def process_chat_question(chat_session_id: str, question: str, user_id: str, live_context_data: dict = None):
    """Traiter une question de chat sur les explications."""
    
    logger.info(f"Traitement question chat pour session {chat_session_id}")
    
    # 🐛 DEBUG CELERY: Vérifier EXACTEMENT ce qui est reçu par Celery
    logger.info(f"🐛 CELERY RECEIVE DEBUG - Parameters received:")
    logger.info(f"🐛 CELERY RECEIVE DEBUG - chat_session_id type: {type(chat_session_id)}")
    logger.info(f"🐛 CELERY RECEIVE DEBUG - question type: {type(question)}")
    logger.info(f"🐛 CELERY RECEIVE DEBUG - user_id type: {type(user_id)}")
    logger.info(f"🐛 CELERY RECEIVE DEBUG - live_context_data type: {type(live_context_data)}")
    logger.info(f"🐛 CELERY RECEIVE DEBUG - live_context_data is None: {live_context_data is None}")
    logger.info(f"🐛 CELERY RECEIVE DEBUG - live_context_data value: {live_context_data}")
    
    session = get_sync_session()
    
    try:
        from .models import ChatSession, ChatMessage, ExplanationRequest
        
        # Récupérer la session de chat
        chat_session = session.query(ChatSession).filter(
            ChatSession.id == chat_session_id
        ).first()
        
        if not chat_session:
            raise ValueError(f"Session de chat {chat_session_id} introuvable")
        
        # Vérifier les limites
        if chat_session.questions_count >= chat_session.max_questions:
            raise ValueError("Limite de questions atteinte")
        
        # Récupérer le contexte d'explication
        explanation_request = session.query(ExplanationRequest).filter(
            ExplanationRequest.id == chat_session.explanation_request_id
        ).first()
        
        if not explanation_request:
            raise ValueError("Demande d'explication introuvable")
        
        # Récupérer l'historique des messages
        messages = session.query(ChatMessage).filter(
            ChatMessage.chat_session_id == chat_session_id
        ).order_by(ChatMessage.message_order).all()
        
        chat_history = [
            {
                'message_type': msg.message_type,
                'content': msg.content
            }
            for msg in messages
        ]
        
        # 🎯 FIX CRITIQUE: Utiliser le contexte ML LIVE transmis par le frontend
        logger.info(f"🚨 DEBUG CHAT CONTEXT RECEPTION:")
        logger.info(f"  - live_context_data is None: {live_context_data is None}")
        logger.info(f"  - live_context_data type: {type(live_context_data)}")
        logger.info(f"  - live_context_data value: {live_context_data}")
        
        if live_context_data and isinstance(live_context_data, dict) and len(live_context_data) > 0:
            logger.info(f"✅ CHAT - Utilisation contexte ML LIVE depuis frontend")
            logger.info(f"✅ CHAT - Contexte live keys: {list(live_context_data.keys())}")
            logger.info(f"✅ CHAT - Dataset: {live_context_data.get('dataset_name', 'N/A')}")
            logger.info(f"✅ CHAT - Task Type: {live_context_data.get('task_type', 'N/A')}")
            logger.info(f"✅ CHAT - Is Regression: {live_context_data.get('is_regression', 'N/A')}")
            logger.info(f"✅ CHAT - Accuracy: {live_context_data.get('metrics', {}).get('overall_score', 'N/A')}")
            logger.info(f"✅ CHAT - Classification applicable: {not live_context_data.get('metrics', {}).get('classification_metrics_not_applicable', False)}")
            logger.info(f"✅ CHAT - Regression applicable: {not live_context_data.get('metrics', {}).get('regression_metrics_not_applicable', False)}")
            
            ml_context_chat = live_context_data
            chat_ml_source = "frontend_live"
        else:
            # Fallback: récupérer depuis la DB seulement si pas de contexte frontend
            logger.warning(f"⚠️ CHAT - Aucun contexte live, fallback vers DB pour expérience: {explanation_request.experiment_id}")
            
            # Import SQLAlchemy pour accéder à la DB
            from sqlalchemy import create_engine, text
            from app.core.config import settings
            
            # Connexion à la DB PostgreSQL
            engine = create_engine(settings.database_url.replace("+asyncpg", ""))
            
            # Requête SQL simple pour récupérer TOUTES les données de l'expérience
            with engine.connect() as conn:
                result = conn.execute(text("""
                    SELECT 
                        algorithm,
                        metrics,
                        feature_importance,
                        preprocessing_config,
                        dataset_id
                    FROM experiments
                    WHERE id = :experiment_id
                """), {"experiment_id": str(explanation_request.experiment_id)})
                
                row = result.fetchone()
                
                if row:
                    # 🚨 FIX FALLBACK: Différencier les métriques selon le type de tâche
                    metrics = row.metrics or {}
                    preprocessing_config = row.preprocessing_config or {}
                    task_type = preprocessing_config.get('task_type', 'classification')
                    is_regression = task_type == 'regression'
                    
                    logger.info(f"🚨 FALLBACK DB - Task Type: {task_type}, Is Regression: {is_regression}")
                    
                    # Construire les métriques selon le type de tâche (comme dans le frontend)
                    if is_regression:
                        # 🎯 MÉTRIQUES DE RÉGRESSION
                        metrics_data = {
                            'raw_metrics': metrics,
                            'task_type': 'regression',
                            'overall_score': metrics.get('r2', 0) * 100 if metrics.get('r2') else 0,
                            'r2_score': metrics.get('r2', 0),
                            'mae': metrics.get('mae', 0),
                            'mse': metrics.get('mse', 0),
                            'rmse': metrics.get('rmse', 0),
                            # 🚫 PAS de métriques de classification pour la régression
                            'classification_metrics_not_applicable': True,
                            'explanation_for_missing_metrics': "Les métriques F1, précision et rappel ne sont pas applicables aux modèles de régression. Pour évaluer ce modèle de régression, utilisez le R² (variance expliquée), MAE (erreur absolue moyenne), RMSE (racine de l'erreur quadratique moyenne) et MSE (erreur quadratique moyenne)."
                        }
                    else:
                        # 🎯 MÉTRIQUES DE CLASSIFICATION
                        metrics_data = {
                            'raw_metrics': metrics,
                            'task_type': 'classification',
                            'overall_score': metrics.get('accuracy', 0) * 100,
                            'accuracy': metrics.get('accuracy', 0),
                            'f1_score': metrics.get('f1_macro', metrics.get('f1_score', 0)),
                            'precision': metrics.get('precision_macro', metrics.get('precision', 0)),
                            'recall': metrics.get('recall_macro', metrics.get('recall', 0)),
                            # 🚫 PAS de métriques de régression pour la classification
                            'regression_metrics_not_applicable': True,
                            'explanation_for_missing_metrics': "Les métriques R², MAE, RMSE et MSE ne sont pas applicables aux modèles de classification. Pour évaluer ce modèle de classification, utilisez la précision (accuracy), le F1-score, la précision et le rappel."
                        }
                    
                    # Extraire les données depuis la DB (fallback) avec nouveau format
                    ml_context_chat = {
                        'experiment_id': str(explanation_request.experiment_id),
                        'dataset_name': f"Dataset {str(row.dataset_id)[:8]}",  # Nom temporaire basé sur l'ID
                        'algorithm': row.algorithm or 'unknown',
                        'algorithm_display': (row.algorithm or 'unknown').replace('_', ' ').title(),
                        'metrics': metrics_data,
                        'feature_importance': row.feature_importance or {},
                        'preprocessing_config': row.preprocessing_config or {},
                        # 🎯 NOUVEAUX FLAGS pour cohérence
                        'task_type': task_type,
                        'is_regression': is_regression,
                        'is_classification': not is_regression,
                        'confusion_matrix': None if is_regression else metrics.get('confusion_matrix', {}),
                        'class_names': None if is_regression else []
                    }
                    logger.info(f"✅ CHAT - Données récupérées depuis DB (fallback): {ml_context_chat['dataset_name']} / {ml_context_chat['algorithm_display']} / accuracy={ml_context_chat['metrics']['accuracy']}")
                    chat_ml_source = "database_fallback"
                else:
                    logger.warning(f"⚠️ CHAT - Aucune donnée trouvée pour l'expérience {explanation_request.experiment_id}")
                    ml_context_chat = {}
                    chat_ml_source = "empty"
        
        # Récupérer le profil utilisateur
        stored_user_prefs = explanation_request.user_preferences or {}
        frontend_user_profile = stored_user_prefs.get('user_profile', {})
        
        if frontend_user_profile and frontend_user_profile.get('ai_familiarity'):
            logger.info(f"👤 Chat: Utilisation profil utilisateur depuis preferences")
            user_context_chat = frontend_user_profile
            chat_user_source = "preferences"
        else:
            logger.info(f"👤 Chat: Profil utilisateur par défaut")
            user_context_chat = {
                'ai_familiarity': 3,
                'education_level': 'intermediate'
            }
            chat_user_source = "default"
        
        logger.info(f"💬 Chat sources contexte: ML={chat_ml_source}, Utilisateur={chat_user_source}")
        
        explanation_context = {
            'language': chat_session.language,
            'audience_level': explanation_request.audience_level,
            'method_used': explanation_request.method_used,
            'model_algorithm': explanation_request.model_algorithm,
            'task_type': 'classification',  # ✅ Valeur par défaut (champ n'existe pas dans modèle)
            
            # ✅ DONNÉES EXISTANTES du modèle
            'shap_values': explanation_request.shap_values or {},
            'lime_explanation': explanation_request.lime_explanation or {},
            'visualizations': explanation_request.visualizations or {},
            'text_explanation': explanation_request.text_explanation or "",
            'processing_time': explanation_request.processing_time_seconds,
            
            # 🎯 DONNÉES ML UNIFIÉES pour chat contextualisé (frontend prioritaire)
            'dataset_name': ml_context_chat.get('dataset_name', 'Dataset'),
            'dataset_size': ml_context_chat.get('dataset_size', 0),
            'algorithm_display': ml_context_chat.get('algorithm_display', ml_context_chat.get('algorithm', 'unknown')),
            'real_accuracy': ml_context_chat.get('metrics', {}).get('overall_score', ml_context_chat.get('metrics', {}).get('accuracy', 0)),
            'real_metrics': ml_context_chat.get('metrics', {}),
            'real_class_names': ml_context_chat.get('class_names', []),
            'real_confusion_errors': ml_context_chat.get('confusion_errors', []),
            'real_feature_importance': ml_context_chat.get('feature_importance', {}),
            'real_tree_structure': ml_context_chat.get('tree_structure', {}),
            
            # 👤 PROFIL UTILISATEUR UNIFIÉ pour chat adaptatif
            'user_ai_level': user_context_chat.get('ai_familiarity', 3),
            'user_education_level': user_context_chat.get('education_level', 'intermediate'),
            'user_language': user_context_chat.get('locale', 'fr')
        }
        
        # Sauvegarder la question utilisateur
        question_message = ChatMessage(
            chat_session_id=chat_session_id,
            message_type='user_question',
            content=question,
            message_order=len(messages) + 1
        )
        session.add(question_message)
        
        # 🎯 Enrichir user_preferences CHAT avec contexte ML complet unifié
        enriched_user_prefs_chat = {
            **(explanation_request.user_preferences or {}),
            'ai_familiarity': user_context_chat.get('ai_familiarity', 3),
            'education_level': user_context_chat.get('education_level', 'intermediate'),
            'audience_level': user_context_chat.get('audience_level', explanation_request.audience_level),
            'preferred_language': user_context_chat.get('locale', chat_session.language),
            # 🎯 CLEF CRITIQUE pour le chat: Contexte ML complet
            'full_ml_context': ml_context_chat
        }
        
        # Générer la réponse avec LLM ENRICHI
        llm_service = get_llm_service()
        logger.info(f"💬 Chat LLM avec contexte enrichi - Dataset: {explanation_context['dataset_name']}, "
                   f"Accuracy: {explanation_context['real_accuracy']}, Niveau IA: {explanation_context['user_ai_level']}")
        
        llm_result = llm_service.process_chat_question(
            question,
            explanation_context,
            enriched_user_prefs_chat,  # 🎯 User preferences enrichies
            chat_history
        )
        
        if not llm_result['success']:
            raise ValueError(f"Erreur LLM: {llm_result.get('error')}")
        
        # Sauvegarder la réponse
        response_message = ChatMessage(
            chat_session_id=chat_session_id,
            message_type='ai_response',
            content=llm_result['answer'],
            message_order=len(messages) + 2,
            tokens_used=llm_result.get('tokens_used'),
            model_used=llm_result.get('model_used'),
            response_time_seconds=0.0  # À mesurer
        )
        session.add(response_message)
        
        # Mettre à jour la session
        chat_session.questions_count += 1
        chat_session.last_activity = datetime.utcnow()
        chat_session.updated_at = datetime.utcnow()
        
        # Marquer comme complétée si limite atteinte
        if chat_session.questions_count >= chat_session.max_questions:
            chat_session.status = 'completed'
            chat_session.is_active = False
        
        session.commit()
        
        return {
            'answer': llm_result['answer'],
            'tokens_used': llm_result.get('tokens_used', 0),
            'model_used': llm_result.get('model_used', 'gpt-4o-mini'),  # ✅ FIX CRITIQUE: Ajouter model_used
            'remaining_questions': chat_session.max_questions - chat_session.questions_count,
            'can_ask_more': chat_session.questions_count < chat_session.max_questions
        }
        
    except Exception as e:
        logger.error(f"Erreur traitement question chat: {e}")
        session.rollback()
        raise
    finally:
        session.close()

def _load_model_from_experiment(experiment_id: str) -> Dict[str, Any]:
    """Charger le modèle depuis une expérience ML Pipeline."""
    import httpx
    import joblib
    import io
    import os
    
    logger.info(f"Chargement modèle pour expérience {experiment_id}")
    
    try:
        # 1. Récupérer les métadonnées depuis ML Pipeline service
        ml_pipeline_url = os.getenv("ML_PIPELINE_URL", "http://ml-pipeline:8082")
        
        with httpx.Client(timeout=30.0) as client:
            response = client.get(f"{ml_pipeline_url}/experiments/{experiment_id}/results")
            response.raise_for_status()
            experiment_results = response.json()
        
        logger.info(f"Métadonnées expérience récupérées: {experiment_results.keys()}")
        
        # 2. Récupérer les informations du modèle - CORRECTION: ML Pipeline utilise 'model_uri'
        model_path = experiment_results.get('model_path') or experiment_results.get('model_uri')
        if not model_path:
            available_keys = list(experiment_results.keys())
            logger.error(f"❌ Clés disponibles: {available_keys}")
            raise ValueError(f"Pas de model_path ou model_uri dans les résultats de l'expérience {experiment_id}")
        
        # 3. Télécharger et charger le modèle depuis MinIO
        storage_client = get_storage_client()
        logger.info(f"Téléchargement modèle depuis: {model_path}")
        
        model_data = storage_client.download_file(model_path)  # ✅ CORRECTION: Bonne méthode !
        loaded_data = joblib.load(io.BytesIO(model_data))
        
        logger.info(f"✅ Données chargées depuis joblib: {type(loaded_data)}")
        
        # ✅ CORRECTION: Extraire le vrai modèle du dictionnaire si nécessaire
        if isinstance(loaded_data, dict):
            # Le fichier joblib contient un dictionnaire avec métadonnées
            model = loaded_data.get('model', loaded_data.get('trained_model', loaded_data))
            logger.info(f"✅ Modèle extrait du dict: {type(model)}")
            
            # Vérifier que c'est bien un modèle sklearn
            if not hasattr(model, 'predict'):
                logger.error(f"❌ L'objet extrait n'a pas de méthode predict: {type(model)}")
                logger.error(f"❌ Clés disponibles dans le dict: {list(loaded_data.keys())}")
                raise ValueError(f"Impossible d'extraire un modèle valide du fichier {model_path}")
        else:
            # Le fichier contient directement le modèle
            model = loaded_data
            logger.info(f"✅ Modèle direct chargé: {type(model)}")
        
        # 4. Extraire les informations du modèle
        algorithm = experiment_results.get('algorithm', 'unknown')
        task_type = experiment_results.get('task_type', 'classification')
        # ✅ CORRECTION: Essayer différentes clés possibles pour les feature_names
        feature_names = (experiment_results.get('feature_names') or 
                        experiment_results.get('features') or 
                        experiment_results.get('columns') or [])
        
        return {
            'model': model,  # ✅ MODÈLE RÉEL CHARGÉ
            'algorithm': algorithm,
            'task_type': task_type,
            'feature_names': feature_names,
            'model_path': model_path
        }
        
    except Exception as e:
        logger.error(f"❌ Erreur chargement modèle {experiment_id}: {e}")
        raise ValueError(f"Impossible de charger le modèle: {e}")

def _load_dataset_for_explanation(dataset_id: str) -> Dict[str, Any]:
    """Charger le dataset pour les explications."""
    import httpx
    import pandas as pd
    import io
    import os
    
    logger.info(f"Chargement dataset {dataset_id}")
    
    try:
        # 1. Récupérer les métadonnées depuis Service Selection
        service_selection_url = os.getenv("SERVICE_SELECTION_URL", "http://service-selection-service:80")
        
        with httpx.Client(timeout=30.0) as client:
            response = client.get(f"{service_selection_url}/datasets/{dataset_id}")
            response.raise_for_status()
            dataset_info = response.json()
        
        logger.info(f"Métadonnées dataset récupérées: {dataset_info.keys()}")
        
        # 2. Télécharger et charger les données depuis MinIO - CORRECTION: Gestion dossier vs fichier
        
        # Essayer d'abord la clé 'files' qui devrait contenir les vrais fichiers
        files_info = dataset_info.get('files', [])
        if files_info and len(files_info) > 0:
            # CORRECTION: Utiliser la vraie clé 'file_name_in_storage'
            for file_info in files_info:
                file_name = file_info.get('file_name_in_storage', '')
                if file_name and (file_name.endswith('.parquet') or file_name.endswith('.csv')):
                    # Construire le chemin complet : storage_path + file_name_in_storage
                    base_path = dataset_info.get('storage_path', '').rstrip('/')
                    data_path = f"{base_path}/{file_name}" if base_path else file_name
                    logger.info(f"✅ Fichier trouvé dans 'files': {file_name} → {data_path}")
                    break
            else:
                # Si pas de fichier data trouvé, prendre le premier
                first_file = files_info[0]
                file_name = first_file.get('file_name_in_storage', '')
                base_path = dataset_info.get('storage_path', '').rstrip('/')
                data_path = f"{base_path}/{file_name}" if base_path else file_name
                logger.info(f"✅ Premier fichier trouvé: {file_name} → {data_path}")
        else:
            # Fallback vers les anciennes clés
            base_path = (dataset_info.get('file_path') or 
                        dataset_info.get('storage_path') or 
                        dataset_info.get('storage_uri'))
            
            if base_path and base_path.endswith('/'):
                # C'est un dossier, lister les fichiers
                storage_client = get_storage_client()
                logger.info(f"🔍 Listage des fichiers dans le dossier: {base_path}")
                available_files = storage_client.list_files(base_path)
                
                # Chercher un fichier .parquet ou .csv
                for file_name in available_files:
                    if file_name.endswith('.parquet') or file_name.endswith('.csv'):
                        data_path = file_name
                        logger.info(f"✅ Fichier de données trouvé: {data_path}")
                        break
                else:
                    raise ValueError(f"Aucun fichier .parquet/.csv trouvé dans {base_path}")
            else:
                data_path = base_path
        
        if not data_path:
            available_keys = list(dataset_info.keys())
            logger.error(f"❌ Clés dataset disponibles: {available_keys}")
            logger.error(f"❌ Fichiers disponibles: {files_info}")
            raise ValueError(f"Pas de fichier de données trouvé dans les métadonnées du dataset {dataset_id}")
        
        storage_client = get_storage_client()
        logger.info(f"Téléchargement dataset depuis: {data_path}")
        
        data_bytes = storage_client.download_file(data_path)  # ✅ CORRECTION: Bonne méthode !
        
        # 3. Charger selon le format
        if data_path.endswith('.parquet'):
            df = pd.read_parquet(io.BytesIO(data_bytes))
        elif data_path.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(data_bytes))
        else:
            raise ValueError(f"Format non supporté: {data_path}")
        
        logger.info(f"✅ Dataset chargé: {df.shape}")
        logger.info(f"✅ Colonnes dataset: {list(df.columns)}")
        
        # 🚨 CORRECTION SYSTÉMATIQUE: Exclure colonnes cibles ET identifiants non-prédictifs
        target_columns = ['target', 'Target', 'y', 'label', 'Label', 'class', 'Class', 'Species', 'species']
        
        # 🚨 EXCLUSION SYSTÉMATIQUE des colonnes d'identifiant pour TOUS algorithmes et tâches
        id_columns = ['Id', 'ID', 'id', 'index', 'Index', 'idx', 'row_id', 'item_id', 'record_id']
        columns_to_exclude = target_columns + id_columns
        
        logger.warning(f"🚨 EXCLUSION SYSTÉMATIQUE XAI - Colonnes cibles: {target_columns}")
        logger.warning(f"🚨 EXCLUSION SYSTÉMATIQUE XAI - Colonnes d'identifiant: {id_columns}")
        
        # Supprimer colonnes exclues et conserver seulement les numériques prédictives
        numeric_columns = []
        excluded_found = []
        
        for col in df.columns:
            if col in columns_to_exclude:
                excluded_found.append(col)
                logger.warning(f"🚫 EXCLU: {col} (colonne non-prédictive)")
                continue
                
            # Vérifier si la colonne est numérique
            try:
                pd.to_numeric(df[col], errors='raise')
                numeric_columns.append(col)
                logger.info(f"✅ Colonne numérique PRÉDICTIVE gardée: {col}")
            except (ValueError, TypeError):
                logger.info(f"❌ Colonne non-numérique supprimée: {col} (type: {df[col].dtype})")
        
        logger.info(f"✅ EXCLUSIONS APPLIQUÉES: {excluded_found}")
        logger.info(f"✅ Features finales PRÉDICTIVES pour XAI: {numeric_columns}")
        
        if not numeric_columns:
            raise ValueError("Aucune colonne numérique prédictive trouvée après exclusion systématique")
        
        X_train = df[numeric_columns]
        feature_names = numeric_columns
        logger.info(f"🎯 RÉSULTAT FINAL XAI - Features: {feature_names}")
        
        return {
            'X_train': X_train,
            'feature_names': feature_names,
            'dataset_shape': df.shape,
            'data_path': data_path
        }
        
    except Exception as e:
        logger.error(f"❌ Erreur chargement dataset {dataset_id}: {e}")
        raise ValueError(f"Impossible de charger le dataset: {e}")

def get_storage_client():
    """Obtenir le client de stockage (MinIO)."""
    from common.storage_client import get_storage_client as get_common_storage_client
    return get_common_storage_client()

def _save_visualizations(request_id: str, visualizations: Dict[str, str]) -> Dict[str, str]:
    """Sauvegarder les visualisations dans le stockage d'objets."""
    
    storage_client = get_storage_client()
    saved_urls = {}
    
    session = get_sync_session()
    
    try:
        for viz_type, base64_image in visualizations.items():
            # Générer un nom de fichier unique
            file_name = f"{request_id}_{viz_type}_{int(time.time())}.png"
            file_path = f"xai-explanations/{request_id}/{file_name}"
            
            # Décoder l'image base64
            import base64
            image_data = base64.b64decode(base64_image)
            
            # Sauvegarder dans le stockage d'objets
            storage_client.upload_file(image_data, file_path)
            
            # Créer l'enregistrement d'artefact
            artifact = ExplanationArtifact(
                explanation_request_id=request_id,
                artifact_type=viz_type,
                file_name=file_name,
                file_path=file_path,
                file_size_bytes=len(image_data),
                mime_type='image/png',
                description=f"Visualisation {viz_type}",
                is_primary=(viz_type == 'feature_importance')
            )
            session.add(artifact)
            
            # Générer l'URL d'accès
            saved_urls[viz_type] = f"/api/v1/xai/artifacts/{artifact.id}/download"
            
            logger.info(f"Visualisation {viz_type} sauvegardée: {file_path}")
        
        session.commit()
        return saved_urls
        
    except Exception as e:
        logger.error(f"Erreur sauvegarde visualisations: {e}")
        session.rollback()
        raise
    finally:
        session.close()

# Tâches de nettoyage et maintenance
@celery_app.task(name="app.tasks.cleanup_expired_sessions")
def cleanup_expired_sessions():
    """Nettoyer les sessions de chat expirées."""
    from .models import ChatSession
    from datetime import datetime, timedelta
    
    session = get_sync_session()
    try:
        expired_threshold = datetime.utcnow() - timedelta(hours=24)
        
        expired_sessions = session.query(ChatSession).filter(
            ChatSession.last_activity < expired_threshold,
            ChatSession.status == 'active'
        ).all()
        
        for chat_session in expired_sessions:
            chat_session.status = 'expired'
            chat_session.is_active = False
            chat_session.updated_at = datetime.utcnow()
        
        session.commit()
        logger.info(f"Nettoyé {len(expired_sessions)} sessions expirées")
        
    except Exception as e:
        logger.error(f"Erreur nettoyage sessions: {e}")
        session.rollback()
    finally:
        session.close()

@celery_app.task(name="app.tasks.generate_explanation_metrics")
def generate_explanation_metrics():
    """Générer des métriques sur l'utilisation des explications."""
    # TODO: Implémenter la collecte de métriques
    logger.info("Génération métriques d'utilisation")

# === FONCTIONS DE RÉCUPÉRATION DYNAMIQUE ===


def _get_ml_context_sync(experiment_id: str) -> Dict[str, Any]:
    """
    📊 Version SYNCHRONE - Récupère le contexte ML complet.
    
    Récupère TOUTES les données ML Pipeline :
    - Métriques (accuracy, f1, etc.)
    - Arbre de décision 
    - Matrice de confusion
    - Importance des features
    """
    import httpx
    from .core.config import get_settings
    
    settings = get_settings()
    
    try:
        logger.info(f"📊 [SYNC] Récupération ML Pipeline pour {experiment_id}")
        
        with httpx.Client(timeout=15.0) as client:
            # Récupérer les résultats complets
            results_url = f"{settings.ml_pipeline_service_url}/api/v1/experiments/{experiment_id}/results"
            logger.info(f"🔗 URL résultats: {results_url}")
            
            response = client.get(results_url)
            
            if response.status_code == 200:
                results = response.json()
                
                # Extraire les données importantes
                context = {
                    'experiment_id': experiment_id,
                    'algorithm': results.get('algorithm', 'unknown'),
                    'metrics': results.get('metrics', {}),
                    'preprocessing_config': results.get('preprocessing_config', {}),
                    'visualizations': results.get('visualizations', {}),
                    'feature_importance': results.get('feature_importance', {}),
                    
                    # Extraire données confusion matrix
                    'confusion_matrix': _extract_confusion_data(results),
                    'class_names': _extract_class_names(results),
                    
                    # Extraire données arbre
                    'tree_structure': _extract_tree_data(results),
                    
                    'context_quality': 'complete'
                }
                
                logger.info(f"✅ Contexte ML récupéré - Algorithm: {context['algorithm']}, "
                           f"Accuracy: {context['metrics'].get('accuracy', 'N/A')}")
                return context
            else:
                logger.warning(f"⚠️ ML Pipeline retourne {response.status_code}")
                raise Exception(f"Status {response.status_code}")
                
    except Exception as e:
        logger.warning(f"⚠️ Erreur récupération contexte ML: {e}")
        return {
            'experiment_id': experiment_id,
            'error': str(e),
            'context_quality': 'minimal',
            'algorithm': 'unknown',
            'metrics': {}
        }

def _get_user_context_sync(user_id: str) -> Dict[str, Any]:
    """
    👤 Version SYNCHRONE - Récupère le profil utilisateur.
    
    Récupère le VRAI niveau d'IA depuis l'onboarding.
    """
    import httpx
    from .core.config import get_settings
    
    settings = get_settings()
    
    try:
        logger.info(f"👤 [SYNC] Récupération profil utilisateur {user_id}")
        
        with httpx.Client(timeout=10.0) as client:
            # IMPORTANT: Utiliser l'endpoint correct de l'API Gateway
            api_url = f"{settings.api_gateway_url}/users/{user_id}"
            logger.info(f"🔗 URL profil: {api_url}")
            
            response = client.get(api_url)
            
            if response.status_code == 200:
                user_data = response.json()
                context = {
                    'user_id': user_id,
                    'ai_familiarity': user_data.get('ai_familiarity', 3),
                    'education_level': user_data.get('education_level', 'intermediate'),
                    'locale': user_data.get('locale', 'fr'),
                    'email': user_data.get('email', ''),
                    'profile_complete': True
                }
                
                logger.info(f"✅ Profil utilisateur récupéré - Niveau IA: {context['ai_familiarity']}")
                return context
            else:
                logger.warning(f"⚠️ API Gateway retourne {response.status_code} pour {api_url}")
                raise Exception(f"Status {response.status_code}")
                
    except Exception as e:
        logger.warning(f"⚠️ Erreur récupération profil utilisateur: {e}")
        return {
            'user_id': user_id,
            'ai_familiarity': 3,  # Défaut
            'education_level': 'intermediate',
            'locale': 'fr',
            'profile_complete': False,
            'error': str(e)
        }

def _extract_confusion_data(results: dict) -> List:
    """Extraire la matrice de confusion depuis les résultats ML."""
    try:
        confusion_viz = results.get('visualizations', {}).get('confusion_matrix', {})
        if isinstance(confusion_viz, dict) and 'metadata' in confusion_viz:
            return confusion_viz['metadata'].get('matrix', [])
    except Exception as e:
        logger.warning(f"⚠️ Erreur extraction confusion matrix: {e}")
    return []

def _extract_class_names(results: dict) -> List[str]:
    """Extraire les noms de classes depuis les résultats ML."""
    try:
        confusion_viz = results.get('visualizations', {}).get('confusion_matrix', {})
        if isinstance(confusion_viz, dict) and 'metadata' in confusion_viz:
            return confusion_viz['metadata'].get('class_names', [])
    except Exception as e:
        logger.warning(f"⚠️ Erreur extraction class names: {e}")
    return []

def _extract_tree_data(results: dict) -> Dict:
    """Extraire la structure de l'arbre depuis les résultats ML."""
    try:
        tree_viz = results.get('visualizations', {}).get('tree_structure', {})
        if isinstance(tree_viz, dict) and 'tree_data' in tree_viz:
            return tree_viz['tree_data']
    except Exception as e:
        logger.warning(f"⚠️ Erreur extraction tree data: {e}")
    return {}
