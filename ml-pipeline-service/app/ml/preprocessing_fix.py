"""
Module de correction pour la détection des valeurs manquantes.
À intégrer dans preprocessing.py
"""

import pandas as pd
import numpy as np
import logging

logger = logging.getLogger(__name__)

def clean_dataset_for_analysis(df: pd.DataFrame) -> pd.DataFrame:
    """
    Nettoie un dataset avant l'analyse en convertissant toutes les variantes
    de valeurs manquantes en vraies valeurs NaN.
    
    Args:
        df: DataFrame à nettoyer
        
    Returns:
        DataFrame avec valeurs manquantes normalisées
    """
    # Liste exhaustive des valeurs à considérer comme manquantes
    missing_values = [
        '',            # Chaîne vide (LE PLUS IMPORTANT)
        ' ',           # Espace seul
        '  ',          # Espaces multiples
        '\t',          # Tab
        '\n',          # Nouvelle ligne
        'null',        # null minuscule
        'NULL',        # null majuscule
        'Null',        # null capitalisé
        'NaN',         # NaN standard
        'nan',         # nan minuscule
        'NAN',         # NAN majuscule
        'None',        # None Python
        'NONE',        # NONE majuscule
        'none',        # none minuscule
        'undefined',   # undefined JavaScript
        'UNDEFINED',   # UNDEFINED majuscule
        'N/A',         # Not Available
        'n/a',         # n/a minuscule
        'NA',          # NA court
        'na',          # na minuscule
        '#N/A',        # Excel N/A
        '#NA',         # Excel NA
        '#NULL!',      # Excel NULL
        '?',           # Parfois utilisé pour manquant
        '-',           # Tiret parfois utilisé
        '--',          # Double tiret
        'missing',     # missing explicite
        'Missing',     # Missing capitalisé
        'MISSING'      # MISSING majuscule
    ]
    
    # Compter les valeurs avant nettoyage
    original_nulls = df.isnull().sum().sum()
    
    # Remplacer toutes ces valeurs par NaN
    df_cleaned = df.replace(missing_values, np.nan)
    
    # Pour les colonnes de type object, traiter aussi les espaces
    for col in df_cleaned.select_dtypes(include=['object']).columns:
        # Supprimer les espaces au début et à la fin
        df_cleaned[col] = df_cleaned[col].str.strip()
        # Remplacer les chaînes vides après strip par NaN
        df_cleaned[col] = df_cleaned[col].replace('', np.nan)
    
    # Compter après nettoyage
    cleaned_nulls = df_cleaned.isnull().sum().sum()
    
    if cleaned_nulls > original_nulls:
        logger.info(f"✅ Nettoyage effectué: {original_nulls} → {cleaned_nulls} valeurs null")
        for col in df_cleaned.columns:
            original_col_nulls = df[col].isnull().sum()
            cleaned_col_nulls = df_cleaned[col].isnull().sum()
            if cleaned_col_nulls > original_col_nulls:
                logger.info(f"   {col}: {original_col_nulls} → {cleaned_col_nulls} valeurs null")
    
    return df_cleaned


