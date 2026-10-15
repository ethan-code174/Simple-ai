"""Application settings, read from environment variables (see .env.example)."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="AIF_", extra="ignore")

    env: str = "development"
    # SQLite by default so the app runs with zero setup. Use a postgresql+psycopg URL in production.
    database_url: str = "sqlite:///./ai_factory.db"

    # Auth. "local" = built-in email/password with JWTs. "supabase" = verify Supabase-issued JWTs.
    auth_mode: str = "local"
    jwt_secret: str = "change-me-in-production-please-32-bytes-min"
    jwt_expire_minutes: int = 60 * 24 * 7
    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    # Dev convenience only: return password-reset tokens in the API response (no email is sent).
    dev_show_reset_token: bool = True

    # Key used to encrypt stored provider credentials (Fernet). Generated per-process if empty.
    encryption_key: str = ""

    cors_origins: str = "http://localhost:3000"
    public_base_url: str = "http://localhost:3000"

    # Local AI
    ollama_base_url: str = "http://localhost:11434"
    ollama_default_model: str = "llama3.2"
    ollama_embed_model: str = "nomic-embed-text"
    # Exposes a deterministic, clearly labelled mock provider. Tests / E2E only — never in production.
    enable_test_provider: bool = False

    # Execution limits
    max_nodes: int = 50
    max_edges: int = 100
    run_timeout_seconds: float = 90.0
    max_ai_calls_per_run: int = 5
    max_concurrent_runs_per_user: int = 3
    provider_retries: int = 2

    # Knowledge
    upload_dir: str = "./uploads"
    max_upload_mb: int = 10
    chunk_size: int = 800
    chunk_overlap: int = 150

    # Public endpoint rate limits (requests per minute per IP)
    public_rate_limit_per_minute: int = 20
    auth_rate_limit_per_minute: int = 15


@lru_cache
def get_settings() -> Settings:
    return Settings()
