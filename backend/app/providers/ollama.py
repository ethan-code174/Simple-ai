"""Ollama adapter: runs open models (Llama, Qwen, Mistral, ...) on the user's own machine. No API key."""
import httpx

from app.providers.base import ChatRequest, ChatResult, ModelInfo, ModelProvider, ProviderStatus
from app.services.errors import friendly

SUGGESTED_MODELS = [
    ("llama3.2", "Llama 3.2 3B (good default, ~2 GB)"),
    ("llama3.2:1b", "Llama 3.2 1B (fastest, ~1.3 GB)"),
    ("qwen2.5:3b", "Qwen 2.5 3B"),
    ("mistral", "Mistral 7B (stronger, ~4 GB)"),
]


class OllamaProvider(ModelProvider):
    id = "ollama"
    name = "Local model (Ollama)"
    kind = "local"
    description = "Runs a free, open AI model on your own computer through Ollama. No API key, no per-message cost."

    def __init__(self, base_url: str, timeout: float = 120.0, transport: httpx.AsyncBaseTransport | None = None):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._transport = transport

    def _client(self, timeout: float | None = None) -> httpx.AsyncClient:
        return httpx.AsyncClient(base_url=self.base_url, timeout=timeout or self.timeout, transport=self._transport)

    async def chat(self, req: ChatRequest) -> ChatResult:
        options: dict = {}
        if req.temperature is not None:
            options["temperature"] = req.temperature
        if req.max_tokens:
            options["num_predict"] = req.max_tokens
        payload = {
            "model": req.model,
            "messages": [{"role": m.role, "content": m.content} for m in req.messages],
            "stream": False,
            "options": options,
        }
        try:
            async with self._client() as client:
                resp = await client.post("/api/chat", json=payload)
        except httpx.ConnectError as e:
            raise friendly("provider_unreachable", f"Could not connect to Ollama at {self.base_url}: {e}") from e
        except httpx.TimeoutException as e:
            raise friendly("provider_timeout", f"Ollama timed out: {e}", transient=True) from e
        except httpx.HTTPError as e:
            raise friendly("provider_error", f"Ollama request failed: {e}", transient=True) from e

        if resp.status_code == 404:
            err = friendly("model_not_found", f"HTTP 404 from Ollama: {resp.text[:300]}")
            err.message = f"The AI model “{req.model}” isn't downloaded yet. Run: ollama pull {req.model}"
            raise err
        if resp.status_code >= 500:
            raise friendly("provider_error", f"HTTP {resp.status_code} from Ollama: {resp.text[:300]}", transient=True)
        if resp.status_code >= 400:
            raise friendly("provider_error", f"HTTP {resp.status_code} from Ollama: {resp.text[:300]}")
        data = resp.json()
        text = (data.get("message") or {}).get("content", "")
        return ChatResult(
            text=text,
            provider=self.id,
            model=req.model,
            prompt_tokens=int(data.get("prompt_eval_count") or 0),
            completion_tokens=int(data.get("eval_count") or 0),
        )

    async def list_installed(self) -> list[str]:
        async with self._client(timeout=3.0) as client:
            resp = await client.get("/api/tags")
            resp.raise_for_status()
            return [m["name"] for m in resp.json().get("models", [])]

    async def status(self) -> ProviderStatus:
        try:
            installed = await self.list_installed()
        except Exception as e:  # noqa: BLE001 - any failure means "not reachable"
            return ProviderStatus(
                available=False,
                message=f"Ollama isn't running at {self.base_url}. Install it from ollama.com, then run "
                f"`ollama pull llama3.2`. ({type(e).__name__})",
                models=[ModelInfo(id=m, label=label, installed=False) for m, label in SUGGESTED_MODELS],
            )
        names = set(installed)
        base_names = {n.split(":")[0] for n in names}
        models = [ModelInfo(id=n, label=n, installed=True) for n in sorted(names)]
        for m, label in SUGGESTED_MODELS:
            if m not in names and not (":" not in m and m in base_names):
                models.append(ModelInfo(id=m, label=f"{label} — not downloaded", installed=False))
        msg = "Ollama is running." if installed else "Ollama is running but no models are downloaded. Run `ollama pull llama3.2`."
        return ProviderStatus(available=bool(installed), message=msg, models=models)

    async def embed(self, model: str, texts: list[str]) -> list[list[float]]:
        async with self._client(timeout=60.0) as client:
            resp = await client.post("/api/embed", json={"model": model, "input": texts})
            resp.raise_for_status()
            return resp.json()["embeddings"]
