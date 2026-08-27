"""
OCR pipeline for document text extraction.

Strategy: Text-first, OCR fallback.
1. Try pdfplumber (fast, accurate for text-based PDFs)
2. If text is empty/minimal, fall back to OCR via pdf2image + pytesseract
3. Return extracted text with metadata about which method was used

This ensures both text-based (PSIC) and image-based (Bamboo, Aegis) PDFs
are handled reliably.
"""

import io
import logging
from typing import TypedDict

logger = logging.getLogger("worker.documents.ocr")

# Minimum chars to consider a PDF "text-extractable"
MIN_TEXT_CHARS = 50

# Max pages to OCR — prevents OOM on large binders
MAX_OCR_PAGES = 10

# OCR DPI — 200 is sufficient for clean text, 300 causes OOM on small servers
OCR_DPI = 200


class ExtractionResult(TypedDict):
    raw_text: str
    method: str        # "pdfplumber" | "ocr_tesseract" | "pdfplumber+ocr"
    page_count: int
    raw_text_length: int
    ocr_confidence: float | None


def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> ExtractionResult:
    """
    Extract text from a PDF, using pdfplumber first with OCR fallback.
    
    Returns an ExtractionResult with the raw text and extraction metadata.
    Raises RuntimeError if both methods fail to produce any text.
    """
    import pdfplumber

    # Step 1: Try pdfplumber (text layer extraction)
    text_pages: list[str] = []
    page_count = 0

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            page_count = len(pdf.pages)
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                text_pages.append(page_text)
    except Exception as e:
        logger.warning("pdfplumber failed: %s — will attempt OCR", e)

    combined_text = "\n\n".join(text_pages).strip()

    if len(combined_text) >= MIN_TEXT_CHARS:
        logger.info(
            "pdfplumber extracted %d chars from %d pages",
            len(combined_text), page_count,
        )
        return ExtractionResult(
            raw_text=combined_text,
            method="pdfplumber",
            page_count=page_count,
            raw_text_length=len(combined_text),
            ocr_confidence=None,
        )

    # Step 2: Fallback to OCR
    logger.info(
        "pdfplumber produced only %d chars — falling back to OCR",
        len(combined_text),
    )
    return _extract_with_ocr(pdf_bytes, page_count)


def _extract_with_ocr(pdf_bytes: bytes, fallback_page_count: int) -> ExtractionResult:
    """
    OCR extraction using pdf2image + pytesseract.
    
    Converts each PDF page to an image, then runs Tesseract OCR.
    Returns combined text from all pages.
    
    Memory-safe: limits to MAX_OCR_PAGES and uses OCR_DPI to avoid OOM.
    """
    try:
        from pdf2image import convert_from_bytes
        import pytesseract
        from PIL import Image
    except ImportError as e:
        raise RuntimeError(
            f"OCR dependencies not installed. Run: pip install pdf2image pytesseract Pillow. "
            f"Also install Tesseract OCR system package. Error: {e}"
        )

    try:
        # Convert PDF pages to images (200 DPI to avoid OOM on small servers)
        logger.info("Converting PDF to images for OCR (%d DPI, max %d pages)...", OCR_DPI, MAX_OCR_PAGES)
        images: list[Image.Image] = convert_from_bytes(
            pdf_bytes, dpi=OCR_DPI, last_page=MAX_OCR_PAGES,
        )
        page_count = len(images)
        logger.info("Converted %d pages to images", page_count)

        ocr_pages: list[str] = []
        confidences: list[float] = []

        for i, img in enumerate(images):
            # Run Tesseract with detailed output for confidence scoring
            try:
                data = pytesseract.image_to_data(
                    img, output_type=pytesseract.Output.DICT, lang="eng"
                )
                
                # Extract text
                page_text = pytesseract.image_to_string(img, lang="eng")
                ocr_pages.append(page_text.strip())
                
                # Calculate average confidence for this page
                page_confs = [
                    int(c) for c in data.get("conf", [])
                    if str(c).lstrip("-").isdigit() and int(c) > 0
                ]
                if page_confs:
                    avg_conf = sum(page_confs) / len(page_confs)
                    confidences.append(avg_conf)
                    logger.info(
                        "OCR page %d: %d chars, avg confidence %.1f%%",
                        i + 1, len(page_text), avg_conf,
                    )
                else:
                    logger.warning("OCR page %d: no confidence data", i + 1)

            except Exception as page_err:
                logger.error("OCR failed on page %d: %s", i + 1, page_err)
                ocr_pages.append("")
            finally:
                # Free memory immediately after processing each page
                img.close()

        combined_text = "\n\n".join(ocr_pages).strip()
        avg_confidence = (
            sum(confidences) / len(confidences) if confidences else 0.0
        )

        if not combined_text or len(combined_text) < MIN_TEXT_CHARS:
            raise RuntimeError(
                f"OCR produced insufficient text ({len(combined_text)} chars) "
                f"from {page_count} pages. The PDF may be unreadable."
            )

        logger.info(
            "OCR extracted %d chars from %d pages (avg confidence: %.1f%%)",
            len(combined_text), page_count, avg_confidence,
        )

        return ExtractionResult(
            raw_text=combined_text,
            method="ocr_tesseract",
            page_count=page_count,
            raw_text_length=len(combined_text),
            ocr_confidence=round(avg_confidence, 2),
        )

    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"OCR extraction failed: {e}")

