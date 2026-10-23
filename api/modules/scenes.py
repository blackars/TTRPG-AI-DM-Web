"""Módulo Escenarios: escenas, tokens por clic, luz y playlist de audio."""
from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlmodel import Session, select

from db import ESCENARIOS_DIR, get_session
from events import emit
from models import Scene, SoundAsset
from serializers import (
    EXT_EFECTO_VIDEO, EXTENSIONES_EFECTO, MAX_EFECTOS, normalizar_efecto,
    normalizar_presentacion, presentacion_dict, scene_dict, sound_dict,
)
from utils import dumps, loads

router = APIRouter(tags=["escenarios"])

GRID = {"cols": 12, "rows": 9}
EXTENSIONES_MAPA = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}
MAX_MAPA_BYTES = 15 * 1024 * 1024
MAX_EFECTO_BYTES = 80 * 1024 * 1024


class EscenaAccion(BaseModel):
    action: str
    id: int | None = None
    scene_id: int | None = None
    nombre: str | None = None
    descripcion: str | None = None
    bg: str | None = None
    light: dict | None = None
    playlist: list[int] | None = None
    presentacion: dict | None = None
    token_id: str | None = None
    token_nombre: str | None = None
    emoji: str | None = None
    x: int | None = None
    y: int | None = None
    color: str | None = None
    character_id: int | None = None
    opacity: float | None = None


def _escena(session: Session, sid: int | None) -> Scene:
    if sid is None:
        raise HTTPException(400, "Falta el id de la escena")
    escena = session.get(Scene, sid)
    if not escena:
        raise HTTPException(404, "Escena no encontrada")
    return escena


def _presentacion_actual(escena: Scene) -> dict:
    return normalizar_presentacion(loads(escena.presentacion_json, {}))


def _borrar_archivo(nombre: str) -> None:
    if not nombre:
        return
    archivo = ESCENARIOS_DIR / Path(nombre).name
    archivo.unlink(missing_ok=True)


def _estado(session: Session) -> dict:
    escenas = session.exec(select(Scene).order_by(Scene.id)).all()
    sonidos = session.exec(select(SoundAsset).order_by(SoundAsset.grupo, SoundAsset.nombre)).all()
    activa = next((e for e in escenas if e.activo), None)
    return {
        "escenas": [scene_dict(e) for e in escenas],
        "activa": scene_dict(activa) if activa else None,
        "grid": GRID,
        "sonidos": [sound_dict(s) for s in sonidos],
        "presets_bg": [
            {"nombre": "Bosque", "valor": "radial-gradient(120% 90% at 30% 10%, #1e5c3f 0%, #123a2a 45%, #07130f 100%)"},
            {"nombre": "Cripta", "valor": "radial-gradient(110% 100% at 70% 20%, #3b1d4f 0%, #1b1026 50%, #08060d 100%)"},
            {"nombre": "Mercado", "valor": "radial-gradient(120% 90% at 20% 15%, #7c4a1d 0%, #4a2a12 45%, #160d07 100%)"},
            {"nombre": "Costa", "valor": "radial-gradient(120% 100% at 60% 0%, #164e63 0%, #0b2b38 50%, #050d12 100%)"},
            {"nombre": "Nieve", "valor": "radial-gradient(120% 100% at 40% 10%, #475569 0%, #1e293b 55%, #080c12 100%)"},
        ],
    }


@router.get("/api/modules/escenarios/state")
def estado_escenarios(session: Session = Depends(get_session)):
    return _estado(session)


@router.get("/api/modules/escenario/state")
def estado_escenario_activo(session: Session = Depends(get_session)):
    """Contrato del módulo «Escenario activo»: tablero de la escena en curso."""
    datos = _estado(session)
    return {
        "activa": datos["activa"],
        "grid": datos["grid"],
        "sonidos": datos["sonidos"],
        "total_escenas": len(datos["escenas"]),
    }


