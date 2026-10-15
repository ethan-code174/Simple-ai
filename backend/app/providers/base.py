"""Model-provider interface. Every provider (local or hosted) implements the same methods so the
engine never cares which one it's talking to."""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ChatMessage:
    role: str  # system | user | assistant
    content: str


@dataclass
class ChatRequest:
    model: str
    messages: list[ChatMessage]
    temperature: float | None = None
    max_tokens: int | None = None
    # Retrieved document passages, for providers that work directly from sources.
    context_passages: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class ChatResult:
    text: str
    provider: str
    model: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    # True when tokens are exact counts from the provider, False when estimated.
    usage_exact: bool = True


@dataclass
class ModelInfo:
    id: str
    label: str
    installed: bool = True
    supports_temperature: bool = True
    max_output_tokens: int = 4096


@dataclass
class ProviderStatus:
    available: bool
    message: str
    models: list[ModelInfo] = field(default_factory=list)


class ModelProvider(ABC):
    id: str = ""
    name: str = ""
    kind: str = "local"  # local | hosted | rule | test
    is_generative_ai: bool = True
    implemented: bool = True
    description: str = ""
    # USD per 1K tokens, per model. Missing = 0 (local models cost nothing per call).
    pricing: dict[str, tuple[float, float]] = {}

    @abstractmethod
    async def chat(self, req: ChatRequest) -> ChatResult: ...

    @abstractmethod
    async def status(self) -> ProviderStatus: ...

    def estimate_cost(self, model: str, prompt_tokens: int, completion_tokens: int) -> float:
        p_in, p_out = self.pricing.get(model, (0.0, 0.0))
        return round(prompt_tokens / 1000 * p_in + completion_tokens / 1000 * p_out, 6)

    def describe(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "kind": self.kind,
            "is_generative_ai": self.is_generative_ai,
            "implemented": self.implemented,
            "description": self.description,
        }


def estimate_tokens(text: str) -> int:
    """Rough token estimate (~4 chars/token) used only when a provider doesn't report usage."""
    return max(1, len(text) // 4)
