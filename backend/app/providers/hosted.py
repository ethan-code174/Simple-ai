"""Hosted providers (OpenAI, Anthropic, Gemini, xAI) are registered but switched off in the MVP,
which deliberately uses no hosted AI APIs. Each adapter keeps the same interface so enabling one later
means implementing `chat` and `status` here plus storing an encrypted key."""
from app.providers.base import ChatRequest, ChatResult, ModelInfo, ModelProvider, ProviderStatus
from app.services.errors import friendly


class _DisabledHostedProvider(ModelProvider):
    kind = "hosted"
    implemented = False
    suggested_models: list[str] = []

    async def chat(self, req: ChatRequest) -> ChatResult:
        raise friendly("provider_not_enabled", f"Provider '{self.id}' has no adapter implementation in this build.")

    async def status(self) -> ProviderStatus:
        return ProviderStatus(
            available=False,
            message="Not available in the MVP (no hosted AI APIs). Planned as a future adapter.",
            models=[ModelInfo(id=m, label=m, installed=False) for m in self.suggested_models],
        )


class OpenAIProvider(_DisabledHostedProvider):
    id, name = "openai", "OpenAI (GPT)"
    description = "Coming later. Needs an OpenAI API key."
    suggested_models = ["gpt-4o-mini", "gpt-4o"]


class AnthropicProvider(_DisabledHostedProvider):
    id, name = "anthropic", "Anthropic (Claude)"
    description = "Coming later. Needs an Anthropic API key."
    suggested_models = ["claude-haiku-5-5", "claude-sonnet-5-5"]


class GeminiProvider(_DisabledHostedProvider):
    id, name = "gemini", "Google (Gemini)"
    description = "Coming later. Needs a Google AI API key."
    suggested_models = ["gemini-flash"]


class XAIProvider(_DisabledHostedProvider):
    id, name = "xai", "xAI (Grok)"
    description = "Coming later. Needs an xAI API key."
    suggested_models = ["grok"]
