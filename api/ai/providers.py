"""Proveedores OpenAI-compatibles: GLM (gratis), Ollama (local), OpenAI, mock."""
from __future__ import annotations

import json
import time
from typing import Any

import requests

from . import config


class ProviderError(RuntimeError):
    def __init__(self, proveedor: str, mensaje: str, retryable: bool = True):
        super().__init__(f"[{proveedor}] {mensaje}")
        self.provider = proveedor
        self.retryable = retryable


_BASE_ENV = {"glm": "ZAI_BASE_URL", "local": "OLLAMA_BASE_URL", "openai": "OPENAI_BASE_URL"}
_MODEL_ENV = {
    ("glm", "vision"): "GLM_VISION_MODEL",
    ("glm", "text"): "GLM_TEXT_MODEL",
    ("local", "vision"): "LOCAL_VISION_MODEL",
    ("local", "text"): "LOCAL_TEXT_MODEL",
    ("openai", "vision"): "OPENAI_VISION_MODEL",
    ("openai", "text"): "OPENAI_TEXT_MODEL",
}


def base_url(nombre: str) -> str | None:
    cfg = config.provider_cfg(nombre)
    return config.env(_BASE_ENV.get(nombre, f"{nombre.upper()}_BASE_URL"), cfg.get("base_url")) or None


def model_for(nombre: str, kind: str = "text") -> str:
    cfg = config.provider_cfg(nombre)
    override = config.env(_MODEL_ENV.get((nombre, kind), ""), "")
    if override:
        return override
    if kind == "vision":
        return cfg.get("vision") or cfg.get("text") or "modelo-desconocido"
    return cfg.get("text") or cfg.get("vision") or "modelo-desconocido"


def api_key(nombre: str) -> str | None:
    cfg = config.provider_cfg(nombre)
    key_env = cfg.get("key_env")
    return config.env(key_env, "") if key_env else None


def configured(nombre: str) -> bool:
    if nombre == "mock":
        return True
    if nombre not in (config.models().get("providers") or {}):
        return False
    if nombre == "local":
        return bool(base_url(nombre))
    return bool(api_key(nombre))


def _post(nombre: str, url: str, headers: dict, payload: dict, timeout_s: float) -> dict:
    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=timeout_s)
    except requests.RequestException as exc:
        raise ProviderError(nombre, f"sin conexión: {exc}", retryable=True) from exc
    if resp.status_code >= 400:
        detalle = resp.text[:400].replace("\n", " ")
        retryable = resp.status_code == 429 or resp.status_code >= 500
        raise ProviderError(nombre, f"HTTP {resp.status_code}: {detalle}", retryable=retryable)
    try:
        return resp.json()
    except ValueError as exc:
        raise ProviderError(nombre, "respuesta no JSON", retryable=False) from exc


def chat_completion(nombre: str, model: str, messages: list[dict], temperature: float = 0.1,
                    max_tokens: int = 500, json_mode: bool = False,
                    timeout_s: float | None = None) -> dict:
    if nombre == "mock":
        raise ProviderError(nombre, "mock se resuelve dentro de llm.py", retryable=False)
    base = base_url(nombre)
    if not base:
        raise ProviderError(nombre, "sin base_url configurada", retryable=False)
    cfg = config.provider_cfg(nombre)
    timeout = float(timeout_s or cfg.get("timeout_s", 30))
    headers = {"Content-Type": "application/json"}
    key = api_key(nombre)
    if key:
        headers["Authorization"] = f"Bearer {key}"
    payload: dict[str, Any] = {
        "model": model, "messages": messages, "temperature": temperature,
        "max_tokens": max_tokens, "stream": False,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    t0 = time.perf_counter()
    try:
        data = _post(nombre, base.rstrip("/") + "/chat/completions", headers, payload, timeout)
    except ProviderError as exc:
        if json_mode and "response_format" in str(exc).lower():
            payload.pop("response_format", None)
            data = _post(nombre, base.rstrip("/") + "/chat/completions", headers, payload, timeout)
        else:
            raise
    latencia_ms = int((time.perf_counter() - t0) * 1000)

    try:
        contenido = data["choices"][0]["message"].get("content", "")
    except (KeyError, IndexError, TypeError) as exc:
        raise ProviderError(nombre, f"respuesta inesperada: {json.dumps(data)[:300]}",
                            retryable=False) from exc
    if isinstance(contenido, list):
        contenido = "".join(part.get("text", "") for part in contenido if isinstance(part, dict))
    return {
        "texto": contenido if isinstance(contenido, str) else str(contenido),
        "modelo": model, "proveedor": nombre, "latencia_ms": latencia_ms,
        "usage": data.get("usage") or {},
    }


def health(nombre: str) -> dict:
    t0 = time.perf_counter()
    if nombre == "mock":
        return {"provider": "mock", "ok": True, "detalle": "siempre disponible (demo/CI)", "ms": 0}
    if not configured(nombre):
        motivo = "sin clave " + str(config.provider_cfg(nombre).get("key_env") or "")
        return {"provider": nombre, "ok": False, "detalle": motivo.strip(), "ms": 0}
    if nombre == "local":
        base = (base_url("local") or "").rstrip("/")
        root = base[:-3] if base.endswith("/v1") else base
        try:
            r = requests.get(root + "/api/tags", timeout=3)
            r.raise_for_status()
            modelos = [m.get("name", "?") for m in (r.json().get("models") or [])]
            return {"provider": nombre, "ok": True,
                    "detalle": f"ollama OK ({len(modelos)} modelos)",
                    "ms": int((time.perf_counter() - t0) * 1000)}
        except requests.RequestException as exc:
            return {"provider": nombre, "ok": False, "detalle": f"ollama no responde: {exc}"[:180],
                    "ms": int((time.perf_counter() - t0) * 1000)}
    try:
        chat_completion(nombre, model_for(nombre, "text"),
                        [{"role": "user", "content": "Responde solo: OK"}],
                        max_tokens=2, json_mode=False, timeout_s=10)
        return {"provider": nombre, "ok": True, "detalle": "completions OK",
                "ms": int((time.perf_counter() - t0) * 1000)}
    except ProviderError as exc:
        return {"provider": nombre, "ok": False, "detalle": str(exc)[:180],
                "ms": int((time.perf_counter() - t0) * 1000)}
