import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import agents, auth, knowledge, meta, publish, runs
from app.config import get_settings
from app.services.errors import FriendlyError

logging.basicConfig(level=logging.INFO, format='{"t":"%(asctime)s","lvl":"%(levelname)s","log":"%(name)s","msg":"%(message)s"}')
log = logging.getLogger("aif.http")


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title="AI Factory API", version="0.1.0")
    app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in s.cors_origins.split(",") if o.strip()],
                       allow_credentials=False, allow_methods=["*"], allow_headers=["*"])

    @app.middleware("http")
    async def access_log(request: Request, call_next):
        t0 = time.perf_counter()
        response = await call_next(request)
        log.info("%s %s %s %dms", request.method, request.url.path, response.status_code,
                 int((time.perf_counter() - t0) * 1000))
        return response

    @app.exception_handler(FriendlyError)
    async def friendly_handler(_: Request, exc: FriendlyError):
        return JSONResponse(status_code=400, content={"detail": exc.to_dict()})

    for r in (auth.router, agents.router, runs.router, knowledge.router, publish.router, meta.router):
        app.include_router(r)
    return app


app = create_app()
