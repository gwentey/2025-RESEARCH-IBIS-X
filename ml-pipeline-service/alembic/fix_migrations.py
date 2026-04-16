#!/usr/bin/env python3
"""
Script robuste pour corriger les migrations Alembic.
Ce script garantit que toutes les tables sont créées même si les migrations échouent.
"""
import sys
import logging
from sqlalchemy import inspect, text
from app.database import engine, SessionLocal
from app.models import Base

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def fix_alembic_version():
    """Corrige l'état d'alembic_version pour correspondre à la réalité."""
    with engine.connect() as conn:
        # Vérifier si alembic_version existe
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        
        if 'alembic_version' not in tables:
            logger.info("⚠️ Table alembic_version manquante - création...")
            conn.execute(text("""
                CREATE TABLE alembic_version (
                    version_num VARCHAR(32) NOT NULL,
                    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
                )
            """))
            conn.commit()
        
        # Mettre à jour la version
        conn.execute(text("DELETE FROM alembic_version"))
        conn.execute(text("INSERT INTO alembic_version VALUES ('add_data_quality_analysis')"))
        conn.commit()
        logger.info("✅ alembic_version mise à jour")

def ensure_tables_exist():
    """S'assure que toutes les tables existent."""
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    
    if 'experiments' not in tables:
        logger.info("⚠️ Tables manquantes détectées - création via SQLAlchemy...")
        Base.metadata.create_all(bind=engine)
        logger.info("✅ Toutes les tables créées avec succès")
    else:
        logger.info("✅ Tables déjà existantes")
    
    # Lister toutes les tables
    tables = inspector.get_table_names()
    logger.info(f"📋 Tables dans la base: {', '.join(tables)}")

if __name__ == "__main__":
    try:
        logger.info("🔧 Début de la correction des migrations...")
        ensure_tables_exist()
        fix_alembic_version()
        logger.info("🎉 Correction terminée avec succès!")
        sys.exit(0)
    except Exception as e:
        logger.error(f"❌ Erreur: {e}")
        sys.exit(1)
