import logging

from fastapi import FastAPI

from app.api import health
from app.core.config import get_settings
from app.core.errors import register_error_handlers


def create_app() -> FastAPI:
    settings = get_settings()
    logging.basicConfig(level=settings.log_level)

    app = FastAPI(title="AgroAdvisor KZ AI Service", version="0.1.0")
    # Filled in by the model loader; until then /health reports model_not_loaded.
    app.state.model_version = None
    app.state.classes_version = None

    register_error_handlers(app)
    app.include_router(health.router)
    return app


app = create_app()