@router.post("/api/modules/escenario/action")
def accion_escenario_activo(data: EscenaAccion, session: Session = Depends(get_session)):
    """Alias del tablero: si no se indica escena, opera sobre la activa."""
    if data.action in ("agregar_token", "mover_token", "borrar_token", "set_light"):
        if not (data.scene_id or data.id):
            activa = session.exec(select(Scene).where(Scene.activo == True)).first()  # noqa: E712
            if not activa:
                raise HTTPException(404, "No hay una escena activa")
            data.scene_id = int(activa.id)
    return accion_escenarios(data, session)


@router.post("/api/modules/escenarios/action")
def accion_escenarios(data: EscenaAccion, session: Session = Depends(get_session)):
    accion = data.action

    if accion == "crear":
        nombre = (data.nombre or "").strip()
        if not nombre:
            raise HTTPException(400, "La escena necesita un nombre")
        escena = Scene(
            nombre=nombre[:80],
            descripcion=(data.descripcion or "")[:1000],
            bg=data.bg or "radial-gradient(120% 90% at 30% 10%, #1e5c3f 0%, #123a2a 45%, #07130f 100%)",
            light_json=dumps(data.light or {"color": "#f5b544", "opacity": 0.18}),
            tokens_json=dumps([]),
            playlist_json=dumps(data.playlist or []),
            presentacion_json=dumps({}),
        )
        session.add(escena)
        session.commit()
        session.refresh(escena)
        emit(session, "escenario", "creada", {"id": escena.id, "nombre": escena.nombre})
        return _estado(session)

    if accion == "editar":
        escena = _escena(session, data.id)
        if data.nombre is not None:
            if not data.nombre.strip():
                raise HTTPException(400, "El nombre no puede estar vacío")
            escena.nombre = data.nombre.strip()[:80]
        if data.descripcion is not None:
            escena.descripcion = data.descripcion[:1000]
        if data.bg is not None:
            escena.bg = data.bg[:500]
        if data.light is not None:
            escena.light_json = dumps(data.light)
        if data.playlist is not None:
            escena.playlist_json = dumps([int(i) for i in data.playlist])
        session.add(escena)
        session.commit()
        emit(session, "escenario", "editada", {"id": escena.id, "nombre": escena.nombre})
        return _estado(session)

    if accion == "borrar":
        escena = _escena(session, data.id)
        if escena.activo:
            raise HTTPException(409, "No puedes borrar la escena activa; activa otra primero")
        actual = _presentacion_actual(escena)
        _borrar_archivo(actual.get("mapa", ""))
        for efecto in actual.get("efectos", []):
            _borrar_archivo(efecto.get("archivo", ""))
        session.delete(escena)
        session.commit()
        emit(session, "escenario", "borrada", {"id": data.id})
        return _estado(session)

    if accion == "activar":
        escena = _escena(session, data.id)
        for otra in session.exec(select(Scene)).all():
            if otra.activo != (otra.id == escena.id):
                otra.activo = otra.id == escena.id
                session.add(otra)
        escena.activo = True
        session.add(escena)
        session.commit()
        session.refresh(escena)
        datos = scene_dict(escena)
        emit(session, "escenario", "activada", datos)
        return _estado(session)

    if accion == "set_presentacion":
        escena = _escena(session, data.scene_id or data.id)
        fusion = {**_presentacion_actual(escena), **(data.presentacion or {})}
        escena.presentacion_json = dumps(normalizar_presentacion(fusion))
        session.add(escena)
        session.commit()
        emit(session, "escenario", "presentacion", {
            "scene_id": escena.id, "presentacion": presentacion_dict(fusion),
        })
        return _estado(session)

    if accion == "agregar_token":
        escena = _escena(session, data.scene_id or data.id)
        nombre = (data.token_nombre or data.nombre or "").strip()
        if not nombre:
            raise HTTPException(400, "El token necesita un nombre")
        tokens = loads(escena.tokens_json, [])
        tokens.append({
            "id": uuid.uuid4().hex[:10], "nombre": nombre[:60],
            "emoji": (data.emoji or "🔵")[:12],
            "x": max(0, min(GRID["cols"] - 1, int(data.x if data.x is not None else 5))),
            "y": max(0, min(GRID["rows"] - 1, int(data.y if data.y is not None else 4))),
            "color": data.color or "#f5b544", "character_id": data.character_id,
        })
        escena.tokens_json = dumps(tokens)
        session.add(escena)
        session.commit()
        emit(session, "escenario", "token_agregado", {"scene_id": escena.id, "nombre": nombre})
        return _estado(session)

    if accion == "mover_token":
        escena = _escena(session, data.scene_id or data.id)
        tokens = loads(escena.tokens_json, [])
        encontrado = False
        for t in tokens:
            if t.get("id") == data.token_id:
                t["x"] = max(0, min(GRID["cols"] - 1, int(data.x if data.x is not None else t["x"])))
                t["y"] = max(0, min(GRID["rows"] - 1, int(data.y if data.y is not None else t["y"])))
                encontrado = True
        if not encontrado:
            raise HTTPException(404, "Token no encontrado")
        escena.tokens_json = dumps(tokens)
        session.add(escena)
        session.commit()
        emit(session, "escenario", "token_movido", {
            "scene_id": escena.id, "token_id": data.token_id, "x": data.x, "y": data.y,
        })
        return _estado(session)

    if accion == "borrar_token":
        escena = _escena(session, data.scene_id or data.id)
        tokens = loads(escena.tokens_json, [])
        nuevos = [t for t in tokens if t.get("id") != data.token_id]
        if len(nuevos) == len(tokens):
            raise HTTPException(404, "Token no encontrado")
        escena.tokens_json = dumps(nuevos)
        session.add(escena)
        session.commit()
        emit(session, "escenario", "token_borrado", {"scene_id": escena.id})
        return _estado(session)

    if accion == "set_light":
        escena = _escena(session, data.scene_id or data.id)
        luz = loads(escena.light_json, {})
        if data.color:
            luz["color"] = data.color
        if data.opacity is not None:
            luz["opacity"] = max(0.0, min(0.9, float(data.opacity)))
        escena.light_json = dumps(luz)
        session.add(escena)
        session.commit()
        emit(session, "escenario", "luz", {"scene_id": escena.id, **luz})
        return _estado(session)

    raise HTTPException(400, f"Acción no soportada: {accion}")


