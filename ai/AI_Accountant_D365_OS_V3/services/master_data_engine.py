from pathlib import Path
import pandas as pd
from rapidfuzz import process, fuzz
from config.settings import MASTER_DATA_DIR

class MasterDataEngine:
    def __init__(self):
        self.vendor_master = self._load_master("Vendor_Master.xlsx")
        self.account_master = self._load_master("Account_Master.xlsx")
        self.property_master = self._load_master("Property_Master.xlsx")
        self.clinic_master = self._load_master("Clinic_Master.xlsx")

    def _load_master(self, file_name: str) -> pd.DataFrame:
        path = MASTER_DATA_DIR / file_name
        if path.exists():
            try:
                return pd.read_excel(path, engine="openpyxl")
            except Exception:
                return pd.DataFrame()
        return pd.DataFrame()

    def match_vendor(self, supplier_name: str) -> tuple[str, float]:
        if self.vendor_master.empty or not supplier_name:
            return supplier_name or "", 0
        name_col = self._first_existing(self.vendor_master, ["Vendor Name", "Name", "Supplier", "Supplier Name"])
        account_col = self._first_existing(self.vendor_master, ["Vendor Account", "Account", "Account No", "Vendor No"])
        if not name_col:
            return supplier_name, 0
        choices = self.vendor_master[name_col].dropna().astype(str).tolist()
        result = process.extractOne(supplier_name, choices, scorer=fuzz.WRatio)
        if not result:
            return supplier_name, 0
        matched_name, score, _ = result
        if account_col:
            row = self.vendor_master[self.vendor_master[name_col].astype(str) == matched_name].head(1)
            if not row.empty:
                return str(row.iloc[0][account_col]), float(score)
        return matched_name, float(score)

    def _first_existing(self, df: pd.DataFrame, names: list[str]) -> str:
        lower = {str(c).lower().strip(): c for c in df.columns}
        for n in names:
            if n.lower() in lower:
                return lower[n.lower()]
        return ""
