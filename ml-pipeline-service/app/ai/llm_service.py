import openai
from typing import Dict, Any, List, Optional
import logging
from ..core.config import settings
import json
import tiktoken

logger = logging.getLogger(__name__)

class DatasetAnalysisService:
    """Service pour analyser les datasets avec OpenAI et donner des recommandations personnalisées."""
    
    def __init__(self):
        self.client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
        self.model = settings.OPENAI_MODEL
        self.max_tokens = settings.OPENAI_MAX_TOKENS
        self.temperature = settings.OPENAI_TEMPERATURE
        
        # Encoder pour compter les tokens
        try:
            if "gpt-5" in self.model.lower():
                self.encoder = tiktoken.get_encoding("o200k_base")  # GPT-5 encoding
            else:
                self.encoder = tiktoken.encoding_for_model(self.model)
        except:
            self.encoder = tiktoken.get_encoding("cl100k_base")  # Fallback
    
    def count_tokens(self, text: str) -> int:
        """Compter le nombre de tokens dans un texte."""
        return len(self.encoder.encode(text))
    
    def analyze_dataset_for_task_recommendation(self, 
                                               dataset_info: Dict[str, Any],
                                               target_column: str) -> Dict[str, Any]:
        """
        Analyser un dataset et donner des recommandations personnalisées sur 
        le choix entre classification et régression.
        """
        
        try:
            # Construire le prompt pour l'analyse avec toutes les métadonnées
            prompt = self._build_analysis_prompt(dataset_info, target_column)
            
            logger.info(f"🤖 ANALYSE IA OPENAI - Dataset: {dataset_info.get('name', 'Unknown')}, Colonne: {target_column}")
            logger.info(f"📊 MÉTADONNÉES ENVOYÉES: {len(dataset_info.get('columns', []))} colonnes, {dataset_info.get('total_rows', 0)} lignes")
            logger.debug(f"Prompt tokens: {self.count_tokens(prompt)}")
            
            # Préparer les messages pour l'API Chat
            system_prompt = self._get_system_prompt()
            
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ]
            
            # Appel à l'API OpenAI
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=self.max_tokens,
                temperature=self.temperature,
                response_format={"type": "json_object"}  # Force une réponse JSON structurée
            )
            
            # Extraire et parser la réponse
            response_content = response.choices[0].message.content
            tokens_used = response.usage.total_tokens if response.usage else 0
            
            logger.info(f"✅ RÉPONSE OPENAI REÇUE - Tokens utilisés: {tokens_used}")
            logger.debug(f"Contenu réponse: {response_content}")
            
            # Parser la réponse JSON
            analysis_result = json.loads(response_content)
            
            # Validation que la réponse contient les champs requis
            required_fields = ["recommendation", "confidence"]
            missing_fields = [field for field in required_fields if field not in analysis_result]
            if missing_fields:
                logger.error(f"❌ RÉPONSE OPENAI INCOMPLÈTE - Champs manquants: {missing_fields}")
                raise ValueError(f"Réponse OpenAI incomplète: {missing_fields}")
            
            # Ajouter des métadonnées
            analysis_result["metadata"] = {
                "model_used": self.model,
                "tokens_used": tokens_used,
                "target_column": target_column,
                "dataset_name": dataset_info.get('name', 'Unknown'),
                "source": "openai_analysis"  # Indique que c'est une vraie analyse OpenAI
            }
            
            logger.info(f"🎯 RECOMMANDATION IA: {analysis_result['recommendation'].upper()} (confiance: {analysis_result.get('confidence', 0)})")
            
            return analysis_result
            
        except json.JSONDecodeError as e:
            logger.error(f"❌ ERREUR PARSING JSON OpenAI: {e}")
            logger.error(f"Réponse brute: {response_content}")
            # FALLBACK SEULEMENT en cas d'erreur technique critique
            logger.warning("🔧 Utilisation du fallback en cas d'erreur parsing JSON uniquement")
            return self._get_fallback_analysis(dataset_info, target_column)
            
        except Exception as e:
            logger.error(f"❌ ERREUR CRITIQUE OpenAI: {e}")
            # FALLBACK SEULEMENT en cas d'erreur technique critique  
            logger.warning("🔧 Utilisation du fallback en cas d'erreur technique uniquement")
            return self._get_fallback_analysis(dataset_info, target_column)
    
    def _build_analysis_prompt(self, dataset_info: Dict[str, Any], target_column: str) -> str:
        """Construire le prompt d'analyse personnalisé."""
        
        dataset_name = dataset_info.get('name', 'Dataset')
        columns = dataset_info.get('columns', [])
        total_rows = dataset_info.get('total_rows', 0)
        
        # Trouver des infos sur la colonne cible
        target_column_info = None
        for col in columns:
            if col.get('name') == target_column or col.get('column_name') == target_column:
                target_column_info = col
                break
        
        # Construire la liste des colonnes pour contexte
        columns_description = []
        for col in columns[:10]:  # Limiter à 10 colonnes pour éviter un prompt trop long
            col_name = col.get('name') or col.get('column_name', 'Unknown')
            col_type = col.get('type') or col.get('data_type_interpreted') or col.get('data_type_original', 'Unknown')
            columns_description.append(f"- {col_name} ({col_type})")
        
        columns_text = "\n".join(columns_description)
        
        target_type = "Unknown"
        if target_column_info:
            target_type = (target_column_info.get('type') or 
                          target_column_info.get('data_type_interpreted') or 
                          target_column_info.get('data_type_original', 'Unknown'))
        
        # Log détaillé du type de colonne pour debugging
        logger.info(f"🔍 ANALYSE IA: Colonne '{target_column}' de type '{target_type}' - L'IA va analyser")
        logger.info(f"🔍 COLONNES DISPONIBLES: {len(columns)} colonnes trouvées")
        if target_column_info:
            logger.info(f"🔍 COLONNE CIBLE TROUVÉE: {json.dumps(target_column_info, indent=2, default=str)}")
        else:
            logger.warning(f"⚠️ COLONNE CIBLE '{target_column}' NON TROUVÉE dans les colonnes disponibles")
            logger.info(f"🔍 COLONNES DISPONIBLES: {[col.get('name') or col.get('column_name') for col in columns]}")
        prompt = f"""
Vous êtes un expert en Machine Learning qui doit analyser ce dataset et recommander Classification OU Régression.

INFORMATIONS DU DATASET:
- Nom: {dataset_name}
- Nombre de lignes: {total_rows}
- Colonne cible à prédire: {target_column} (type de données: {target_type})

COLONNES DISPONIBLES:
{columns_text}

🎯 RÈGLES CRITIQUES À APPLIQUER ABSOLUMENT :

**ANALYSEZ LA SÉMANTIQUE DE LA VARIABLE, PAS SEULEMENT LE TYPE TECHNIQUE !**

✅ **CLASSIFICATION** = Variables représentant des CATÉGORIES ou NIVEAUX ORDONNÉS
- Variables catégorielles : "Species", "Type", "Status", "Category"
- Variables ordinales : "Grade", "Level", "Risk", "Rating", "Rank", "Class"
- **MÊME SI codées numériquement (1="Bas", 2="Moyen", 3="Élevé") → CLASSIFICATION !**
- Exemples CORRECTS: risk_level → CLASSIFICATION, satisfaction_rating → CLASSIFICATION

✅ **RÉGRESSION** = Variables représentant des VALEURS NUMÉRIQUES CONTINUES
- Mesures physiques : prix, âge, taille, poids, durée, distance
- Scores vraiment continus : revenus, températures, vitesses
- Exemples CORRECTS: house_price → RÉGRESSION, student_age → RÉGRESSION

🔍 ANALYSE ÉTAPE PAR ÉTAPE REQUISE :

Étape 1 - ANALYSEZ LA SÉMANTIQUE de '{target_column}' :
- Nom de la colonne : {target_column} 
- Type technique détecté : {target_type}
- **QUESTION CLÉ** : Cette colonne représente-t-elle des CATÉGORIES/NIVEAUX ou des VALEURS CONTINUES ?

Étape 2 - APPLIQUEZ LA LOGIQUE SÉMANTIQUE :
- Si représente des catégories/classes/niveaux → CLASSIFICATION (même si type numérique)
- Si représente des mesures continues → RÉGRESSION

Étape 3 - JUSTIFIEZ AVEC DES EXEMPLES PERSONNALISÉS :
- Utilisez le vrai nom du dataset : {dataset_name}
- Donnez des exemples concrets avec les vraies colonnes disponibles
- Expliquez pourquoi cette approche est correcte pour CE dataset spécifique

🚨 EXEMPLES CRITIQUES POUR CE TYPE DE COLONNE :
- "risk_level" → CLASSIFICATION (catégories de risque : Bas/Moyen/Élevé)
- "satisfaction_rating" → CLASSIFICATION (échelle ordinale 1-5 étoiles)
- "education_grade" → CLASSIFICATION (niveaux : A/B/C/D/F)
- "house_price" → RÉGRESSION (prix en euros/dollars)
- "student_age" → RÉGRESSION (âge en années)

RÉPONSE ATTENDUE (format JSON strict) - ABSOLUMENT PERSONNALISÉE :

🔧 **RÈGLE CRITIQUE** : Générer uniquement les explications pour l'approche RECOMMANDÉE + message d'exclusion pour l'approche incorrecte

{{
    "recommendation": "classification" ou "regression",
    "confidence": 0.95,
    "classification_explanation": "[SI RECOMMANDATION = classification] Pour le dataset '{dataset_name}', la classification permettrait de [EXPLICATION SPÉCIFIQUE] OU [SI RECOMMANDATION = regression] ❌ CLASSIFICATION NON APPROPRIÉE : La colonne '{target_column}' représente des valeurs continues, pas des catégories",
    "regression_explanation": "[SI RECOMMANDATION = regression] Pour le dataset '{dataset_name}', la régression permettrait de [EXPLICATION SPÉCIFIQUE] OU [SI RECOMMANDATION = classification] ❌ RÉGRESSION NON APPROPRIÉE : La colonne '{target_column}' représente des catégories/niveaux, pas des valeurs continues",
    "classification_examples": [
        "[SI RECOMMANDATION = classification] Exemples spécifiques utilisant {target_column}",
        "[SI RECOMMANDATION = regression] ❌ Non applicable - variable numérique continue"
    ],
    "regression_examples": [
        "[SI RECOMMANDATION = regression] Exemples spécifiques utilisant {target_column}",
        "[SI RECOMMANDATION = classification] ❌ Non applicable - variable catégorielle"
    ],
    "final_recommendation_text": "Basé sur l'analyse du dataset '{dataset_name}' et la colonne '{target_column}', je recommande d'utiliser [VOTRE RECOMMANDATION AVEC JUSTIFICATION SPÉCIFIQUE]",
    "reasoning": "La colonne '{target_column}' dans le dataset '{dataset_name}' représente [DESCRIPTION SÉMANTIQUE PRÉCISE] donc [JUSTIFICATION DÉTAILLÉE]"
}}
"""
        
        return prompt.strip()
    
    def _get_system_prompt(self) -> str:
        """Prompt système pour guider le comportement de l'IA."""
        return """
Tu es un expert en Machine Learning qui doit analyser des datasets et recommander Classification OU Régression.

🎯 RÈGLE FONDAMENTALE CRITIQUE :

IL FAUT ANALYSER LA SÉMANTIQUE DE LA VARIABLE, PAS SEULEMENT SON TYPE TECHNIQUE !

🔧 LOGIQUE CORRECTE POUR DÉTERMINER LA TÂCHE :

✅ CLASSIFICATION = Variables représentant des CATÉGORIES ou CLASSES
- Variables catégorielles : "Species", "Type", "Status", "Category"  
- Variables ordinales : "Grade", "Level", "Risk", "Rating", "Rank"
- Même si codées numériquement (1="Bas", 2="Moyen", 3="Élevé") → CLASSIFICATION !
- Types techniques : categorical, string, object, boolean
- Exemples : risk_level, education_level, satisfaction_rating

✅ RÉGRESSION = Variables représentant des VALEURS NUMÉRIQUES CONTINUES
- Mesures physiques : prix, âge, taille, poids, durée
- Scores continus : revenus, températures, distances
- Types techniques : float, double avec valeurs vraiment continues
- Exemples : house_price, student_age, temperature

🚨 CAS CRITIQUES À BIEN ANALYSER :

CLASSIFICATION (même si type numérique) :
- "risk_level" → CLASSIFICATION (catégories de risque ordonnées)
- "satisfaction_rating" → CLASSIFICATION (échelle ordinale) 
- "education_grade" → CLASSIFICATION (niveaux ordonnés)
- "product_rating" → CLASSIFICATION (étoiles 1-5)

RÉGRESSION (valeurs continues) :
- "house_price" → RÉGRESSION (prix en euros/dollars)
- "student_age" → RÉGRESSION (âge en années)
- "temperature" → RÉGRESSION (degrés celsius)

🔍 MÉTHODE D'ANALYSE OBLIGATOIRE :

1. Lire le NOM de la colonne cible pour comprendre ce qu'elle représente
2. Analyser si c'est une catégorie/classe/niveau OU une mesure continue  
3. Vérifier les exemples de valeurs si disponibles
4. PRIVILÉGIER la sémantique sur le type technique

Tu DOIS distinguer variables catégorielles/ordinales (→CLASSIFICATION) des variables continues (→RÉGRESSION).

Réponds en JSON valide avec tes explications détaillées."""
    
    def _get_fallback_analysis(self, dataset_info: Dict[str, Any], target_column: str) -> Dict[str, Any]:
        """Analyse de fallback en cas d'erreur avec OpenAI."""
        
        # 🔧 FIX: D'abord vérifier le type de la colonne cible
        columns = dataset_info.get('columns', [])
        target_column_info = None
        for col in columns:
            if col.get('name') == target_column or col.get('column_name') == target_column:
                target_column_info = col
                break
        
        target_type = "Unknown"
        if target_column_info:
            target_type = (target_column_info.get('type') or 
                          target_column_info.get('data_type_interpreted') or 
                          target_column_info.get('data_type_original', 'Unknown'))
        
        # 🔧 CORRECTION: Appliquer la MÊME logique sémantique que le prompt OpenAI
        target_column_lower = target_column.lower()
        
        # PRIORITÉ À LA SÉMANTIQUE : Variables catégorielles/ordinales
        if any(keyword in target_column_lower for keyword in 
               ['level', 'risk', 'grade', 'rating', 'rank', 'class', 'type', 'category', 'status', 'species']):
            logger.info(f"🔧 FALLBACK: Variable catégorielle/ordinale détectée '{target_column}' → CLASSIFICATION")
            recommendation = "classification"
            confidence = 0.90
        
        # Variables numériques continues
        elif any(keyword in target_column_lower for keyword in 
                ['price', 'cost', 'amount', 'age', 'size', 'weight', 'height', 'length', 'width', 'duration', 'time', 'temperature', 'distance']):
            logger.info(f"🔧 FALLBACK: Variable continue détectée '{target_column}' → RÉGRESSION")
            recommendation = "regression" 
            confidence = 0.90
        
        # Si aucun mot-clé sémantique clair, utiliser le type mais avec prudence
        elif target_type.lower() in ['categorical', 'string', 'text', 'object', 'boolean']:
            logger.info(f"🔧 FALLBACK: Type catégoriel explicite ({target_type}) → CLASSIFICATION")
            recommendation = "classification"
            confidence = 0.75
        
        else:
            # Par défaut : classification (plus sûr pour éviter les erreurs)
            logger.info(f"🔧 FALLBACK: Cas ambigu pour '{target_column}' (type: {target_type}) → CLASSIFICATION par défaut")
            recommendation = "classification"
            confidence = 0.60
        
        dataset_name = dataset_info.get('name', 'votre dataset')
        
        # 🔧 CORRECTION CRITIQUE: Générer uniquement les explications appropriées
        if recommendation == 'classification':
            classification_explanation = f"Pour le dataset '{dataset_name}', la classification permettrait de prédire des catégories distinctes pour la colonne '{target_column}'."
            regression_explanation = f"❌ RÉGRESSION NON APPROPRIÉE : La colonne '{target_column}' représente des catégories/niveaux, pas des valeurs numériques continues. La régression ne convient pas pour ce type de variable."
            
            classification_examples = [
                f"Prédire la catégorie de {target_column}",
                f"Classer les éléments selon {target_column}",
                f"Identifier le type de {target_column}"
            ]
            regression_examples = [
                "❌ Non applicable - variable catégorielle",
                "❌ Régression inappropriée pour ce type de données",
                "❌ Utiliser la classification à la place"
            ]
        else:  # regression
            regression_explanation = f"Pour le dataset '{dataset_name}', la régression permettrait de prédire des valeurs numériques continues pour la colonne '{target_column}'."
            classification_explanation = f"❌ CLASSIFICATION NON APPROPRIÉE : La colonne '{target_column}' représente des valeurs numériques continues, pas des catégories. La classification ne convient pas pour ce type de variable."
            
            regression_examples = [
                f"Estimer la valeur numérique de {target_column}",
                f"Prédire le montant de {target_column}",
                f"Calculer la mesure de {target_column}"
            ]
            classification_examples = [
                "❌ Non applicable - variable numérique continue",
                "❌ Classification inappropriée pour ce type de données",
                "❌ Utiliser la régression à la place"
            ]
        
        return {
            "recommendation": recommendation,
            "confidence": confidence,
            "classification_explanation": classification_explanation,
            "regression_explanation": regression_explanation,
            "classification_examples": classification_examples,
            "regression_examples": regression_examples,
            "final_recommendation_text": f"Basé sur l'analyse du dataset '{dataset_name}' et la colonne '{target_column}', je recommande d'utiliser la {recommendation}.",
            "reasoning": "Analyse basée sur des heuristiques simples (fallback en cas d'erreur OpenAI)",
            "metadata": {
                "model_used": "fallback_heuristics",
                "tokens_used": 0,
                "target_column": target_column,
                "dataset_name": dataset_name,
                "is_fallback": True
            }
        }


