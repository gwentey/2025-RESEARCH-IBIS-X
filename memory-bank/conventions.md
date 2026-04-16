# Conventions IBIS-X — contrat projet

> **Source de vérité** pour les conventions techniques. `CLAUDE.md` en racine est un résumé actionnable pour l'IA ; ce fichier est la version complète. Remplace l'ancien `tech_stack_ibis_x_v2.md`.

---

## 1. Stack technique (raisonnée)

| Couche | Technologie | Version | Justification |
|---|---|---|---|
| Backend | Python + FastAPI | 3.11 + FastAPI ≥ 0.100 | Async natif, typage Pydantic, OpenAPI auto |
| ORM | SQLAlchemy 2.x + Alembic | — | Standard Python, migrations versionnées |
| Validation | Pydantic v2 | `BaseSettings` pour config | Zéro hardcoding d'URL/secret |
| BDD | PostgreSQL 15 | **Une seule base `ibis_x_db`** partagée | Simplicité PoC ; isolation via `version_table` Alembic par service |
| Cache / Broker | Redis 7 | — | Celery broker + cache applicatif |
| Tâches async | Celery | — | 3 queues actives : `ml_queue`, `ai_queue`, `xai_queue` |
| Stockage objets | MinIO (local) / Azure Blob (prod) | — | Datasets, modèles entraînés, artefacts |
| Frontend | Angular | 19 (standalone components) | Écosystème mature, Material Design |
| UI | Angular Material | — | **Pas de Tailwind** — un seul système UI |
| i18n | @ngx-translate/core + http-loader | — | FR + EN **obligatoires** pour toute chaîne |
| Orchestration | Kubernetes (Minikube local, AKS Azure) | — | Kustomize (`base/` + overlays) |
| Build/Deploy | Skaffold + Docker multi-stage | — | Images préfixées `ibis-x-` |
| IaC | Terraform | — | Provisioning Azure |
| CI/CD | GitHub Actions | — | Build, tests, déploiement |

## 2. Backend — règles impératives

- **Config** : toujours `pydantic.BaseSettings`. Aucune valeur hardcodée (URL BDD, Redis, secrets, endpoints externes).
- **Schemas Pydantic** obligatoires pour `request_model` et `response_model` de chaque endpoint FastAPI.
- **Persistance** :
  - Modèles SQLAlchemy dans `app/models.py`.
  - Logique CRUD dans `app/crud.py` (jamais dans les routes).
  - Sessions via `Depends(get_db)`.
  - Jamais de SQL brut sauf optimisation justifiée et commentée.
- **Migrations** : après chaque modif de `models.py` → `alembic revision --autogenerate -m "..."` puis `alembic upgrade head`. Chaque service a sa propre `version_table` : `alembic_version_gateway`, `alembic_version_selection`, `alembic_version_ml_pipeline`, `alembic_version_xai`.
- **Tâches Celery** :
  - Définies dans `app/tasks.py` avec `@celery_app.task`.
  - Dispatch via `apply_async(queue='<queue_name>')`.
  - Queues valides : `ml_queue` (training ML), `ai_queue` (analyse OpenAI), `xai_queue` (SHAP/LIME/LLM/chat XAI). **Aucune autre queue.**
  - Statut et résultats persistés en BDD — pas dans Redis.
- **Typage** : type hints extensifs (`Optional`, `List`, `Dict` de `typing`). Mypy recommandé.
- **Structure service** : `app/` (models, schemas, crud, services, tasks, core/config.py) · `alembic/` · `requirements.txt` · `Dockerfile`.

## 3. Workers Celery — architecture

| Service | Image | Queues écoutées | Tasks |
|---|---|---|---|
| `ibis-x-ml-pipeline-worker` | même `Dockerfile` que l'API | `ml_queue`, `ai_queue` | `train_model`, `analyze_dataset_with_ai` |
| `ibis-x-xai-engine-worker` | `Dockerfile.worker` (artifact Skaffold dédié) | `xai_queue` uniquement | `generate_explanation_task`, `process_shap_explanation`, `process_lime_explanation`, `generate_llm_explanation`, `process_chat_question`, `generate_explanation_with_precalculated_shap` |

Il n'existe pas de queue `llm_queue`.

## 4. Frontend — règles impératives

- **Avant tout nouveau composant** : examiner `.cursor/templates/src/app/` pour cohérence visuelle.
- **Angular Material exclusif** pour les composants UI. Pas de Bootstrap, pas de Tailwind.
- **Reactive Forms** (`FormBuilder`, `FormGroup`, `Validators`). **Jamais** de template-driven.
- **Pattern Smart/Dumb** : conteneurs (logique, services) vs présentationnels (inputs/outputs).
- **Services HTTP** : `HttpClient`, retour `Observable`, base URL via `environment.ts`.
- **Lazy loading** pour les feature modules. `CoreModule` pour singletons, `SharedModule` pour réutilisables.
- **i18n obligatoire FR + EN** via `@ngx-translate/core`. **Aucune chaîne affichée en dur** — toujours une clé dans `assets/i18n/{fr,en}.json`.

## 5. Kubernetes / Infrastructure

- **Structure Kustomize stricte** : `k8s/base/` + `k8s/overlays/minikube/` + `k8s/overlays/azure/`.
- **Namespace unique** : `ibis-x`.
- **Nommage** : kebab-case, préfixé par service (`service-selection-deployment`, `api-gateway-service`).
- **Config** :
  - Non sensible → ConfigMap, injectée via `envFrom` ou `env`.
  - Sensible → Secret Kubernetes (jamais dans Git).
- **Images Docker** : préfixe `ibis-x-` (ex : `ibis-x-api-gateway`). Multi-stage, base slim, utilisateur non-root.
- **Ajout d'un service** : déclarer dans `skaffold.yaml` (artifact + overlay Kustomize).

### Ports (ne pas confondre)

| Élément | Port interne K8s | Port-forward externe |
|---|---|---|
| api-gateway | 8088 | 9000 |
| service-selection | 8081 | — |
| ml-pipeline-service | 8082 | — |
| xai-engine-service | 8083 | — |
| frontend (nginx) | 80 | 8080 |
| PostgreSQL | 5432 | — |
| Redis | 6379 | — |
| MinIO API / console | 9000 / 9001 | — |

## 6. Documentation

- **Antora (Asciidoc)** dans `docs/modules/` — documentation canonique publiée sur GitHub Pages.
- **Markdown** uniquement pour : fichiers racine (`README`, `CLAUDE`, `CONTRIBUTING`…) et `memory-bank/`.
- **Règle Doc = Code** : toute PR qui touche une feature met à jour la page Antora correspondante dans le pilier adéquat (01-projet, 02-fonctionnel, 03-technique, 04-operationnel, 05-audit, 06-contribution).

## 7. Setup Windows (obligatoire)

Avant `make dev`, dans Git Bash :

```bash
export DOCKER_DEFAULT_PLATFORM=linux/amd64   # sinon builds arm64 → QEMU → CrashLoop
export PYTHONIOENCODING=utf-8 PYTHONUTF8=1   # sinon update-local-secrets.py crashe (cp1252 + emojis)
```

Détails : [`windows-gotchas.md`](./windows-gotchas.md).

## 8. Documents de référence

- [`architecture.md`](./architecture.md) — architecture système détaillée (source de vérité).
- [`glossary.md`](./glossary.md) — glossaire du domaine et acronymes.
- [`windows-gotchas.md`](./windows-gotchas.md) — pièges Windows.
- [`../CLAUDE.md`](../CLAUDE.md) — contrat IA (résumé actionnable de ce fichier).
