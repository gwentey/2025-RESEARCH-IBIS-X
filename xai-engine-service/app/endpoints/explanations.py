from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query, Header
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional, Dict, Any
import uuid
import logging
from datetime import datetime

from ..database import get_database
from ..models import ExplanationRequest, ChatSession, ChatMessage
from ..clients.ml_pipeline_client import get_ml_pipeline_client
from ..schemas import (
    ExplanationRequestCreate, ExplanationRequestRead, ExplanationResults,
    ExplanationSummary, ExplanationRequestResponse, ErrorResponse,
    ChatSessionCreate, ChatSessionRead, ChatMessageRead,
    UserQuestionRequest, AIResponseRead,
    UserExplanationPreferences, ExplanationMetrics,
    RequestStatus  # Import manquant pour la logique simplifiée
)
from ..tasks import generate_explanation_task, process_chat_question
from ..tasks_precalculated import generate_explanation_with_precalculated_shap
from ..core.config import get_settings

logger = logging.getLogger(__name__)
# ✅ FIX ALTERNATIVE : Routes explicites sans redirects
router = APIRouter(prefix="/explanations", tags=["XAI Explanations"], redirect_slashes=False)
settings = get_settings()

# === CONSTANTES ET HELPERS ===

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

def get_user_uuid(x_user_id: Optional[str]) -> uuid.UUID:
    """
    Convertir le user_id depuis le header en UUID.
    OBLIGATOIRE : l'authentification doit passer par l'API Gateway.
    """
    if not x_user_id:
        logger.error("❌ Aucun X-User-ID dans les headers - Authentification via API Gateway requise")
        raise HTTPException(
            status_code=401, 
            detail="Authentification requise - Accès via API Gateway uniquement"
        )
    
    try:
        user_uuid = uuid.UUID(x_user_id)
        logger.info(f"✅ Utilisateur authentifié: {user_uuid}")
        return user_uuid
    except ValueError:
        logger.error(f"❌ Format UUID invalide pour user_id: {x_user_id}")
        raise HTTPException(
            status_code=400,
            detail="Format d'identifiant utilisateur invalide"
        )

# === ENDPOINTS POUR LES DEMANDES D'EXPLICATION ===

