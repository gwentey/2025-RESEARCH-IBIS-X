#!/usr/bin/env python3
"""
Script pour déboguer la réponse de l'API et voir pourquoi les valeurs manquantes ne sont pas affichées.
"""

import sys
import os
sys.path.append('/Applications/XAMPP/xamppfiles/htdocs/2025-research-exai/ml-pipeline-service')

from app.ml.preprocessing import analyze_dataset_quality
import pandas as pd
import numpy as np
import json

def test_analysis():
    """Test direct de l'analyse."""
    print("🔍 TEST DIRECT DE L'ANALYSE")
    print("=" * 60)
    
    # Créer un dataset de test avec des valeurs manquantes
    data = {
        'id': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        'schoolClass': ['terminale', 'terminale', '2nde', '2nde', 'terminale', 
                        '2nde', 'terminale', '2nde', '2nde', 'première'],
        'age': [18, 19, 16, 15, 18, 15, 18, 15, 17, 16],
        'avgGrade': [12.06, 12.81, 12.16, 12.53, 10.61, 10.25, 10.78, 10.37, 13.76, 14.23],
        'sport': [True, True, True, True, True, None, True, True, None, False],
        'collectiveSport': [True, True, True, True, True, None, True, True, None, False]
    }
    
    df = pd.DataFrame(data)
    
    print("📊 Dataset de test créé:")
    print(f"   Shape: {df.shape}")
    print(f"   Colonnes: {list(df.columns)}")
    
    # Compter les valeurs manquantes réelles
    print("\n🔍 Valeurs manquantes RÉELLES dans le DataFrame:")
    for col in df.columns:
        null_count = df[col].isnull().sum()
        if null_count > 0:
            print(f"   ⚠️ {col}: {null_count} valeurs null")
    
    # Analyser avec la fonction
    print("\n🧪 Analyse avec analyze_dataset_quality()...")
    result = analyze_dataset_quality(df)
    
    # Afficher les résultats
    print("\n📈 RÉSULTATS DE L'ANALYSE:")
    print(f"   Score de qualité: {result.get('data_quality_score')}/100")
    
    missing_data = result.get('missing_data_analysis', {})
    print(f"\n📊 Analyse des données manquantes:")
    print(f"   Total lignes: {missing_data.get('total_rows')}")
    print(f"   Total colonnes: {missing_data.get('total_columns')}")
    
    columns_with_missing = missing_data.get('columns_with_missing', {})
    if columns_with_missing:
        print(f"   ✅ Colonnes avec données manquantes: {len(columns_with_missing)}")
        for col_name, col_info in columns_with_missing.items():
            print(f"\n   📋 {col_name}:")
            print(f"      - Manquantes: {col_info.get('missing_count')} ({col_info.get('missing_percentage')}%)")
            print(f"      - Type: {col_info.get('data_type')}")
            print(f"      - Catégorielle: {col_info.get('is_categorical')}")
    else:
        print(f"   ❌ PROBLÈME: Aucune colonne avec données manquantes détectée!")
    
    # Sauvegarder le résultat complet
    with open('/tmp/analysis_result.json', 'w') as f:
        # Convertir en JSON en gérant les NaN
        def convert_nan(obj):
            if isinstance(obj, dict):
                return {k: convert_nan(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [convert_nan(item) for item in obj]
            elif isinstance(obj, float) and np.isnan(obj):
                return None
            return obj
        
        json.dump(convert_nan(result), f, indent=2)
        print(f"\n💾 Résultat complet sauvegardé dans /tmp/analysis_result.json")
    
    return result

def test_data_quality_analyzer():
    """Test direct de DataQualityAnalyzer."""
    print("\n🔬 TEST DIRECT DE DataQualityAnalyzer")
    print("=" * 60)
    
    from app.ml.preprocessing import DataQualityAnalyzer
    
    # Créer un dataset simple
    data = {
        'id': [1, 2, 3, 4, 5],
        'sport': [True, None, False, None, True],
        'collectiveSport': [True, None, None, False, None]
    }
    
    df = pd.DataFrame(data)
    
    print("📊 Dataset simple:")
    print(df)
    
    analyzer = DataQualityAnalyzer()
    result = analyzer.analyze_missing_data(df)
    
    print(f"\n📈 Résultat de l'analyseur:")
    print(f"   Colonnes avec manquants: {list(result['columns_with_missing'].keys())}")
    for col, info in result['columns_with_missing'].items():
        print(f"   {col}: {info['missing_count']} manquants ({info['missing_percentage']}%)")

if __name__ == "__main__":
    # Test 1: Analyse complète
    analysis_result = test_analysis()
    
    # Test 2: Analyseur direct
    test_data_quality_analyzer()
    
    print("\n✅ Tests terminés")
    print("\n💡 VÉRIFICATIONS À FAIRE:")
    print("1. Les valeurs manquantes sont-elles détectées dans l'analyse ?")
    print("2. Le score de qualité est-il ajusté en fonction des manquants ?")
    print("3. Les colonnes 'sport' et 'collectiveSport' apparaissent-elles dans columns_with_missing ?")
