#!/usr/bin/env python3
"""
Script simple pour tester la détection des valeurs manquantes via l'API.
"""

import requests
import json
import sys

def test_data_quality_api(dataset_id):
    """Teste l'analyse de qualité via l'API."""
    
    # URL de l'API
    api_url = "http://localhost:9000/api/v1/ml-pipeline/data-quality/analyze"
    
    # Préparer la requête
    request_data = {
        "dataset_id": dataset_id,
        "target_column": None,
        "sample_size": 1000,
        "force_refresh": True  # Forcer le rafraîchissement pour ignorer le cache
    }
    
    print(f"🔍 Test de détection des valeurs manquantes")
    print(f"   Dataset ID: {dataset_id}")
    print(f"   URL: {api_url}")
    print("=" * 60)
    
    try:
        # Appeler l'API
        response = requests.post(api_url, json=request_data, timeout=30)
        
        if response.status_code != 200:
            print(f"❌ Erreur HTTP {response.status_code}")
            print(f"   Détails: {response.text}")
            return
        
        # Analyser la réponse
        data = response.json()
        
        # Score de qualité
        score = data.get('data_quality_score', 0)
        print(f"\n📊 Score de qualité: {score}/100")
        
        # Analyse des données manquantes
        missing_analysis = data.get('missing_data_analysis', {})
        columns_with_missing = missing_analysis.get('columns_with_missing', {})
        
        total_missing = 0
        if columns_with_missing:
            print(f"\n⚠️ COLONNES AVEC DONNÉES MANQUANTES:")
            print("-" * 40)
            for col_name, col_info in columns_with_missing.items():
                missing_count = col_info.get('missing_count', 0)
                missing_pct = col_info.get('missing_percentage', 0)
                total_missing += missing_count
                print(f"   📋 {col_name}:")
                print(f"      - Valeurs manquantes: {missing_count} ({missing_pct}%)")
                print(f"      - Type de données: {col_info.get('data_type')}")
                
                # Stratégie recommandée
                strategy = col_info.get('recommended_strategy', {})
                if strategy:
                    print(f"      - Stratégie recommandée: {strategy.get('strategy')}")
                    if strategy.get('reason'):
                        print(f"        Raison: {strategy.get('reason')}")
        else:
            print(f"\n✅ Aucune donnée manquante détectée")
        
        # Résumé
        print(f"\n📈 RÉSUMÉ:")
        print(f"   - Total colonnes: {missing_analysis.get('total_columns', 0)}")
        print(f"   - Total lignes: {missing_analysis.get('total_rows', 0)}")
        print(f"   - Colonnes avec manquants: {len(columns_with_missing)}")
        print(f"   - Total valeurs manquantes: {total_missing}")
        
        # Types de colonnes
        column_types = data.get('column_types', {})
        print(f"\n📊 TYPES DE COLONNES:")
        for type_name, cols in column_types.items():
            if cols:
                print(f"   - {type_name}: {', '.join(cols)}")
        
        # Recommandations
        recommendations = data.get('preprocessing_recommendations', {})
        if recommendations.get('missing_values'):
            print(f"\n💡 RECOMMANDATIONS POUR VALEURS MANQUANTES:")
            mv_rec = recommendations['missing_values']
            print(f"   - Action: {mv_rec.get('action')}")
            print(f"   - Priorité: {mv_rec.get('priority')}")
            if mv_rec.get('strategies'):
                print(f"   - Stratégies par colonne:")
                for col, strat in mv_rec['strategies'].items():
                    print(f"     • {col}: {strat}")
        
        return data
        
    except requests.exceptions.Timeout:
        print("❌ Timeout - l'analyse prend trop de temps")
    except requests.exceptions.ConnectionError:
        print("❌ Erreur de connexion - vérifiez que le service est démarré")
    except Exception as e:
        print(f"❌ Erreur inattendue: {str(e)}")
    
    return None

def main():
    """Fonction principale."""
    # Récupérer l'ID du dataset depuis les arguments ou utiliser un ID par défaut
    if len(sys.argv) > 1:
        dataset_id = sys.argv[1]
    else:
        print("⚠️ Usage: python test_missing_detection_api.py <dataset_id>")
        print("   Utilisation d'un ID de test par défaut...")
        dataset_id = "test-dataset-id"  # Remplacer par un vrai ID
    
    # Tester l'API
    result = test_data_quality_api(dataset_id)
    
    if result:
        print("\n✅ Test terminé avec succès")
        
        # Sauvegarder le résultat pour analyse
        with open('/tmp/data_quality_result.json', 'w') as f:
            json.dump(result, f, indent=2)
        print("   Résultat sauvegardé dans /tmp/data_quality_result.json")
    else:
        print("\n❌ Test échoué")

if __name__ == "__main__":
    main()
