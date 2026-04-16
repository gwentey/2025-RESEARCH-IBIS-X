import pandas as pd
import numpy as np
import logging
from sklearn.model_selection import train_test_split

# Initialize logger
logger = logging.getLogger(__name__)
from sklearn.preprocessing import StandardScaler, OneHotEncoder, LabelEncoder, MinMaxScaler, RobustScaler
from sklearn.experimental import enable_iterative_imputer  # DOIT être importé EN PREMIER
from sklearn.impute import SimpleImputer, KNNImputer, IterativeImputer
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.ensemble import IsolationForest
from sklearn.covariance import EllipticEnvelope
from sklearn.neighbors import LocalOutlierFactor
from scipy import stats
from typing import Dict, Any, Tuple, List, Optional, Union
import warnings

warnings.filterwarnings('ignore')

# Configure logger pour ce module
logger = logging.getLogger(__name__)

class DataQualityAnalyzer:
    """Analyseur de qualité des données pour détecter les problèmes et patterns."""
    
    def __init__(self):
        self.analysis_results = {}
    
    def _clean_missing_values(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Nettoie les valeurs manquantes mal formatées dans le DataFrame.
        Convertit les chaînes vides, 'null', 'NaN', etc. en vraies valeurs NaN.
        """
        # Liste exhaustive des valeurs à considérer comme manquantes
        missing_values = [
            '',            # Chaîne vide (LE PLUS IMPORTANT pour votre cas)
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
            'missing',     # missing explicite
            'Missing',     # Missing capitalisé
            'MISSING'      # MISSING majuscule
        ]
        
        # Remplacer toutes ces valeurs par NaN
        df_cleaned = df.replace(missing_values, np.nan)
        
        # Pour les colonnes de type object, traiter aussi les espaces
        for col in df_cleaned.select_dtypes(include=['object']).columns:
            try:
                # Supprimer les espaces au début et à la fin
                df_cleaned[col] = df_cleaned[col].str.strip()
                # Remplacer les chaînes vides après strip par NaN
                df_cleaned[col] = df_cleaned[col].replace('', np.nan)
            except:
                pass  # Ignorer les erreurs sur certaines colonnes
        
        # Log des changements
        original_nulls = df.isnull().sum().sum()
        cleaned_nulls = df_cleaned.isnull().sum().sum()
        
        if cleaned_nulls > original_nulls:
            logger.info(f"✅ DataQualityAnalyzer: Nettoyage effectué - {original_nulls} → {cleaned_nulls} valeurs null détectées")
        
        return df_cleaned
    
    def analyze_missing_data(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Analyse complète des données manquantes.
        
        Returns:
            Dict avec statistiques détaillées, patterns et recommandations
        """
        # CRITICAL FIX: Nettoyer d'abord les valeurs manquantes mal formatées
        df_clean = self._clean_missing_values(df.copy())
        
        missing_analysis = {
            'total_rows': len(df_clean),
            'total_columns': len(df_clean.columns),
            'columns_with_missing': {},
            'missing_patterns': {},
            'recommendations': {},
            'severity_assessment': {}
        }
        
        # Analyse par colonne sur le DataFrame nettoyé
        for column in df_clean.columns:
            missing_count = df_clean[column].isnull().sum()
            missing_percentage = (missing_count / len(df_clean)) * 100
            
            if missing_count > 0:
                column_analysis = {
                    'missing_count': int(missing_count),
                    'missing_percentage': round(missing_percentage, 2),
                    'data_type': str(df_clean[column].dtype),
                    'unique_values': int(df_clean[column].nunique()) if not df_clean[column].isnull().all() else 0,
                    'is_categorical': df_clean[column].dtype == 'object' or df_clean[column].nunique() < 10,
                    'distribution_type': self._analyze_distribution(df_clean[column])
                }
                
                # Recommandations basées sur l'analyse
                column_analysis['recommended_strategy'] = self._recommend_strategy(
                    missing_percentage, 
                    column_analysis['is_categorical'],
                    column_analysis['distribution_type']
                )
                
                missing_analysis['columns_with_missing'][column] = column_analysis
        
        # Analyse des patterns de données manquantes
        missing_analysis['missing_patterns'] = self._analyze_missing_patterns(df_clean)
        
        # Évaluation de la sévérité globale
        missing_analysis['severity_assessment'] = self._assess_overall_severity(missing_analysis)
        
        return missing_analysis
    
    def _analyze_distribution(self, series: pd.Series) -> str:
        """Analyse le type de distribution d'une série numérique."""
        if series.dtype == 'object':
            return 'categorical'
        
        # Nettoyer les valeurs NaN pour l'analyse
        clean_series = series.dropna()
        if len(clean_series) < 10:
            return 'insufficient_data'
        
        # Test de normalité
        try:
            _, p_value = stats.normaltest(clean_series)
            if p_value > 0.05:
                return 'normal'
        except:
            pass
        
        # Test de skewness
        skewness = stats.skew(clean_series)
        if abs(skewness) < 0.5:
            return 'symmetric'
        elif skewness > 1:
            return 'right_skewed'
        elif skewness < -1:
            return 'left_skewed'
        else:
            return 'moderately_skewed'
    
    def _recommend_strategy(self, missing_percentage: float, is_categorical: bool, distribution_type: str) -> Dict[str, Any]:
        """Recommande une stratégie de traitement basée sur l'analyse."""
        recommendations = {
            'primary_strategy': '',
            'alternative_strategies': [],
            'explanation': '',
            'confidence': 0.0
        }
        
        # Règles de décision pour les recommandations
        if missing_percentage > 70:
            recommendations['primary_strategy'] = 'drop_column'
            recommendations['explanation'] = 'Trop de données manquantes (>70%) - recommandé de supprimer la colonne'
            recommendations['confidence'] = 0.9
        elif missing_percentage > 40:
            if is_categorical:
                recommendations['primary_strategy'] = 'mode_imputation'
                recommendations['alternative_strategies'] = ['create_missing_category', 'drop_column']
            else:
                recommendations['primary_strategy'] = 'knn_imputation'
                recommendations['alternative_strategies'] = ['iterative_imputation', 'drop_column']
            recommendations['explanation'] = f'Niveau élevé de données manquantes ({missing_percentage:.1f}%) - imputation sophistiquée recommandée'
            recommendations['confidence'] = 0.7
        elif missing_percentage > 15:
            if is_categorical:
                recommendations['primary_strategy'] = 'mode_imputation'
                recommendations['alternative_strategies'] = ['knn_imputation']
            else:
                if distribution_type == 'normal':
                    recommendations['primary_strategy'] = 'mean_imputation'
                    recommendations['alternative_strategies'] = ['knn_imputation', 'iterative_imputation']
                else:
                    recommendations['primary_strategy'] = 'median_imputation'
                    recommendations['alternative_strategies'] = ['knn_imputation']
            recommendations['explanation'] = f'Niveau modéré de données manquantes ({missing_percentage:.1f}%)'
            recommendations['confidence'] = 0.8
        else:
            if is_categorical:
                recommendations['primary_strategy'] = 'mode_imputation'
            else:
                if distribution_type == 'normal':
                    recommendations['primary_strategy'] = 'mean_imputation'
                else:
                    recommendations['primary_strategy'] = 'median_imputation'
            recommendations['alternative_strategies'] = ['drop_rows']
            recommendations['explanation'] = f'Faible niveau de données manquantes ({missing_percentage:.1f}%) - stratégie simple suffisante'
            recommendations['confidence'] = 0.9
        
        return recommendations
    
    def _analyze_missing_patterns(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Analyse les patterns de données manquantes entre colonnes."""
        # Matrice de corrélation des données manquantes
        missing_df = df.isnull()
        
        patterns = {
            'completely_missing_rows': int(missing_df.all(axis=1).sum()),
            'completely_missing_columns': list(missing_df.columns[missing_df.all()]),
            'correlated_missing': {}
        }
        
        # Colonnes avec des patterns de manquement corrélés
        if len(missing_df.columns) > 1:
            corr_matrix = missing_df.corr()
            high_correlations = []
            for i in range(len(corr_matrix.columns)):
                for j in range(i+1, len(corr_matrix.columns)):
                    corr_value = corr_matrix.iloc[i, j]
                    if abs(corr_value) > 0.7:  # Seuil de corrélation élevée
                        high_correlations.append({
                            'column1': corr_matrix.columns[i],
                            'column2': corr_matrix.columns[j],
                            'correlation': round(corr_value, 3)
                        })
            patterns['correlated_missing'] = high_correlations
        
        return patterns
    
    def _assess_overall_severity(self, analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Évalue la sévérité globale des problèmes de données."""
        severity = {
            'overall_score': 0,  # 0-100 (0 = aucun problème, 100 = problèmes majeurs)
            'level': 'low',  # low, medium, high, critical
            'main_issues': [],
            'action_required': False
        }
        
        columns_with_missing = analysis['columns_with_missing']
        total_columns = analysis['total_columns']
        
        if not columns_with_missing:
            severity['level'] = 'none'
            return severity
        
        # Calcul du score de sévérité
        score = 0
        critical_issues = []
        
        # Pourcentage de colonnes affectées
        affected_columns_ratio = len(columns_with_missing) / total_columns
        score += affected_columns_ratio * 30
        
        # Analyse des pourcentages de données manquantes
        high_missing_columns = sum(1 for col_data in columns_with_missing.values() 
                                 if col_data['missing_percentage'] > 40)
        if high_missing_columns > 0:
            score += (high_missing_columns / total_columns) * 40
            critical_issues.append(f"{high_missing_columns} colonne(s) avec >40% de données manquantes")
        
        # Colonnes complètement vides
        completely_empty = analysis['missing_patterns']['completely_missing_columns']
        if completely_empty:
            score += len(completely_empty) * 10
            critical_issues.append(f"{len(completely_empty)} colonne(s) complètement vide(s)")
        
        # Assignation du niveau
        if score >= 80:
            severity['level'] = 'critical'
            severity['action_required'] = True
        elif score >= 60:
            severity['level'] = 'high'
            severity['action_required'] = True
        elif score >= 30:
            severity['level'] = 'medium'
        else:
            severity['level'] = 'low'
        
        severity['overall_score'] = min(int(score), 100)
        severity['main_issues'] = critical_issues
        
        return severity

class OutlierDetector:
    """Détecteur d'outliers avec différentes méthodes."""
    
    @staticmethod
    def detect_outliers_iqr(df: pd.DataFrame, columns: List[str] = None) -> Dict[str, Any]:
        """Détection d'outliers avec la méthode IQR."""
        if columns is None:
            columns = df.select_dtypes(include=[np.number]).columns.tolist()
        
        outliers_info = {}
        
        for column in columns:
            if column in df.columns:
                try:
                    # Vérifier que la colonne contient des données numériques valides
                    column_data = df[column].dropna()
                    if len(column_data) == 0:
                        # Colonne entièrement vide, passer
                        continue
                    
                    # S'assurer que les données sont numériques
                    if column_data.dtype == 'object':
                        # Essayer de convertir en numérique
                        column_data = pd.to_numeric(column_data, errors='coerce').dropna()
                        if len(column_data) == 0:
                            # Pas de données numériques valides
                            continue
                    
                    Q1 = column_data.quantile(0.25)
                    Q3 = column_data.quantile(0.75)
                    IQR = Q3 - Q1
                    
                    lower_bound = Q1 - 1.5 * IQR
                    upper_bound = Q3 + 1.5 * IQR
                    
                    outliers_mask = (column_data < lower_bound) | (column_data > upper_bound)
                    outliers_count = outliers_mask.sum()
                except (ValueError, TypeError, AttributeError) as e:
                    # Si le calcul échoue, ignorer cette colonne pour les outliers
                    logger.warning(f"⚠️ Cannot calculate IQR for column '{column}': {str(e)} -> skipping outlier detection")
                    continue
                
                # Gérer les valeurs NaN pour la sérialisation JSON
                lower_bound_safe = float(lower_bound) if not np.isnan(lower_bound) else None
                upper_bound_safe = float(upper_bound) if not np.isnan(upper_bound) else None
                
                # Calcul sécurisé du pourcentage pour éviter division par zéro
                total_rows = len(df)
                if total_rows > 0:
                    outliers_percentage = round((outliers_count / total_rows) * 100, 2)
                else:
                    outliers_percentage = 0.0
                
                outliers_info[column] = {
                    'method': 'IQR',
                    'outliers_count': int(outliers_count),
                    'outliers_percentage': outliers_percentage,
                    'lower_bound': lower_bound_safe,
                    'upper_bound': upper_bound_safe,
                    'outliers_indices': df[outliers_mask].index.tolist()[:100]  # Limiter pour éviter JSON trop gros
                }
        
        return outliers_info
    
    @staticmethod
    def detect_outliers_zscore(df: pd.DataFrame, columns: List[str] = None, threshold: float = 3) -> Dict[str, Any]:
        """Détection d'outliers avec la méthode Z-score."""
        if columns is None:
            columns = df.select_dtypes(include=[np.number]).columns.tolist()
        
        outliers_info = {}
        
        for column in columns:
            if column in df.columns:
                try:
                    # Vérifier que la colonne est vraiment numérique avant de calculer le z-score
                    column_data = df[column].dropna()
                    if len(column_data) == 0:
                        # Colonne entièrement vide, passer
                        continue
                    
                    # S'assurer que les données sont numériques
                    if column_data.dtype == 'object':
                        # Essayer de convertir en numérique
                        column_data = pd.to_numeric(column_data, errors='coerce').dropna()
                        if len(column_data) == 0:
                            # Pas de données numériques valides
                            continue
                    
                    z_scores = np.abs(stats.zscore(column_data))
                    outliers_mask = z_scores > threshold
                    outliers_count = outliers_mask.sum()
                except (ValueError, TypeError, AttributeError) as e:
                    # Si le calcul échoue, ignorer cette colonne pour les outliers
                    logger.warning(f"⚠️ Cannot calculate z-score for column '{column}': {str(e)} -> skipping outlier detection")
                    continue
                
                # Gérer les valeurs NaN pour la sérialisation JSON
                max_zscore = float(z_scores.max()) if len(z_scores) > 0 else 0
                max_zscore_safe = max_zscore if not np.isnan(max_zscore) else 0.0
                
                # Calcul sécurisé du pourcentage pour éviter division par zéro
                total_valid = len(df.dropna())
                if total_valid > 0:
                    outliers_percentage = round((outliers_count / total_valid) * 100, 2)
                else:
                    outliers_percentage = 0.0
                
                outliers_info[column] = {
                    'method': 'Z-Score',
                    'threshold': threshold,
                    'outliers_count': int(outliers_count),
                    'outliers_percentage': outliers_percentage,
                    'max_zscore': max_zscore_safe
                }
        
        return outliers_info

def detect_column_types(df: pd.DataFrame) -> Dict[str, List[str]]:
    """
    Detect column types in the dataframe with enhanced logic
    
    Returns:
        Dict with keys 'numeric', 'categorical', 'datetime', 'target'
    """
    numeric_cols = []
    categorical_cols = []
    datetime_cols = []
    
    for col in df.columns:
        try:
            if pd.api.types.is_datetime64_any_dtype(df[col]):
                datetime_cols.append(col)
            elif pd.api.types.is_numeric_dtype(df[col]):
                # Double vérification : une colonne numérique peut contenir des NaN
                # et parfois être détectée comme object si elle contient des strings mixtes
                numeric_cols.append(col)
            else:
                # Analyse plus fine pour les colonnes 'object'
                series = df[col]
                
                # Si la colonne est entièrement NaN, la considérer comme catégorielle
                if series.isnull().all():
                    categorical_cols.append(col)
                    continue
                
                # Essayer de convertir en numérique pour détecter les colonnes mixtes
                try:
                    # Vérifier d'abord si c'est des booléens (true/false strings)
                    non_null_values = series.dropna()
                    unique_values = non_null_values.unique()
                    
                    # Si toutes les valeurs non-nulles sont des booléens string, traiter comme catégorielle
                    boolean_strings = {'true', 'false', 'True', 'False', 'TRUE', 'FALSE', '1', '0'}
                    if len(unique_values) > 0 and all(str(val).lower() in {'true', 'false', '1', '0'} for val in unique_values):
                        logger.info(f"🔍 Column '{col}' detected as boolean values -> treating as categorical")
                        categorical_cols.append(col)
                        continue
                    
                    # Si moins de 10 valeurs uniques et qu'elles semblent catégorielles, traiter comme catégorielle
                    if len(unique_values) <= 10 and any(isinstance(val, str) and not val.replace('.', '').replace('-', '').isdigit() for val in unique_values):
                        logger.info(f"🔍 Column '{col}' has few unique non-numeric values -> treating as categorical")
                        categorical_cols.append(col)
                        continue
                    
                    pd.to_numeric(non_null_values, errors='raise')
                    # Si la conversion réussit, c'est probablement numérique
                    logger.info(f"🔍 Column '{col}' detected as object but convertible to numeric -> treating as numeric")
                    numeric_cols.append(col)
                except (ValueError, TypeError):
                    # Si la conversion échoue, c'est définitivement catégorielle  
                    categorical_cols.append(col)
                    
        except Exception as e:
            # En cas d'erreur, considérer comme catégorielle par sécurité
            logger.warning(f"⚠️  Error analyzing column '{col}': {str(e)} -> treating as categorical")
            categorical_cols.append(col)
    
    return {
        'numeric': numeric_cols,
        'categorical': categorical_cols,
        'datetime': datetime_cols
    }

def handle_missing_values(df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
    """
    Handle missing values based on configuration (fonction legacy maintenue pour compatibilité)
    
    Args:
        df: Input dataframe
        config: Configuration dict with keys:
            - strategy: 'drop', 'mean', 'median', 'mode', 'forward_fill', 'knn', 'iterative'
            - threshold: float (for dropping columns with too many missing values)
            - knn_neighbors: int (for KNN imputation)
            - max_iter: int (for iterative imputation)
    """
    strategy = config.get('strategy', 'mean')
    threshold = config.get('threshold', 0.8)
    
    # Drop columns with too many missing values
    missing_ratio = df.isnull().sum() / len(df)
    cols_to_drop = missing_ratio[missing_ratio > threshold].index.tolist()
    if cols_to_drop:
        df = df.drop(columns=cols_to_drop)
    
    if strategy == 'drop':
        return df.dropna()
    elif strategy == 'forward_fill':
        return df.fillna(method='ffill')
    elif strategy == 'knn':
        # KNN imputation pour les colonnes numériques seulement
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        if len(numeric_cols) > 0:
            n_neighbors = config.get('knn_neighbors', 5)
            imputer = KNNImputer(n_neighbors=n_neighbors)
            df[numeric_cols] = imputer.fit_transform(df[numeric_cols])
    elif strategy == 'iterative':
        # Iterative imputation pour les colonnes numériques
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        if len(numeric_cols) > 0:
            max_iter = config.get('max_iter', 10)
            imputer = IterativeImputer(max_iter=max_iter, random_state=42)
            df[numeric_cols] = imputer.fit_transform(df[numeric_cols])
    
    # For other strategies, we'll handle in the pipeline
    return df

def analyze_dataset_quality(df: pd.DataFrame, target_column: str = None) -> Dict[str, Any]:
    """
    Analyse complète de la qualité du dataset avec recommandations de preprocessing.
    
    Args:
        df: DataFrame à analyser
        target_column: Nom de la colonne cible (optionnel)
    
    Returns:
        Dict avec analyses détaillées et recommandations
    """
    analyzer = DataQualityAnalyzer()
    outlier_detector = OutlierDetector()
    
    # Séparer les features du target si spécifié
    features_df = df.drop(columns=[target_column]) if target_column and target_column in df.columns else df
    
    analysis = {
        'dataset_overview': {
            'total_rows': len(df),
            'total_columns': len(df.columns),
            'memory_usage_mb': round(df.memory_usage(deep=True).sum() / 1024 / 1024, 2),
            'target_column': target_column
        },
        'column_types': detect_column_types(features_df),
        'missing_data_analysis': analyzer.analyze_missing_data(features_df),
        'outliers_analysis': {},
        'data_quality_score': 0,
        'preprocessing_recommendations': {}
    }
    
    # Analyse des outliers pour les colonnes numériques
    numeric_columns = analysis['column_types']['numeric']
    if numeric_columns:
        analysis['outliers_analysis'] = {
            'iqr_method': outlier_detector.detect_outliers_iqr(features_df, numeric_columns),
            'zscore_method': outlier_detector.detect_outliers_zscore(features_df, numeric_columns)
        }
    
    # Calcul du score de qualité global (0-100)
    analysis['data_quality_score'] = _calculate_data_quality_score(analysis)
    
    # Recommandations de preprocessing
    analysis['preprocessing_recommendations'] = _generate_preprocessing_recommendations(analysis)
    
    return analysis

def _calculate_data_quality_score(analysis: Dict[str, Any]) -> int:
    """Calcule un score de qualité des données de 0 à 100."""
    score = 100
    
    # Pénalités pour les données manquantes
    missing_severity = analysis['missing_data_analysis']['severity_assessment']['overall_score']
    score -= missing_severity * 0.5  # Maximum -50 points
    
    # Pénalités pour les outliers
    total_outliers = 0
    total_possible = analysis['dataset_overview']['total_rows']
    
    for method_results in analysis['outliers_analysis'].values():
        for col_result in method_results.values():
            if isinstance(col_result, dict) and 'outliers_percentage' in col_result:
                if col_result['outliers_percentage'] > 10:  # Si plus de 10% d'outliers
                    score -= min(col_result['outliers_percentage'], 20)  # Maximum -20 points par colonne
    
    return max(0, int(score))

def _generate_preprocessing_recommendations(analysis: Dict[str, Any]) -> Dict[str, Any]:
    """Génère des recommandations de preprocessing basées sur l'analyse."""
    recommendations = {
        'priority_actions': [],
        'missing_values_strategy': {},
        'outlier_handling': {},
        'feature_engineering': [],
        'scaling_recommendation': 'standard',  # standard, minmax, robust
        'encoding_recommendation': 'onehot'  # onehot, label, target
    }
    
    # Analyse de la sévérité des données manquantes
    missing_severity = analysis['missing_data_analysis']['severity_assessment']['level']
    
    if missing_severity in ['high', 'critical']:
        recommendations['priority_actions'].append({
            'action': 'handle_missing_values',
            'priority': 'high',
            'description': 'Traiter les données manquantes en priorité'
        })
    
    # Recommandations spécifiques par colonne pour les données manquantes
    for column, col_analysis in analysis['missing_data_analysis']['columns_with_missing'].items():
        recommended = col_analysis['recommended_strategy']
        recommendations['missing_values_strategy'][column] = {
            'strategy': recommended['primary_strategy'],
            'alternatives': recommended['alternative_strategies'],
            'confidence': recommended['confidence'],
            'explanation': recommended['explanation']
        }
    
    # Recommandations pour les outliers
    outlier_issues = []
    for method_name, method_results in analysis['outliers_analysis'].items():
        for column, result in method_results.items():
            if isinstance(result, dict) and result.get('outliers_percentage', 0) > 15:
                outlier_issues.append(column)
    
    if outlier_issues:
        recommendations['priority_actions'].append({
            'action': 'handle_outliers',
            'priority': 'medium',
            'description': f'Gérer les outliers dans {len(set(outlier_issues))} colonne(s)'
        })
        
        recommendations['outlier_handling'] = {
            'affected_columns': list(set(outlier_issues)),
            'recommended_methods': ['iqr_capping', 'zscore_removal', 'isolation_forest'],
            'explanation': 'Plusieurs colonnes contiennent des outliers significatifs'
        }
    
    # Recommandations de scaling basées sur la distribution des données
    numeric_columns = analysis['column_types']['numeric']
    if numeric_columns:
        # Analyse simple: si beaucoup de colonnes ont des échelles différentes, recommander robust scaler
        recommendations['scaling_recommendation'] = 'robust'  # Plus robuste aux outliers
    
    # Recommandations d'encoding basées sur le nombre de catégories
    categorical_columns = analysis['column_types']['categorical']
    if categorical_columns:
        # Si peu de colonnes catégorielles avec peu de catégories, onehot est OK
        # Sinon, target encoding peut être meilleur
        recommendations['encoding_recommendation'] = 'onehot'
    
    return recommendations

def preprocess_data(df: pd.DataFrame, config: Dict[str, Any]) -> Tuple:
    """
    Preprocess data for ML training
    
    Args:
        df: Input dataframe
        config: Configuration dict with keys:
            - target_column: str
            - test_size: float
            - random_state: int
            - missing_values: dict
            - scaling: bool
            - encoding: str ('onehot' or 'label')
            - task_type: str ('classification' or 'regression')
    
    Returns:
        Tuple of (X_train, X_test, y_train, y_test, preprocessing_pipeline, preprocessing_info)
        where preprocessing_info contains metadata about data modifications
    """
    # Extract configuration
    target_column = config.get('target_column', df.columns[-1])
    test_size = config.get('test_size', 0.2)
    random_state = config.get('random_state', 42)
    missing_config = config.get('missing_values', {'strategy': 'mean'})
    scaling = config.get('scaling', True)
    encoding = config.get('encoding', 'onehot')
    task_type = config.get('task_type', 'classification')
    
    # Handle missing values at dataframe level
    df = handle_missing_values(df, missing_config)
    
    # Separate features and target
    if target_column not in df.columns:
        raise ValueError(f"Target column '{target_column}' not found in dataframe")
    
    # 🔧 CORRECTION: Nettoyer explicitement les NaN dans la variable cible
    # Supprimer les lignes où la variable cible est manquante
    initial_rows = len(df)
    df_clean = df.dropna(subset=[target_column])
    removed_rows = initial_rows - len(df_clean)
    
    # Créer les métadonnées de preprocessing
    preprocessing_info = {
        'original_rows': initial_rows,
        'final_rows': len(df_clean),
        'removed_rows_missing_target': removed_rows,
        'removed_percentage': round(removed_rows/initial_rows*100, 2) if initial_rows > 0 else 0,
        'target_column': target_column,
        'data_modified': removed_rows > 0
    }
    
    if removed_rows > 0:
        logger.warning(f"⚠️  Suppression de {removed_rows} lignes avec variable cible manquante ({preprocessing_info['removed_percentage']}%)")
        preprocessing_info['warning_message'] = f"Dataset modifié : {removed_rows} lignes supprimées ({preprocessing_info['removed_percentage']}% du dataset original) à cause de valeurs manquantes dans la variable cible '{target_column}'"
    
    if len(df_clean) == 0:
        raise ValueError(f"❌ Toutes les valeurs de la variable cible '{target_column}' sont manquantes")
    
    # 🔧 CORRECTION CRITIQUE: Exclure les colonnes d'identifiant non-prédictives
    id_columns = [col for col in df_clean.columns if col.lower() in ['id', 'index', 'idx', 'row_id', 'item_id']]
    columns_to_exclude = [target_column] + id_columns
    
    if id_columns:
        logger.warning(f"🚨 EXCLUSION de colonnes d'identifiant non-prédictives: {id_columns}")
        logger.warning(f"📊 Ces colonnes ne devraient pas être utilisées pour la prédiction car elles sont artificielles")
    
    X = df_clean.drop(columns=columns_to_exclude)
    y = df_clean[target_column]
    
    # Validation: Assurer qu'il reste des features après exclusion
    if len(X.columns) == 0:
        raise ValueError(f"❌ Aucune feature restante après exclusion de {columns_to_exclude}")
    
    logger.info(f"✅ Features finales retenues: {list(X.columns)}")
    logger.info(f"🚫 Colonnes exclues: {columns_to_exclude}")
    
    # Validation finale : vérifier qu'il n'y a plus de NaN dans y
    if y.isnull().sum() > 0:
        raise ValueError(f"❌ La variable cible contient encore {y.isnull().sum()} valeurs manquantes après nettoyage")
    
    # 🔍 DEBUG: Analyser la variable cible avant encodage
    logger.info(f"🎯 TARGET VARIABLE ANALYSIS:")
    logger.info(f"📊 Target column: {target_column}")
    logger.info(f"🔤 Target dtype: {y.dtype}")
    logger.info(f"🏷️  Task type from config: {task_type}")
    logger.info(f"📈 Unique values in target: {y.nunique()}")
    logger.info(f"📋 Sample target values: {y.head().tolist()}")
    
    # 🔧 CORRECTION: Forcer la classification si la target contient des strings
    original_task_type = task_type
    if y.dtype == 'object':
        logger.info(f"🔄 Target is object type -> FORCING classification")
        task_type = 'classification'
        
    # Encode target variable for classification
    label_encoder = None
    label_classes = None
    if task_type == 'classification' and y.dtype == 'object':
        logger.info(f"🔧 Applying LabelEncoder to target variable")
        label_encoder = LabelEncoder()
        y_before = y.head().tolist()
        y = label_encoder.fit_transform(y)
        label_classes = label_encoder.classes_.tolist()
        logger.info(f"✅ Target encoded: {y_before} -> {y[:len(y_before)].tolist()}")
        logger.info(f"🏷️  Label classes: {label_classes}")
    elif task_type == 'classification':
        logger.info(f"ℹ️  Target already numeric for classification")
        # Même si déjà numérique, essayer de capturer les labels uniques
        unique_labels = np.unique(y)
        label_classes = [str(label) for label in unique_labels]
        logger.info(f"🏷️  Numeric classes detected: {label_classes}")
    else:
        logger.info(f"📊 Regression task - no target encoding needed")
        
    # 🔧 IMPORTANT: Mettre à jour le task_type dans la config si modifié
    if original_task_type != task_type:
        logger.warning(f"⚠️  Task type auto-corrected: {original_task_type} -> {task_type}")
        config['task_type'] = task_type
    
    # Detect column types avec debug détaillé
    col_types = detect_column_types(X)
    numeric_features = col_types['numeric']
    categorical_features = col_types['categorical']
    
    # 🔍 DEBUGGING : Afficher la détection des types de colonnes  
    logger.info(f"🔍 COLUMN TYPE DETECTION:")
    logger.info(f"📊 Numeric features detected: {numeric_features}")
    logger.info(f"🔤 Categorical features detected: {categorical_features}")
    logger.info(f"📅 DateTime features detected: {col_types['datetime']}")
    logger.info(f"🔍 Total features in X: {list(X.columns)}")
    
    # Vérification de cohérence - toutes les colonnes doivent être classifiées
    all_classified = set(numeric_features + categorical_features + col_types['datetime'])
    all_columns = set(X.columns)
    unclassified = all_columns - all_classified
    
    if unclassified:
        logger.warning(f"⚠️  ATTENTION: Colonnes non classifiées détectées: {list(unclassified)}")
        # Forcer les colonnes non classifiées comme catégorielles par sécurité
        for col in unclassified:
            logger.warning(f"🔧 Forcing column '{col}' as categorical (safety measure)")
            categorical_features.append(col)
    
    # Create preprocessing pipelines
    numeric_transformer = Pipeline(steps=[
        ('imputer', SimpleImputer(strategy=missing_config.get('strategy', 'mean')))
    ])
    
    if scaling:
        numeric_transformer.steps.append(('scaler', StandardScaler()))
    
    if encoding == 'onehot':
        categorical_transformer = Pipeline(steps=[
            ('imputer', SimpleImputer(strategy='constant', fill_value='missing')),
            ('onehot', OneHotEncoder(handle_unknown='ignore', sparse_output=False))
        ])
    else:
        # For label encoding, we need a custom transformer
        categorical_transformer = Pipeline(steps=[
            ('imputer', SimpleImputer(strategy='constant', fill_value='missing'))
        ])
    
    # 🔧 CORRECTION: Combine transformers sans passthrough pour éviter les colonnes non encodées
    preprocessor = ColumnTransformer(
        transformers=[
            ('num', numeric_transformer, numeric_features),
            ('cat', categorical_transformer, categorical_features)
        ],
        remainder='drop'  # 🚫 Drop any unclassified columns to prevent string->float errors
    )
    
    logger.info(f"🔧 PREPROCESSING PIPELINE CONFIGURED:")
    logger.info(f"📊 Numeric pipeline: {len(numeric_features)} columns -> Imputer + {'Scaler' if scaling else 'No Scaling'}")
    logger.info(f"🔤 Categorical pipeline: {len(categorical_features)} columns -> Imputer + {'OneHot' if encoding == 'onehot' else 'Label'} Encoder")
    logger.info(f"🚫 Remainder strategy: DROP (safety measure to prevent unencoded data)")
    
    # Validation finale : vérifier qu'il y a au moins une feature à traiter
    total_features = len(numeric_features) + len(categorical_features)
    if total_features == 0:
        raise ValueError("❌ Aucune feature valide détectée après classification. Vérifiez votre dataset.")
    
    logger.info(f"✅ Ready to process {total_features} features ({len(numeric_features)} numeric, {len(categorical_features)} categorical)")
    
    # Split the data avec gestion intelligente de la stratification
    try:
        # Essayer le split stratifié pour la classification
        if task_type == 'classification':
            # Vérifier d'abord si la stratification est possible
            unique_classes, class_counts = np.unique(y, return_counts=True)
            min_class_count = class_counts.min()
            
            if min_class_count >= 2:
                # Stratification possible
                X_train, X_test, y_train, y_test = train_test_split(
                    X, y, test_size=test_size, random_state=random_state, stratify=y
                )
            else:
                # Stratification impossible - classe avec 1 seul membre
                logger.warning(f"Stratification impossible - classe la moins peuplée: {min_class_count} membres")
                logger.warning("Passage en split aléatoire simple")
                X_train, X_test, y_train, y_test = train_test_split(
                    X, y, test_size=test_size, random_state=random_state, stratify=None
                )
        else:
            # Régression - pas de stratification
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=test_size, random_state=random_state
            )
    except ValueError as e:
        if "least populated class" in str(e):
            logger.warning(f"Erreur de stratification détectée: {str(e)}")
            logger.warning("Fallback vers split aléatoire simple")
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=test_size, random_state=random_state, stratify=None
            )
        else:
            raise
    
    # Fit and transform the data avec validation
    logger.info("🔧 Applying preprocessing transformations...")
    logger.info(f"📊 Before transformation - X_train shape: {X_train.shape}")
    
    X_train = preprocessor.fit_transform(X_train)
    X_test = preprocessor.transform(X_test)
    
    logger.info(f"📊 After transformation - X_train shape: {X_train.shape}")
    logger.info(f"📊 After transformation - X_test shape: {X_test.shape}")
    
    # 🔍 VALIDATION CRITIQUE: Vérifier qu'il n'y a plus de strings dans les données transformées
    if hasattr(X_train, 'dtype') and X_train.dtype == 'object':
        logger.error("❌ ERREUR CRITIQUE: X_train contient encore des objets (strings) après transformation!")
        logger.error(f"X_train dtype: {X_train.dtype}")
        raise ValueError("Les données d'entraînement contiennent encore des valeurs non numériques après preprocessing")
    
    # Vérification pour les arrays scipy sparse ou numpy
    if hasattr(X_train, 'dtypes'):  # DataFrame
        non_numeric_cols = X_train.select_dtypes(include=['object']).columns
        if len(non_numeric_cols) > 0:
            logger.error(f"❌ ERREUR: Colonnes non numériques restantes: {list(non_numeric_cols)}")
            raise ValueError(f"Colonnes non numériques détectées après preprocessing: {list(non_numeric_cols)}")
    
    logger.info("✅ Validation post-preprocessing: Toutes les données sont numériques")
    
    # Ajouter des informations supplémentaires aux métadonnées
    preprocessing_info.update({
        'train_samples': len(X_train),
        'test_samples': len(X_test),
        'feature_count': X_train.shape[1] if hasattr(X_train, 'shape') else 0,
        'target_classes': len(np.unique(y)) if task_type == 'classification' else None,
        'label_classes': label_classes  # Ajouter les noms de classes réels
    })
    
    return X_train, X_test, y_train, y_test, preprocessor, preprocessing_info

def get_preprocessing_info(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Get information about the dataset for preprocessing configuration
    
    Returns:
        Dict with dataset statistics and suggested preprocessing options
    """
    info = {
        'shape': df.shape,
        'columns': df.columns.tolist(),
        'dtypes': df.dtypes.astype(str).to_dict(),
        'missing_values': df.isnull().sum().to_dict(),
        'missing_percentage': (df.isnull().sum() / len(df) * 100).round(2).to_dict()
    }
    
    # Detect column types
    col_types = detect_column_types(df)
    info['column_types'] = col_types
    
    # Suggest target column (last column by default)
    info['suggested_target'] = df.columns[-1]
    
    # Détection intelligente classification vs régression
    if len(col_types['numeric']) > 0:
        last_col = df.columns[-1]
        if last_col in col_types['numeric']:
            unique_values = df[last_col].nunique()
            
            # Analyse plus sophistiquée pour les variables continues
            if unique_values < 10:
                # Vérifier que chaque classe a assez d'exemples pour stratification
                unique_classes, class_counts = np.unique(df[last_col].dropna(), return_counts=True)
                min_class_count = class_counts.min()
                
                if min_class_count >= 2:
                    info['suggested_task_type'] = 'classification'
                else:
                    # Classes insuffisantes - recommander régression ou autre approche
                    info['suggested_task_type'] = 'regression'
                    info['stratification_warning'] = f"Classe la moins peuplée: {min_class_count} exemples (minimum: 2)"
            elif unique_values < 50:
                # Variable potentiellement catégorielle mais avec beaucoup de valeurs
                info['suggested_task_type'] = 'regression'  # Plus safe
                info['task_type_reason'] = f"{unique_values} valeurs uniques - regression recommandée"
            else:
                info['suggested_task_type'] = 'regression'
        else:
            # Variable catégorielle
            unique_classes, class_counts = np.unique(df[last_col].dropna(), return_counts=True)
            min_class_count = class_counts.min()
            
            if min_class_count >= 2:
                info['suggested_task_type'] = 'classification'
            else:
                info['suggested_task_type'] = 'classification'  # Garder mais avec warning
                info['stratification_warning'] = f"Attention: classe '{unique_classes[np.argmin(class_counts)]}' n'a que {min_class_count} exemple(s)"
    else:
        info['suggested_task_type'] = 'classification'
    
    return info 