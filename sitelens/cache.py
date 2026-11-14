"""Shared first-page PDF extraction."""
from functools import lru_cache
from pathlib import Path


def pdf_text(path: Path):
    path = path.resolve()
    stat = path.stat()
    return _pdf_text(path, stat.st_size, stat.st_mtime_ns)


@lru_cache(maxsize=32)
def _pdf_text(path, size, modified):
    import pymupdf

    with pymupdf.open(path) as doc:
        page = doc[0]
        text = page.get_textpage()
        return (text.extractText(), tuple(map(tuple, text.extractWORDS())),
                tuple(page.rotation_matrix))