def enhanced_analyze_missing_data(df: pd.DataFrame) -> dict:
    """
    Version améliorée de l'analyse des données manquantes qui nettoie d'abord le dataset.
    
    Args:
        df: DataFrame à analyser
        
    Returns:
        Dict avec analyse complète des valeurs manquantes
    """
    # IMPORTANT: Nettoyer d'abord le dataset
    df_clean = clean_dataset_for_analysis(df)
    
    missing_analysis = {
        'total_rows': len(df_clean),
        'total_columns': len(df_clean.columns),
        'columns_with_missing': {},
        'total_missing_values': 0,
        'missing_patterns': {},
        'recommendations': {},
        'severity_assessment': {}
    }
    
    total_missing = 0
    
    # Analyse par colonne
    for column in df_clean.columns:
        missing_count = df_clean[column].isnull().sum()
        missing_percentage = (missing_count / len(df_clean)) * 100
        
        if missing_count > 0:
            total_missing += missing_count
            
            # Déterminer le type de données
            if df_clean[column].dtype == 'object':
                # Pour les colonnes object, vérifier si c'est booléen
                non_null_values = df_clean[column].dropna().unique()
                is_boolean = len(non_null_values) <= 2 and all(
                    str(val).lower() in ['true', 'false', '1', '0', 'yes', 'no', 'oui', 'non'] 
                    for val in non_null_values
                )
                data_type = 'boolean' if is_boolean else 'categorical'
            else:
                data_type = 'numerical'
            
            column_analysis = {
                'missing_count': int(missing_count),
                'missing_percentage': round(missing_percentage, 2),
                'data_type': data_type,
                'unique_values': int(df_clean[column].nunique()) if not df_clean[column].isnull().all() else 0,
                'is_categorical': data_type in ['categorical', 'boolean'],
                'is_boolean': data_type == 'boolean'
            }
            
            # Recommandations spécifiques pour les booléens
            if data_type == 'boolean':
                column_analysis['recommended_strategies'] = [
                    {'strategy': 'drop', 'label': 'Supprimer les lignes'},
                    {'strategy': 'fill_true', 'label': 'Remplacer par true'},
                    {'strategy': 'fill_false', 'label': 'Remplacer par false'},
                    {'strategy': 'fill_mode', 'label': 'Remplacer par la valeur la plus fréquente'}
                ]
            elif data_type == 'categorical':
                column_analysis['recommended_strategies'] = [
                    {'strategy': 'drop', 'label': 'Supprimer les lignes'},
                    {'strategy': 'fill_mode', 'label': 'Remplacer par la valeur la plus fréquente'},
                    {'strategy': 'fill_unknown', 'label': 'Remplacer par "Inconnu"'}
                ]
            else:  # numerical
                column_analysis['recommended_strategies'] = [
                    {'strategy': 'drop', 'label': 'Supprimer les lignes'},
                    {'strategy': 'fill_mean', 'label': 'Remplacer par la moyenne'},
                    {'strategy': 'fill_median', 'label': 'Remplacer par la médiane'},
                    {'strategy': 'interpolate', 'label': 'Interpolation linéaire'}
                ]
            
            missing_analysis['columns_with_missing'][column] = column_analysis
    
    missing_analysis['total_missing_values'] = total_missing
    
    # Calculer la sévérité
    total_cells = len(df_clean) * len(df_clean.columns)
    missing_ratio = total_missing / total_cells if total_cells > 0 else 0
    
    if missing_ratio == 0:
        severity = 'none'
    elif missing_ratio < 0.01:
        severity = 'minimal'
    elif missing_ratio < 0.05:
        severity = 'low'
    elif missing_ratio < 0.15:
        severity = 'moderate'
    elif missing_ratio < 0.30:
        severity = 'high'
    else:
        severity = 'critical'
    
    missing_analysis['severity_assessment'] = {
        'level': severity,
        'missing_ratio': round(missing_ratio * 100, 2),
        'recommendation': get_severity_recommendation(severity)
    }
    
    return missing_analysis


def get_severity_recommendation(severity: str) -> str:
    """Retourne une recommandation basée sur la sévérité."""
    recommendations = {
        'none': 'Aucune valeur manquante détectée. Dataset prêt pour l\'analyse.',
        'minimal': 'Très peu de valeurs manquantes. Suppression des lignes recommandée.',
        'low': 'Quelques valeurs manquantes. Stratégies simples d\'imputation recommandées.',
        'moderate': 'Nombre modéré de valeurs manquantes. Analyse approfondie et imputation avancée recommandées.',
        'high': 'Beaucoup de valeurs manquantes. Considérer l\'exclusion de certaines colonnes ou techniques avancées.',
        'critical': 'Trop de valeurs manquantes. Le dataset nécessite un nettoyage majeur ou peut ne pas être utilisable.'
    }
    return recommendations.get(severity, 'Analyse manuelle recommandée.')
