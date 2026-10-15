from app.config import get_settings
from app.providers.base import ModelProvider
from app.providers.hosted import AnthropicProvider, GeminiProvider, OpenAIProvider, XAIProvider
from app.providers.mock import MockProvider
from app.providers.ollama import OllamaProvider
from app.providers.quotes import QuoteFinderProvider


class ProviderRegistry:
    def __init__(self, providers: list[ModelProvider]):
        self._providers = {p.id: p for p in providers}

    def get(self, provider_id: str) -> ModelProvider | None:
        return self._providers.get(provider_id)

    def all(self) -> list[ModelProvider]:
        return list(self._providers.values())

    def ids(self) -> set[str]:
        return set(self._providers)


def build_default_registry() -> ProviderRegistry:
    s = get_settings()
    providers: list[ModelProvider] = [
        OllamaProvider(s.ollama_base_url),
        QuoteFinderProvider(),
        OpenAIProvider(),
        AnthropicProvider(),
        GeminiProvider(),
        XAIProvider(),
    ]
    if s.enable_test_provider:
        providers.append(MockProvider())
    return ProviderRegistry(providers)


_registry: ProviderRegistry | None = None


def get_registry() -> ProviderRegistry:
    global _registry
    if _registry is None:
        _registry = build_default_registry()
    return _registry


def set_registry(reg: ProviderRegistry | None) -> None:
    global _registry
    _registry = reg
