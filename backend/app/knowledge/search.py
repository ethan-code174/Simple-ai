"""Knowledge search. Default: BM25 keyword ranking (fully local, no model needed).
When chunks were embedded with a local Ollama embedding model, scores are blended with cosine
similarity (hybrid semantic search). Results are always scoped to one workspace + agent."""
import math
from collections import Counter
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.knowledge.text import STOPWORDS, tokenize
from app.models import Document, DocumentChunk


@dataclass
class Passage:
    chunk_id: str
    document_id: str
    filename: str
    page: int | None
    content: str
    score: float

    @property
    def source_label(self) -> str:
        return f"{self.filename}, page {self.page}" if self.page else self.filename

    def to_dict(self) -> dict:
        return {"chunk_id": self.chunk_id, "document_id": self.document_id, "filename": self.filename,
                "page": self.page, "content": self.content, "score": round(self.score, 4),
                "source_label": self.source_label}


def bm25_rank(query: str, docs: list[str], k1: float = 1.5, b: float = 0.75) -> list[float]:
    q = [t for t in tokenize(query) if t not in STOPWORDS] or tokenize(query)
    toks = [tokenize(d) for d in docs]
    n = len(docs)
    if not n or not q:
        return [0.0] * n
    avgdl = sum(len(t) for t in toks) / n or 1
    df = Counter()
    for t in toks:
        df.update(set(t))
    scores = []
    for t in toks:
        tf = Counter(t)
        s = 0.0
        for term in set(q):
            if term not in tf:
                continue
            idf = math.log(1 + (n - df[term] + 0.5) / (df[term] + 0.5))
            s += idf * tf[term] * (k1 + 1) / (tf[term] + k1 * (1 - b + b * len(t) / avgdl))
        scores.append(s)
    return scores


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def search_chunks(db: Session, workspace_id: str, agent_id: str, query: str, top_k: int = 4,
                  query_embedding: list[float] | None = None) -> list[Passage]:
    rows = db.execute(
        select(DocumentChunk, Document.filename)
        .join(Document, Document.id == DocumentChunk.document_id)
        .where(DocumentChunk.workspace_id == workspace_id, DocumentChunk.agent_id == agent_id,
               Document.workspace_id == workspace_id, Document.status == "ready")
    ).all()
    if not rows:
        return []
    contents = [c.content for c, _ in rows]
    kw = bm25_rank(query, contents)
    top_kw = max(kw) or 1.0
    scored = []
    for (chunk, filename), k in zip(rows, kw):
        score = k / top_kw if top_kw else 0.0
        if query_embedding and chunk.embedding:
            score = 0.5 * score + 0.5 * max(0.0, _cosine(query_embedding, chunk.embedding))
        if k > 0 or (query_embedding and chunk.embedding):
            scored.append(Passage(chunk.id, chunk.document_id, filename, chunk.page, chunk.content, score))
    scored.sort(key=lambda p: p.score, reverse=True)
    return [p for p in scored[:top_k] if p.score > 0.05]
