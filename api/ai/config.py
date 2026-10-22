"""Configuración del router de IA: .env, modelos, rutas de runtime."""
from __future__ import annotations

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]  # api/
_MODELS: dict | None = None
_ENV_LOADED = False


def load_env(path: str | Path | None = None) -> None:
    global _ENV_LOADED
    if _ENV_LOADED and path is None:
        return
    p = Path(path) if path else ROOT / ".env"
    if p.exists():
        for linea in p.read_text(encoding="utf-8").splitlines():
            linea = linea.strip()
            if not linea or linea.startswith("#") or "=" not in linea:
                continue
            clave, valor = linea.split("=", 1)
            clave = clave.strip()
            valor = valor.strip().strip('"').strip("'")
            if clave and clave not in os.environ:
                os.environ[clave] = valor
    _ENV_LOADED = True


def env(clave: str, default: str | None = None) -> str | None:
    load_env()
    return os.environ.get(clave, default)


def env_int(clave: str, default: int) -> int:
    try:
        return int(env(clave, str(default)) or default)
    except (TypeError, ValueError):
        return default


def models() -> dict:
    global _MODELS
    if _MODELS is None:
        _MODELS = json.loads((ROOT / "ai" / "models.json").read_text(encoding="utf-8"))
    return _MODELS


def provider_cfg(nombre: str) -> dict:
    return (models().get("providers") or {}).get(nombre, {})


def runtime_dir() -> Path:
    p = Path(env("TTRPG_RUNTIME", str(ROOT / "data" / "runtime")) or ROOT / "data" / "runtime")
    p.mkdir(parents=True, exist_ok=True)
    return p