@router.post("/", response_model=ExplanationRequestResponse)
async def create_explanation_request(
    request_data: ExplanationRequestCreate,
    background_tasks: BackgroundTasks,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    db: AsyncSession = Depends(get_database)
):
    """
    Créer une nouvelle demande d'explication XAI.
    
    Lance une tâche asynchrone pour générer l'explication selon les paramètres spécifiés.
    """
    try:
        # Récupérer l'ID utilisateur depuis les headers (transmis par l'API Gateway)
        user_id = get_user_uuid(x_user_id)
        logger.info(f"✅ Demande XAI pour l'utilisateur: {user_id} ({x_user_email})")
        
        # 🎯 MODE CONTEXTUALISÉ: Utiliser les VRAIES données ML transmises par le frontend
        logger.info("🎯 Mode XAI contextualisé activé avec vraies données ML")
        
        # 🚨 DEBUG CRITIQUE: Vérifier tout ce qui arrive du frontend
        logger.info(f"🚨 DEBUG REQUEST DATA COMPLET:")
        logger.info(f"  - Type: {type(request_data)}")
        if hasattr(request_data, 'use_precalculated_shap'):
            logger.info(f"  ✅ use_precalculated_shap présent: {request_data.use_precalculated_shap}")
        else:
            logger.info(f"  ❌ use_precalculated_shap ABSENT")
        if hasattr(request_data, 'ml_context'):
            logger.info(f"  ✅ ml_context présent: type={type(request_data.ml_context)}")
            if request_data.ml_context and isinstance(request_data.ml_context, dict):
                logger.info(f"  📊 ml_context.feature_importance: {bool(request_data.ml_context.get('feature_importance'))}")
        else:
            logger.info(f"  ❌ ml_context ABSENT")
        
        # Extraire le contexte ML complet depuis la requête
        ml_context = getattr(request_data, 'ml_context', None) or {}
        contextual_suggestions = getattr(request_data, 'contextual_suggestions', [])
        
        # 🐛 DEBUG: Vérifier le contexte ML reçu
        logger.info(f"🐛 DEBUG ml_context type: {type(ml_context)}")
        logger.info(f"🐛 DEBUG ml_context keys: {list(ml_context.keys()) if isinstance(ml_context, dict) else 'Not dict'}")
        if isinstance(ml_context, dict):
            logger.info(f"🐛 DEBUG ml_context dataset_name: {ml_context.get('dataset_name', 'MISSING')}")
            logger.info(f"🐛 DEBUG ml_context metrics: {type(ml_context.get('metrics', 'MISSING'))}")
            logger.info(f"🐛 DEBUG ml_context experiment_id: {ml_context.get('experiment_id', 'MISSING')}")
        
        # Extraire le profil utilisateur RÉEL depuis le contexte ML
        user_profile = ml_context.get('user_profile', {})
        
        # 🎯 NETTOYAGE JSON : Convertir les objets complexes en structures simples
        def clean_for_json(obj):
            """Nettoyer un objet pour la sérialisation JSON."""
            if obj is None:
                return None
            elif isinstance(obj, dict):
                return {k: clean_for_json(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [clean_for_json(item) for item in obj]
            elif isinstance(obj, (str, int, float, bool)):
                return obj
            else:
                # Convertir autres types en string
                return str(obj)
        
        cleaned_ml_context = clean_for_json(ml_context)
        logger.info(f"🐛 DEBUG cleaned_ml_context keys: {list(cleaned_ml_context.keys()) if isinstance(cleaned_ml_context, dict) else 'Not dict'}")
        
        # Récupérer le profil utilisateur avec vraies données
        user_preferences = {
            'ai_familiarity': user_profile.get('ai_familiarity', 3),
            'education_level': user_profile.get('education_level', 'intermediate'),
            'preferred_language': request_data.language or user_profile.get('language', 'fr'),
            'user_id': user_profile.get('user_id'),
            'audience_level': user_profile.get('audience_level', 'intermediate'),
            # 🎯 CLEF CRITIQUE: Utiliser le nom cohérent 'ml_context'
            'ml_context': cleaned_ml_context,  # ✅ FIX: Nom cohérent avec tasks_precalculated.py
            'contextual_suggestions': contextual_suggestions,
            'user_profile': user_profile  # Ajouter aussi le user_profile pour le chat
        }
        
        logger.info(f"🎯 Contexte ML enrichi récupéré:")
        logger.info(f"  📊 Niveau IA utilisateur: {user_preferences['ai_familiarity']}")
        logger.info(f"  🎓 Niveau éducation: {user_preferences['education_level']}")
        logger.info(f"  🎭 Audience level: {user_preferences['audience_level']}")
        logger.info(f"  🔬 Dataset: {ml_context.get('dataset_name', 'N/A')}")
        logger.info(f"  🤖 Algorithme: {ml_context.get('algorithm_display', 'N/A')}")
        logger.info(f"  📈 Performance: {ml_context.get('metrics', {}).get('overall_score', 'N/A')}%")
        
        # Créer la demande d'explication avec contexte ML enrichi
        explanation_request = ExplanationRequest(
            user_id=user_id,
            experiment_id=request_data.experiment_id,
            dataset_id=request_data.dataset_id,
            explanation_type=request_data.explanation_type,
            method_requested=request_data.method_requested,
            audience_level=request_data.audience_level,
            language=request_data.language,
            instance_data=request_data.instance_data,
            instance_index=request_data.instance_index,
            user_preferences=user_preferences,
            status='pending'
        )
        
        # 🔧 FIX TEMPORAIRE: Désactiver ml_context jusqu'à migration DB
        # explanation_request.ml_context = ml_context
        logger.info("⚠️ Champ ml_context temporairement désactivé (migration DB requise)")
        
        db.add(explanation_request)
        await db.commit()
        await db.refresh(explanation_request)
        
        # 🚀 OPTIMISATION : Détecter si on doit utiliser le SHAP pré-calculé
        use_precalculated = getattr(request_data, 'use_precalculated_shap', False)
        
        # 🔍 Vérifier aussi si on a le feature_importance dans le contexte NETTOYÉ
        has_precalculated_shap = bool(cleaned_ml_context.get('feature_importance'))
        
        # Logger la détection pour debug
        logger.info(f"🔍 Détection SHAP pré-calculé:")
        logger.info(f"  - Flag use_precalculated: {use_precalculated}")
        logger.info(f"  - Feature importance présent: {has_precalculated_shap}")
        logger.info(f"  - Nombre de features: {len(cleaned_ml_context.get('feature_importance', {}))}")
        
        if use_precalculated or has_precalculated_shap:
            logger.info("🚀 UTILISATION DU SHAP PRÉ-CALCULÉ - PAS DE TÂCHE CELERY !")
            logger.info(f"  📊 Features disponibles: {len(cleaned_ml_context.get('feature_importance', {}))}")
            logger.info(f"  🎯 Algorithme: {cleaned_ml_context.get('algorithm', 'N/A')}")
            logger.info(f"  📈 Task type: {cleaned_ml_context.get('task_type', 'N/A')}")
            
            # 🎯 AMÉLIORATION : Générer les descriptions textuelles contextualisées même avec SHAP pré-calculé
            explanation_request.status = RequestStatus.COMPLETED
            explanation_request.progress = 100
            explanation_request.shap_values = cleaned_ml_context.get('feature_importance', {})
            explanation_request.method_used = 'shap'  # ✅ FIX: Utiliser 'shap' au lieu de 'precalculated_shap'
            explanation_request.completed_at = datetime.utcnow()
            explanation_request.processing_time_seconds = 0.1  # Instantané
            
            # 🎯 UTILISER DIRECTEMENT LE CONTEXTE fetchMLContextDirectly() DÉJÀ FOURNI !
            try:
                from ..xai.llm_service import get_llm_service
                
                llm_service = get_llm_service()
                
                # 🚀 Le frontend a DÉJÀ appelé fetchMLContextDirectly() et l'a envoyé !
                logger.info(f"🎯 Utilisation du contexte fetchMLContextDirectly() DÉJÀ fourni par le frontend")
                logger.info(f"  📊 Dataset: {cleaned_ml_context.get('dataset_name', 'N/A')}")
                logger.info(f"  🤖 Algorithm: {cleaned_ml_context.get('algorithm_display', 'N/A')}")
                logger.info(f"  📈 Performance: {cleaned_ml_context.get('metrics', {}).get('overall_score', 'N/A')}%")
                logger.info(f"  👤 AI Level: {cleaned_ml_context.get('user_profile', {}).get('ai_familiarity', 3)}")
                
                # Préparer les données d'explication avec le contexte DÉJÀ fourni
                explanation_data = {
                    'method': 'shap',
                    'feature_importance': cleaned_ml_context.get('feature_importance', {})
                }
                
                # Contexte enrichi pour le LLM
                enriched_context = {
                    'audience_level': explanation_request.audience_level,
                    'language': explanation_request.language,
                    'model_algorithm': cleaned_ml_context.get('algorithm_display', 'Modèle ML')
                }
                
                # User preferences avec le contexte fetchMLContextDirectly DÉJÀ fourni
                enriched_user_prefs = {
                    'ai_familiarity': cleaned_ml_context.get('user_profile', {}).get('ai_familiarity', 3),
                    'full_ml_context': cleaned_ml_context  # 🎯 CONTEXTE fetchMLContextDirectly DÉJÀ FOURNI
                }
                
                logger.info(f"🎯 Appel LLM avec le contexte fetchMLContextDirectly DÉJÀ fourni")
                
                llm_result = llm_service.generate_explanation(
                    explanation_data,
                    enriched_user_prefs,
                    enriched_context
                )
                
                logger.info(f"🐛 DEBUG LLM RESULT: {llm_result}")
                
                if llm_result.get('success') and llm_result.get('text_explanation'):
                    explanation_request.text_explanation = llm_result['text_explanation']
                    logger.info(f"✅ Description OpenAI générée avec contexte fetchMLContextDirectly ({len(llm_result['text_explanation'])} caractères)")
                else:
                    error_msg = llm_result.get('error', 'Erreur inconnue')
                    logger.error(f"❌ ÉCHEC LLM: {error_msg}")
                    explanation_request.text_explanation = f"[ERREUR LLM] {error_msg}"
                    
            except Exception as e:
                logger.error(f"Erreur génération description textuelle: {e}")
                import traceback
                logger.error(f"Traceback: {traceback.format_exc()}")
                explanation_request.text_explanation = f"[DEBUG] Erreur lors de la génération: {str(e)[:200]}"
            
            # Pas de visualisations, elles sont déjà dans les résultats ML
            explanation_request.visualizations = {}
            
            await db.commit()
            await db.refresh(explanation_request)
            
            logger.info(f"✅ Explication marquée comme complétée instantanément - ID: {explanation_request.id}")
            logger.info(f"💬 Le chat peut maintenant utiliser le contexte ML pré-calculé")
            
            # Pas de tâche Celery !
            task = None
        else:
            logger.info("⚠️ Utilisation de la tâche classique (recalcul SHAP)")
            # Tâche classique qui recalcule le SHAP (peut crasher avec RandomForest Regression)
            task = generate_explanation_task.apply_async(
                args=[str(explanation_request.id)], 
                queue='xai_queue'
            )
        
        # Mettre à jour l'ID de tâche (seulement si on a une tâche)
        if task:
            explanation_request.task_id = task.id
            await db.commit()
            logger.info(f"Demande d'explication créée: {explanation_request.id}, tâche: {task.id}")
        else:
            logger.info(f"Demande d'explication créée et COMPLÉTÉE instantanément: {explanation_request.id}")
        
        return ExplanationRequestResponse(
            success=True,
            message="Demande d'explication créée avec succès",
            request_id=explanation_request.id,
            estimated_completion_time=settings.explanation_timeout_minutes * 60
        )
        
    except Exception as e:
        logger.error(f"Erreur création demande d'explication: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{request_id}", response_model=ExplanationRequestRead)
async def get_explanation_request(
    request_id: uuid.UUID,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
    db: AsyncSession = Depends(get_database)
):
    """Récupérer les détails d'une demande d'explication."""
    
    user_id = get_user_uuid(x_user_id)
    query = select(ExplanationRequest).where(
        ExplanationRequest.id == request_id,
        ExplanationRequest.user_id == user_id
    )
    result = await db.execute(query)
    request = result.scalar_one_or_none()
    
    if not request:
        raise HTTPException(status_code=404, detail="Demande d'explication introuvable")
    
    return request

@router.get("/{request_id}/results", response_model=ExplanationResults)
async def get_explanation_results(
    request_id: uuid.UUID,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
    db: AsyncSession = Depends(get_database)
):
    """Récupérer les résultats d'une explication terminée."""
    
    user_id = get_user_uuid(x_user_id)
    query = select(ExplanationRequest).where(
        ExplanationRequest.id == request_id,
        ExplanationRequest.user_id == user_id
    )
    result = await db.execute(query)
    request = result.scalar_one_or_none()
    
    if not request:
        raise HTTPException(status_code=404, detail="Demande d'explication introuvable")
    
    if request.status != 'completed':
        raise HTTPException(status_code=400, detail="Explication pas encore terminée")
    
    return ExplanationResults(
        id=request.id,
        status=request.status,
        explanation_type=request.explanation_type,
        method_used=request.method_used,
        audience_level=request.audience_level,
        # Visualisations supprimées - fonctionnalité non nécessaire  
        shap_values=None,
        lime_explanation=None,
        visualizations=None,
        text_explanation=request.text_explanation,  # ✅ Retourner l'explication textuelle générée
        processing_time_seconds=request.processing_time_seconds,
        completed_at=request.completed_at
    )

@router.get("/", response_model=List[ExplanationSummary])
async def list_user_explanations(
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),  # Auth via API Gateway
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_database)
):
    """Lister les demandes d'explication d'un utilisateur."""
    
    user_id = get_user_uuid(x_user_id)
    query = select(ExplanationRequest).where(ExplanationRequest.user_id == user_id)
    
    if status:
        query = query.where(ExplanationRequest.status == status)
    
    query = query.order_by(ExplanationRequest.created_at.desc()).offset(skip).limit(limit)
    
    result = await db.execute(query)
    requests = result.scalars().all()
    
    summaries = []
    for req in requests:
        summaries.append(ExplanationSummary(
            id=req.id,
            explanation_type=req.explanation_type,
            method_used=req.method_used,
            audience_level=req.audience_level,
            status=req.status,
            progress=req.progress,
            created_at=req.created_at,
            has_text_explanation=False,  # Explications textuelles supprimées
            has_visualizations=False,  # Visualisations supprimées
            can_chat=req.status == 'completed'
        ))
    
    return summaries

