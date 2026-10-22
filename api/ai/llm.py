"""Router de IA: cadena de proveedores, fallback, circuit-breaker y mock.

Punto único por el que pasa toda llamada a IA. portado del patrón de
TTRPG-AI-DM/dm/llm.py (glm → local → openai → mock).
"""
from __future__ import annotations

import json
import re
import threading
import time
from collections import deque
from datetime import datetime

from . import config, providers

_AUTO_CHAIN = ["glm", "local", "openai", "mock"]


def _ahora() -> float:
    return time.monotonic()


def _iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def parse_json(texto: str):
    limpio = (texto or "").strip()
    bloque = re.search(r"```(?:json)?\s*(.*?)```", limpio, re.DOTALL | re.IGNORECASE)
    if bloque:
        limpio = bloque.group(1).strip()
    inicio = min([i for i in (limpio.find("{"), limpio.find("[")) if i >= 0], default=-1)
    if inicio < 0:
        raise ValueError(f"sin JSON en la respuesta: {limpio[:200]!r}")
    fin = max(limpio.rfind("}"), limpio.rfind("]"))
    if fin <= inicio:
        raise ValueError(f"JSON incompleto: {limpio[:200]!r}")
    return json.loads(limpio[inicio:fin + 1])


class LLM:
    def __init__(self, force: str | None = None):
        self.force = force
        self._breaker: dict[str, dict] = {}
        self._presupuesto: deque[float] = deque()
        self._lock = threading.Lock()
        self.max_hora = config.env_int("MAX_CALLS_PER_HOUR", 900)
        self.fails_para_morir = config.env_int("LLM_FAILS_TO_DEAD", 3)
        self.muerto_segundos = config.env_int("LLM_DEAD_SECONDS", 300)

    def chain(self) -> list[str]:
        if self.force:
            return [self.force]
        elegido = (config.env("DM_PROVIDER", "auto") or "auto").strip().lower()
        if elegido and elegido != "auto":
            return [elegido]
        raw = config.env("DM_CHAIN", "") or ""
        if raw.strip():
            return [p.strip() for p in raw.split(",") if p.strip()]
        return list(_AUTO_CHAIN)

    def estado(self) -> list[dict]:
        ahora = _ahora()
        salida = []
        for nombre in self.chain():
            b = self._breaker.get(nombre, {})
            salida.append({
                "proveedor": nombre,
                "configurado": providers.configured(nombre),
                "modelo": providers.model_for(nombre, "text"),
                "muerto_hasta": max(0, int(b.get("dead_until", 0) - ahora)),
                "fallos": b.get("fails", 0),
            })
        return salida

    def _muerto(self, nombre: str) -> bool:
        b = self._breaker.get(nombre)
        return bool(b and _ahora() < b.get("dead_until", 0))

    def _fallo(self, nombre: str) -> None:
        with self._lock:
            b = self._breaker.setdefault(nombre, {"fails": 0, "dead_until": 0.0})
            b["fails"] += 1
            if b["fails"] >= self.fails_para_morir:
                b["dead_until"] = _ahora() + self.muerto_segundos
                b["fails"] = 0
                print(f"[llm] {nombre} fuera por {self.muerto_segundos}s (circuit-breaker)")

    def _exito(self, nombre: str) -> None:
        with self._lock:
            self._breaker[nombre] = {"fails": 0, "dead_until": 0.0}

    def _presupuesto_ok(self) -> bool:
        ahora = _ahora()
        with self._lock:
            while self._presupuesto and ahora - self._presupuesto[0] > 3600:
                self._presupuesto.popleft()
            if len(self._presupuesto) >= self.max_hora:
                return False
            self._presupuesto.append(ahora)
            return True

    def _mock(self, tarea: str, user: str, errores: list[str]) -> dict:
        texto = {
            "narracion": "La mesa contiene el aliento. (mock) ¿Cuál es vuestro siguiente paso?",
            "npc": "«Las palabras pesan más cuando se dicen despacio.» (mock)",
            "resumen": "Resumen (mock): la partida avanzó con los eventos registrados.",
        }.get(tarea, "ok (mock)")
        self._log({"ts": _iso(), "tarea": tarea, "proveedor": "mock", "modelo": "mock",
                   "ms": 0, "ok": True, "nota": "fallback: " + "; ".join(errores[-2:])})
        return {"texto": texto, "proveedor": "mock", "modelo": "mock",
                "latencia_ms": 0, "usage": {}}

    def chat(self, tarea: str, user: str, system: str | None = None,
             images: list[str] | None = None, json_mode: bool = False,
             temperature: float = 0.1, max_tokens: int = 500,
             proveedor: str | None = None) -> dict:
        kind = "vision" if images else "text"
        messages: list[dict] = []
        if system:
            messages.append({"role": "system", "content": system})
        if images:
            contenido: list[dict] = [{"type": "text", "text": user}]
            for b64 in images:
                contenido.append({"type": "image_url",
                                  "image_url": {"url": f"data:image/jpeg;base64,{b64}"}})
            messages.append({"role": "user", "content": contenido})
        else:
            messages.append({"role": "user", "content": user})

        cadena = [proveedor] if proveedor else self.chain()
        errores: list[str] = []
        for nombre in cadena:
            if not providers.configured(nombre):
                errores.append(f"{nombre}: no configurado")
                continue
            if self._muerto(nombre):
                errores.append(f"{nombre}: circuit-breaker")
                continue
            if nombre != "mock" and not self._presupuesto_ok():
                errores.append("presupuesto/hora agotado")
                continue
            if nombre == "mock":
                return self._mock(tarea, user, errores)
            modelo = providers.model_for(nombre, kind)
            t0 = time.perf_counter()
            try:
                res = providers.chat_completion(
                    nombre, modelo, messages, temperature=temperature,
                    max_tokens=max_tokens, json_mode=json_mode)
                latencia = int((time.perf_counter() - t0) * 1000)
                self._exito(nombre)
                res["latencia_ms"] = latencia
                self._log({"ts": _iso(), "tarea": tarea, "proveedor": nombre,
                           "modelo": modelo, "ms": latencia, "ok": True,
                           "usage": res.get("usage", {})})
                return res
            except providers.ProviderError as exc:
                latencia = int((time.perf_counter() - t0) * 1000)
                self._fallo(nombre)
                self._log({"ts": _iso(), "tarea": tarea, "proveedor": nombre,
                           "modelo": modelo, "ms": latencia, "ok": False,
                           "error": str(exc)[:300]})
                errores.append(str(exc))
        raise providers.ProviderError(
            "router", "ningún proveedor disponible: " + " | ".join(errores[-4:] or ["cadena vacía"]),
            retryable=False)

    def _log(self, registro: dict) -> None:
        ruta = config.runtime_dir() / "llm_calls.jsonl"
        try:
            with self._lock, ruta.open("a", encoding="utf-8") as f:
                f.write(json.dumps(registro, ensure_ascii=False) + "\n")
        except OSError:
            pass
