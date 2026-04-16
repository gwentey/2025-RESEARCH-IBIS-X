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
    
    def _build_chat_params(self, messages, max_tokens=None):
        """
        Construire les paramètres OpenAI selon le modèle.
        GPT-5 : max_completion_tokens, pas de temperature (forcée à 1)
        Autres : max_tokens, temperature configurable
        """
        params = {
            "model": self.model,
            "messages": messages,
        }
        
        if "gpt-5" in self.model.lower():
            # IMPORTANT: GPT-5 utilise des tokens pour raisonnement + réponse, donc on multiplie par 2
            params["max_completion_tokens"] = (max_tokens or self.max_tokens) * 2
            # GPT-5 n'accepte PAS de temperature ≠ 1 → on ne met rien (défaut = 1)
        else:
            params["max_tokens"] = max_tokens or self.max_tokens
            params["temperature"] = self.temperature  # GPT-4o, GPT-3.5, etc.
            
        return params

    def count_tokens(self, text: str) -> int:
        """Compter le nombre de tokens dans un texte."""
        return len(self.encoder.encode(text))
    
    def generate_explanation(self, 
                           explanation_data: Dict[str, Any],
                           user_preferences: Dict[str, Any],
                           context: Dict[str, Any]) -> Dict[str, Any]:
        """Générer une explication textuelle adaptée au niveau utilisateur."""
        
        try:
            # 🔥 VÉRIFICATION CRITIQUE : Clé API OpenAI disponible
            if not settings.openai_api_key:
                logger.error("❌ ERREUR CRITIQUE: Clé API OpenAI manquante !")
                return {
                    'text_explanation': None,
                    'error': 'Clé API OpenAI non configurée',
                    'success': False
                }
            
            # Construire le prompt selon le niveau d'audience
            audience_level = context.get('audience_level', 'intermediate')
            language = context.get('language', 'fr')
            
            logger.info(f"🎯 Service LLM - OpenAI key available: {bool(settings.openai_api_key)}")
            logger.info(f"🎯 Service LLM - Model: {self.model}")
            
            # 🎯 DEBUG CONTEXTE ML COMPLET
            ml_context = user_preferences.get('full_ml_context', {})
            logger.info(f"🐛 DEBUG ML CONTEXT DISPONIBLE: {bool('full_ml_context' in user_preferences)}")
            if ml_context:
                logger.info(f"🐛 ML Context dataset_name: {ml_context.get('dataset_name', 'MISSING')}")
                logger.info(f"🐛 ML Context algorithm: {ml_context.get('algorithm', 'MISSING')}")
                logger.info(f"🐛 ML Context metrics: {ml_context.get('metrics', {})}")
                logger.info(f"🐛 ML Context size: {len(ml_context)} champs")
            
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
                logger.info(f"🎯 Prompt généré ({len(prompt)} caractères)")
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
            
            # 🎯 FORCER L'UTILISATION DE GPT-4o-mini pour éviter les erreurs
            logger.info(f"🎯 UTILISATION DIRECTE GPT-4o-mini pour stabilité")
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ]
            
            logger.info(f"🐛 DEBUG OPENAI CALL:")
            logger.info(f"  - Model: gpt-4o-mini")
            logger.info(f"  - Messages count: {len(messages)}")
            logger.info(f"  - System prompt length: {len(system_prompt)}")
            logger.info(f"  - User prompt length: {len(prompt)}")
            
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                max_tokens=1500,  # Plus de tokens pour descriptions longues
                temperature=0.7
            )
            
            logger.info(f"✅ Réponse OpenAI reçue avec succès")
            
            # 🎯 TRAITEMENT STANDARD: Toutes les réponses utilisent l'API chat.completions
            explanation_text = response.choices[0].message.content
            tokens_used = response.usage.total_tokens if response.usage else 0
            
            logger.info(f"✅ Explication générée: {len(explanation_text)} caractères, {tokens_used} tokens")
                
            return {
                'text_explanation': explanation_text,
                'tokens_used': tokens_used,
                'model_used': "gpt-4o-mini",  # Modèle utilisé (forcé pour stabilité)
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
    
    def _generate_fallback_explanation(self, 
                                     explanation_data: Dict[str, Any],
                                     user_preferences: Dict[str, Any],
                                     context: Dict[str, Any]) -> Dict[str, Any]:
        """Générer une explication de fallback sans OpenAI."""
        
        try:
            audience_level = context.get('audience_level', 'intermediate')
            language = context.get('language', 'fr')
            
            # Récupérer le contexte ML si disponible
            ml_context = user_preferences.get('full_ml_context', {})
            dataset_name = ml_context.get('dataset_name', 'le dataset')
            algorithm = ml_context.get('algorithm', 'votre modèle')
            accuracy = ml_context.get('metrics', {}).get('overall_score', 85)
            
            # Feature importance pour les exemples
            feature_importance = ml_context.get('feature_importance', {})
            top_features = []
            if feature_importance:
                sorted_features = sorted(feature_importance.items(), key=lambda x: abs(x[1]), reverse=True)[:3]
                top_features = [name for name, _ in sorted_features]
            
            user_ai_level = user_preferences.get('ai_familiarity', 3)
            
            logger.info(f"🔄 Génération fallback - Niveau: {audience_level}, AI Level: {user_ai_level}")
            
            if language == 'fr':
                if user_ai_level <= 2:  # NIVEAU DÉBUTANT
                    text_explanation = f"""Imaginez que vous êtes médecin scolaire avec un grand nombre d'élèves à surveiller. Votre système d'intelligence artificielle ({algorithm}) est comme un assistant ultra-observateur qui a analysé {dataset_name} et vous dit : "J'ai identifié les patterns importants". 

Sur 100 diagnostics, il a raison {accuracy:.0f} fois - c'est {'excellent' if accuracy > 90 else 'très bon' if accuracy > 80 else 'correct'} ! Le système a découvert que {'les facteurs les plus importants sont' if top_features else 'plusieurs facteurs sont critiques'} : {top_features[0] if top_features else 'facteur principal'} et {top_features[1] if len(top_features) > 1 else 'autres variables importantes'}.

Grâce à cette analyse, vous savez maintenant exactement quels patterns observer en priorité. C'est comme avoir un guide expert qui vous montre exactement où regarder !"""

                elif user_ai_level >= 4:  # NIVEAU EXPERT  
                    text_explanation = f"""Le modèle {algorithm} démontre une performance de {accuracy:.1f}% d'accuracy sur {dataset_name}. L'analyse révèle une structure de décision basée sur l'importance relative des features : {', '.join(top_features[:3]) if top_features else 'features principales analysées'}.

Les patterns identifiés suggèrent une séparabilité efficace dans l'espace des caractéristiques avec une généralisabilité robuste. La méthode SHAP confirme la stabilité des importances calculées, validant l'architecture du modèle pour ce cas d'usage.

Cette analyse technique permet d'identifier les leviers d'optimisation et de comprendre les mécanismes de décision du modèle sur ce dataset spécifique."""

                else:  # NIVEAU INTERMÉDIAIRE
                    text_explanation = f"""Votre modèle {algorithm} atteint une performance de {accuracy:.1f}% d'accuracy sur {dataset_name}, ce qui indique {'une excellente' if accuracy > 90 else 'une bonne' if accuracy > 80 else 'une correcte'} capacité de prédiction.

L'analyse SHAP révèle que {len(top_features) if top_features else 'plusieurs'} variables sont particulièrement importantes : {', '.join(top_features[:3]) if top_features else 'variables principales du dataset'}. Ces features représentent les facteurs clés que le modèle utilise pour ses prédictions.

Cette validation croise l'importance des variables avec l'analyse de performance, confirmant la pertinence du modèle pour votre cas d'usage."""

            else:  # English fallback
                text_explanation = f"Your {algorithm} model achieves {accuracy:.1f}% accuracy on {dataset_name}. The SHAP analysis reveals key features: {', '.join(top_features[:3]) if top_features else 'main dataset features'}. This performance indicates good predictive capability for your use case."
            
            return {
                'text_explanation': text_explanation,
                'tokens_used': 0,
                'model_used': 'fallback_static',
                'audience_level': audience_level,
                'language': language,
                'success': True
            }
            
        except Exception as e:
            logger.error(f"Erreur génération fallback: {e}")
            return {
                'text_explanation': "Analyse technique basée sur les résultats du modèle entraîné.",
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
        """🎯 Prompt ULTRA-SPÉCIFIQUE avec vraies données ML et descriptions textuelles par niveau."""
        
        # Extraire les données contextuelles enrichies
        dataset_name = ml_context.get('dataset_name', 'Dataset')
        algorithm = ml_context.get('algorithm_display', 'Modèle')
        metrics = ml_context.get('metrics', {})
        accuracy = metrics.get('overall_score', 0)
        raw_metrics = metrics.get('raw_metrics', {})
        class_names = ml_context.get('class_names', [])
        confusion_errors = ml_context.get('confusion_errors', [])
        feature_importance = ml_context.get('feature_importance', {})
        user_ai_level = user_preferences.get('ai_familiarity', 3)
        dataset_size = ml_context.get('dataset_size', 0)
        task_type = ml_context.get('task_type', 'classification')
        
        # Extraire métriques détaillées
        f1_score = raw_metrics.get('f1_score', raw_metrics.get('f1', 0)) * 100 if raw_metrics.get('f1_score', raw_metrics.get('f1', 0)) else 0
        precision = raw_metrics.get('precision', 0) * 100 if raw_metrics.get('precision', 0) else 0
        recall = raw_metrics.get('recall', 0) * 100 if raw_metrics.get('recall', 0) else 0
        
        # Analyser les erreurs principales
        main_confusion_error = ""
        if confusion_errors and len(confusion_errors) > 0:
            error = confusion_errors[0]
            arrow_symbol = "→"  # Définir le symbole de flèche séparément
            main_confusion_error = f"Erreur principale : {error.get('count', 0)} confusions {error.get('true_class', '?')}{arrow_symbol}{error.get('predicted_class', '?')}"
        
        # Extraire features les plus importantes
        top_features = []
        top_feature_names = []
        if isinstance(feature_importance, dict) and feature_importance:
            # Prendre les 3 features les plus importantes
            sorted_features = sorted(feature_importance.items(), key=lambda x: abs(x[1]), reverse=True)[:3]
            top_features = [f"{name} ({value:.3f})" for name, value in sorted_features]
            top_feature_names = [name for name, _ in sorted_features]
        
        logger.info(f"🎯 Prompting contextuel enrichi - Dataset: {dataset_name}, Algo: {algorithm}, Accuracy: {accuracy}%, F1: {f1_score}%, Niveau IA: {user_ai_level}")
        
        if language == 'fr':
            if user_ai_level <= 2:  # NIVEAU DÉBUTANT (Métaphores simples)
                # Variables pour éviter les backslashes dans les f-strings
                expert_quality = "mieux qu'un expert humain" if accuracy > 85 else "très correct"
                symptom_count = "deux symptômes sont critiques" if len(top_feature_names) >= 2 else "un symptôme est critique"
                main_factor = top_feature_names[0] if top_feature_names else "un facteur principal"
                medical_analogy = "arrêter de prendre ses médicaments" if top_feature_names and 'completion' in str(top_feature_names[0]).lower() else "manquer ses rendez-vous médicaux"
                difficulty_example = top_feature_names[0] if top_feature_names else "des difficultés"
                
                base_instruction = f"""MISSION CRITIQUE : Tu DOIS générer une explication EXACTEMENT comme cet exemple, mais adaptée aux données ci-dessous.

🟢 MODÈLE EXACT À REPRODUIRE (NIVEAU DÉBUTANT) :
"Imaginez que vous êtes médecin scolaire avec 500 élèves à surveiller. Notre système EXAI est comme un assistant ultra-observateur qui a analysé tous vos élèves et vous dit : 'J'ai trouvé les 50 qui vont mal'. Sur 100 diagnostics, il a raison 98 fois - c'est mieux qu'un expert humain ! Le système a découvert que deux symptômes sont critiques : ne pas rendre ses devoirs (comme arrêter de prendre ses médicaments) et être souvent absent (comme manquer ses rendez-vous médicaux). Si un élève cumule ces deux signaux rouges, c'est l'alerte maximale. La matrice de confusion montre que sur nos 100 élèves tests, seulement 2 ont été mal classés. C'est comme si votre assistant ne se trompait que 2 fois sur 100 consultations. L'arbre de décision fonctionne comme un questionnaire médical : 'L'élève a-t-il moins de 75% de présence ? Si oui, risque élevé. Sinon, vérifions ses devoirs.' Grâce à cette analyse, vous savez maintenant exactement qui aider en priorité et comment : surveillez les devoirs et la présence, c'est 80% du problème résolu."

🎯 TES DONNÉES RÉELLES À UTILISER :
- Dataset : {dataset_name} ({dataset_size} échantillons)
- Modèle : {algorithm} 
- Performance exacte : {accuracy}% de réussite
- Variables importantes : {', '.join(top_feature_names[:2]) if top_feature_names else 'Variables principales'}
- Erreurs : {main_confusion_error if main_confusion_error else 'Peu d erreurs détectées'}

🚨 RÈGLES ABSOLUES À RESPECTER :
1. LONGUEUR : Minimum 180 mots, comme l'exemple (pas moins !)
2. STRUCTURE : Reproduis EXACTEMENT la structure de l'exemple médecin scolaire
3. ANALOGIES : Utilise des analogies simples adaptées à {dataset_name}
4. DONNÉES RÉELLES : Remplace 500 élèves → {dataset_size} échantillons, 98 fois → {accuracy} fois, etc.
5. VARIABLES : Remplace "devoirs/présence" par tes vraies variables importantes
6. STYLE : Métaphores de la vie quotidienne, langage simple et encourageant

ÉCRIS MAINTENANT une description de 180+ mots qui suit EXACTEMENT le modèle ci-dessus mais avec tes données réelles."""            

            
            elif user_ai_level >= 4:  # NIVEAU EXPERT (Analyse approfondie)
                # Variables pour éviter expressions complexes dans f-strings
                oob_score = accuracy + 1.5
                main_feature = top_feature_names[0] if top_feature_names else 'feature_principale'
                main_shap_value = top_features[0].split('(')[1].rstrip(')') if top_features else '0.445'
                second_feature = top_feature_names[1] if len(top_feature_names) > 1 else 'autre_feature'
                gini_variance = min(62, accuracy)
                
                base_instruction = f"""MISSION CRITIQUE : Tu DOIS reproduire EXACTEMENT le style et la longueur de cet exemple expert (320+ mots).

🔴 MODÈLE EXACT À REPRODUIRE (NIVEAU EXPERT) :
"Le modèle Random Forest (100 estimateurs, max_depth=auto, criterion=gini) démontre une convergence optimale avec un Score OOB de 99.5% suggérant une variance minimale inter-arbres et une généralisation robuste sans recours à la validation croisée k-fold. L'écart minimal entre F1-macro (96.2%) et F1-weighted (98.0%) indique une gestion efficace du déséquilibre de classes (70%/20%/10%) sans recours à SMOTE ou class_weight. L'analyse SHAP révèle une non-linéarité significative dans les interactions features : homework_completion (SHAP=0.445) présente un effet seuil à 55% avec interaction synergique avec attendance_rate (SHAP=0.401) produisant un OR=12.3 pour risk_level='Élevé' lors de co-occurrence <70% attendance ET <50% homework. La décomposition Gini du premier split (attendance_rate<74.5, impurity_decrease=0.37) capture 62% de la variance totale, suggérant une structure hiérarchique forte exploitable par des modèles plus parcimonieux. Les embeddings catégoriels via One-Hot sur parental_engagement montrent une contribution marginale (SHAP=0.059) questionnant la pertinence du feature engineering manuel versus apprentissage de représentations. La stabilité des importances entre Feature Importance RF (attendance=0.25) et SHAP (attendance=0.401) après normalisation confirme l'absence de corrélations spurieuses. Performance comparable attendue avec XGBoost (estimé +1-2% AUC) mais au coût d'interprétabilité réduite, validant le choix architectural Random Forest pour ce use-case production nécessitant explicabilité réglementaire GDPR Article 22."

🎯 TES DONNÉES RÉELLES À UTILISER :
- Dataset : {dataset_name} ({dataset_size} échantillons)
- Algorithme : {algorithm}
- Performance : {accuracy}% accuracy, F1={f1_score:.1f}%
- Variables importantes : {', '.join(top_feature_names[:3]) if top_feature_names else 'Variables principales'}
- Erreurs détectées : {main_confusion_error if main_confusion_error else 'Analyse des patterns d erreur'}

🚨 CONTRAINTES ABSOLUES :
1. LONGUEUR : Minimum 320 mots comme l'exemple (OBLIGATOIRE)
2. TERMINOLOGIE : Score OOB, SHAP, Gini, variance inter-arbres, class_weight, SMOTE
3. STRUCTURE : Convergence → F1 → SHAP → Gini → embeddings → stabilité → XGBoost → GDPR
4. DONNÉES RÉELLES : Utilise {accuracy}% au lieu de 99.5%, {main_feature} au lieu de homework_completion
5. DÉTAILS TECHNIQUES : Interactions features, seuils, OR ratios, impurity_decrease

ÉCRIS une analyse de 320+ mots qui reproduit FIDÈLEMENT le style expert de l'exemple."""            

            
            else:  # NIVEAU INTERMÉDIAIRE (Avec métriques)
                # Variables pour éviter expressions complexes dans f-strings
                oob_score_intermediate = min(99.5, accuracy + 1.5)
                main_variable = top_feature_names[0] if top_feature_names else 'variable_principale'
                main_importance = top_features[0].split('(')[1].rstrip(')') if top_features else '0.445'
                second_variable = top_feature_names[1] if len(top_feature_names) > 1 else 'variable_secondaire'
                
                # Calcul de l'importance cumulée
                if len(top_features) >= 2:
                    try:
                        cumulated_importance = min(84.6, sum([float(f.split('(')[1].rstrip(')')) for f in top_features[:2]]) * 100)
                    except (ValueError, IndexError):
                        cumulated_importance = 70.0
                else:
                    cumulated_importance = 70.0
                
                auc_score = min(0.97, accuracy/100)
                
                base_instruction = f"""MISSION CRITIQUE : Tu DOIS reproduire EXACTEMENT le style et la longueur de cet exemple intermédiaire (280+ mots).

🟡 MODÈLE EXACT À REPRODUIRE (NIVEAU INTERMÉDIAIRE) :
"Notre modèle Random Forest atteint une performance exceptionnelle de 98% d'accuracy sur la classification tri-classe (Faible/Moyen/Élevé) avec un F1-Score macro de 96.2%, garantissant une performance équilibrée sur toutes les catégories. Le Score OOB de 99.5% valide l'absence de sur-apprentissage, confirmant la robustesse du modèle sur données non vues. L'analyse SHAP révèle que homework_completion (0.445) et attendance_rate (0.401) représentent 84.6% de l'importance cumulée, suivis par average_grades (0.363) et participation_score (0.281). La matrice de confusion montre une précision parfaite sur les classes Faible (64/64) et Moyen (20/20), avec un rappel de 87.5% sur la classe critique Élevé (14/16). Les courbes ROC multi-classes affichent des AUC supérieures à 0.97 pour toutes les classes, indiquant une excellente discrimination. L'arbre de décision révèle que le seuil critique d'attendance_rate se situe à 74.5%, en dessous duquel 87% des élèves sont classés à risque. Cette double validation (Feature Importance + SHAP) confirme la prédominance des facteurs comportementaux (devoirs/présence) sur les facteurs académiques purs (notes)."

🎯 TES DONNÉES RÉELLES À UTILISER :
- Dataset : {dataset_name} ({dataset_size} échantillons)
- Modèle : {algorithm}
- Performance : {accuracy}% d'accuracy, F1-score : {f1_score:.1f}%
- Classes : {', '.join(class_names) if class_names else 'Classes analysées'}
- Variables clés : {', '.join(top_feature_names[:3]) if top_feature_names else 'Variables principales'}
- Erreurs : {main_confusion_error if main_confusion_error else 'Analyse de la matrice de confusion'}

🚨 CONTRAINTES ABSOLUES :
1. LONGUEUR : Minimum 280 mots comme l'exemple (OBLIGATOIRE)
2. STRUCTURE : Performance → Score OOB → SHAP → Matrice → ROC → Arbre → Validation
3. MÉTRIQUES : F1-Score macro, Score OOB, AUC, seuils critiques, rappel/précision
4. DONNÉES RÉELLES : Remplace homework_completion par {main_variable}, 98% par {accuracy}%
5. ANALYSE : Double validation Feature Importance + SHAP obligatoire

ÉCRIS une explication de 280+ mots qui reproduit EXACTEMENT le style intermédiaire de l'exemple."""
        
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
            
            # 🎯 CORRECTION CRITIQUE: Utiliser les vraies données disponibles dans explanation_context
            # Vérifier si nous avons des vraies données ML dans explanation_context
            has_real_data = (
                explanation_context.get('real_accuracy', 0) > 0 and
                explanation_context.get('dataset_name', 'Dataset') != 'Dataset'
            )
            
            if has_real_data:
                # Utiliser les vraies données disponibles dans explanation_context
                context_prompt = self._build_contextual_chat_prompt_from_context(
                    explanation_context,
                    user_preferences,
                    language
                )
                logger.info(f"💬 Chat contextualisé avec vraies données ML: Dataset={explanation_context.get('dataset_name')}, Accuracy={explanation_context.get('real_accuracy')}%")
            elif 'full_ml_context' in user_preferences and user_preferences['full_ml_context']:
                # Fallback vers user_preferences si disponible
                context_prompt = self._build_contextual_chat_prompt(
                    explanation_context, 
                    user_preferences['full_ml_context'],
                    user_preferences,
                    language
                )
                logger.info(f"💬 Chat contextualisé depuis user_preferences")
            else:
                # Dernier fallback vers contexte générique
                context_prompt = f"Contexte: Modèle d'IA pour {explanation_context.get('model_algorithm', 'classification')}"
                logger.warning("⚠️ Chat générique - pas de contexte ML disponible")
            
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
            
            # - UPGRADE GPT-5-mini : Tentative d'abord, fallback robuste
            try:
                # 🎯 CORRECTION: Utiliser la méthode utilitaire pour gérer les paramètres
                params = self._build_chat_params(messages, min(800, self.max_tokens))
                
                response = self.client.chat.completions.create(**params)
                logger.info(f"✅ Chat GPT-5-mini avec paramètres corrects: {self.model}")
            except Exception as gpt5_chat_error:
                # - FALLBACK Chat vers GPT-4o-mini
                logger.warning(f"GPT-5-mini chat indisponible, fallback: {gpt5_chat_error}")
                response = self.client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=messages,
                    max_tokens=min(800, self.max_tokens),  # GPT-4o-mini utilise max_tokens
                    temperature=0.7  # GPT-4o-mini supporte temperature, pas GPT-5
                )
            
            # 🎯 TRAITEMENT STANDARD: Toutes les réponses utilisent l'API chat.completions
            logger.info(f"🐛 RESPONSE DEBUG - response type: {type(response)}")
            logger.info(f"🐛 RESPONSE DEBUG - response.choices: {response.choices if response else 'None'}")
            logger.info(f"🐛 RESPONSE DEBUG - response.usage: {response.usage if response else 'None'}")
            
            if response and response.choices and len(response.choices) > 0:
                answer = response.choices[0].message.content
                logger.info(f"🐛 RESPONSE DEBUG - message.content: '{answer}'")
                logger.info(f"🐛 RESPONSE DEBUG - message.content type: {type(answer)}")
            else:
                answer = ""
                logger.warning("⚠️ RESPONSE DEBUG - Pas de choices dans la réponse OpenAI")
                
            tokens_used = response.usage.total_tokens if response and response.usage else 0
            logger.info(f"🐛 RESPONSE DEBUG - tokens_used: {tokens_used}")
                
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
        
        # Extraire toutes les données contextuelles
        dataset_name = ml_context.get('dataset_name', 'Dataset')
        algorithm = ml_context.get('algorithm_display', 'Modèle')
        metrics = ml_context.get('metrics', {})
        accuracy = metrics.get('overall_score', 0)
        raw_metrics = metrics.get('raw_metrics', {})
        class_names = ml_context.get('class_names', [])
        user_ai_level = user_preferences.get('ai_familiarity', 3)
        dataset_size = ml_context.get('dataset_size', 0)
        confusion_errors = ml_context.get('confusion_errors', [])
        feature_importance = ml_context.get('feature_importance', {})
        
        # 🎯 FIX CRITIQUE: Vérifier d'abord l'applicabilité des métriques
        task_type = ml_context.get('task_type', 'classification')
        is_regression = task_type == 'regression'
        classification_not_applicable = metrics.get('classification_metrics_not_applicable', False)
        
        logger.info(f"🚨 LLM FIX - Task Type: {task_type}")
        logger.info(f"🚨 LLM FIX - Is Regression: {is_regression}")
        logger.info(f"🚨 LLM FIX - Classification metrics not applicable: {classification_not_applicable}")
        
        # Extraire métriques selon le type de tâche
        if is_regression or classification_not_applicable:
            # 🎯 RÉGRESSION : Utiliser les métriques appropriées
            f1_score = -1  # Indicateur : F1 N'EST PAS APPLICABLE (pour éviter None dans f-strings)
            precision = -1
            recall = -1
            
            # Utiliser les métriques de régression
            r2_score = metrics.get('r2_score', raw_metrics.get('r2', 0))
            mae = metrics.get('mae', raw_metrics.get('mae', 0))
            mse = metrics.get('mse', raw_metrics.get('mse', 0))
            rmse = metrics.get('rmse', raw_metrics.get('rmse', 0))
            
            logger.info(f"✅ LLM REGRESSION - R² score: {r2_score}, MAE: {mae}, RMSE: {rmse}")
        else:
            # 🎯 CLASSIFICATION : Utiliser les métriques de classification
            f1_from_raw_metrics = raw_metrics.get('f1_score', raw_metrics.get('f1', 0))
            f1_from_main_metrics = metrics.get('f1_score', 0)
            
            f1_raw = f1_from_main_metrics or f1_from_raw_metrics
            f1_score = f1_raw * 100 if f1_raw else 0
            precision = raw_metrics.get('precision', 0) * 100 if raw_metrics.get('precision', 0) else 0
            recall = raw_metrics.get('recall', 0) * 100 if raw_metrics.get('recall', 0) else 0
            
            # Pas de métriques de régression pour classification
            r2_score = mae = mse = rmse = 0
            
            logger.info(f"✅ LLM CLASSIFICATION - F1: {f1_score}%, Precision: {precision}%, Recall: {recall}%")
        
        # Analyser erreur principale
        main_error = ""
        if confusion_errors and len(confusion_errors) > 0:
            error = confusion_errors[0]
            main_error = f"{error.get('count', 0)} confusions {error.get('true_class', '?')}→{error.get('predicted_class', '?')}"
        
        # Top features avec pourcentages exacts
        top_features = []
        top_features_detailed = []
        if isinstance(feature_importance, dict) and feature_importance:
            sorted_features = sorted(feature_importance.items(), key=lambda x: abs(x[1]), reverse=True)[:3]
            top_features = [name for name, _ in sorted_features]
            top_features_detailed = [f"{name.replace('num__', '')}: {value*100:.1f}%" for name, value in sorted_features]
            
        logger.info(f"🐛 LLM DEBUG - top_features_detailed: {top_features_detailed}")
        
        # Matrice de confusion spécifique
        confusion_matrix_display = ""
        confusion_matrix_data = ml_context.get('confusion_matrix', [])
        if confusion_matrix_data and isinstance(confusion_matrix_data, list):
            logger.info(f"🐛 LLM DEBUG - confusion_matrix_data: {confusion_matrix_data}")
            confusion_matrix_display = f"Matrice réelle: {confusion_matrix_data}"
        
        # 🎯 FIX: Construire les prompts selon le type de tâche
        if is_regression or classification_not_applicable:
            # PROMPTS POUR RÉGRESSION
            performance_text = f"{accuracy}% R² score (variance expliquée)"
            metrics_detail = f"R² : {r2_score*100:.1f}%, MAE : {mae:.2f}, RMSE : {rmse:.2f}"
            # 🚨 FIX: Sortir les chaînes avec apostrophes de l'f-string
            metrics_instruction = "CRITIQUE: Si on demande F1/précision/rappel, réponds que ces métriques ne s'appliquent PAS aux modèles de RÉGRESSION. Utilise uniquement R², MAE, RMSE pour la régression."
            task_type_display = "Régression"
        else:
            # PROMPTS POUR CLASSIFICATION  
            performance_text = f"{accuracy}% accuracy, F1-score {f1_score:.2f}%"
            metrics_detail = f"F1: {f1_score:.2f}%, Précision: {precision:.1f}%, Rappel: {recall:.1f}%"
            metrics_instruction = "Utilise les métriques de classification données"
            task_type_display = f"Classification - {', '.join(class_names) if class_names else 'Classes du dataset'}"

        if language == 'fr':
            if user_ai_level <= 2:  # NIVEAU NOVICE
                context_prompt = f"""💬 CHAT PERSONNALISÉ - NIVEAU DÉBUTANT :

🎓 VOTRE MODÈLE : {algorithm} sur le dataset {dataset_name}
🏆 PERFORMANCE EXACTE : {performance_text}
📊 DONNÉES : {dataset_size} échantillons analysés
🏷️ TYPE : {task_type_display}
{f"⚠️ ERREURS : {main_error}" if main_error else ""}
{f"🔑 VARIABLES IMPORTANTES : {', '.join(top_features_detailed[:2])}" if top_features_detailed else ""}
{f"📋 {confusion_matrix_display}" if confusion_matrix_display else ""}

🤖 INSTRUCTIONS DÉBUTANT :
- Utilise un langage simple et des analogies de la vie quotidienne
- OBLIGATOIRE: Cite les métriques appropriées ({metrics_detail})
- {metrics_instruction}
- Pour variables importantes: cite les pourcentages exacts
- Reste encourageant et pédagogique
- Maximum 150 mots par réponse"""

            elif user_ai_level >= 4:  # NIVEAU EXPERT
                context_prompt = f"""💬 CHAT EXPERT - ANALYSE TECHNIQUE :

🔬 MODÈLE : {algorithm} sur {dataset_name}
📊 MÉTRIQUES EXACTES : {performance_text}
📈 DATASET : {dataset_size} échantillons
🏷️ TYPE : {task_type_display}
{f"🔍 ERREURS : {main_error}" if main_error else ""}
{f"🎯 IMPORTANCE VARIABLES : {', '.join(top_features_detailed)}" if top_features_detailed else ""}
{f"📋 {confusion_matrix_display}" if confusion_matrix_display else ""}

🤖 INSTRUCTIONS EXPERT :
- Terminologie technique appropriée
- OBLIGATOIRE: Utilise les métriques EXACTES ci-dessus ({metrics_detail})
- {metrics_instruction}
- Pour matrice de confusion: utilise les vrais chiffres {confusion_matrix_data}
- Pour feature importance: cite les % exacts des variables
- Analyse limitations avec les données spécifiques
- Maximum 200 mots par réponse"""

            else:  # NIVEAU INTERMÉDIAIRE
                context_prompt = f"""💬 CONTEXTE PERSONNALISÉ - NIVEAU INTERMÉDIAIRE :

📊 VOTRE MODÈLE : {algorithm} sur {dataset_name}
🏆 PERFORMANCE EXACTE : {performance_text}
📈 ÉCHANTILLONS : {dataset_size} analysés
🏷️ TYPE : {task_type_display}
{f"⚠️ ERREURS : {main_error}" if main_error else ""}
{f"🔑 IMPORTANCE VARIABLES : {', '.join(top_features_detailed[:3])}" if top_features_detailed else ""}
{f"📋 {confusion_matrix_display}" if confusion_matrix_display else ""}

🎯 INSTRUCTIONS INTERMÉDIAIRE :
- Équilibre technique/accessibilité
- OBLIGATOIRE: Cite les métriques EXACTES ({metrics_detail})
- {metrics_instruction}
- Pour questions sur importance: donne les % exacts des variables
- Pour matrice confusion: utilise les chiffres réels {confusion_matrix_data}
- Maximum 220 mots par réponse"""
        else:
            context_prompt = f"""💬 PERSONALIZED CONTEXT - LEVEL {user_ai_level}/5:

📊 YOUR MODEL: {algorithm} on {dataset_name}
🏆 EXACT PERFORMANCE: {accuracy}% accuracy, F1 {f1_score:.2f}%
🏷️ CLASSES: {', '.join(class_names) if class_names else 'Dataset classes'}
{f"🔑 FEATURE IMPORTANCE: {', '.join(top_features_detailed[:3])}" if top_features_detailed else ""}
{f"📋 {confusion_matrix_display}" if confusion_matrix_display else ""}

🎯 INSTRUCTIONS: 
- MANDATORY: Use EXACT numbers above (F1: {f1_score:.2f}%, not approximations)
- For feature importance: cite exact percentages
- For confusion matrix: use real numbers {confusion_matrix_data}
- Be specific with the actual data from this model"""
        
        return context_prompt
    
    def _build_contextual_chat_prompt_from_context(self,
                                                 explanation_context: Dict[str, Any],
                                                 user_preferences: Dict[str, Any],
                                                 language: str) -> str:
        """💬 Contexte de chat enrichi utilisant directement les données depuis explanation_context."""
        
        # Extraire les vraies données depuis explanation_context
        dataset_name = explanation_context.get('dataset_name', 'Dataset')
        algorithm = explanation_context.get('algorithm_display', 'Modèle')
        real_accuracy = explanation_context.get('real_accuracy', 0)
        dataset_size = explanation_context.get('dataset_size', 0)
        class_names = explanation_context.get('real_class_names', [])
        real_metrics = explanation_context.get('real_metrics', {})
        confusion_errors = explanation_context.get('real_confusion_errors', [])
        feature_importance = explanation_context.get('real_feature_importance', {})
        user_ai_level = user_preferences.get('ai_familiarity', 3)
        
        # Extraire métriques additionnelles - CORRIGER F1
        # 🐛 DEBUG: Analyser les métriques disponibles dans cette méthode
        logger.info(f"🐛 LLM DEBUG CONTEXT - real_metrics type: {type(real_metrics)}")
        logger.info(f"🐛 LLM DEBUG CONTEXT - real_metrics value: {real_metrics}")
        
        # Chercher F1 dans différentes sources possibles 
        f1_from_real_metrics = (real_metrics.get('f1_score') or 
                               real_metrics.get('f1') or 
                               real_metrics.get('f1_macro') or 
                               real_metrics.get('f1_weighted') or 0)
        
        # Si c'est déjà un pourcentage (>1), ne pas multiplier par 100
        f1_score = f1_from_real_metrics * 100 if f1_from_real_metrics < 1 else f1_from_real_metrics
        
        precision = (real_metrics.get('precision') or 
                    real_metrics.get('precision_macro') or 
                    real_metrics.get('precision_weighted') or 0) * 100
        recall = (real_metrics.get('recall') or 
                 real_metrics.get('recall_macro') or 
                 real_metrics.get('recall_weighted') or 0) * 100
                 
        logger.info(f"🐛 LLM DEBUG CONTEXT - f1_score final: {f1_score}%")
        
        # Identifier les top features
        top_features = []
        if feature_importance:
            sorted_features = sorted(feature_importance.items(), key=lambda x: abs(x[1]), reverse=True)
            top_features = [f"{feat}({abs(imp):.2f})" for feat, imp in sorted_features[:3]]
        
        # Identifier l'erreur principale de confusion
        main_error = ""
        if confusion_errors and len(confusion_errors) > 0:
            error = confusion_errors[0]  # Prendre la première erreur
            if isinstance(error, dict):
                predicted = error.get('predicted_class', 'Classe1')
                actual = error.get('actual_class', 'Classe2') 
                count = error.get('count', 0)
                main_error = f"{count} confusions {actual}→{predicted}"
        
        logger.info(f"💬 Création contexte chat avec vraies données: {dataset_name}, {algorithm}, {real_accuracy}%")
        
        if language == 'fr':
            if user_ai_level >= 4:  # NIVEAU EXPERT
                context_prompt = f"""💬 CONTEXTE EXPERT - NIVEAU {user_ai_level}/5 :

📊 MODÈLE ANALYSÉ : {algorithm} sur {dataset_name}
🎯 PERFORMANCE DÉTAILLÉE :
   • Accuracy: {real_accuracy}%
   • F1-score: {f1_score:.1f}%
   • Precision: {precision:.1f}%
   • Recall: {recall:.1f}%
📈 DATASET : {dataset_size:,} échantillons
🏷️ CLASSES : {', '.join(class_names[:5]) if class_names else 'Classes non spécifiées'}
{f"⚠️ CONFUSION PRINCIPALE : {main_error}" if main_error else ""}
{f"🔑 VARIABLES IMPORTANTES : {', '.join(top_features)}" if top_features else ""}

🤖 INSTRUCTIONS EXPERT :
- Terminologie technique appropriée
- OBLIGATOIRE: Utilise F1 EXACT: {f1_score:.2f}% (pas d'approximation)
- Pour feature importance: cite les vrais pourcentages/scores
- Analyse limitations avec données spécifiques
- Maximum 250 mots par réponse"""

            elif user_ai_level <= 2:  # NIVEAU NOVICE
                context_prompt = f"""💬 CONTEXTE SIMPLIFIÉ - NIVEAU {user_ai_level}/5 :

📊 VOTRE INTELLIGENCE ARTIFICIELLE : {algorithm}
🎯 ANALYSE DES DONNÉES : {dataset_name}
🏆 RÉUSSITE : {real_accuracy}% de bonnes prédictions
📈 DONNÉES ANALYSÉES : {dataset_size:,} exemples
🏷️ CATÉGORIES : {len(class_names) if class_names else 'Plusieurs'} types différents

🎯 INSTRUCTIONS NOVICE :
- Langage simple et accessible
- OBLIGATOIRE: Utilise F1 exact {f1_score:.2f}% dans tes réponses
- Analogies du quotidien
- Évite le jargon technique
- Maximum 180 mots par réponse"""

            else:  # NIVEAU INTERMÉDIAIRE
                context_prompt = f"""💬 CONTEXTE PERSONNALISÉ - NIVEAU {user_ai_level}/5 :

📊 VOTRE MODÈLE : {algorithm} sur {dataset_name}
🏆 PERFORMANCE : {real_accuracy}% d'accuracy (F1: {f1_score:.1f}%)
📈 ÉCHANTILLONS : {dataset_size:,} analysés
🏷️ CLASSES : {', '.join(class_names[:4]) if class_names else 'Classes du dataset'}
{f"⚠️ ERREURS : {main_error}" if main_error else ""}
{f"🔑 VARIABLES CLÉS : {', '.join(top_features[:2])}" if top_features else ""}

🎯 INSTRUCTIONS INTERMÉDIAIRE :
- Équilibre technique/accessibilité
- OBLIGATOIRE: Cite F1 exact {f1_score:.2f}% (pas d'approximation)
- Utilise les données spécifiques ci-dessus
- Maximum 220 mots par réponse"""
                
        else:  # English
            context_prompt = f"""💬 PERSONALIZED CONTEXT - LEVEL {user_ai_level}/5:

📊 YOUR MODEL: {algorithm} on {dataset_name}
🏆 PERFORMANCE: {real_accuracy}% accuracy (F1: {f1_score:.1f}%)
📈 SAMPLES: {dataset_size:,} analyzed
🏷️ CLASSES: {', '.join(class_names[:4]) if class_names else 'Dataset classes'}
{f"⚠️ MAIN ERRORS: {main_error}" if main_error else ""}
{f"🔑 KEY FEATURES: {', '.join(top_features[:2])}" if top_features else ""}

🎯 INSTRUCTIONS: 
- MANDATORY: Use exact F1 {f1_score:.2f}% (no approximation)
- Cite specific data from this model
- Use real numbers from the context above"""
        
        return context_prompt

    def process_chat_question(self,
                            question: str,
                            explanation_context: Dict[str, Any],
                            user_preferences: Dict[str, Any],
                            chat_history: List[Dict[str, Any]] = None) -> Dict[str, Any]:
        """💬 Traiter une question de chat avec contexte ML enrichi."""
        
        try:
            # Récupérer le contexte ML live depuis les user_preferences
            ml_context = user_preferences.get('full_ml_context', {})
            language = explanation_context.get('language', 'fr')
            
            logger.info(f"💬 Chat contextualisé avec vraies données ML: Dataset={ml_context.get('dataset_name', 'N/A')}, "
                       f"Accuracy={ml_context.get('metrics', {}).get('overall_score', 'N/A')}%")
            
            # Construire le prompt contextuel
            context_prompt = self._build_contextual_chat_prompt(
                explanation_context, 
                ml_context, 
                user_preferences, 
                language
            )
            
            # Préparer l'historique de chat
            messages = []
            
            # Message système avec contexte
            system_message = {
                "role": "system",
                "content": context_prompt
            }
            messages.append(system_message)
            
            # Ajouter l'historique (maximum 5 derniers échanges)
            if chat_history:
                for msg in chat_history[-10:]:  # Derniers 10 messages (5 échanges)
                    if msg.get('message_type') == 'user_question':
                        messages.append({
                            "role": "user", 
                            "content": msg.get('content', '')
                        })
                    elif msg.get('message_type') == 'assistant_response':
                        messages.append({
                            "role": "assistant", 
                            "content": msg.get('content', '')
                        })
            
            # Question actuelle
            messages.append({
                "role": "user",
                "content": question
            })
            
            # Déterminer l'audience pour le prompt
            audience_level = user_preferences.get('ai_familiarity', 3)
            if audience_level <= 2:
                audience = "novice"
            elif audience_level >= 4:
                audience = "expert"  
            else:
                audience = "intermediate"
                
            logger.info(f"Traitement question chat - {len(messages)} messages, audience: {audience}")
            
            # Appel OpenAI avec fallback GPT-5-mini → GPT-4o-mini
            try:
                # 🎯 CORRECTION: GPT-5-mini utilise max_completion_tokens et pas de temperature
                params = {
                    "model": "gpt-5-mini",
                    "messages": messages,
                    # IMPORTANT: GPT-5 utilise des tokens pour raisonnement + réponse, donc on multiplie par 2
                    "max_completion_tokens": min(800, self.max_tokens) * 2
                    # GPT-5 n'accepte PAS de temperature ≠ 1 → on ne met rien (défaut = 1)
                }
                
                response = self.client.chat.completions.create(**params)
                
            except Exception as gpt5_error:
                # Fallback vers GPT-4o-mini
                logger.warning(f"GPT-5-mini chat indisponible, fallback: {gpt5_error}")
                response = self.client.chat.completions.create(
                    model="gpt-4o-mini", 
                    messages=messages,
                    max_tokens=min(800, self.max_tokens),  # GPT-4o-mini utilise max_tokens
                    temperature=0.7  # GPT-4o-mini supporte temperature, pas GPT-5
                )
            
            # 🎯 TRAITEMENT STANDARD: Toutes les réponses utilisent l'API chat.completions
            logger.info(f"🐛 PROCESS_CHAT DEBUG - response type: {type(response)}")
            logger.info(f"🐛 PROCESS_CHAT DEBUG - response.choices: {response.choices if response else 'None'}")
            logger.info(f"🐛 PROCESS_CHAT DEBUG - response.usage: {response.usage if response else 'None'}")
            
            if response and response.choices and len(response.choices) > 0:
                answer = response.choices[0].message.content
                logger.info(f"🐛 PROCESS_CHAT DEBUG - message.content: '{answer}'")
                logger.info(f"🐛 PROCESS_CHAT DEBUG - message.content type: {type(answer)}")
                return {
                    'success': True,
                    'answer': answer
                }
            else:
                logger.warning("⚠️ PROCESS_CHAT DEBUG - Pas de choices dans la réponse OpenAI")
                return {
                    'success': False,
                    'error': 'Pas de réponse d\'OpenAI'
                }
                
        except Exception as e:
            logger.error(f"Erreur dans process_chat_question: {e}")
            return {
                'success': False,
                'error': str(e)
            }


# Instance globale du service LLM
llm_service = LLMExplanationService()

def get_llm_service() -> LLMExplanationService:
    """Récupérer l'instance du service LLM."""
    return llm_service
