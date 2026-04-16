import requests
import logging
import os
from typing import Dict, Any, Optional
from ..core.config import settings

logger = logging.getLogger(__name__)

def get_dataset_info(dataset_id: str) -> Optional[Dict[str, Any]]:
    """
    Récupérer les informations d'un dataset depuis le Service Selection (communication interne).
    
    Les services internes communiquent directement entre eux, pas via l'API Gateway.
    """
    try:
        # URL du Service Selection (communication interne K8s)

        service_selection_url = os.environ.get("SERVICE_SELECTION_URL", "http://service-selection-service.ibis-x.svc.cluster.local")
        dataset_url = f"{service_selection_url}/datasets/{dataset_id}"
        
        logger.info(f"Récupération dataset {dataset_id} depuis Service Selection : {dataset_url}")
        
        # Faire l'appel API interne
        response = requests.get(
            dataset_url,
            timeout=30  # 30 secondes timeout
        )
        
        if response.status_code == 200:
            dataset_data = response.json()
            
            # Transformer les données au format attendu par le service d'analyse
            transformed_data = {
                'id': dataset_data.get('id'),
                'name': dataset_data.get('dataset_name'),
                'total_rows': dataset_data.get('total_rows', 0),
                'columns': []
            }
            
            # Traiter les colonnes de tous les fichiers
            if 'files' in dataset_data and dataset_data['files']:
                all_columns = []
                for file in dataset_data['files']:
                    if 'columns' in file and file['columns']:
                        # Ajouter les colonnes de ce fichier
                        for col in file['columns']:
                            # Standardiser les noms de champs pour l'IA
                            standardized_col = {
                                'name': col.get('column_name'),
                                'column_name': col.get('column_name'),
                                'type': col.get('data_type_interpreted') or col.get('data_type_original'),
                                'data_type_interpreted': col.get('data_type_interpreted'),
                                'data_type_original': col.get('data_type_original'),
                                'position': col.get('position', 0),
                                'is_nullable': col.get('is_nullable', True),
                                'description': col.get('description'),
                                'example_values': col.get('example_values', [])
                            }
                            all_columns.append(standardized_col)
                
                transformed_data['columns'] = all_columns
            
            logger.info(f"Dataset {dataset_id} récupéré avec succès - {len(transformed_data['columns'])} colonnes")
            return transformed_data
            
        elif response.status_code == 404:
            logger.warning(f"Dataset {dataset_id} introuvable (404) depuis Service Selection")
            return None
            
        else:
            logger.error(f"Erreur Service Selection {response.status_code}: {response.text}")
            return None
            
    except requests.exceptions.Timeout:
        logger.error(f"Timeout lors de la récupération du dataset {dataset_id}")
        return None
        
    except requests.exceptions.ConnectionError:
        logger.error(f"Erreur de connexion au Service Selection pour dataset {dataset_id}")
        return None
        
    except Exception as e:
        logger.error(f"Erreur récupération dataset {dataset_id}: {str(e)}")
        return None

def get_fallback_dataset_info(dataset_name: str) -> Dict[str, Any]:
    """
    Générer des informations de dataset de fallback pour les tests.
    Utilisé quand l'API Gateway n'est pas disponible.
    """
    
    # Données de fallback spéciales pour des datasets connus
    if 'iris' in dataset_name.lower():
        return {
            'id': 'fallback-iris',
            'name': 'Iris',
            'total_rows': 150,
            'columns': [
                {
                    'column_name': 'sepal_length',
                    'data_type_interpreted': 'float64',
                    'data_type_original': 'numeric'
                },
                {
                    'column_name': 'sepal_width', 
                    'data_type_interpreted': 'float64',
                    'data_type_original': 'numeric'
                },
                {
                    'column_name': 'petal_length',
                    'data_type_interpreted': 'float64',
                    'data_type_original': 'numeric'
                },
                {
                    'column_name': 'petal_width',
                    'data_type_interpreted': 'float64', 
                    'data_type_original': 'numeric'
                },
                {
                    'column_name': 'species',
                    'data_type_interpreted': 'object',
                    'data_type_original': 'categorical'
                }
            ]
        }
    
    # Dataset générique de fallback
    return {
        'id': 'fallback-generic',
        'name': dataset_name or 'Dataset générique',
        'total_rows': 1000,
        'columns': [
            {
                'column_name': 'feature_1',
                'data_type_interpreted': 'float64',
                'data_type_original': 'numeric'
            },
            {
                'column_name': 'feature_2',
                'data_type_interpreted': 'int64',
                'data_type_original': 'numeric'
            },
            {
                'column_name': 'target',
                'data_type_interpreted': 'object',
                'data_type_original': 'categorical'
            }
        ]
    }
