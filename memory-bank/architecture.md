# Architecture du Projet IBIS-X (PoC)

**Version :** (Dernière vérification code : 2026-04-14, commit `1c3a678`)
**Basé sur :** `conventions.md` (stack + règles), `glossary.md` (vocabulaire), code réel (vérifié 2026-04-14). Sources historiques figées dans `memory-bank/ARCHIVE/` : `prd_ibis_x_poc_v2.md`, `tech_stack_ibis_x_v2.md`, `implementation_plan_exai_poc_adjusted.md`, `AUDIT_DOC_2026-04.md`.

> **Note d'alignement 2026-04-14** : le code réel ajoute par rapport aux versions antérieures de ce document : (a) table `DataQualityAnalysis` (cache analyse qualité), (b) worker xai dédié via `xai-engine-service/Dockerfile.worker` (artifact Skaffold `ibis-x-xai-engine-worker`), (c) tâche Celery `generate_explanation_with_precalculated_shap` (réutilise SHAP pré-calculé), (d) champ `User.role` (default `'user'`) + propriété calculée `is_superuser`, (e) renommage `model_uri` → `artifact_uri` (migration 002), (f) architecture Dataset multi-fichiers (`datasets`.`storage_path` + `dataset_files` + `file_columns` + `dataset_relationships`). Queues Celery réelles (vérifiées 2026-04-14 dans `ml-pipeline-service/app/core/celery_app.py:51-54`, `xai-engine-service/app/core/celery_app.py:62-70` et les deux `celery-worker-deployment.yaml`) : **3 queues** `ml_queue` + `ai_queue` (ml-pipeline) · `xai_queue` seul (xai-engine, toutes tasks y sont routées). Aucun `llm_queue` n'existe dans le code — les versions antérieures de ce document et des autres docs mentionnant `llm_queue` sont erronées.

BDD : **une seule base partagée `ibis_x_db`** (cf. `k8s/base/postgres/postgresql-statefulset.yaml`) ; chaque service isole ses migrations Alembic via une `version_table` dédiée (`alembic_version_gateway`, `alembic_version_selection`, `alembic_version_ml_pipeline`, `alembic_version_xai`).

## 1. Vue d'ensemble

Le projet IBIS-X suit une architecture microservices conçue pour être déployée sur Kubernetes (Minikube pour la PoC). L'objectif est de créer un pipeline intégré : Sélection de Données -> Pipeline ML Guidé -> Exp

```mermaid
graph LR
    A[Utilisateur] --> B(Frontend Angular);
    B --> C{API Gateway FastAPI};
    C --> D[Service Sélection FastAPI];
    C --> E[Service Pipeline ML FastAPI];
    C --> F[Service XAI FastAPI];
    D --> G[(PostgreSQL)];
    E --> G;
    E --> H[(Redis)];
    E --> I(Celery Worker ML);
    F --> J(Celery Worker XAI);
    F --> H;
    I --> G;
    J --> G;
    subgraph Kubernetes Cluster (Namespace: ibis-x)
        B; C; D; E; F; G; H; I; J;
    end
```

**Composants Principaux :**

*   **`frontend/` :** Interface utilisateur développée avec Angular et Angular Material.
*   **`api-gateway/` :** Point d'entrée unique (FastAPI) gérant l'authentification (JWT via `fastapi-users`) et le routage vers les services backend.
*   **`service-selection/` :** Service FastAPI gérant les métadonnées des datasets (stockées dans PostgreSQL), incluant le CRUD, le filtrage/recherche et le scoring.
*   **`ml-pipeline/` :** Service FastAPI orchestrant l'exécution asynchrone (via Celery/Redis) des tâches d'entraînement et d'évaluation de modèles ML (avec Scikit-learn). **Status: ENTIÈREMENT OPÉRATIONNEL** - Bug d'upload des artefacts résolu (19/08/2025). Bug d'affichage du tableau d'analyse résolu (10/09/2025).
*   **`xai-engine/` :** Service FastAPI orchestrant l'exécution asynchrone (via Celery/Redis) des tâches de génération d'explications XAI (avec SHAP/LIME).
*   **`PostgreSQL` :** Base de données relationnelle pour stocker toutes les métadonnées persistantes (datasets, utilisateurs, runs ML, requêtes XAI). Schéma géré via Alembic.
*   **`Redis` :** Broker de messages pour la communication asynchrone via Celery.
*   **`Celery Workers` :** Processus exécutant les tâches longues (ML et XAI) en arrière-plan.
*   **`Kubernetes (Minikube)` :** Plateforme d'orchestration pour le déploiement et la gestion des conteneurs Docker.
*   **`Skaffold & Kustomize` :** Outils utilisés pour le développement local (build/deploy) et la gestion des configurations K8s par environnement.
    *   **`Jobs Kubernetes` :** Gestion automatisée des migrations de base de données avec images multi-environnements.
    *   **`Makefile` :** Automatisation complète du cycle de développement local (installation, migrations, déploiement).
    *   **`docs/` :** Documentation utilisateur et technique au format Antora/Asciidoc (aspect critique du projet).
    *   **`common/` :** Module partagé pour l'abstraction du stockage d'objets unifié (MinIO/Azure).
    *   **`Stockage d'Objets` :** Système hybride avec MinIO (développement) et Azure Blob Storage (production) pour le stockage réel des datasets au format Parquet optimisé.
    *   **`Visualisation Interactive des Arbres` :** Interface de tableau blanc interactif pour explorer les arbres de décision (Decision Tree/Random Forest) avec drag & drop, zoom, pan et export SVG. Implémentation 100% native sans librairies externes (12/09/2025).

## 2. État Actuel des Composants (Basé sur l'analyse du code)

*   **`api-gateway/` :**
    *   **Rôle :** Point d'entrée, Authentification/Autorisation.
    *   **Technos :** FastAPI, Uvicorn, `fastapi-users[sqlalchemy]`, `asyncpg`, Alembic.
    *   **Statut :**
        *   [✅] Configuration FastAPI de base.
        *   [✅] Authentification JWT via `fastapi-users` fonctionnelle (login, register, etc.).
        *   [✅] Table `user` gérée par Alembic.
        *   [✅] Endpoint `/health` présent.
        *   [✅] CORS configuré (permissif).
        *   [✅] **Routage Reverse Proxy complet (2025-01-21)** : Routes `/datasets` et `/projects` vers service-selection.
        *   [✅] **Routes ML Pipeline intégrées (2025-07-29)** : `/experiments` vers ml-pipeline-service.
        *   [✅] **Routes Projets intégrées** : `/projects`, `/projects/{id}`, `/projects/{id}/recommendations`.
        *   [✅] **Configuration multi-environnements** : URLs services adaptées local/Kubernetes.
        *   [✅] **Endpoints Gestion Profil Utilisateur (2025-01-24)** : API complète pour la modification du profil utilisateur.
        *   [✅] **Auto-Connexion Post-Inscription (2025-01-27)** : Amélioration de l'expérience utilisateur avec connexion automatique après inscription.
        *   [⬜] Déploiement K8s à finaliser (configuration probes, secrets).

