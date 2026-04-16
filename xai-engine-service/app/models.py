from sqlalchemy import Column, String, DateTime, Boolean, Integer, Float, Text, UUID, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

# Base declarative pour tous nos modèles SQLAlchemy
Base = declarative_base()

class ExplanationRequest(Base):
    """
    Modèle SQLAlchemy pour la table des demandes d'explication XAI.
    
    Cette table contient toutes les métadonnées d'une demande d'explication :
    - Configuration de la demande (type d'explication, méthode, audience)
    - Statut et progression du traitement
    - Liens vers les résultats générés
    - Informations sur l'utilisateur et ses préférences
    """
    __tablename__ = "explanation_requests"

    # === IDENTIFICATION & PK ===
    id = Column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    
    # === LIENS VERS D'AUTRES SERVICES ===
    user_id = Column(PostgreSQLUUID(as_uuid=True), nullable=False, index=True)
    experiment_id = Column(PostgreSQLUUID(as_uuid=True), nullable=False, index=True)  # Lien vers ML Pipeline
    dataset_id = Column(PostgreSQLUUID(as_uuid=True), nullable=False, index=True)
    
    # === CONFIGURATION DE L'EXPLICATION ===
    explanation_type = Column(String(20), nullable=False)  # 'global', 'local', 'feature_importance'
    method_requested = Column(String(20), nullable=True)   # Méthode demandée (optionnel)
    method_used = Column(String(20), nullable=True)        # Méthode réellement utilisée
    audience_level = Column(String(20), nullable=False)    # 'novice', 'intermediate', 'expert'
    
    # === DONNÉES SPÉCIFIQUES (si explication locale) ===
    instance_data = Column(JSONB, nullable=True)  # Données de l'instance à expliquer
    instance_index = Column(Integer, nullable=True)  # Index de l'instance dans le dataset
    
    # === CONFIGURATION UTILISATEUR ===
    user_preferences = Column(JSONB, nullable=True)  # Préférences utilisateur (familiarité IA, etc.)
    language = Column(String(5), nullable=False, default='fr')  # 'fr' ou 'en'
    
    # === PAS DE ML_CONTEXT EN DB - RÉCUPÉRATION DYNAMIQUE ===
    
    # === STATUT ET PROGRESSION ===
    status = Column(String(20), nullable=False, default='pending', index=True)  # pending, running, completed, failed
    progress = Column(Integer, nullable=True, default=0)  # Pourcentage de completion
    task_id = Column(String(100), nullable=True)  # ID de la tâche Celery
    error_message = Column(Text, nullable=True)
    
    # === RÉSULTATS ===
    shap_values = Column(JSONB, nullable=True)  # Valeurs SHAP brutes
    lime_explanation = Column(JSONB, nullable=True)  # Explication LIME brute
    visualizations = Column(JSONB, nullable=True)  # Liens vers images/graphiques
    text_explanation = Column(Text, nullable=True)  # Explication textuelle générée par LLM
    
    # === MÉTADONNÉES TECHNIQUES ===
    model_algorithm = Column(String(50), nullable=True)  # Type d'algorithme du modèle expliqué
    processing_time_seconds = Column(Float, nullable=True)  # Durée du traitement
    
    # === TIMESTAMPS ===
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime(timezone=True), nullable=True)


class ChatSession(Base):
    """
    Modèle pour les sessions de chat sur les explications XAI.
    
    Cette table gère les conversations entre l'utilisateur et le LLM
    pour poser des questions sur les résultats d'explication.
    """
    __tablename__ = "chat_sessions"
    
    # === IDENTIFICATION ===
    id = Column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(PostgreSQLUUID(as_uuid=True), nullable=False, index=True)
    explanation_request_id = Column(PostgreSQLUUID(as_uuid=True), 
                                  ForeignKey('explanation_requests.id'), 
                                  nullable=False, index=True)
    
    # === CONFIGURATION ===
    language = Column(String(5), nullable=False, default='fr')
    max_questions = Column(Integer, nullable=False, default=5)
    questions_count = Column(Integer, nullable=False, default=0)
    
    # === STATUT ===
    is_active = Column(Boolean, nullable=False, default=True)
    status = Column(String(20), nullable=False, default='active')  # active, completed, expired
    
    # === TIMESTAMPS ===
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_activity = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    
    # === RELATION ===
    explanation_request = relationship("ExplanationRequest", backref="chat_sessions")


class ChatMessage(Base):
    """
    Modèle pour les messages individuels dans une session de chat.
    
    Cette table stocke l'historique des questions/réponses
    entre l'utilisateur et le LLM.
    """
    __tablename__ = "chat_messages"
    
    # === IDENTIFICATION ===
    id = Column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    chat_session_id = Column(PostgreSQLUUID(as_uuid=True), 
                           ForeignKey('chat_sessions.id'), 
                           nullable=False, index=True)
    
    # === MESSAGE ===
    message_type = Column(String(20), nullable=False)  # 'user_question', 'ai_response', 'system'
    content = Column(Text, nullable=False)
    message_order = Column(Integer, nullable=False)  # Ordre chronologique dans la session
    
    # === MÉTADONNÉES (pour messages IA) ===
    tokens_used = Column(Integer, nullable=True)  # Nombre de tokens utilisés
    response_time_seconds = Column(Float, nullable=True)  # Temps de réponse du LLM
    model_used = Column(String(50), nullable=True)  # Modèle LLM utilisé (ex: gpt-3.5-turbo)
    
    # === CONTEXT ENRICHMENT ===
    context_data = Column(JSONB, nullable=True)  # Contexte supplémentaire pour la réponse
    
    # === TIMESTAMPS ===
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, index=True)
    
    # === RELATION ===
    chat_session = relationship("ChatSession", backref="messages")


class ExplanationArtifact(Base):
    """
    Modèle pour les artefacts générés lors des explications XAI.
    
    Cette table stocke les références vers les fichiers générés :
    images, graphiques, données intermédiaires, etc.
    """
    __tablename__ = "explanation_artifacts"
    
    # === IDENTIFICATION ===
    id = Column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    explanation_request_id = Column(PostgreSQLUUID(as_uuid=True), 
                                  ForeignKey('explanation_requests.id'), 
                                  nullable=False, index=True)
    
    # === ARTEFACT ===
    artifact_type = Column(String(50), nullable=False)  # 'shap_plot', 'lime_plot', 'feature_importance', etc.
    file_name = Column(String(200), nullable=False)
    file_path = Column(String(500), nullable=False)  # Chemin dans le stockage d'objets
    file_size_bytes = Column(Integer, nullable=True)
    mime_type = Column(String(100), nullable=False)  # image/png, application/json, etc.
    
    # === MÉTADONNÉES ===
    description = Column(String(500), nullable=True)
    is_primary = Column(Boolean, nullable=False, default=False)  # Artefact principal pour ce type
    display_order = Column(Integer, nullable=True, default=0)
    
    # === TIMESTAMPS ===
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, index=True)
    
    # === RELATION ===
    explanation_request = relationship("ExplanationRequest", backref="artifacts")
