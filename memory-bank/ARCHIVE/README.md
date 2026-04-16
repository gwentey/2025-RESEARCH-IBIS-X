# Archive memory-bank

Documents historiques conservés pour la traçabilité académique et réglementaire. **Ne plus modifier.**

Source de vérité vivante : fichiers à la racine de `memory-bank/` + documentation Antora dans `docs/modules/ROOT/pages/`.

## Contenu archivé (Lot 2 du plan de refonte — 2026-04-14)

| Fichier | Raison de l'archivage | Remplacement vivant |
|---|---|---|
| `prd_ibis_x_poc_v2.md` | Spécifications PRD PoC — référence figée | `docs/modules/ROOT/pages/01-projet/vision.adoc` + `02-fonctionnel/` (Lot 3) |
| `implementation_plan_exai_poc_adjusted.md` | Roadmap historique du PoC | `docs/modules/ROOT/pages/01-projet/roadmap.adoc` (Lot 3) |
| `progress.md` | Suivi d'avancement figé | `CHANGELOG.md` + Antora |
| `tech_stack_ibis_x_v2.md` | Ancienne source stack | `memory-bank/conventions.md` (Lot 1) |
| `AUDIT_DOC_2026-04.md` | Rapport d'audit 28 divergences — corrections appliquées | Historique uniquement (voir `CHANGELOG.md` entrée Lot 2) |

## Statut de l'audit `AUDIT_DOC_2026-04.md`

Tous les items bloquants et obsolètes identifiés ont été traités :

- ✅ `architecture.md` : note d'alignement en tête (DataQualityAnalysis, worker XAI séparé, `precalculated_shap`, storage_path, rôle utilisateur, `artifact_uri`).
- ✅ `frontend/README.md` : réécrit (Angular 19, structure features, commandes).
- ✅ `ml-pipeline-service/README-DATABASE.md` : `artifact_uri` + table `data_quality_analyses`.
- ✅ `README-Terraform.md` : logs étendus aux 4 services + 2 workers Celery.
- ✅ `docs/modules/ROOT/pages/features/model-prediction-interface.md` : bannière "feature planifiée — non implémentée".
- ✅ `docs/ARCHIVE/fix_dual_slider_interaction_solution.md` + `fix_dual_slider_material_design_solution.md` : bannières "[ARCHIVÉ — approche non retenue]".
- ✅ `prd_v2`, `implementation_plan`, `progress`, `tech_stack_v2` : archivés ici (Lot 2).
- ✅ Ancien `tech_stack_v2` remplacé par `memory-bank/conventions.md` (version complète, queues Celery correctes, pas de Tailwind, versions libs XAI).
- ✅ Confirmation queues Celery : **3 queues actives** (`ml_queue`, `ai_queue`, `xai_queue`). Aucune `llm_queue`.
