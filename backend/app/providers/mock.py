"""TEST-ONLY mock provider. Only registered when AIF_ENABLE_TEST_PROVIDER=true.

Its replies always start with "[TEST MOCK — not AI]" so they can never pass for real AI output.
"""
from app.providers.base import ChatRequest, ChatResult, ModelInfo, ModelProvider, ProviderStatus, estimate_tokens
from app.services.errors import FriendlyError

MOCK_PREFIX = "[TEST MOCK — not AI]"


class MockProvider(ModelProvider):
    id = "mock"
    name = "Test mock (not AI)"
    kind = "test"
    is_generative_ai = False
    description = "Deterministic fake replies for automated tests only."

    def __init__(self) -> None:
        self.calls: list[ChatRequest] = []
        self.fail_with: FriendlyError | None = None
        self.fail_times = 0

    async def chat(self, req: ChatRequest) -> ChatResult:
        self.calls.append(req)
        if self.fail_with and self.fail_times > 0:
            self.fail_times -= 1
            raise self.fail_with
        user = next((m.content for m in reversed(req.messages) if m.role == "user"), "")
        system = next((m.content for m in req.messages if m.role == "system"), "")
        doc_note = " (used documents)" if "<documents>" in system and "No relevant" not in system else ""
        text = f"{MOCK_PREFIX} Reply to: {user[:200]}{doc_note}"
        return ChatResult(text=text, provider=self.id, model=req.model,
                          prompt_tokens=estimate_tokens(system + user), completion_tokens=estimate_tokens(text))

    async def status(self) -> ProviderStatus:
        return ProviderStatus(available=True, message="Test mock enabled (not AI).",
                              models=[ModelInfo(id="mock-1", label="Mock model")])