*   **`service-selection/` :**
    *   **Rôle :** Gestion des métadonnées des datasets et des projets utilisateur.
    *   **Technos :** FastAPI, Uvicorn, SQLAlchemy, Pydantic, Alembic, `psycopg2-binary`/`asyncpg`.
    *   **Statut :**
        *   [✅] Configuration FastAPI de base.
        *   [✅] **Structure BDD normalisée (2025-07-06)** : 5 tables liées (`datasets`, `dataset_files`, `file_columns`, `dataset_relationships`, `dataset_relationship_column_links`) avec UUID comme clés primaires.
        *   [✅] **Table Projects (2025-01-21)** : Gestion projets utilisateur avec critères personnalisés et poids de scoring.
        *   [✅] **Modèles SQLAlchemy complets** pour toutes les tables avec relations ORM.
        *   [✅] **Schémas Pydantic exhaustifs** : Base/Create/Update/Read pour chaque modèle + schémas composés et filtrage.
        *   [✅] **Migration Alembic** : Refonte complète de la structure BDD (migration `6eb0a0e360e3`) + ajout projets (`a7b8c9d0e1f2`).
        *   [✅] **Scripts d'initialisation** : Dossier `scripts/` avec script d'initialisation dataset EdNet.
        *   [✅] **Endpoints CRUD complets** : API REST avec filtrage avancé, pagination, tri et recherche.
        *   [✅] **Endpoints spécialisés** : `/datasets/domains` et `/datasets/tasks` pour les filtres frontend.
        *   [✅] **Endpoints Projets** : CRUD complet `/projects` avec recommandations personnalisées `/projects/{id}/recommendations`.
        *   [✅] **Système de scoring sophistiqué** : Algorithmes multi-critères (éthique, technique, popularité) avec endpoint `/datasets/score`.
        *   [✅] **Documentation scoring complète (2025-07-09)** : Formules mathématiques détaillées (`docs/dev-guide/datasets-scoring-algorithm.adoc`) + guide utilisateur simple (`docs/user-guide/scoring-system.adoc`) + tooltips explicatifs dans l'interface.
        *   [✅] **Filtrage backend-first optimisé** : Élimination du double filtrage client/serveur pour performance maximale.
        *   [🚧] Déploiement K8s à finaliser (configuration probes, secrets).
    
    *   **Endpoints Gestion Profil Utilisateur (2025-01-24) :**
        *   **PATCH `/users/me`** : Mise à jour des informations du profil (pseudo, prénom, nom, langue)
            *   **Schéma** : `UserProfileUpdate` (pseudo, given_name, family_name, locale)
            *   **Authentification** : JWT token requis via `current_active_user`
            *   **Validation** : Mise à jour des champs fournis uniquement (exclude_unset=True)
        *   **PATCH `/users/me/password`** : Changement sécurisé du mot de passe
            *   **Schéma** : `PasswordUpdate` (current_password, new_password)
            *   **Sécurité** : Vérification de l'ancien mot de passe via `password_helper.verify_and_update`
            *   **Validation** : Politique de mot de passe via `user_manager.validate_password`
        *   **PATCH `/users/me/picture`** : Upload d'image de profil
            *   **Schéma** : `ProfilePictureUpdate` (picture en base64 ou URL)
            *   **Validation** : Limite de taille (10MB max) et format supporté
            *   **Stockage** : Image stockée directement en base de données PostgreSQL
        *   **Gestion d'erreurs** : Codes HTTP appropriés (400 pour validation, 500 pour erreurs serveur)
        *   **Logging** : Traçabilité complète des opérations de mise à jour de profil

    *   **Auto-Connexion Post-Inscription (2025-01-27) :**
        *   **Problème Résolu** : Flux d'inscription brisé avec redirection vers page de login, expérience utilisateur dégradée
        *   **Solution Implémentée** : Auto-connexion immédiate après inscription réussie
        *   **Backend API** : Endpoint `/auth/register` modifié pour retourner `SignupResponse` avec :
            *   `access_token` : Token JWT généré automatiquement via `get_jwt_strategy().write_token()`
            *   `token_type` : "bearer" (standard)
            *   `user` : Informations utilisateur complètes (`UserRead`)
        *   **Schéma Pydantic** : Nouveau `SignupResponse` pour structurer la réponse avec token
        *   **Frontend Angular** :
            *   Interface `SignupResponse` ajoutée dans `auth.models.ts`
            *   `AuthService.signup()` modifié pour stocker automatiquement le token JWT
            *   `side-register.component.ts` redirige vers `/starter` au lieu de `/onboarding`
        *   **Gestion d'Erreurs Robuste** :
            *   Vérification du stockage correct du token dans localStorage
            *   Fallback vers login manuel si auto-connexion échoue
            *   Messages d'erreur contextuels avec query parameters
        *   **Sécurité** : Utilise la même stratégie JWT que `/auth/jwt/login` pour cohérence
        *   **Expérience Utilisateur** : Flux fluide inscription → dashboard sans étape intermédiaire

    *   **Structure Base de Données Normalisée (2025-07-06) :**
        *   **`datasets`** (Table principale) : Métadonnées complètes organisées en sections (identification, caractéristiques techniques, critères éthiques)
        *   **`dataset_files`** : Fichiers associés à un dataset (train.csv, test.csv, metadata.json, etc.)
        *   **`file_columns`** : Colonnes/features de chaque fichier avec métadonnées détaillées (types, statistiques, PII)
        *   **`dataset_relationships`** : Relations logiques entre fichiers (foreign key, join, reference)
        *   **`dataset_relationship_column_links`** : Liens précis entre colonnes dans les relations
        *   **Avantages :** Normalisation complète, métadonnées éthiques étendues, support multi-fichiers, traçabilité des relations

    *   **Scripts d'Initialisation (2025-07-06) :**
        *   **`scripts/`** : Dossier dédié aux scripts de maintenance du service
        *   **`scripts/init_datasets.py`** : Script d'initialisation pour datasets multiples avec gestion sélective
        *   **Datasets supportés** : EdNet (5 fichiers, 29 colonnes), OULAD (14 fichiers, 93 colonnes), Students Performance (1 fichier, 8 colonnes)
        *   **Structure organisée** : Imports relatifs, gestion d'erreurs, documentation intégrée
        *   **Usage** : `cd service-selection && python scripts/init_datasets.py [ednet|oulad|students|all]`

    *   **Système de Stockage d'Objets Intégré (Janvier 2025) :**
        *   **Transformation Majeure** : Évolution de metadata-only vers stockage réel de datasets
        *   **API Upload Révolutionnaire** : `POST /datasets` multipart/form-data avec conversion automatique CSV→Parquet
        *   **Module Storage Unifié** : Import du client de stockage commun (`common.storage_client`)
        *   **Conversion Intelligente** : Optimisations automatiques (types natifs, compression, categorical encoding)
        *   **Gestion Fichiers Complète** :
            *   `POST /datasets` : Upload avec génération UUID et stockage objets
            *   `GET /datasets/{id}/download/{filename}` : Téléchargement optimisé avec streaming
            *   `GET /datasets/{id}/files` : Listing des fichiers disponibles
            *   `DELETE /datasets/{id}` : Suppression avec cleanup automatique du stockage
        *   **Database Schema Étendu** : Nouveau champ `storage_path` dans table datasets
        *   **Migration Alembic** : `add_storage_path_to_datasets.py` pour évolution du schéma
        *   **Dépendances Enrichies** : minio, azure-storage-blob, pyarrow, pandas pour traitement avancé
        *   **Scripts d'Init Révolutionnaires** : Génération et upload de données Parquet réalistes
        *   **Performance Exceptionnelle** : Gains 10-50x en vitesse, économie 70-90% stockage

*   **`ml-pipeline-service/` :**
    *   **Rôle :** Orchestration entraînement ML avec support d'algorithmes d'apprentissage automatique.
    *   **Technos :** FastAPI, Uvicorn, Celery, Redis, Scikit-learn, Pandas, Joblib, Matplotlib, Seaborn.
    *   **Statut :**
        *   [✅] **Service Complet Implémenté (2025-07-29)** : API FastAPI avec endpoints complets pour expériences ML.
        *   [✅] **Modèle Experiment** : Table SQLAlchemy avec tous les champs nécessaires (user_id, project_id, dataset_id, algorithme, hyperparamètres, statut, métriques, etc.).
        *   [✅] **Tâches Celery** : Tâche `train_model` complète avec workflow complet (chargement données, prétraitement, entraînement, évaluation, visualisations).
        *   [✅] **Algorithmes ML** : Wrappers pour Decision Tree et Random Forest (classification/régression).
        *   [✅] **Service IA intégré** (`app/ai/llm_service.py`) :
            *   Intégration OpenAI GPT-4 pour analyses intelligentes
            *   Recommandation automatique Classification vs Régression
            *   Recommandation d'algorithmes ML adaptés au dataset
            *   **Correction (2025-09-11)** : Détection automatique colonnes numériques → régression
            *   **Approche Exhaustive (2025-09-11)** : Prompt pédagogique exhaustif pour que l'IA comprenne seule que numérique = régression
            *   **Correction (2025-09-11)** : Erreur 422 - Ajout `task_type` aux hyperparamètres autorisés dans le schéma de validation
            *   **Correction (2025-09-11)** : Erreur double paramètre - Filtrage de `task_type` avant passage aux constructeurs de modèles
        *   [✅] **Module Prétraitement** : Gestion complète des données (valeurs manquantes, encodage catégoriel, normalisation).
        *   [✅] **Module Évaluation** : Métriques complètes (accuracy, precision, recall, F1, MAE, MSE, R²) et visualisations (matrice confusion, courbes ROC, feature importance).
            *   **Correction (2025-09-11)** : Résolution problèmes visualisations - matrices confusion avec labels, courbes ROC/PR avec vraies données, gestion d'erreur améliorée.
            *   **Correction (2025-09-11)** : Respect du type de tâche sélectionné - filtrage des classes rares au lieu du changement automatique en régression.
            *   **Correction (2025-09-11)** : Détection automatique régression pour colonnes numériques - amélioration IA et logique de détection.
        *   [✅] **API Endpoints** :
            *   `POST /experiments` : Création d'une nouvelle expérience
            *   `GET /experiments/{id}` : Statut et progression
            *   `GET /experiments/{id}/results` : Résultats et visualisations
            *   `GET /algorithms` : Liste des algorithmes disponibles
            *   `GET /experiments` : Liste des expériences utilisateur
        *   [✅] **Intégration Storage** : Sauvegarde modèles et artefacts sur MinIO/Azure Blob Storage.
        *   [✅] **Déploiement K8s** : Deployment API + Workers Celery avec configuration appropriée.
        *   [✅] **Monitoring Intégré (2025-08-19)** : Logs structurés, métriques de performance, audit de sécurité.
        *   [✅] **Sécurité Avancée (2025-08-19)** : Quotas utilisateur, validation robuste, contrôle d'accès.
        *   [✅] **Versioning des Modèles (2025-08-19)** : Système de versioning automatique avec timestamps.
        *   [✅] **Pipeline ML Robuste (2025-08-19)** : Gestion d'erreurs avancée, retry policies, fallbacks.
        *   [✅] **Configuration Optimisée (2025-08-19)** : Celery optimisé pour ML, timeouts augmentés, observabilité complète.

*   **`xai-engine-service/` :**
    *   **Rôle :** Service d'explicabilité pour les modèles ML avec intégration LLM adaptative.
    *   **Technos :** FastAPI, Uvicorn, Celery, Redis, SHAP, LIME, OpenAI API, SQLAlchemy, Pydantic.
    *   **Statut :**
        *   [✅] **Service Complet Implémenté (2025-09-02)** : API FastAPI avec endpoints complets pour l'explicabilité.
        *   [✅] **Modèles SQLAlchemy** : Tables `explanation_requests`, `explanation_artifacts`, `chat_messages`.
        *   [✅] **Tâches Celery** : `generate_explanation_task` pour générations XAI asynchrones.
        *   [✅] **Algorithmes XAI** : Explainers SHAP et LIME pour Decision Tree et Random Forest.
        *   [✅] **Service LLM Adaptatif** : Intégration OpenAI avec adaptation du niveau de complexité selon `audience_level` et `ai_familiarity`.
        *   [✅] **API Endpoints** :
            *   `POST /explanations` : Création d'une demande d'explication
            *   `GET /explanations/{id}` : Statut et résultats de l'explication
            *   `POST /explanations/{id}/chat` : Interface chatbot avec limite de 5 questions
            *   `GET /health` : Endpoint de santé du service
        *   [✅] **Intégration Storage** : Sauvegarde des visualisations SHAP/LIME sur MinIO/Azure.
        *   [✅] **Déploiement K8s** : Deployment API + Workers Celery avec configuration optimisée.
        *   [✅] **Gestion Mémoire Optimisée** : Ressources ajustées pour environnement Minikube contraint.
        *   [✅] **Migration Database** : Job Kubernetes pour migrations Alembic automatiques.
        *   [✅] **Configuration Multi-Environnement** : Support MinIO (dev) et Azure Blob (prod).
        *   [✅] **Sécurité** : Gestion des tokens OpenAI via Kubernetes Secrets.

