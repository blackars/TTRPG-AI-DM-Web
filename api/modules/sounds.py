"""Módulo Sonido: biblioteca por grupos, sintetizadores WebAudio y archivos locales."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from db import SOUNDS_DIR, get_session
from events import emit
from models import Scene, SoundAsset
from serializers import scene_dict, sound_dict
from utils import dumps, loads

router = APIRouter(tags=["sonido"])

SINTETICOS = {
    "synth:bosque": "Bosque de susurros",
    "synth:lluvia": "Lluvia sobre piedra",
    "synth:cripta": "Drone de cripta",
    "synth:mercado": "Murmullo de mercado",
    "synth:combate": "Tambores de combate",
    "synth:taberna": "Taberna cálida",
    "synth:viento": "Viento gélido",
}

EXTENSIONES = {".mp3", ".wav", ".ogg", ".m4a", ".flac", ".webm"}


class SonidoAccion(BaseModel):
    action: str
    id: int | None = None
    nombre: str | None = None
    grupo: str | None = None
    src: str | None = None
    loop: bool | None = None
    volumen: float | None = None
    scene_id: int | None = None
    activo: bool | None = None


def _indexar_archivos(session: Session) -> None:
    existentes = {s.src for s in session.exec(select(SoundAsset)).all()}
    nuevos = False
    for archivo in sorted(SOUNDS_DIR.iterdir()) if SOUNDS_DIR.exists() else []:
        if not archivo.is_file() or archivo.suffix.lower() not in EXTENSIONES:
            continue
        src = f"/sounds/{archivo.name}"
        if src in existentes:
            continue
        session.add(SoundAsset(
            nombre=archivo.stem.replace("_", " ").replace("-", " ").title(),
            grupo="Archivos", src=src, loop=True, volumen=0.6, sintetico=False,
        ))
        nuevos = True
    if nuevos:
        session.commit()


def _estado(session: Session) -> dict:
    _indexar_archivos(session)
    sonidos = session.exec(select(SoundAsset).order_by(SoundAsset.grupo, SoundAsset.nombre)).all()
    escena = session.exec(select(Scene).where(Scene.activo == True)).first()  # noqa: E712
    grupos: dict[str, list[dict]] = {}
    for s in sonidos:
        grupos.setdefault(s.grupo, []).append(sound_dict(s))
    return {
        "grupos": [{"nombre": g, "sonidos": v} for g, v in grupos.items()],
        "total": len(sonidos),
        "escena_activa": scene_dict(escena) if escena else None,
        "presets_sinteticos": [{"src": k, "nombre": v} for k, v in SINTETICOS.items()],
        "carpeta_archivos": str(SOUNDS_DIR),
    }


def _sonido(session: Session, sid: int | None) -> SoundAsset:
    if sid is None:
        raise HTTPException(400, "Falta el id del sonido")
    s = session.get(SoundAsset, sid)
    if not s:
        raise HTTPException(404, "Sonido no encontrado")
    return s


@router.get("/api/modules/sonido/state")
def estado_sonido(session: Session = Depends(get_session)):
    return _estado(session)


@router.post("/api/modules/sonido/action")
def accion_sonido(data: SonidoAccion, session: Session = Depends(get_session)):
    accion = data.action

    if accion == "crear_sintetico":
        src = data.src or ""
        if src not in SINTETICOS:
            raise HTTPException(400, "Preset sintético desconocido")
        s = SoundAsset(nombre=(data.nombre or SINTETICOS[src])[:80],
                       grupo=(data.grupo or "Ambiente")[:40], src=src,
                       loop=True if data.loop is None else data.loop,
                       volumen=max(0.0, min(1.0, float(data.volumen if data.volumen is not None else 0.6))),
                       sintetico=True)
        session.add(s)
        session.commit()
        session.refresh(s)
        emit(session, "sonido", "creado", {"id": s.id, "nombre": s.nombre})
        return _estado(session)

    if accion == "editar":
        s = _sonido(session, data.id)
        if data.nombre is not None:
            if not data.nombre.strip():
                raise HTTPException(400, "El nombre no puede estar vacío")
            s.nombre = data.nombre.strip()[:80]
        if data.grupo is not None:
            s.grupo = data.grupo.strip()[:40] or "Ambiente"
        if data.loop is not None:
            s.loop = data.loop
        if data.volumen is not None:
            s.volumen = max(0.0, min(1.0, float(data.volumen)))
        session.add(s)
        session.commit()
        emit(session, "sonido", "editado", {"id": s.id})
        return _estado(session)

    if accion == "borrar":
        s = _sonido(session, data.id)
        for escena in session.exec(select(Scene)).all():
            playlist = loads(escena.playlist_json, [])
            if s.id in playlist:
                escena.playlist_json = dumps([i for i in playlist if i != s.id])
                session.add(escena)
        session.delete(s)
        session.commit()
        emit(session, "sonido", "borrado", {"id": data.id})
        return _estado(session)

    if accion == "asignar_escena":
        s = _sonido(session, data.id)
        if data.scene_id is None:
            raise HTTPException(400, "Falta scene_id")
        escena = session.get(Scene, data.scene_id)
        if not escena:
            raise HTTPException(404, "Escena no encontrada")
        playlist = [int(i) for i in loads(escena.playlist_json, [])]
        activo = True if data.activo is None else data.activo
        if activo and s.id not in playlist:
            playlist.append(int(s.id))
        if not activo:
            playlist = [i for i in playlist if i != s.id]
        escena.playlist_json = dumps(playlist)
        session.add(escena)
        session.commit()
        emit(session, "escenario", "playlist", {"scene_id": escena.id, "playlist": playlist})
        return _estado(session)

    raise HTTPException(400, f"Acción no soportada: {accion}")
