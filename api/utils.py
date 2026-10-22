"""Utilidades compartidas: JSON seguro, fechas y serialización."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Any


def loads(valor: str | None, default: Any = None) -> Any:
    if not valor:
        return default if default is not None else {}
    try:
        return json.loads(valor)
    except (TypeError, ValueError):
        return default if default is not None else {}


def dumps(valor: Any) -> str:
    return json.dumps(valor, ensure_ascii=False, default=str)


def ahora() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def hash_contexto(contexto: dict) -> str:
    crudo = json.dumps(contexto, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha1(crudo.encode("utf-8")).hexdigest()[:16]


def filtrar(datos: dict, permitidas: set[str]) -> dict:
    return {k: v for k, v in datos.items() if k in permitidas}
