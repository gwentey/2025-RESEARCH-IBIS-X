#!/usr/bin/env python3
"""
Script de débogage pour analyser pourquoi les valeurs manquantes ne sont pas détectées.
"""

import pandas as pd
import numpy as np
import requests
import json
from io import BytesIO
import sys
import os

# Configuration
DATASET_ID = "e0c7c3e8-8e3f-4b3f-9c3f-3f3f3f3f3f3f"  # Remplacer par l'ID réel du dataset
SERVICE_SELECTION_URL = "http://localhost:9001"
ML_PIPELINE_URL = "http://localhost:9000"

def check_raw_data():
    """Vérifie les données brutes depuis le service."""
    print("🔍 ANALYSE DES DONNÉES BRUTES")
    print("=" * 60)
    
    # 1. Récupérer les infos du dataset
    try:
        response = requests.get(f"{SERVICE_SELECTION_URL}/datasets/{DATASET_ID}")
        if response.status_code != 200:
            print(f"❌ Erreur récupération dataset: {response.status_code}")
            return None
        
        dataset_info = response.json()
        print(f"✅ Dataset trouvé: {dataset_info.get('dataset_name')}")
        
        # Afficher les colonnes
        if 'files' in dataset_info and dataset_info['files']:
            for file in dataset_info['files']:
                print(f"\n📄 Fichier: {file.get('original_filename')}")
                if 'columns' in file and file['columns']:
                    print(f"   Colonnes ({len(file['columns'])}):")
                    for col in file['columns']:
                        print(f"     - {col.get('column_name')}: {col.get('data_type_interpreted')} | Nullable: {col.get('is_nullable')}")
                        if col.get('example_values'):
                            print(f"       Exemples: {col.get('example_values')[:5]}")
        
        return dataset_info
        
    except Exception as e:
        print(f"❌ Erreur: {str(e)}")
        return None

def test_data_quality_analysis():
    """Teste l'analyse de qualité des données."""
    print("\n🧪 TEST ANALYSE DE QUALITÉ")
    print("=" * 60)
    
    # Préparer la requête
    request_data = {
        "dataset_id": DATASET_ID,
        "target_column": None,
        "sample_size": 1000,
        "force_refresh": True  # Forcer le rafraîchissement
    }
    
    try:
        # Appeler l'API d'analyse
        response = requests.post(
            f"{ML_PIPELINE_URL}/api/v1/ml-pipeline/data-quality/analyze",
            json=request_data
        )
        
        if response.status_code != 200:
            print(f"❌ Erreur analyse: {response.status_code}")
            print(f"   Détails: {response.text}")
            return None
        
        analysis = response.json()
        
        # Afficher les résultats
        print(f"✅ Analyse complétée")
        print(f"\n📊 Vue d'ensemble:")
        print(f"   Score de qualité: {analysis.get('data_quality_score')}/100")
        
        print(f"\n📋 Analyse des données manquantes:")
        missing_analysis = analysis.get('missing_data_analysis', {})
        columns_with_missing = missing_analysis.get('columns_with_missing', {})
        
        if columns_with_missing:
            print(f"   ⚠️ Colonnes avec données manquantes: {len(columns_with_missing)}")
            for col_name, col_info in columns_with_missing.items():
                print(f"     - {col_name}:")
                print(f"       Manquantes: {col_info.get('missing_count')} ({col_info.get('missing_percentage')}%)")
                print(f"       Type: {col_info.get('data_type')}")
                print(f"       Stratégie recommandée: {col_info.get('recommended_strategy', {}).get('strategy')}")
        else:
            print(f"   ✅ Aucune colonne avec données manquantes détectées")
        
        print(f"\n📊 Types de colonnes détectés:")
        column_types = analysis.get('column_types', {})
        for type_name, columns in column_types.items():
            if columns:
                print(f"   {type_name}: {columns}")
        
        return analysis
        
    except Exception as e:
        print(f"❌ Erreur lors de l'analyse: {str(e)}")
        return None