@router.post("/api/escenarios/{scene_id}/mapa")
async def subir_mapa(
    scene_id: int,
    archivo: UploadFile = File(...),
    session: Session = Depends(get_session),
):
    """Sube el mapa de una escena y lo deja listo para el proyector."""
    escena = _escena(session, scene_id)
    sufijo = Path(archivo.filename or "").suffix.lower()
    if sufijo not in EXTENSIONES_MAPA:
        raise HTTPException(400, "Formato no admitido. Usa JPG, PNG, WEBP, GIF o AVIF.")
    contenido = await archivo.read()
    if not contenido:
        raise HTTPException(400, "El archivo está vacío.")
    if len(contenido) > MAX_MAPA_BYTES:
        raise HTTPException(413, "El mapa supera los 15 MB.")

    nombre = f"escena-{escena.id}-{uuid.uuid4().hex[:10]}{sufijo}"
    destino = ESCENARIOS_DIR / nombre
    destino.write_bytes(contenido)

    actual = _presentacion_actual(escena)
    _borrar_archivo(actual.get("mapa", ""))
    actual["mapa"] = nombre
    escena.presentacion_json = dumps(normalizar_presentacion(actual))
    session.add(escena)
    session.commit()
    emit(session, "escenario", "mapa", {"scene_id": escena.id, "archivo": nombre})
    return _estado(session)


