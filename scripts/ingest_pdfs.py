#!/usr/bin/env python3
"""
LexGate Local PDF Ingestion Script
----------------------------------
Extracts text and tables from local PDF files using PyMuPDF (fitz) or Unstructured,
chunks pages cleanly, and either:
  1) Indexes into LexGate via POST /api/admin/upload-document (DEFAULT - keeps
     Parent-Child ledger, Privacy Guard ACLs, Safety Hold, Ollama nomic-embed-text
     768-dim embeddings, and Qdrant in sync), OR
  2) Embeds directly on CPU with sentence-transformers/all-MiniLM-L6-v2 (384 dims)
     and writes vectors straight to a standalone Qdrant collection.

Usage:
  python scripts/ingest_pdfs.py --dir ./pdfs --sensitivity public --effective-from 2026-01-01
  python scripts/ingest_pdfs.py --dir ./pdfs --parser unstructured --mode api
  python scripts/ingest_pdfs.py --dir ./pdfs --mode direct-qdrant --collection lexgate_minilm_384
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys
import uuid
from pathlib import Path
from typing import List, Dict, Any


def extract_with_pymupdf(pdf_path: Path) -> List[Dict[str, Any]]:
    import fitz  # PyMuPDF

    doc = fitz.open(str(pdf_path))
    pages: List[Dict[str, Any]] = []
    for page_idx, page in enumerate(doc, start=1):
        blocks: List[str] = []
        # Extract structured tables first if PyMuPDF >= 1.23 find_tables() is available
        if hasattr(page, "find_tables"):
            try:
                tables = page.find_tables()
                for tbl in tables.tables:
                    rows = tbl.extract()
                    if rows and len(rows) >= 2:
                        header = [str(c or "").replace("\n", " ").strip() for c in rows[0]]
                        md_lines = [
                            "| " + " | ".join(header) + " |",
                            "| " + " | ".join(["---"] * len(header)) + " |",
                        ]
                        for row in rows[1:]:
                            cells = [str(c or "").replace("\n", " ").strip() for c in row]
                            md_lines.append("| " + " | ".join(cells) + " |")
                        blocks.append("\n".join(md_lines))
            except Exception:
                pass

        text = page.get_text("text").strip()
        if text:
            blocks.insert(0, text)

        combined = "\n\n".join(blocks).strip()
        if combined:
            pages.append({"page_number": page_idx, "text": combined})
    doc.close()
    return pages


def extract_with_unstructured(pdf_path: Path) -> List[Dict[str, Any]]:
    from unstructured.partition.pdf import partition_pdf

    elements = partition_pdf(filename=str(pdf_path), strategy="fast")
    by_page: Dict[int, List[str]] = {}
    for el in elements:
        page_num = getattr(getattr(el, "metadata", None), "page_number", None) or 1
        txt = str(el).strip()
        if txt:
            by_page.setdefault(int(page_num), []).append(txt)

    return [
        {"page_number": p, "text": "\n\n".join(chunks)}
        for p, chunks in sorted(by_page.items())
    ]


def chunk_pages(pages: List[Dict[str, Any]], max_chars: int = 1200) -> List[Dict[str, Any]]:
    chunks: List[Dict[str, Any]] = []
    for page in pages:
        paragraphs = [p.strip() for p in page["text"].split("\n\n") if p.strip()]
        buf = ""
        for para in paragraphs:
            if len(buf) + len(para) + 2 <= max_chars:
                buf = f"{buf}\n\n{para}".strip()
            else:
                if buf:
                    chunks.append({"page_number": page["page_number"], "text": buf})
                buf = para
        if buf:
            chunks.append({"page_number": page["page_number"], "text": buf})
    return chunks


def upload_via_lexgate_api(
    api_url: str,
    pdf_path: Path,
    chunks: List[Dict[str, Any]],
    sensitivity: str,
    effective_from: str,
) -> Dict[str, Any]:
    import requests

    title = pdf_path.stem.replace("_", " ").replace("-", " ").strip()
    citation_code = pdf_path.stem.upper()[:32]
    # Join clean sections with double newlines and include explicit page numbers
    raw_text = "\n\n".join(c["text"] for c in chunks)
    pages_payload = [
        {"page_number": int(c["page_number"]), "text": c["text"]}
        for c in chunks
    ]

    resp = requests.post(
        f"{api_url.rstrip('/')}/api/admin/upload-document",
        json={
            "title": title,
            "citation_code": citation_code,
            "sensitivity": sensitivity,
            "effective_from": f"{effective_from}T00:00:00Z",
            "version_label": f"{citation_code} (Local PDF Import)",
            "raw_text": raw_text,
            "pages": pages_payload,
        },
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()["upload"]


def upsert_direct_qdrant_minilm(
    qdrant_url: str,
    collection: str,
    pdf_path: Path,
    chunks: List[Dict[str, Any]],
    sensitivity: str,
    effective_from: str,
) -> int:
    from qdrant_client import QdrantClient
    from qdrant_client.models import Distance, PointStruct, VectorParams
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer("all-MiniLM-L6-v2", device="cpu")
    raw_qdrant_key = (os.getenv("QDRANT_API_KEY") or "").strip()
    qdrant_api_key = None if raw_qdrant_key in ("", '""', "''") else raw_qdrant_key
    client = QdrantClient(url=qdrant_url, api_key=qdrant_api_key)

    existing = [c.name for c in client.get_collections().collections]
    if collection not in existing:
        client.create_collection(
            collection_name=collection,
            vectors_config=VectorParams(size=384, distance=Distance.COSINE),
        )

    allowed_groups = (
        ["public", "compliance_officer", "internal_audit"]
        if sensitivity == "public"
        else ["compliance_officer", "internal_audit"]
        if sensitivity == "compliance_officer"
        else ["internal_audit"]
    )

    from datetime import datetime, timezone

    from_ts = int(datetime.fromisoformat(f"{effective_from}T00:00:00+00:00").timestamp())
    vectors = model.encode([c["text"] for c in chunks], normalize_embeddings=True)

    points = []
    for idx, (chunk, vec) in enumerate(zip(chunks, vectors)):
        seed = f"{pdf_path.name}:{chunk['page_number']}:{idx}:{hashlib.sha256(chunk['text'].encode()).hexdigest()[:12]}"
        point_id = str(uuid.uuid5(uuid.NAMESPACE_URL, seed))
        points.append(
            PointStruct(
                id=point_id,
                vector=vec.tolist(),
                payload={
                    "doc_title": pdf_path.stem,
                    "page_number": chunk["page_number"],
                    "allowed_groups": allowed_groups,
                    "effective_from_ts": from_ts,
                    "effective_to_ts": 253402300799,
                    "text_preview": chunk["text"][:300],
                },
            )
        )

    client.upsert(collection_name=collection, points=points)
    return len(points)


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest local PDFs into LexGate / Qdrant.")
    parser.add_argument("--dir", required=True, help="Directory containing .pdf files")
    parser.add_argument("--parser", choices=["pymupdf", "unstructured"], default="pymupdf")
    parser.add_argument("--mode", choices=["api", "direct-qdrant"], default="api")
    parser.add_argument("--api-url", default="http://localhost:3000")
    parser.add_argument("--qdrant-url", default=os.getenv("QDRANT_URL", "http://localhost:6333"))
    parser.add_argument("--collection", default="lexgate_minilm_384")
    parser.add_argument(
        "--sensitivity",
        choices=["public", "compliance_officer", "internal_audit"],
        default="compliance_officer",
    )
    parser.add_argument("--effective-from", default="2026-01-01")
    args = parser.parse_args()

    pdf_dir = Path(args.dir)
    if not pdf_dir.is_dir():
        print(f"Error: {pdf_dir} is not a directory.", file=sys.stderr)
        return 1

    pdf_files = sorted(pdf_dir.glob("*.pdf"))
    if not pdf_files:
        print(f"No PDF files found in {pdf_dir}.")
        return 0

    for pdf_path in pdf_files:
        print(f"Processing {pdf_path.name} with {args.parser}...")
        pages = (
            extract_with_unstructured(pdf_path)
            if args.parser == "unstructured"
            else extract_with_pymupdf(pdf_path)
        )
        chunks = chunk_pages(pages)
        if not chunks:
            print(f"  Skipped {pdf_path.name} (no extractable text).")
            continue

        if args.mode == "api":
            res = upload_via_lexgate_api(
                args.api_url, pdf_path, chunks, args.sensitivity, args.effective_from
            )
            print(
                f"  Uploaded -> {res['title']} | {res['child_chunks_indexed']} vectors -> {res['qdrant_target']} ({res['embedding_source']})"
            )
        else:
            count = upsert_direct_qdrant_minilm(
                args.qdrant_url,
                args.collection,
                pdf_path,
                chunks,
                args.sensitivity,
                args.effective_from,
            )
            print(
                f"  Upserted {count} 384-dim all-MiniLM-L6-v2 vectors into Qdrant collection '{args.collection}'."
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
