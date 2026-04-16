#!/usr/bin/env python3
"""
Script pour extraire les VRAIES valeurs affichées sur la page de détails du dataset
et les synchroniser avec la heatmap.

Ce script analyse directement le fichier JSON enrichi pour extraire exactement 
les mêmes valeurs que celles utilisées par l'API.
"""

import json
from pathlib import Path

def extract_asap_essay_values():
    """Extrait les vraies valeurs du dataset ASAP Essay pour synchronisation."""
    
    print("🔍 EXTRACTION DES VRAIES VALEURS ASAP ESSAY SCORING")
    print("=" * 60)
    
    # Chemin vers le fichier JSON
    json_path = Path("datasets/kaggle-import/enriched_metadata/asap_essay_scoring.json")
    
    if not json_path.exists():
        print(f"❌ Fichier non trouvé : {json_path}")
        return None
        
    # Charger les données
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"✅ Dataset : {data.get('display_name', 'N/A')}")
    print(f"📋 ID dataset : {data.get('dataset_name', 'N/A')}")
    
    # Extraire les informations comme l'API les traiterait
    ethical_compliance = data.get('ethical_compliance', {})
    quality_metrics = data.get('quality_metrics', {})
    
    print(f"\n📊 MÉTRIQUES DE QUALITÉ (telles qu'affichées sur la page de détails) :")
    print(f"   Complétude : {quality_metrics.get('completeness_score', 'N/A')}%")
    print(f"   Consistance : {quality_metrics.get('consistency_score', 'N/A')}%") 
    print(f"   Conformité Éthique : {quality_metrics.get('ethical_compliance_score', 'N/A')}%")
    
    # Calculer le score global comme l'API le ferait
    completeness = quality_metrics.get('completeness_score', 0) / 100.0
    consistency = quality_metrics.get('consistency_score', 0) / 100.0
    ethical_score = quality_metrics.get('ethical_compliance_score', 0) / 100.0
    
    # Formule de calcul du score global (voir service-selection/app/main.py ligne ~1848)
    overall_score = (completeness * 0.3 + consistency * 0.25 + 0.85 * 0.25 + ethical_score * 0.2)
    
    print(f"   Score Global : {int(overall_score * 100)}%")
    
    print(f"\n🔍 CRITÈRES ÉTHIQUES DÉTAILLÉS (page de détails) :")
    ethical_mapping = {
        'informed_consent': 'Consentement éclairé',
        'transparency': 'Transparence',
        'user_control': 'Contrôle utilisateur',
        'equity_non_discrimination': 'Non-discrimination', 
        'security_measures': 'Mesures de sécurité',
        'data_quality_documented': 'Qualité documentée',
        'anonymization_applied': 'Anonymisation appliquée',
        'record_keeping_policy': 'Politique de conservation',
        'purpose_limitation': 'Limitation de finalité',
        'accountability_defined': 'Responsabilité définie'
    }
    
    ethical_true_count = 0
    for key, label in ethical_mapping.items():
        value = ethical_compliance.get(key, None)
        if value is True:
            ethical_true_count += 1
        status = "✅" if value else "❌"
        print(f"   {status} {label}: {value}")
    
    calculated_ethical = int((ethical_true_count / len(ethical_mapping)) * 100)
    print(f"\n📊 Score éthique calculé : {calculated_ethical}% ({ethical_true_count}/{len(ethical_mapping)} critères)")
    
    # Vérifier la cohérence
    stored_ethical = quality_metrics.get('ethical_compliance_score', 0)
    print(f"📊 Score éthique stocké : {stored_ethical}%")
    
    if calculated_ethical == stored_ethical:
        print("✅ Cohérence : Les scores calculé et stocké correspondent")
    else:
        print(f"⚠️  Incohérence : Calculé {calculated_ethical}% vs Stocké {stored_ethical}%")
    
    print(f"\n🎯 VALEURS À UTILISER DANS LA HEATMAP :")
    print(f"   Score Éthique : {stored_ethical}% (utiliser cette valeur exacte)")
    print(f"   Score Global : {int(overall_score * 100)}%")
    print(f"   Score Complétude : {quality_metrics.get('completeness_score', 0)}%")
    print(f"   Score Consistance : {quality_metrics.get('consistency_score', 0)}%")
    
    # Structure des données comme l'API les retournerait
    api_format = {
        'quality_metrics': {
            'overall_score': overall_score,
            'completeness': completeness, 
            'consistency': consistency,
            'ethical_score': ethical_score,
            'accuracy': 0.85  # valeur simulée comme dans l'API
        },
        'ethical_details': ethical_compliance,
        'dataset_name': data.get('dataset_name'),
        'display_name': data.get('display_name')
    }
    
    return api_format

def main():
    """Fonction principale."""
    real_data = extract_asap_essay_values()
    
    if real_data:
        print(f"\n✅ Extraction terminée !")
        print(f"🔄 Ces valeurs doivent être EXACTEMENT les mêmes dans la heatmap !")
        
        # Sauvegarder pour référence
        with open("scripts/asap_essay_real_values.json", 'w') as f:
            json.dump(real_data, f, indent=2)
        print(f"💾 Valeurs sauvegardées dans scripts/asap_essay_real_values.json")

if __name__ == "__main__":
    main()
