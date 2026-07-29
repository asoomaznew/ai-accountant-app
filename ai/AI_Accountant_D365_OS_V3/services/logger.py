from datetime import datetime
from config.settings import LOG_DIR

def log(message: str, level: str = "INFO"):
    line = f"[{datetime.now():%Y-%m-%d %H:%M:%S}] [{level}] {message}"
    print(line)
    with open(LOG_DIR / f"run_{datetime.now():%Y%m%d}.log", "a", encoding="utf-8") as f:
        f.write(line + "\n")