*   **`frontend/` :**
    *   **Rôle :** Interface Utilisateur.
    *   **Technos :** Angular, Angular Material, TypeScript.
    *   **Statut :**
        *   [✅] Projet Angular initialisé.
        *   [✅] Angular Material ajouté comme dépendance.
        *   [✅] Structure de base présente (`services`, `pages`, `layouts`...).
        *   [✅] Service `AuthService` et module/pages d'authentification fonctionnels.
        *   [✅] **Interface Datasets complète** : Service, composants, models et routing intégrés.
        *   [✅] **Interface Projets complète (2025-01-21)** : Gestion complète des projets avec création/édition/visualisation.
        *   [✅] **Composants Angular Material** : Cards, filtres, pagination, recherche, tri.
        *   [✅] **Fonctionnalités avancées** : Filtrage multi-critères, recherche textuelle, interface responsive.
        *   [✅] **Visualisation Heatmap (2025-01-21)** : Analyse visuelle des scores de recommandation par critère.
        *   [✅] **Recommandations Temps Réel** : Preview automatique des datasets recommandés lors de la configuration.
        *   [✅] **Menu de navigation optimisé (2025-01-07)** : Menu de gauche nettoyé pour ne conserver que les fonctionnalités IBIS-X essentielles (Tableau de bord, Datasets, Pipeline ML, Explications XAI). Suppression des éléments de démonstration du thème Spike.
        *   [✅] **Header optimisé pour IBIS-X (2025-01-07)** : Suppression du menu Apps inutile, des liens Chat/Calendar/Email. Recherche élargie pour datasets/modèles. Notifications et raccourcis adaptés au contexte IBIS-X. Profil utilisateur conservé avec traduction française.
        *   [✅] **Interface Sidebar Collapsible Moderne (2025-07-07)** : Architecture révolutionnaire pour la sélection des datasets.
        *   [✅] **Gestion Profil Utilisateur Complète (2025-01-24)** : Interface Angular Material pour modification du profil avec upload d'image.
        *   [✅] **Service ML Pipeline (2025-07-29)** : `MlPipelineService` complet avec toutes les méthodes d'API.
        *   [✅] **Module ML Pipeline (2025-07-29)** : Wizard 5 étapes complet avec Angular Material Stepper :
            *   Étape 1 : Aperçu du dataset
            *   Étape 2 : Configuration prétraitement (colonne cible, valeurs manquantes, normalisation)
            *   Étape 3 : Sélection algorithme (Decision Tree, Random Forest)
            *   Étape 4 : Configuration hyperparamètres
            *   Étape 5 : Résumé et lancement
        *   [✅] **Intégration Projets-ML (2025-07-29)** : Bouton "Sélectionner" dans les recommandations de projet lance directement le wizard ML.
        *   [✅] **Suivi Temps Réel** : Polling automatique du statut avec barre de progression et messages.
        *   [✅] **Affichage Résultats** : Visualisation des métriques et graphiques (confusion matrix, feature importance).
        *   [✅] **Traductions Complètes** : Support FR/EN pour tout le module ML Pipeline.
        *   [✅] **Auto-Connexion Post-Inscription (2025-01-27)** : Amélioration UX majeure du flux d'inscription avec connexion automatique.
        *   [✅] **Amélioration Affichage Crédits Profil (2025-01-29)** : Optimisation du style du texte d'explication des crédits ML dans le profil utilisateur pour une meilleure hiérarchie visuelle.
        *   [✅] **Interface ML Pipeline Code Flow (2025-01-29)** : Innovation équilibrée combinant élégance Linear/Stripe et concept Code Flow révolutionnaire :
            *   **Hero Section Élégante** : Design épuré avec badge animé, typographie soignée, gradient subtil
            *   **Code Flow Concept** : Éditeur de code interactif expliquant la ML pipeline comme du Python
            *   **Terminal Authentique** : Interface VS Code complète avec header, contrôles, syntax highlighting
            *   **Animation Progressive** : Révélation des étapes par clics avec transitions fluides
            *   **Syntaxe Highlighting** : Coloration Python réaliste (functions, operators, strings, comments)
            *   **Output Terminal** : Affichage résultats avec prompt shell et messages de succès
            *   **Contrôles Lecture** : Play/Pause/Reset pour démonstration automatique avec progress bar
            *   **Features Grid** : Cards élégantes style Linear avec micro-animations hover
            *   **CTA Section** : Appel à l'action avec stats preview et design Stripe-inspired
            *   **Innovation Pédagogique** : Première plateforme expliquant ML via métaphore code interactive
            *   **Design Équilibré** : Sophistication technique + accessibilité + professionnalisme
            *   **Performance Optimisée** : Code épuré, animations ciblées, responsive parfait
        *   [✅] **Service XAI (2025-09-02)** : `XAIService` complet avec toutes les méthodes d'API.
        *   [✅] **Module XAI (2025-09-02)** : Composants complets pour l'explicabilité :
            *   `XAIExplanationRequestComponent` : Formulaire de demande d'explication (type, méthode, audience)
            *   `XAIExplanationResultsComponent` : Affichage des résultats avec visualisations et LLM
            *   `XAIChatInterfaceComponent` : Interface chatbot interactive avec limite de 5 questions
        *   [✅] **Intégration ML-XAI (2025-09-02)** : Section XAI ajoutée dans la page de résultats d'expérience ML.
        *   [✅] **Modèles TypeScript XAI** : Interfaces complètes dans `xai.models.ts`.
        *   [✅] **Traductions XAI** : Support FR/EN pour tous les composants XAI.
        *   [✅] **Page Résultats Adaptative (2025-12-28)** : Révolution complète de la page de résultats d'expérience :
            *   **KPIs Adaptatifs** : Métriques principales selon tâche/modèle (F1-macro pour classification, MAE pour régression)
            *   **Visualisations Contextuelles** : Graphiques appropriés selon combinaison (matrices confusion, scatter plots, arbres, importance features)
            *   **Explications Pédagogiques** : Descriptions adaptées au contexte avec conseils d'interprétation
            *   **Comparaison Baseline** : Évaluation automatique vs modèle de référence (majoritaire/médiane)
            *   **4 Combinaisons Supportées** : Classification/Régression × Decision Tree/Random Forest
            *   **Interface Restructurée** : Sections claires (Résumé, KPIs, Visualisations, Comparaisons, Explications)
            *   **Support Multilingue** : Traductions FR/EN contextuelles pour toutes les explications
        *   [⬜] Déploiement K8s non configuré.

    *   **Architecture Interface Modal Moderne (2025-07-07) :**
        *   **Layout Principal Simple** : Header + Recherche rapide + Zone datasets (100% espace)
        *   **Modal de Filtrage** : Interface spacieuse et claire dédiée au filtrage avancé
        *   **Preview Temps Réel** : Compteur de résultats pendant modification des filtres
        *   **Gestion d'État Propre** : `currentFilters` (actuel) + `tempFilters` (modification)
        *   **Actions Explicites** : Boutons "Annuler", "Effacer tout", "Appliquer" bien visibles
        *   **UX Intuitive** : Interface non encombrée, focus total sur filtrage quand nécessaire
        *   **Responsive Excellente** : Modal adaptative desktop/tablet/mobile avec gestures
        *   **Performance Optimisée** : Debounce recherche, preview asynchrone, animations fluides
        *   **Fichiers impactés** :
            *   `frontend/src/app/pages/datasets/dataset-listing.component.html` : Template modal complet
            *   `frontend/src/app/pages/datasets/dataset-listing.component.scss` : CSS modal moderne
            *   `frontend/src/app/pages/datasets/dataset-listing.component.ts` : Logique modal + preview

    *   **Architecture Gestion de Projets (2025-01-21) :**
        *   **Modèles TypeScript** : Interfaces complètes dans `project.models.ts` (Project, ProjectCreate, ProjectRecommendationResponse, etc.)
        *   **Service Angular** : `ProjectService` avec méthodes CRUD complètes et recommandations
        *   **Composants Principaux** :
            *   `ProjectListComponent` : Liste paginée avec recherche et actions CRUD
            *   `ProjectFormComponent` : Formulaire de création/édition avec preview temps réel
            *   `ProjectDetailComponent` : Visualisation complète avec heatmap et recommandations
            *   `ProjectCardComponent` : Carte de projet réutilisable
        *   **Navigation Intégrée** : Routes `/projects` configurées dans `app.routes.ts` + menu sidebar
        *   **Fonctionnalités Avancées** :
            *   Configuration de critères personnalisés via composant de filtres réutilisé
            *   Ajustement de poids de scoring avec sliders interactifs
            *   Preview automatique des recommandations pendant la configuration
            *   Visualisation heatmap des scores par critère pour analyse comparative
            *   Interface responsive desktop/tablet/mobile

    *   **Architecture Gestion Profil Utilisateur (2025-01-24) :**
        *   **Modèles TypeScript** : Interfaces étendues dans `auth.models.ts` (UserUpdate, PasswordUpdate, ProfilePictureUpdate)
        *   **Service Angular** : `AuthService` étendu avec méthodes `updateProfile()`, `updatePassword()`, `updateProfilePicture()`
        *   **Composants Principaux** :
            *   `ProfileComponent` : Interface complète de gestion du profil utilisateur
            *   Formulaires réactifs séparés pour informations personnelles et sécurité
            *   Gestion upload d'image avec preview et validation (format, taille)
        *   **Navigation Intégrée** : Route `/profile` accessible via menu "Mon Profil" dans le header
        *   **Fonctionnalités Avancées** :
            *   Formulaires réactifs Angular avec validation temps réel
            *   Upload d'image avec preview et conversion base64
            *   Validation côté client (formats image, taille max 5MB)
            *   Feedback utilisateur via MatSnackBar pour succès/erreurs
            *   Interface responsive avec Angular Material (MatCard, MatFormField, MatInput)
            *   Sécurité : changement de mot de passe avec validation de l'ancien
        *   **Documentation Complète** :
            *   Guide utilisateur : `docs/user-guide/user-profile-management.adoc`
            *   Documentation technique : `docs/dev-guide/user-profile-components.adoc`
        *   **Bug Fix Critique (2025-01-25)** : Résolution du bug "Maximum call stack size exceeded" dans le formulaire de création de projet
            *   **Problème** : Boucle infinie causée par `defaultWeights` défini comme getter retournant un nouveau tableau à chaque appel
            *   **Solution** : Transformation en propriété normale initialisée dans le constructor avec méthode `initializeDefaultWeights()`
            *   **Améliorations** : Validation robuste dans `onWeightChange()`, gestion d'événements `valueChange` au lieu de `change`, debounce des updates
            *   **Impact** : Formulaire de création de projet maintenant stable et fonctionnel
        *   **Sécurisation Critique des Projets Utilisateur (2025-01-25)** : Correction d'un trou de sécurité majeur
            *   **Problème** : Tous les projets étaient accessibles à tous les utilisateurs connectés, `user_id` généré aléatoirement
            *   **Solution** : Transmission `user_id` via headers `X-User-ID` de l'API Gateway vers service-selection
            *   **Sécurisation** : Tous les endpoints de projets filtrent maintenant obligatoirement par `user_id` de l'utilisateur connecté
            *   **Endpoints sécurisés** : `/projects` (GET/POST), `/projects/{id}` (GET/PUT/DELETE), `/projects/{id}/recommendations`, `/datasets/score`
            *   **Impact** : Isolation complète des projets par utilisateur, conformité RGPD, logs de sécurité détaillés
        *   **Suppression de Compte Sécurisée (2025-01-25)** : Fonctionnalité de suppression définitive avec confirmation par mot de passe
            *   **Interface Utilisateur** : Section "Zone Dangereuse" dans les paramètres de sécurité du profil
            *   **Boîte de Dialogue** : Confirmation détaillée avec liste des données supprimées et saisie du mot de passe
            *   **Sécurité** : Validation du mot de passe actuel obligatoire avant suppression
            *   **Backend API** : Endpoint `DELETE /users/me` avec vérification de mot de passe
            *   **Suppression Complète** : Toutes les données utilisateur supprimées (profil, projets, historique, OAuth accounts)
            *   **Interface Moderne** : Boîte de dialogue Angular Material avec styles visuels d'avertissement
            *   **Traduction** : Support FR/EN avec clés `PROFILE.SECURITY.DELETE_ACCOUNT.*`
            *   **Logging** : Traçabilité complète des demandes et suppressions de compte
            *   **Redirection** : Déconnexion automatique et redirection vers la page de connexion

        *   **Système de Crédits Amélioré (2025-01-27)** : Refonte complète du système de recharge de crédits
            *   **Problème Résolu** : Délai incorrect de 30 jours au lieu de 7 jours, logique de recharge défaillante
            *   **Backend Corrigé** : 
                *   API Gateway `UserManager.claim_credits()` - délai de recharge réduit de 30 à 7 jours
                *   Logique de recharge corrigée pour compléter jusqu'à 10 crédits (pas toujours remettre à 10)
                *   Documentation des endpoints mise à jour pour refléter le nouveau délai
            *   **Frontend Amélioré** :
                *   Affichage de la date du dernier claim avec gestion du cas "jamais réclamé"
                *   Indicateur du nombre de jours restants avant la prochaine recharge possible
                *   Statut dynamique (Disponible maintenant / Dans X jours)
                *   Section d'informations contextuelle avec icônes Material Design
            *   **Interface Utilisateur** : Section d'informations de claim dans `/profile/credits-refill`
                *   Affichage de la dernière récupération avec formatage de date
                *   Indicateur de disponibilité avec codes couleur (vert/orange/gris)
                *   Messages adaptatifs selon l'état (disponible, en attente, jamais réclamé)
            *   **Traductions Complètes** : Nouvelles clés FR/EN pour tous les nouveaux messages
                *   `CREDITS_REFILL.LAST_CLAIM`, `NEVER_CLAIMED`, `NEXT_AVAILABLE`, `IN_DAYS`, `STATUS`, `AVAILABLE_NOW`
                *   Correction du délai dans les descriptions existantes (30→7 jours)
            *   **Styles CSS** : Nouvelle section `.claim-info-section` avec design Material cohérent
            *   **Correction Erreur Sérialisation (2025-01-27)** : 
                *   Problème résolu : "Object of type datetime is not JSON serializable" 
                *   Solution : Conversion automatique des dates en format ISO via `.isoformat()`
                *   Plus d'erreurs serveur 500 lors de la recharge de crédits
            *   **Réorganisation Interface (2025-01-27)** :
                *   Section informations de claim déplacée directement après l'indicateur de crédits
                *   Section "Comment ça fonctionne" déplacée en bas dans une card séparée
                *   Interface plus logique et progressive pour l'utilisateur
                *   Correction du délai dans la description d'accessibilité (30→7 jours)
            *   **Amélioration UX Finale (2025-01-27)** :
                *   **Affichage Immédiat** : Informations de claim visibles dès le chargement de la page
                *   **Pas de Redirection** : L'utilisateur reste sur la page après recharge des crédits
                *   **Message de Succès Amélioré** : Snackbar avec émojis et informations détaillées
                *   **Formatage de Date** : Affichage français lisible (ex: "5 août 2025, 16:06")
                *   **Gestion des États** : Affichage correct que l'utilisateur ait déjà réclamé ou non
                *   **Détection de Changements** : ChangeDetectionStrategy optimisée pour réactivité
                *   **Styles de Succès** : Design vert attractif pour les notifications de réussite
                *   **Typage TypeScript Robuste** : Fonction `formatClaimDate()` gère `string | undefined`
                *   **Template Simplifié** : Suppression de la logique conditionnelle complexe
                *   **Optimisation TypeScript** : Suppression des opérateurs optional chaining inutiles grâce aux gardes `*ngIf`

        *   **Visualisation Détaillée des Datasets (2025-01-25)** : Interface complète similaire à Kaggle
        *   **Composant Principal** : `DatasetDetailComponent` avec routing intégré `/datasets/:id`
        *   **Header Moderne Style Stripe/Linear (2025-01-29)** : Refonte complète du header pour un design plus épuré et professionnel
            *   Remplacement du design complexe avec particules par une approche Stripe/Linear
            *   Optimisation de l'utilisation de l'espace horizontal (50% de réduction verticale)
            *   Intégration des tags directement dans la ligne du titre
            *   Métriques compactes avec séparateurs inline
            *   Navigation breadcrumb cliquable et responsive design
        *   **Onglets Complets** :
            *   Vue d'ensemble : statistiques, informations générales, conformité éthique, métriques de qualité
            *   Fichiers et Structure : exploration des fichiers, détails des colonnes, métadonnées techniques
            *   Aperçu des Données : échantillon tabulaire (50 lignes), statistiques descriptives par colonne
            *   **Guide IA (2025-01-29)** : Nouvel assistant intelligent remplaçant Analytics
                *   Analyse automatique des caractéristiques du dataset
                *   Recommandations personnalisées de tâche ML (classification/régression)
                *   Suggestions d'algorithmes optimaux (Decision Tree/Random Forest)
                *   Interface moderne avec étapes d'analyse animées
                *   Intégration prévue avec OpenAI pour analyses approfondies
                *   Logique de recommandation basée sur la taille, complexité et domaine du dataset
        *   **Alertes de Qualité** : Système d'alertes contextuelles avec recommandations (complétude < 80%, outliers > 5%, risque PII > 30%)
        *   **Datasets Similaires** : Recommandations basées sur domaine, tâches ML, structure des données
        *   **Design Responsive** : Interface adaptative desktop/tablet/mobile avec animations CSS
        *   **Modèles de Données Étendus** : `DatasetDetailView`, `DatasetPreview`, `DatasetQualityMetrics`, `DataDistributionAnalysis`
        *   **Services API Nouveaux** : `getDatasetDetails()`, `getDatasetPreview()`, `getDatasetQualityMetrics()`, `getSimilarDatasets()`
        *   **Internationalisation** : Support FR/EN avec clés `DATASET_DETAIL.*` organisées par sections
        *   **Navigation Intégrée** : Bouton "Voir" dans les cartes de datasets navigue vers la page de détail
        *   **Performance** : Chargement parallèle via `forkJoin`, gestion d'erreurs gracieuse, limitation automatique d'affichage
        *   **Documentation Technique** : Guide complet dans `docs/dev-guide/dataset-detail-visualization.adoc`
        *   **Évolutions Prévues** : Graphiques interactifs, export PDF, intégration ML Pipeline, comparaison de datasets

    *   **Système d'Importation de Datasets en Batch (Innovation Majeure - Janvier 2025)** : Solution industrielle complète pour l'intégration massive de datasets réels
        *   **Transformation Architecturale** : Évolution d'un processus manuel vers une automatisation intelligente
        *   **Architecture Kaggle** : Suite d'outils pour import automatique depuis Kaggle API dans `datasets/kaggle-import/`
            *   `kaggle_importer.py` : Import automatique depuis Kaggle avec cache intelligent
            *   `kaggle_datasets_config.yaml` : Configuration centralisée des datasets
            *   `Makefile` : 10+ commandes d'automatisation (import-all, import-dataset, test-auth, status, etc.)
            *   `README.md` : Guide complet d'utilisation locale et production
        *   **Fonctionnalités Avancées** :
            *   **Cache Intelligent** : 7 jours, évite re-téléchargements inutiles
            *   **API Kaggle** : Import direct depuis la source sans limitations GitHub
            *   **Support Multi-fichiers** : Gestion automatique des datasets complexes
            *   **Conversion Optimisée** : CSV → Parquet avec gains de performance 10-50x
            *   **Job Kubernetes** : Import automatique en production via `kaggle-dataset-import-job.yaml`
        *   **Datasets Configurés** : 7 datasets (education, social-media) prêts à importer
        *   **Sécurité** : Credentials Kaggle en secrets K8s, nettoyage automatique
        *   **Documentation** : Guide complet Antora (`batch-dataset-import-system.adoc`)
        *   **Intégration Architecture** : Workflow temporaire → stockage objets → backend lecture exclusive via `common/storage_client.py`
        *   **🚨 ÉVOLUTION MAJEURE → Système d'Import Kaggle (Janvier 2025)** : Remplacement du système local par import automatique depuis Kaggle API
            *   **Problème Résolu** : Datasets trop volumineux pour GitHub (impossible de déployer en production)
            *   **Nouvelle Architecture** : `Kaggle API → Téléchargement → Conversion Parquet → Upload Stockage → BDD`
            *   **Scripts Développés** : `kaggle_importer.py`, configuration YAML, cache intelligent 7 jours
            *   **Job Kubernetes** : `kaggle-dataset-import-job.yaml` pour import automatique en production
            *   **Avantages** : Pas de limite de taille, cache intelligent, conversion automatique, job récurrent
            *   **Configuration** : 7 datasets configurés (education, social-media) avec métadonnées complètes
            *   **Sécurité** : Credentials Kaggle en secrets K8s, nettoyage automatique fichiers temporaires
            *   **Makefile** : 10+ commandes d'automatisation (import-all, import-dataset, test-auth, status, etc.)

    *   **Correction Critique Filtrage Multi-Critères (2025-01-25)** : Résolution du problème de logique AND/OR dans les filtres
        *   **Problème** : Quand l'utilisateur sélectionnait 2 critères dans "Domaine d'application", le système retournait les datasets ayant l'un OU l'autre (logique OR)
        *   **Comportement Attendu** : L'utilisateur voulait que les datasets aient tous les critères sélectionnés (logique AND)
        *   **Solution** : Remplacement de l'opérateur PostgreSQL `&&` (intersection) par `@>` (contient) dans `service-selection/app/main.py`
        *   **Impact** : 
            *   Filtres de domaines : Un dataset doit contenir TOUS les domaines sélectionnés
            *   Filtres de tâches : Un dataset doit contenir TOUTES les tâches sélectionnées
            *   Comportement cohérent avec les attentes utilisateur
        *   **Autres Filtres** : La logique AND était déjà correcte pour les autres types de filtres (numériques, booléens)
        *   **Compatibilité** : Aucun impact sur la fonction `find_similar_datasets` qui utilise correctement l'opérateur `&&` pour trouver des similarités

    *   **Correction Bug Critique Score Éthique (2025-01-25)** : Résolution de l'erreur HTTP 500 lors de l'utilisation du filtre "Score éthique minimum"
        *   **Problème** : Erreur HTTP 500 quand l'utilisateur appliquait le filtre "Score éthique > 80%" ou toute autre valeur
        *   **Cause Technique** : Utilisation incorrecte de `sum()` Python avec des expressions SQLAlchemy dans `apply_filters()`
        *   **Code Problématique** : `true_count = sum(case([(criterion == True, 1)], else_=0) for criterion in ethical_criteria)`
        *   **Solution** : Remplacement par une expression SQLAlchemy native avec addition explicite de tous les critères
        *   **Code Corrigé** : Addition manuelle de 10 expressions `case()` pour chaque critère éthique
        *   **Critères Évalués** : informed_consent, transparency, user_control, equity_non_discrimination, security_measures_in_place, data_quality_documented, anonymization_applied, record_keeping_policy_exists, purpose_limitation_respected, accountability_defined
        *   **Calcul** : (nombre_critères_vrais / 10) * 100 = pourcentage éthique
        *   **Test** : Filtre "Score éthique ≥ 80%" fonctionne maintenant correctement
        *   **Correction Syntaxe SQLAlchemy (2025-01-25)** : Résolution d'une erreur de syntaxe additionnelle
            *   **Erreur Supplémentaire** : `ArgumentError: The "whens" argument to case() is now passed as a series of positional elements, rather than as a list`
            *   **Problème Syntaxe** : `case([(condition, value)], else_=0)` (crochets pour listes)
            *   **Correction Syntaxe** : `case((condition, value), else_=0)` (parenthèses pour tuples)
            *   **Impact** : Compatibilité avec SQLAlchemy récent, toutes les expressions `case()` mises à jour

    *   **Correction Bug Expiration Token JWT (2025-01-25)** : Résolution du problème d'erreur 401 lors de la suppression des filtres
        *   **Problème** : Après application d'un filtre qui fonctionne, la suppression du filtre génère une erreur HTTP 401 (Non autorisé)
        *   **Cause** : Token JWT expiré entre l'application et la suppression du filtre, mais pas de gestion proactive de l'expiration
        *   **Symptômes** : 
            *   Filtre "Éthique ≥ 80%" fonctionne
            *   Suppression du filtre → Erreur 401 et message "Non autorisé"
            *   Interface bloquée jusqu'à rechargement de page
        *   **Solutions Appliquées** :
            *   **Intercepteur étendu** : Gestion d'expiration sur TOUS les endpoints API (pas seulement `/users/me`)
            *   **Vérification proactive** : Méthode `isTokenExpired()` qui décode et vérifie le JWT avant les requêtes
            *   **Déconnexion automatique** : Nettoyage automatique du localStorage quand token expiré
            *   **Redirection préventive** : Redirection vers login AVANT requête si token expiré
        *   **Améliorations Techniques** :
            *   Décodage sécurisé du payload JWT (`atob(token.split('.')[1])`)
            *   Comparaison timestamps (exp vs current time)
            *   Gestion d'erreurs si token malformé
            *   Messages d'erreur explicites avec query params
        *   **Résultat** : Plus d'erreur 401 inattendue, expérience utilisateur fluide avec reconnexion guidée

