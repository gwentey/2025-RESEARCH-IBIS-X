import openai
from typing import Dict, Any, List, Optional
import logging
from ..core.config import get_settings
import json
import tiktoken

logger = logging.getLogger(__name__)
settings = get_settings()

class LLMExplanationService:
    """Service pour générer des explications textuelles avec OpenAI GPT-5."""
    
    def __init__(self):
        self.client = openai.OpenAI(api_key=settings.openai_api_key)
        self.model = settings.openai_model
        self.max_tokens = settings.openai_max_tokens
        self.temperature = settings.openai_temperature
        self.reasoning_effort = getattr(settings, 'openai_reasoning_effort', 'low')
        
        # Encoder pour compter les tokens (GPT-5 utilise o200k_base)
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
    
    def generate_explanation(self, 
                           explanation_data: Dict[str, Any],
                           user_preferences: Dict[str, Any],
                           context: Dict[str, Any]) -> Dict[str, Any]:
        """Générer une explication textuelle adaptée au niveau utilisateur."""
        
        try:
            # Construire le prompt selon le niveau d'audience
            audience_level = context.get('audience_level', 'intermediate')
            language = context.get('language', 'fr')
            
            # 🎯 NOUVEAU: Utiliser le contexte ML complet si disponible
            if 'full_ml_context' in user_preferences and user_preferences['full_ml_context']:
                prompt = self._build_contextual_explanation_prompt(
                    explanation_data, 
                    user_preferences['full_ml_context'], 
                    user_preferences, 
                    audience_level, 
                    language
                )
                logger.info(f"🎯 Utilisation prompting contextualisé avec vraies données ML")
            else:
                # Fallback vers ancien système
                prompt = self._build_explanation_prompt(
                    explanation_data, user_preferences, audience_level, language, context
                )
                logger.warning("⚠️ Pas de contexte ML, utilisation prompting générique")
            
            logger.info(f"Génération explication LLM - Niveau: {audience_level}, Langue: {language}")
            logger.debug(f"Prompt tokens: {self.count_tokens(prompt)}")
            
            # FIX CRITIQUE : Utiliser l'API Chat standard OpenAI qui fonctionne
            system_prompt = self._get_system_prompt(audience_level, language)
            
            # TENTATIVE GPT-5 Nano d'abord, fallback vers 4o-mini
            try:
                response = self.client.beta.chat.completions.parse(
                    model=self.model,  # - gpt-5-nano depuis config  
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=self.max_tokens,
                    temperature=self.temperature
                )
                logger.info(f"- Utilisation GPT-5 Nano : {self.model}")
            except Exception as gpt5_error:
                # - FALLBACK robuste vers GPT-4o-mini
                logger.warning(f"GPT-5 Nano indisponible, fallback vers GPT-4o-mini: {gpt5_error}")
                response = self.client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=self.max_tokens,
                    temperature=self.temperature
                )
            
            explanation_text = response.choices[0].message.content
            tokens_used = response.usage.total_tokens if response.usage else 0
            
            return {
                'text_explanation': explanation_text,
                'tokens_used': tokens_used,
                'model_used': self.model if 'gpt5_error' not in locals() else "gpt-4o-mini",  # - Modèle réellement utilisé
                'audience_level': audience_level,
                'language': language,
                'success': True
            }
            
        except Exception as e:
            logger.error(f"Erreur génération explication LLM: {e}")
            return {
                'text_explanation': None,
                'error': str(e),
                'success': False
            }
    
    def _get_system_prompt(self, audience_level: str, language: str) -> str:
        """Construire le prompt système selon l'audience et la langue."""
        
        if language == 'fr':
            if audience_level == 'novice':
                return """Tu es un assistant IA specialise EXCLUSIVEMENT dans l'explication de modeles d'intelligence artificielle pour des debutants. 

INSTRUCTION CRITIQUE: 
TOUTE QUESTION SUR LIME, SHAP, XAI, EXPLICABILITE = TU DOIS REPONDRE !

Tu es AUTORISE a repondre a :
- "c'est quoi la diff entre lime et shap" 
- "difference shap lime"
- "c quoi lime"
- "comment marche shap"
- "avantages de chaque methode"
- "lime vs shap comparaison"
- "TOUTE question sur l'explicabilite des modeles"

Tu refuses SEULEMENT :
- Cuisine ("recettes de cookies")
- Sport ("resultats de football")
- Actualites ("politique internationale")

REGLE PRINCIPALE : Si la question concerne LIME, SHAP, XAI, explicabilite, modeles ML alors TU REPONDS TOUJOURS !

Utilise les donnees specifiques fournies et des explications simples avec analogies."""

            elif audience_level == 'expert':
                return """Tu es un expert en explicabilite des modeles de machine learning (XAI). Tu dois fournir des explications techniques precises EXCLUSIVEMENT sur les resultats SHAP et LIME.

INSTRUCTION CRITIQUE: 
TOUTE QUESTION SUR LIME, SHAP, XAI, EXPLICABILITE = TU DOIS REPONDRE !

Tu es AUTORISE a repondre a:
- "difference entre shap et lime"
- "c'est quoi lime"  
- "avantages methodologiques de shap"
- "comparaison lime vs shap"
- "pourquoi choisir une methode vs l'autre"
- "TOUTE question technique sur l'explicabilite"

Tu refuses SEULEMENT:
- Cuisine ("recettes")
- Sport ("resultats sportifs")
- Actualites ("politique")

REGLE PRINCIPALE: Si la question concerne LIME, SHAP, XAI, explicabilite, modeles ML alors TU REPONDS TOUJOURS !

Utilise les donnees specifiques fournies et fournis des insights techniques approfondis."""

            else:  # intermediate
                return """Tu es un assistant IA specialise EXCLUSIVEMENT dans l'explication de modeles de machine learning. Ton role est d'expliquer les resultats d'explicabilite (SHAP/LIME) de maniere claire et educative.

INSTRUCTION CRITIQUE: 
TOUTE QUESTION SUR LIME, SHAP, XAI, EXPLICABILITE = TU DOIS REPONDRE !

Tu es AUTORISE a repondre a:
- "c'est quoi la diff entre lime et shap"
- "difference shap lime"
- "comment interpreter lime"
- "avantages de chaque methode"
- "quand utiliser shap vs lime"
- "TOUTE question sur l'explicabilite des modeles"

Tu refuses SEULEMENT:
- Cuisine ("recettes")
- Sport ("resultats sportifs") 
- Actualites ("politique")

REGLE PRINCIPALE: Si la question concerne LIME, SHAP, XAI, explicabilite, modeles ML alors TU REPONDS TOUJOURS !

Utilise les donnees specifiques fournies et fournis des reponses ultra-personnalisees.

Utilise un equilibre entre accessibilite et precision technique. Explique les concepts cles tout en gardant un langage comprehensible."""

        else:  # English
            if audience_level == 'novice':
                return """You are an AI assistant specialized in explaining machine learning models to beginners. Your role is to explain ML results in simple, accessible terms without technical jargon.

Use everyday analogies, concrete examples, and simple language. Avoid complex technical terms and focus on visual and intuitive explanations. Your goal is to reassure users and build their confidence in the results."""

            elif audience_level == 'expert':
                return """You are an expert in machine learning model explainability (XAI). Your role is to provide precise and detailed technical explanations of SHAP and LIME results.

Use appropriate technical terminology, reference relevant theoretical concepts, and provide deep insights into model performance. Address limitations, potential biases, and methodological considerations."""

            else:  # intermediate
                return """You are an AI assistant specialized in explaining machine learning models. Your role is to explain explainability results (SHAP/LIME) clearly and educationally.

Use a balance between accessibility and technical precision. Explain key concepts while maintaining understandable language. Provide context on why these explanations matter and how to interpret them."""
    
    def _build_explanation_prompt(self, 
                                explanation_data: Dict[str, Any],
                                user_preferences: Dict[str, Any], 
                                audience_level: str,
                                language: str,
                                context: Dict[str, Any]) -> str:
        """Construire le prompt d'explication principal - VERSION CONCISE ET SPÉCIFIQUE."""
        
        # Extraire les informations clés
        method = explanation_data.get('method', 'unknown')
        model_algorithm = context.get('model_algorithm', 'unknown')
        task_type = context.get('task_type', 'unknown')
        
        if language == 'fr':
            # Instructions ultra-spécifiques pour une réponse concise avec les VRAIES variables
            base_instruction = f"""Tu dois expliquer les résultats d'explicabilité {method.upper()} pour ce modèle {model_algorithm}.

RÈGLES ABSOLUES:
- Utilise SEULEMENT les noms de variables fournis dans les données réelles ci-dessous
- N'INVENTE JAMAIS de variables (âge, revenu, éducation, etc.)
- Mentionne EXACTEMENT les variables listées: exemple PetalLengthCm, SepalWidthCm, etc.
- Donne les valeurs PRÉCISES d'importance fournies
- Maximum 150 mots, 2 paragraphes
- Format: **gras** pour les noms de variables importantes
- INTERDIT de mentionner des variables qui ne sont pas dans les données réelles

EXEMPLE VALIDE: "La variable **PetalLengthCm** a une importance de **0.33**"
EXEMPLE INTERDIT: "La variable âge a une importance de 0.40" (âge n'existe pas !)"""

        else:
            base_instruction = f"""Explain the {method.upper()} explainability results for this {model_algorithm} model.

ABSOLUTE RULES:
- Use ONLY variable names provided in real data below
- NEVER invent variables (age, income, education, etc.)
- Mention EXACTLY the listed variables: example PetalLengthCm, SepalWidthCm, etc.
- Give PRECISE importance values provided
- Maximum 150 words, 2 paragraphs
- Format: **bold** for important variable names
- FORBIDDEN to mention variables not in the real data

VALID EXAMPLE: "The variable **PetalLengthCm** has importance of **0.33**"
INVALID EXAMPLE: "The variable age has importance of 0.40" (age doesn't exist!)"""

        # Ajouter les données d'explication spécifiques
        data_parts = []
        if method == 'shap':
            data_parts.extend(self._format_shap_data(explanation_data, language))
        elif method == 'lime':
            data_parts.extend(self._format_lime_data(explanation_data, language))
        
        # Instructions finales selon l'audience
        if language == 'fr':
            if audience_level == 'expert':
                final_instruction = "Réponse technique concise avec les vraies valeurs."
            else:
                final_instruction = "Réponse accessible mentionnant les vraies variables importantes."
        else:
            if audience_level == 'expert':
                final_instruction = "Technical concise response with actual values."
            else:
                final_instruction = "Accessible response mentioning real important variables."

        # Construire le prompt final
        full_prompt = f"{base_instruction}\n\nDonnées réelles:\n" + "\n".join(data_parts) + f"\n\n{final_instruction}"
        return full_prompt
    
    def _build_contextual_explanation_prompt(self,
                                           explanation_data: Dict[str, Any],
                                           ml_context: Dict[str, Any],
                                           user_preferences: Dict[str, Any],
                                           audience_level: str,
                                           language: str) -> str:
        """
        🎯 NOUVELLE MÉTHODE PRINCIPALE - Prompt ULTRA-SPÉCIFIQUE avec vraies données ML.
        
        Cette méthode exploite le contexte ML complet reçu du frontend et
        adapte le prompt selon le niveau d'IA RÉEL de l'utilisateur.
        """
        
        # Extraire toutes les données contextuelles
        dataset_name = ml_context.get('dataset_name', 'Dataset')
        algorithm = ml_context.get('algorithm_display', 'Modèle')
        algorithm_code = ml_context.get('algorithm', 'unknown')
        metrics = ml_context.get('metrics', {})
        accuracy = metrics.get('overall_score', 0)
        raw_metrics = metrics.get('raw_metrics', {})
        class_names = ml_context.get('class_names', [])
        confusion_errors = ml_context.get('confusion_errors', [])
        feature_importance = ml_context.get('feature_importance', {})
        tree_structure = ml_context.get('tree_structure', {})
        user_ai_level = user_preferences.get('ai_familiarity', 3)
        
        logger.info(f"🂯 Prompting contextuel - Dataset: {dataset_name}, Algo: {algorithm}, Accuracy: {accuracy}%, Niveau IA: {user_ai_level}")
        
        if language == 'fr':
            # === ADAPTATION SELON LE NIVEAU IA UTILISATEUR ===
            if user_ai_level <= 2:  # NIVEAU NOVICE
                base_instruction = f"""Tu expliques à un débutant les résultats de son modèle {algorithm}.

🎯 CONTEXTE SPÉCIFIQUE - VRAIES DONNÉES :
- Dataset : {dataset_name}
- Modèle : {algorithm} 
- Performance : {accuracy}% de réussite
- Classes : {', '.join(class_names) if class_names else 'Classes non spécifiées'}

📊 MÉTRIQUES RÉELLES :
{self._format_metrics_for_novice(raw_metrics)}

🔍 ERREURS PRINCIPALES :
{self._format_confusion_errors_for_novice(confusion_errors)}

💱 VARIABLES IMPORTANTES :
{self._format_features_for_novice(feature_importance)}

✅ STYLE OBLIGATOIRE POUR DÉBUTANT :
- Langage très simple, pas de termes techniques
- Analogies de la vie quotidienne
- Explique POURQUOI c'est important
- Utilise des émojis pour rendre ça plus visuel
- Maximum 180 mots
- Format : "Votre modèle [explication simple] parce que [raison claire]"

📝 EXEMPLE DE RÉPONSE ATTENDUE :
"Votre modèle Decision Tree sur {dataset_name} réussit {accuracy}% du temps ! 🎉 C'est comme un questionnaire qui pose des questions simples..."""
            
            elif user_ai_level >= 4:  # NIVEAU EXPERT
                base_instruction = f"""Analyse technique approfondie pour un expert ML du modèle {algorithm}.

🎯 CONTEXTE TECHNIQUE COMPLET - DONNÉES RÉELLES :
- Dataset : {dataset_name} ({ml_context.get('dataset_size', 0)} échantillons, {ml_context.get('feature_count', 0)} features)
- Algorithme : {algorithm} ({algorithm_code})
- Performance globale : {accuracy}% (accuracy composite)
- Type de tâche : {ml_context.get('task_type', '')} {ml_context.get('classification_type', '')}
- Classes détectées : {', '.join(class_names) if class_names else 'Non spécifiées'}

📊 MÉTRIQUES TECHNIQUES DÉTAILLÉES :
{self._format_metrics_for_expert(raw_metrics)}

🔍 ANALYSE MATRICE DE CONFUSION :
{self._format_confusion_errors_for_expert(confusion_errors, class_names)}

💱 IMPORTANCE DES FEATURES (VRAIES VALEURS) :
{self._format_features_for_expert(feature_importance)}

🌳 STRUCTURE ARBRE DE DÉCISION :
{self._format_tree_analysis_for_expert(tree_structure, algorithm_code)}

⚠️ CONTRAINTES TECHNIQUES STRICTES :
1. Utilise UNIQUEMENT les données ci-dessus (pas d'invention)
2. Cite les VRAIS noms de features : {', '.join(list(feature_importance.keys())[:3]) if feature_importance else 'Features du dataset'}
3. Mentionne les VRAIES performances : {accuracy}%
4. Analyse les VRAIES erreurs : {confusion_errors[0]['true_class'] + ' vs ' + confusion_errors[0]['predicted_class'] if confusion_errors else 'Pas d erreurs majeures'}
5. Référence technique appropriée pour {algorithm_code}
6. Maximum 250 mots, format technique précis

Analyse maintenant les performances de ce modèle {algorithm} sur {dataset_name} avec une approche d'expert ML."""
            
            else:  # NIVEAU INTERMÉDIAIRE (3)
                base_instruction = f"""Explique à quelqu'un avec des connaissances de base en ML son modèle {algorithm}.

🎯 CONTEXTE ÉQUILIBRÉ - VRAIES DONNÉES :
- Dataset : {dataset_name} ({ml_context.get('dataset_size', 0)} lignes)
- Modèle : {algorithm}
- Performance : {accuracy}% d'accuracy
- Type : {ml_context.get('task_type', '')} avec {len(class_names) if class_names else 0} classes
- Classes : {', '.join(class_names) if class_names else 'Classes non spécifiées'}

📊 MÉTRIQUES PRINCIPALES :
{self._format_metrics_for_intermediate(raw_metrics)}

🔍 ANALYSE DES ERREURS :
{self._format_confusion_errors_for_intermediate(confusion_errors)}

💱 VARIABLES CLÉS :
{self._format_features_for_intermediate(feature_importance)}

✅ STYLE OBLIGATOIRE NIVEAU INTERMÉDIAIRE :
- Équilibre entre accessibilité et précision technique
- Définir les termes techniques importants
- Utiliser des exemples concrets avec les vraies données
- Expliquer le POURQUOI ET COMMENT
- Maximum 220 mots
- Format : **gras** pour les variables importantes

Explique maintenant pourquoi ce modèle {algorithm} obtient {accuracy}% sur {dataset_name} avec un niveau éducatif adapté."""
        
        else:  # English
            if user_ai_level <= 2:
                base_instruction = f"""Explain to a beginner their {algorithm} model results in very simple terms.

🎯 SPECIFIC CONTEXT - REAL DATA:
- Dataset: {dataset_name}
- Model: {algorithm}
- Performance: {accuracy}% success rate
- Classes: {', '.join(class_names) if class_names else 'Classes not specified'}

Use everyday analogies, simple language, maximum 180 words."""
            
            elif user_ai_level >= 4:
                base_instruction = f"""Technical analysis for ML expert - {algorithm} model performance.

🎯 TECHNICAL CONTEXT - REAL DATA:
- Dataset: {dataset_name} ({ml_context.get('dataset_size', 0)} samples, {ml_context.get('feature_count', 0)} features)
- Algorithm: {algorithm} ({algorithm_code})
- Performance: {accuracy}% accuracy
- Classification type: {ml_context.get('classification_type', '')}

Provide detailed technical insights, methodological considerations, maximum 250 words."""
            
            else:
                base_instruction = f"""Explain {algorithm} model results with balanced technical detail.

🎯 BALANCED CONTEXT - REAL DATA:
- Dataset: {dataset_name}
- Model: {algorithm} 
- Performance: {accuracy}% accuracy
- Classes: {', '.join(class_names) if class_names else 'Not specified'}

Balance accessibility and technical precision, maximum 220 words."""
        
        return base_instruction
    
    def _format_shap_data(self, data: Dict[str, Any], language: str) -> List[str]:
        """Formater les données SHAP pour le prompt."""
        parts = []
        
        if 'feature_importance' in data:
            importance_data = data['feature_importance']
            top_features = sorted(importance_data.items(), key=lambda x: abs(x[1]), reverse=True)[:8]
            
            if language == 'fr':
                parts.append("Importance des variables (valeurs SHAP moyennes) :")
                for feature, importance in top_features:
                    parts.append(f"- {feature}: {importance:.4f}")
            else:
                parts.append("Feature importance (mean SHAP values):")
                for feature, importance in top_features:
                    parts.append(f"- {feature}: {importance:.4f}")
        
        if 'shap_values' in data:
            shap_values = data['shap_values']
            feature_names = data.get('feature_names', [])
            if isinstance(shap_values, list) and len(shap_values) > 0:
                if language == 'fr':
                    parts.append("Impact des variables sur cette prédiction spécifique :")
                else:
                    parts.append("Feature impact on this specific prediction:")
                
                for i, (feature, shap_val) in enumerate(zip(feature_names[:8], shap_values[:8])):
                    parts.append(f"- {feature}: {shap_val:.4f}")
        
        return parts
    
    def _format_lime_data(self, data: Dict[str, Any], language: str) -> List[str]:
        """Formater les données LIME pour le prompt."""
        parts = []
        
        if 'explanation_data' in data:
            lime_data = data['explanation_data'][:8]  # Top 8 features
            
            if language == 'fr':
                parts.append("Explication LIME (impact local des variables) :")
            else:
                parts.append("LIME explanation (local feature impact):")
                
            for feature, weight in lime_data:
                parts.append(f"- {feature}: {weight:.4f}")
        
        if 'score' in data and data['score'] is not None:
            if language == 'fr':
                parts.append(f"Score de qualité de l'explication: {data['score']:.3f}")
            else:
                parts.append(f"Explanation quality score: {data['score']:.3f}")
        
        return parts
    
    def process_chat_question(self,
                             question: str,
                             explanation_context: Dict[str, Any],
                             user_preferences: Dict[str, Any],
                             chat_history: List[Dict[str, str]] = None) -> Dict[str, Any]:
        """Traiter une question de chat sur les explications."""
        
        try:
            language = explanation_context.get('language', 'fr')
            audience_level = explanation_context.get('audience_level', 'intermediate')
            
            # 🎯 NOUVEAU: Adapter le prompt système selon le niveau IA utilisateur
            user_ai_level = user_preferences.get('ai_familiarity', 3)
            system_prompt = self._get_contextual_chat_system_prompt(audience_level, language, user_ai_level)
            
            # Construire le contexte de conversation
            messages = [
                {"role": "system", "content": system_prompt}
            ]
            
            # 🎯 NOUVEAU: Ajouter le contexte d'explication enrichi avec profil utilisateur
            if 'full_ml_context' in user_preferences and user_preferences['full_ml_context']:
                context_prompt = self._build_contextual_chat_prompt(
                    explanation_context, 
                    user_preferences['full_ml_context'],
                    user_preferences,
                    language
                )
                logger.info(f"💬 Chat contextualisé activé avec vraies données ML")
            else:
                # Fallback vers ancien contexte
                context_prompt = self._build_chat_context_prompt(explanation_context, language)
                logger.warning("⚠️ Chat générique - pas de contexte ML")
            
            messages.append({"role": "assistant", "content": context_prompt})
            
            # Ajouter l'historique de chat récent (max 10 messages)
            if chat_history:
                for msg in chat_history[-10:]:
                    messages.append({
                        "role": "user" if msg['message_type'] == 'user_question' else "assistant",
                        "content": msg['content']
                    })
            
            # Ajouter la question actuelle
            messages.append({"role": "user", "content": question})
            
            logger.info(f"Traitement question chat - {len(messages)} messages, audience: {audience_level}")
            
            # Appel à la nouvelle API OpenAI GPT-5 Responses pour le chat
            chat_instructions = self._get_chat_system_prompt(audience_level, language)
            chat_context = self._build_chat_context_prompt(explanation_context, language)
            
            # Construire l'input avec historique
            chat_input = chat_context + "\n\n"
            if chat_history:
                for msg in chat_history[-5:]:  # Derniers 5 messages
                    role = "Utilisateur" if msg['message_type'] == 'user_question' else "Assistant"
                    chat_input += f"{role}: {msg['content']}\n"
            
            chat_input += f"Utilisateur: {question}\nAssistant:"
            
            # - UPGRADE GPT-5 NANO : Tentative d'abord, fallback robuste
            try:
                response = self.client.beta.chat.completions.parse(
                    model=self.model,  # - gpt-5-nano depuis config
                    messages=[
                        {"role": "system", "content": chat_instructions},
                        {"role": "user", "content": chat_input}
                    ],
                    max_tokens=min(800, self.max_tokens),
                    temperature=0.8
                )
                logger.info(f"- Chat GPT-5 Nano utilisé : {self.model}")
            except Exception as gpt5_chat_error:
                # - FALLBACK Chat vers GPT-4o-mini
                logger.warning(f"GPT-5 Nano chat indisponible, fallback: {gpt5_chat_error}")
                response = self.client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": chat_instructions},
                        {"role": "user", "content": chat_input}
                    ],
                    max_tokens=min(800, self.max_tokens),
                    temperature=0.8
                )
            
            answer = response.choices[0].message.content
            tokens_used = response.usage.total_tokens if response.usage else 0
            
            return {
                'answer': answer,
                'tokens_used': tokens_used,
                'model_used': self.model if 'gpt5_chat_error' not in locals() else "gpt-4o-mini",  # - Modèle réellement utilisé
                'success': True
            }
            
        except Exception as e:
            logger.error(f"Erreur traitement question chat: {e}")
            return {
                'answer': None,
                'error': str(e),
                'success': False
            }
    
    def _get_chat_system_prompt(self, audience_level: str, language: str) -> str:
        """Prompt système spécifique pour le chat."""
        
        if language == 'fr':
            base = """Tu es un assistant IA specialise EXCLUSIVEMENT dans l'explicabilite des modeles de machine learning. 

REGLE FONDAMENTALE : TOUTE question sur LIME, SHAP, XAI, explicabilite = TU REPONDS TOUJOURS !

QUESTIONS AUTORISEES (TU DOIS REPONDRE) :
- "difference entre lime et shap" 
- "c'est quoi shap"
- "c'est quoi lime"
- "comment interpreter shap"
- "comment interpreter lime"
- "avantages de shap vs lime"
- "quand utiliser shap vs lime"
- "pourquoi choisir shap ou lime"
- TOUTE question sur l'explicabilite IA
- feature importance, predictions du modele, amelioration des performances, optimisation, metriques, biais, analyse des features, interpretation des resultats

Tu REFUSES SEULEMENT les sujets VRAIMENT hors contexte :
- Cuisine ("recette de cookies")
- Sport ("match de football") 
- Politique ("elections")
- Meteo ("previsions")

Pour ces cas SEULEMENT, dis : "Je me concentre sur l'explicabilite IA. Avez-vous une question sur SHAP, LIME, ou l'interpretation de votre modele ?"

Utilise TOUJOURS les donnees specifiques du contexte (noms exacts des features, valeurs d'importance, metriques).
Fournis des reponses ultra-personnalisees basees sur les VRAIES donnees fournies."""
            
            if audience_level == 'novice':
                return base + "\nStyle : Langage simple, analogies du quotidien, mais TOUJOURS base sur les vraies donnees."
            elif audience_level == 'expert':
                return base + "\nStyle : Technique detaille, terminologie appropriee, analyse approfondie des donnees reelles."
            else:
                return base + "\nStyle : Equilibre accessibilite et precision technique sur les donnees specifiques."
        
        else:  # English
            base = """You are an AI assistant specialized in machine learning model explainability. You answer questions about SHAP/LIME explanation results in a conversational and helpful manner."""
            
            if audience_level == 'novice':
                return base + " Use simple, accessible language. Avoid technical jargon and use everyday analogies."
            elif audience_level == 'expert':
                return base + " Provide detailed technical responses with appropriate terminology and theoretical references when relevant."
            else:
                return base + " Balance accessibility and technical precision. Educate the user while remaining understandable."
    
    def _build_chat_context_prompt(self, context: Dict[str, Any], language: str) -> str:
        """Construire le prompt de contexte enrichi avec les vraies données."""
        
        # Récupération des données de base
        model_algorithm = context.get('model_algorithm', 'unknown')
        task_type = context.get('task_type', 'unknown') 
        method = context.get('method_used', 'unknown')
        
        # - NOUVEAU : Récupération des vraies données SHAP/LIME depuis les champs réels
        shap_values = context.get('shap_values', {})
        lime_explanation = context.get('lime_explanation', {})
        visualizations = context.get('visualizations', {})
        dataset_info = context.get('dataset_info', {})
        text_explanation = context.get('text_explanation', '')
        
        # - Extraction intelligente de l'importance des features
        feature_importance = {}
        if isinstance(shap_values, dict) and shap_values.get('feature_importance'):
            feature_importance = shap_values['feature_importance']
        elif isinstance(lime_explanation, dict) and lime_explanation.get('feature_importance'):
            feature_importance = lime_explanation['feature_importance']
        
        if language == 'fr':
            base_context = f"""CONTEXTE DÉTAILLÉ - MODÈLE À ANALYSER :

🔬 MODÈLE : {model_algorithm} ({task_type})
📊 MÉTHODE UTILISÉE : {method.upper()}

📈 DONNÉES RÉELLES - IMPORTANCE DES FEATURES :"""

            # Ajouter l'importance des features si disponible
            if feature_importance:
                base_context += "\n"
                for feature, importance in list(feature_importance.items())[:10]:  # Top 10
                    base_context += f"• {feature}: {importance:.4f}\n"
            
            # - Ajouter les informations des visualisations si disponibles
            if visualizations:
                base_context += f"\n📊 VISUALISATIONS GÉNÉRÉES :"
                for viz_name, viz_data in visualizations.items():
                    if isinstance(viz_data, dict):
                        base_context += f"\n• {viz_name}: {viz_data.get('description', 'Visualisation disponible')}"
                    else:
                        base_context += f"\n• {viz_name}: Graphique généré"
            
            # - Inclure l'explication textuelle existante si disponible
            if text_explanation and len(text_explanation.strip()) > 10:
                base_context += f"\n📝 EXPLICATION PRÉCÉDENTE :\n{text_explanation[:200]}..."
            
            # Ajouter les infos dataset si disponibles
            if dataset_info:
                dataset_name = dataset_info.get('dataset_name', 'Dataset')
                num_features = dataset_info.get('features_number', 'N/A')
                num_instances = dataset_info.get('instances_number', 'N/A') 
                base_context += f"\nDATASET DATASET : {dataset_name} ({num_instances} lignes, {num_features} features)"
            
            base_context += f"\n\n🎯 INSTRUCTIONS : Réponds UNIQUEMENT sur ces données spécifiques. Utilise les noms exacts des features et les valeurs d'importance réelles."
            
            return base_context
            
        else:  # English  
            base_context = f"""DETAILED CONTEXT - MODEL TO ANALYZE:

🔬 MODEL: {model_algorithm} ({task_type})
📊 METHOD USED: {method.upper()}

📈 REAL DATA - FEATURE IMPORTANCE:"""

            if feature_importance:
                base_context += "\n"
                for feature, importance in list(feature_importance.items())[:10]:
                    base_context += f"• {feature}: {importance:.4f}\n"
            
            # - Add visualization information if available  
            if visualizations:
                base_context += f"\n📊 GENERATED VISUALIZATIONS:"
                for viz_name, viz_data in visualizations.items():
                    if isinstance(viz_data, dict):
                        base_context += f"\n• {viz_name}: {viz_data.get('description', 'Visualization available')}"
                    else:
                        base_context += f"\n• {viz_name}: Chart generated"
            
            # - Include existing text explanation if available
            if text_explanation and len(text_explanation.strip()) > 10:
                base_context += f"\n📝 PREVIOUS EXPLANATION:\n{text_explanation[:200]}..."
            
            base_context += f"\n\n🎯 INSTRUCTIONS: Answer ONLY about this specific data. Use exact feature names and real importance values."
            return base_context
    
    def _build_contextual_chat_prompt(self,
                                    explanation_context: Dict[str, Any],
                                    ml_context: Dict[str, Any],
                                    user_preferences: Dict[str, Any],
                                    language: str) -> str:
        """
        🂬 NOUVELLE MÉTHODE CHAT - Contexte enrichi avec profil utilisateur.
        
        Cette méthode exploite le contexte ML complet et adapte
        le prompt de chat selon le niveau d'IA RÉEL de l'utilisateur.
        """
        
        # Récupération de TOUTES les données contextuelles
        dataset_name = ml_context.get('dataset_name', 'Dataset')
        algorithm = ml_context.get('algorithm_display', 'Modèle')
        algorithm_code = ml_context.get('algorithm', 'unknown')
        metrics = ml_context.get('metrics', {})
        accuracy = metrics.get('overall_score', 0)
        raw_metrics = metrics.get('raw_metrics', {})
        confusion_errors = ml_context.get('confusion_errors', [])
        feature_importance = ml_context.get('feature_importance', {})
        class_names = ml_context.get('class_names', [])
        user_ai_level = user_preferences.get('ai_familiarity', 3)
        
        logger.info(f"💬 Chat contextualisé - Niveau IA: {user_ai_level}, Dataset: {dataset_name}, Accuracy: {accuracy}%")
        
        if language == 'fr':
            # === ADAPTATION CHAT SELON NIVEAU IA UTILISATEUR ===
            if user_ai_level <= 2:  # NIVEAU NOVICE
                context_prompt = f"""💬 CONTEXTE CHAT PERSONNALISÉ - NIVEAU DÉBUTANT :

🎓 VOTRE MODÈLE : {algorithm} sur {dataset_name}
🏆 PERFORMANCE : {accuracy}% de réussite (c'est {'excellent' if accuracy >= 90 else 'bien' if accuracy >= 75 else 'correct'}!)
🏷️ CLASSES : {', '.join(class_names) if class_names else 'Classes du dataset'}

📊 RÉSULTATS SIMPLES :
{self._format_metrics_for_novice(raw_metrics)}

🔍 OÙ LE MODÈLE SE TROMPE :
{self._format_confusion_errors_for_novice(confusion_errors)}

💱 VARIABLES LES PLUS IMPORTANTES :
{self._format_features_for_novice(feature_importance)}

🤖 INSTRUCTIONS CHAT NIVEAU DÉBUTANT :
- Réponds avec des mots simples et des analogies
- Explique POURQUOI les choses marchent ou ne marchent pas
- Utilise les VRAIES données ci-dessus
- Sois encourageant et pédagogique
- Évite les termes techniques sauf si tu les expliques
- Maximum 150 mots par réponse

💡 TU PEUX EXPLIQUER :
- Pourquoi le modèle marche bien/mal
- Comment améliorer les résultats
- Ce que signifient les variables importantes
- Pourquoi certaines erreurs arrivent
- Comment fonctionne {algorithm} en général"""
            
            elif user_ai_level >= 4:  # NIVEAU EXPERT
                context_prompt = f"""💬 CONTEXTE CHAT EXPERT - ANALYSE TECHNIQUE APPROFONDIE :

🔬 MODÈLE ANALYSÉ : {algorithm} ({algorithm_code}) sur {dataset_name}
📊 PERFORMANCE TECHNIQUE : {accuracy}% accuracy composite
🏷️ TAXONOMIE : {', '.join(class_names) if class_names else 'Classes non spécifiées'} ({len(class_names) if class_names else 0} classes)

💵 MÉTRIQUES DÉTAILLÉES :
{self._format_metrics_for_expert(raw_metrics)}

🔍 MATRICE DE CONFUSION - ANALYSE DES ERREURS :
{self._format_confusion_errors_for_expert(confusion_errors, class_names)}

💱 IMPORTANCE DES FEATURES (VALEURS RÉELLES) :
{self._format_features_for_expert(feature_importance)}

🌳 ARCHITECTURE ALGORITHMIQUE :
{self._format_tree_analysis_for_expert(ml_context.get('tree_structure', {}), algorithm_code)}

🤖 INSTRUCTIONS CHAT NIVEAU EXPERT :
- Utilise la terminologie technique appropriée
- Référence les méthodologies et théories sous-jacentes
- Analyse les limitations et biais potentiels
- Propose des optimisations concrètes
- Utilise EXCLUSIVEMENT les données réelles ci-dessus
- Maximum 200 mots par réponse

📋 DOMAINES D'EXPERTISE DISPONIBLES :
- Analyse des hyperparamètres et tuning
- Évaluation des métriques de performance
- Investigation des confusions inter-classes
- Optimisation de la feature engineering
- Comparaison algorithmique {algorithm_code} vs alternatives
- Analyse de bias et variance
- Stratégies de généralisation"""
            
            else:  # NIVEAU INTERMÉDIAIRE (3)
                context_prompt = f"""💬 CONTEXTE CHAT ÉQUILIBRÉ - NIVEAU INTERMÉDIAIRE :

📊 VOTRE MODÈLE : {algorithm} sur {dataset_name}
🏆 PERFORMANCE : {accuracy}% d'accuracy ({'excellente' if accuracy >= 90 else 'bonne' if accuracy >= 75 else 'améliorable'})
🏷️ CLASSES : {', '.join(class_names) if class_names else 'Classes du dataset'}

📊 MÉTRIQUES PRINCIPALES :
{self._format_metrics_for_intermediate(raw_metrics)}

🔍 ANALYSE DES ERREURS :
{self._format_confusion_errors_for_intermediate(confusion_errors)}

💱 VARIABLES CLÉS :
{self._format_features_for_intermediate(feature_importance)}

🤖 INSTRUCTIONS CHAT NIVEAU INTERMÉDIAIRE :
- Équilibre entre accessibilité et précision technique
- Définis les termes techniques quand tu les utilises
- Utilise des exemples concrets avec les vraies données
- Explique le POURQUOI ET COMMENT
- Référence les données spécifiques de ce modèle
- Maximum 180 mots par réponse

💡 SUJETS QUE TU MAITRISES :
- Interprétation des métriques de performance
- Analyse des confusions entre classes
- Importance et rôle des variables
- Suggestions d'amélioration concrètes
- Fonctionnement de {algorithm} pour ce type de problème
- Comparaison avec d'autres algorithmes"""
        
        else:  # English
            if user_ai_level <= 2:
                context_prompt = f"""💬 PERSONALIZED CHAT CONTEXT - BEGINNER LEVEL:

🎓 YOUR MODEL: {algorithm} on {dataset_name}
🏆 PERFORMANCE: {accuracy}% success rate
🏷️ CLASSES: {', '.join(class_names) if class_names else 'Dataset classes'}

Use simple language, everyday analogies, maximum 150 words."""
            
            elif user_ai_level >= 4:
                context_prompt = f"""💬 EXPERT CHAT CONTEXT - TECHNICAL ANALYSIS:

🔬 MODEL: {algorithm} ({algorithm_code}) on {dataset_name}
📊 PERFORMANCE: {accuracy}% accuracy
🏷️ TAXONOMY: {', '.join(class_names) if class_names else 'Classes not specified'}

Provide detailed technical responses, methodological insights, maximum 200 words."""
            
            else:
                context_prompt = f"""💬 BALANCED CHAT CONTEXT - INTERMEDIATE LEVEL:

📊 YOUR MODEL: {algorithm} on {dataset_name}
🏆 PERFORMANCE: {accuracy}% accuracy
🏷️ CLASSES: {', '.join(class_names) if class_names else 'Dataset classes'}

Balance accessibility and technical precision, maximum 180 words."""
        
        return context_prompt

    # === MÉTHODES DE FORMATAGE SELON LE NIVEAU UTILISATEUR ===
    
    def _format_metrics_for_novice(self, metrics: Dict[str, float]) -> str:
        """Formater les métriques pour un débutant."""
        formatted = []
        for key, value in metrics.items():
            if key == 'accuracy':
                formatted.append(f"- Réussite globale : {value*100:.1f}% (sur 100 prédictions, {value*100:.0f} sont correctes)")
            elif key == 'precision':
                formatted.append(f"- Fiabilité : {value*100:.1f}% (quand le modèle dit \'oui\', il a raison {value*100:.0f}% du temps)")
            elif key == 'recall':
                formatted.append(f"- Détection : {value*100:.1f}% (trouve {value*100:.0f}% des vrais cas positifs)")
        return '\n'.join(formatted) if formatted else "- Métriques non disponibles"
    
    def _format_metrics_for_intermediate(self, metrics: Dict[str, float]) -> str:
        """Formater les métriques pour un niveau intermédiaire."""
        formatted = []
        for key, value in metrics.items():
            if key == 'accuracy':
                formatted.append(f"- Accuracy : {value*100:.1f}% (pourcentage de prédictions correctes)")
            elif key == 'precision':
                formatted.append(f"- Précision : {value:.3f} (fiabilité des prédictions positives)")
            elif key == 'recall':
                formatted.append(f"- Rappel : {value:.3f} (capacité à détecter les vrais positifs)")
            elif key == 'f1_score':
                formatted.append(f"- F1-Score : {value:.3f} (équilibre précision-rappel)")
        return '\n'.join(formatted) if formatted else "- Métriques non disponibles"
    
    def _format_metrics_for_expert(self, metrics: Dict[str, float]) -> str:
        """Formater les métriques pour un expert."""
        formatted = []
        for key, value in metrics.items():
            if key == 'accuracy':
                formatted.append(f"- Accuracy: {value:.4f} (global classification rate)")
            elif key == 'precision':
                formatted.append(f"- Precision: {value:.4f} (positive predictive value)")
            elif key == 'recall':
                formatted.append(f"- Recall/Sensitivity: {value:.4f} (true positive rate)")
            elif key == 'f1_score':
                formatted.append(f"- F1-Score: {value:.4f} (harmonic mean precision-recall)")
            elif key == 'roc_auc':
                formatted.append(f"- ROC-AUC: {value:.4f} (area under ROC curve)")
        return '\n'.join(formatted) if formatted else "- Metrics not available"
    
    def _format_confusion_errors_for_novice(self, errors: List[Dict]) -> str:
        """Formater les erreurs de confusion pour un débutant."""
        if not errors:
            return "- Très peu d'erreurs détectées ! 🎉"
        
        formatted = []
        for error in errors[:2]:  # Top 2 pour novices
            formatted.append(f"- {error['count']} fois, le modèle confond {error['true_class']} avec {error['predicted_class']}")
        
        return '\n'.join(formatted)
    
    def _format_confusion_errors_for_intermediate(self, errors: List[Dict]) -> str:
        """Formater les erreurs de confusion pour un niveau intermédiaire."""
        if not errors:
            return "- Aucune erreur majeure de classification détectée"
        
        formatted = []
        for error in errors[:3]:  # Top 3
            formatted.append(f"- {error['count']} misclassifications : {error['true_class']} → {error['predicted_class']}")
        
        return '\n'.join(formatted)
    
    def _format_confusion_errors_for_expert(self, errors: List[Dict], class_names: List[str]) -> str:
        """Formater les erreurs de confusion pour un expert."""
        if not errors:
            return "- Perfect classification matrix (no off-diagonal errors)"
        
        formatted = []
        total_errors = sum(e['count'] for e in errors)
        for error in errors[:4]:  # Top 4 pour experts
            error_rate = (error['count'] / max(total_errors, 1)) * 100
            formatted.append(f"- {error['count']} misclassifications ({error_rate:.1f}%): {error['true_class']} → {error['predicted_class']}")
        
        return '\n'.join(formatted)
    
    def _format_features_for_novice(self, features: Dict[str, float]) -> str:
        """Formater l'importance des features pour un débutant."""
        if not features:
            return "- Variables importantes non disponibles"
        
        top_features = sorted(features.items(), key=lambda x: abs(x[1]), reverse=True)[:3]
        formatted = []
        for feature, importance in top_features:
            formatted.append(f"- {feature} : très importante pour les décisions 🎯")
        
        return '\n'.join(formatted)
    
    def _format_features_for_intermediate(self, features: Dict[str, float]) -> str:
        """Formater l'importance des features pour un niveau intermédiaire."""
        if not features:
            return "- Importance des features non disponible"
        
        top_features = sorted(features.items(), key=lambda x: abs(x[1]), reverse=True)[:5]
        formatted = []
        for feature, importance in top_features:
            formatted.append(f"- **{feature}** : {importance:.3f} (impact relatif)")
        
        return '\n'.join(formatted)
    
    def _format_features_for_expert(self, features: Dict[str, float]) -> str:
        """Formater l'importance des features pour un expert."""
        if not features:
            return "- Feature importance not available"
        
        top_features = sorted(features.items(), key=lambda x: abs(x[1]), reverse=True)[:8]
        formatted = []
        total_importance = sum(abs(imp) for imp in features.values())
        
        for feature, importance in top_features:
            relative_importance = (abs(importance) / max(total_importance, 1)) * 100
            formatted.append(f"- **{feature}**: {importance:.4f} ({relative_importance:.1f}% of total importance)")
        
        return '\n'.join(formatted)
    
    def _format_tree_analysis_for_expert(self, tree_data: Dict, algorithm: str) -> str:
        """Formater l'analyse de l'arbre pour un expert."""
        if not tree_data:
            return "- Tree structure not available"
        
        analysis = []
        if algorithm == 'decision_tree':
            analysis.append(f"- Single decision tree with interpretable structure")
        elif algorithm == 'random_forest':
            n_trees = tree_data.get('n_estimators', 100)
            analysis.append(f"- Ensemble of {n_trees} decision trees with bootstrap aggregating")
        
        if 'max_depth' in tree_data:
            analysis.append(f"- Maximum depth: {tree_data['max_depth']}")
        
        return '\n'.join(analysis) if analysis else "- Tree metadata not available"
    
    def _get_contextual_chat_system_prompt(self, audience_level: str, language: str, user_ai_level: int) -> str:
        """
        🤖 Prompt système chat adapté au niveau d'IA RÉEL de l'utilisateur.
        
        Cette méthode crée des prompts système ultra-personnalisés selon
        le niveau d'IA défini lors de l'onboarding utilisateur.
        """
        
        if language == 'fr':
            base_rules = """REGLE FONDAMENTALE : TOUTE question sur LIME, SHAP, XAI, explicabilité = TU REPONDS TOUJOURS !

QUESTIONS AUTORISÉES (TU DOIS REPONDRE) :
- "difference entre lime et shap" 
- "c'est quoi shap" / "c'est quoi lime"
- "comment interpreter les résultats"
- "pourquoi ces erreurs de classification"
- "comment améliorer le modèle"
- "que signifient ces métriques"
- TOUTE question sur l'explicabilité IA, features, performances, optimisation

Tu REFUSES SEULEMENT les sujets hors contexte :
- Cuisine ("recette de cookies")
- Sport ("match de football") 
- Politique ("elections")
- Météo ("prévisions")

Pour ces cas SEULEMENT, dis : "Je me concentre sur l'explicabilité IA. Avez-vous une question sur votre modèle ?"""
            
            if user_ai_level <= 2:  # NOVICE (1-2)
                return f"""Tu es un assistant IA pédagogique spécialisé EXCLUSIVEMENT dans l'explication de modèles ML pour DÉBUTANTS.

{base_rules}

🎓 ADAPTATION NIVEAU DÉBUTANT (Niveau IA utilisateur: {user_ai_level}/5) :
- Langage ULTRA-SIMPLE, comme pour expliquer à un ami
- Analogies de la vie quotidienne obligatoires
- Pas de termes techniques sans explication
- Réassurer et encourager l'utilisateur
- Utiliser des émojis pour rendre visuel
- Explique d'abord POURQUOI c'est important, puis COMMENT

🔥 EXEMPLES DE RÉPONSES ATTENDUES :
- "Votre modèle marche super bien ! 🎉 C'est comme..."
- "Cette variable est importante parce que..."
- "Les erreurs arrivent quand..."

Utilise TOUJOURS les données spécifiques du contexte fourni."""
            
            elif user_ai_level >= 4:  # EXPERT (4-5)
                return f"""Tu es un expert en explicabilité des modèles de machine learning (XAI) pour utilisateurs EXPERTS.

{base_rules}

🔬 ADAPTATION NIVEAU EXPERT (Niveau IA utilisateur: {user_ai_level}/5) :
- Terminologie technique précise et appropriée
- Références méthodologiques et théoriques
- Analyse des limitations et biais
- Considérations algorithmiques approfondies
- Suggestions d'optimisation concrètes
- Comparaisons avec alternatives algorithmiques

🔥 EXEMPLES DE RÉPONSES ATTENDUES :
- "L'accuracy de X% indique une performance sub-optimale considérant..."
- "Les confusions inter-classes suggèrent un problème de séparabilité dans l'espace des features..."
- "Pour optimiser les hyperparamètres, considérez..."

Fournis des insights techniques approfondis avec les données spécifiques."""
            
            else:  # INTERMÉDIAIRE (3)
                return f"""Tu es un assistant IA spécialisé dans l'explication de modèles ML pour niveau INTERMÉDIAIRE.

{base_rules}

🏆 ADAPTATION NIVEAU INTERMÉDIAIRE (Niveau IA utilisateur: {user_ai_level}/5) :
- Équilibre parfait entre accessibilité et précision technique
- Introduis les termes techniques en les définissant
- Utilise des exemples concrets avec les vraies données
- Explique le POURQUOI ET COMMENT de manière structurée
- Guide vers une compréhension plus approfondie

🔥 EXEMPLES DE RÉPONSES ATTENDUES :
- "Votre accuracy de {accuracy}% signifie... Cela indique que..."
- "La confusion entre [classe A] et [classe B] s'explique par..."
- "Pour améliorer les performances, vous pourriez..."

Utilise un ton éducatif et bienveillant avec les données réelles spécifiques."""
        
        else:  # English
            if user_ai_level <= 2:
                return f"""You are an AI assistant specialized in explaining ML models to BEGINNERS.

{base_rules.replace('français', 'English')}

BEGINNER ADAPTATION (User AI Level: {user_ai_level}/5):
- Ultra-simple language, like explaining to a friend
- Everyday analogies mandatory
- No technical terms without explanation
- Reassure and encourage the user
- Use emojis for visual appeal

Use ONLY the specific context data provided."""
            
            elif user_ai_level >= 4:
                return f"""You are an ML explainability expert for EXPERT users.

{base_rules.replace('français', 'English')}

EXPERT ADAPTATION (User AI Level: {user_ai_level}/5):
- Precise technical terminology
- Methodological and theoretical references
- Bias and limitation analysis
- Concrete optimization suggestions
- Deep algorithmic insights

Provide advanced technical insights with specific data."""
            
            else:
                return f"""You are an ML assistant for INTERMEDIATE level users.

{base_rules.replace('français', 'English')}

INTERMEDIATE ADAPTATION (User AI Level: {user_ai_level}/5):
- Balance accessibility and technical precision
- Define technical terms when used
- Concrete examples with real data
- Educational and supportive tone

Use specific context data provided."""


# Instance globale du service LLM
llm_service = LLMExplanationService()

def get_llm_service() -> LLMExplanationService:
    """Récupérer l'instance du service LLM."""
    return llm_service
