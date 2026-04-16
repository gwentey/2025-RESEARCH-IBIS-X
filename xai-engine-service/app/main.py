from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware  
from fastapi.responses import JSONResponse
import logging
import uuid
from datetime import datetime
import traceback

from .core.config import get_settings
from .endpoints.explanations import router as explanations_router
from .database import create_tables
from .schemas import HealthCheck, ErrorResponse

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Récupération des paramètres
settings = get_settings()

# Création de l'application FastAPI
app = FastAPI(
    title="XAI Engine Service",
    description="Service d'explicabilité pour les modèles de machine learning IBIS-X",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    # ✅ FIX CRITIQUE : Désactiver les redirects automatiques FastAPI
    redirect_slashes=False
)

# Configuration CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Middleware de gestion d'erreurs globale
@app.middleware("http")
async def error_handling_middleware(request: Request, call_next):
    """Middleware pour la gestion centralisée des erreurs."""
    try:
        response = await call_next(request)
        return response
    except Exception as e:
        logger.error(f"Erreur non gérée dans {request.method} {request.url}: {e}")
        logger.error(traceback.format_exc())
        
        return JSONResponse(
            status_code=500,
            content=ErrorResponse(
                error="Erreur interne du serveur",
                detail=str(e) if settings.debug else "Une erreur inattendue s'est produite"
            ).model_dump()
        )

# Middleware de logging des requêtes
@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    """Middleware pour logger les requêtes."""
    start_time = datetime.now()
    
    # Log de la requête entrante
    logger.info(f"🔄 {request.method} {request.url} - Début")
    
    response = await call_next(request)
    
    # Log de la réponse
    process_time = (datetime.now() - start_time).total_seconds()
    logger.info(f"✅ {request.method} {request.url} - {response.status_code} - {process_time:.3f}s")
    
    return response

# Inclusion des routeurs
app.include_router(explanations_router)

# Endpoints de santé et d'information
@app.get("/health", response_model=HealthCheck)
async def health_check():
    """Endpoint de vérification de santé du service."""
    return HealthCheck(
        status="healthy",
        timestamp=datetime.utcnow(),
        version="1.0.0",
        dependencies={
            "database": "connected",
            "redis": "connected",
            "storage": "available",
            "openai": "configured" if settings.openai_api_key else "not_configured"
        }
    )

@app.get("/")
async def root():
    """Endpoint racine avec informations sur le service."""
    return {
        "service": "XAI Engine Service",
        "version": "1.0.0",
        "description": "Service d'explicabilité pour les modèles de machine learning IBIS-X",
        "documentation": "/docs",
        "health": "/health",
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/info")
async def service_info():
    """Informations détaillées sur le service."""
    return {
        "service": {
            "name": "XAI Engine Service",
            "version": "1.0.0",
            "environment": settings.environment,
            "debug_mode": settings.debug
        },
        "capabilities": {
            "explanation_methods": ["SHAP", "LIME"],
            "supported_models": ["Random Forest", "Decision Tree"],
            "task_types": ["Classification", "Régression"],
            "audience_levels": ["Novice", "Intermédiaire", "Expert"],
            "languages": ["Français", "Anglais"]
        },
        "limits": {
            "max_concurrent_explanations": settings.max_concurrent_explanations,
            "explanation_timeout_minutes": settings.explanation_timeout_minutes,
            "max_chat_questions": settings.max_chat_questions,
            "max_dataset_size_mb": settings.max_dataset_size_mb
        },
        "integrations": {
            "llm_service": "OpenAI GPT",
            "storage_backend": settings.storage_backend,
            "database": "PostgreSQL",
            "message_broker": "Redis"
        }
    }

# ✅ CRITIQUE: Inclure le router des explications
app.include_router(explanations_router, prefix="/explanations", tags=["explanations"])

# Endpoint public d'artefacts supprimé - visualisations non nécessaires

# Events de démarrage et d'arrêt
@app.on_event("startup")
async def startup_event():
    """Actions à effectuer au démarrage du service."""
    logger.info("🚀 Démarrage du service XAI Engine")
    
    # Créer les tables si elles n'existent pas
    try:
        await create_tables()
        logger.info("✅ Tables de base de données vérifiées/créées")
    except Exception as e:
        logger.error(f"❌ Erreur création tables: {e}")
    
    # Vérifier les dépendances critiques
    if not settings.openai_api_key:
        logger.warning("⚠️  Clé API OpenAI non configurée - Les explications textuelles ne fonctionneront pas")
    
    logger.info(f"✅ Service XAI Engine démarré sur l'environnement {settings.environment}")

@app.on_event("shutdown")
async def shutdown_event():
    """Actions à effectuer à l'arrêt du service."""
    logger.info("🛑 Arrêt du service XAI Engine")
    
    # Nettoyer les ressources si nécessaire
    # TODO: Fermer les connexions, arrêter les tâches en cours, etc.
    
    logger.info("✅ Service XAI Engine arrêté proprement")

# Gestion des erreurs spécifiques
@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    """Gestionnaire pour les erreurs 404."""
    return JSONResponse(
        status_code=404,
        content=ErrorResponse(
            error="Ressource introuvable",
            detail=f"L'endpoint {request.method} {request.url} n'existe pas"
        ).model_dump()
    )

@app.exception_handler(422)
async def validation_exception_handler(request: Request, exc):
    """Gestionnaire pour les erreurs de validation."""
    return JSONResponse(
        status_code=422,
        content=ErrorResponse(
            error="Erreur de validation",
            detail="Les données fournies ne respectent pas le format attendu"
        ).model_dump()
    )

if __name__ == "__main__":
    import uvicorn
    
    logger.info("🚀 Lancement direct du service XAI Engine")
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
        log_level="info" if not settings.debug else "debug"
    )
