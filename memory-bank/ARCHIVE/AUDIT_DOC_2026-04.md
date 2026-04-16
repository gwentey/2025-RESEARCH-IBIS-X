# Audit documentation markdown — 2026-04-14

**Scope** : 14 fichiers critiques (memory-bank/*, READMEs services & racine, docs/*).
**Méthode** : confrontation ligne-par-ligne au code réel (models.py, tasks.py, celery_app.py, Dockerfile, package.json, Skaffold, Alembic).
**Dernier commit analysé** : `1c3a678 fix` sur branche `main`.

> ⚠️ **Correction post-audit 2026-04-14 (re-lecture code)** : cet audit mentionne une `llm_queue` pour xai-engine. C'est **incorrect**. Le fichier `xai-engine-service/app/core/celery_app.py:62-70` route **toutes** les tasks XAI (`generate_explanation_task`, `process_shap_explanation`, `process_lime_explanation`, `generate_llm_explanation`, `process_chat_question`, `generate_explanation_with_precalculated_shap`) sur l'unique queue `xai_queue`. La CMD réelle du worker (`k8s/base/xai-engine/celery-worker-deployment.yaml:44`) est `celery -A app.core.celery_app worker --loglevel=info --queues=xai_queue --concurrency=2 --hostname=xai-worker@%h` — pas `xai_queue,llm_queue`. Ignorer les lignes de ce document qui mentionnent `llm_queue` ; la doc secondaire (progress.md, tech_stack_ibis_x_v2.md, architecture.md, implementation_plan_exai_poc_adjusted.md) a été corrigée en conséquence. Voir `memory-bank/windows-gotchas.md` pour les autres pièges d'environnement identifiés au même moment.

---

## Vérités de référence (code réel)

| Élément | Valeur confirmée |
|---|---|
| Queues Celery | **3 queues actives** : `ml_queue`, `ai_queue` (ml-pipeline) · `xai_queue` seul (xai-engine — toutes les tasks XAI y sont routées). **Aucune `llm_queue` dans le code.** |
| Experiment champ modèle | `artifact_uri` (renommé depuis `model_uri` via migration 002) |
| User — rôles | champ `role` (default `'user'`) ; `is_superuser` = **propriété calculée** (`role == 'admin'`) |
| Dataset — accès fichier | `storage_path` + table `dataset_files` (multi-fichiers) |
| Tables ml-pipeline | `Experiment`, **`DataQualityAnalysis`** (cache) |
| Tâches xai-engine | `generate_explanation_task` + **`generate_explanation_with_precalculated_shap`** |
| Worker xai | Conteneur séparé via `Dockerfile.worker` → artifact Skaffold `ibis-x-xai-engine-worker` |
| Worker xai commande | `celery -A app.core.celery_app worker --loglevel=info --queues=xai_queue --concurrency=2 --hostname=xai-worker@%h` (cf. `k8s/base/xai-engine/celery-worker-deployment.yaml:44`) |
| Frontend | **Angular 19** standalone, Material 19, ngx-translate 14, ECharts 5.6, WebSHAP, Tabler-icons. **Pas de Tailwind**. |
| Versions libs XAI | `shap==0.43.0`, `lime==0.2.0.1`, `scikit-learn==1.3.2`, `openai==1.51.2` (xai), `openai>=1.0.0` (ml) |
| Skaffold artifacts | 6 : frontend, api-gateway, service-selection, ml-pipeline, xai-engine, **xai-engine-worker** |
| Dernières migrations | gateway: `sync_role_is_superuser_permanent` · selection: `add_storage_path_to_datasets` · ml-pipeline: `add_data_quality_analysis_table` · xai: `001_initial_xai_migration` |

---

## Table de divergences (bloquant / obsolète / cosmétique)

### memory-bank/architecture.md

| Ligne | Divergence | Gravité | Action |
|---|---|---|---|
| — | Absence de `DataQualityAnalysis` dans description ml-pipeline | bloquant | Ajouter section |
| — | Worker xai séparé (`Dockerfile.worker`) non décrit | bloquant | Ajouter mention |
| — | Tâche `generate_explanation_with_precalculated_shap` absente | bloquant | Documenter optimisation |
| — | `storage_path` / architecture multi-fichiers (DatasetFile, FileColumn) sous-documentée | bloquant | Mettre à jour section datasets |
| — | `User.role` vs `is_superuser` non précisé | obsolète | Clarifier propriété calculée |

### memory-bank/prd_ibis_x_poc_v2.md

| Ligne | Divergence | Gravité | Action |
|---|---|---|---|
| 30-34 | `file_reference` décrit comme champ d'accès | bloquant | Remplacer par `storage_path` + DatasetFile |
| 127-137 | `model_uri` mentionné | obsolète | → `artifact_uri` |
| 162-180 | Pas de mention `generate_explanation_with_precalculated_shap` | obsolète | Ajouter |
| 200 | User sans mention `role` | obsolète | Noter propriété calculée |
| 120-124 | "Table `ml_models` optionnelle" | obsolète | Préciser non-implémentée |

### memory-bank/tech_stack_ibis_x_v2.md

| Ligne | Divergence | Gravité | Action |
|---|---|---|---|
| 25 | "Tailwind CSS peut être utilisé en complément" | bloquant | Retirer (non utilisé) |
| 25 | Statut frontend "⬜ À démarrer" | obsolète | → "✅ Implémenté (Angular 19)" |
| 28 | `model_uri` | obsolète | → `artifact_uri` |
| 32 | "Local PoC: Pool unique écoutant toutes les queues" | obsolète | Workers séparés même en local |
| — | Versions libs XAI non précisées | cosmétique | Ajouter shap/lime/sklearn/openai versions |

### memory-bank/progress.md

| Ligne | Divergence | Gravité | Action |
|---|---|---|---|
| 75 | "Étape 6.4 Module XAI : Non trouvé" | bloquant | XAI largement implémenté (tasks + endpoints + frontend) |
| — | Frontend non listé comme avancé | obsolète | Mettre à jour statut Angular 19 |
| — | Date dernière MAJ | cosmétique | Refresh 2026-04-14 |

### memory-bank/implementation_plan_exai_poc_adjusted.md

| Ligne | Divergence | Gravité | Action |
|---|---|---|---|
| 95 | `celery -A app.celery_app worker -Q celery,ml_queue,xai_queue` | bloquant | Corriger : `app.core.celery_app`, queues séparées par service — ml worker écoute `ml_queue,ai_queue` ; xai worker écoute `xai_queue` seul (pas de `llm_queue`). |

### README.md (racine)

Aucune divergence factuelle critique. Conforme.

### README-Terraform.md

| Ligne | Divergence | Gravité | Action |
|---|---|---|---|
| 240-241 | Exemples logs mentionnent seulement api-gateway + service-selection | obsolète | Ajouter ml-pipeline, xai-engine, xai-engine-worker |

### frontend/README.md

| Ligne | Divergence | Gravité | Action |
|---|---|---|---|
| 1-2 | "Spike-Angular-pro Spike Angular Admin Dashboard" — stub générique | bloquant | Réécrire : Angular 19, structure features, commandes dev |

### ml-pipeline-service/README-DATABASE.md

| Ligne | Divergence | Gravité | Action |
|---|---|---|---|
| 37, 44 | Colonne `model_uri` | bloquant | → `artifact_uri` (migration 002) |
| — | Table `DataQualityAnalysis` absente | bloquant | Ajouter section avec schéma |

### datasets/kaggle-import/README.md

| Ligne | Divergence | Gravité | Action |
|---|---|---|---|
| — | Architecture interne (`importer_lib/`) non documentée | cosmétique | Ajouter section brève |

### datasets/kaggle-import/TEMPLATES_GUIDE.md

Conforme.

### docs/backend_xai_use_precalculated_shap.md

| Ligne | Divergence | Gravité | Action |
|---|---|---|---|
| 44-74 | Nom tâche `generate_text_explanation_only` | bloquant | → `generate_explanation_with_precalculated_shap` (nom réel) |
| 101 | Fonction `create_visualizations_from_precalculated_shap()` | obsolète | Fonction absente du code — retirer ou marquer "non implémentée" |
| 211-216 | Migration DB `use_precalculated_shap` / `shap_source` | obsolète | Colonnes absentes — archiver ce bloc |

### docs/PROMPT_COMPLET_IBIS_X_XAI_DEBUG.md

| Ligne | Divergence | Gravité | Action |
|---|---|---|---|
| 177-220 | Structure JSON `llm_explanation / key_insights / confidence` | obsolète | Réalité : `text_explanation` simple |

### docs/modules/ROOT/pages/features/model-prediction-interface.md

| Ligne | Divergence | Gravité | Action |
|---|---|---|---|
| 57-87, 269-287 | Endpoint `/experiments/{id}/predict` | bloquant | **N'existe pas** — marquer doc "feature planifiée / non implémentée" |
| 108-122 | Composant `PredictionInterfaceComponent` | bloquant | **N'existe pas** — idem |
| 232-257 | 3ème onglet "Prédictions" | bloquant | Le composant experiment-results n'a que 2 onglets |

### docs/fix_*.md (6 fichiers)

| Fichier | Statut réel | Action |
|---|---|---|
| fix_tree_visualization_solution.md | intégré | Conserver (historique) |
| fix_dataset_filtering_popup_solution.md | intégré | Conserver |
| fix_dual_slider_definitive_solution.md | intégré | Conserver |
| fix_dual_slider_interaction_solution.md | **approche abandonnée** | Marquer "[ARCHIVÉ — approche non retenue]" |
| fix_dual_slider_material_design_solution.md | **approche abandonnée** | Marquer "[ARCHIVÉ — approche non retenue]" |
| fix_slider_constraints_final.md | intégré | Conserver |
| fix_ml_pipeline_table_display_solution.md | à vérifier | Valider avant décision |
| fix_project_detail_icons_centering_solution.md | intégré | Conserver |

---

## Synthèse

- **Bloquant** : 13 items — à corriger impérativement
- **Obsolète** : 11 items — à corriger
- **Cosmétique** : 4 items — corrections légères

**Points de vigilance non à corriger** (déjà conformes) :
- Noms de queues Celery dans CLAUDE.md (`ml_queue`/`xai_queue`) ✅
- Architecture 4 services + frontend ✅
- Infrastructure K8s / Skaffold / MinIO / Redis ✅
- Endpoints principaux service-selection ✅

---

*Rapport généré après exploration automatisée. Corrections appliquées dans la foulée ; voir `git diff` post-audit.*
