"""Text extraction, chunking and tokenising for the knowledge system."""
import io
import re

STOPWORDS = frozenset(
    """a an the and or but if then else of to in on at for from by with about as is are was were be been
    being do does did have has had i you he she it we they me my your our their this that these those what
    which who whom whose when where why how can could would should will shall may might must not no yes so
    than too very just also any all some there here into out up down over under again more most such own
    same other only its it's i'm you're don't please hi hello thanks thank tell know get got let""".split()
)

_TOKEN = re.compile(r"[a-z0-9]+(?:'[a-z]+)?")


def tokenize(text: str) -> list[str]:
    return [_stem(t) for t in _TOKEN.findall(text.lower())]


def _stem(t: str) -> str:
    # Tiny suffix stripper so "hours"/"hour" and "booking"/"book" match. Deliberately conservative.
    for suf in ("ing", "ies", "es", "s"):
        if len(t) > len(suf) + 2 and t.endswith(suf):
            return t[: -len(suf)] + ("y" if suf == "ies" else "")
    return t


class ExtractionError(Exception):
    pass


def extract_pages(filename: str, data: bytes) -> list[tuple[int | None, str]]:
    """Returns [(page_number_or_None, text)]."""
    name = filename.lower()
    if name.endswith(".pdf"):
        if not data.startswith(b"%PDF"):
            raise ExtractionError("This file doesn't look like a real PDF.")
        from pypdf import PdfReader

        try:
            reader = PdfReader(io.BytesIO(data))
            pages = [(i + 1, (p.extract_text() or "")) for i, p in enumerate(reader.pages)]
        except Exception as e:  # noqa: BLE001
            raise ExtractionError(f"Couldn't read this PDF ({type(e).__name__}).") from e
        if not any(t.strip() for _, t in pages):
            raise ExtractionError("This PDF has no selectable text (it may be a scanned image). OCR isn't supported yet.")
        return pages
    if name.endswith((".txt", ".md", ".markdown")):
        if b"\x00" in data[:4096]:
            raise ExtractionError("This file looks like a binary file, not text.")
        for enc in ("utf-8", "utf-16", "latin-1"):
            try:
                return [(None, data.decode(enc))]
            except UnicodeDecodeError:
                continue
        raise ExtractionError("Couldn't decode this text file.")
    raise ExtractionError("Only PDF, TXT and Markdown files are supported.")


def chunk_text(text: str, size: int = 800, overlap: int = 150) -> list[str]:
    """Split on paragraph boundaries, packing paragraphs into ~size-char chunks with overlap."""
    text = re.sub(r"\r\n?", "\n", text)
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[str] = []
    cur = ""
    for p in paras:
        while len(p) > size:  # hard-split very long paragraphs
            cut = p.rfind(" ", 0, size)
            cut = cut if cut > size // 2 else size
            pieces = (cur + "\n\n" + p[:cut]).strip() if cur else p[:cut]
            chunks.append(pieces)
            cur = ""
            p = p[max(0, cut - overlap):].strip()
        if len(cur) + len(p) + 2 <= size:
            cur = (cur + "\n\n" + p).strip()
        else:
            if cur:
                chunks.append(cur)
            tail = cur[-overlap:] if overlap and cur else ""
            tail = tail[tail.find(" ") + 1:] if " " in tail else tail
            cur = (tail + "\n\n" + p).strip() if tail else p
    if cur:
        chunks.append(cur)
    return chunks
