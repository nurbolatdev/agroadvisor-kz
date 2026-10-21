import logging

from fastapi import FastAPI

from app.api import health
from app.core.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    logging.basicConfig(level=settings.log_level)

    app = FastAPI(title="AgroAdvisor KZ AI Service", version="0.1.0")
    # Filled in by the model loader; until then /health reports model_not_loaded.
    app.state.model_version = None
    app.state.classes_version = None

    app.include_router(health.router)
    return app


app = create_app()
