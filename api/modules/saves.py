"""Módulo Partidas: snapshots completos, carga, export/import JSON."""
from __future__ import annotations

import unicodedata
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import delete
from sqlmodel import Session, select

from db import get_session
from events import emit
from models import (
    AiMessage, AppKv, Character, DiceLog, GameSave, InventoryItem,
    InventorySection, MiniLink, ModuleInstance, Npc, Ruleset, Scene, Screen,
    SoundAsset,
)
from utils import dumps, loads

router = APIRouter(tags=["partidas"])

MODELOS = {
    "characters": Character,
    "inventory_sections": InventorySection,
    "inventory_items": InventoryItem,
    "dice_logs": DiceLog,
    "rulesets": Ruleset,
    "scenes": Scene,
    "screens": Screen,
    "module_instances": ModuleInstance,
    "ai_messages": AiMessage,
    "sound_assets": SoundAsset,
    "npcs": Npc,
    "app_kv": AppKv,
    "mini_links": MiniLink,
}

ORDEN_RESTAURACION = [
    "characters", "inventory_sections", "inventory_items", "dice_logs",
    "rulesets", "scenes", "screens", "module_instances", "ai_messages",
    "sound_assets", "npcs", "app_kv", "mini_links",
]

MAX_SNAPSHOT = 12 * 1024 * 1024


class PartidaAccion(BaseModel):
    action: str
    id: int | None = None
    nombre: str | None = None


def _snapshot(session: Session) -> dict:
    tablas: dict[str, list[dict[str, Any]]] = {}
    for nombre, modelo in MODELOS.items():
        filas = session.exec(select(modelo)).all()
        tablas[nombre] = [f.model_dump() for f in filas]
    return {
        "formato": "ttrpg-assistant/partida",
        "version": 1,
        "ts": datetime.now().astimezone().isoformat(timespec="seconds"),
        "tablas": tablas,
    }


def _resumen(snapshot: dict) -> dict:
    t = snapshot.get("tablas", {})
    return {
        "personajes": len(t.get("characters", [])),
        "items": len(t.get("inventory_items", [])),
        "escenas": len(t.get("scenes", [])),
        "tiradas": len(t.get("dice_logs", [])),
        "mensajes_ia": len(t.get("ai_messages", [])),
        "npcs": len(t.get("npcs", [])),
        "pantallas": len(t.get("screens", [])),
        "sonidos": len(t.get("sound_assets", [])),
    }


def _estado(session: Session) -> dict:
    saves = session.exec(select(GameSave).order_by(GameSave.id.desc())).all()
    return {
        "partidas": [{
            "id": s.id, "nombre": s.nombre, "ts": s.ts,
            "bytes": len(s.snapshot_json.encode("utf-8")),
            "resumen": _resumen(loads(s.snapshot_json, {})),
        } for s in saves],
        "total": len(saves),
    }


def _validar(snapshot: dict) -> None:
    if snapshot.get("formato") != "ttrpg-assistant/partida":
        raise HTTPException(400, "El archivo no es una partida de TTRPG-Assistant")
    tablas = snapshot.get("tablas")
    if not isinstance(tablas, dict):
        raise HTTPException(400, "Snapshot sin tabla de datos")
    for nombre in ORDEN_RESTAURACION:
        filas = tablas.get(nombre, [])
        if not isinstance(filas, list):
            raise HTTPException(400, f"Tabla inválida en el snapshot: {nombre}")


def _restaurar(session: Session, snapshot: dict) -> None:
    _validar(snapshot)
    try:
        for nombre in ORDEN_RESTAURACION:
            modelo = MODELOS[nombre]
            session.exec(delete(modelo))  # type: ignore[arg-type]
            for fila in snapshot["tablas"].get(nombre, []):
                session.add(modelo(**fila))
        session.commit()
    except Exception as exc:  # noqa: BLE001
        session.rollback()
        raise HTTPException(400, f"No se pudo restaurar la partida: {exc}") from exc


def _importar(session: Session, snapshot: dict, nombre: str) -> dict:
    contenido = dumps(snapshot)
    if len(contenido.encode("utf-8")) > MAX_SNAPSHOT:
        raise HTTPException(413, "La partida supera el límite de 12 MB")
    _validar(snapshot)
    save = GameSave(nombre=nombre[:120], snapshot_json=contenido)
    session.add(save)
    session.commit()
    session.refresh(save)
    _restaurar(session, snapshot)
    emit(session, "partidas", "importada", {"id": save.id, "nombre": save.nombre})
    return _estado(session)


@router.get("/api/modules/partidas/state")
def estado_partidas(session: Session = Depends(get_session)):
    return _estado(session)


@router.post("/api/modules/partidas/action")
def accion_partidas(data: PartidaAccion, session: Session = Depends(get_session)):
    if data.action == "guardar":
        nombre = (data.nombre or "").strip()
        if not nombre:
            raise HTTPException(400, "Ponle un nombre a la partida")
        snapshot = _snapshot(session)
        save = GameSave(nombre=nombre[:120], snapshot_json=dumps(snapshot))
        session.add(save)
        session.commit()
        session.refresh(save)
        emit(session, "partidas", "guardada", {"id": save.id, "nombre": save.nombre})
        return _estado(session)

    if data.action == "cargar":
        save = session.get(GameSave, data.id)
        if not save:
            raise HTTPException(404, "Partida no encontrada")
        _restaurar(session, loads(save.snapshot_json, {}))
        emit(session, "partidas", "cargada", {"id": save.id, "nombre": save.nombre})
        return _estado(session)

    if data.action == "borrar":
        save = session.get(GameSave, data.id)
        if not save:
            raise HTTPException(404, "Partida no encontrada")
        session.delete(save)
        session.commit()
        emit(session, "partidas", "borrada", {"id": data.id})
        return _estado(session)

    raise HTTPException(400, f"Acción no soportada: {data.action}")


@router.get("/api/saves/{save_id}/export")
def exportar_partida(save_id: int, session: Session = Depends(get_session)):
    save = session.get(GameSave, save_id)
    if not save:
        raise HTTPException(404, "Partida no encontrada")
    snapshot = loads(save.snapshot_json, {})
    snapshot["nombre"] = save.nombre
    ascii_nombre = unicodedata.normalize("NFKD", save.nombre).encode("ascii", "ignore").decode()
    nombre_archivo = "".join(c if c.isalnum() or c in "-_" else "_" for c in ascii_nombre)[:60]
    return JSONResponse(
        content=snapshot,
        headers={"Content-Disposition": f'attachment; filename="ttrpg_{nombre_archivo}.json"'},
    )


@router.post("/api/saves/import")
def importar_partida(snapshot: dict = Body(...), session: Session = Depends(get_session)):
    nombre = str(snapshot.get("nombre") or "Partida importada").strip()
    if not nombre:
        nombre = "Partida importada"
    return _importar(session, snapshot, f"{nombre} (importada)")
