"""Módulo NPCs: nombre, voz, tono, frases frecuentes y notas."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from db import get_session
from events import emit
from models import Npc
from serializers import npc_dict
from utils import dumps

router = APIRouter(tags=["npcs"])


class NpcAccion(BaseModel):
    action: str
    id: int | None = None
    nombre: str | None = None
    voz: str | None = None
    tono: str | None = None
    frases: list[str] | None = None
    notas: str | None = None


def _npc(session: Session, nid: int | None) -> Npc:
    if nid is None:
        raise HTTPException(400, "Falta id")
    n = session.get(Npc, nid)
    if not n:
        raise HTTPException(404, "NPC no encontrado")
    return n


def _estado(session: Session) -> dict:
    npcs = session.exec(select(Npc).order_by(Npc.nombre)).all()
    return {"npcs": [npc_dict(n) for n in npcs], "total": len(npcs)}


@router.get("/api/modules/npcs/state")
def estado_npcs(session: Session = Depends(get_session)):
    return _estado(session)


@router.post("/api/modules/npcs/action")
def accion_npcs(data: NpcAccion, session: Session = Depends(get_session)):
    if data.action == "crear":
        nombre = (data.nombre or "").strip()
        if not nombre:
            raise HTTPException(400, "El NPC necesita un nombre")
        npc = Npc(nombre=nombre[:80], voz=(data.voz or "")[:200],
                  tono=(data.tono or "")[:500], phrases_json=dumps(data.frases or []),
                  notas=(data.notas or "")[:2000])
        session.add(npc)
        session.commit()
        session.refresh(npc)
        emit(session, "npcs", "creado", {"id": npc.id, "nombre": npc.nombre})
        return _estado(session)

    if data.action == "editar":
        npc = _npc(session, data.id)
        if data.nombre is not None:
            if not data.nombre.strip():
                raise HTTPException(400, "El nombre no puede estar vacío")
            npc.nombre = data.nombre.strip()[:80]
        if data.voz is not None:
            npc.voz = data.voz[:200]
        if data.tono is not None:
            npc.tono = data.tono[:500]
        if data.frases is not None:
            npc.phrases_json = dumps([f[:500] for f in data.frases if f.strip()])
        if data.notas is not None:
            npc.notas = data.notas[:2000]
        session.add(npc)
        session.commit()
        emit(session, "npcs", "editado", {"id": npc.id, "nombre": npc.nombre})
        return _estado(session)

    if data.action == "borrar":
        npc = _npc(session, data.id)
        session.delete(npc)
        session.commit()
        emit(session, "npcs", "borrado", {"id": data.id})
        return _estado(session)

    raise HTTPException(400, f"Acción no soportada: {data.action}")
