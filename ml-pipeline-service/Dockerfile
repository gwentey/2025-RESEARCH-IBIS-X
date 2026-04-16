# === DOCKERFILE OPTIMISÉ POUR CACHE DOCKER ===
# syntax=docker/dockerfile:1.4
FROM python:3.11-slim

# ===== LAYER 1: Dépendances système (cache très longue durée) =====
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y \
    build-essential \
    && apt-get clean

# ===== LAYER 2: Dépendances Python (cache si requirements.txt inchangé) =====
WORKDIR /app
COPY ml-pipeline-service/requirements.txt .

# Utiliser le cache pip avec BuildKit
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r requirements.txt

# ===== LAYER 3: Code common (cache si common/ inchangé) =====
COPY common/ ./common/

# ===== LAYER 4: Configuration Alembic (cache si alembic.ini inchangé) =====
COPY ml-pipeline-service/alembic.ini ./

# ===== LAYER 5: Migrations Alembic (cache si migrations inchangées) =====
COPY ml-pipeline-service/alembic ./alembic

# ===== LAYER 6: Code application (rebuild seulement si app/ modifié) =====
COPY ml-pipeline-service/app ./app

# Expose the port the app runs on
EXPOSE 8082

# Default command to run the FastAPI application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8082"] 