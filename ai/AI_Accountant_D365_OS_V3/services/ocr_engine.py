from pathlib import Path
from typing import List, Tuple
import fitz
from PIL import Image
import pytesseract
from config.settings import OUTPUT_DIR, OCR_DPI, OCR_MAX_PAGES, OCR_ENGINE, OCR_LANGS
from services.logger import log

class OcrEngine:
    def render_pdf_pages(self, pdf_path: Path) -> List[Path]:
        images = []
        try:
            doc = fitz.open(pdf_path)
            for idx in range(min(len(doc), OCR_MAX_PAGES)):
                img_path = OUTPUT_DIR / f"_ocr_{pdf_path.stem}_{idx + 1}.png"
                doc[idx].get_pixmap(dpi=OCR_DPI).save(str(img_path))
                images.append(img_path)
            doc.close()
        except Exception as e:
            log(f"PDF render for OCR failed: {e}", "ERROR")
        return images

    def cleanup(self, images: List[Path]):
        for image in images:
            try:
                image.unlink()
            except Exception:
                pass

    def tesseract(self, images: List[Path]) -> str:
        parts = []
        for i, image_path in enumerate(images, start=1):
            try:
                text = pytesseract.image_to_string(Image.open(image_path), lang=OCR_LANGS, config="--psm 6")
                if text.strip():
                    parts.append(f"\n--- TESSERACT PAGE {i} ---\n{text}")
            except Exception as e:
                log(f"Tesseract failed: {e}", "WARNING")
        return "\n".join(parts).strip()

    def easyocr(self, images: List[Path]) -> str:
        try:
            import easyocr
            langs = []
            if "eng" in OCR_LANGS:
                langs.append("en")
            if "ara" in OCR_LANGS:
                langs.append("ar")
            reader = easyocr.Reader(langs or ["en"], gpu=False)
            parts = []
            for image_path in images:
                parts.extend(reader.readtext(str(image_path), detail=0, paragraph=True))
            return "\n".join(parts).strip()
        except Exception as e:
            log(f"EasyOCR unavailable or failed: {e}", "WARNING")
            return ""

    def paddleocr(self, images: List[Path]) -> str:
        try:
            from paddleocr import PaddleOCR
            lang = "arabic" if "ara" in OCR_LANGS else "en"
            ocr = PaddleOCR(use_angle_cls=True, lang=lang, show_log=False)
            lines = []
            for image_path in images:
                result = ocr.ocr(str(image_path), cls=True)
                for block in result or []:
                    for line in block or []:
                        if len(line) >= 2:
                            lines.append(str(line[1][0]))
            return "\n".join(lines).strip()
        except Exception as e:
            log(f"PaddleOCR unavailable or failed: {e}", "WARNING")
            return ""

    def run(self, pdf_path: Path) -> Tuple[str, str]:
        images = self.render_pdf_pages(pdf_path)
        if not images:
            return "", "OCR_RENDER_FAILED"
        try:
            if OCR_ENGINE in ["auto", "paddleocr"]:
                text = self.paddleocr(images)
                if text:
                    return text, "PADDLEOCR"
            if OCR_ENGINE in ["auto", "easyocr"]:
                text = self.easyocr(images)
                if text:
                    return text, "EASYOCR"
            if OCR_ENGINE in ["auto", "tesseract"]:
                text = self.tesseract(images)
                if text:
                    return text, "TESSERACT"
            return "", "OCR_FAILED"
        finally:
            self.cleanup(images)
