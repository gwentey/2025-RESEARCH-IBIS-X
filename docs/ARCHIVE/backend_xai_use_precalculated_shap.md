# 🚀 Optimisation XAI : Utilisation du SHAP Pré-calculé

> **Statut (2026-04-14)** : **Partiellement implémenté**. Le code réel expose la tâche Celery `generate_explanation_with_precalculated_shap` dans `xai-engine-service/app/tasks_precalculated.py` (queue `xai_queue`). Les noms de fonctions et la migration DB décrits ci-dessous diffèrent parfois du code final — voir annotations inline. Document conservé à titre de référence design.

## 📊 Contexte

Le système actuel recalcule le SHAP dans le service XAI-Engine alors que ces valeurs sont déjà calculées et stockées dans le ML Pipeline lors de l'entraînement du modèle.

## 🎯 Problème Identifié

### Flux Actuel (Inefficace)
1. **ML Pipeline** : Calcule le SHAP et le stocke dans `Experiment.feature_importance`
2. **Frontend** : Récupère `feature_importance` mais l'envoie seulement comme contexte
3. **XAI Engine** : **RECALCULE le SHAP** (redondant et coûteux en ressources)

### Flux Optimisé (Proposé)
1. **ML Pipeline** : Calcule le SHAP et le stocke dans `Experiment.feature_importance` ✅
2. **Frontend** : Récupère et envoie `feature_importance` avec flag `use_precalculated_shap: true` ✅
3. **XAI Engine** : **UTILISE le SHAP existant** sans recalcul ⏳

## 💻 Changements Frontend (✅ COMPLÉTÉS)

### 1. Modification de `requestExplanationSimple()`
```typescript
// AVANT : Déterminait une méthode d'explication
const explanationMethod = this.modelAlgorithm ? 
  this.xaiService.recommendExplanationMethod(this.modelAlgorithm) : 
  ExplanationMethod.AUTO;

// APRÈS : Plus de détermination de méthode, utilise le SHAP pré-calculé
method_requested: undefined, // Pas de méthode spécifiée
use_precalculated_shap: true // Flag pour utiliser le SHAP existant
```

### 2. Amélioration de `fetchMLContextDirectly()`
```typescript
// Inclut explicitement le SHAP pré-calculé
feature_importance: results?.feature_importance || {},
shap_calculated: !!results?.feature_importance,
shap_features_count: results?.feature_importance ? Object.keys(results.feature_importance).length : 0,
```

## 🔧 Changements Backend Nécessaires

### 1. Modification du endpoint `/explanations/` (xai-engine-service)

**Fichier**: `xai-engine-service/app/endpoints/explanations.py`

```python
@router.post("/", response_model=ExplanationRequestResponse)
async def create_explanation_request(
    request_data: ExplanationRequestCreate,
    # ...
):
    # NOUVEAU : Vérifier le flag use_precalculated_shap
    use_precalculated = getattr(request_data, 'use_precalculated_shap', False)
    
    if use_precalculated and ml_context.get('feature_importance'):
        # Ne pas lancer de tâche de calcul SHAP
        # Utiliser directement les valeurs existantes
        logger.info("📊 Utilisation du SHAP pré-calculé depuis ML Pipeline")
        
        # Créer directement les résultats d'explication
        explanation_request.status = 'completed'
        explanation_request.shap_values = ml_context['feature_importance']
        explanation_request.method_used = 'precalculated_shap'
        
        # Générer uniquement l'explication textuelle avec LLM
        task = generate_explanation_with_precalculated_shap.apply_async(
            args=[str(explanation_request.id)], 
            queue='xai_queue'
        )
    else:
        # Flux normal avec calcul SHAP
        task = generate_explanation_task.apply_async(...)
```

### 2. Nouvelle tâche Celery pour génération de texte uniquement

**Fichier**: `xai-engine-service/app/tasks.py`

```python
@celery_app.task(base=XAITask, bind=True, name="app.tasks.generate_explanation_with_precalculated_shap")
def generate_explanation_with_precalculated_shap(self, request_id: str):
    """
    Génère uniquement l'explication textuelle en utilisant le SHAP pré-calculé
    """
    session = get_sync_session()
    
    try:
        # 1. Récupérer la demande
        request = session.query(ExplanationRequest).filter(
            ExplanationRequest.id == request_id
        ).first()
        
        # 2. Récupérer le SHAP pré-calculé depuis le contexte ML
        feature_importance = request.user_preferences.get('ml_context', {}).get('feature_importance', {})
        
        if not feature_importance:
            raise ValueError("Pas de SHAP pré-calculé trouvé dans le contexte")
        
        # 3. Créer les visualisations à partir du SHAP existant
        visualizations = create_visualizations_from_precalculated_shap(
            feature_importance=feature_importance,
            dataset_name=request.user_preferences.get('ml_context', {}).get('dataset_name'),
            algorithm=request.user_preferences.get('ml_context', {}).get('algorithm')
        )
        
        # 4. Générer l'explication textuelle avec LLM
        text_explanation = generate_llm_explanation(
            feature_importance=feature_importance,
            user_context=request.user_preferences.get('user_profile', {}),
            ml_context=request.user_preferences.get('ml_context', {}),
            audience_level=request.audience_level,
            language=request.language
        )
        
        # 5. Créer les résultats
        results = ExplanationResults(
            request_id=request.id,
            explanation_text=text_explanation,
            shap_values=feature_importance,
            visualizations=visualizations,
            method_used='precalculated_shap',
            created_at=datetime.utcnow()
        )
        
        session.add(results)
        request.status = 'completed'
        session.commit()
        
        logger.info(f"✅ Explication générée avec SHAP pré-calculé pour {request_id}")
        
    except Exception as e:
        logger.error(f"❌ Erreur génération explication: {e}")
        request.status = 'failed'
        session.commit()
        raise
```

