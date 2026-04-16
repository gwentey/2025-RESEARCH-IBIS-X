# Pièges Windows + Docker Desktop — Setup `make dev`

Ce document recense les problèmes réellement rencontrés lors d'un premier `make dev` sur Windows 11 avec Docker Desktop. Il complète le guide quickstart et le `README.md` racine — consulte-le AVANT de lancer l'installation pour éviter de perdre du temps.

Chaque piège est décrit avec son symptôme, sa cause racine (vérifiée dans le code) et son fix. Les commandes `export` supposent Git Bash (le seul shell supporté pour `make dev` sur Windows — PowerShell n'est pas recommandé).

---

## Piège 1 — Images buildées en `linux/arm64` sur un hôte x86_64

**Symptôme**
- Les pods `service-selection`, `ml-pipeline`, `xai-engine`, leurs workers Celery restent bloqués `0/1 Running` avec 5-20 restarts en quelques minutes.
- `kubectl describe pod <pod>` montre : `Liveness probe failed: connection refused` sur le port applicatif.
- Les logs applicatifs (`kubectl logs <pod>`) sont **vides** (uvicorn n'a jamais eu le temps de loguer).
- `api-gateway` et `frontend` peuvent rester Running malgré l'émulation (démarrage plus simple).

**Cause racine**
- `Makefile` définit `ARCH ?= arm64` (ligne ~8). 
- `skaffold.yaml` définit `platforms: ["linux/arm64"]` (ligne ~15).
- Sur un hôte Windows x86_64, les images arm64 s'exécutent via **QEMU user-mode** (`/usr/bin/qemu-aarch64`), ce qui est 10-50× plus lent. Uvicorn ne finit pas son boot avant l'échéance de la liveness probe → Kubernetes tue le conteneur → restart boucle.

**Diagnostic**
```bash
POD=$(kubectl get pods -n ibis-x -l app=service-selection -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n ibis-x $POD -c service-selection -- sh -c 'cat /proc/1/cmdline | tr "\0" " "; echo'
# Si la sortie contient `/usr/bin/qemu-aarch64` → confirmé.
```

**Fix (temporaire, par session)**
```bash
export DOCKER_DEFAULT_PLATFORM=linux/amd64
# Purger les images arm64 déjà buildées côté minikube :
minikube ssh -- "docker rmi -f service-selection:latest ibis-x-ml-pipeline:latest ibis-x-xai-engine:latest ibis-x-xai-engine-worker:latest ibis-x-api-gateway:latest frontend:latest"
make dev
```

**Fix (permanent, à faire dans le repo)**
- Soit override `ARCH=amd64` via variable d'environnement de CI/poste.
- Soit adapter `skaffold.yaml` pour détecter l'hôte (`platforms: ["linux/{{.ARCH}}"]`).
- Ticket ouvert à ce sujet : voir `memory-bank/windows-gotchas.md` dans les prochaines releases.

---

## Piège 2 — `update-local-secrets.py` crashe avec `UnicodeEncodeError`

**Symptôme**
```
UnicodeEncodeError: 'charmap' codec can't encode character '\u2705' in position 0: character maps to <undefined>
make: *** [Makefile:126: update-secrets] Error 1
```

**Cause racine**
- `scripts/development/update-local-secrets.py` imprime des emojis (`✅`, `❌`) aux lignes 31, 34, 51 (et `reset-placeholders.py` aux lignes 44, 46, 50).
- Python 3 sur Windows utilise par défaut l'encodage **cp1252** pour `sys.stdout`, qui ne peut pas encoder les emojis.

**Fix (temporaire)**
```bash
export PYTHONIOENCODING=utf-8
export PYTHONUTF8=1
make dev
```

**Fix (permanent, à faire dans le repo)**
Ajouter en tête de chaque script concerné :
```python
import sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
```

---

## Piège 3 — `make dev` deadlock silencieux après les builds Docker

**Symptôme**
- Skaffold a terminé les 6 builds (`Build [...] succeeded` visible dans le log).
- `kubectl get pods -n ibis-x` retourne `No resources found`.
- Aucun log nouveau depuis 15+ minutes.
- Les processus `make.exe` et `skaffold.exe` sont toujours vivants (`ps -W | grep -iE 'make|skaffold'`).

**Cause probable**
- Le pipe `tee` utilisé par Make dans `dev` bufferise la sortie de Skaffold côté Windows (pas de flush automatique).
- Le deadlock se produit entre la fin de la phase build et le début de la phase deploy.

**Workaround**
```bash
# 1. Tuer les processus bloqués
taskkill //IM make.exe //F
taskkill //IM skaffold.exe //F

# 2. Lancer manuellement ce qui reste (Minikube et secrets déjà faits)
eval $(minikube -p minikube docker-env --shell bash)
export DOCKER_DEFAULT_PLATFORM=linux/amd64
skaffold run --profile=local --namespace=ibis-x
```

`skaffold run` (sans `dev`) ne watch pas les fichiers mais déploie en une passe puis rend la main — idéal pour sortir du deadlock.

---

## Piège 4 — `.env` incomplet → crash silencieux du script secrets

**Symptôme**
- `make dev` s'arrête tôt : `update-secrets` échoue.
- Sur Windows cp1252 le message d'erreur ne s'affiche pas (voir Piège 2), donc la raison réelle n'est pas visible.

**Cause racine**
`scripts/development/update-local-secrets.py` exige **8 variables obligatoires** dans `.env`, sinon `sys.exit(1)` :

| Variable | Utilisée par |
|---|---|
| `JWT_SECRET_KEY` | api-gateway auth |
| `DATABASE_URL` | tous les services backend |
| `GOOGLE_CLIENT_ID` | OAuth api-gateway |
| `GOOGLE_CLIENT_SECRET` | OAuth api-gateway |
| `OAUTH_REDIRECT_URL` (ou `LOCAL_REDIRECT_URL`) | OAuth api-gateway |
| `KAGGLE_USERNAME` | service-selection import Kaggle |
| `KAGGLE_KEY` | service-selection import Kaggle |
| `OPENAI_API_KEY` | xai-engine chatbot / ml-pipeline analyse IA |

**Fix**
```bash
cp .env.example .env
# Remplir au minimum JWT_SECRET_KEY, DATABASE_URL (voir .env.example corrigé).
# Pour OPENAI_API_KEY : un placeholder `sk-proj-PLACEHOLDER_REPLACE_ME` suffit si XAI LLM/chat non testé.
# Pour KAGGLE_* : laisser vide si pas d'import Kaggle ; le script echoue sur empty string, mettre un placeholder.
```

---

## Piège 5 — Profil Minikube orphelin après reset Docker Desktop

**Symptôme**
```
❌  Fermeture en raison de MK_ADDON_ENABLE_PAUSED : enabled failed: get state: unknown state "minikube": 
docker container inspect minikube --format=<no value>: exit status 1
Error response from daemon: No such container: minikube
```

**Cause racine**
Docker Desktop a été réinstallé ou ses données volume purgées. Le profil Minikube référence toujours un container qui n'existe plus. `minikube start` tente d'activer les addons sur le container fantôme avant de le recréer.

**Fix**
```bash
minikube delete --all --purge
make dev
```

---

## Diagnostic rapide — commandes à connaître

```bash
# État des pods
kubectl get pods -n ibis-x

# Cause d'un pod qui redémarre
kubectl describe pod -n ibis-x <pod-name> | tail -50

# Processus PID 1 dans un conteneur (vérifier qemu)
kubectl exec -n ibis-x <pod-name> -- sh -c 'cat /proc/1/cmdline | tr "\0" " "'

# Images réellement présentes dans minikube
minikube ssh -- "docker images | grep -E 'ibis-x|frontend|service-selection'"

# Logs d'un conteneur spécifique (main container par défaut, init containers via -c)
kubectl logs -n ibis-x <pod-name> -c <container-name> --tail=100
```

---

## Référencé par

- `CLAUDE.md` — section "Pièges Windows" (résumé).
- `README.md` — quickstart Windows.
- `memory-bank/architecture.md` — section infrastructure.
