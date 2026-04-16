from celery import Celery
from .config import get_settings
import logging

logger = logging.getLogger(__name__)
settings = get_settings()

# Configuration de Celery - CORRECTION: Utiliser le même nom que ML Pipeline
celery_app = Celery(
    "ibis_x_cluster",  # ✅ NOM UNIFIÉ pour tous les services
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=['app.tasks', 'app.tasks_precalculated']  # Import des tâches normales ET optimisées
)

# ✅ CORRECTION: Configuration robuste de découverte et reconnection
celery_app.conf.update(
    # Broker connection configuration (pour Celery 6.0+ compatibility)
    broker_connection_retry_on_startup=True,
    broker_connection_retry=True,
    broker_connection_max_retries=10,
    
    # ✅ SOLUTION DURABLE: Configuration robuste pour découverte workers
    worker_enable_remote_control=True,
    worker_send_task_events=True,
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=100,
    
    # ✅ Amélioration discovery et heartbeat
    broker_heartbeat=30,
    broker_heartbeat_checkrate=2.0,
    
    # ✅ Configuration robuste du transport Redis
    broker_transport_options={
        'fanout_prefix': True,
        'fanout_patterns': True,
        'visibility_timeout': 3600,
        'retry_on_timeout': True,
        'connection_pool_kwargs': {
            'max_connections': 20,
            'retry_on_timeout': True
        }
    },
)

# Configuration de Celery
celery_app.conf.update(
    # Sérialisation
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    
    # Gestion des tâches
    task_track_started=True,
    task_time_limit=settings.explanation_timeout_minutes * 60,  # 30 min par défaut
    task_soft_time_limit=(settings.explanation_timeout_minutes - 5) * 60,  # 25 min
    worker_prefetch_multiplier=1,
    
    # Queues spécialisées
    task_routes={
        'app.tasks.generate_explanation_task': {'queue': 'xai_queue'},
        'app.tasks.process_shap_explanation': {'queue': 'xai_queue'},
        'app.tasks.process_lime_explanation': {'queue': 'xai_queue'},
        'app.tasks.generate_llm_explanation': {'queue': 'xai_queue'},  
        'app.tasks.process_chat_question': {'queue': 'xai_queue'},
        # 🆕 Tâche optimisée pour SHAP pré-calculé
        'app.tasks.generate_explanation_with_precalculated_shap': {'queue': 'xai_queue'},
    },
    
    # Retry configuration
    task_default_retry_delay=60,  # 1 minute
    task_max_retries=3,
    
    # Monitoring
    worker_send_task_events=True,
    task_send_sent_event=True,
)

# Logger pour Celery
logger.info(f"Celery configuré avec broker: {settings.celery_broker_url}")
logger.info(f"Celery configuré avec backend: {settings.celery_result_backend}")

def get_celery_app():
    """Récupère l'instance de l'app Celery."""
    return celery_app
