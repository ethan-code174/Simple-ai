"""Document Quote Finder: a deterministic, NON-AI responder.

It replies with the sentences from the user's uploaded documents that best match the question, with
their source. It never generates new text, so it can't make things up, but it also can't hold a
conversation. It is labelled as "not AI" everywhere in the UI so nobody mistakes it for a model.
"""
import re

from app.knowledge.text import STOPWORDS, tokenize
from app.providers.base import ChatRequest, ChatResult, ModelInfo, ModelProvider, ProviderStatus, estimate_tokens

NO_MATCH = (
    "I couldn't find anything about that in the documents I have. "
    "Please contact the business directly and a person will help you."
)


class QuoteFinderProvider(ModelProvider):
    id = "quotes"
    name = "Document Quote Finder (no AI)"
    kind = "rule"
    is_generative_ai = False
    description = (
        "Not an AI model. Replies by quoting the most relevant sentences from your uploaded documents. "
        "Works with nothing installed, never invents facts, but can't chat or follow instructions."
    )

    async def chat(self, req: ChatRequest) -> ChatResult:
        question = next((m.content for m in reversed(req.messages) if m.role == "user"), "")
        q_terms = {t for t in tokenize(question) if t not in STOPWORDS}
        scored: list[tuple[float, str, str]] = []
        for p in req.context_passages:
            for sent in re.split(r"(?<=[.!?])\s+|\n+", p.get("content", "")):
                sent = sent.strip()
                if len(sent) < 12:
                    continue
                s_terms = set(tokenize(sent))
                overlap = len(q_terms & s_terms)
                if overlap:
                    scored.append((overlap / (1 + len(s_terms) ** 0.5), sent, p.get("source_label", "")))
        scored.sort(key=lambda x: x[0], reverse=True)
        picked, seen = [], set()
        for _, sent, label in scored:
            if sent in seen:
                continue
            seen.add(sent)
            picked.append(f"“{sent}” ({label})" if label else f"“{sent}”")
            if len(picked) == 3:
                break
        text = ("Here's what I found in our documents:\n\n" + "\n\n".join(picked)) if picked else NO_MATCH
        prompt_text = " ".join(m.content for m in req.messages)
        return ChatResult(text=text, provider=self.id, model="quote-finder",
                          prompt_tokens=estimate_tokens(prompt_text), completion_tokens=estimate_tokens(text),
                          usage_exact=False)

    async def status(self) -> ProviderStatus:
        return ProviderStatus(available=True, message="Always available. Not generative AI.",
                              models=[ModelInfo(id="quote-finder", label="Quote Finder", supports_temperature=False)])
