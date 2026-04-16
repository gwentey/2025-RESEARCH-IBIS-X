from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum
import uuid

# === ENUMS ===

class ExplanationType(str, Enum):
    GLOBAL = "global"
    LOCAL = "local"
    FEATURE_IMPORTANCE = "feature_importance"

class ExplanationMethod(str, Enum):
    SHAP = "shap"
    LIME = "lime"
    AUTO = "auto"

class AudienceLevel(str, Enum):
    NOVICE = "novice"
    INTERMEDIATE = "intermediate"
    EXPERT = "expert"

class RequestStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

class MessageType(str, Enum):
    USER_QUESTION = "user_question"
    AI_RESPONSE = "ai_response"
    SYSTEM = "system"

# === MODÈLES DE BASE ===

class ExplanationRequestBase(BaseModel):
    """Schéma de base pour les demandes d'explication XAI."""
    explanation_type: ExplanationType
    method_requested: Optional[ExplanationMethod] = None
    audience_level: AudienceLevel
    language: str = Field(default="fr", pattern="^(fr|en)$")
    instance_data: Optional[Dict[str, Any]] = None
    instance_index: Optional[int] = None

class ExplanationRequestCreate(ExplanationRequestBase):
    """Schéma pour créer une nouvelle demande d'explication."""
    experiment_id: uuid.UUID
    dataset_id: uuid.UUID
    
    # 🎯 NOUVEAUX CHAMPS pour le contexte ML et SHAP pré-calculé
    ml_context: Optional[dict] = None  # Contexte ML complet avec feature_importance
    contextual_suggestions: Optional[list] = None  # Suggestions contextuelles
    use_precalculated_shap: Optional[bool] = False  # Flag pour utiliser le SHAP pré-calculé

class ExplanationRequestUpdate(BaseModel):
    """Schéma pour mettre à jour une demande d'explication."""
    status: Optional[RequestStatus] = None
    progress: Optional[int] = Field(None, ge=0, le=100)
    method_used: Optional[ExplanationMethod] = None
    error_message: Optional[str] = None
    shap_values: Optional[Dict[str, Any]] = None
    lime_explanation: Optional[Dict[str, Any]] = None
    visualizations: Optional[Dict[str, Any]] = None
    text_explanation: Optional[str] = None
    processing_time_seconds: Optional[float] = None

class ExplanationRequestRead(ExplanationRequestBase):
    """Schéma pour lire une demande d'explication."""
    model_config = ConfigDict(from_attributes=True)
    
    id: uuid.UUID
    user_id: uuid.UUID
    experiment_id: uuid.UUID
    dataset_id: uuid.UUID
    method_used: Optional[ExplanationMethod] = None
    status: RequestStatus
    progress: int
    task_id: Optional[str] = None
    error_message: Optional[str] = None
    user_preferences: Optional[Dict[str, Any]] = None
    algorithm: Optional[str] = None
    processing_time_seconds: Optional[float] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None

class ExplanationResults(BaseModel):
    """Schéma pour les résultats d'une explication XAI."""
    model_config = ConfigDict(from_attributes=True)
    
    id: uuid.UUID
    status: RequestStatus
    explanation_type: ExplanationType
    method_used: Optional[ExplanationMethod] = None
    audience_level: AudienceLevel
    
    # Résultats techniques
    shap_values: Optional[Dict[str, Any]] = None
    lime_explanation: Optional[Dict[str, Any]] = None
    visualizations: Optional[Dict[str, Any]] = None
    
    # Explication textuelle
    text_explanation: Optional[str] = None
    
    # Métadonnées
    processing_time_seconds: Optional[float] = None
    completed_at: Optional[datetime] = None

# === MODÈLES POUR LE CHAT ===

class ChatSessionCreate(BaseModel):
    """Schéma pour créer une nouvelle session de chat."""
    explanation_request_id: uuid.UUID
    language: str = Field(default="fr", pattern="^(fr|en)$")
    max_questions: int = Field(default=5, ge=1, le=10)

class ChatSessionRead(BaseModel):
    """Schéma pour lire une session de chat."""
    model_config = ConfigDict(from_attributes=True)
    
    id: uuid.UUID
    user_id: uuid.UUID
    explanation_request_id: uuid.UUID
    language: str
    max_questions: int
    questions_count: int
    is_active: bool
    status: str
    created_at: datetime
    updated_at: datetime
    last_activity: datetime

class ChatMessageCreate(BaseModel):
    """Schéma pour créer un nouveau message de chat."""
    chat_session_id: uuid.UUID
    message_type: MessageType
    content: str = Field(min_length=1, max_length=2000)

