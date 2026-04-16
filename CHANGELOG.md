# Changelog

All notable changes to IBIS-X are documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed — Documentation refactor Lot 5 — runbooks & contribution (2026-04-14)

Final batch of the 5-phase documentation overhaul:

- **5 runbooks opérationnels** (`04-operationnel/runbooks/`): `migration-bdd`, `rotation-secrets`, `rollback-deploiement`, `incident-response` (avec DRAIN + playbooks), `import-datasets-prod`.
- **8 pages contribution** (`06-contribution/`): `onboarding-dev`, `git-workflow` (Conventional Commits + rebase), `conventions-code`, `conventions-doc`, `processus-pr` (template PR), `ajout-service` (checklist 10 points), `ajout-feature` (règle Doc = Code), `publication-doc` (build Antora + GH Pages).
- **4 pages pilier 01-projet**: `vision`, `perimetre-poc`, `roadmap` (8 phases), `glossaire`.
- **8 pages pilier 02-fonctionnel**: `personas-acteurs`, `parcours-utilisateur`, 4 modules (gestion-projets, explications-xai, collaboration, compte-utilisateur), `user-stories`, `criteres-acceptation` (Given-When-Then).
- **4 pages frontend 03-technique/frontend/**: `architecture-angular`, `i18n` (règles), `composants-cles`, `design-system` (typographie Sorbonne).
- **4 pages référence 03-technique/**: `base-de-donnees`, `celery-taches-async` (invariant 3 queues), `stockage-objets`, `stack-technique` (avec "ce qui n'est pas utilisé").
- **4 pages installation 04-operationnel/installation/**: `prerequis`, `local-minikube`, `windows-specificites`, `dev-containers`.
- **3 pages déploiement 04-operationnel/deploiement/**: `azure-terraform`, `cicd-github-actions`, `secrets-config`.
- **3 pages observabilité 04-operationnel/**: `monitoring-logs` (gaps documentés), `sauvegarde-restauration` (RPO/RTO), `troubleshooting` (FAQ).

Complete documentation overhaul finished — all 6 pillars fully populated, nav clean, audit dossier ready for jury.

### Changed — Documentation refactor Lot 4 — dossier d'audit (2026-04-14)

Full audit dossier for jury/reviewer:

- **7 ADRs** (MADR format) in `05-audit/adr/`: template + 6 retrospective decisions (microservices, Celery 3 queues, Postgres shared + version_table, Angular Material no Tailwind, Kubernetes Minikube/AKS, SHAP+LIME+LLM XAI triptych).
- **Security** (`05-audit/securite/`): `politique.adoc`, `modele-menaces.adoc` (STRIDE per service), `owasp-top10.adoc` (2021 coverage with gaps), `gestion-secrets.adoc` (inventory + rotation).
- **RGPD** (`05-audit/rgpd/`): `cartographie-donnees.adoc` (data map), `checklist-conformite.adoc` (article-by-article), `droits-utilisateurs.adoc` (access/rectification/erasure endpoints), `registre-traitements.adoc` (art. 30 registry — 5 processing activities).
- **Ethique IA** (`05-audit/ethique-ia/`): `principes.adoc` (7 guiding principles), `evaluation-datasets.adoc` (3-dimension ethical grid).
- **Qualité** (`05-audit/qualite/`): `strategie-tests.adoc` (pyramid + tooling), `plan-tests.adoc` (matrix by module × level), `couverture-objectifs.adoc` (PoC targets 55-70%), `validation-iris.adoc` (scientific baseline).
- **Traçabilité** (`05-audit/tracabilite/`): `exigences-implementation.adoc` (requirements ↔ code matrix — 40+ items across 8 domains), `journal-changements.adoc` (pointer to canonical CHANGELOG.md).

### Changed — Documentation refactor Lot 3 — consolidation & diagrammes (2026-04-14)

Consolidated duplicates and produced canonical architecture diagrams:

- **Archived** 13 duplicate pages to `docs/ARCHIVE/LEGACY-DUPLICATES/` with mapping README:
  - ML Pipeline (5 files) → `02-fonctionnel/modules/pipeline-ml.adoc` + `03-technique/services/ml-pipeline-service.adoc`
  - Dataset view (3 files) → `02-fonctionnel/modules/selection-datasets.adoc`
  - Data cleaning (5 files) → integrated as preprocessing section of `ml-pipeline-service.adoc`
- **Created canonical architecture pages** (Mermaid as-code, no static PNGs):
  - `03-technique/architecture/vue-ensemble.adoc` — C4 Level 1 (context) + Level 2 (containers)
  - `03-technique/architecture/flux-communication.adoc` — 4 sequence diagrams (login, upload, training, XAI)
  - `03-technique/architecture/modele-donnees.adoc` — ERD PostgreSQL with invariants
  - `03-technique/architecture/deploiement.adoc` — Kubernetes topology + Skaffold artifacts + port table
  - `03-technique/architecture/microservices.adoc` — responsibility matrix + explicit frontiers
- **Created canonical service pages**:
  - `03-technique/services/api-gateway.adoc` — auth JWT/OAuth, `User.role` + `is_superuser` computed
  - `03-technique/services/service-selection.adoc` — datasets multi-files, filters, Kaggle import
  - `03-technique/services/ml-pipeline-service.adoc` — preprocessing + training + `DataQualityAnalysis` cache
  - `03-technique/services/xai-engine-service.adoc` — SHAP/LIME/LLM on `xai_queue`, separate `Dockerfile.worker`, chat 5-max limit
- **Created canonical API reference**: `03-technique/api-reference.adoc` — all endpoints grouped by domain, OpenAPI export instructions.

### Changed — Documentation refactor Lot 2 — code↔doc alignment (2026-04-14)

Completed correction of the 28 code↔doc divergences listed in `AUDIT_DOC_2026-04.md`:

- **Verified already aligned** (no action needed, fixed in prior commits):
  - `memory-bank/architecture.md` — alignment note at line 6 (DataQualityAnalysis, xai worker via `Dockerfile.worker`, `generate_explanation_with_precalculated_shap`, `storage_path` multi-file, `role`/`is_superuser`, `artifact_uri`).
  - `frontend/README.md` — rewritten with Angular 19 stack.
  - `ml-pipeline-service/README-DATABASE.md` — `artifact_uri` column + `data_quality_analyses` table.
  - `README-Terraform.md` — logs examples now cover 4 services + `ml-pipeline-worker` + `xai-engine-worker`.
  - `docs/modules/ROOT/pages/features/model-prediction-interface.md` — banner "feature planned — not implemented".
  - `docs/ARCHIVE/fix_dual_slider_interaction_solution.md` + `fix_dual_slider_material_design_solution.md` — "[ARCHIVÉ — approche non retenue]" banners.
- **Archived to `memory-bank/ARCHIVE/`** (obsolete, replaced by Antora pillars / `conventions.md` / `CHANGELOG.md`):
  - `prd_ibis_x_poc_v2.md`, `implementation_plan_exai_poc_adjusted.md`, `progress.md`, `tech_stack_ibis_x_v2.md`, `AUDIT_DOC_2026-04.md`.
- **Updated cross-references** to point at new locations:
  - `CLAUDE.md` — mandatory-reading list now points to `architecture.md`, `conventions.md`, `glossary.md` + 6 pillars.
  - `memory-bank/architecture.md` header — no longer references archived files directly.
- **Confirmed invariant**: only 3 Celery queues exist — `ml_queue`, `ai_queue` (ml-pipeline) and `xai_queue` (xai-engine). **No `llm_queue`.**

### Changed — Documentation refactor Lot 1 (2026-04-14)

Foundations of the full documentation overhaul (see `.claude/plans/effervescent-painting-hare.md`):

- **New root files**: `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE` (MIT).
- **Rewritten `README.md`**: 3-parcours entry (Utilisateur / Développeur / Auditeur).
- **New `memory-bank/conventions.md`**: merged + refreshed `tech_stack_ibis_x_v2.md` (stack, backend, frontend, K8s, Celery 3-queue invariant).
- **New `memory-bank/glossary.md`**: acronyms + domain concepts (IBIS-X, XAI, SHAP, LIME, artifact_uri, ibis_x_db, etc.).
- **New 6-pillar Antora tree** under `docs/modules/ROOT/pages/`:
  - `01-projet/`, `02-fonctionnel/`, `03-technique/`, `04-operationnel/`, `05-audit/`, `06-contribution/` with pillar indexes.
  - `05-audit/dossier-audit.adoc` as single jury entry point.
- **Rewritten `nav.adoc`**: 6 clean sections replacing the 95-entry legacy nav.
- **Rewritten `index.adoc`** (Antora hub): 3-parcours table + quickstart + conventions.
- **Archived** to `docs/ARCHIVE/`: 10 root-level `.md` files (`PROMPT_COMPLET_*`, `backend_xai_use_precalculated_shap.md`, 8× `fix_*.md`) with archive README mapping old → new location.
- **Prepared** `memory-bank/ARCHIVE/` for Lot 2 (pending move of `prd_v2`, `implementation_plan`, `progress`, `AUDIT_DOC_2026-04`, `tech_stack_v2`).

### Changed — Design audit fixes (2026-04-14)

- **FINDING-003** — Fix heading scale `h1`-`h6` with explicit sizes (36/28/22/18/16/14px). Before: `h3 ≈ h2`, `h5 < h6`, `h1` weight below `h2`. (`frontend/src/assets/scss/_sorbonne-modern-overrides.scss`)
- **FINDING-009** — Remove duplicated user profile block from desktop sidebar. Avatar/username already present in topbar. (`frontend/src/app/layouts/full/full.component.html`)
- **FINDING-004** — Fix XAI Explanations sidebar route typo `/app/xai-explanations` → `/app/xai-explanation` (was 404ing the main product feature). (`frontend/src/app/layouts/full/vertical/sidebar/sidebar-data.ts`)
- **FINDING-002** — Wire i18n on `/app/ml-pipeline` hero section (badge, title, subtitle, status cards, action buttons, steps heading). Complies with CLAUDE.md i18n rule. (`frontend/src/app/pages/ml-pipeline/ml-pipeline-presentation/*`, `frontend/src/assets/i18n/{fr,en}.json`)
- **FINDING-001** — Purge template-admin demo apps (chat, e-commerce, invoice, calendar, contacts, tickets, email, courses) and quicklinks (Pricing, Auth Design, Register, 404, Notes, Employee, Todo, Treeview) from mobile drawer entry points. (`frontend/src/app/layouts/full/full.component.{ts,html}`)

### Known issues (not yet fixed)

- **FINDING-005** — Page ML Pipeline displays an "8-step grid with icon-in-colored-squares" matching AI-slop pattern. Recommend replacing with a proper stepper/timeline.
- **FINDING-006** — Dataset service returns HTTP 500 but UI silently shows "empty state" instead of error banner with retry.
- **FINDING-001 (partial)** — `/apps/*` route definitions may still exist in `app.routes.ts`; only user-visible entry points were removed. Verify and purge underlying route modules to shrink bundle.
- Remaining strings on `/app/ml-pipeline` (8 step descriptions, "Running Experiments" section, tutorial cards) still hardcoded in English.
- Touch targets under 44px on sidebar icons, breadcrumbs, some buttons (FINDING-008).
- Mix of Material Icons + Tabler Icons; 6× `Tabler Icon not found: play` console warnings (FINDING-011).
- Angular `NG0505` (hydration misconfig) and `NG0956` (inefficient trackBy) warnings (FINDING-010).
- Onboarding page uses decorative blobs + centered 3-column layout matching AI-slop patterns (FINDING-007).
- 404 page uses template's generic cat-in-box illustration, no IBIS-X brand (FINDING-013).
- Empty states ("Aucune activité récente", "Aucun jeu de données disponible") lack warmth and secondary CTA (FINDING-012).

Audit report: `C:\Users\ANTHONY\AppData\Local\Temp\ibis-review\design-audit-20260414\design-audit-ibis-x.md`

### Added

- `CHANGELOG.md` — this file.
