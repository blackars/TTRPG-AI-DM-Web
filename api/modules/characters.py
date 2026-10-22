"""Módulo Personajes y criaturas: fichas editables + envío al tablero."""
from __future__ import annotations

import random
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from db import get_session
from events import emit
from models import Character, InventoryItem, InventorySection, Scene
from serializers import character_dict
from utils import dumps, loads

router = APIRouter(tags=["personajes"])


class PersonajeAccion(BaseModel):
    action: str
    id: int | None = None
    nombre: str | None = None
    kind: str | None = None
    emoji: str | None = None
    hp: int | None = None
    hp_max: int | None = None
    notas: str | None = None
    stats: dict | None = None


def _personaje(session: Session, pid: int | None) -> Character:
    if pid is None:
        raise HTTPException(400, "Falta id")
    p = session.get(Character, pid)
    if not p:
        raise HTTPException(404, "Personaje no encontrado")
    return p


def _estado(session: Session) -> dict:
    personajes = session.exec(select(Character).order_by(Character.kind, Character.nombre)).all()
    escena = session.exec(select(Scene).where(Scene.activo == True)).first()  # noqa: E712
    tokens = loads(escena.tokens_json, []) if escena else []
    en_escena = {t.get("character_id") for t in tokens}
    return {
        "personajes": [character_dict(p) | {"en_escena": p.id in en_escena} for p in personajes],
        "escena_activa": {"id": escena.id, "nombre": escena.nombre} if escena else None,
    }


@router.get("/api/modules/personajes/state")
def estado_personajes(session: Session = Depends(get_session)):
    return _estado(session)


@router.post("/api/modules/personajes/action")
def accion_personajes(data: PersonajeAccion, session: Session = Depends(get_session)):
    accion = data.action

    if accion == "crear":
        nombre = (data.nombre or "").strip()
        if not nombre:
            raise HTTPException(400, "El nombre es obligatorio")
        kind = data.kind if data.kind in ("personaje", "criatura") else "personaje"
        hp_max = max(1, int(data.hp_max or 10))
        hp = max(0, min(hp_max, int(data.hp if data.hp is not None else hp_max)))
        p = Character(nombre=nombre[:80], kind=kind, emoji=(data.emoji or "🧙")[:12],
                      hp=hp, hp_max=hp_max, notas=(data.notas or "")[:2000],
                      stats_json=dumps(data.stats or {}))
        session.add(p)
        session.commit()
        session.refresh(p)
        emit(session, "personajes", "creado", {"id": p.id, "nombre": p.nombre, "kind": p.kind})
        return _estado(session)

    if accion == "editar":
        p = _personaje(session, data.id)
        if data.nombre is not None:
            if not data.nombre.strip():
                raise HTTPException(400, "El nombre no puede estar vacío")
            p.nombre = data.nombre.strip()[:80]
        if data.kind in ("personaje", "criatura"):
            p.kind = data.kind
        if data.emoji is not None:
            p.emoji = data.emoji[:12] or "🧙"
        if data.hp_max is not None:
            p.hp_max = max(1, int(data.hp_max))
        if data.hp is not None:
            p.hp = max(0, min(p.hp_max, int(data.hp)))
        else:
            p.hp = min(p.hp, p.hp_max)
        if data.notas is not None:
            p.notas = data.notas[:2000]
        if data.stats is not None:
            p.stats_json = dumps(data.stats)
        session.add(p)
        session.commit()
        emit(session, "personajes", "editado", {"id": p.id, "nombre": p.nombre, "hp": p.hp})
        return _estado(session)

    if accion == "borrar":
        p = _personaje(session, data.id)
        for sec in session.exec(
            select(InventorySection).where(InventorySection.character_id == p.id)
        ).all():
            for item in session.exec(
                select(InventoryItem).where(InventoryItem.section_id == sec.id)
            ).all():
                session.delete(item)
            session.delete(sec)
        for escena in session.exec(select(Scene)).all():
            tokens = loads(escena.tokens_json, [])
            nuevos = [t for t in tokens if t.get("character_id") != p.id]
            if len(nuevos) != len(tokens):
                escena.tokens_json = dumps(nuevos)
                session.add(escena)
        session.delete(p)
        session.commit()
        emit(session, "personajes", "borrado", {"id": data.id})
        return _estado(session)

    if accion == "enviar_a_escena":
        p = _personaje(session, data.id)
        escena = session.exec(select(Scene).where(Scene.activo == True)).first()  # noqa: E712
        if not escena:
            raise HTTPException(409, "No hay una escena activa")
        tokens = loads(escena.tokens_json, [])
        if any(t.get("character_id") == p.id for t in tokens):
            raise HTTPException(409, f"{p.nombre} ya está en la escena activa")
        tokens.append({
            "id": uuid.uuid4().hex[:10], "nombre": p.nombre, "emoji": p.emoji,
            "x": random.randint(1, 10), "y": random.randint(1, 7),
            "color": "#f87171" if p.kind == "criatura" else "#67e8f9",
            "character_id": p.id,
        })
        escena.tokens_json = dumps(tokens)
        session.add(escena)
        session.commit()
        emit(session, "escenario", "token_agregado", {
            "scene_id": escena.id, "nombre": p.nombre, "character_id": p.id,
        })
        return _estado(session)

    raise HTTPException(400, f"Acción no soportada: {accion}")
