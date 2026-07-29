from abc import ABC, abstractmethod
from pathlib import Path
from models import RouterResult, ExtractedDocument

class BaseEngine(ABC):
    @abstractmethod
    def process(self, file_path: Path, router_result: RouterResult) -> ExtractedDocument:
        raise NotImplementedError