def create_test_dataset():
    """Crée un dataset de test avec des valeurs manquantes variées."""
    print("\n🔧 CRÉATION DATASET DE TEST")
    print("=" * 60)
    
    # Créer un dataset avec différents types de valeurs manquantes
    data = {
        'id': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        'sport': ['true', 'false', '', 'true', 'null', 'false', 'NaN', 'true', None, 'false'],
        'collectiveSport': ['true', '', 'false', 'null', 'true', 'NaN', 'false', None, 'true', 'false'],
        'age': [15, 16, None, 18, 19, 20, 17, None, 16, 18],
        'avgGrade': [12.5, 14.0, 15.5, None, 13.0, 16.0, 14.5, 15.0, None, 13.5]
    }
    
    df = pd.DataFrame(data)
    
    print("📄 Dataset créé:")
    print(df)
    
    print("\n🔍 Analyse pandas native:")
    for col in df.columns:
        null_count = df[col].isnull().sum()
        print(f"   {col}: {null_count} valeurs null (pandas)")
    
    # Tester notre fonction de nettoyage
    print("\n🧹 Test de la fonction de nettoyage:")
    
    # Liste des valeurs à considérer comme manquantes
    null_values = ['', ' ', 'null', 'NULL', 'Null', 'NaN', 'nan', 'None', 'NONE']
    df_cleaned = df.replace(null_values, np.nan)
    
    print("📄 Dataset après nettoyage:")
    print(df_cleaned)
    
    print("\n🔍 Analyse après nettoyage:")
    for col in df_cleaned.columns:
        null_count = df_cleaned[col].isnull().sum()
        if null_count > 0:
            print(f"   ⚠️ {col}: {null_count} valeurs null détectées")
        else:
            print(f"   ✅ {col}: aucune valeur null")
    
    # Sauvegarder en Parquet pour test
    test_file = "/tmp/test_dataset_missing.parquet"
    df.to_parquet(test_file)
    print(f"\n💾 Dataset sauvegardé: {test_file}")
    
    # Relire et analyser
    df_from_parquet = pd.read_parquet(test_file)
    print("\n📄 Dataset relu depuis Parquet:")
    print(df_from_parquet)
    
    print("\n🔍 Analyse du dataset relu:")
    for col in df_from_parquet.columns:
        null_count = df_from_parquet[col].isnull().sum()
        print(f"   {col}: {null_count} valeurs null")
    
    return df_cleaned

def test_with_local_analysis():
    """Teste l'analyse locale avec le module preprocessing."""
    print("\n🔬 TEST ANALYSE LOCALE")
    print("=" * 60)
    
    # Ajouter le chemin du module
    sys.path.append('/Applications/XAMPP/xamppfiles/htdocs/2025-research-exai/ml-pipeline-service')
    
    try:
        from app.ml.preprocessing import analyze_dataset_quality, DataQualityAnalyzer
        
        # Créer un dataset de test
        df = create_test_dataset()
        
        print("\n📊 Analyse avec le module preprocessing:")
        analysis = analyze_dataset_quality(df)
        
        print(f"   Score de qualité: {analysis.get('data_quality_score')}/100")
        
        missing_analysis = analysis.get('missing_data_analysis', {})
        columns_with_missing = missing_analysis.get('columns_with_missing', {})
        
        if columns_with_missing:
            print(f"   ⚠️ Colonnes avec données manquantes: {len(columns_with_missing)}")
            for col_name, col_info in columns_with_missing.items():
                print(f"     - {col_name}: {col_info.get('missing_count')} manquantes ({col_info.get('missing_percentage')}%)")
        else:
            print(f"   ❌ PROBLÈME: Aucune donnée manquante détectée!")
        
        # Test direct avec l'analyseur
        print("\n🔬 Test direct avec DataQualityAnalyzer:")
        analyzer = DataQualityAnalyzer()
        missing_result = analyzer.analyze_missing_data(df)
        
        print(f"   Total lignes: {missing_result.get('total_rows')}")
        print(f"   Total colonnes: {missing_result.get('total_columns')}")
        print(f"   Colonnes avec manquants: {list(missing_result.get('columns_with_missing', {}).keys())}")
        
    except Exception as e:
        print(f"❌ Erreur analyse locale: {str(e)}")

def main():
    """Fonction principale."""
    print("🔧 DIAGNOSTIC DÉTECTION VALEURS MANQUANTES")
    print("=" * 70)
    
    # 1. Vérifier les données brutes
    dataset_info = check_raw_data()
    
    # 2. Tester l'analyse de qualité via API
    if dataset_info:
        analysis = test_data_quality_analysis()
    
    # 3. Créer et tester un dataset local
    test_with_local_analysis()
    
    print("\n💡 CONCLUSIONS:")
    print("1. Vérifiez que le service ML Pipeline a bien été redémarré")
    print("2. Vérifiez les logs du service pour voir si la fonction de nettoyage est appelée")
    print("3. Le problème peut venir du fait que les valeurs sont des strings dans le Parquet")
    print("4. Il faut peut-être adapter la fonction de nettoyage pour votre cas spécifique")

if __name__ == "__main__":
    # Si un ID de dataset est passé en argument, l'utiliser
    if len(sys.argv) > 1:
        DATASET_ID = sys.argv[1]
        print(f"Utilisation du dataset ID: {DATASET_ID}")
    
    main()