# === ENDPOINTS POUR LE CHAT ===

@router.post("/{request_id}/chat", response_model=ChatSessionRead)
async def create_chat_session(
    request_id: uuid.UUID,
    chat_data: ChatSessionCreate,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),  # Auth via API Gateway
    db: AsyncSession = Depends(get_database)
):
    """Créer une session de chat pour poser des questions sur une explication."""
    
    user_id = get_user_uuid(x_user_id)
    
    # Vérifier que la demande d'explication existe et est terminée
    query = select(ExplanationRequest).where(
        ExplanationRequest.id == request_id,
        ExplanationRequest.user_id == user_id
    )
    result = await db.execute(query)
    explanation_request = result.scalar_one_or_none()
    
    if not explanation_request:
        raise HTTPException(status_code=404, detail="Demande d'explication introuvable")
    
    if explanation_request.status != 'completed':
        raise HTTPException(status_code=400, detail="L'explication doit être terminée avant de créer une session de chat")
    
    # Vérifier s'il y a déjà une session active
    existing_session_query = select(ChatSession).where(
        ChatSession.explanation_request_id == request_id,
        ChatSession.user_id == user_id,
        ChatSession.is_active == True
    )
    existing_result = await db.execute(existing_session_query)
    existing_session = existing_result.scalar_one_or_none()
    
    if existing_session:
        return existing_session
    
    # Créer nouvelle session
    chat_session = ChatSession(
        user_id=user_id,
        explanation_request_id=request_id,
        language=chat_data.language,
        max_questions=min(chat_data.max_questions, settings.max_chat_questions)
    )
    
    db.add(chat_session)
    await db.commit()
    await db.refresh(chat_session)
    
    logger.info(f"Session de chat créée: {chat_session.id} pour explication {request_id}")
    
    return chat_session

