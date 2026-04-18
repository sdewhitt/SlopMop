# SlopMop FastAPI backend — build from repository root:
#   docker build -t slopmop-api .
#
# Listens on $PORT (App Runner / ECS set this; default 8080).

FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8080

WORKDIR /app/backend

# PyTorch CPU wheels (matches backend/requirements.txt)
RUN pip install --upgrade pip

COPY backend/requirements.txt ./requirements.txt
RUN pip install --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt

# Application code (paths in main.py expect ../model_training/text_model from backend/)
COPY backend/ ./
COPY model_training/text_model/ ../model_training/text_model/

EXPOSE 8080

# App Runner injects PORT; keep default for local docker run.
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
