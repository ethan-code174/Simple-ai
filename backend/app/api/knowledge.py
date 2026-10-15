from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_agent_or_404, iso
from app.auth.security import get_workspace
from app.config import get_settings
from app.database import get_db
from app.knowledge.ingest import index_document, safe_filename, storage_path_for, validate_upload
from app.knowledge.search import search_chunks
from app.models import Document, Workspace
from app.schemas import SearchIn
from app.services.plans import get_plan

router = APIRouter(prefix="/api", tags=["knowledge"])


def doc_out(d: Document) -> dict:
    return {"id": d.id, "filename": d.filename, "size_bytes": d.size_bytes, "status": d.status, "error": d.error,
            "chunk_count": d.chunk_count, "index_method": d.index_method, "created_at": iso(d.created_at)}


def _get_doc(db: Session, ws: Workspace, doc_id: str) -> Document:
    d = db.scalar(select(Document).where(Document.id == doc_id, Document.workspace_id == ws.id))
    if not d:
        raise HTTPException(404, "Document not found.")
    return d


@router.get("/agents/{agent_id}/documents")
def list_documents(agent_id: str, ws: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    get_agent_or_404(db, ws, agent_id)
    docs = db.scalars(select(Document).where(Document.agent_id == agent_id, Document.workspace_id == ws.id)
                      .order_by(Document.created_at.desc())).all()
    return [doc_out(d) for d in docs]


@router.post("/agents/{agent_id}/documents")
async def upload_document(agent_id: str, file: UploadFile = File(...), ws: Workspace = Depends(get_workspace),
                          db: Session = Depends(get_db)):
    get_agent_or_404(db, ws, agent_id)
    plan = get_plan(ws.plan)
    count = db.scalar(select(func.count(Document.id)).where(Document.workspace_id == ws.id)) or 0
    if count >= plan.max_documents:
        raise HTTPException(402, f"The {plan.name} plan allows {plan.max_documents} documents.")
    limit = get_settings().max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    name = safe_filename(file.filename or "document.txt")
    try:
        mime = validate_upload(name, data)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    doc = Document(workspace_id=ws.id, agent_id=agent_id, filename=name, mime=mime, size_bytes=len(data),
                   storage_path="")
    db.add(doc)
    db.flush()
    path = storage_path_for(ws.id, doc.id, name)
    path.write_bytes(data)
    doc.storage_path = str(path)
    db.commit()
    await index_document(db, doc, data)
    return doc_out(doc)


@router.delete("/documents/{doc_id}")
def delete_document(doc_id: str, ws: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    d = _get_doc(db, ws, doc_id)
    from pathlib import Path

    try:
        Path(d.storage_path).unlink(missing_ok=True)
    except OSError:
        pass
    db.delete(d)
    db.commit()
    return {"ok": True}


@router.post("/documents/{doc_id}/reindex")
async def reindex_document(doc_id: str, ws: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    from pathlib import Path

    d = _get_doc(db, ws, doc_id)
    try:
        data = Path(d.storage_path).read_bytes()
    except OSError as e:
        raise HTTPException(410, "The original file is missing. Please upload it again.") from e
    await index_document(db, d, data)
    return doc_out(d)


@router.post("/agents/{agent_id}/knowledge/search")
def search(agent_id: str, body: SearchIn, ws: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    get_agent_or_404(db, ws, agent_id)
    return [p.to_dict() for p in search_chunks(db, ws.id, agent_id, body.query, 5)]
