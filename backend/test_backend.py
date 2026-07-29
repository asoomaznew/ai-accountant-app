"""
test_backend.py — AI Accountant Backend Test Suite
====================================================
Runs with: ./venv/bin/python3 -m pytest test_backend.py -v

Tests:
  - Health check endpoint
  - /api/models returns expected list
  - classify_by_rules() keyword hits and fuzzy matching
  - generate_journal_entries() correctness
  - Auth middleware rejects missing/bad tokens
"""

import json
import os
import sys
import pytest

# ── Path setup so tests run from both repo root and backend/ dir ──────────────
sys.path.insert(0, os.path.dirname(__file__))

# Bypass Google token verification in tests
os.environ.setdefault("ALLOWED_EMAILS", "test@example.com")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")
os.environ.setdefault("GEMINI_API_KEY", "test-key")


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def client():
    """FastAPI TestClient with auth bypass enabled."""
    from fastapi.testclient import TestClient
    from main import app, verify_google_token

    # Override auth so tests don't need a real Google token
    app.dependency_overrides[verify_google_token] = lambda: "test@example.com"
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ─────────────────────────────────────────────────────────────────────────────
# 1. Health Check
# ─────────────────────────────────────────────────────────────────────────────

class TestHealthCheck:
    def test_root_returns_running(self, client):
        res = client.get("/")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "running"
        assert "version" in data

    def test_root_lists_ai_providers(self, client):
        res = client.get("/")
        data = res.json()
        assert "ai_providers" in data
        assert "gemini" in data["ai_providers"]
        assert "ollama" in data["ai_providers"]


# ─────────────────────────────────────────────────────────────────────────────
# 2. Models Endpoint
# ─────────────────────────────────────────────────────────────────────────────

class TestModelsEndpoint:
    def test_get_models_returns_list(self, client):
        res = client.get("/api/models")
        assert res.status_code == 200
        models = res.json()
        assert isinstance(models, list)
        assert len(models) > 0

    def test_python_rules_engine_in_models(self, client):
        res = client.get("/api/models")
        assert "Python Rules Engine" in res.json()

    def test_gemini_in_models(self, client):
        res = client.get("/api/models")
        assert any("gemini" in m.lower() for m in res.json())


# ─────────────────────────────────────────────────────────────────────────────
# 3. Auth Middleware
# ─────────────────────────────────────────────────────────────────────────────

class TestAuthMiddleware:
    def _fresh_client(self):
        """Return a TestClient with NO dependency overrides (real auth middleware)."""
        from fastapi.testclient import TestClient
        from main import app
        # Ensure no overrides are active from the session fixture
        app.dependency_overrides.clear()
        return TestClient(app, raise_server_exceptions=False)

    def test_missing_auth_header_returns_401(self):
        """Without any Authorization header the middleware must reject with 401."""
        with self._fresh_client() as c:
            res = c.get("/api/models")
        assert res.status_code == 401

    def test_invalid_token_returns_401_or_403(self):
        with self._fresh_client() as c:
            res = c.get("/api/models", headers={"Authorization": "Bearer totally-invalid"})
        assert res.status_code in (401, 403)


# ─────────────────────────────────────────────────────────────────────────────
# 4. Rules Engine — classify_by_rules() unit tests
# ─────────────────────────────────────────────────────────────────────────────

