#!/usr/bin/env python3
"""
Script de migration personnalisé pour XAI Engine.
Ce script gère les conflits de migration entre services et assure
une migration propre des tables XAI.
"""

import os
import sys
import logging
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.exc import ProgrammingError
from app.core.config import get_settings
from app.models import Base

# Configuration du logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_database_url():
    """Récupère l'URL de la base de données."""
    settings = get_settings()
    # Convertir l'URL async en URL sync
    url = settings.database_url.replace("+asyncpg", "")
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg2://")
    return url

def clean_alembic_state(engine):
    """Nettoie l'état Alembic pour éviter les conflits."""
    try:
        with engine.connect() as conn:
            # Vérifier si la table alembic_version existe
            inspector = inspect(engine)
            if 'alembic_version' in inspector.get_table_names():
                # Supprimer toutes les révisions XAI existantes
                xai_revisions = [
                    'add_data_quality_analysis',
                    'xai_base_migration', 
                    'xai_initial_base',
                    'a7d9a070fb25'
                ]
                
                for revision in xai_revisions:
                    try:
                        result = conn.execute(
                            text("DELETE FROM alembic_version WHERE version_num = :revision"),
                            {"revision": revision}
                        )
                        if result.rowcount > 0:
                            logger.info(f"Supprimé la révision conflictuelle: {revision}")
                    except Exception as e:
                        logger.warning(f"Erreur lors de la suppression de {revision}: {e}")
                
                # Ajouter notre révision de base
                try:
                    conn.execute(
                        text("INSERT INTO alembic_version (version_num) VALUES (:revision)"),
                        {"revision": "001_initial_xai"}
                    )
                    logger.info("Ajouté la révision de base XAI: 001_initial_xai")
                except Exception as e:
                    logger.info(f"Révision 001_initial_xai déjà présente: {e}")
                
                conn.commit()
            else:
                logger.info("Table alembic_version n'existe pas encore")
                
    except Exception as e:
        logger.error(f"Erreur lors du nettoyage de l'état Alembic: {e}")
        raise

def create_xai_tables(engine):
    """Crée les tables XAI si elles n'existent pas."""
    try:
        inspector = inspect(engine)
        existing_tables = inspector.get_table_names()
        
        xai_tables = ['explanation_requests', 'chat_sessions', 'chat_messages', 'explanation_artifacts']
        missing_tables = [table for table in xai_tables if table not in existing_tables]
        
        if missing_tables:
            logger.info(f"Création des tables manquantes: {missing_tables}")
            # Créer toutes les tables définies dans les modèles
            Base.metadata.create_all(engine)
            logger.info("✅ Tables XAI créées avec succès")
        else:
            logger.info("✅ Toutes les tables XAI existent déjà")
            
    except Exception as e:
        logger.error(f"Erreur lors de la création des tables: {e}")
        raise

def main():
    """Fonction principale de migration."""
    logger.info("🚀 Début de la migration XAI Engine...")
    
    try:
        # Récupérer l'URL de la base de données
        database_url = get_database_url()
        logger.info(f"Connexion à la base de données...")
        
        # Créer le moteur de base de données
        engine = create_engine(database_url)
        
        # Tester la connexion
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("✅ Connexion à la base de données réussie")
        
        # Étape 1: Nettoyer l'état Alembic
        logger.info("🧹 Nettoyage de l'état Alembic...")
        clean_alembic_state(engine)
        
        # Étape 2: Créer les tables XAI
        logger.info("🏗️ Création des tables XAI...")
        create_xai_tables(engine)
        
        logger.info("✅ Migration XAI terminée avec succès!")
        return 0
        
    except Exception as e:
        logger.error(f"❌ Erreur lors de la migration: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
