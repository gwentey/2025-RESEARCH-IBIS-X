#!/usr/bin/env python3
"""
Script pour réparer les migrations Alembic en cas de conflit.
Ce script nettoie l'état des migrations et remet à jour la table alembic_version.
"""

import os
import sys
import psycopg2
from sqlalchemy import create_engine, text
from alembic.config import Config
from alembic import command

def get_database_url():
    """Récupère l'URL de la base de données depuis les variables d'environnement."""
    return os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/ibis_x_db')

def fix_alembic_version_table():
    """
    Nettoie et répare la table alembic_version pour éviter les conflits entre services.
    """
    database_url = get_database_url()
    engine = create_engine(database_url)
    
    try:
        with engine.connect() as conn:
            # Vérifier l'état actuel des migrations
            result = conn.execute(text("SELECT version_num FROM alembic_version ORDER BY version_num;"))
            current_versions = [row[0] for row in result.fetchall()]
            print(f"Versions actuelles dans alembic_version: {current_versions}")
            
            # Supprimer les versions en conflit si elles existent
            conflicting_versions = ['add_data_quality_analysis']
            for version in conflicting_versions:
                if version in current_versions:
                    print(f"Suppression de la version en conflit: {version}")
                    conn.execute(text("DELETE FROM alembic_version WHERE version_num = :version"), 
                               {"version": version})
            
            # Ajouter la version de base XAI si elle n'existe pas
            xai_base_version = 'xai_base_migration'
            if xai_base_version not in current_versions:
                print(f"Ajout de la version de base XAI: {xai_base_version}")
                conn.execute(text("INSERT INTO alembic_version (version_num) VALUES (:version)"), 
                           {"version": xai_base_version})
            
            conn.commit()
            print("✅ Table alembic_version réparée avec succès")
            
    except Exception as e:
        print(f"❌ Erreur lors de la réparation: {e}")
        return False
    
    return True

def stamp_alembic_head():
    """
    Marque la migration actuelle comme étant à jour (stamp head).
    """
    try:
        # Configuration Alembic
        alembic_cfg = Config("alembic.ini")
        
        # Marquer comme étant à jour
        command.stamp(alembic_cfg, "head")
        print("✅ Migrations marquées comme à jour")
        return True
        
    except Exception as e:
        print(f"❌ Erreur lors du stamp: {e}")
        return False

def main():
    """Fonction principale pour réparer les migrations."""
    print("🔧 Début de la réparation des migrations XAI Engine...")
    
    # Étape 1: Réparer la table alembic_version
    if not fix_alembic_version_table():
        sys.exit(1)
    
    # Étape 2: Marquer les migrations comme à jour
    if not stamp_alembic_head():
        sys.exit(1)
    
    print("✅ Réparation des migrations terminée avec succès!")
    print("Vous pouvez maintenant relancer le déploiement.")

if __name__ == "__main__":
    main()