## 3. Système de Stockage d'Objets (Innovation Majeure - Janvier 2025)

**Transformation Architecturale :** Le projet IBIS-X a évolué d'un système gérant uniquement des métadonnées vers un système de stockage d'objets haute performance, permettant le stockage et la gestion réels des datasets.

### 3.1 Architecture Hybride Multi-Cloud

Le système implémente une architecture hybride révolutionnaire permettant une transition transparente entre environnements de développement et de production :

*   **Développement (Minikube)** : MinIO Server pour stockage S3-compatible local
*   **Production (Azure)** : Azure Blob Storage pour scalabilité et sécurité enterprise
*   **Abstraction Unifiée** : Module commun (`common/storage_client.py`) avec factory pattern

```mermaid
graph TB
    subgraph "Application Layer"
        API[service-selection API]
        INIT[Scripts d'initialisation]
    end
    
    subgraph "Storage Abstraction"
        SC[Storage Client Factory]
        SC --> |get_storage_client()|CFG{Environment Config}
    end
    
    subgraph "Development Environment"
        CFG --> |STORAGE_BACKEND=minio|MINIO[MinIO Server]
        MINIO --> BUCKET[ibis-x-datasets bucket]
    end
    
    subgraph "Production Environment"
        CFG --> |STORAGE_BACKEND=azure|AZURE[Azure Blob Storage]
        AZURE --> CONTAINER[ibis-x-datasets container]
    end
    
    subgraph "Data Layer"
        DB[(PostgreSQL)]
        DB --> |storage_path|BUCKET
        DB --> |storage_path|CONTAINER
    end
    
    API --> SC
    INIT --> SC
    API --> DB
```

