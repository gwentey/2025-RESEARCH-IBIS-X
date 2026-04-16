# Frontend IBIS-X

Frontend web de la plateforme IBIS-X (PoC XAI — Master 2 MIAGE).

## Stack

- **Angular 19** — standalone components, lazy loading intensif
- **Angular Material 19** — tous les composants UI
- **ngx-translate 14** — i18n obligatoire **FR / EN** (`src/assets/i18n/fr.json`, `en.json`)
- **ECharts 5.6** — visualisations ML (matrices confusion, ROC, feature importance)
- **WebSHAP** — exécution SHAP côté client pour XAI
- **angular-tabler-icons 2.7** — iconographie
- **ngx-scrollbar 11** — scrollbars personnalisées
- SCSS uniquement (pas de Tailwind)

Environnements : `src/environments/environment.ts` (dev → `http://localhost:9000`) et `environment.prod.ts`.

## Fonctionnalités (zones de routes `/app/*`)

- **Authentification** : login, register, OAuth callback (`/authentication/*`)
- **Onboarding wizard** (`/onboarding/*`)
- **Datasets** : listing avec filtres modernes, upload wizard + metadata, détail, scoring, analyse qualité (`/app/datasets/*`)
- **Projets** : CRUD, recommandation heatmap, intégration ML pipeline par projet (`/app/projects/*`)
- **ML Pipeline** : wizard 5 étapes, experiments, cleaning, studio, résultats (`/app/ml-pipeline/*` et `/ml-pipeline-wizard` fullscreen)
- **XAI** : explications SHAP/LIME, chat interface (max 5 questions), tree visualization (`/app/xai-explanation`)
- **Admin** : user-management, dataset-management, ethical-templates (`/app/admin/*`)
- **Analytics** : dashboard (`/app/analytics`)
- **Profil** : profil utilisateur, crédits (`/app/profile/*`)

Guards : `authGuard`, `onboardingGuard`. Intercepteurs HTTP pour JWT.

## Développement

Le frontend se lance via le pipeline global du projet :

```bash
make dev          # installation + minikube + skaffold + port-forwards
# ou, en isolé (nécessite Node 20+) :
cd frontend
npm install
npm start         # ng serve sur http://localhost:4200 (pointe vers API localhost:9000)
```

Après `make dev` : Frontend sur <http://localhost:8080>, API sur <http://localhost:9000/docs>.

## Conventions (rappel)

- Angular Material obligatoire pour tout composant UI
- Reactive Forms uniquement (`FormBuilder`/`FormGroup`/`Validators`)
- Pattern Smart/Dumb
- Services HTTP dédiés retournant des `Observable<T>`, base URL via environment
- Lazy loading des features
- i18n FR + EN obligatoire pour toute chaîne affichée
- Voir `.cursor/templates/src/app/` avant de créer un composant (cohérence visuelle)
