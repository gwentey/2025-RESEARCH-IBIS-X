# IBIS-X

[![Watch the demo on YouTube](https://img.youtube.com/vi/VGMlki6EqLk/maxresdefault.jpg)](https://youtu.be/VGMlki6EqLk)

> **IBIS-X: One Model, Three Explanations — Human-Centered XAI in Action**
> Demo video accompanying the paper submitted to **KES 2026**:
> *"IBIS-X: A Human-Centered Framework for End-to-End Dataset Selection, Machine Learning, and Explainable AI."*

IBIS-X is a human-centered framework that guides users from dataset selection to explainable AI, without requiring prior data-science expertise. It combines a guided ML pipeline, a multi-objective dataset selection layer, and cognitive-adapted XAI explanations, all under a single microservice architecture.

---

## 🎬 Demo scenarios (Iris dataset)

The [demo video](https://youtu.be/VGMlki6EqLk) walks through the three core capabilities of the system on the classic Iris dataset:

### Scenario 1 — Multi-objective Dataset Selection
Personalized weighting across **ethics**, **technical quality** and **popularity**, with an interactive heat map ranking three candidate datasets in real time.

### Scenario 2 — Guided End-to-End ML Pipeline
Nine user-friendly steps: from dataset overview to objective definition, cleaning, split, preparation, algorithm choice (Random Forest), hyperparameter tuning, training, and results — with an **AI Guide** assisting at key decision points.

### Scenario 3 — Cognitive-Adapted XAI
Same Random Forest, same SHAP values, same question — but two radically different explanations. Side-by-side comparison of a **Novice (Level 1)** and an **Expert (Level 5)** profile, illustrating how IBIS-X automatically tailors the narrative, vocabulary and depth of its explanations to the user's cognitive level.

---

[![Status](https://img.shields.io/badge/status-PoC%20KES%202026-blueviolet)](CHANGELOG.md)
[![Docs](https://img.shields.io/badge/docs-Antora-informational)](https://gwentey.github.io/2025-research-exai/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

Projet académique **Master 2 MIAGE** (Paris 1 Panthéon-Sorbonne) — plateforme microservices pour explorer l'IA explicable (XAI) sur un pipeline ML complet, de la sélection de datasets jusqu'à l'interprétation des modèles.

---

## 📖 Documentation — 3 parcours

| Vous êtes… | Entrez par… |
|---|---|
| 👤 **Utilisateur** (vous voulez *utiliser* la plateforme) | [Guide utilisateur](https://gwentey.github.io/2025-research-exai/ibis-x/latest/02-fonctionnel/index.html) |
| 💻 **Développeur** (vous voulez *contribuer* ou *comprendre le code*) | [Guide développeur](https://gwentey.github.io/2025-research-exai/ibis-x/latest/03-technique/architecture/vue-ensemble.html) · [`CONTRIBUTING.md`](./CONTRIBUTING.md) · [`CLAUDE.md`](./CLAUDE.md) |
| 🔎 **Auditeur / Jury** (vous évaluez le projet) | [Dossier d'audit](https://gwentey.github.io/2025-research-exai/ibis-x/latest/05-audit/dossier-audit.html) — sécurité, RGPD, éthique IA, ADRs, tests, traçabilité |

> Documentation complète en ligne : **https://gwentey.github.io/2025-research-exai/**

---

## 🚀 Démarrage rapide

```bash
git clone https://github.com/gwentey/2025-RESEARCH-IBIS-X.git
cd 2025-RESEARCH-IBIS-X
cp .env.example .env    # Remplir : JWT_SECRET_KEY, DATABASE_URL, GOOGLE_*, OAUTH_REDIRECT_URL, KAGGLE_*, OPENAI_API_KEY

# Windows (Git Bash) — OBLIGATOIRE avant make dev
export DOCKER_DEFAULT_PLATFORM=linux/amd64
export PYTHONIOENCODING=utf-8 PYTHONUTF8=1

make dev
```

Le Makefile orchestre : prérequis, Minikube, déploiement Skaffold, migrations Alembic, port-forwards, logs.

**Accès après démarrage :**
- Frontend : http://localhost:8080
- API Gateway : http://localhost:9000 · Swagger : http://localhost:9000/docs

> **Windows** : lire [`memory-bank/windows-gotchas.md`](./memory-bank/windows-gotchas.md) (pièges cp1252, arm64/QEMU, deadlock tee).

---

## 🔐 Secrets setup

Every Kubernetes `secrets.yaml` file under `k8s/base/**/` ships with `REPLACE_WITH_*` placeholders only. Real credentials are injected **locally** by `scripts/development/update-local-secrets.py`, triggered automatically by `make update-secrets` (and by `make dev` through its dependency chain). The script reads the eight mandatory variables from the root `.env`, base64-encodes them, and rewrites the placeholder tokens in place. Never commit the rewritten files — they are ephemeral, machine-local artefacts.

---

## 🏗️ Architecture (vue éclair)

4 services backend Python (FastAPI) + 1 frontend Angular, orchestrés par Kubernetes :

- **api-gateway** — auth JWT, routage
- **service-selection** — catalogue/filtrage/upload datasets
- **ml-pipeline-service** — preprocessing, entraînement (Celery : `ml_queue`, `ai_queue`)
- **xai-engine-service** — SHAP / LIME / LLM (Celery : `xai_queue`)
- **frontend** — Angular 19 + Material, i18n FR/EN

Stockage : PostgreSQL (base `ibis_x_db` partagée, version tables Alembic dédiées) · Redis (broker Celery) · MinIO local / Azure Blob prod.

➡️ Schéma complet : [`03-technique/architecture/vue-ensemble.adoc`](https://gwentey.github.io/2025-research-exai/)

---

## 📁 Repères rapides

| Fichier | Rôle |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | Contrat IA — invariants & conventions |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Git flow, conventions commit, processus PR |
| [`SECURITY.md`](./SECURITY.md) | Signalement de vulnérabilités |
| [`CHANGELOG.md`](./CHANGELOG.md) | Historique des versions |
| [`LICENSE`](./LICENSE) | Licence du projet |
| [`memory-bank/`](./memory-bank/) | Référentiel machine : architecture, conventions, glossaire |
| [`docs/`](./docs/) | Documentation Antora (source Asciidoc) |

---

## 📄 Research paper

This codebase accompanies the paper submitted to **KES 2026**:
*"IBIS-X: A Human-Centered Framework for End-to-End Dataset Selection, Machine Learning, and Explainable AI."*

Citation information will be added upon acceptance.

---

## 👥 Auteurs

Projet IBIS-X — Master 2 MIAGE, Paris 1 Panthéon-Sorbonne.