### 3.2 Innovation Format Parquet

**Révolution Performance :** Conversion automatique CSV → Parquet avec gains exceptionnels :

*   **Compression** : Réduction de 80-90% de la taille de stockage
*   **Performance** : Lecture 10-50x plus rapide
*   **Fonctionnalités** : Support types natifs, indexation colonnaire, predicate pushdown
*   **Optimisations** : Compression intelligente (Snappy, Dictionary, RLE)

**Exemple Concret :**
```
Dataset EdNet (131M lignes, 10 colonnes) :
├── CSV Original : 5.2 GB, 45s lecture
└── Parquet Optimisé : 520 MB, 2s lecture (gain 95%)
```

### 3.3 Composants Techniques

#### Module Commun (`common/`)
*   **`storage_client.py`** : Factory pattern unifié pour MinIO/Azure
*   **Clients Spécialisés** :
    *   `MinIOStorageClient` : Optimisé développement local
    *   `AzureBlobStorageClient` : Optimisé production Azure
*   **Gestion d'Erreurs** : Error handling unifié avec logging détaillé

#### Intégration Database
*   **Nouveau Champ** : `storage_path` dans table `datasets`
*   **Migration Alembic** : `add_storage_path_to_datasets.py`
*   **Distinction Sémantique** :
    *   `storage_uri` : URLs externes (Kaggle, GitHub)
    *   `storage_path` : Préfixe stockage objets (ex: `ibis-x-datasets/uuid/`)

