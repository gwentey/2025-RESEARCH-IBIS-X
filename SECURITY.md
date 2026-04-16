# Politique de sécurité — IBIS-X

## Statut du projet

IBIS-X est un **Proof of Concept académique** (Master 2 MIAGE). Il n'est pas destiné à un usage en production sur des données sensibles réelles. Malgré tout, nous prenons les vulnérabilités au sérieux.

## Signaler une vulnérabilité

**Ne créez pas d'issue GitHub publique.** Les rapports de vulnérabilité doivent être envoyés de manière privée.

- **Canal privilégié** : ouvrir un [GitHub Security Advisory privé](https://github.com/gwentey/2025-research-exai/security/advisories/new).
- **Canal alternatif** : contacter directement le mainteneur via le dépôt (profil GitHub).

### Informations à inclure

1. **Description** : nature de la vulnérabilité, composant affecté (api-gateway, ml-pipeline, frontend, infra K8s…).
2. **Reproduction** : étapes minimales, payload, version/commit concerné.
3. **Impact** : confidentialité, intégrité, disponibilité — scénarios d'exploitation.
4. **Mitigation proposée** (optionnel).

## Délais de traitement (indicatifs)

| Étape | Délai cible |
|---|---|
| Accusé de réception | 72 h |
| Évaluation initiale + criticité | 7 jours |
| Correctif (critique / haute) | 30 jours |
| Correctif (moyenne / basse) | best-effort |

## Périmètre couvert

- Code applicatif des 4 services backend et du frontend.
- Manifests Kubernetes (`k8s/`), Terraform (`terraform/`), GitHub Actions.
- Dépendances directes (`requirements.txt`, `package.json`).

## Hors périmètre

- Vulnérabilités dans les dépendances tierces déjà divulguées publiquement (ouvrir une issue classique pour upgrade).
- Attaques nécessitant un accès physique ou des privilèges root sur l'hôte.
- Spam, social engineering, phishing.

## Pratiques en place

Voir [`docs/modules/ROOT/pages/05-audit/securite/`](./docs/modules/ROOT/pages/05-audit/securite/) :

- Authentification JWT + OAuth Google (api-gateway).
- Secrets via Kubernetes Secrets (jamais dans le code — voir `CLAUDE.md`).
- HTTPS en production (Ingress Azure + cert-manager).
- Isolation namespace K8s `ibis-x`.
- Conteneurs non-root, images slim multi-stage.

## Remerciements

Les rapporteurs de vulnérabilités valides seront crédités (avec leur accord) dans `CHANGELOG.md`.
