from models import RouterResult, ExtractedDocument, D365JournalLine

class ConfidenceEngine:
    def score(self, router: RouterResult, extracted: ExtractedDocument, journal: D365JournalLine) -> int:
        score = 0
        score += min(router.confidence, 30)
        if extracted.amount > 0:
            score += 20
        if extracted.invoice_date or extracted.document_date:
            score += 10
        if extracted.matched_supplier:
            score += min(int(extracted.supplier_match_score / 5), 20)
        if journal.debit_amount > 0 or journal.credit_amount > 0:
            score += 10
        if journal.description:
            score += 10
        return max(0, min(100, score))
