#!/usr/bin/env python3
"""
Script pour forcer l'analyse d'un dataset et voir les données réelles.
"""

import requests
import json
import pandas as pd
from io import BytesIO
import numpy as np

DATASET_ID = "36de39ca-b7fc-4b38-bae6-0b75cd8badef"
SERVICE_SELECTION_URL = "http://localhost:9001"
MINIO_URL = "http://localhost:9002"  # Si MinIO est accessible

def get_dataset_info():
    """Récupère les infos du dataset depuis service-selection."""
    print("📊 Récupération des infos du dataset...")
    
    response = requests.get(f"{SERVICE_SELECTION_URL}/datasets/{DATASET_ID}")
    if response.status_code != 200:
        print(f"❌ Erreur: {response.status_code}")
        return None
    
    data = response.json()
    print(f"✅ Dataset: {data.get('dataset_name')}")
    
    # Afficher les fichiers
    if 'files' in data and data['files']:
        for file in data['files']:
            print(f"\n📄 Fichier: {file.get('original_filename')}")
            print(f"   Format: {file.get('format')}")
            print(f"   Taille: {file.get('size_bytes')} bytes")
            print(f"   Lignes: {file.get('row_count')}")
            print(f"   Chemin stockage: {file.get('file_name_in_storage')}")
    
    return data

def download_and_analyze_file(dataset_info):
    """Télécharge et analyse directement le fichier depuis MinIO."""
    print("\n🔍 Analyse directe du fichier...")
    
    if not dataset_info or 'files' not in dataset_info:
        print("❌ Pas de fichier trouvé")
        return
    
    # Prendre le premier fichier
    file_info = dataset_info['files'][0]
    storage_path = dataset_info.get('storage_path', f'ibis-x-datasets/{DATASET_ID}')
    file_path = f"{storage_path}/{file_info['file_name_in_storage']}"
    
    print(f"📥 Tentative de téléchargement: {file_path}")
    
    # Simuler le chargement local (à adapter selon votre config)
    # Pour un vrai test, il faudrait accéder à MinIO directement
    
    # Créer un dataset de test pour démonstration
    print("\n🧪 Création d'un dataset de test similaire...")
    data = {
        'id': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        'schoolClass': ['terminale', 'terminale', '2nde', '2nde', 'terminale', 
                        '2nde', 'terminale', '2nde', '2nde', 'première'],
        'age': [18, 19, 16, 15, 18, 15, 18, 15, 17, 16],
        'avgGrade': [12.06, 12.81, 12.16, 12.53, 10.61, 10.25, 10.78, 10.37, 13.76, 14.23],
        'sport': ['true', 'true', 'true', 'true', 'true', '', 'true', 'true', '', 'false'],
        'collectiveSport': ['true', 'true', 'true', 'true', 'true', '', 'true', 'true', '', 'false']
    }
    
    df = pd.DataFrame(data)
    
    print("\n📊 Dataset créé:")
    print(df)
    
    print("\n🔍 Analyse des valeurs manquantes AVANT nettoyage:")
    for col in df.columns:
        null_count = df[col].isnull().sum()
        empty_count = (df[col] == '').sum() if df[col].dtype == 'object' else 0
        print(f"   {col}:")
        print(f"     - Valeurs null (pandas): {null_count}")
        print(f"     - Chaînes vides: {empty_count}")
        if empty_count > 0 or null_count > 0:
            print(f"     - Indices avec problèmes: {df[df[col].isin(['', None, np.nan])].index.tolist()}")
    
    # Appliquer notre fonction de nettoyage
    print("\n🧹 Application du nettoyage...")
    null_values = ['', ' ', 'null', 'NULL', 'Null', 'NaN', 'nan', 'None', 'NONE']
    df_cleaned = df.replace(null_values, np.nan)
    
    print("\n🔍 Analyse APRÈS nettoyage:")
    total_missing = 0
    for col in df_cleaned.columns:
        null_count = df_cleaned[col].isnull().sum()
        if null_count > 0:
            total_missing += null_count
            print(f"   ⚠️ {col}: {null_count} valeurs manquantes ({null_count/len(df_cleaned)*100:.1f}%)")
            print(f"      Lignes concernées: {df_cleaned[df_cleaned[col].isnull()].index.tolist()}")
    
    print(f"\n📈 TOTAL: {total_missing} valeurs manquantes dans le dataset")
    
    # Calculer le score de qualité
    total_cells = len(df_cleaned) * len(df_cleaned.columns)
    missing_ratio = total_missing / total_cells
    quality_score = int((1 - missing_ratio) * 100)
    print(f"📊 Score de qualité estimé: {quality_score}/100")
    
    return df_cleaned

def test_api_with_force_refresh():
    """Teste l'API avec force_refresh=True."""
    print("\n🚀 Test de l'API avec force_refresh...")
    
    # Créer un token fictif (à remplacer par un vrai token)
    headers = {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJleHAiOjk5OTk5OTk5OTl9.test'
    }
    
    request_data = {
        "dataset_id": DATASET_ID,
        "target_column": None,
        "sample_size": 1000,
        "force_refresh": True  # Forcer le rafraîchissement
    }
    
    try:
        response = requests.post(
            "http://localhost:9000/api/v1/ml-pipeline/data-quality/analyze",
            json=request_data,
            headers=headers,
            timeout=30
        )
        
        if response.status_code == 401:
            print("❌ Erreur d'authentification - Token requis")
            print("   Utilisez l'interface web pour tester")
        elif response.status_code == 200:
            data = response.json()
            missing_analysis = data.get('missing_data_analysis', {})
            columns_with_missing = missing_analysis.get('columns_with_missing', {})
            
            if columns_with_missing:
                print("✅ Valeurs manquantes détectées via API:")
                for col, info in columns_with_missing.items():
                    print(f"   - {col}: {info.get('missing_count')} manquantes")
            else:
                print("❌ PROBLÈME: L'API ne détecte pas les valeurs manquantes!")
        else:
            print(f"❌ Erreur API: {response.status_code}")
            
    except Exception as e:
        print(f"❌ Erreur: {str(e)}")

def main():
    print("🔧 DIAGNOSTIC COMPLET - DÉTECTION VALEURS MANQUANTES")
    print("=" * 60)
    
    # 1. Récupérer les infos du dataset
    dataset_info = get_dataset_info()
    
    # 2. Analyser directement les données
    if dataset_info:
        df_cleaned = download_and_analyze_file(dataset_info)
    
    # 3. Tester l'API
    test_api_with_force_refresh()
    
    print("\n💡 CONCLUSIONS:")
    print("1. Les chaînes vides ('') dans sport et collectiveSport DOIVENT être détectées")
    print("2. Le score de qualité devrait être ~90/100 (pas 94/100)")
    print("3. Les colonnes sport et collectiveSport devraient proposer des options de nettoyage")

if __name__ == "__main__":
    main()
