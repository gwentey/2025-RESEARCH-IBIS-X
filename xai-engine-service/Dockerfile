# === DOCKERFILE OPTIMISÉ POUR CACHE DOCKER ===
# syntax=docker/dockerfile:1.4
FROM python:3.11-slim

# Métadonnées
LABEL maintainer="IBIS-X Team"
LABEL description="XAI Engine Service - Service d'explicabilité pour IBIS-X"
LABEL version="1.0.0"

# Variables d'environnement
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PIP_NO_CACHE_DIR=1
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
ENV MPLCONFIGDIR=/tmp/matplotlib

# ===== LAYER 1: Utilisateur (cache très longue durée) =====
RUN groupadd -r xaiuser && useradd -r -g xaiuser xaiuser

# ===== LAYER 2: Dépendances système (cache longue durée) =====
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y \
    gcc \
    g++ \
    libpq-dev \
    libhdf5-dev \
    pkg-config \
    && apt-get clean

# ===== LAYER 3: Dépendances Python (cache si requirements.txt inchangé) =====
WORKDIR /app
COPY xai-engine-service/requirements.txt .

# Utiliser le cache pip avec BuildKit
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r requirements.txt

# ===== LAYER 4: Code common (cache si common/ inchangé) =====
COPY common/ ./common/

# ===== LAYER 5: Configuration Alembic (cache si alembic.ini inchangé) =====
COPY xai-engine-service/alembic.ini .

# ===== LAYER 6: Migrations Alembic (cache si migrations inchangées) =====
COPY xai-engine-service/alembic/ ./alembic/

# ===== LAYER 7: Code application (rebuild seulement si app/ modifié) =====
COPY xai-engine-service/app/ ./app/

# ===== LAYER 8: Script de migration personnalisé =====
COPY xai-engine-service/migrate_xai.py .

# Créer les répertoires nécessaires
RUN mkdir -p /app/logs /app/tmp && \
    chown -R xaiuser:xaiuser /app

# Changer vers l'utilisateur non-root
USER xaiuser

# Port d'écoute
EXPOSE 8083

# Commande par défaut
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8083"]