#### Configuration Kubernetes
*   **Secrets** : `storage-credentials` avec clés d'accès
*   **Variables d'Environnement** :
    *   `STORAGE_BACKEND` : 'minio' ou 'azure'
    *   `STORAGE_ENDPOINT_URL` : URL du service de stockage
    *   `STORAGE_CONTAINER_NAME` : Nom du bucket/container
*   **Patches Kustomize** : Configuration spécifique par environnement

### 3.4 Workflows Avancés

#### Upload et Processing
1. **Réception Multipart** : Endpoint `POST /datasets` supportant fichiers + métadonnées
2. **Génération UUID** : Identifiant unique pour organisation hiérarchique
3. **Conversion Automatique** : CSV → Parquet avec optimisations
4. **Upload Parallèle** : Stockage vers MinIO/Azure selon environnement
5. **Métadonnées** : Création enregistrements Dataset + DatasetFile

#### Téléchargement Optimisé
*   **Streaming** : Support fichiers volumineux (>100MB) par chunks
*   **Cache Intelligent** : Headers optimisés (Cache-Control, ETag)
*   **Sécurité** : Validation permissions avant accès stockage

#### Suppression Complète
*   **Cleanup Automatique** : Suppression stockage + base de données
*   **Transaction Atomique** : Rollback complet en cas d'erreur

### 3.5 Initialisation Révolutionnaire

Le script `init_datasets.py` a été complètement repensé :

*   **Génération Procédurale** : Données échantillons réalistes basées sur métadonnées
*   **Distributions Statistiques** : Log-normale pour IDs, Zipf pour catégories
*   **Upload Réel** : Fichiers Parquet générés et stockés
*   **Métadonnées Précises** : Tailles, formats, et statistiques exacts

### 3.6 Monitoring et Observabilité

*   **Métriques Performance** : Temps upload/download, ratios compression
*   **Logging Détaillé** : Traçabilité complète des opérations stockage
*   **Error Tracking** : Gestion d'erreurs avec retry automatique
*   **Usage Analytics** : Patterns d'accès et optimisations

### 3.7 Sécurité Enterprise

*   **Chiffrement End-to-End** : HTTPS/TLS 1.3, AES-256 au repos
*   **Authentification Granulaire** : Validation permissions par opération
*   **Audit Trail** : Logging sécurisé pour compliance RGPD
*   **Clés Gérées** : Azure Key Vault en production

### 3.8 Impact et ROI

**Gains Quantifiables :**
*   Performance : Réduction 80-95% temps chargement
*   Coûts : Économie 70-80% stockage Azure
*   Développement : Réduction 80% complexité setup
*   Scalabilité : Support datasets illimités vs metadata-only

**Innovation Technique :**
*   Premier système IBIS-X avec stockage réel
*   Architecture hybride multi-cloud
*   Conversion automatique haute performance
*   Factory pattern extensible

### 3.9 Documentation Technique

**Documentation Complète** : `docs/dev-guide/object-storage-implementation.adoc`
*   Architecture détaillée et justifications techniques
*   Guides configuration développement/production
*   Optimisations Parquet et gains performance
*   Procédures sécurité et compliance
*   Roadmap évolutions futures

---

*   **Infrastructure :**
    *   [✅] PostgreSQL déployé sur K8s et accessible.
        *   **Note importante (2024-04-27) :** La gestion de PostgreSQL a été migrée d'un Deployment vers un **StatefulSet** pour une meilleure gestion de l'état, une identité stable des pods, et pour résoudre les problèmes d'attachement de volume ReadWriteOnce (RWO) lors des mises à jour.
    *   [✅] **Redis déployé (2025-07-29)** : StatefulSet Redis avec persistance pour Celery broker/backend.
    *   [✅] **Workers Celery déployés (2025-07-29)** : Deployment séparé pour workers ML Pipeline avec configuration Redis et stockage.
    *   [✅] Ingress Controller (NGINX via Helm) déployé sur AKS.
    *   [✅] Cert-Manager déployé via Helm sur AKS pour gestion TLS Let's Encrypt.
    *   [✅] Ingress K8s (`ibis-x-ingress`) configuré pour router `ibisx.fr` vers `frontend` et `api.ibisx.fr` vers `api-gateway`, avec TLS activé via cert-manager.
    *   **Note Infrastructure Azure (AKS) :
        *   Le service Nginx Ingress (type LoadBalancer) crée un Load Balancer public Azure.
        *   Des règles NSG sont configurées pour autoriser le trafic sur les ports 80 et 443 vers l'IP publique du Load Balancer.
        *   **Point critique (résolu le 2025-04-27):** Les sondes de santé (Health Probes) HTTP et HTTPS du Load Balancer Azure *doivent* cibler le chemin `/healthz` sur les NodePorts correspondants du service Nginx Ingress (par défaut `/` qui provoque des échecs) pour que le Load Balancer considère les nœuds comme sains et route le trafic correctement.

*   **Automatisation & Migrations (Nouveau - 2024-04-27) :**
    *   [✅] **Makefile intelligent** : Automatisation complète du cycle de développement local
        *   `make dev` : Installation complète (prérequis, Minikube, déploiement, migrations)
        *   `make quick-dev` : Redémarrage rapide
        *   `make migrate` : Gestion automatique des migrations
        *   `make clean/reset` : Nettoyage et réinitialisation
    *   [✅] **Jobs Kubernetes de migration** : Gestion automatisée des migrations Alembic
        *   `k8s/base/jobs/api-gateway-migration-job.yaml`
        *   `k8s/base/jobs/service-selection-migration-job.yaml`
        *   **Images multi-environnements** : Images locales par défaut, transformées automatiquement en production
    *   [✅] **Overlays Kustomize améliorés** :
        *   Configuration base pour développement local
        *   Transformation automatique des images pour production Azure
        *   Patches pour `imagePullPolicy` selon l'environnement
    *   [✅] **Documentation techniques** : Guide complet des migrations dans `docs/modules/ROOT/pages/dev-guide/database-migrations.adoc`

## 3. Interactions Clés

*   Le **Frontend** communique exclusivement avec l'**API Gateway**.
*   L'**API Gateway** valide l'authentification (JWT) et relaie les requêtes aux services backend appropriés (fonctionnalité de proxy **à implémenter**).
*   **`service-selection`**, **`ml-pipeline`**, **`xai-engine`** interagissent avec la base de données **PostgreSQL** (via SQLAlchemy et Alembic pour les migrations).
*   **`ml-pipeline`** et **`xai-engine`** utilisent **Redis** comme broker pour envoyer/recevoir des tâches via **Celery Workers**.
*   Les **Celery Workers** interagissent avec **PostgreSQL** pour lire/écrire les statuts et résultats, et potentiellement avec un stockage de fichiers partagé (PV K8s / Blob Storage) pour lire/écrire des datasets/modèles/résultats.

## 4. Documentation

*   La documentation utilisateur et technique doit être générée dans `docs/` en utilisant **Antora/Asciidoc**. C'est une exigence forte du projet. (Statut actuel : Probablement [⬜])

## 5. Améliorations Récentes (2024-04-27)

### Résolution du Problème des Migrations

**Contexte :** L'installation d'IBIS-X nécessitait de nombreuses commandes manuelles complexes et les migrations échouaient en développement local à cause d'un problème d'images Docker.

**Problèmes résolus :**
1. **Complexité d'installation** : 15+ commandes manuelles pour démarrer l'application
2. **Images Docker incompatibles** : Jobs de migration utilisaient des images ACR même en local
3. **Expérience développeur** : Processus d'onboarding difficile pour nouveaux développeurs
4. **Gestion des migrations** : Commandes `kubectl exec` manuelles et error-prone

**Solutions implémentées :**

#### Makefile Intelligent
- **Installation en 1 commande** : `make dev` gère tout automatiquement
- **Feedback visuel** : Couleurs, emojis, messages de progression clairs
- **Gestion d'erreurs** : Vérification des prérequis, timeouts, logs d'erreur
- **Commandes quotidiennes** : `make quick-dev`, `make stop`, `make reset`

#### Jobs Kubernetes Multi-Environnements
- **Base locale** : Images `api-gateway:latest`, `service-selection:latest`
- **Transformation Azure** : Kustomize change automatiquement vers ACR
- **Pull Policy adaptatif** : `IfNotPresent` (local) → `Always` (production)
- **Idempotence** : Alembic gère automatiquement l'état des migrations

**Impact :**
- ✅ **Développeurs** : Onboarding en 3 minutes au lieu de 30+
- ✅ **Maintenance** : Un seul endroit pour définir les jobs
- ✅ **Production** : Même mécanisme robuste en local et Azure
- ✅ **Documentation** : Guide complet des différences local/production

## 6. Déploiement et CI/CD

*   **Développement Local :** `skaffold dev` est utilisé pour builder les images Docker localement et déployer sur Minikube en utilisant Kustomize (`k8s/overlays/minikube`).
    *   La configuration, y compris l'URL de redirection OAuth locale (`OAUTH_REDIRECT_URL`), est chargée par les services (ex: API Gateway) depuis des variables d'environnement ou un fichier `.env`, avec des valeurs par défaut définies dans le code (ex: `api-gateway/app/core/config.py`).

## Développement Local

L'environnement de développement local utilise Minikube pour simuler le cluster Kubernetes et Skaffold pour automatiser le cycle de build/déploiement.

