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
    "provider_unreachable": "The free AI program (Ollama) isn't running on this computer, so your AI can't think yet. Install or open Ollama, or switch to the no-AI option that answers from your documents.",
    "model_not_found": "The AI brain you picked isn't downloaded yet. Download it in Ollama first, or pick a different one.",
    "provider_auth": "The connection to the AI isn't working. Check its settings.",
    "provider_timeout": "The AI took too long to answer. Please try again.",
    "provider_not_enabled": "This AI brain isn't available yet. Pick the free one that runs on your computer.",
    "provider_error": "The AI had a problem answering. Please try again.",
    "run_timeout": "Your AI took too long to answer, so it was stopped. Please try again.",
    "ai_call_limit": "Your AI tried to think too many times for one question. Try a shorter question.",
    "cancelled": "This was stopped.",
    "invalid_workflow": "Your AI has a problem that needs fixing before it can answer. Open the steps to see what to fix.",
    "internal": "Something went wrong on our side. Please try again.",
}


def friendly(code: str, details: str = "", node_id: str | None = None, **kw: Any) -> FriendlyError:
    return FriendlyError(code=code, message=FRIENDLY_MESSAGES.get(code, FRIENDLY_MESSAGES["internal"]),
                         details=details, node_id=node_id, **kw)
