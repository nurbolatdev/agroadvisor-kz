import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import health
from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.services.model import ModelLoadError, load_model
from ml.registry import load_registry

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = app.state.settings
    try:
        app.state.predictor = load_model(settings, app.state.registry)
    except ModelLoadError as exc:
        logger.error("Model failed to load, /predict will answer 503: %s", exc)
        if settings.require_model:
            raise
    else:
        app.state.model_version = app.state.predictor.model_version
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    logging.basicConfig(level=settings.log_level)

    app = FastAPI(title="AgroAdvisor KZ AI Service", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    # An invalid registry is a configuration error: fail at startup with its message.
    app.state.registry = load_registry(settings.classes_path)
    app.state.classes_version = app.state.registry.version
    # Filled in at startup by the model loader; until then /health reports model_not_loaded.
    app.state.predictor = None
    app.state.model_version = None

    register_error_handlers(app)
    app.include_router(health.router)
    return app


app = create_app()