@router.post("/chat/{session_id}/ask", response_model=AIResponseRead)
async def ask_question(
    session_id: uuid.UUID,
    question_data: UserQuestionRequest,
    background_tasks: BackgroundTasks,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),  # Auth via API Gateway
    db: AsyncSession = Depends(get_database)
):
    """Poser une question sur les résultats d'explication."""
    
    user_id = get_user_uuid(x_user_id)
    
    # Récupérer la session de chat
    query = select(ChatSession).where(
        ChatSession.id == session_id,
        ChatSession.user_id == user_id,
        ChatSession.is_active == True
    )
    result = await db.execute(query)
    chat_session = result.scalar_one_or_none()
    
    if not chat_session:
        raise HTTPException(status_code=404, detail="Session de chat introuvable ou inactive")
    
    if chat_session.questions_count >= chat_session.max_questions:
        raise HTTPException(status_code=400, detail="Limite de questions atteinte")
    
    # 🐛 DEBUG COMPLET: Vérifier tout ce qui est reçu dans la question
    logger.info(f"🐛 CHAT DEBUG - Question data type: {type(question_data)}")
    logger.info(f"🐛 CHAT DEBUG - Question data attributes: {dir(question_data)}")
    logger.info(f"🐛 CHAT DEBUG - Question content: {question_data.question}")
    logger.info(f"🐛 CHAT DEBUG - Has context_data attr: {hasattr(question_data, 'context_data')}")
    
    if hasattr(question_data, 'context_data'):
        context_data = question_data.context_data
        logger.info(f"🐛 CHAT DEBUG - context_data type: {type(context_data)}")
        logger.info(f"🐛 CHAT DEBUG - context_data is None: {context_data is None}")
        if context_data is not None:
            logger.info(f"🐛 CHAT DEBUG - context_data value: {context_data}")
            if isinstance(context_data, dict):
                logger.info(f"✅ CHAT - Contexte ML reçu avec la question: {len(context_data.keys())} clés")
                logger.info(f"✅ CHAT - Contexte keys: {list(context_data.keys())}")
                logger.info(f"✅ CHAT - Dataset: {context_data.get('dataset_name', 'MISSING')}")
                logger.info(f"✅ CHAT - Accuracy: {context_data.get('metrics', {}).get('overall_score', 'MISSING')}")
            else:
                logger.warning(f"⚠️ CHAT - context_data n'est pas un dict: {type(context_data)}")
        else:
            logger.warning("⚠️ CHAT - context_data is None")
    else:
        logger.warning("⚠️ CHAT - Aucun attribut context_data sur question_data")
    
    # Lancer le traitement de la question en arrière-plan
    try:
        # 🐛 DEBUG: Vérifier ce qu'on envoie à Celery
        context_to_send = question_data.context_data if hasattr(question_data, 'context_data') else None
        logger.info(f"🐛 CELERY SEND DEBUG - Context to send type: {type(context_to_send)}")
        logger.info(f"🐛 CELERY SEND DEBUG - Context to send value: {context_to_send}")
        
        task_result = process_chat_question.delay(
            str(session_id),
            question_data.question,
            str(user_id),
            context_to_send  # 🎯 PASSER LE CONTEXTE
        )
        
        # ✅ FIX CRITIQUE : Timeout plus long pour GPT + meilleure gestion d'erreurs
        import time
        start_time = time.time()
        
        try:
            result = task_result.get(timeout=60)  # ✅ 60 secondes pour GPT
        except Exception as task_error:
            # Gestion spécifique des différents types d'erreurs
            if "timed out" in str(task_error).lower():
                logger.warning(f"Timeout de 60s atteint pour question chat session {session_id}")
                raise HTTPException(
                    status_code=408,  # ✅ Request Timeout approprié
                    detail="La génération prend plus de temps. Réessayez."
                )
            else:
                logger.error(f"Erreur tâche Celery: {task_error}")
                raise HTTPException(
                    status_code=500,
                    detail="Erreur traitement IA"  # ✅ Message utilisateur
                )
        
        response_time = time.time() - start_time
        
        return AIResponseRead(
            response=result['answer'],
            tokens_used=result['tokens_used'],
            response_time_seconds=response_time,
            model_used=result['model_used'],  # ✅ Modèle réellement utilisé (GPT-5 ou fallback)
            can_ask_more=result['can_ask_more'],
            remaining_questions=result['remaining_questions']
        )
        
    except HTTPException:
        # Re-lever les HTTPException telles quelles
        raise
    except Exception as e:
        logger.error(f"Erreur traitement question: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors du traitement de la question")

