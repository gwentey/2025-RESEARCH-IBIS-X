"""
Nouveau mapper pour convertir les métadonnées spécifiques par dataset.

Ce module remplace l'ancien système de templates génériques par un système
de métadonnées spécifiques stockées dans des fichiers JSON.

Changements par rapport à la version précédente :
- Suppression de la dépendance aux templates éthiques
- Utilisation du DatasetMetadataLoader pour charger les métadonnées spécifiques
- Merge intelligent avec les données calculées (instances_number, features_number)
- Gestion d'erreurs robuste avec fallback vers templates
"""

from typing import Dict, Any
import logging
from datetime import datetime

from importer_lib.metadata_loader import DatasetMetadataLoader, MetadataValidationError

logger = logging.getLogger(__name__)


class KaggleMetadataMapperV2:
    """Nouveau mapper utilisant des métadonnées spécifiques par dataset."""
    
    def __init__(self):
        """Initialise le mapper avec le loader de métadonnées."""
        self.metadata_loader = DatasetMetadataLoader()
        logger.info("KaggleMetadataMapperV2 initialisé avec DatasetMetadataLoader")
    
    def map_kaggle_to_dataset(
        self, 
        dataset_config, 
        kaggle_metadata: Dict[str, Any], 
        file_metadata: Dict[str, Any],
        storage_path: str
    ) -> Dict[str, Any]:
        """
        Mappe les métadonnées spécifiques du dataset vers la structure Dataset.
        
        Args:
            dataset_config: Configuration du dataset (nom, domain, etc.)
            kaggle_metadata: Métadonnées de Kaggle (ignorées dans la nouvelle version)
            file_metadata: Métadonnées des fichiers (pour les données calculées)
            storage_path: Chemin de stockage
            
        Returns:
            Dict contenant TOUS les champs pour créer un Dataset complet
        """
        dataset_name = dataset_config.name
        logger.info(f"=== NOUVEAU SYSTÈME : Mapping des métadonnées pour '{dataset_name}' ===")
        
        try:
            # 1. Charger les métadonnées spécifiques du dataset
            specific_metadata = self.metadata_loader.load_dataset_metadata(dataset_name)
            logger.info(f"✅ Métadonnées spécifiques chargées ({len(specific_metadata)} champs)")
            
            # 2. Calculer les données automatiques à partir des fichiers
            computed_data = self._compute_file_based_metadata(file_metadata)
            logger.info(f"✅ Données calculées: {computed_data}")
            
            # 3. Ajouter les données de stockage et technique
            technical_data = {
                'storage_path': storage_path,
                **computed_data
            }
            
            # 4. Gérer le dataset_name et display_name correctement
            # Si display_name existe déjà, le conserver, sinon utiliser dataset_name du JSON ou fallback
            if 'display_name' not in specific_metadata or not specific_metadata['display_name']:
                if 'dataset_name' in specific_metadata:
                    # Utiliser dataset_name du JSON comme display_name si display_name n'existe pas
                    specific_metadata['display_name'] = specific_metadata['dataset_name']
                else:
                    # Fallback vers l'identifiant technique
                    specific_metadata['display_name'] = dataset_name
            
            # Toujours mettre l'identifiant technique dans dataset_name
            specific_metadata['dataset_name'] = dataset_name
            
            # 5. Merger les métadonnées (priorité : spécifiques > calculées > techniques)
            final_metadata = {**specific_metadata, **technical_data}
            
            logger.info(f"✅ Métadonnées finales générées ({len(final_metadata)} champs)")
            return final_metadata
            
        except FileNotFoundError:
            logger.warning(f"⚠️ Métadonnées spécifiques non trouvées pour '{dataset_name}' - utilisation du fallback")
            return self._fallback_metadata_generation(dataset_config, kaggle_metadata, file_metadata, storage_path)
        
        except Exception as e:
            logger.error(f"❌ Erreur lors du mapping pour '{dataset_name}': {e}")
            logger.warning("Utilisation du fallback pour assurer la continuité")
            return self._fallback_metadata_generation(dataset_config, kaggle_metadata, file_metadata, storage_path)
    
    def _compute_file_based_metadata(self, file_metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Calcule les métadonnées automatiques à partir des fichiers analysés."""
        
        # Calculs de base
        total_rows = file_metadata.get('total_rows', 0)
        total_columns = file_metadata.get('total_columns', 0)
        
        # Analyse des valeurs manquantes
        has_missing = file_metadata.get('has_missing_values', False)
        missing_percentage = file_metadata.get('missing_percentage', 0.0)
        
        # Analyse des colonnes pour détecter les facteurs temporels
        temporal_factors = self._detect_temporal_factors(file_metadata)
        
        return {
            'instances_number': total_rows,
            'features_number': total_columns,
            'has_missing_values': has_missing,
            'global_missing_percentage': missing_percentage if has_missing else 0.0,
            'temporal_factors': temporal_factors,
            'metadata_provided_with_dataset': True,  # Toujours vrai pour Kaggle
        }
    
    def _detect_temporal_factors(self, file_metadata: Dict[str, Any]) -> bool:
        """Détecte s'il y a des facteurs temporels dans les colonnes."""
        column_details = file_metadata.get('column_details', [])
        
        temporal_keywords = ['date', 'time', 'year', 'month', 'day', 'timestamp', 'created', 'updated']
        
        for col_detail in column_details:
            col_name = col_detail.get('column_name', '').lower()
            data_type = col_detail.get('data_type_interpreted', '').lower()
            
            # Vérifier le nom de la colonne
            if any(keyword in col_name for keyword in temporal_keywords):
                return True
            
            # Vérifier le type de données
            if data_type == 'temporal':
                return True
        
        return False
    
    def _fallback_metadata_generation(
        self, 
        dataset_config, 
        kaggle_metadata: Dict[str, Any], 
        file_metadata: Dict[str, Any],
        storage_path: str
    ) -> Dict[str, Any]:
        """
        Génération de fallback utilisant des templates quand les métadonnées spécifiques n'existent pas.
        
        Cette méthode utilise le système de templates pour maintenir la compatibilité
        avec les datasets qui n'ont pas encore de métadonnées spécifiques.
        """
        logger.info(f"Génération de fallback pour {dataset_config.name}")
        
        try:
            # Essayer de charger un template basé sur le domaine
            domain = getattr(dataset_config, 'domain', 'default')
            template_metadata = self.metadata_loader.load_template_metadata(domain)
            
            # Extraire les métadonnées du template
            base_metadata = template_metadata.get('enriched_metadata', {})
            
            # Personnaliser avec les données disponibles
            customized_metadata = self._customize_template_metadata(
                base_metadata, dataset_config, kaggle_metadata
            )
            
            # Ajouter les données calculées
            computed_data = self._compute_file_based_metadata(file_metadata)
            technical_data = {'storage_path': storage_path, **computed_data}
            
            # Merger tout
            final_metadata = {**customized_metadata, **technical_data}
            
            logger.info(f"✅ Fallback généré avec succès ({len(final_metadata)} champs)")
            return final_metadata
            
        except Exception as e:
            logger.error(f"❌ Erreur dans le fallback pour {dataset_config.name}: {e}")
            # Fallback ultime avec métadonnées minimales
            return self._generate_minimal_metadata(dataset_config, file_metadata, storage_path)
    
    def _customize_template_metadata(
        self, 
        template_metadata: Dict[str, Any], 
        dataset_config, 
        kaggle_metadata: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Personnalise les métadonnées du template avec les données disponibles."""
        
        customized = template_metadata.copy()
        
        # Remplacer les placeholders par les vraies données
        replacements = {
            'FILL_DATASET_TITLE': kaggle_metadata.get('title', dataset_config.description),
            'FILL_SPECIFIC_OBJECTIVE': kaggle_metadata.get('description', dataset_config.description),
            'FILL_SOURCE_DESCRIPTION': f"Kaggle Dataset: {getattr(dataset_config, 'kaggle_ref', '')}",
            'USERNAME/DATASET-NAME': getattr(dataset_config, 'kaggle_ref', ''),
        }
        
        # Remplacer dans toutes les valeurs string
        for key, value in customized.items():
            if isinstance(value, str):
                for placeholder, replacement in replacements.items():
                    if placeholder in value:
                        customized[key] = value.replace(placeholder, replacement)
        
        # Mettre à jour les champs spécifiques
        raw_title = kaggle_metadata.get('title', '')
        display_name = self._clean_dataset_title(raw_title, dataset_config)
        
        # Gérer domain et task en tant que listes ou strings
        domain_value = getattr(dataset_config, 'domain', 'general')
        if isinstance(domain_value, list):
            domain = domain_value
        else:
            domain = [domain_value]
            
        task_value = getattr(dataset_config, 'ml_task', 'classification')
        if isinstance(task_value, list):
            task = task_value
        else:
            task = [task_value]
        
        customized.update({
            'dataset_name': dataset_config.name,  # Identifiant technique
            'display_name': display_name,         # Nom d'affichage
            'objective': kaggle_metadata.get('description', dataset_config.description),
            'sources': f"Kaggle Dataset: {getattr(dataset_config, 'kaggle_ref', '')}",
            'storage_uri': f"https://www.kaggle.com/datasets/{getattr(dataset_config, 'kaggle_ref', '')}",
            'citation_link': f"https://www.kaggle.com/datasets/{getattr(dataset_config, 'kaggle_ref', '')}",
            'documentation_link': f"https://www.kaggle.com/datasets/{getattr(dataset_config, 'kaggle_ref', '')}",
            'year': self._extract_year(kaggle_metadata, dataset_config),
            'domain': domain,
            'task': task,
        })
        
        return customized
    
    def _clean_dataset_title(self, raw_title: str, dataset_config) -> str:
        """
        Nettoie et valide le titre du dataset récupéré depuis Kaggle.
        
        Args:
            raw_title: Le titre brut récupéré depuis l'API Kaggle
            dataset_config: La configuration du dataset
            
        Returns:
            Un titre nettoyé et valide
        """
        # Si le titre est vide ou None, utiliser la description du config
        if not raw_title or raw_title.strip() == '':
            return getattr(dataset_config, 'description', dataset_config.name.replace('_', ' ').title())
        
        # Détection de chemins de fichiers suspects (comme le problème oulad_dataset)
        if ('/' in raw_title and len(raw_title) > 50) or raw_title.lower().endswith('.json'):
            logger.warning(f"Titre suspect détecté pour {dataset_config.name}: '{raw_title}'")
            logger.info("Utilisation du titre de fallback depuis la configuration")
            return getattr(dataset_config, 'description', dataset_config.name.replace('_', ' ').title())
        
        # Nettoyer les caractères indésirables
        cleaned_title = raw_title.strip()
        
        # Si le titre nettoyé est trop court ou contient des patterns suspects
        if len(cleaned_title) < 3:
            return getattr(dataset_config, 'description', dataset_config.name.replace('_', ' ').title())
        
        return cleaned_title
    
    def _extract_year(self, kaggle_metadata: Dict, dataset_config) -> int:
        """Extrait l'année du dataset."""
        # Essayer d'extraire de différentes sources
        if 'lastUpdated' in kaggle_metadata:
            try:
                return datetime.fromisoformat(kaggle_metadata['lastUpdated']).year
            except:
                pass
        
        # Par défaut année actuelle
        return datetime.now().year
    
    def _generate_minimal_metadata(
        self, 
        dataset_config, 
        file_metadata: Dict[str, Any], 
        storage_path: str
    ) -> Dict[str, Any]:
        """Génère des métadonnées minimales pour assurer la continuité du système."""
        logger.warning(f"Génération de métadonnées minimales pour {dataset_config.name}")
        
        computed_data = self._compute_file_based_metadata(file_metadata)
        
        # Gérer domain et task en tant que listes ou strings
        domain_value = getattr(dataset_config, 'domain', 'general')
        if isinstance(domain_value, list):
            domain = domain_value
        else:
            domain = [domain_value]
            
        task_value = getattr(dataset_config, 'ml_task', 'classification')
        if isinstance(task_value, list):
            task = task_value
        else:
            task = [task_value]
        
        return {
            'dataset_name': dataset_config.name,
            'display_name': self._clean_dataset_title('', dataset_config),  # Utilise la même logique de nettoyage
            'objective': getattr(dataset_config, 'description', 'Dataset imported from Kaggle'),
            'access': 'public',
            'availability': 'online',
            'storage_path': storage_path,
            'domain': domain,
            'task': task,
            'informed_consent': False,
            'transparency': True,
            'anonymization_applied': False,
            'metadata_provided_with_dataset': True,
            **computed_data
        }


# Fonction de compatibilité pour l'intégration avec main.py
def create_complete_dataset_from_kaggle(
    dataset_config, 
    kaggle_metadata: Dict[str, Any], 
    file_metadata: Dict[str, Any],
    storage_path: str
) -> Dict[str, Any]:
    """
    Fonction principale pour créer un dataset complet depuis Kaggle.
    
    Cette fonction remplace l'ancienne version et utilise le nouveau système
    de métadonnées spécifiques par dataset.
    """
    mapper = KaggleMetadataMapperV2()
    return mapper.map_kaggle_to_dataset(
        dataset_config, 
        kaggle_metadata, 
        file_metadata, 
        storage_path
    )