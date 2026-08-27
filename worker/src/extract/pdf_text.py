"""
PDF text extraction with OCR fallback.

Strategy:
  1. Try pdfplumber (fast, works for digital/text-based PDFs)
  2. If pdfplumber yields < MIN_TEXT_LENGTH chars, fall back to Tesseract OCR
     via pytesseract + pdf2image (for scanned/image-based PDFs)
"""

import io
import logging
import tempfile
import os

import pdfplumber

logger = logging.getLogger("worker.extract.pdf_text")

# Minimum chars from pdfplumber before we try OCR
MIN_TEXT_LENGTH = 100


def _extract_with_pdfplumber(pdf_bytes: bytes) -> dict:
    """Extract text using pdfplumber (digital PDFs)."""
    pages_text: list[str] = []

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        page_count = len(pdf.pages)
        for i, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            pages_text.append(text)
            logger.debug("  pdfplumber Page %d/%d: %d chars", i + 1, page_count, len(text))

    raw_text = "\n\n".join(pages_text)
    return {
        "raw_text": raw_text,
        "page_count": page_count,
        "raw_text_length": len(raw_text),
        "method": "pdfplumber",
    }


def _extract_with_ocr(pdf_bytes: bytes) -> dict | None:
    """
    Extract text using Tesseract OCR.
    Requires: pytesseract, pdf2image, Pillow, + system Tesseract + Poppler.
    Returns None if dependencies are not available.
    """
    try:
        import pytesseract
        from pdf2image import convert_from_bytes
    except ImportError as e:
        logger.warning("OCR dependencies not available: %s. Skipping OCR fallback.", e)
        return None

    logger.info("Attempting OCR extraction (pdfplumber below threshold)")

    try:
        # Convert PDF pages to images
        images = convert_from_bytes(pdf_bytes, dpi=300)
        page_count = len(images)
        pages_text: list[str] = []

        for i, img in enumerate(images):
            text = pytesseract.image_to_string(img, lang="eng") or ""
            pages_text.append(text)
            logger.debug("  OCR Page %d/%d: %d chars", i + 1, page_count, len(text))

        raw_text = "\n\n".join(pages_text)
        logger.info("OCR extracted %d chars from %d pages", len(raw_text), page_count)

        return {
            "raw_text": raw_text,
            "page_count": page_count,
            "raw_text_length": len(raw_text),
            "method": "tesseract_ocr",
        }

    except Exception as e:
        logger.error("OCR extraction failed: %s", e)
        return None


def extract_text_from_bytes(pdf_bytes: bytes) -> dict:
    """
    Extract text from a PDF byte buffer.

    Strategy:
      1. Try pdfplumber (fast, digital PDFs)
      2. If result < MIN_TEXT_LENGTH chars, try Tesseract OCR
      3. Return whichever produced more text
    """
    logger.info("Extracting text from PDF (%d bytes)", len(pdf_bytes))

    # Step 1: pdfplumber
    result = _extract_with_pdfplumber(pdf_bytes)
    logger.info("pdfplumber extracted %d chars from %d pages",
                result["raw_text_length"], result["page_count"])

    # Step 2: If pdfplumber produced very little text, try OCR
    if result["raw_text_length"] < MIN_TEXT_LENGTH:
        logger.info("pdfplumber text below threshold (%d < %d), trying OCR",
                    result["raw_text_length"], MIN_TEXT_LENGTH)
        ocr_result = _extract_with_ocr(pdf_bytes)

        if ocr_result and ocr_result["raw_text_length"] > result["raw_text_length"]:
            logger.info("Using OCR result (%d chars vs pdfplumber %d chars)",
                       ocr_result["raw_text_length"], result["raw_text_length"])
            return ocr_result
        else:
            logger.info("OCR did not produce better results, keeping pdfplumber output")

    return result