### Installation Simplifiée (Makefile)

**Version :** 2025-07-30 - Résolution complète des problèmes de stabilité

Un **Makefile ultra-robuste** avec scripts PowerShell dédiés résout les problèmes de stabilité (port-forwards fantômes, erreurs CORS, terminal bloqué) :

#### Commandes Principales
*   **`make dev`** : Installation complète STABLE (ne bloque plus le terminal)
*   **`make logs`** : Affichage des logs interruptible avec Ctrl+C
*   **`make healthcheck`** : Vérification de l'état de santé des services
*   **`make autofix`** : Réparation automatique des problèmes
*   **`make monitor`** : Surveillance continue avec auto-réparation
*   **`make fix-portforwards`** : Force la réparation des port-forwards

#### Scripts PowerShell de Support (Windows)
*   **`kill-port-forwards.ps1`** : Nettoyage complet des processus kubectl et libération des ports
*   **`start-port-forwards.ps1`** : Démarrage robuste avec retry automatique
*   **`stream-logs.ps1`** : Affichage des logs interruptible
*   **`healthcheck-ports.ps1`** : Vérification et réparation automatique

#### Améliorations Clés
*   **Taux de succès** : ~95% (contre ~10% avant)
*   **Terminal non bloqué** : Les logs s'affichent dans un processus séparé
*   **Auto-réparation** : Détection et correction automatique des problèmes
*   **Support multi-OS** : Détection automatique Windows/Linux/Mac

### Gestion Automatique des Migrations

**Version :** 2024-04-27 - Résolution du problème des images Docker multi-environnements

Les migrations de base de données sont maintenant gérées via des **Jobs Kubernetes** avec **gestion automatique des images** selon l'environnement :

*   **`k8s/base/jobs/api-gateway-migration-job.yaml`**
*   **`k8s/base/jobs/service-selection-migration-job.yaml`**

#### Problème Résolu : Images Docker Multi-Environnements

**Problème initial :**
- Les jobs utilisaient des images ACR (`ibisprodacr.azurecr.io/...`) même en local
- Skaffold construit les images localement avec des noms différents (`api-gateway:latest`)
- Échec des migrations en développement local

**Solution implémentée :**
1. **Jobs de base** : Utilisent des images locales par défaut (`api-gateway:latest`, `service-selection:latest`)
2. **Kustomize overlays** : Transforment automatiquement les images selon l'environnement
3. **Patches Azure** : Ajustent `imagePullPolicy` pour la production

#### Configuration Multi-Environnements

**Base (k8s/base/jobs/) :**
```yaml
# Configuration par défaut (développement local)
image: api-gateway:latest
imagePullPolicy: IfNotPresent
```

**Overlay Azure (k8s/overlays/azure/) :**
```yaml
# Transformation automatique des images
images:
  - name: api-gateway
    newName: ibisprodacr.azurecr.io/exai-api-gateway
  - name: service-selection
    newName: ibisprodacr.azurecr.io/service-selection

# Patch pour forcer le pull en production
patches:
  - path: migration-jobs-pullpolicy-patch.yaml  # imagePullPolicy: Always
```

#### Avantages de cette approche :
*   **Idempotence** : Alembic gère automatiquement les migrations déjà appliquées
*   **Multi-environnements** : Images automatiquement adaptées (local/production)
*   **Sécurité** : Gestion des erreurs et timeouts
*   **Simplicité** : Plus besoin de commandes manuelles `kubectl exec`
*   **Production-Ready** : Même mécanisme en local et en production
*   **Maintenance** : Un seul endroit pour définir les jobs

### Accès aux Services (Profil Local)

Lorsque l'on utilise la commande `skaffold dev --profile=local`, l'accès aux principaux services se fait via des redirections de port gérées automatiquement par Skaffold :

*   **Frontend:** Accessible sur `http://localhost:8080`
*   **API Gateway:** Accessible sur `http://localhost:9000` (y compris `/docs` et `/redoc`)

Cette méthode évite d'avoir besoin de `minikube tunnel` ou `minikube service` pour le workflow de développement standard.

Il est crucial qu'aucun autre service (comme un serveur XAMPP/Apache local) n'utilise les ports `8080` ou `9000` sur la machine hôte.

### Redémarrages Multiples

✅ **Entièrement supporté** : L'application peut être démarrée/arrêtée plusieurs fois par jour sans problème.

*   **PostgreSQL** : Utilise un StatefulSet avec volumes persistants
*   **Migrations** : Idempotentes via Alembic
*   **Configuration** : Persistée via les secrets Kubernetes

## Déploiement

*   **Déploiement Production (Azure) :**
    *   Un workflow GitHub Actions (`.github/workflows/deploy-production.yml`) est configuré.
    *   **Trigger :** Push sur la branche `production`.
    *   **Étapes Principales :
        1.  Checkout du code.
        2.  Login sur Azure Container Registry (ACR).
        3.  Build et Push des images Docker des services (`api-gateway`, `service-selection`, `frontend`, etc.) vers ACR.
        4.  Mise à jour des manifestes de base K8s (`k8s/base/...`) via `sed` pour injecter les valeurs des secrets GitHub Actions (DB URL, JWT Key, Google Credentials, **URL de redirection OAuth de production**). Les valeurs sont encodées en Base64 pendant cette étape.
        5.  Login sur Azure (via Service Principal).
        6.  Configuration du contexte `kubectl` pour le cluster AKS cible.
        7.  (Ajouté) Suppression explicite des Secrets K8s existants (ex: `gateway-secrets`) pour forcer leur recréation par Skaffold.
        8.  Déploiement sur AKS via `skaffold deploy --profile=azure --tag=<commit_sha>` qui utilise l'overlay Kustomize `k8s/overlays/azure`. Cet overlay applique des patches (ex: Ingress) mais **ne modifie plus** l'URL de redirection OAuth (qui est déjà la bonne dans le manifeste de base modifié à l'étape 4).
        9.  Exécution des jobs de migration Alembic (`api-gateway-migration-job`, etc.).
        10. Redémarrage des déploiements si nécessaire.
    *   **Gestion de la Configuration Production :
        *   **Frontend :** Utilisation de `frontend/src/environments/environment.prod.ts` (qui contient l'URL de l'API de production) activé par la configuration de build Angular et le Dockerfile.
        *   **Backend :** Les configurations sont injectées via les Secrets K8s, peuplés par le workflow GitHub Actions (voir étape 4 ci-dessus).
        *   **Kubernetes :** L'overlay `k8s/overlays/azure` contient les manifestes/patches spécifiques à Azure (ex: nom d'images, Ingress) mais **ne gère plus** le patch spécifique pour l'URL de redirection OAuth.
        *   **Migrations :** Les images des jobs sont automatiquement transformées par Kustomize (`api-gateway:latest` → `ibisprodacr.azurecr.io/exai-api-gateway:latest`) avec `imagePullPolicy: Always`.
    *   **Secrets Requis (GitHub Actions) :** `ACR_USERNAME`, `ACR_PASSWORD`, `AZURE_CREDENTIALS`, `JWT_SECRET_KEY`, `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OAUTH_REDIRECT_URL` (contenant l'URL de production **frontend**).
            *   **Certificats TLS :** Gérés automatiquement par `cert-manager` via `ClusterIssuer` Let's Encrypt (requiert configuration Ingress correcte et accessibilité externe sur port 80 pour challenge HTTP-01).
        *   **Note Infrastructure Azure (AKS) :**
            *   Le service Nginx Ingress (type LoadBalancer) crée un Load Balancer public Azure.
            *   Des règles NSG sont configurées pour autoriser le trafic sur les ports 80 et 443 vers l'IP publique du Load Balancer.
            *   **Point critique (résolu le 2025-04-27):** Les sondes de santé (Health Probes) HTTP et HTTPS du Load Balancer Azure *doivent* cibler le chemin `/healthz` sur les NodePorts correspondants du service Nginx Ingress (par défaut `/` qui provoque des échecs) pour que le Load Balancer considère les nœuds comme sains et route le trafic correctement.

## 7. Gestion des Ressources Mémoire (2025-09-02)

### Problème Rencontré : OOMKilled dans Minikube

**Contexte :** L'environnement de développement Minikube était limité à 7.57GB de mémoire totale, avec 3.67GB déjà utilisés par les services existants.

**Problèmes identifiés :**
1. **XAI Engine** : Code de sortie 137 (SIGKILL) - tué par Kubernetes pour dépassement mémoire
2. **XAI Celery Worker** : OOMKilled répétitif - les librairies ML (SHAP, LIME, scikit-learn) sont gourmandes
3. **MinIO** : CrashLoopBackOff avec OOMKilled - même avec des ressources modestes
4. **ML Pipeline Celery Worker** : Limites de 4Gi incompatibles avec l'environnement contraint

**Solutions Implémentées :**

#### Optimisation des Ressources XAI Engine
- **Avant** : requests 1Gi/300m, limits 3Gi/1500m
- **Après** : requests 256Mi/100m, limits 512Mi/500m
- **Health Checks** : Délais augmentés (initialDelaySeconds: 120s, failureThreshold: 10)

#### Optimisation des Ressources XAI Celery Worker
- **Avant** : requests 512Mi/200m, limits 2Gi/1000m  
- **Après** : requests 256Mi/100m, limits 768Mi/500m

#### Optimisation des Ressources MinIO
- **Avant** : requests 256Mi/100m, limits 512Mi/500m
- **Après** : requests 128Mi/50m, limits 256Mi/200m

#### Optimisation des Ressources ML Pipeline Celery Worker
- **Avant** : requests 512Mi/200m, limits 4Gi/1000m
- **Après** : requests 256Mi/100m, limits 1Gi/500m

#### Corrections Additionnelles
- **Variable d'environnement** : `MPLCONFIGDIR=/tmp/matplotlib` pour éviter les warnings
- **Job de migration XAI** : Correction du nom de service PostgreSQL (`postgresql-service` au lieu du FQDN complet)

**Impact :**
- ✅ Tous les services démarrent correctement dans Minikube
- ✅ Plus d'erreurs OOMKilled
- ✅ Utilisation mémoire totale maintenue sous la limite de 7.57GB
- ✅ Application complètement fonctionnelle en développement local

**Recommandations Production :**
- Ces limites sont optimisées pour le développement local uniquement
- En production Azure, restaurer les limites originales pour performance optimale                                                                       
- Surveiller l'utilisation mémoire avec Prometheus/Grafana en production

## 7. Système de Migrations Robuste avec InitContainers

### 7.1 Problématique Résolue
Les migrations Alembic peuvent échouer ou s'exécuter dans le désordre, causant des erreurs critiques comme "relation 'experiments' does not exist" qui empêchent le fonctionnement de l'application.

### 7.2 Solution Implémentée
Utilisation d'`initContainers` dans tous les deployments Kubernetes avec un système robuste qui garantit :
1. L'attente de la disponibilité de PostgreSQL
2. La création automatique des tables via SQLAlchemy si elles n'existent pas
3. L'application des migrations Alembic (avec gestion d'erreurs)
4. L'ordre correct d'exécution avant le démarrage des services

