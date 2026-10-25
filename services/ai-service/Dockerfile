# Build context: services/ai-service
#   docker build -t agroadvisor-ai-service services/ai-service
#   docker run --rm -p 8000:8000 agroadvisor-ai-service
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /srv

# CPU-only PyTorch: the default Linux wheel brings ~2 GB of CUDA libraries the service never uses.
# Keep these specifiers in step with pyproject.toml.
RUN pip install --index-url https://download.pytorch.org/whl/cpu "torch>=2.4" "torchvision>=0.19"

# The remaining dependencies come from pyproject.toml, so there is a single list to maintain.
COPY pyproject.toml ./
RUN python -c "import tomllib; print(*tomllib.load(open('pyproject.toml', 'rb'))['project']['dependencies'], sep='\n')" > /tmp/requirements.txt \
    && pip install -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt

COPY app ./app
COPY ml/__init__.py ml/registry.py ml/classes.yaml ./ml/

RUN useradd --system --uid 10001 --no-create-home appuser
USER appuser

ENV AI_CLASSES_PATH=/srv/ml/classes.yaml

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
