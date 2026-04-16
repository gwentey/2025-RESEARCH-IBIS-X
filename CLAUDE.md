# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

**IBIS-X** — Plateforme PoC d'expérimentation XAI (Explainable AI) avec pipeline ML complet, construite en microservices. Projet académique (Master 2 MIAGE).

## Architecture microservices

Quatre services backend Python (FastAPI) + un frontend Angular, orchestrés via Kubernetes (Minikube local / Azure prod).

- **api-gateway/** — Point d'entrée unique. Auth JWT, routage vers services internes, gestion utilisateurs/projets.
- **service-selection/** — Catalogue et filtrage de datasets (critères techniques, éthiques, métier). Upload datasets.
- **ml-pipeline-service/** — Pipeline ML (preprocessing, training). Utilise Celery + Redis pour tâches longues. Worker écoute **deux queues** : `ml_queue` (task `train_model`) et `ai_queue` (task `analyze_dataset_with_ai`, appels OpenAI). Worker packagé via le même Dockerfile (pas de Dockerfile.worker).
- **xai-engine-service/** — Application de techniques XAI (SHAP, LIME, LLM) sur modèles entraînés. Worker Celery dédié via `Dockerfile.worker` (artifact Skaffold `ibis-x-xai-engine-worker`). Toutes les tasks (`generate_explanation_task`, `process_shap_explanation`, `process_lime_explanation`, `generate_llm_explanation`, `process_chat_question`, `generate_explanation_with_precalculated_shap`) sont routées sur **la seule queue `xai_queue`**.
- **frontend/** — Angular + Angular Material, i18n via `@ngx-translate` (FR/EN obligatoire).

Chaque service backend a la même structure : `app/` (models.py SQLAlchemy, schemas.py Pydantic, crud.py, services.py, tasks.py Celery, core/config.py via `BaseSettings`), `alembic/` pour migrations, `requirements.txt`, `Dockerfile`.

Stockage : PostgreSQL (**une seule base partagée `ibis_x_db`** ; chaque service isole ses migrations via une `version_table` Alembic dédiée — `alembic_version_gateway`, `alembic_version_selection`, `alembic_version_ml_pipeline`, `alembic_version_xai`), Redis (broker Celery + cache), MinIO (stockage objets datasets/modèles en local ; Azure Blob en prod).

Communication : REST synchrone via api-gateway ; asynchrone via Celery/Redis entre gateway et workers ML/XAI. Résultats persistés en BDD, récupérés par polling.

## Commandes principales (Makefile)

Le Makefile est le point d'entrée canonique — **ne pas contourner** avec kubectl/skaffold direct sauf debug.

- `make dev` — Installation complète : prérequis, Minikube, déploiement Skaffold, migrations, port-forwards, logs. À utiliser par défaut.
- `make dev-no-data` — Idem sans import de datasets.
- `make dev-watch` — Mode dev avancé avec file watching Skaffold.
- `make quick-dev` — Redéploiement rapide (Minikube déjà up).
- `make logs` / `make quick-logs` — Logs temps réel.
- `make stop` / `make clean` / `make reset` — Arrêt / nettoyage / reset complet.
- `make migrate` — Migrations Alembic (lancées comme Jobs K8s via initContainers automatiquement en `dev`).
- `make restart-minikube` — Reset Minikube si cassé.
- `make fix-portforwards` — Relance les port-forwards si bloqués.
- `make dev-data` — Import datasets Kaggle réels (nécessite credentials).
- `make healthcheck` — État des services.

Accès après `make dev` : Frontend http://localhost:8080 · API http://localhost:9000/docs

**Ports internes K8s** (à ne pas confondre avec les port-forwards externes `8080` et `9000`) : api-gateway conteneur `8088`, service-selection `8081`, ml-pipeline `8082`, xai-engine `8083`, frontend nginx `80`, PostgreSQL `5432`, Redis `6379`, MinIO API `9000` + console `9001`.

**Setup Windows** : avant `make dev`, lire obligatoirement `memory-bank/windows-gotchas.md`. Deux exports quasi-systématiques : `export DOCKER_DEFAULT_PLATFORM=linux/amd64` (sinon images arm64 + QEMU → pods en CrashLoop) et `export PYTHONIOENCODING=utf-8 PYTHONUTF8=1` (sinon `update-local-secrets.py` crashe sur emojis).

## Conventions impératives

Lecture obligatoire avant modifications majeures (voir `.cursor/rules/rules.mdc`) :
- `memory-bank/architecture.md` — structure microservices, responsabilités, schémas. **À mettre à jour** après tout changement architectural significatif (nouveau service, nouvelle communication inter-services, changement schéma BDD).
- `memory-bank/conventions.md` — stack technique + conventions backend/frontend/K8s (source de vérité ; remplace l'ancien `tech_stack_ibis_x_v2.md`).
- `memory-bank/glossary.md` — acronymes & vocabulaire domaine.
- Documentation Antora `docs/modules/ROOT/pages/` — 6 piliers : 01-projet, 02-fonctionnel, 03-technique, 04-operationnel, 05-audit, 06-contribution.
- Historique PRD/PoC : `memory-bank/ARCHIVE/` (figé, ne pas modifier).

Documentation Antora (`docs/`, format Asciidoc) : obligatoire pour toute nouvelle fonctionnalité/endpoint/composant — aucune feature n'est complète sans sa doc. Publication : https://gwentey.github.io/2025-research-exai/

### Backend (FastAPI)
- Pydantic `BaseSettings` pour toute config — **jamais** de hardcoding (URLs BDD/Redis, secrets, endpoints).
- Pydantic schemas obligatoires pour requêtes/réponses API (`response_model`).
- SQLAlchemy ORM ; logique BDD dans `crud.py`, sessions via `Depends(get_db)`.
- Après modif `models.py` : `alembic revision --autogenerate -m "..."` puis `alembic upgrade head` (jamais de SQL direct).
- Tâches longues : `@celery_app.task` dans `tasks.py`, dispatch via `apply_async(queue='ml_queue'|'ai_queue'|'xai_queue')` (3 queues actives ; pas de `llm_queue`), statut/résultats persistés en BDD.
- Type hints Python extensifs (`Optional`, `List`, `Dict` de `typing`).

### Frontend (Angular)
- Avant tout nouveau composant/page : examiner `.cursor/templates/src/app/` pour cohérence visuelle et réutiliser patterns existants (boutons, cartes, layouts).
- Angular Material pour tous composants UI.
- Reactive Forms (`FormBuilder`, `FormGroup`, `Validators`) — pas de template-driven.
- Pattern Smart/Dumb components (conteneurs vs présentationnels).
- Services dédiés avec `HttpClient` retournant des `Observable`, base URL via environment files.
- Lazy loading des feature modules, `CoreModule` pour singletons, `SharedModule` pour réutilisables.
- **i18n obligatoire FR + EN** via `@ngx-translate/core` + `@ngx-translate/http-loader` pour toute chaîne affichée.

### Kubernetes
- Structure Kustomize stricte : `k8s/base/` + `k8s/overlays/minikube/` + `k8s/overlays/azure/`.
- Namespace unique : `ibis-x`. Noms ressources kebab-case préfixés par service (ex: `service-selection-deployment`).
- Config via ConfigMaps (non sensible) / Secrets (sensible), injectée via `envFrom` ou `env`. Jamais hardcodé.
- Images Docker préfixées `ibis-x-` (ex: `ibis-x-api-gateway`). Multi-stage, base slim, user non-root.
- Ajout d'un nouveau service → déclarer dans `skaffold.yaml` (artifact + Kustomize overlay).
