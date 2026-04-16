# Glossaire IBIS-X

Vocabulaire du domaine et acronymes techniques. Référence pour toute nouvelle page de documentation : **définir un terme ici plutôt qu'en ligne dans plusieurs pages**.

---

## Acronymes

| Sigle | Signification | Contexte |
|---|---|---|
| **IBIS-X** | Nom du projet (plateforme) | — |
| **XAI** | eXplainable Artificial Intelligence | Cœur fonctionnel du projet |
| **ML** | Machine Learning | Pipeline d'entraînement |
| **PoC** | Proof of Concept | Statut du projet |
| **MIAGE** | Méthodes Informatiques Appliquées à la Gestion des Entreprises | Master 2, cadre académique |
| **SHAP** | SHapley Additive exPlanations | Technique XAI — importance des features |
| **LIME** | Local Interpretable Model-agnostic Explanations | Technique XAI — explication locale |
| **LLM** | Large Language Model | Utilisé pour explications narratives (OpenAI) |
| **JWT** | JSON Web Token | Authentification api-gateway |
| **OAuth** | Open Authorization | Connexion Google |
| **ORM** | Object-Relational Mapping | SQLAlchemy |
| **ERD** | Entity-Relationship Diagram | Modèle de données |
| **ADR** | Architecture Decision Record | Traçabilité des choix techniques |
| **MADR** | Markdown Architectural Decision Records | Format d'ADR utilisé |
| **RGPD** | Règlement Général sur la Protection des Données | Conformité UE |
| **GDPR** | General Data Protection Regulation | Équivalent anglais du RGPD |
| **AKS** | Azure Kubernetes Service | Hébergement prod |
| **K8s** | Kubernetes | Orchestrateur |
| **IaC** | Infrastructure as Code | Terraform |
| **CI/CD** | Continuous Integration / Continuous Deployment | GitHub Actions |
| **STRIDE** | Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege | Modèle de menaces |
| **OWASP** | Open Web Application Security Project | Top 10 risques sécurité web |
| **C4** | Context, Containers, Components, Code | Modèle de diagrammes d'architecture |
| **SLO / SLA** | Service Level Objective / Agreement | Objectifs de service |

---

## Concepts domaine

### Dataset
Jeu de données tabulaire importé dans la plateforme (CSV, Parquet, JSON). Peut être **multi-fichiers** (train/test/validation). Stocké dans MinIO/Azure Blob, référencé en BDD avec `storage_path`, `dataset_files`, `file_columns`.

### Experiment (Expérience)
Exécution d'un pipeline ML sur un dataset, avec une configuration précise (algorithme, hyperparamètres, split). Produit un **Artifact** (modèle entraîné) identifié par `artifact_uri`.

### Artifact
Modèle ML sérialisé (pickle / joblib) persisté dans le stockage objets. Référencé par `artifact_uri` dans la table des expériences. **Remplace l'ancienne dénomination `model_uri`.**

### Explanation Request (Demande d'explication)
Tâche asynchrone Celery (queue `xai_queue`) qui applique une technique XAI (SHAP, LIME, LLM) sur un artefact pour une instance ou un ensemble d'instances.

### Chat (Session de questions)
Conversation utilisateur ↔ LLM autour d'une explication. **Limite : 5 questions par session** pour maîtriser les coûts OpenAI.

### Score (éthique / technique / métier)
Évaluation d'un dataset selon 3 dimensions utilisées pour le filtrage : qualité technique, respect éthique, pertinence métier.

### Manifest (de dataset)
Fichier descriptif (JSON/YAML) accompagnant un import pour décrire structure, colonnes, métadonnées éthiques. Voir `datasets/kaggle-import/TEMPLATES_GUIDE.md`.

### Métadonnées enrichies
Informations au-delà du schéma brut : domaine, sensibilité, biais connus, licences. Produites par analyse IA (`analyze_dataset_with_ai` sur `ai_queue`).

---

## Concepts techniques projet

### `ibis_x_db`
Unique base PostgreSQL partagée par les 4 services. Isolation des migrations via `version_table` Alembic dédiée par service.

### `version_table` Alembic
Mécanisme permettant à plusieurs services de coexister sur la même base : chaque service a sa propre table de suivi des migrations (`alembic_version_gateway`, `alembic_version_selection`, `alembic_version_ml_pipeline`, `alembic_version_xai`).

### Queue Celery
File de tâches asynchrones Redis. Trois queues actives dans IBIS-X : `ml_queue`, `ai_queue`, `xai_queue`. **Il n'existe pas de `llm_queue`.**

### Port-forward Skaffold
Redirection locale depuis un port conteneur K8s vers un port hôte. `make dev` expose `8080` (frontend) et `9000` (api-gateway). **Ne pas confondre** avec les ports internes (8088, 8081, 8082, 8083).

### Overlay Kustomize
Surcouche de configuration pour un environnement donné (`minikube`, `azure`) au-dessus d'un `base/` commun.

### DataQualityAnalysis (cache)
Table persistant les résultats d'analyse IA d'un dataset pour éviter de ré-appeler OpenAI à chaque affichage.

---

## Rôles utilisateur

| Rôle | Champ BDD | Description |
|---|---|---|
| **Utilisateur standard** | `role = 'user'` | Crée projets, lance pipelines, consulte explications |
| **Contributeur** | `role = 'contributor'` | + upload datasets |
| **Admin** | `is_superuser = true` (propriété calculée à partir de `role = 'admin'`) | Accès administration complet |

---

## Environnements

| Nom | Cible | Manifests |
|---|---|---|
| **local** | Minikube (dev machine) | `k8s/overlays/minikube/` |
| **prod** | AKS Azure | `k8s/overlays/azure/` + `terraform/` |

---

> Ce glossaire est reflété dans la documentation publique : [`docs/modules/ROOT/pages/01-projet/glossaire.adoc`](../docs/modules/ROOT/pages/01-projet/glossaire.adoc).
