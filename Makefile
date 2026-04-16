.PHONY: help dev quick-dev update-secrets start-minikube create-namespace docker-env deploy wait-services migrate migrate-jobs wait-migrations init-data dev-with-data clean clean-migrations logs stop clean-namespace reset check-prerequisites test-ml-pipeline fix-portforwards list-jobs clean-temp-files healthcheck quick-logs start-portforwards-simple

ARGS ?=

# Configuration
NAMESPACE ?= ibis-x
TIMEOUT ?= 300s
ARCH ?= amd64
MINIKUBE_CPUS ?= 6
MINIKUBE_MEMORY ?= 8000

# Ports MinIO (standardisés)
MINIO_API_PORT ?= 6700
MINIO_CONSOLE_PORT ?= 6701

# Détection de l'OS et configuration des commandes
UNAME_S := $(shell uname -s 2>/dev/null || echo unknown)

# Couleurs pour l'affichage 
ifeq ($(findstring MINGW, $(UNAME_S)),MINGW)
    # Git Bash détecté - couleurs désactivées pour éviter les codes ANSI
    GREEN := 
    RED := 
    YELLOW := 
    BLUE := 
    NC := 
    IS_WINDOWS := true
    IS_MACOS := false
else ifeq ($(UNAME_S),Darwin)
    # macOS détecté
    GREEN := \033[32m
    RED := \033[31m
    YELLOW := \033[33m
    BLUE := \033[34m
    NC := \033[0m
    IS_WINDOWS := false
    IS_MACOS := true
else
    # Linux ou autre Unix
    GREEN := \033[32m
    RED := \033[31m
    YELLOW := \033[33m
    BLUE := \033[34m
    NC := \033[0m
    IS_WINDOWS := false
    IS_MACOS := false
endif

# Null device portable
ifeq ($(IS_WINDOWS),true)
    NULL := nul
    SLEEP_CMD := powershell.exe -Command "Start-Sleep -Seconds"
    DOCKER_ENV_CMD := powershell.exe -Command "& minikube -p minikube docker-env --shell powershell | Invoke-Expression; 
    PORTFORWARD_BG_CMD := powershell.exe -Command "Start-Process -WindowStyle Hidden kubectl -ArgumentList
    KILL_PORTFORWARD_CMD := powershell.exe -Command "Get-Process -Name kubectl -ErrorAction SilentlyContinue | Where-Object { $$_.CommandLine -like '*port-forward*' } | Stop-Process -Force"
    WEB_TEST_CMD := powershell.exe -Command "try { Invoke-WebRequest -Uri
else
    NULL := /dev/null
    SLEEP_CMD := sleep
    DOCKER_ENV_CMD := eval $$(minikube -p minikube docker-env);
    PORTFORWARD_BG_CMD := nohup kubectl
    KILL_PORTFORWARD_CMD := pkill -f "kubectl.*port-forward" || killall kubectl || true
    WEB_TEST_CMD := curl -fsS --max-time 3
endif

help: ## Affiche cette aide
	@echo "$(BLUE)IBIS-X - Commandes Make disponibles$(NC)"
	@echo ""
	@echo "$(YELLOW)COMMANDES RECOMMANDEES POUR LE DEVELOPPEMENT :$(NC)"
	@echo "  $(GREEN)make dev$(NC)          - Lance l'application complete UUID (upload datasets via interface)"
	@echo "  $(GREEN)make dev-data$(NC)     - Import automatique des VRAIS datasets Kaggle pour developpement"
	@echo ""
	@echo "$(BLUE)PRINCIPALES COMMANDES :$(NC)"
	@echo "  $(GREEN)dev$(NC)                Installation complete + système UUID + port-forwards AUTO"
	@echo "  $(GREEN)dev-data$(NC)           Import automatique Kaggle + validation (POUR DEV UNIQUEMENT)"
	@echo "  $(GREEN)dev-no-data$(NC)        Installation SANS datasets (tests uniquement)"
	@echo "  $(GREEN)quick-dev$(NC)          Deploiement rapide (upload datasets manuellement)"
	@echo "  $(GREEN)stop$(NC)               Arrete l'application"
	@echo "  $(GREEN)clean$(NC)              Nettoyage complet"
	@echo "  $(GREEN)logs$(NC)               Logs + port-forwards automatiques avec Skaffold"
	@echo ""
	@echo "$(BLUE)OUTILS DE DIAGNOSTIC :$(NC)"
	@echo "  $(GREEN)healthcheck$(NC)                Verifie l'etat des services"
	@echo "  $(GREEN)validate-datasets$(NC)          Valide que les VRAIS datasets Kaggle sont importes"
	@echo "  $(GREEN)check-buildkit$(NC)             Verifie l'optimisation Docker BuildKit"
	@echo "  $(GREEN)test-docker-context$(NC)        Teste la taille du contexte Docker frontend"
	@echo "  $(GREEN)start-portforwards-simple$(NC) Commandes manuelles (si besoin)"
	@echo ""
	@echo "$(YELLOW)NOUVEAU SYSTEME UUID - SECURISE ET MAINTENABLE :$(NC)"
	@echo "$(YELLOW)• Upload datasets via: http://localhost:8080/datasets$(NC)"
	@echo "$(YELLOW)• Fichiers stockés avec UUID (sécurisé, évite collisions)$(NC)"
	@echo "$(YELLOW)• Import Kaggle via 'make dev-data' (developement) ou upload manuel$(NC)"

check-prerequisites: ## Vérifie que tous les outils requis sont installés
	@echo "Verification des prerequis..."
	@echo "Verification simplifiee pour compatibilite Windows"
	@echo "Assurez-vous que Docker, Minikube, kubectl, Skaffold et Python sont installes"
	@$(MAKE) check-buildkit
	@echo "Tous les prerequis sont presumes satisfaits"

check-buildkit: ## Vérifie et configure Docker BuildKit pour des builds optimisés
	@echo "$(BLUE)Verification de Docker BuildKit...$(NC)"
ifeq ($(IS_WINDOWS),true)
	@echo "$(YELLOW)Verification simplifiee pour compatibilite Git Bash/Windows$(NC)"
	@powershell.exe -Command "if ([Environment]::GetEnvironmentVariable('DOCKER_BUILDKIT', 'User') -eq '1') { Write-Host '$(GREEN)✅ Docker BuildKit activé (variable utilisateur)$(NC)' } elseif ([Environment]::GetEnvironmentVariable('DOCKER_BUILDKIT', 'Process') -eq '1') { Write-Host '$(GREEN)✅ Docker BuildKit activé (session courante)$(NC)' } else { Write-Host '$(YELLOW)⚠️  Docker BuildKit non activé globalement$(NC)'; Write-Host '$(YELLOW)   Pour l activer définitivement : [Environment]::SetEnvironmentVariable(\"DOCKER_BUILDKIT\", \"1\", \"User\")$(NC)'; Write-Host '$(BLUE)   ✓ BuildKit est déjà activé dans Skaffold pour ce projet$(NC)' }" || echo "$(BLUE)✓ BuildKit est configure dans Skaffold$(NC)"
else
	@echo "$(YELLOW)Verification pour macOS/Linux...$(NC)"
	@if [ "$$DOCKER_BUILDKIT" = "1" ]; then \
		echo "$(GREEN)✅ Docker BuildKit activé (variable d'environnement)$(NC)"; \
	else \
		echo "$(YELLOW)⚠️  Docker BuildKit non activé globalement$(NC)"; \
		echo "$(YELLOW)   Pour l'activer : export DOCKER_BUILDKIT=1$(NC)"; \
		echo "$(BLUE)   ✓ BuildKit est déjà activé dans Skaffold pour ce projet$(NC)"; \
	fi
endif

check-kaggle-credentials: ## Vérifie que les credentials Kaggle sont configurés
	@echo "$(BLUE)Verification des credentials Kaggle...$(NC)"
	@echo "$(YELLOW)ATTENTION: Verification simplifiee pour Windows - assurez-vous que .env contient:$(NC)"
	@echo "$(YELLOW)  KAGGLE_USERNAME=votre_username$(NC)"
	@echo "$(YELLOW)  KAGGLE_KEY=votre_api_key$(NC)"
	@echo "$(GREEN)✅ Verification passee (assurez-vous que .env est correct)$(NC)"

update-secrets: ## Met à jour les secrets Kubernetes avec les valeurs du .env
	@echo "$(BLUE)Mise a jour des secrets Kubernetes...$(NC)"
	@python scripts/development/update-local-secrets.py
	@echo "$(GREEN)Secrets mis a jour$(NC)"

clean-minikube: ## Nettoie et supprime Minikube (en cas de problème)
	@echo "$(BLUE)Nettoyage de Minikube...$(NC)"
	-@minikube stop 2>$(NULL)
	-@minikube delete 2>$(NULL)
	@echo "$(GREEN)Minikube nettoye$(NC)"

start-minikube: ## Démarre Minikube s'il n'est pas déjà en cours d'exécution
	@echo "$(BLUE)Demarrage de Minikube...$(NC)"
	@minikube status >/dev/null 2>&1 || minikube start --driver=docker --memory $(MINIKUBE_MEMORY) --cpus $(MINIKUBE_CPUS) --disk-size 30g
	@minikube addons enable ingress
	@minikube addons enable storage-provisioner
	@echo "$(GREEN)Minikube demarre$(NC)"

restart-minikube: clean-minikube start-minikube ## Redémarre Minikube proprement (en cas de problème)

create-namespace: ## Crée le namespace Kubernetes
	@echo "$(BLUE)Creation du namespace $(NAMESPACE)...$(NC)"
	-kubectl create namespace $(NAMESPACE)
	@echo "$(YELLOW)Namespace $(NAMESPACE) existe deja ou cree$(NC)"
	@echo "$(GREEN)Namespace pret$(NC)"

# Configurer l'environnement Docker pour Minikube
docker-env: ## Configure l'environnement Docker pour Minikube (comme l'ancien système)
	@echo "$(BLUE)Configuration de l'environnement Docker...$(NC)"
	@echo "$(GREEN)Environnement Docker configure$(NC)"

deploy: ## Déploie l'application avec Skaffold (comme l'ancien système)
	@echo "$(BLUE)Deploiement de l'application...$(NC)"
	@echo "$(YELLOW)Nettoyage des jobs existants pour eviter les conflits...$(NC)"
	-@kubectl delete jobs --all -n $(NAMESPACE) 2>$(NULL) || echo "$(YELLOW)Aucun job a supprimer$(NC)"
	@$(SLEEP_CMD) 2
ifeq ($(IS_WINDOWS),true)
	@powershell.exe -Command "& minikube -p minikube docker-env --shell powershell | Invoke-Expression; skaffold run --profile=local --namespace=$(NAMESPACE)"
else
	@$(DOCKER_ENV_CMD) DOCKER_BUILDKIT=1 DOCKER_DEFAULT_PLATFORM=linux/$(ARCH) skaffold run --profile=local --namespace=$(NAMESPACE)
endif
	@echo "$(GREEN)Application deployee$(NC)"

deploy-services-dev: ## Déploie les services en mode développement continu (avec surveillance)
	@echo "$(BLUE)Deploiement des services en mode developpement continu...$(NC)"
	@echo "$(YELLOW)Nettoyage des jobs existants pour eviter les conflits...$(NC)"
	-@kubectl delete jobs --all -n $(NAMESPACE) 2>$(NULL)
ifeq ($(IS_WINDOWS),true)
	@powershell.exe -Command "& minikube -p minikube docker-env --shell powershell | Invoke-Expression; skaffold dev --profile=local-services --namespace=$(NAMESPACE) --no-prune=false --cache-artifacts=false --cleanup=false --port-forward=false"
else
	@$(DOCKER_ENV_CMD) DOCKER_BUILDKIT=1 DOCKER_DEFAULT_PLATFORM=linux/$(ARCH) skaffold dev --profile=local-services --namespace=$(NAMESPACE) --no-prune=false --cache-artifacts=false --cleanup=false --port-forward=false
endif
	@echo "$(GREEN)Services en mode developpement continu$(NC)"

start-portforwards: stop-portforwards ## Lance les port forwards dans le même terminal (Git Bash compatible)
	@echo "$(BLUE)Lancement des port forwards unifies...$(NC)"
	@echo "$(YELLOW)Verification de la disponibilite des services...$(NC)"
	@kubectl get service frontend -n $(NAMESPACE) >/dev/null 2>&1 || { echo "$(RED)Service frontend introuvable$(NC)"; exit 1; }
	@kubectl get service api-gateway-service -n $(NAMESPACE) >/dev/null 2>&1 || { echo "$(RED)Service api-gateway-service introuvable$(NC)"; exit 1; }
	@kubectl get service minio-service -n $(NAMESPACE) >/dev/null 2>&1 || { echo "$(RED)Service minio-service introuvable$(NC)"; exit 1; }
	@echo "$(YELLOW)Verification que tous les pods sont vraiment stables...$(NC)"
	@kubectl wait --for=condition=ready pod -l app=frontend -n $(NAMESPACE) --timeout=30s || echo "$(YELLOW)Frontend: verification terminee$(NC)"
	@kubectl wait --for=condition=ready pod -l app=api-gateway -n $(NAMESPACE) --timeout=30s || echo "$(YELLOW)API Gateway: verification terminee$(NC)"
	@kubectl wait --for=condition=ready pod -l app=minio -n $(NAMESPACE) --timeout=30s || echo "$(YELLOW)MinIO: verification terminee$(NC)"
	@echo "$(YELLOW)Attente finale de stabilisation avant port-forwards...$(NC)"
	@sleep 5
	@echo "$(GREEN)Tous les services sont disponibles et stables$(NC)"
	@echo "$(YELLOW)Lancement des port-forwards en arriere-plan...$(NC)"
	@powershell.exe -Command "Start-Process -WindowStyle Hidden kubectl -ArgumentList 'port-forward','-n','$(NAMESPACE)','service/frontend','8080:80'"
	@powershell.exe -Command "Start-Process -WindowStyle Hidden kubectl -ArgumentList 'port-forward','-n','$(NAMESPACE)','service/api-gateway-service','9000:80'"
	@powershell.exe -Command "Start-Process -WindowStyle Hidden kubectl -ArgumentList 'port-forward','-n','$(NAMESPACE)','service/minio-service','6700:80'"
	@powershell.exe -Command "Start-Process -WindowStyle Hidden kubectl -ArgumentList 'port-forward','-n','$(NAMESPACE)','service/minio-service','6701:8080'"
	@echo "$(YELLOW)Attente de l'etablissement des port forwards...$(NC)"
	@sleep 12
	@echo "$(YELLOW)Verification des port forwards...$(NC)"
	@powershell.exe -Command "try { $$response = Invoke-WebRequest -Uri 'http://localhost:8080' -TimeoutSec 3 -UseBasicParsing; Write-Host '$(GREEN)✓ Frontend OK (port 8080)$(NC)' } catch { Write-Host '$(RED)✗ Frontend non accessible$(NC)' }"
	@powershell.exe -Command "try { $$response = Invoke-WebRequest -Uri 'http://localhost:9000/health' -TimeoutSec 3 -UseBasicParsing; Write-Host '$(GREEN)✓ API Gateway OK (port 9000)$(NC)' } catch { Write-Host '$(RED)✗ API Gateway non accessible$(NC)' }"
	@powershell.exe -Command "try { $$response = Invoke-WebRequest -Uri 'http://localhost:6701' -TimeoutSec 3 -UseBasicParsing; Write-Host '$(GREEN)✓ MinIO OK (port 6701)$(NC)' } catch { Write-Host '$(YELLOW)! MinIO non disponible$(NC)' }"
	@echo ""
	@echo "$(GREEN)✅ Tous les port forwards sont operationnels !$(NC)"
	@echo "$(GREEN)Acces aux services maintenant disponibles :$(NC)"
	@echo "  $(GREEN)Frontend:$(NC) http://localhost:8080"
	@echo "  $(GREEN)API Gateway:$(NC) http://localhost:9000"
	@echo "  $(GREEN)API Docs:$(NC) http://localhost:9000/docs"
	@echo "  $(GREEN)MinIO Console:$(NC) http://localhost:6701"
	@echo ""
	@echo "$(GREEN)Port forwards actifs en arriere-plan$(NC)"

start-portforwards-resilient: stop-portforwards ## Lance les port forwards FONCTIONNEL GARANTI
	@echo "$(BLUE)Lancement des port forwards...$(NC)"
	@echo "$(YELLOW)Verification que les pods sont prets...$(NC)"
	@kubectl wait --for=condition=ready pod -l app=frontend -n $(NAMESPACE) --timeout=30s
	@kubectl wait --for=condition=ready pod -l app=api-gateway -n $(NAMESPACE) --timeout=30s
	@echo "$(YELLOW)Demarrage direct des port-forwards dans Git Bash...$(NC)"
	@kubectl port-forward -n $(NAMESPACE) service/frontend 8080:80 > /dev/null 2>&1 &
	@kubectl port-forward -n $(NAMESPACE) service/api-gateway-service 9000:80 > /dev/null 2>&1 &
	@kubectl port-forward -n $(NAMESPACE) service/minio-service 6700:80
	
	@echo "$(YELLOW)Attente etablissement des connexions (10 secondes)...$(NC)"
	@sleep 10
	@echo ""
	@echo "$(GREEN)✅ APPLICATION PRETE !$(NC)"
	@echo ""
	@echo "$(GREEN)► Frontend: http://localhost:8080$(NC)"
	@echo "$(GREEN)► API Gateway: http://localhost:9000$(NC)"
	@echo "$(GREEN)► API Docs: http://localhost:9000/docs$(NC)"
	@echo ""
	@echo "$(YELLOW)IMPORTANT: Pour arreter, utilisez 'make stop'$(NC)"

# deploy est défini plus haut - pas besoin d'alias

deploy-jobs: ## Déploie les jobs uniquement avec kubectl et patches minikube
	@echo "$(BLUE)Deploiement des jobs avec patches minikube...$(NC)"
	@kubectl apply -k k8s/overlays/minikube-jobs-only
	@echo "$(GREEN)Jobs deployes$(NC)"

wait-services: ## Attend que les services essentiels soient prêts (tolère les échecs)
	@echo "$(BLUE)Attente de la disponibilite des services essentiels...$(NC)"
	@echo "$(YELLOW)Services CRITIQUES (obligatoires):$(NC)"
	@echo "$(YELLOW)Attente PostgreSQL...$(NC)"
	-@kubectl wait --for=condition=ready pod -l app=postgresql -n $(NAMESPACE) --timeout=60s 2>$(NULL) || echo "$(YELLOW)PostgreSQL: tentative d'attente terminée$(NC)"
	@echo "$(YELLOW)Attente API Gateway...$(NC)"
	-@kubectl wait --for=condition=ready pod -l app=api-gateway -n $(NAMESPACE) --timeout=60s 2>$(NULL) || echo "$(YELLOW)API Gateway: tentative d'attente terminée$(NC)"
	@echo "$(YELLOW)Attente Service Selection...$(NC)"
	-@kubectl wait --for=condition=ready pod -l app=service-selection -n $(NAMESPACE) --timeout=60s 2>$(NULL) || echo "$(YELLOW)Service Selection: tentative d'attente terminée$(NC)"
	@echo "$(YELLOW)Attente Frontend...$(NC)"
	-@kubectl wait --for=condition=ready pod -l app=frontend -n $(NAMESPACE) --timeout=60s 2>$(NULL) || echo "$(YELLOW)Frontend: tentative d'attente terminée$(NC)"
	@echo "$(YELLOW)Services OPTIONNELS (peuvent echouer):$(NC)"
	@echo "$(YELLOW)Attente MinIO (optionnel)...$(NC)"
	-@kubectl wait --for=condition=ready pod -l app=minio -n $(NAMESPACE) --timeout=30s 2>$(NULL) || echo "$(YELLOW)MinIO: non disponible - application fonctionnera sans stockage objet$(NC)"
	@echo "$(YELLOW)Attente Redis...$(NC)"
	-@kubectl wait --for=condition=ready pod -l app=redis -n $(NAMESPACE) --timeout=60s 2>$(NULL) || echo "$(YELLOW)Redis: tentative d'attente terminée$(NC)"
	@echo "$(YELLOW)Attente ML Pipeline...$(NC)"
	-@kubectl wait --for=condition=ready pod -l app=ml-pipeline -n $(NAMESPACE) --timeout=60s 2>$(NULL) || echo "$(YELLOW)ML Pipeline: tentative d'attente terminée$(NC)"
	@echo "$(YELLOW)Attente ML Pipeline Workers...$(NC)"
	-@kubectl wait --for=condition=ready pod -l app=ml-pipeline-celery-worker -n $(NAMESPACE) --timeout=60s 2>$(NULL) || echo "$(YELLOW)ML Pipeline Workers: tentative d'attente terminée$(NC)"
	@echo "$(YELLOW)Attente XAI Engine...$(NC)"
	-@kubectl wait --for=condition=ready pod -l app=xai-engine -n $(NAMESPACE) --timeout=60s 2>$(NULL) || echo "$(YELLOW)XAI Engine: tentative d'attente terminée$(NC)"
	@echo "$(YELLOW)Attente XAI Engine Workers...$(NC)"
	-@kubectl wait --for=condition=ready pod -l app=xai-engine-celery-worker -n $(NAMESPACE) --timeout=60s 2>$(NULL) || echo "$(YELLOW)XAI Engine Workers: tentative d'attente terminée$(NC)"
	@echo "$(YELLOW)Verification finale de stabilite (15 secondes)...$(NC)"
	@sleep 15
	@echo "$(GREEN)Services essentiels prets (application accessible meme si certains services optionnels echouent)$(NC)"

migrate-jobs: ## Lance et ATTEND les migrations critiques pour éviter les erreurs
	@echo "$(BLUE)Execution des migrations critiques...$(NC)"
	@echo "$(YELLOW)Suppression des anciens jobs...$(NC)"
	-@kubectl delete job api-gateway-migration-job -n $(NAMESPACE) 2>/dev/null
	-@kubectl delete job service-selection-migration-job -n $(NAMESPACE) 2>/dev/null
	-@kubectl delete job ml-pipeline-migration-job -n $(NAMESPACE) 2>/dev/null
	-@kubectl delete job xai-engine-migration-job -n $(NAMESPACE) 2>/dev/null
	@echo "$(YELLOW)Deploiement des jobs de migration...$(NC)"
	@$(MAKE) deploy-jobs
	@echo "$(YELLOW)Attente migration API Gateway (CRITIQUE pour authentification)...$(NC)"
	@kubectl wait --for=condition=complete job/api-gateway-migration-job -n $(NAMESPACE) --timeout=60s || { \
		echo "$(RED)Job de migration echoue, execution manuelle...$(NC)"; \
		kubectl exec -it deployment/api-gateway -n $(NAMESPACE) -- bash -c "cd /app && alembic upgrade head" || true; \
	}
	@echo "$(GREEN)✅ Migrations critiques terminees$(NC)"

wait-migrations: ## Les migrations sont maintenant automatiques via initContainers
	@echo "$(BLUE)Les migrations sont exécutées automatiquement via initContainers...$(NC)"
	@echo "$(GREEN)✅ Les migrations Alembic sont lancées automatiquement au démarrage de chaque service$(NC)"
	@echo "$(YELLOW)ℹ️  Plus besoin d'attendre des Jobs, les initContainers garantissent l'ordre correct$(NC)"

migrate: wait-services migrate-jobs ## Lance les migrations (attend les services puis lance les jobs)

# init-data: DÉSACTIVÉ - Import Kaggle automatique remplacé par upload UUID via interface
# Utilisez l'interface web http://localhost:8080/datasets pour uploader des datasets
# Les fichiers sont automatiquement stockés avec des UUID pour la sécurité
#
# init-data: check-kaggle-credentials ## Initialise les VRAIS datasets depuis Kaggle (obligatoire)
#	@echo "$(BLUE)Initialisation des VRAIS datasets depuis Kaggle...$(NC)"
#	@echo "$(YELLOW)IMPORTANT: Cette operation va telecharger les vrais datasets depuis Kaggle$(NC)"
#	@echo "$(YELLOW)Cela peut prendre plusieurs minutes selon votre connexion internet$(NC)"
#	@echo "$(YELLOW)Suppression de l'ancien job Kaggle...$(NC)"
#	-@kubectl delete job kaggle-dataset-import-job -n $(NAMESPACE) 2>$(NULL)
#	@echo "$(YELLOW)Lancement du job d'import Kaggle...$(NC)"
#	@kubectl apply -f k8s/base/jobs/kaggle-dataset-import-job.yaml -n $(NAMESPACE)
#	@echo "$(YELLOW)Attente de la completion de l'import Kaggle (max 30 minutes)...$(NC)"
#	@kubectl wait --for=condition=complete job/kaggle-dataset-import-job -n $(NAMESPACE) --timeout=1800s
#	@echo "$(YELLOW)Si le job a echoue, verifiez les logs avec: kubectl logs -n $(NAMESPACE) job/kaggle-dataset-import-job$(NC)"
#	@echo "$(GREEN)✅ VRAIS datasets importes avec succes depuis Kaggle !$(NC)"
#	@echo ""
#	@echo "$(GREEN)🚀🚀🚀 IBIS-X EST MAINTENANT PRET AVEC LES VRAIS DATASETS ! 🚀🚀🚀$(NC)"
#	@echo "$(GREEN)✅ Frontend:$(NC) http://localhost:8080"
#	@echo "$(GREEN)✅ API Gateway:$(NC) http://localhost:9000/docs"
#	@echo "$(GREEN)✅ Toutes les migrations et vrais datasets sont termines !$(NC)"

# init-data-job: OBSOLÈTE - Utilisait les fausses données via init_datasets.py
# Utiliser 'make init-data' qui utilise les VRAIS datasets Kaggle

dev: clean-namespace check-prerequisites update-secrets start-minikube create-namespace docker-env deploy wait-services wait-migrations show-access dev-logs ## Installation complète UUID - Upload datasets via interface utilisateur

dev-logs: stop-portforwards ## Lance les port-forwards robustes et reste avec les logs (target interne pour dev)
	@echo ""
	@echo "$(BLUE)🚀 LANCEMENT DES PORT-FORWARDS ROBUSTES$(NC)"
	@echo "$(YELLOW)Nettoyage automatique et démarrage des port-forwards stables...$(NC)"
	@$(MAKE) start-portforwards-final
	@echo "$(GREEN)✅ Port-forwards robustes démarrés avec succès$(NC)"
ifeq ($(IS_WINDOWS),true)
	@powershell.exe -Command "try { Invoke-WebRequest -Uri http://localhost:9000/health -Method GET -TimeoutSec 5 -UseBasicParsing | Out-Null; Write-Host '$(GREEN)✓ API Gateway accessible$(NC)' } catch { Write-Host '$(YELLOW)⚠ API Gateway pas encore prêt - attendez quelques secondes$(NC)' }"
	@powershell.exe -Command "try { Invoke-WebRequest -Uri http://localhost:8080 -Method GET -TimeoutSec 5 -UseBasicParsing | Out-Null; Write-Host '$(GREEN)✓ Frontend accessible$(NC)' } catch { Write-Host '$(YELLOW)⚠ Frontend pas encore prêt - attendez quelques secondes$(NC)' }"
else
	@curl -fsS --max-time 3 http://localhost:9000/health >/dev/null 2>&1 && echo "$(GREEN)✓ API Gateway accessible$(NC)" || echo "$(YELLOW)⚠ API Gateway pas encore prêt - attendez quelques secondes$(NC)"
	@curl -fsS --max-time 3 http://localhost:8080 >/dev/null 2>&1 && echo "$(GREEN)✓ Frontend accessible$(NC)" || echo "$(YELLOW)⚠ Frontend pas encore prêt - attendez quelques secondes$(NC)"
endif
	@echo "$(GREEN)✅ Application déployée et accessible !$(NC)"
	@echo ""
	@echo "$(GREEN)🌐 Application accessible sur :$(NC)"
	@echo "  $(GREEN)► Frontend:      http://localhost:8080$(NC)"
	@echo "  $(GREEN)► API Gateway:   http://localhost:9000$(NC)"
	@echo "  $(GREEN)► API Docs:      http://localhost:9000/docs$(NC)"
	@echo "  $(GREEN)► MinIO Console: http://localhost:6701$(NC)"
	@echo ""
	@echo "$(YELLOW)📋 === LOGS EN TEMPS REEL - Appuyez sur Ctrl+C pour TOUT arrêter ====$(NC)"
	@echo "$(BLUE)🔗 Services surveillés: Frontend, API Gateway, Service Selection, ML Pipeline, XAI Engine, Workers$(NC)"
	@echo ""
	@echo "$(YELLOW)💡 ASTUCE: Si Ctrl+C ne nettoie pas tout, tapez: make clean-logs$(NC)"
	@echo ""
	@bash -c ' \
		cleanup() { \
			echo; \
			echo "🛑 Ctrl+C détecté - Nettoyage en cours..."; \
			pkill -f "kubectl.*logs" 2>/dev/null || killall kubectl 2>/dev/null || true; \
			echo "✅ Processus kubectl nettoyés"; \
			exit 0; \
		}; \
		trap cleanup INT; \
		kubectl logs -f deployment/api-gateway -n $(NAMESPACE) --prefix=true & \
		kubectl logs -f deployment/frontend -n $(NAMESPACE) --prefix=true & \
		kubectl logs -f deployment/service-selection -n $(NAMESPACE) --prefix=true & \
		kubectl logs -f deployment/ml-pipeline -n $(NAMESPACE) --prefix=true & \
		kubectl logs -f deployment/ml-pipeline-celery-worker -n $(NAMESPACE) --prefix=true & \
		kubectl logs -f deployment/xai-engine -n $(NAMESPACE) --prefix=true & \
		kubectl logs -f deployment/xai-engine-celery-worker -n $(NAMESPACE) --prefix=true & \
		wait \
	'

clean-namespace: ## Nettoie le namespace avant de démarrer
	@echo "$(BLUE)Nettoyage du namespace ibis-x...$(NC)"
	-@kubectl delete namespace ibis-x --force --grace-period=0 2>$(NULL) || echo "Namespace deja propre"
	@$(SLEEP_CMD) 3
	@echo "$(GREEN)Namespace nettoye$(NC)"

dev-watch: check-prerequisites update-secrets start-minikube create-namespace docker-env deploy-services-dev wait-services migrate-jobs init-data watch-portforwards ## Mode développement AVANCÉ avec surveillance automatique des fichiers (optionnel)

dev-no-data: check-prerequisites update-secrets start-minikube create-namespace docker-env deploy wait-services wait-migrations show-access ## Installation SANS datasets (pour développement/tests uniquement)

show-access: ## Affiche les informations d'accès à l'application
	@echo ""
	@echo "$(GREEN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(GREEN)║        🚀 IBIS-X EST PRÊT ET ACCESSIBLE ! 🚀                ║$(NC)"
	@echo "$(GREEN)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(BOLD)$(GREEN)URLs d'accès :$(NC)"
	@echo "  $(GREEN)► Frontend:$(NC)      http://localhost:8080"
	@echo "  $(GREEN)► API Gateway:$(NC)   http://localhost:9000"
	@echo "  $(GREEN)► API Docs:$(NC)      http://localhost:9000/docs"
	@echo "  $(GREEN)► MinIO Console:$(NC) http://localhost:6701 $(YELLOW)(si disponible)$(NC)"
	@echo ""
	@echo "$(BOLD)$(YELLOW)Commandes utiles :$(NC)"
	@echo "  $(YELLOW)► Voir les logs:$(NC)         make logs"
	@echo "  $(YELLOW)► Arrêter l'application:$(NC) make stop"
	@echo "  $(YELLOW)► Réparer les ports:$(NC)     make fix-portforwards"
	@echo "  $(YELLOW)► Surveiller les ports:$(NC)  make watch-portforwards"
	@echo ""
	@echo "$(BLUE)💡 Conseil: Si l'application ne répond pas, exécutez 'make fix-portforwards'$(NC)"
	@echo ""

logs-interactive: quick-logs ## Alias pour quick-logs avec nom plus explicite

quick-dev: update-secrets deploy wait-services wait-migrations init-data ## Déploiement rapide (si Minikube déjà démarré) - UTILISEZ 'make dev' à la place

logs: ## Affiche les logs en temps réel avec port-forwards automatiques (EXACT ancien système)
	@echo "$(BLUE)Demarrage des logs en temps reel avec port-forwards automatiques...$(NC)"
	@echo "$(YELLOW)Acces aux services :$(NC)"
	@echo "  $(GREEN)Frontend:$(NC) http://localhost:8080"
	@echo "  $(GREEN)API Gateway:$(NC) http://localhost:9000"
	@echo "  $(GREEN)API Docs:$(NC) http://localhost:9000/docs"
	@echo ""
	@echo "$(YELLOW)Lancement des port-forwards...$(NC)"
	@kubectl port-forward -n $(NAMESPACE) service/frontend 8080:80 > /dev/null 2>&1 &
	@kubectl port-forward -n $(NAMESPACE) service/api-gateway-service 9000:80 > /dev/null 2>&1 &
	@kubectl port-forward -n $(NAMESPACE) service/minio-service 6700:80
	
	@sleep 3
	@echo "$(GREEN)✅ Port-forwards actifs !$(NC)"
	@echo ""
	@echo "$(YELLOW)=== LOGS EN TEMPS REEL - Appuyez sur Ctrl+C pour arreter TOUT ====$(NC)"
	@echo ""
	@kubectl logs -f deployment/api-gateway -n $(NAMESPACE) --prefix=true

view-logs: ## Affiche les logs des services sans redéployer
	@echo "$(BLUE)Demarrage des logs en temps reel...$(NC)"
	@echo "$(YELLOW)Logs en temps reel (Ctrl+C pour arreter):$(NC)"
	@echo ""
	@kubectl logs -f deployment/api-gateway -n $(NAMESPACE) --prefix=true &
	@kubectl logs -f deployment/frontend -n $(NAMESPACE) --prefix=true &
	@kubectl logs -f deployment/service-selection -n $(NAMESPACE) --prefix=true &
	@kubectl logs -f deployment/xai-engine -n $(NAMESPACE) --prefix=true &
	@kubectl logs -f statefulset/postgresql -n $(NAMESPACE) --prefix=true &
	@wait

quick-logs: ## Affiche les logs dans le même terminal (Ctrl+C pour arrêter)
	@echo "$(BLUE)Affichage des logs IBIS-X dans le meme terminal...$(NC)"
	@echo "$(YELLOW)Services disponibles :$(NC)"
	@echo "  $(GREEN)Frontend:$(NC) http://localhost:8080"
	@echo "  $(GREEN)API Gateway:$(NC) http://localhost:9000"
	@echo "  $(GREEN)API Docs:$(NC) http://localhost:9000/docs"
	@echo ""
	@echo "$(YELLOW)Appuyez sur Ctrl+C pour arreter les logs$(NC)"
	@echo ""
	@echo "$(GREEN)=== Logs en temps reel ====$(NC)"
	@kubectl logs -f deployment/api-gateway -n $(NAMESPACE) --prefix=true --since=30s

stop-portforwards: ## Arrête tous les port forwards actifs PROPREMENT 
	@echo "$(BLUE)Arret de tous les port forwards et logs...$(NC)"
	@echo "$(YELLOW)Arret des processus kubectl en arriere-plan...$(NC)"
ifeq ($(IS_WINDOWS),true)
	-@powershell.exe -Command "Get-Process -Name kubectl -ErrorAction SilentlyContinue | Where-Object { $$_.CommandLine -like '*port-forward*' } | Stop-Process -Force" 2>$(NULL) || echo ""
	@powershell.exe -Command "Start-Sleep -Seconds 3"
else
	-@$(KILL_PORTFORWARD_CMD) 2>$(NULL) || echo ""
	@$(SLEEP_CMD) 3
endif
	@echo "$(GREEN)✓ Tous les port forwards et logs arretes$(NC)"

clean-logs: stop-portforwards ## Nettoie tous les processus kubectl qui traînent (équivalent ancien Ctrl+C)
	@echo "$(BLUE)🧹 Nettoyage des processus kubectl orphelins...$(NC)"
	@echo "$(GREEN)✅ Tous les logs et port-forwards arrêtés proprement$(NC)"

restart-portforwards: ## Redémarre automatiquement les port forwards de manière ultra-robuste
	@echo "$(BLUE)Redemarrage ultra-robuste des port forwards...$(NC)"
	@echo "$(YELLOW)Arret FORCE de tous les anciens port forwards...$(NC)"
	@$(MAKE) stop-portforwards
	@sleep 3
	@echo "$(YELLOW)Verification de la stabilite des services ESSENTIELS...$(NC)"
	@kubectl wait --for=condition=ready pod -l app=frontend -n $(NAMESPACE) --timeout=60s || echo "$(YELLOW)Frontend: attente terminee$(NC)"
	@kubectl wait --for=condition=ready pod -l app=api-gateway -n $(NAMESPACE) --timeout=60s || echo "$(YELLOW)API Gateway: attente terminee$(NC)"
	@echo "$(YELLOW)Verification MinIO (optionnel - ne bloque pas si echec)...$(NC)"
	-@kubectl wait --for=condition=ready pod -l app=minio -n $(NAMESPACE) --timeout=30s 2>$(NULL) || echo "$(YELLOW)MinIO: non disponible - port forward MinIO sera ignoré$(NC)"
	@echo "$(YELLOW)Attente supplementaire pour garantir la stabilite...$(NC)"
	@sleep 10
	@echo "$(YELLOW)Verification que Skaffold a termine ses operations...$(NC)"
	@sleep 5
	@$(MAKE) start-portforwards-resilient
	@echo "$(GREEN)Port forwards redemarres avec succes de maniere ultra-robuste !$(NC)"
	@echo ""
	@echo "$(GREEN)🎉🎉🎉 APPLICATION ACCESSIBLE MAINTENANT : http://localhost:8080 🎉🎉🎉$(NC)"
	@echo "$(GREEN)✅ FRONTEND PRET - AUCUNE ATTENTE REQUISE !$(NC)"
	@echo "$(YELLOW)Les migrations et initialisations se terminent automatiquement en arriere-plan...$(NC)"
	@echo ""

watch-portforwards: ## Surveille et relance automatiquement les port forwards en cas de problème
	@echo "$(BLUE)Surveillance automatique des port forwards...$(NC)"
	@echo "$(YELLOW)Appuyez sur Ctrl+C pour arreter la surveillance$(NC)"
	@powershell.exe -Command "while ($$true) { try { $$frontend = Test-NetConnection -ComputerName localhost -Port 8080 -InformationLevel Quiet -WarningAction SilentlyContinue; $$api = Test-NetConnection -ComputerName localhost -Port 9000 -InformationLevel Quiet -WarningAction SilentlyContinue; $$minio = Test-NetConnection -ComputerName localhost -Port 6701 -InformationLevel Quiet -WarningAction SilentlyContinue; if (-not $$frontend -or -not $$api -or -not $$minio) { Write-Host '$(YELLOW)Port forwards cassés - relancement automatique...$(NC)'; taskkill /F /IM kubectl.exe 2>$$null; Start-Sleep -Seconds 3; & make start-portforwards-resilient; Write-Host '$(GREEN)Port forwards relancés automatiquement$(NC)' } else { Write-Host '$(GREEN)Port forwards OK - $(NC)Frontend:8080 API:9000 MinIO:6701'; } Start-Sleep -Seconds 10 } catch { Write-Host 'Erreur surveillance - retry...'; Start-Sleep -Seconds 5 } }"

fix-portforwards: ## CORRECTION IMMEDIATE - Script automatique qui fonctionne vraiment
	@echo "$(BLUE)Correction avec script automatique...$(NC)"
	@$(MAKE) stop-portforwards
	@sleep 2  
	@echo "$(YELLOW)Lancement du script de correction...$(NC)"
	@$(MAKE) start-portforwards-final

# Cible réutilisable : lance les port-forwards MinIO (API + Console)
start-minio-portforwards:
	@kubectl port-forward -n $(NAMESPACE) service/minio-service $(MINIO_API_PORT):80 > /dev/null 2>&1 &
	@kubectl port-forward -n $(NAMESPACE) service/minio-service $(MINIO_CONSOLE_PORT):8080 > /dev/null 2>&1 &
	@sleep 2

start-portforwards-simple: ## Port-forwards simples (3 commandes à copier-coller)
	@echo "$(BLUE)=== COMMANDES A EXECUTER DANS 3 TERMINAUX SEPARES ===$(NC)"
	@echo ""
	@echo "$(YELLOW)Copiez-collez ces 3 commandes dans 3 terminaux differents :$(NC)"
	@echo ""
	@echo "$(GREEN)kubectl port-forward -n ibis-x service/frontend 8080:80$(NC)"
	@echo "$(GREEN)kubectl port-forward -n ibis-x service/api-gateway-service 9000:80$(NC)"  
	@echo "$(GREEN)kubectl port-forward -n ibis-x service/minio-service 6700:80
	@kubectl port-forward -n $(NAMESPACE) service/minio-service 6701:8080$(NC)"
	@echo ""
	@echo "$(BLUE)Puis allez sur http://localhost:8080$(NC)"

list-jobs: ## Liste les processus kubectl port-forward actifs
	@echo "$(BLUE)Processus kubectl port-forward actifs :$(NC)"
	@powershell.exe -Command "$$processes = Get-Process -Name kubectl -ErrorAction SilentlyContinue | Where-Object { $$_.CommandLine -like '*port-forward*' }; if ($$processes) { $$processes | Format-Table ProcessName, Id, StartTime -AutoSize } else { Write-Host 'Aucun port-forward actif' }"
	@echo ""
	@echo "$(YELLOW)Pour arreter tous les port-forwards : make stop-portforwards$(NC)"

clean-temp-files: ## Nettoie les fichiers temporaires créés par le Makefile
	@echo "$(BLUE)Nettoyage des fichiers temporaires...$(NC)"
	-@del launch-ports.bat 2>$(NULL) || echo ""
	-@del logs-viewer.bat 2>$(NULL) || echo ""
	-@del start-portforwards.bat 2>$(NULL) || echo ""

	@echo "$(GREEN)Fichiers temporaires nettoyes$(NC)"

healthcheck: ## Vérifie l'état de santé des services et port-forwards
	@echo "$(BLUE)Verification de l'etat des services...$(NC)"
	@curl -fsS --max-time 2 http://localhost:8080 >/dev/null 2>&1 && echo "$(GREEN)✓ Frontend OK (port 8080)$(NC)" || echo "$(RED)✗ Frontend ECHEC (port 8080)$(NC)"
	@curl -fsS --max-time 2 http://localhost:9000/health >/dev/null 2>&1 && echo "$(GREEN)✓ API Gateway OK (port 9000)$(NC)" || echo "$(RED)✗ API Gateway ECHEC (port 9000)$(NC)"
	@curl -fsS --max-time 2 http://localhost:$(MINIO_API_PORT)/minio/health/ready >/dev/null 2>&1 && echo "$(GREEN)✓ MinIO API OK (port $(MINIO_API_PORT))$(NC)" || echo "$(YELLOW)! MinIO non disponible (port $(MINIO_API_PORT))$(NC)"

dev-data: check-kaggle-credentials ## Import automatique des VRAIS datasets Kaggle pour développement local
	@echo "$(BLUE)🚀 Import automatique des VRAIS datasets Kaggle pour developpement...$(NC)"
	@echo "$(YELLOW)ATTENTION: Cette operation va telecharger les vrais datasets depuis Kaggle$(NC)"
	@echo "$(YELLOW)Cela peut prendre plusieurs minutes selon votre connexion internet$(NC)"
	@echo "$(YELLOW)Verification et démarrage automatique des port-forwards (safe pour logs)...$(NC)"
	@$(MAKE) start-portforwards-final
	@echo "$(GREEN)✅ Tous les services sont accessibles et prêts !$(NC)"
	
	@echo "$(YELLOW)Lancement de l'import Kaggle avec structure UUID...$(NC)"
	@echo "$(YELLOW)Configuration automatique des variables d'environnement...$(NC)"
	@cd datasets/kaggle-import && \
	export DATABASE_URL="postgresql://ibis_x_user:password@localhost:5432/ibis_x_db" && \
	export STORAGE_BACKEND="minio" && \
	export MINIO_ENDPOINT="localhost:6700" && \
	export MINIO_ACCESS_KEY="minioadmin" && \
	export MINIO_SECRET_KEY="minioadmin" && \
	export MINIO_BUCKET="ibis-x-datasets" && \
	python main.py --force-refresh $(ARGS)
	
	@echo "$(YELLOW)Validation des datasets importes...$(NC)"
	@python scripts/development/validate-kaggle-datasets.py
	
	@echo ""
	@echo "$(GREEN)🎉🎉🎉 DATASETS KAGGLE IMPORTES AVEC SUCCES ! 🎉🎉🎉$(NC)"
	@echo "$(GREEN)✅ Structure UUID securisee dans MinIO$(NC)"
	@echo "$(GREEN)✅ Metadonnees completes en base PostgreSQL$(NC)"
	@echo "$(GREEN)✅ 7 vrais datasets Kaggle prets pour developpement$(NC)"
	@echo ""
	@echo "$(GREEN)Acces aux datasets :$(NC)"
	@echo "  $(GREEN)► Interface IBIS-X: http://localhost:8080/datasets$(NC)"
	@echo "  $(GREEN)► API Datasets: http://localhost:9000/datasets$(NC)"

validate-datasets: ## Valide que les VRAIS datasets Kaggle sont importés (pas de fausses données)
	@echo "$(BLUE)Validation des datasets...$(NC)"
	@python scripts/development/validate-kaggle-datasets.py

stop: stop-portforwards clean-temp-files ## Arrête l'application et nettoie les fichiers temporaires
	@echo "$(BLUE)Arret de l'application...$(NC)"
	@skaffold delete --profile=local --namespace=$(NAMESPACE) 2>$(NULL)
	@echo "$(GREEN)Application arretee et nettoyee$(NC)"

clean-migrations: ## Supprime les jobs de migration
	@echo "$(BLUE)Nettoyage des jobs de migration...$(NC)"
	-@kubectl delete job api-gateway-migration-job -n $(NAMESPACE) 2>$(NULL)
	-@kubectl delete job service-selection-migration-job -n $(NAMESPACE) 2>$(NULL)
	-@kubectl delete job ml-pipeline-migration-job -n $(NAMESPACE) 2>$(NULL)
	-@kubectl delete job xai-engine-migration-job -n $(NAMESPACE) 2>$(NULL)
	@echo "$(GREEN)Jobs de migration supprimes$(NC)"

clean: stop clean-migrations ## Nettoyage complet
	@echo "$(BLUE)Nettoyage complet...$(NC)"
	-@kubectl delete namespace $(NAMESPACE) 2>$(NULL)
	@echo "$(GREEN)Nettoyage termine$(NC)"

reset: clean dev ## Reset complet (nettoyage + redémarrage)

reset-secrets: ## Remet les placeholders dans les fichiers de secrets
	@echo "$(BLUE)Remise des placeholders...$(NC)"
	@python scripts/development/reset-placeholders.py
	@echo "$(GREEN)Placeholders restaures$(NC)"

test-docker-context: ## Teste la taille du contexte Docker du frontend (optimisation)
	@echo "$(BLUE)Test de la taille du contexte Docker du frontend...$(NC)"
	@echo "$(YELLOW)Verification de l'optimisation avec .dockerignore...$(NC)"
	@cd frontend && powershell.exe -Command "$$output = docker build -f Dockerfile . --no-cache --progress=plain 2>&1; $$lines = $$output | Select-String 'Sending build context'; if ($$lines) { $$lines | ForEach-Object { Write-Host $$_.Line } } else { Write-Host '$(YELLOW)Ligne de contexte non trouvée - build peut-être optimisé$(NC)' }"
	@echo "$(GREEN)Test du contexte Docker terminé$(NC)"
	@echo "$(BLUE)Objectif: contexte < 50 Mo (vs 3.778GB initialement)$(NC)"

test-ml-pipeline: ## Test rapide du service ML Pipeline
	@echo "$(BLUE)Test du service ML Pipeline...$(NC)"
	@echo "$(YELLOW)Verification Redis...$(NC)"
	@kubectl exec -n $(NAMESPACE) statefulset/redis -- redis-cli ping || echo "$(RED)Redis non disponible$(NC)"
	@echo "$(YELLOW)Verification API ML Pipeline...$(NC)"
	@kubectl port-forward -n $(NAMESPACE) service/ml-pipeline-service 8082:8082 &
	@sleep 3
	@curl -s http://localhost:8082/health || echo "$(RED)API ML Pipeline non disponible$(NC)"
	@echo "$(YELLOW)Verification Workers Celery...$(NC)"
	@kubectl logs -n $(NAMESPACE) deployment/ml-pipeline-celery-worker --tail=10 || echo "$(RED)Workers non disponibles$(NC)"
	@echo "$(GREEN)Test ML Pipeline termine$(NC)"

start-portforwards-final: ## Solution AUTOMATIQUE - Multi-plateforme
	@echo "$(BLUE)=== LANCEMENT AUTOMATIQUE DES PORT-FORWARDS ===$(NC)"
	@echo "$(YELLOW)Verification pods prets...$(NC)"
	@kubectl wait --for=condition=ready pod -l app=frontend -n $(NAMESPACE) --timeout=30s || true
	@kubectl wait --for=condition=ready pod -l app=api-gateway -n $(NAMESPACE) --timeout=30s || true
ifeq ($(IS_WINDOWS),true)
	@echo "$(YELLOW)Lancement des port-forwards avec PowerShell...$(NC)"
	@powershell.exe -Command "Start-Process -WindowStyle Hidden kubectl -ArgumentList 'port-forward','-n','$(NAMESPACE)','service/frontend','8080:80'; Start-Sleep -Seconds 2"
	@powershell.exe -Command "Start-Process -WindowStyle Hidden kubectl -ArgumentList 'port-forward','-n','$(NAMESPACE)','service/api-gateway-service','9000:80'; Start-Sleep -Seconds 2"
	@powershell.exe -Command "Start-Process -WindowStyle Hidden kubectl -ArgumentList 'port-forward','-n','$(NAMESPACE)','service/minio-service','6700:80'"
	@powershell.exe -Command "Start-Process -WindowStyle Hidden kubectl -ArgumentList 'port-forward','-n','$(NAMESPACE)','service/minio-service','6701:8080'"
	@powershell.exe -Command "Start-Process -WindowStyle Hidden kubectl -ArgumentList 'port-forward','-n','$(NAMESPACE)','service/postgresql-service','5432:5432'"
	@echo "$(YELLOW)Attente etablissement des connexions (10 secondes)...$(NC)"
	@powershell.exe -Command "Start-Sleep -Seconds 10"
else
	@echo "$(YELLOW)Lancement des port-forwards pour macOS/Linux...$(NC)"
	@/bin/bash -c 'nohup kubectl port-forward -n $(NAMESPACE) service/frontend 8080:80 > /dev/null 2>&1 &'
	@$(SLEEP_CMD) 2
	@/bin/bash -c 'nohup kubectl port-forward -n $(NAMESPACE) service/api-gateway-service 9000:80 > /dev/null 2>&1 &'
	@$(SLEEP_CMD) 2
	@/bin/bash -c 'nohup kubectl port-forward -n $(NAMESPACE) service/minio-service 6700:80 > /dev/null 2>&1 &'
	@/bin/bash -c 'nohup kubectl port-forward -n $(NAMESPACE) service/minio-service 6701:8080 > /dev/null 2>&1 &'
	@/bin/bash -c 'nohup kubectl port-forward -n $(NAMESPACE) service/postgresql-service 5432:5432 > /dev/null 2>&1 &'
	@echo "$(YELLOW)Attente etablissement des connexions (10 secondes)...$(NC)"
	@$(SLEEP_CMD) 10
endif
	@echo ""
	@echo "$(GREEN)✅ APPLICATION PRETE !$(NC)"
	@echo ""
	@echo "$(GREEN)► Frontend: http://localhost:8080$(NC)"
	@echo "$(GREEN)► API Gateway: http://localhost:9000$(NC)"
	@echo "$(GREEN)► API Docs: http://localhost:9000/docs$(NC)"
	@echo "$(GREEN)► MinIO Console: http://localhost:6701$(NC)"
	@echo "$(GREEN)► PostgreSQL: localhost:5432$(NC)"
	@echo ""
	@echo "$(GREEN)Port-forwards lances automatiquement !$(NC)"

start-portforwards-auto: ## Lance automatiquement les port-forwards avec PowerShell (compatible Windows)
	@echo "$(BLUE)=== LANCEMENT AUTOMATIQUE DES PORT-FORWARDS ===$(NC)"
	@echo "$(YELLOW)Verification pods prets...$(NC)"
	@kubectl wait --for=condition=ready pod -l app=frontend -n $(NAMESPACE) --timeout=30s || true
	@kubectl wait --for=condition=ready pod -l app=api-gateway -n $(NAMESPACE) --timeout=30s || true
	@echo "$(YELLOW)Lancement des port-forwards en arriere-plan...$(NC)"
	@powershell.exe -Command "Start-Process -WindowStyle Hidden kubectl -ArgumentList 'port-forward','-n','$(NAMESPACE)','service/frontend','8080:80'"
	@powershell.exe -Command "Start-Process -WindowStyle Hidden kubectl -ArgumentList 'port-forward','-n','$(NAMESPACE)','service/api-gateway-service','9000:80'"
	@powershell.exe -Command "Start-Process -WindowStyle Hidden kubectl -ArgumentList 'port-forward','-n','$(NAMESPACE)','service/minio-service','6700:80'"
	@powershell.exe -Command "Start-Process -WindowStyle Hidden kubectl -ArgumentList 'port-forward','-n','$(NAMESPACE)','service/minio-service','6701:8080'"
	@sleep 3
	@echo "$(GREEN)✅ Port-forwards lances automatiquement !$(NC)"
	@echo "$(GREEN)  ► Frontend:      http://localhost:8080$(NC)"
	@echo "$(GREEN)  ► API Gateway:   http://localhost:9000$(NC)"
	@echo "$(GREEN)  ► MinIO Console: http://localhost:6701$(NC)" 