"""Test setup. Tests use a temporary SQLite database and the clearly labelled MockProvider
(replies start with "[TEST MOCK — not AI]") because no AI model is available in CI."""
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="aif-test-")
os.environ.update({
    # Set AIF_TEST_DATABASE_URL to run the suite against Postgres instead of SQLite.
    "AIF_DATABASE_URL": os.environ.get("AIF_TEST_DATABASE_URL", f"sqlite:///{_tmp}/test.db"),
    "AIF_ENABLE_TEST_PROVIDER": "true",
    "AIF_UPLOAD_DIR": f"{_tmp}/uploads",
    "AIF_OLLAMA_BASE_URL": "http://127.0.0.1:9",  # nothing listens here -> "Ollama not running" paths
    "AIF_JWT_SECRET": "test-secret-test-secret-test-secret-123",
})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database.session import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.providers.registry import get_registry  # noqa: E402
from app.services.rate_limit import limiter  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    limiter.reset()
    mock = get_registry().get("mock")
    mock.fail_with, mock.fail_times, mock.calls = None, 0, []
    yield


@pytest.fixture
def client():
    return TestClient(app)


def signup(client, email="beginner@example.com", password="password123"):
    r = client.post("/api/auth/signup", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture
def auth(client):
    return signup(client)


def use_mock_model(spec: dict) -> dict:
    for n in spec["nodes"]:
        if n["type"] == "ai_model":
            n["config"]["provider"], n["config"]["model"] = "mock", "mock-1"
    return spec
