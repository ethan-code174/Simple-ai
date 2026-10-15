"""Upload -> validate -> extract -> chunk -> (optional local embeddings) -> store."""
import logging
import os
from pathlib import Path

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.config import get_settings
from app.knowledge.text import ExtractionError, chunk_text, extract_pages
from app.models import Document, DocumentChunk
from app.providers.ollama import OllamaProvider
from app.providers.registry import get_registry

log = logging.getLogger("aif.knowledge")

ALLOWED_EXT = {".pdf": "application/pdf", ".txt": "text/plain", ".md": "text/markdown", ".markdown": "text/markdown"}


def validate_upload(filename: str, data: bytes) -> str:
    """Returns the mime type, or raises ValueError with a friendly message."""
    s = get_settings()
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXT:
        raise ValueError("Only PDF, TXT and Markdown (.md) files are supported.")
    if not data:
        raise ValueError("This file is empty.")
    if len(data) > s.max_upload_mb * 1024 * 1024:
        raise ValueError(f"Files must be smaller than {s.max_upload_mb} MB.")
    return ALLOWED_EXT[ext]


def safe_filename(name: str) -> str:
    base = os.path.basename(name).replace("\x00", "")
    keep = "".join(c if c.isalnum() or c in "._- " else "_" for c in base).strip() or "document"
    return keep[:200]


async def _try_embed(texts: list[str]) -> tuple[list[list[float]] | None, str]:
    provider = get_registry().get("ollama")
    if not isinstance(provider, OllamaProvider) or not texts:
        return None, "keyword"
    model = get_settings().ollama_embed_model
    try:
        vecs = []
        for i in range(0, len(texts), 32):
            vecs += await provider.embed(model, texts[i:i + 32])
        return vecs, f"hybrid ({model})"
    except Exception as e:  # noqa: BLE001 - embeddings are optional; keyword search always works
        log.info("Local embeddings unavailable, using keyword search only: %s", type(e).__name__)
        return None, "keyword"


async def index_document(db: Session, doc: Document, data: bytes) -> Document:
    s = get_settings()
    db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == doc.id))
    try:
        pages = extract_pages(doc.filename, data)
    except ExtractionError as e:
        doc.status, doc.error, doc.chunk_count = "failed", str(e), 0
        db.commit()
        return doc
    rows: list[tuple[int | None, str]] = []
    for page, text in pages:
        for chunk in chunk_text(text, s.chunk_size, s.chunk_overlap):
            rows.append((page, chunk))
    if not rows:
        doc.status, doc.error, doc.chunk_count = "failed", "No readable text found in this file.", 0
        db.commit()
        return doc
    vectors, method = await _try_embed([c for _, c in rows])
    for i, (page, chunk) in enumerate(rows):
        db.add(DocumentChunk(document_id=doc.id, workspace_id=doc.workspace_id, agent_id=doc.agent_id, position=i,
                             page=page, content=chunk, embedding=vectors[i] if vectors else None))
    doc.status, doc.error, doc.chunk_count, doc.index_method = "ready", None, len(rows), method
    db.commit()
    return doc


def storage_path_for(workspace_id: str, doc_id: str, filename: str) -> Path:
    root = Path(get_settings().upload_dir).resolve()
    p = (root / workspace_id / f"{doc_id}_{safe_filename(filename)}").resolve()
    if root not in p.parents:
        raise ValueError("Invalid file path")
    p.parent.mkdir(parents=True, exist_ok=True)
    return p