@router.delete("/api/escenarios/{scene_id}/mapa")
def quitar_mapa(scene_id: int, session: Session = Depends(get_session)):
    """Quita el mapa de la escena y elimina el archivo subido."""
    escena = _escena(session, scene_id)
    actual = _presentacion_actual(escena)
    _borrar_archivo(actual.get("mapa", ""))
    actual["mapa"] = ""
    escena.presentacion_json = dumps(normalizar_presentacion(actual))
    session.add(escena)
    session.commit()
    emit(session, "escenario", "mapa_quitado", {"scene_id": escena.id})
    return _estado(session)


@router.post("/api/escenarios/{scene_id}/efectos")
async def subir_efecto(
    scene_id: int,
    archivo: UploadFile = File(...),
    session: Session = Depends(get_session),
):
    """Sube una textura animada (PNG/WEBP/GIF/MP4) y la añade como capa."""
    escena = _escena(session, scene_id)
    sufijo = Path(archivo.filename or "").suffix.lower()
    if sufijo not in EXTENSIONES_EFECTO:
        raise HTTPException(
            400,
            "Formato no admitido. Usa PNG, WEBP, GIF, APNG, MP4 o WEBM.",
        )
    actual = _presentacion_actual(escena)
    efectos = actual.get("efectos", [])
    if len(efectos) >= MAX_EFECTOS:
        raise HTTPException(400, f"Máximo {MAX_EFECTOS} efectos por escena.")

    contenido = await archivo.read()
    if not contenido:
        raise HTTPException(400, "El archivo está vacío.")
    if len(contenido) > MAX_EFECTO_BYTES:
        raise HTTPException(413, "El efecto supera los 80 MB.")

    nombre_base = Path(archivo.filename or "").stem.strip()[:60] or "Textura"
    nombre_archivo = f"efecto-{escena.id}-{uuid.uuid4().hex[:10]}{sufijo}"
    destino = ESCENARIOS_DIR / nombre_archivo
    destino.write_bytes(contenido)

    try:
        es_video = sufijo in EXT_EFECTO_VIDEO
        efecto = normalizar_efecto({
            "tipo": "textura",
            "nombre": nombre_base,
            "archivo": nombre_archivo,
            "x": 50, "y": 50, "ancho": 55, "alto": 55,
            "opacidad": 0.82, "mezcla": "normal",
            "animacion": "ninguna", "velocidad": 1,
            "ajuste": "cover" if es_video else "contain",
            "suavizado": 0,
        })
        if not efecto:
            raise HTTPException(400, "No se pudo preparar el efecto.")
        actual["efectos"] = [*efectos, efecto]
        escena.presentacion_json = dumps(normalizar_presentacion(actual))
        session.add(escena)
        session.commit()
    except Exception:
        destino.unlink(missing_ok=True)
        raise

    emit(session, "escenario", "efecto", {
        "scene_id": escena.id, "efecto_id": efecto["id"], "archivo": nombre_archivo,
    })
    return _estado(session)


@router.delete("/api/escenarios/{scene_id}/efectos/{efecto_id}")
def quitar_efecto(
    scene_id: int,
    efecto_id: str,
    session: Session = Depends(get_session),
):
    """Quita una capa de efecto y borra su archivo si era una textura subida."""
    escena = _escena(session, scene_id)
    actual = _presentacion_actual(escena)
    efectos = actual.get("efectos", [])
    encontrado = next((e for e in efectos if e.get("id") == efecto_id), None)
    if not encontrado:
        raise HTTPException(404, "Efecto no encontrado")
    _borrar_archivo(encontrado.get("archivo", ""))
    actual["efectos"] = [e for e in efectos if e.get("id") != efecto_id]
    escena.presentacion_json = dumps(normalizar_presentacion(actual))
    session.add(escena)
    session.commit()
    emit(session, "escenario", "efecto_borrado", {
        "scene_id": escena.id, "efecto_id": efecto_id,
    })
    return _estado(session)
