"""Módulo Adapter MiniBase (M9): integración read-only opcional y no bloqueante."""
from __future__ import annotations

import os
import uuid

import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ai import config as ai_config
from db import get_session
from events import emit
from models import Character, InventoryItem, InventorySection, MiniLink, Scene
from utils import dumps, loads

router = APIRouter(tags=["minibase"])


class MiniBaseAccion(BaseModel):
    action: str
    query: str = ""
    mini_id: str | int | None = None
    payload: dict | None = None
    destino: str = "token"  # token | item
    character_id: int | None = None
    section_id: int | None = None
    nombre: str | None = None
    emoji: str | None = None


def _cfg() -> tuple[str, str]:
    ai_config.load_env()
    url = (os.environ.get("MINIBASE_URL") or "").strip().rstrip("/")
    token = (os.environ.get("MINIBASE_TOKEN") or "").strip()
    return url, token


def _headers(token: str) -> dict:
    h = {"Accept": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _normalizar_mini(m: dict) -> dict:
    return {
        "id": m.get("id") or m.get("mini_id") or m.get("slug"),
        "nombre": m.get("nombre") or m.get("name") or m.get("title") or "Mini sin nombre",
        "tipo": m.get("tipo") or m.get("type") or "mini",
        "codigo": m.get("code_or_reference") or m.get("external_key") or m.get("slug") or "",
        "imagen": m.get("cover_url") or m.get("secure_url") or m.get("thumbnail") or m.get("image") or "",
        "lore": (m.get("lore") or m.get("descripcion") or m.get("description") or "")[:300],
    }


def _estado(session: Session) -> dict:
    url, token = _cfg()
    enlaces = session.exec(select(MiniLink).order_by(MiniLink.id.desc())).all()
    return {
        "configurado": bool(url),
        "url": url,
        "token_presente": bool(token),
        "enlaces": [{
            "id": e.id, "external_key": e.external_key, "kind": e.kind,
            "local_ref": e.local_ref, "nombre": e.nombre, "ts": e.ts,
        } for e in enlaces],
        "total_enlaces": len(enlaces),
        "table_state": _table_state(session),
        "ayuda": ("Configura MINIBASE_URL y MINIBASE_TOKEN en api/.env. "
                  "La API local de MiniBase usa el puerto 8000; esta app nunca la enciende."),
    }


def _table_state(session: Session) -> dict:
    escena = session.exec(select(Scene).where(Scene.activo == True)).first()  # noqa: E712
    tokens = loads(escena.tokens_json, []) if escena else []
    return {
        "phase": "narrativa",
        "grid_visible": True,
        "tokens": [{"nombre": t.get("nombre"), "x": t.get("x"), "y": t.get("y"),
                    "emoji": t.get("emoji")} for t in tokens],
        "escena": escena.nombre if escena else None,
    }


@router.get("/api/modules/minibase/state")
def estado_minibase(session: Session = Depends(get_session)):
    return _estado(session)


@router.post("/api/modules/minibase/action")
def accion_minibase(data: MiniBaseAccion, session: Session = Depends(get_session)):
    url, token = _cfg()

    if data.action == "probar":
        if not url:
            return {"ok": False, "error": "MINIBASE_URL no configurada", "estado": _estado(session)}
        try:
            r = requests.get(f"{url}/health", headers=_headers(token), timeout=4)
            ok = r.status_code < 400
            return {"ok": ok, "status": r.status_code,
                    "detalle": r.text[:200], "estado": _estado(session)}
        except requests.RequestException as exc:
            return {"ok": False, "error": f"MiniBase no responde: {exc}",
                    "estado": _estado(session)}

    if data.action == "buscar":
        if not url:
            return {"ok": False, "error": "MINIBASE_URL no configurada. La app local sigue funcionando.",
                    "resultados": [], "estado": _estado(session)}
        try:
            r = requests.get(f"{url}/api/minis", headers=_headers(token),
                             params={"q": data.query, "page_size": 24}, timeout=6)
            if r.status_code >= 400:
                return {"ok": False, "error": f"MiniBase HTTP {r.status_code}: {r.text[:200]}",
                        "resultados": [], "estado": _estado(session)}
            crudo = r.json()
            if isinstance(crudo, dict):
                lista = crudo.get("items") or crudo.get("minis") or crudo.get("data") or []
            else:
                lista = crudo
            resultados = [_normalizar_mini(m) for m in lista if isinstance(m, dict)]
            return {"ok": True, "resultados": resultados[:24], "estado": _estado(session)}
        except (requests.RequestException, ValueError) as exc:
            return {"ok": False, "error": f"MiniBase no disponible: {exc}",
                    "resultados": [], "estado": _estado(session)}

    if data.action == "importar":
        mini = data.payload or {}
        mini_id = data.mini_id or mini.get("id")
        if mini_id is None:
            raise HTTPException(400, "Falta el id de la miniatura")
        external_key = f"minibase:{mini_id}"
        if session.exec(select(MiniLink).where(MiniLink.external_key == external_key)).first():
            raise HTTPException(409, "Esa miniatura ya está vinculada")
        nombre = (data.nombre or mini.get("nombre") or f"Mini {mini_id}")[:80]
        emoji = (data.emoji or "🧩")[:12]
        if data.destino == "item":
            if data.section_id:
                seccion = session.get(InventorySection, data.section_id)
            else:
                seccion = None
                if data.character_id:
                    seccion = session.exec(
                        select(InventorySection).where(
                            InventorySection.character_id == data.character_id
                        ).order_by(InventorySection.orden)
                    ).first()
                if not seccion:
                    personaje = session.get(Character, data.character_id) if data.character_id else None
                    if not personaje:
                        personaje = session.exec(select(Character)).first()
                    if not personaje:
                        raise HTTPException(409, "No hay personajes para colgar el item")
                    seccion = InventorySection(character_id=int(personaje.id),
                                               nombre="Importado MiniBase", orden=99)
                    session.add(seccion)
                    session.flush()
            item = InventoryItem(
                section_id=int(seccion.id), nombre=nombre, qty=1,
                valor="", nota=(mini.get("lore") or "Importado de MiniBase")[:1000],
                icono=emoji, external_key=external_key,
            )
            session.add(item)
            session.flush()
            ref = f"item:{item.id}"
        else:
            escena = session.exec(select(Scene).where(Scene.activo == True)).first()  # noqa: E712
            if not escena:
                raise HTTPException(409, "No hay una escena activa para colocar el token")
            tokens = loads(escena.tokens_json, [])
            token_id = uuid.uuid4().hex[:10]
            tokens.append({
                "id": token_id, "nombre": nombre, "emoji": emoji, "x": 6, "y": 4,
                "color": "#f5b544", "character_id": None, "external_key": external_key,
            })
            escena.tokens_json = dumps(tokens)
            session.add(escena)
            session.flush()
            ref = f"token:{escena.id}:{token_id}"
        enlace = MiniLink(external_key=external_key, kind=data.destino, local_ref=ref,
                          nombre=nombre, payload_json=dumps(mini))
        session.add(enlace)
        session.commit()
        emit(session, "minibase", "importada", {
            "external_key": external_key, "nombre": nombre, "destino": data.destino,
        })
        return {"ok": True, "enlace": ref, "estado": _estado(session)}

    if data.action == "publicar_escena":
        if not url:
            return {"ok": False, "error": "MINIBASE_URL no configurada",
                    "estado": _estado(session)}
        estado_tablero = _table_state(session)
        try:
            r = requests.post(f"{url}/api/table/state", headers=_headers(token),
                              json=estado_tablero, timeout=6)
            ok = r.status_code < 400
            return {"ok": ok, "status": r.status_code,
                    "detalle": r.text[:200], "enviado": estado_tablero,
                    "estado": _estado(session)}
        except requests.RequestException as exc:
            return {"ok": False, "error": f"MiniBase no disponible: {exc}",
                    "estado": _estado(session)}

    raise HTTPException(400, f"Acción no soportada: {data.action}")
