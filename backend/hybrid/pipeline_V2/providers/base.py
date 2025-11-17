from __future__ import annotations
from typing import Protocol, Dict, Any

from ..types import Region, ProviderResult


class Provider(Protocol):
    name: str

    def parse_region(self, region: Region, context: Dict[str, Any] | None = None) -> ProviderResult:
        ...
