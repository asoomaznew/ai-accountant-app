"""
Single source of truth for the Bahrain customer master.

Previously duplicated in both `main.py` (backend) and
`frontend/constants.ts` (BAHRAIN_CUSTOMER_MASTER). Centralising it here means
a new customer only has to be added in ONE place.

Import this from both the backend route and any future frontend sync script.
"""

# Key = unit key from the payment advice; value = {code, name} in the ledger.
BAHRAIN_CUSTOMER_MASTER: dict[str, dict[str, str]] = {
    "BHW1-C-12": {"code": "24-000033", "name": "Savon Company WLL"},
    "BHW1-C-25": {"code": "24-000032", "name": "Crown Gold W.L.L"},
    "BHW1-C-21": {"code": "24-000035", "name": "Baraka Sweets Factory"},
    "BHW1-C-9":  {"code": "24-000053", "name": "WAED INDUSTRIAL INNOVATION COMPANY W.L.L"},
}