@router.get("/chat/{session_id}/messages", response_model=List[ChatMessageRead])
async def get_chat_messages(
    session_id: uuid.UUID,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),  # Auth via API Gateway
    db: AsyncSession = Depends(get_database)
):
    """Récupérer l'historique des messages d'une session de chat."""
    
    user_id = get_user_uuid(x_user_id)
    
    # Vérifier que la session appartient à l'utilisateur
    session_query = select(ChatSession).where(
        ChatSession.id == session_id,
        ChatSession.user_id == user_id
    )
    session_result = await db.execute(session_query)
    chat_session = session_result.scalar_one_or_none()
    
    if not chat_session:
        raise HTTPException(status_code=404, detail="Session de chat introuvable")
    
    # Récupérer les messages
    messages_query = select(ChatMessage).where(
        ChatMessage.chat_session_id == session_id
    ).order_by(ChatMessage.message_order)
    
    messages_result = await db.execute(messages_query)
    messages = messages_result.scalars().all()
    
    return messages

# === ENDPOINTS POUR LES ARTEFACTS - SUPPRIMÉS ===
# Les endpoints d'artefacts ont été supprimés car les visualisations ne sont plus nécessaires

# === ENDPOINTS POUR LES MÉTRIQUES ET STATISTIQUES ===

