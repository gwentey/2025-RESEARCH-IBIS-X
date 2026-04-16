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
                logger.info(f"✅ Utilisation GPT-5 Nano : {self.model}")
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
                return """Tu es un assistant IA spécialisé dans l'explication de modèles d'intelligence artificielle pour des débutants. 
Utilise des mots simples et des analogies de la vie quotidienne. Sois encourageant et pédagogique."""

            elif audience_level == 'expert':
                return """Tu es un expert en explicabilité des modèles de machine learning (XAI). 
Fournis des explications techniques précises avec terminologie appropriée et insights méthodologiques."""

            else:  # intermediate
                return """Tu es un assistant IA spécialisé dans l'explication de modèles de machine learning. 
Utilise un équilibre entre accessibilité et précision technique. Explique les concepts clés de manière compréhensible."""

        else:  # English
            if audience_level == 'novice':
                return """You are an AI assistant specialized in explaining machine learning models to beginners. 
Use simple language and everyday analogies. Be encouraging and educational."""

            elif audience_level == 'expert':
                return """You are an expert in machine learning model explainability (XAI). 
Provide precise technical explanations with appropriate terminology and methodological insights."""

            else:  # intermediate
                return """You are an AI assistant specialized in explaining machine learning models. 
Balance accessibility and technical precision. Explain key concepts in understandable terms."""
    
    def _build_explanation_prompt(self, 
                                explanation_data: Dict[str, Any],
                                user_preferences: Dict[str, Any], 
                                audience_level: str,
                                language: str,
                                context: Dict[str, Any]) -> str:
        """Construire le prompt d'explication principal."""
        
        method = explanation_data.get('method', 'unknown')
        model_algorithm = context.get('model_algorithm', 'unknown')
        
        if language == 'fr':
            base_instruction = f"""Tu dois expliquer les résultats d'explicabilité {method.upper()} pour ce modèle {model_algorithm}.

RÈGLES ABSOLUES:
- Utilise SEULEMENT les données fournies
- Maximum 150 mots, 2 paragraphes
- Format: **gras** pour les variables importantes

Explique maintenant les résultats avec les vraies données."""
        else:
            base_instruction = f"""Explain the {method.upper()} explainability results for this {model_algorithm} model.
Use only provided data, maximum 150 words."""

        return base_instruction
    
    def _build_contextual_explanation_prompt(self,
                                           explanation_data: Dict[str, Any],
                                           ml_context: Dict[str, Any],
                                           user_preferences: Dict[str, Any],
                                           audience_level: str,
                                           language: str) -> str:
        """🎯 Prompt ULTRA-SPÉCIFIQUE avec vraies données ML."""
        
        # Extraire les données contextuelles
        dataset_name = ml_context.get('dataset_name', 'Dataset')
        algorithm = ml_context.get('algorithm_display', 'Modèle')
        accuracy = ml_context.get('metrics', {}).get('overall_score', 0)
        class_names = ml_context.get('class_names', [])
        confusion_errors = ml_context.get('confusion_errors', [])
        feature_importance = ml_context.get('feature_importance', {})
        user_ai_level = user_preferences.get('ai_familiarity', 3)
        
        logger.info(f"🎯 Prompting contextuel - Dataset: {dataset_name}, Algo: {algorithm}, Accuracy: {accuracy}%, Niveau IA: {user_ai_level}")
        
        if language == 'fr':
            if user_ai_level <= 2:  # NIVEAU NOVICE
                base_instruction = f"""Tu expliques à un débutant les résultats de son modèle {algorithm}.

🎯 CONTEXTE SPÉCIFIQUE - VRAIES DONNÉES :
- Dataset : {dataset_name}
- Modèle : {algorithm} 
- Performance : {accuracy}% de réussite
- Classes : {', '.join(class_names) if class_names else 'Classes non spécifiées'}

✅ STYLE OBLIGATOIRE POUR DÉBUTANT :
- Langage très simple, pas de termes techniques
- Analogies de la vie quotidienne
- Explique POURQUOI c'est important
- Maximum 180 mots

Explique maintenant pourquoi ce modèle {algorithm} obtient {accuracy}% sur {dataset_name}."""
            
            elif user_ai_level >= 4:  # NIVEAU EXPERT
                base_instruction = f"""Analyse technique approfondie pour un expert ML du modèle {algorithm}.

🎯 CONTEXTE TECHNIQUE COMPLET - DONNÉES RÉELLES :
- Dataset : {dataset_name}
- Algorithme : {algorithm}
- Performance globale : {accuracy}%
- Classes détectées : {', '.join(class_names) if class_names else 'Non spécifiées'}

⚠️ CONTRAINTES TECHNIQUES STRICTES :
1. Utilise UNIQUEMENT les données ci-dessus
2. Mentionne les VRAIES performances : {accuracy}%
3. Maximum 250 mots, format technique précis

Analyse maintenant les performances de ce modèle {algorithm} sur {dataset_name}."""
            
            else:  # NIVEAU INTERMÉDIAIRE (3)
                base_instruction = f"""Explique à quelqu'un avec des connaissances de base en ML son modèle {algorithm}.

🎯 CONTEXTE ÉQUILIBRÉ - VRAIES DONNÉES :
- Dataset : {dataset_name}
- Modèle : {algorithm}
- Performance : {accuracy}% d'accuracy
- Classes : {', '.join(class_names) if class_names else 'Classes non spécifiées'}

✅ STYLE OBLIGATOIRE NIVEAU INTERMÉDIAIRE :
- Équilibre entre accessibilité et précision technique
- Maximum 220 mots

Explique maintenant pourquoi ce modèle {algorithm} obtient {accuracy}% sur {dataset_name}."""
        
        else:  # English
            base_instruction = f"""Explain {algorithm} model results with appropriate technical detail.

🎯 CONTEXT - REAL DATA:
- Dataset: {dataset_name}
- Model: {algorithm} 
- Performance: {accuracy}% accuracy

Explain why this model achieves {accuracy}% on {dataset_name}."""
        
        return base_instruction
    
    def process_chat_question(self,
                             question: str,
                             explanation_context: Dict[str, Any],
                             user_preferences: Dict[str, Any],
                             chat_history: List[Dict[str, str]] = None) -> Dict[str, Any]:
        """Traiter une question de chat sur les explications."""
        
        try:
            language = explanation_context.get('language', 'fr')
            audience_level = explanation_context.get('audience_level', 'intermediate')
            
            # Construire le contexte de conversation
            system_prompt = self._get_chat_system_prompt(audience_level, language)
            user_ai_level = user_preferences.get('ai_familiarity', 3)
            
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
                context_prompt = f"Contexte: Modèle d'IA pour {explanation_context.get('model_algorithm', 'classification')}"
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
            
            # - UPGRADE GPT-5 NANO : Tentative d'abord, fallback robuste
            try:
                response = self.client.beta.chat.completions.parse(
                    model=self.model,  # - gpt-5-nano depuis config
                    messages=messages,
                    max_tokens=min(800, self.max_tokens),
                    temperature=0.8
                )
                logger.info(f"✅ Chat GPT-5 Nano utilisé : {self.model}")
            except Exception as gpt5_chat_error:
                # - FALLBACK Chat vers GPT-4o-mini
                logger.warning(f"GPT-5 Nano chat indisponible, fallback: {gpt5_chat_error}")
                response = self.client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=messages,
                    max_tokens=min(800, self.max_tokens),
                    temperature=0.8
                )
            
            answer = response.choices[0].message.content
            tokens_used = response.usage.total_tokens if response.usage else 0
            
            return {
                'answer': answer,
                'tokens_used': tokens_used,
                'model_used': self.model if 'gpt5_chat_error' not in locals() else "gpt-4o-mini",
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
            base = """Tu es un assistant IA spécialisé dans l'explicabilité des modèles de machine learning. 
Tu réponds aux questions sur SHAP, LIME, et l'interprétation des résultats ML.
Utilise un langage adapté au niveau de l'utilisateur."""
            
            if audience_level == 'novice':
                return base + " Style : Langage simple, analogies du quotidien."
            elif audience_level == 'expert':
                return base + " Style : Technique détaillé, terminologie appropriée."
            else:
                return base + " Style : Équilibre accessibilité et précision technique."
        
        else:  # English
            base = """You are an AI assistant specialized in machine learning model explainability. 
You answer questions about SHAP/LIME explanation results."""
            
            if audience_level == 'novice':
                return base + " Use simple, accessible language."
            elif audience_level == 'expert':
                return base + " Provide detailed technical responses."
            else:
                return base + " Balance accessibility and technical precision."
    
    def _build_contextual_chat_prompt(self,
                                    explanation_context: Dict[str, Any],
                                    ml_context: Dict[str, Any],
                                    user_preferences: Dict[str, Any],
                                    language: str) -> str:
        """💬 Contexte de chat enrichi avec vraies données ML."""
        
        dataset_name = ml_context.get('dataset_name', 'Dataset')
        algorithm = ml_context.get('algorithm_display', 'Modèle')
        accuracy = ml_context.get('metrics', {}).get('overall_score', 0)
        class_names = ml_context.get('class_names', [])
        user_ai_level = user_preferences.get('ai_familiarity', 3)
        
        if language == 'fr':
            context_prompt = f"""💬 CONTEXTE PERSONNALISÉ - NIVEAU {user_ai_level}/5 :

📊 VOTRE MODÈLE : {algorithm} sur {dataset_name}
🏆 PERFORMANCE : {accuracy}% d'accuracy
🏷️ CLASSES : {', '.join(class_names) if class_names else 'Classes du dataset'}

🎯 INSTRUCTIONS : Réponds avec les données spécifiques de ce modèle."""
        else:
            context_prompt = f"""💬 PERSONALIZED CONTEXT - LEVEL {user_ai_level}/5:

📊 YOUR MODEL: {algorithm} on {dataset_name}
🏆 PERFORMANCE: {accuracy}% accuracy
🏷️ CLASSES: {', '.join(class_names) if class_names else 'Dataset classes'}

🎯 INSTRUCTIONS: Answer with specific data from this model."""
        
        return context_prompt


# Instance globale du service LLM
llm_service = LLMExplanationService()

def get_llm_service() -> LLMExplanationService:
    """Récupérer l'instance du service LLM."""
    return llm_service
