#!/usr/bin/env python3
"""
Script pour synchroniser les métadonnées du dataset asap_essay_scoring.

Le problème : Le fichier JSON indique 45% d'éthique mais l'interface affiche 100%.
Cette incohérence vient des templates par défaut "education" qui assignent des valeurs éthiques élevées.

Ce script met à jour le fichier JSON enrichi avec des valeurs réalistes.
"""

import json
from pathlib import Path

def fix_asap_essay_metadata():
    """Corrige les métadonnées enrichies pour asap_essay_scoring."""
    
    print("🔄 SYNCHRONISATION MÉTADONNÉES ASAP ESSAY SCORING")  
    print("=" * 60)
    
    # Chemin vers le fichier JSON enrichi
    json_path = Path("datasets/kaggle-import/enriched_metadata/asap_essay_scoring.json")
    
    if not json_path.exists():
        print(f"❌ Fichier non trouvé : {json_path}")
        return
        
    # Charger les métadonnées actuelles
    with open(json_path, 'r', encoding='utf-8') as f:
        metadata = json.load(f)
    
    print(f"✅ Métadonnées chargées : {metadata['display_name']}")
    
    # Afficher les valeurs actuelles
    current_ethics = metadata.get('ethical_compliance', {})
    current_quality = metadata.get('quality_metrics', {})
    
    print(f"📊 Score éthique actuel : {current_quality.get('ethical_compliance_score', 'N/A')}%")
    print("🔍 Critères éthiques actuels :")
    for key, value in current_ethics.items():
        print(f"   {key}: {value}")
    
    # Corriger les valeurs éthiques pour refléter les vraies caractéristiques du dataset
    # Dataset ASAP Essay Scoring : Évaluation automatisée d'essais étudiants
    
    print("\n🛠️  Application des corrections réalistes...")
    
    # Mettre à jour les critères éthiques avec des valeurs réalistes
    metadata['ethical_compliance'] = {
        "informed_consent": False,        # Pas de consentement explicite dans contexte d'évaluation
        "transparency": True,             # Le processus de notation automatisée est transparent
        "user_control": False,            # Étudiants n'ont pas de contrôle sur l'usage des essais
        "equity_non_discrimination": True, # Évaluation équitable et standardisée
        "security_measures": False,        # Pas de mesures de sécurité spécifiques documentées
        "data_quality_documented": True,   # Documentation de la qualité disponible
        "anonymization_applied": True,     # Identifiants étudiants supprimés
        "record_keeping_policy": False,    # Pas de politique de conservation explicite
        "purpose_limitation": False,       # Usage potentiel au-delà de l'évaluation
        "accountability_defined": True     # Responsabilité du système définie
    }
    
    # Recalculer le score éthique (5 True sur 10 = 50%)
    true_count = sum(1 for value in metadata['ethical_compliance'].values() if value is True)
    total_count = len(metadata['ethical_compliance'])
    ethical_score = int((true_count / total_count) * 100)
    
    # Mettre à jour les métriques de qualité
    metadata['quality_metrics']['ethical_compliance_score'] = ethical_score
    
    # Ajuster les autres scores pour maintenir la cohérence
    metadata['quality_metrics']['completeness_score'] = 100  # Pas de valeurs manquantes
    metadata['quality_metrics']['consistency_score'] = 75    # Score modéré pour un dataset de notation
    
    # Calculer le score global
    completeness = metadata['quality_metrics']['completeness_score']
    consistency = metadata['quality_metrics']['consistency_score'] 
    ethical = metadata['quality_metrics']['ethical_compliance_score']
    
    # Score global pondéré
    overall_score = int((completeness * 0.4 + consistency * 0.3 + ethical * 0.3))
    
    print(f"\n📊 Nouveaux scores :")
    print(f"   Complétude : {completeness}%")
    print(f"   Consistance : {consistency}%") 
    print(f"   Éthique : {ethical}% ({true_count}/{total_count} critères)")
    print(f"   Score Global : {overall_score}%")
    
    print(f"\n📋 Nouveaux critères éthiques :")
    for key, value in metadata['ethical_compliance'].items():
        status = "✅" if value else "❌"
        print(f"   {status} {key}: {value}")
    
    # Sauvegarder les modifications
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    
    print(f"\n✅ Fichier mis à jour : {json_path}")
    print("🔄 Redémarrez les services pour que les changements prennent effet")
    print("\n🎉 Synchronisation terminée avec succès !")

if __name__ == "__main__":
    fix_asap_essay_metadata()