@router.get("/metrics/user", response_model=ExplanationMetrics)
async def get_user_explanation_metrics(
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),  # Auth via API Gateway
    db: AsyncSession = Depends(get_database)
):
    """Récupérer les métriques d'utilisation des explications pour un utilisateur."""
    
    user_id = get_user_uuid(x_user_id)
    
    # Compter les demandes par statut
    total_query = select(func.count(ExplanationRequest.id)).where(
        ExplanationRequest.user_id == user_id
    )
    total_result = await db.execute(total_query)
    total_requests = total_result.scalar()
    
    completed_query = select(func.count(ExplanationRequest.id)).where(
        ExplanationRequest.user_id == user_id,
        ExplanationRequest.status == 'completed'
    )
    completed_result = await db.execute(completed_query)
    completed_requests = completed_result.scalar()
    
    failed_query = select(func.count(ExplanationRequest.id)).where(
        ExplanationRequest.user_id == user_id,
        ExplanationRequest.status == 'failed'
    )
    failed_result = await db.execute(failed_query)
    failed_requests = failed_result.scalar()
    
    # Calculer le temps de traitement moyen
    avg_time_query = select(func.avg(ExplanationRequest.processing_time_seconds)).where(
        ExplanationRequest.user_id == user_id,
        ExplanationRequest.status == 'completed'
    )
    avg_time_result = await db.execute(avg_time_query)
    average_processing_time = avg_time_result.scalar() or 0.0
    
    # Méthode la plus utilisée
    most_used_method = "shap"  # TODO: Requête réelle
    
    return ExplanationMetrics(
        total_requests=total_requests,
        completed_requests=completed_requests,
        failed_requests=failed_requests,
        average_processing_time=average_processing_time,
        most_used_method=most_used_method,
        success_rate=completed_requests / max(total_requests, 1)
    )