### 3. Fonction utilitaire pour créer les visualisations

> **Note 2026-04-14** : la fonction `create_visualizations_from_precalculated_shap` décrite ci-dessous **n'existe pas** dans le code final. `tasks_precalculated.py` réutilise directement les helpers communs de `app/xai/explainers.py` pour générer les plots. Snippet conservé à titre d'illustration du design initial.

```python
def create_visualizations_from_precalculated_shap(
    feature_importance: Dict[str, float],
    dataset_name: str,
    algorithm: str
) -> Dict[str, Any]:
    """
    Crée les visualisations à partir du SHAP pré-calculé
    """
    import matplotlib.pyplot as plt
    import base64
    from io import BytesIO
    
    # Trier les features par importance
    sorted_features = sorted(
        feature_importance.items(), 
        key=lambda x: abs(x[1]), 
        reverse=True
    )[:20]  # Top 20 features
    
    # Créer le graphique d'importance
    fig, ax = plt.subplots(figsize=(10, 6))
    features, values = zip(*sorted_features)
    ax.barh(range(len(features)), values)
    ax.set_yticks(range(len(features)))
    ax.set_yticklabels(features)
    ax.set_xlabel('SHAP Value (Impact sur la prédiction)')
    ax.set_title(f'Importance des Variables - {dataset_name} ({algorithm})')
    
    # Convertir en base64
    buffer = BytesIO()
    plt.savefig(buffer, format='png', bbox_inches='tight')
    buffer.seek(0)
    image_base64 = base64.b64encode(buffer.getvalue()).decode()
    plt.close()
    
    return {
        'feature_importance_plot': f'data:image/png;base64,{image_base64}',
        'summary_plot': None,  # Peut être ajouté si nécessaire
        'force_plot': None
    }
```

## 📈 Avantages de cette Approche

1. **Performance** : Évite le recalcul coûteux du SHAP
2. **Cohérence** : Utilise les mêmes valeurs SHAP que celles affichées dans les résultats ML
3. **Rapidité** : Génération d'explication quasi-instantanée
4. **Économie de ressources** : Moins de charge CPU/mémoire sur le service XAI

## 🧪 Tests à Effectuer

1. **Test Frontend**
   - Vérifier que `feature_importance` est bien envoyé dans le contexte ML
   - Vérifier que le flag `use_precalculated_shap: true` est présent

2. **Test Backend**
   - Vérifier que le SHAP n'est pas recalculé quand le flag est présent
   - Vérifier que l'explication est générée correctement avec le SHAP pré-calculé

3. **Test E2E**
   - Entraîner un modèle et vérifier que `feature_importance` est stocké
   - Demander une explication et vérifier qu'elle utilise le SHAP existant
   - Comparer les résultats avec l'ancienne méthode

## 📝 Migration Base de Données (Non appliquée — 2026-04-14)

> **Statut** : les colonnes `use_precalculated_shap` et `shap_source` **n'ont pas été ajoutées** à `explanation_requests`. Le flag est transporté dans `user_preferences` (JSONB) via `user_preferences.ml_context` et la sélection de tâche se fait côté endpoint (`generate_explanation_with_precalculated_shap` vs `generate_explanation_task`). Migration DB conservée pour référence si l'équipe souhaite formaliser.

```sql
-- NON APPLIQUÉ EN PROD
ALTER TABLE explanation_requests 
ADD COLUMN use_precalculated_shap BOOLEAN DEFAULT FALSE;

ALTER TABLE explanation_requests 
ADD COLUMN shap_source VARCHAR(50) DEFAULT 'calculated';
-- Valeurs possibles : 'calculated', 'precalculated', 'external'
```

## 🚀 Déploiement

1. Déployer d'abord les changements Frontend
2. Déployer ensuite les changements Backend
3. Tester en environnement de staging
4. Monitorer les performances (temps de génération d'explication)

## 📊 Métriques à Suivre

- Temps moyen de génération d'explication (avant/après)
- Utilisation CPU/mémoire du service XAI (avant/après)
- Nombre d'explications utilisant le SHAP pré-calculé vs recalculé
- Taux de succès des générations d'explication
