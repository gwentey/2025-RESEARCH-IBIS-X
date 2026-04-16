from pydantic_settings import BaseSettings
from typing import Optional
import os

class Settings(BaseSettings):
    """Configuration pour le service XAI Engine."""
    
    # === SERVICE CONFIGURATION ===
    app_name: str = "XAI Engine Service"
    app_version: str = "1.0.0"
    debug: bool = False
    environment: str = "development"
    
    # === DATABASE ===
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/ibis_x"
    echo_sql: bool = False
    
    # === REDIS & CELERY ===
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/0"
    
    # === OPENAI API (GPT-5 Era) ===
    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-5-mini"  # Recommandation : équilibre entre performance et coût
    openai_max_tokens: int = 2000
    openai_temperature: float = 0.7
    openai_reasoning_effort: str = "medium"  # NOTE: Non supporté par API chat.completions actuelle - pour future API responses
    
    # === STORAGE ===
    storage_backend: str = "minio"  # "minio" ou "azure"
    storage_endpoint_url: Optional[str] = "http://localhost:9000"
    storage_access_key: Optional[str] = "minioadmin"
    storage_secret_key: Optional[str] = "minioadmin"
    storage_container_name: str = "ibis-x-xai-artifacts"
    
    # Azure Blob Storage (si utilisé)
    azure_storage_connection_string: Optional[str] = None
    azure_storage_account_name: Optional[str] = None
    azure_storage_account_key: Optional[str] = None
    
    # === XAI CONFIGURATION ===
    shap_max_display_features: int = 20
    lime_num_features: int = 10
    lime_num_samples: int = 1000
    max_explanation_instances: int = 100
    
    # === CHAT CONFIGURATION ===
    max_chat_questions: int = 5
    chat_session_timeout_hours: int = 24
    max_tokens_per_question: int = 200
    
    # === PROCESSING LIMITS ===
    max_concurrent_explanations: int = 5
    explanation_timeout_minutes: int = 30
    max_dataset_size_mb: int = 500
    
    # === SERVICES COMMUNICATION ===
    ml_pipeline_service_url: str = "http://ml-pipeline:8082"  # 🔧 FIX: Nom correct du service K8s
    api_gateway_url: str = "http://api-gateway:9000"
    
    # === SECURITY ===
    allowed_origins: list = ["*"]
    jwt_secret_key: Optional[str] = None
    jwt_algorithm: str = "HS256"
    
    class Config:
        env_file = ".env"
        case_sensitive = False

# Instance globale des paramètres
settings = Settings()

def get_settings() -> Settings:
    """Récupère l'instance des paramètres."""
    return settings
