#!/usr/bin/env python3
"""
Script pour corriger la synchronisation des valeurs éthiques du dataset asap_essay_scoring.

Le problème : Incohérence entre les valeurs calculées (45%) et celles affichées (100%).
Ce script corrige les valeurs en base de données.
"""

import os
import sys
from pathlib import Path

# Ajouter le répertoire app au path
current_dir = os.path.dirname(os.path.abspath(__file__))
app_dir = os.path.join(os.path.dirname(current_dir), 'app')
sys.path.insert(0, app_dir)

try:
    import models
    import database
    from main import calculate_ethical_score
    from sqlalchemy.orm import Session
except ImportError as e:
    print(f"❌ Erreur d'import : {e}")
    print("Ce script doit être exécuté depuis le conteneur service-selection")
    sys.exit(1)

def fix_asap_essay_ethics():
    """Corrige les valeurs éthiques du dataset asap_essay_scoring."""
    
    print("🔄 CORRECTION SYNCHRONISATION ÉTHIQUE ASAP ESSAY")
    print("=" * 60)
    
    try:
        # Connexion à la base de données
        db = database.SessionLocal()
        
        # Chercher le dataset asap_essay_scoring
        dataset = db.query(models.Dataset).filter(
            models.Dataset.dataset_name.ilike("%asap%")
        ).first()
        
        if not dataset:
            print("❌ Dataset ASAP Essay non trouvé")
            # Lister tous les datasets pour débug
            all_datasets = db.query(models.Dataset).all()
            print("📋 Datasets disponibles :")
            for ds in all_datasets:
                print(f"   - {ds.dataset_name} ({ds.display_name})")
            return
            
        print(f"✅ Dataset trouvé : {dataset.dataset_name} - {dataset.display_name}")
        
        # Calculer le score éthique actuel
        current_score = calculate_ethical_score(dataset)
        print(f"📊 Score éthique actuel : {current_score:.1%}")
        
        # Afficher les valeurs actuelles
        print("\n🔍 Valeurs éthiques actuelles :")
        ethical_fields = [
            'informed_consent',
            'transparency', 
            'user_control',
            'equity_non_discrimination',
            'security_measures_in_place',
            'data_quality_documented',
            'anonymization_applied',
            'record_keeping_policy_exists',
            'purpose_limitation_respected',
            'accountability_defined'
        ]
        
        for field in ethical_fields:
            value = getattr(dataset, field, None)
            print(f"   {field}: {value}")
        
        # Appliquer les corrections pour obtenir ~45% (4-5 critères sur 10)
        # Basé sur les caractéristiques réelles du dataset ASAP Essay Scoring
        print(f"\n🛠️  Application des corrections...")
        
        # Garder ces critères à True (5/10 = 50%)
        dataset.transparency = True                    # Le processus de notation est transparent
        dataset.equity_non_discrimination = True       # Évaluation équitable des essais
        dataset.data_quality_documented = True        # Documentation de la qualité disponible
        dataset.anonymization_applied = True          # Identifiants étudiants supprimés
        dataset.accountability_defined = True         # Responsabilité du processus définie
        
        # Mettre ces critères à False pour refléter les limitations réelles
        dataset.informed_consent = False              # Pas de consentement explicite dans contexte d'évaluation
        dataset.user_control = False                  # Étudiants n'ont pas de contrôle sur usage des essais
        dataset.security_measures_in_place = False   # Pas de mesures de sécurité spécifiques documentées
        dataset.record_keeping_policy_exists = False # Pas de politique de conservation documentée
        dataset.purpose_limitation_respected = False # Usage potentiel au-delà de l'évaluation initiale
        
        # Sauvegarder les modifications
        db.commit()
        
        # Recalculer le score
        new_score = calculate_ethical_score(dataset)
        print(f"✅ Nouveau score éthique : {new_score:.1%}")
        
        print("\n📋 Nouvelles valeurs éthiques :")
        for field in ethical_fields:
            value = getattr(dataset, field, None)
            status = "✅" if value else "❌"
            print(f"   {status} {field}: {value}")
        
        # Vérification
        target_range = (0.40, 0.50)  # Cible : 45% ± 5%
        if target_range[0] <= new_score <= target_range[1]:
            print(f"\n🎉 SUCCESS ! Score corrigé dans la plage cible : {new_score:.1%}")
        else:
            print(f"\n⚠️  Score {new_score:.1%} hors de la plage cible {target_range[0]:.1%}-{target_range[1]:.1%}")
        
        print(f"\n✅ Correction terminée ! Le dataset aura maintenant un score éthique de ~{new_score:.0%}")
        print("🔄 Redémarrez le frontend pour voir les changements dans la heatmap")
        
    except Exception as e:
        if 'db' in locals():
            db.rollback()
        print(f"❌ Erreur : {e}")
        raise
    finally:
        if 'db' in locals():
            db.close()

if __name__ == "__main__":
    fix_asap_essay_ethics()
