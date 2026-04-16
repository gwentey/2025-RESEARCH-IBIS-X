from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import sessionmaker
from .core.config import get_settings
from .models import Base
import logging

logger = logging.getLogger(__name__)

# Configuration de la base de données
settings = get_settings()

# Moteur de base de données asyncrone
engine = create_async_engine(
    settings.database_url,
    echo=settings.echo_sql,
    pool_pre_ping=True,
    pool_recycle=300,
)

# Créateur de sessions asynchrones
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

# Dépendance pour obtenir une session de base de données
async def get_database():
    """Générateur de session de base de données pour les dépendances FastAPI."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception as e:
            logger.error(f"Database session error: {e}")
            await session.rollback()
            raise
        finally:
            await session.close()

async def create_tables():
    """Créer toutes les tables en base de données."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
async def drop_tables():
    """Supprimer toutes les tables en base de données."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

# Session synchrone pour Celery (qui ne supporte pas async)
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Convertir l'URL async en URL sync pour Celery
sync_database_url = settings.database_url.replace("+asyncpg", "")
if sync_database_url.startswith("postgresql://"):
    sync_database_url = sync_database_url.replace("postgresql://", "postgresql+psycopg2://")

sync_engine = create_engine(
    sync_database_url,
    echo=settings.echo_sql,
    pool_pre_ping=True,
    pool_recycle=300,
)

SyncSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=sync_engine
)

def get_sync_database():
    """Générateur de session synchrone pour Celery."""
    session = SyncSessionLocal()
    try:
        yield session
    except Exception as e:
        logger.error(f"Sync database session error: {e}")
        session.rollback()
        raise
    finally:
        session.close()

def get_sync_session():
    """Obtenir une session synchrone directe (pour Celery)."""
    return SyncSessionLocal()