class ChatMessageRead(BaseModel):
    """Schéma pour lire un message de chat."""
    model_config = ConfigDict(from_attributes=True)
    
    id: uuid.UUID
    chat_session_id: uuid.UUID
    message_type: MessageType
    content: str
    message_order: int
    tokens_used: Optional[int] = None
    response_time_seconds: Optional[float] = None
    algorithm_used: Optional[str] = None
    context_data: Optional[Dict[str, Any]] = None
    created_at: datetime

class UserQuestionRequest(BaseModel):
    """Schéma pour une question utilisateur dans le chat."""
    question: str = Field(min_length=1, max_length=500)
    context_data: Optional[Dict[str, Any]] = None  # 🎯 NOUVEAU: Contexte ML pour réponses personnalisées

class AIResponseRead(BaseModel):
    """Schéma pour une réponse de l'IA."""
    model_config = {"protected_namespaces": ()}  # 🔧 FIX: Désactiver protection namespace pour model_used
    
    response: str
    tokens_used: int
    response_time_seconds: float
    model_used: str  # ✅ Champ correct pour identifier le modèle GPT utilisé
    can_ask_more: bool
    remaining_questions: int

# === MODÈLES POUR LES ARTEFACTS ===

class ExplanationArtifactCreate(BaseModel):
    """Schéma pour créer un artefact d'explication."""
    explanation_request_id: uuid.UUID
    artifact_type: str
    file_name: str
    file_path: str
    file_size_bytes: Optional[int] = None
    mime_type: str
    description: Optional[str] = None
    is_primary: bool = False
    display_order: int = 0

class ExplanationArtifactRead(BaseModel):
    """Schéma pour lire un artefact d'explication."""
    model_config = ConfigDict(from_attributes=True)
    
    id: uuid.UUID
    explanation_request_id: uuid.UUID
    artifact_type: str
    file_name: str
    file_path: str
    file_size_bytes: Optional[int] = None
    mime_type: str
    description: Optional[str] = None
    is_primary: bool
    display_order: int
    created_at: datetime

# === MODÈLES COMPLEXES ===

class ExplanationRequestWithResults(ExplanationRequestRead):
    """Schéma complet avec les résultats et artefacts."""
    artifacts: List[ExplanationArtifactRead] = []
    chat_session: Optional[ChatSessionRead] = None

class ExplanationSummary(BaseModel):
    """Résumé d'une explication pour l'affichage rapide."""
    id: uuid.UUID
    explanation_type: ExplanationType
    method_used: Optional[ExplanationMethod] = None
    audience_level: AudienceLevel
    status: RequestStatus
    progress: int
    created_at: datetime
    has_text_explanation: bool
    has_visualizations: bool
    can_chat: bool

# === MODÈLES POUR LES PRÉFÉRENCES UTILISATEUR ===

class UserExplanationPreferences(BaseModel):
    """Préférences utilisateur pour les explications."""
    ai_familiarity: int = Field(ge=1, le=5, description="Niveau de familiarité avec l'IA (1=novice, 5=expert)")
    education_level: Optional[str] = None
    preferred_language: str = Field(default="fr", pattern="^(fr|en)$")
    explanation_detail_level: str = Field(default="intermediate")
    prefer_visual: bool = True
    prefer_technical_terms: bool = False

# === MODÈLES POUR LES MÉTRIQUES ===

class ExplanationMetrics(BaseModel):
    """Métriques sur les explications générées."""
    total_requests: int
    completed_requests: int
    failed_requests: int
    average_processing_time: float
    most_used_method: str
    success_rate: float

class UserEngagementMetrics(BaseModel):
    """Métriques d'engagement utilisateur avec les explications."""
    total_chat_sessions: int
    average_questions_per_session: float
    most_common_question_types: List[str]
    user_satisfaction_indicators: Dict[str, Any]

# === MODÈLES DE RÉPONSE D'API ===

class ExplanationRequestResponse(BaseModel):
    """Réponse standard pour les requêtes d'explication."""
    success: bool
    message: str
    request_id: Optional[uuid.UUID] = None
    estimated_completion_time: Optional[int] = None  # en secondes

class ErrorResponse(BaseModel):
    """Modèle de réponse d'erreur."""
    error: str
    detail: Optional[str] = None
    request_id: Optional[uuid.UUID] = None

class HealthCheck(BaseModel):
    """Réponse pour le health check du service."""
    status: str = "healthy"
    timestamp: datetime
    version: str
    dependencies: Dict[str, str]  # status des dépendances (DB, Redis, etc.)
