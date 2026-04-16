# Guide de contribution — IBIS-X

Merci de contribuer ! Ce document décrit le workflow attendu pour toute modification de code ou de documentation.

> Pour les conventions techniques détaillées (backend FastAPI, frontend Angular, Kubernetes), voir [`CLAUDE.md`](./CLAUDE.md) et [`memory-bank/conventions.md`](./memory-bank/conventions.md).

---

## 1. Avant de commencer

1. Lire [`README.md`](./README.md) et exécuter `make dev` avec succès en local.
2. Lire [`CLAUDE.md`](./CLAUDE.md) — conventions impératives du projet.
3. Lire [`memory-bank/architecture.md`](./memory-bank/architecture.md) — vision d'ensemble.
4. Sur Windows : lire [`memory-bank/windows-gotchas.md`](./memory-bank/windows-gotchas.md).

---

## 2. Git flow

- **Branche principale** : `main` (toujours déployable).
- **Branches de travail** : `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, `refactor/<slug>`, `chore/<slug>`.
- **Pas de commits directs sur `main`** — toujours via pull request.
- **Rebase plutôt que merge** pour garder un historique linéaire lorsque possible.

```bash
git checkout -b feat/xai-shap-cache
# ... travail ...
git fetch origin && git rebase origin/main
git push -u origin feat/xai-shap-cache
```

---

## 3. Conventions de commit (Conventional Commits)

Format : `type(scope): description courte`

**Types acceptés** : `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`, `i18n`, `style`.

**Scope** : service ou domaine concerné (`api-gateway`, `ml-pipeline`, `xai-engine`, `frontend`, `k8s`, `docs`, etc.).

**Exemples** :

```
feat(ml-pipeline): add LightGBM algorithm option
fix(xai-engine): prevent SHAP crash on single-class datasets
docs(audit): add RGPD compliance checklist
i18n(frontend): translate ML pipeline hero section
```

**Référencer un finding d'audit** : `fix(ml-pipeline): FINDING-014 — remove DEBUG banner`.

---

## 4. Processus de Pull Request

1. **Une PR = un objectif.** Séparer refactor, feature et fix en PRs distinctes.
2. **Titre** : même format que les commits (Conventional Commits).
3. **Description** : décrire le *pourquoi*, pas le *quoi* (le diff montre le quoi).
4. **Checklist à cocher** :
   - [ ] Code backend : type hints, Pydantic schemas, `crud.py` respecté.
   - [ ] Code frontend : i18n FR+EN à jour, Angular Material, pas de Tailwind.
   - [ ] Migrations Alembic générées si modification de `models.py`.
   - [ ] Documentation Antora mise à jour (page dans le pilier concerné).
   - [ ] `CHANGELOG.md` mis à jour sous `[Unreleased]`.
   - [ ] Tests ajoutés ou mis à jour.
   - [ ] `make dev` local vérifié.
5. **Revue** : au moins 1 approbation avant merge.

---

## 5. Règle « Doc = Code »

**Aucune feature n'est complète sans sa documentation.** Toute PR qui ajoute ou modifie :

- un endpoint API → met à jour `03-technique/api-reference.adoc` ;
- un composant frontend significatif → met à jour `03-technique/frontend/composants-cles.adoc` ;
- un flux inter-services → met à jour `03-technique/architecture/flux-communication.adoc` ;
- un schéma BDD → met à jour `03-technique/base-de-donnees.adoc` et déclenche un diagramme ERD ;
- une décision architecturale → ajoute un ADR dans `05-audit/adr/`.

Voir [`06-contribution/conventions-doc.adoc`](./docs/modules/ROOT/pages/06-contribution/conventions-doc.adoc) pour le style Asciidoc.

---

## 6. Tests

- **Backend** : `pytest` dans chaque service. Coverage cible ≥ 60 % pour le PoC.
- **Frontend** : `ng test` (unitaires) + `ng e2e` si applicable.
- **Intégration** : vérifier via `make dev` que les services communiquent correctement.

---

## 7. Ajout d'un nouveau service / feature majeure

1. Rédiger un ADR dans `docs/modules/ROOT/pages/05-audit/adr/` (format MADR — voir `template-adr.adoc`).
2. Mettre à jour `memory-bank/architecture.md` et `skaffold.yaml`.
3. Créer les manifests Kustomize dans `k8s/base/` + overlays.
4. Créer la page dédiée dans `03-technique/services/`.

Détails dans [`06-contribution/ajout-service.adoc`](./docs/modules/ROOT/pages/06-contribution/ajout-service.adoc).

---

## 8. Signaler un bug ou une vulnérabilité

- **Bug fonctionnel** : ouvrir une issue GitHub avec reproduction, environnement, logs.
- **Vulnérabilité de sécurité** : ne pas ouvrir d'issue publique — voir [`SECURITY.md`](./SECURITY.md).

---

## 9. Licence

En contribuant, vous acceptez que votre contribution soit publiée sous la licence du projet (voir [`LICENSE`](./LICENSE)).
