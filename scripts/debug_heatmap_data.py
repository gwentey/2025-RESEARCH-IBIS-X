#!/usr/bin/env python3
"""
Script de debug pour analyser les données utilisées par la heatmap.

Ce script teste directement les endpoints API pour comprendre d'où viennent 
les valeurs affichées dans la heatmap (45% vs 100% éthique).
"""

import requests
import json
from pathlib import Path

def debug_heatmap_data():
    """Debug des données de la heatmap."""
    
    print("🔍 DEBUG DONNÉES HEATMAP ASAP ESSAY")
    print("=" * 50)
    
    # Configuration API (ajustez selon votre setup)
    api_base = "http://localhost:8081"  # service-selection
    
    try:
        # Test 1: Lister tous les datasets
        print("📋 Test 1: Liste des datasets...")
        response = requests.get(f"{api_base}/datasets", timeout=5)
        
        if response.status_code == 200:
            datasets = response.json()
            print(f"✅ {len(datasets.get('datasets', []))} datasets trouvés")
            
            # Chercher asap_essay_scoring
            asap_dataset = None
            for dataset in datasets.get('datasets', []):
                if 'asap' in dataset.get('dataset_name', '').lower():
                    asap_dataset = dataset
                    print(f"🎯 Trouvé: {dataset['dataset_name']}")
                    break
            
            if not asap_dataset:
                print("❌ Dataset ASAP non trouvé dans l'API")
                return
                
        else:
            print(f"❌ Erreur API liste datasets: {response.status_code}")
            return
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Erreur connexion API: {e}")
        print("🔄 Services pas démarrés ? Essayez: skaffold dev")
        return
    
    # Test 2: Détails du dataset
    dataset_id = asap_dataset.get('id')
    print(f"\n📊 Test 2: Détails dataset {dataset_id}...")
    
    try:
        response = requests.get(f"{api_base}/datasets/{dataset_id}/details", timeout=5)
        
        if response.status_code == 200:
            details = response.json()
            
            # Analyser les scores
            quality_metrics = details.get('quality_metrics', {})
            
            print("🏷️  Scores API:")
            print(f"   Complétude: {quality_metrics.get('completeness', 'N/A')}%")
            print(f"   Consistance: {quality_metrics.get('consistency', 'N/A')}%") 
            print(f"   Précision: {quality_metrics.get('accuracy', 'N/A')}%")
            print(f"   Score Global: {quality_metrics.get('overall_score', 'N/A')}%")
            print(f"   Score Éthique: {quality_metrics.get('ethical_score', 'N/A')}%")
            
            # Analyser les critères éthiques détaillés  
            print(f"\n🔍 Critères éthiques détaillés:")
            
            # Chercher les critères dans les détails
            if 'ethical_details' in details:
                for key, value in details['ethical_details'].items():
                    status = "✅" if value else "❌"
                    print(f"   {status} {key}: {value}")
            
        else:
            print(f"❌ Erreur détails dataset: {response.status_code}")
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Erreur connexion détails: {e}")
    
    # Test 3: Recommandations avec critères
    print(f"\n🎯 Test 3: Recommandations dataset...")
    
    try:
        # Simuler une requête de recommandation comme le ferait le frontend
        criteria = [
            {"criterion_name": "ethical_score", "weight": 1.0}
        ]
        
        payload = {
            "criteria": criteria,
            "max_results": 10
        }
        
        response = requests.post(f"{api_base}/datasets/recommendations", 
                                json=payload, timeout=5)
        
        if response.status_code == 200:
            recommendations = response.json()
            
            # Chercher notre dataset dans les recommandations
            for dataset in recommendations.get('datasets', []):
                if dataset.get('dataset_name') == asap_dataset.get('dataset_name'):
                    print(f"🎯 Dataset dans recommandations:")
                    print(f"   Nom: {dataset.get('dataset_name')}")
                    print(f"   Score Global: {dataset.get('final_score', 'N/A')}")
                    
                    # Scores par critère si disponibles
                    criterion_scores = dataset.get('criterion_scores', {})
                    if criterion_scores:
                        print(f"   Scores par critère:")
                        for criterion, score in criterion_scores.items():
                            score_pct = f"{score*100:.0f}%" if isinstance(score, (int, float)) else score
                            print(f"     {criterion}: {score_pct}")
                    
                    break
        else:
            print(f"❌ Erreur recommandations: {response.status_code}")
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Erreur connexion recommandations: {e}")
    
    # Test 4: Comparer avec fichier JSON
    print(f"\n📄 Test 4: Comparaison fichier JSON...")
    
    json_path = Path("datasets/kaggle-import/enriched_metadata/asap_essay_scoring.json")
    if json_path.exists():
        with open(json_path, 'r') as f:
            json_data = json.load(f)
            
        json_quality = json_data.get('quality_metrics', {})
        json_ethical = json_data.get('ethical_compliance', {})
        
        print(f"📄 Scores JSON enrichi:")
        print(f"   Complétude: {json_quality.get('completeness_score', 'N/A')}%")
        print(f"   Consistance: {json_quality.get('consistency_score', 'N/A')}%")
        print(f"   Éthique: {json_quality.get('ethical_compliance_score', 'N/A')}%")
        
        # Compter les critères éthiques True
        true_count = sum(1 for v in json_ethical.values() if v is True)
        total_count = len(json_ethical)
        calculated_ethical = (true_count / total_count * 100) if total_count > 0 else 0
        
        print(f"   Éthique calculé: {calculated_ethical:.0f}% ({true_count}/{total_count})")
    
    print(f"\n✅ Debug terminé !")
    print(f"🔧 Si les valeurs API diffèrent du JSON, redémarrez les services")

if __name__ == "__main__":
    debug_heatmap_data()