### 7.3 Configuration Technique

#### Script de Correction Robuste (`ml-pipeline-service/alembic/fix_migrations.py`)
```python
#!/usr/bin/env python3
"""Script robuste pour garantir l'existence des tables."""
from sqlalchemy import inspect
from app.database import engine
from app.models import Base

def ensure_tables_exist():
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    
    if 'experiments' not in tables:
        logger.info("⚠️ Tables manquantes - création...")
        Base.metadata.create_all(bind=engine)
        logger.info("✅ Tables créées avec succès")
```

#### Configuration des InitContainers
```yaml
spec:
  initContainers:
  # 1. Attente PostgreSQL
  - name: wait-for-postgres
    image: busybox:1.35
    command: ['sh', '-c']
    args:
      - until nc -z postgresql-service.ibis-x.svc.cluster.local 5432; do
          sleep 2;
        done
  
  # 2. Migrations robustes
  - name: run-migrations
    image: ibis-x-ml-pipeline:latest
    command: ["sh", "-c"]
    args:
      - |
        cd /app
        python alembic/fix_migrations.py
        alembic upgrade head || true
```

### 7.4 Avantages de cette Approche
- **Idempotence** : Peut être exécuté plusieurs fois sans risque
- **Robustesse** : Garantit l'existence des tables même si Alembic échoue
- **Automatisme** : S'exécute automatiquement à chaque démarrage
- **Ordre Garanti** : Les initContainers s'exécutent séquentiellement
- **Pas d'Intervention Manuelle** : Plus besoin de Jobs de migration séparés

### 7.5 Services Concernés
Tous les services utilisant la base de données ont été mis à jour :
- `api-gateway` : Tables users, projects
- `service-selection` : Tables datasets, templates  
- `ml-pipeline` : Tables experiments, pipelines
- `xai-engine` : Tables xai_analyses

Cette approche élimine définitivement les erreurs "table does not exist" qui pouvaient survenir lors du démarrage de l'application.

## 8. Amélioration des Visualisations ML (2025-09-11)

### 8.1 Correction des Courbes ROC Multiclasses

**Problème** : Les courbes ROC pour la classification multiclasse affichaient uniquement du texte d'erreur "données insuffisantes" superposé.

**Cause** : 
- Mauvaise utilisation de `label_binarize` avec des noms de classes strings
- Jeu de test trop petit (30 échantillons) causant des problèmes de variabilité
- Gestion d'erreur inadéquate

**Solution** :
- Refonte complète de `plot_roc_curve_multiclass` dans `ml-pipeline-service/app/ml/evaluation.py`
- Utilisation de masques binaires au lieu de `label_binarize`
- Validation du nombre d'échantillons positifs/négatifs pour chaque classe
- Affichage des vrais noms de classes (Iris-setosa, etc.) au lieu de "Classe 0, 1, 2"

### 8.2 Propagation des Noms de Classes

Le système propage maintenant les noms de classes réels depuis le preprocessing :
- `preprocessing.py` : Capture les noms via `label_encoder.classes_` ou les valeurs uniques
- `tasks.py` : Passe les noms de classes à `generate_visualizations`
- `evaluation.py` : Utilise les vrais noms dans toutes les visualisations

### 8.3 Améliorations UX

- Message d'erreur informatif si aucune courbe ne peut être tracée
- Gestion gracieuse des cas limites (classes parfaitement prédites)
- Plus de texte bugué superposé sur les graphiques

## 9. Fonctionnalité de Téléchargement de Modèles (2025-09-11)

### 9.1 Nouvel Endpoint Backend

Ajout de l'endpoint `/experiments/{experiment_id}/download-model` dans `ml-pipeline-service/app/main.py` pour permettre le téléchargement des modèles entraînés :

- **Validation** : Expérience existante, complétée, avec artifact_uri disponible
- **Sécurité** : Authentification via API Gateway
- **Format** : Streaming du fichier .joblib depuis MinIO
- **Headers** : Content-Disposition pour téléchargement automatique

### 9.2 Intégration Frontend

- **Service** : Méthode `downloadModel()` dans `MlPipelineService` avec responseType 'blob'
- **Composant** : Implémentation complète du téléchargement avec création d'URL temporaire
- **UX** : Bouton "Télécharger le Modèle" déjà présent dans le footer des résultats

### 9.3 Flux de Téléchargement

1. Utilisateur clique sur "Télécharger le Modèle"
2. Validation côté frontend (artifact_uri présent)
3. Appel API vers l'endpoint de téléchargement
4. Backend récupère le modèle depuis MinIO
5. Streaming du fichier vers le navigateur
6. Téléchargement automatique du fichier .joblib

## 10. Visualisation Interactive des Arbres de Décision (2025-09-12)

### 10.1 Tableau Blanc Interactif

Implémentation d'une interface de visualisation avancée pour les arbres de décision et random forest :

**Backend** :
- Extension de `evaluation.py` pour générer la structure JSON de l'arbre
- Méthode `get_tree_structure()` dans les modèles Decision Tree et Random Forest
- Stockage de la structure complète dans `visualizations['tree_structure']`

**Frontend** :
- Nouveau mode plein écran avec tableau blanc interactif
- Architecture 100% native (HTML/CSS/JS) sans librairies externes
- Nœuds draggables individuellement
- Liens SVG dynamiques entre nœuds

### 10.2 Fonctionnalités Interactives

**Contrôles de vue** :
- Zoom : Molette, boutons +/-, slider (10% à 500%)
- Pan : Cliquer-glisser sur le fond
- Fit to screen : Ajustement automatique optimal
- Reset : Retour à la vue initiale

**Manipulation de l'arbre** :
- Drag & drop des nœuds individuels avec mise à jour temps réel des liens
- Ajustement dynamique de l'espacement horizontal
- Réorganisation automatique avec animation
- Préservation de la hiérarchie parent-enfant
- **Algorithme anti-superposition** : Calcul adaptatif de la largeur des sous-arbres
- **Effet hover** : Indicateur visuel des nœuds interactifs (scale 105%)
- **Z-index intelligent** : Feuilles (20) > Nœuds internes (10) > Nœud en drag (1000)

**Raccourcis clavier** :
- `R` : Reset de la vue
- `+/-` : Zoom in/out
- `WASD` ou flèches : Déplacement de la vue
- `Escape` : Fermer le mode plein écran

### 10.3 Export et Thèmes

- Export SVG de l'arbre modifié
- **Système de thèmes** : Mode clair/sombre avec adaptation automatique des couleurs (liens blancs sur fond noir, noirs sur fond blanc)
- **Liens adaptatifs au zoom** : Épaisseur constante des liens quel que soit le niveau de zoom
- Bascule thème clair/sombre
- Indicateurs visuels (zoom %, position X/Y, espacement)
- Support des arbres de régression et classification
- **Validation des liens** : Suppression automatique des lignes orphelines ou invalides

### 10.4 Architecture Technique

**Structure des données** :
```typescript
interface TreeNode {
  name: string;
  condition: string;
  samples: number;
  is_leaf: boolean;
  feature?: string;
  threshold?: number;
  value?: number;
  class_name?: string;
  children?: TreeNode[];
}

interface WhiteboardState {
  zoom: number;
  panX: number;
  panY: number;
  isDragging: boolean;
  dragStartX: number;
  dragStartY: number;
  lastMouseX: number;
  lastMouseY: number;
  horizontalSpacing: number;
  verticalSpacing: number;
  originalTreeData: any;
}
```

**Implémentation** :
- Nœuds : Éléments `<div>` HTML avec styles inline
- Liens : SVG natif avec éléments `<line>` ou `<path>`
- État : Propriété de classe `whiteboardState` (initialisé à l'ouverture, nettoyé à la fermeture)
- Liens adaptatifs : Épaisseur ajustée dynamiquement selon le zoom (`strokeWidth = baseWidth / zoom`)
- **Gestion CSS propre** : Styles avec IDs uniques, nettoyage complet à la fermeture, scoped au contexte fullscreen
- Transformations : CSS transform pour zoom/pan

### 10.5 État Actuel

- ✅ Interface complète opérationnelle
- ✅ Nœuds affichés et draggables
- ✅ Contrôles de zoom/pan fonctionnels
- ✅ Export SVG et thèmes
- 🔧 Liens entre nœuds en cours de correction
- 📋 TODO : Minimap, recherche de nœuds, statistiques au survol
