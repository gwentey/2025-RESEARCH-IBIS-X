#!/bin/bash

# Script de monitoring automatique des queues Celery
# Ce script vérifie si les workers consomment les tâches et redémarre automatiquement si nécessaire

set -euo pipefail

NAMESPACE="ibis-x"
QUEUE_NAME="ml_queue"
MAX_QUEUE_SIZE=2  # Taille max acceptable de la queue
CHECK_INTERVAL=30  # Vérification toutes les 30 secondes
LOG_FILE="/tmp/celery-monitor.log"

echo "🔍 DÉMARRAGE DU MONITORING CELERY - $(date)" | tee -a "$LOG_FILE"
echo "📋 Namespace: $NAMESPACE" | tee -a "$LOG_FILE"
echo "📦 Queue surveillée: $QUEUE_NAME" | tee -a "$LOG_FILE"
echo "⚠️  Taille max acceptable: $MAX_QUEUE_SIZE tâches" | tee -a "$LOG_FILE"
echo "⏱️  Intervalle de vérification: ${CHECK_INTERVAL}s" | tee -a "$LOG_FILE"
echo "----------------------------------------" | tee -a "$LOG_FILE"

check_queue_health() {
    local queue_size
    local worker_count
    local timestamp
    
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    # 1. Vérifier la taille de la queue
    queue_size=$(kubectl exec -n "$NAMESPACE" redis-0 -- redis-cli LLEN "$QUEUE_NAME" 2>/dev/null || echo "ERROR")
    
    if [ "$queue_size" = "ERROR" ]; then
        echo "❌ [$timestamp] ERREUR: Impossible de vérifier la queue Redis" | tee -a "$LOG_FILE"
        return 1
    fi
    
    # 2. Compter les workers actifs
    worker_count=$(kubectl get pods -n "$NAMESPACE" -l app=ml-pipeline-celery-worker --no-headers | grep -c "Running" 2>/dev/null || echo "0")
    
    echo "📊 [$timestamp] Queue: $queue_size tâches | Workers: $worker_count actifs" | tee -a "$LOG_FILE"
    
    # 3. Vérifier si la queue est bloquée
    if [ "$queue_size" -gt "$MAX_QUEUE_SIZE" ] && [ "$worker_count" -gt 0 ]; then
        echo "🚨 [$timestamp] PROBLÈME DÉTECTÉ: $queue_size tâches bloquées avec $worker_count workers actifs" | tee -a "$LOG_FILE"
        return 1
    fi
    
    if [ "$queue_size" -eq 0 ]; then
        echo "✅ [$timestamp] Queue vide - Système sain" | tee -a "$LOG_FILE"
    else
        echo "⏳ [$timestamp] Queue en cours de traitement ($queue_size tâches)" | tee -a "$LOG_FILE"
    fi
    
    return 0
}

restart_workers() {
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    echo "🔄 [$timestamp] REDÉMARRAGE AUTOMATIQUE des workers Celery..." | tee -a "$LOG_FILE"
    
    if kubectl rollout restart deployment/ml-pipeline-celery-worker -n "$NAMESPACE" 2>/dev/null; then
        echo "✅ [$timestamp] Workers redémarrés avec succès" | tee -a "$LOG_FILE"
        
        # Attendre que les nouveaux workers soient prêts
        echo "⏳ [$timestamp] Attente du redémarrage complet..." | tee -a "$LOG_FILE"
        sleep 60
        
        # Vérifier que la queue se vide
        local new_queue_size
        new_queue_size=$(kubectl exec -n "$NAMESPACE" redis-0 -- redis-cli LLEN "$QUEUE_NAME" 2>/dev/null || echo "ERROR")
        
        if [ "$new_queue_size" != "ERROR" ] && [ "$new_queue_size" -lt "$MAX_QUEUE_SIZE" ]; then
            echo "🎉 [$timestamp] Redémarrage réussi ! Queue: $new_queue_size tâches" | tee -a "$LOG_FILE"
        else
            echo "⚠️  [$timestamp] Queue toujours problématique après redémarrage: $new_queue_size tâches" | tee -a "$LOG_FILE"
        fi
    else
        echo "❌ [$timestamp] ERREUR lors du redémarrage des workers" | tee -a "$LOG_FILE"
    fi
}

# Fonction de nettoyage
cleanup() {
    echo "🛑 [$timestamp] Arrêt du monitoring sur signal" | tee -a "$LOG_FILE"
    exit 0
}

# Capturer les signaux d'arrêt
trap cleanup SIGINT SIGTERM

# Monitoring principal
consecutive_failures=0
MAX_CONSECUTIVE_FAILURES=3

while true; do
    if check_queue_health; then
        consecutive_failures=0
    else
        ((consecutive_failures++))
        echo "⚠️  Échec #$consecutive_failures/$MAX_CONSECUTIVE_FAILURES" | tee -a "$LOG_FILE"
        
        if [ $consecutive_failures -ge $MAX_CONSECUTIVE_FAILURES ]; then
            echo "🚨 SEUIL ATTEINT: $consecutive_failures échecs consécutifs" | tee -a "$LOG_FILE"
            restart_workers
            consecutive_failures=0
        fi
    fi
    
    sleep "$CHECK_INTERVAL"
done