class AlgorithmAnalysisService:
    """Service pour analyser les datasets avec OpenAI et recommander le meilleur algorithme."""
    
    def __init__(self):
        self.client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
        self.model = settings.OPENAI_MODEL
        self.max_tokens = settings.OPENAI_MAX_TOKENS
        self.temperature = settings.OPENAI_TEMPERATURE
        
        # Encoder pour compter les tokens
        try:
            if "gpt-5" in self.model.lower():
                self.encoder = tiktoken.get_encoding("o200k_base")  # GPT-5 encoding
            else:
                self.encoder = tiktoken.encoding_for_model(self.model)
        except:
            self.encoder = tiktoken.get_encoding("cl100k_base")  # Fallback
    
    def count_tokens(self, text: str) -> int:
        """Compter le nombre de tokens dans un texte."""
        return len(self.encoder.encode(text))
    
    def analyze_dataset_for_algorithm_recommendation(self, 
                                                   dataset_info: Dict[str, Any],
                                                   target_column: str,
                                                   task_type: str) -> Dict[str, Any]:
        """Analyser un dataset et recommander le meilleur algorithme ML."""
        
        try:
            # Construire le prompt spécifique pour l'algorithme
            prompt = self._build_algorithm_prompt_specific(dataset_info, target_column, task_type)
            
            logger.info(f"Analyse algorithme - Dataset: {dataset_info.get('name', 'Unknown')}, Colonne: {target_column}, Type: {task_type}")
            logger.debug(f"Prompt tokens: {self.count_tokens(prompt)}")
            
            # Préparer les messages pour l'API Chat
            system_prompt = self._get_algorithm_system_prompt_specific()
            
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ]
            
            # Appel à l'API OpenAI
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=self.max_tokens,
                temperature=0.3,  # Plus bas pour plus de cohérence
                response_format={"type": "json_object"}
            )
            
            # Extraire et parser la réponse
            response_content = response.choices[0].message.content
            tokens_used = response.usage.total_tokens if response.usage else 0
            
            logger.info(f"Réponse OpenAI algorithme reçue - Tokens utilisés: {tokens_used}")
            
            # Parser la réponse JSON
            analysis_result = json.loads(response_content)
            
            # Ajouter des métadonnées
            analysis_result["metadata"] = {
                "model_used": self.model,
                "tokens_used": tokens_used,
                "target_column": target_column,
                "task_type": task_type,
                "dataset_name": dataset_info.get('name', 'Unknown')
            }
            
            return analysis_result
            
        except json.JSONDecodeError as e:
            logger.error(f"Erreur parsing JSON de la réponse OpenAI algorithme: {e}")
            return self._get_fallback_algorithm_analysis(dataset_info, target_column, task_type)
            
        except Exception as e:
            logger.error(f"Erreur analyse algorithme: {e}")
            return self._get_fallback_algorithm_analysis(dataset_info, target_column, task_type)
    
    def _get_fallback_algorithm_analysis(self, dataset_info: Dict[str, Any], target_column: str, task_type: str) -> Dict[str, Any]:
        """Analyse de fallback en cas d'erreur avec OpenAI."""
        total_rows = dataset_info.get('total_rows', 0)
        dataset_name = dataset_info.get('name', 'votre dataset')
        columns = dataset_info.get('columns', [])
        num_features = len(columns) if columns else 0
        
        # Logique heuristique améliorée et spécifique
        if task_type == "classification":
            recommended = "random_forest"
            display_name = "Random Forest"
            
            # Explications spécifiques au dataset
            if 'iris' in dataset_name.lower():
                explanation = f"Random Forest est parfait pour distinguer les 3 espèces d'iris en analysant les relations entre les dimensions des pétales et sépales."
                reasons = [
                    "Analyse les relations entre dimensions des pétales/sépales pour distinguer setosa, versicolor et virginica",
                    "Gère les cas difficiles où deux espèces se ressemblent grâce à plusieurs arbres",
                    "Résultat : +95% de précision pour identifier l'espèce d'une nouvelle iris"
                ]
            else:
                explanation = f"Random Forest est le choix optimal pour votre dataset '{dataset_name}' car il combine simplicité et haute performance."
                reasons = [
                    f"Analyse optimale de vos {num_features} variables pour prédire '{target_column}'",
                    f"Robuste et fiable avec vos {total_rows} données",
                    f"Vous indique les variables les plus importantes de '{dataset_name}'"
                ]
        else:  # regression
            recommended = "random_forest"
            display_name = "Random Forest"
            explanation = f"Random Forest est optimal pour prédire les valeurs numériques de '{target_column}' dans votre dataset '{dataset_name}'."
            reasons = [
                f"Capture les relations entre vos {num_features} variables pour prédire '{target_column}'",
                f"Plus robuste que la régression linéaire avec vos {total_rows} données",
                f"Identifie les variables les plus influentes sur '{target_column}'"
            ]
        
        return {
            "recommended_algorithm": recommended,
            "recommended_algorithm_display_name": display_name,
            "confidence": 0.85,
            "explanation": explanation,
            "reasons": reasons,
            "alternatives": [
                {
                    "algorithm": "decision_tree",
                    "algorithm_display_name": "Decision Tree", 
                    "reason": f"Plus simple à comprendre mais moins robuste que Random Forest pour votre dataset '{dataset_name}'",
                    "confidence": 0.65
                }
            ],
            "dataset_characteristics": {
                "size_category": "small" if total_rows < 1000 else "medium" if total_rows < 50000 else "large",
                "complexity_level": "moderate",
                "data_quality": "good"
            }
        }

    def _build_algorithm_prompt_specific(self, dataset_info: Dict[str, Any], target_column: str, task_type: str) -> str:
        """Construire un prompt spécifique et pédagogique pour la recommandation d'algorithme."""
        
        dataset_name = dataset_info.get('name', 'Dataset')
        columns = dataset_info.get('columns', [])
        total_rows = dataset_info.get('total_rows', 0)
        
        # Construire la liste des colonnes pour contexte
        columns_description = []
        for col in columns[:10]:  # Limiter à 10 colonnes
            col_name = col.get('name') or col.get('column_name', 'Unknown')
            col_type = col.get('type') or col.get('data_type_interpreted') or col.get('data_type_original', 'Unknown')
            columns_description.append(f"- {col_name} ({col_type})")
        
        columns_text = "\n".join(columns_description)
        
        # Contexte spécifique selon le dataset
        dataset_context = ""
        if 'iris' in dataset_name.lower():
            dataset_context = """
CONTEXTE SPÉCIFIQUE DU DATASET IRIS:
Ce dataset contient des mesures de fleurs d'iris avec 3 espèces : setosa, versicolor, virginica.
Les utilisateurs veulent prédire l'espèce d'une iris en fonction de ses dimensions.
Les variables sont : longueur/largeur des sépales et pétales.
C'est un cas classique de classification multi-classes en botanique.
"""
        elif 'house' in dataset_name.lower() or 'price' in dataset_name.lower():
            dataset_context = f"""
CONTEXTE SPÉCIFIQUE DU DATASET IMMOBILIER:
Ce dataset contient des informations sur des propriétés immobilières.
Les utilisateurs veulent prédire les prix ou caractéristiques des maisons.
Variables typiques : surface, nombre de chambres, localisation, etc.
"""
        
        prompt = f"""
Tu es un expert IA qui aide des NON-EXPERTS à choisir le meilleur algorithme de machine learning.

{dataset_context}

INFORMATIONS DU DATASET:
- Nom: {dataset_name}
- Nombre de lignes: {total_rows}
- Colonne cible à prédire: {target_column}
- Type de tâche: {task_type.upper()}

COLONNES DISPONIBLES:
{columns_text}

MISSION CRUCIALE:
Tes utilisateurs NE CONNAISSENT PAS le machine learning. Tu dois:
1. Expliquer CONCRÈTEMENT et BRIÈVEMENT pourquoi ton algorithme est parfait pour CE dataset précis
2. Donner des exemples SPÉCIFIQUES avec les vraies colonnes du dataset
3. Expliquer les bénéfices CONCRETS mais de manière CONCISE
4. Éviter le jargon technique - vulgariser au maximum
5. MAXIMUM 3 raisons courtes et percutantes

ALGORITHMES DISPONIBLES:
- random_forest: Random Forest (recommandé dans 80% des cas)
- decision_tree: Decision Tree (simple mais moins robuste)  
- xgboost: XGBoost (très performant mais complexe)
- logistic_regression: Régression Logistique (pour classification simple)
- linear_regression: Régression Linéaire (pour prédictions numériques simples)

RÉPONSE ATTENDUE (JSON strict):
{{
    "recommended_algorithm": "nom_algorithme",
    "recommended_algorithm_display_name": "Nom Affiché",
    "explanation": "Explication SPÉCIFIQUE, CONCISE et PÉDAGOGIQUE adaptée au dataset {dataset_name}, expliquant BRIÈVEMENT pourquoi c'est le meilleur choix pour prédire {target_column}",
    "reasons": [
        "Raison 1 : Comment l'algorithme analysera CE dataset précis avec les vraies colonnes",
        "Raison 2 : Bénéfice CONCRET et avantage par rapport aux autres algorithmes", 
        "Raison 3 : Résultat final concret que l'utilisateur obtiendra (ex: '95% de précision')"
    ],
    "alternatives": [
        {{
            "algorithm": "algorithme_alternatif",
            "algorithm_display_name": "Nom Alternatif",
            "reason": "Pourquoi c'est moins bien pour CE dataset précis avec des exemples",
            "confidence": 0.65
        }}
    ]
}}

EXEMPLE DE BONNE EXPLICATION pour Iris:
"Random Forest est parfait pour votre dataset Iris car il peut distinguer parfaitement les 3 espèces (setosa, versicolor, virginica) en analysant les relations entre longueur_sepale, largeur_sepale, longueur_petale, largeur_petale. Contrairement à un algorithme simple, Random Forest gère les cas difficiles où une iris versicolor ressemble à une virginica."

PAS D'EXPLICATION GÉNÉRIQUE ! Tout doit être adapté au dataset {dataset_name} !
"""
        
        return prompt.strip()
    
    def _get_algorithm_system_prompt_specific(self) -> str:
        """Prompt système spécialisé pour des recommandations pédagogiques."""
        return """
Tu es un expert en Machine Learning qui aide des DÉBUTANTS à choisir le meilleur algorithme.

RÈGLES CRITIQUES:
1. Tes utilisateurs sont des NON-EXPERTS qui ne connaissent rien au ML
2. TOUTES tes explications doivent être SPÉCIFIQUES au dataset fourni
3. Utilise les VRAIS noms de colonnes du dataset dans tes exemples
4. Explique les BÉNÉFICES CONCRETS que l'utilisateur obtiendra
5. Évite le jargon technique - vulgarise au maximum
6. Donne des exemples pratiques de ce qui va se passer
7. Compare avec des alternatives pour montrer pourquoi ton choix est meilleur

FORMAT OBLIGATOIRE:
- Explication : COURTE explication pourquoi CET algorithme pour CE dataset précis
- Raisons : SEULEMENT 3 points spécifiques et concis avec exemples du dataset  
- Pas de métriques techniques abstraites
- Focus sur les résultats concrets mais BRIÈVEMENT
- Évite les phrases trop longues

EXEMPLES DE BONNES EXPLICATIONS:
✅ "Random Forest distinguera parfaitement vos 3 espèces d'iris en analysant les relations entre longueur_petale et largeur_sepale"
✅ "Avec vos 150 échantillons d'iris, Random Forest évite le sur-apprentissage en combinant 100 arbres"  
✅ "Résultat concret : vous pourrez identifier l'espèce d'une nouvelle iris avec 96% de précision"

EXEMPLES D'EXPLICATIONS À ÉVITER:
❌ "Random Forest est un ensemble d'arbres de décision avec bootstrap sampling"
❌ "Il optimise la fonction de coût en réduisant la variance"
❌ "Précision attendue: 85-90%"

Réponds UNIQUEMENT en JSON valide, adapté au dataset spécifique fourni.
"""


# Instances globales des services
_dataset_analysis_service = None
_algorithm_analysis_service = None

def get_dataset_analysis_service() -> DatasetAnalysisService:
    """Obtenir l'instance du service d'analyse de dataset."""
    global _dataset_analysis_service
    if _dataset_analysis_service is None:
        _dataset_analysis_service = DatasetAnalysisService()
    return _dataset_analysis_service

def get_algorithm_analysis_service() -> AlgorithmAnalysisService:
    """Obtenir l'instance du service d'analyse d'algorithme."""
    global _algorithm_analysis_service
    if _algorithm_analysis_service is None:
        _algorithm_analysis_service = AlgorithmAnalysisService()
    return _algorithm_analysis_service