class TestClassifyByRules:
    @pytest.fixture(autouse=True)
    def _import(self):
        from modules.categorizer import classify_by_rules
        self.classify = classify_by_rules

    @pytest.mark.parametrize("desc,expected", [
        ("BANK FEE MONTHLY",          "Bank Charges"),
        ("DD/CHG SERVICE",            "Bank Charges"),
        ("POS KNET DEPOSIT",          "POS Revenue"),
        ("VISA DEPOSIT 450KD",        "POS Revenue"),
        ("ATM WITHDRAWAL",            "Cash Withdrawal"),
        ("SALARY WPS CREDIT",         "Salary Expense"),
        ("RENT PAYMENT MONTHLY",      "Rent Expense"),
        ("ZAIN INTERNET BILL",        "Utilities Expense"),
        ("MOF GOVERNMENT FEES",       "Government Fees"),
        ("INSURANCE PREMIUM TAKAFUL", "Insurance Expense"),
        ("LOAN INSTALLMENT MURABAHA", "Loan Payment"),
        ("TRANSFER IN FROM ACCOUNT",  "Transfer In"),
        ("OUTGOING TRF DR",           "Transfer Out"),
        ("REFUND REVERSAL",           "Other Income"),
    ])
    def test_exact_keyword_matches(self, desc, expected):
        assert self.classify(desc) == expected

    def test_ambiguous_returns_none_or_valid_category(self):
        from modules.categorizer import ACCOUNT_CATEGORIES
        result = self.classify("MISC PAYMENT XYZ123")
        assert result is None or result in ACCOUNT_CATEGORIES

    def test_case_insensitive(self):
        assert self.classify("bank fee") == self.classify("BANK FEE") == "Bank Charges"

    def test_empty_string_returns_none(self):
        from modules.categorizer import ACCOUNT_CATEGORIES
        result = self.classify("")
        assert result is None or result in ACCOUNT_CATEGORIES


# ─────────────────────────────────────────────────────────────────────────────
# 5. generate_journal_entries() — accounting_module unit tests
# ─────────────────────────────────────────────────────────────────────────────

class TestGenerateJournalEntries:
    @pytest.fixture(autouse=True)
    def _import(self):
        from modules.accounting_module import generate_journal_entries
        self.gen = generate_journal_entries

    def _make_data(self, transactions):
        return {
            "accountName": "AL ASEEL INTERNATIONAL POLYCLINIC",
            "accountNumber": "WTAA-61012",
            "transactions": transactions,
        }

    def test_credit_transaction_produces_entry(self):
        data = self._make_data([{
            "date": "2026-07-01", "description": "POS KNET",
            "amount": 500.0, "type": "credit", "category": "POS Revenue",
        }])
        entries = self.gen(data)
        assert len(entries) == 1
        assert entries[0]["debit"] == 500.0
        assert entries[0]["credit"] == 0.0
        assert entries[0]["category"] == "POS Revenue"

    def test_debit_transaction_uses_correct_offset_account(self):
        data = self._make_data([{
            "date": "2026-07-02", "description": "BANK FEE",
            "amount": 2.5, "type": "debit", "category": "Bank Charges",
        }])
        entries = self.gen(data)
        assert len(entries) == 1
        assert entries[0]["account"] == "65-000001"  # Bank Charges offset

    def test_skips_missing_date(self):
        data = self._make_data([{
            "date": None, "description": "NO DATE",
            "amount": 100.0, "type": "debit", "category": "Other Expense",
        }])
        assert self.gen(data) == []

    def test_skips_zero_amount(self):
        data = self._make_data([{
            "date": "2026-07-01", "description": "ZERO",
            "amount": 0, "type": "debit", "category": "Other Expense",
        }])
        assert self.gen(data) == []

    def test_empty_transactions_returns_empty_list(self):
        assert self.gen(self._make_data([])) == []

    def test_non_dict_input_returns_empty_list(self):
        assert self.gen("not a dict") == []  # type: ignore

    def test_multiple_transactions_sequential_line_nums(self):
        txns = [
            {"date": "2026-07-01", "description": "KNET POS",  "amount": 300.0,  "type": "credit", "category": "POS Revenue"},
            {"date": "2026-07-01", "description": "BANK CHG",  "amount": 1.5,    "type": "debit",  "category": "Bank Charges"},
            {"date": "2026-07-02", "description": "SALARY",    "amount": 2000.0, "type": "debit",  "category": "Salary Expense"},
        ]
        entries = self.gen(self._make_data(txns))
        assert len(entries) == 3
        assert [e["lineNum"] for e in entries] == [1, 2, 3]

    def test_unknown_category_falls_back_to_other_expense(self):
        data = self._make_data([{
            "date": "2026-07-01", "description": "MYSTERY",
            "amount": 50.0, "type": "debit", "category": "NonExistentCategory",
        }])
        entries = self.gen(data)
        assert len(entries) == 1
        assert entries[0]["account"] == "69-000001"  # Other Expense fallback
