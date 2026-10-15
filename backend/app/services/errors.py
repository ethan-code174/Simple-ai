"""Beginner-friendly errors. Every failure carries a plain-English message plus technical details."""
from dataclasses import dataclass, field
from typing import Any


@dataclass
class FriendlyError(Exception):
    code: str
    message: str  # what a beginner sees
    details: str = ""  # expandable technical info
    node_id: str | None = None
    transient: bool = False
    extra: dict[str, Any] = field(default_factory=dict)

    def __str__(self) -> str:  # pragma: no cover - debugging aid
        return f"{self.code}: {self.message} ({self.details})"

    def to_dict(self) -> dict[str, Any]:
        d = {"code": self.code, "message": self.message, "details": self.details}
        if self.node_id:
            d["node_id"] = self.node_id
        if self.extra:
            d.update(self.extra)
        return d


# Known codes -> default friendly wording. Used when wrapping unexpected exceptions too.
FRIENDLY_MESSAGES = {
    "provider_unreachable": "Your AI model isn't running. Start Ollama on this computer (or pick another model) and try again.",
    "model_not_found": "The AI model you picked isn't installed yet. Download it in Ollama first.",
    "provider_auth": "The AI connection isn't working. Check your API key.",
    "provider_timeout": "The AI took too long to answer. Try again, or use a smaller model.",
    "provider_not_enabled": "This AI provider isn't switched on in this version. The MVP runs on local models only.",
    "provider_error": "The AI model returned an error.",
    "run_timeout": "Your agent took too long to finish, so it was stopped.",
    "ai_call_limit": "Your agent tried to use the AI model too many times in one run.",
    "cancelled": "The run was cancelled.",
    "invalid_workflow": "Your workflow has problems that need fixing before it can run.",
    "internal": "Something went wrong inside AI Factory. The details below can help us fix it.",
}


def friendly(code: str, details: str = "", node_id: str | None = None, **kw: Any) -> FriendlyError:
    return FriendlyError(code=code, message=FRIENDLY_MESSAGES.get(code, FRIENDLY_MESSAGES["internal"]),
                         details=details, node_id=node_id, **kw)
