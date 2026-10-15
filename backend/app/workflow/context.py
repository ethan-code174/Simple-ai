from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from app.providers.registry import ProviderRegistry

# (query, top_k) -> list of passage dicts {content, filename, page, source_label, score, ...}
KnowledgeSearcher = Callable[[str, int], Awaitable[list[dict[str, Any]]]]


@dataclass
class Limits:
    max_ai_calls: int = 5
    timeout_seconds: float = 90.0
    provider_retries: int = 2
    retry_base_delay: float = 0.5


@dataclass
class UsageItem:
    provider: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    cost_usd: float
    exact: bool = True


@dataclass
class RunContext:
    providers: ProviderRegistry
    vars: dict[str, str] = field(default_factory=dict)
    history: list[dict[str, str]] = field(default_factory=list)
    knowledge: KnowledgeSearcher | None = None
    limits: Limits = field(default_factory=Limits)
    sources: list[dict[str, Any]] = field(default_factory=list)
    usage: list[UsageItem] = field(default_factory=list)
    ai_calls: int = 0


@dataclass
class NodeResult:
    text: str = ""
    vars: dict[str, str] = field(default_factory=dict)
    branch: str | None = None  # condition: "true"/"false"
    pause: dict[str, Any] | None = None  # human approval: info for the reviewer
    message: str = ""  # one plain-English log line
    reply: str | None = None  # output blocks set the agent's reply
