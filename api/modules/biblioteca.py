"""Módulo Biblioteca: catálogo de fichas, documentos y generadores Mythic."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlmodel import Session

import library
from db import get_session
from events import emit
from models import DiceLog
from rules.builtin import mythic
from utils import dumps

router = APIRouter(tags=["biblioteca"])


class BibliotecaAccion(BaseModel):
    action: str
    ficha_id: str | None = None
    documento_id: str | None = None
    sistema_id: str | None = None
    tipo: str | None = None
    pregunta: str = ""
    odds: str | None = None
    chaos: int | None = None
    tirada: int | None = None
    tirada_foco: int | None = None
    tirada_accion: int | None = None
    tirada_sujeto: int | None = None
    tirada_descriptor: int | None = None


def _estado(session: Session) -> dict:
    items = library.catalogo()
    activo = library.activa(session)
    docs = library.documentos(session)
    por_categoria: dict[str, int] = {}
    por_tipo: dict[str, int] = {}
    for item in items:
        por_categoria[item["categoria"]] = por_categoria.get(item["categoria"], 0) + 1
        por_tipo[item["tipo_ui"]] = por_tipo.get(item["tipo_ui"], 0) + 1
    docs_activos = [d for d in docs if activo and d.get("sistema_id") == activo["id"]]
    return {
        "catalogo": items,
        "total": len(items),
        "facetas": library.facetas(items),
        "estadisticas": {
            "por_categoria": por_categoria,
            "por_tipo": por_tipo,
            "documentos": len(docs),
            "documentos_activos": len(docs_activos),
        },
        "sistema_activo": activo,
        "documentos": docs,
        "generadores": {
            "mythic": {
                "nombre": "Mythic GME",
                "odds": list(mythic.ODDS.keys()),
                "chaos": [1, 2, 3, 4, 5, 6, 7, 8, 9],
                "tipos": [
                    {"id": "pregunta", "label": "Pregunta sí/no"},
                    {"id": "evento", "label": "Significado de evento"},
                    {"id": "completo", "label": "Evento completo"},
                    {"id": "escena", "label": "Ajuste de escena"},
                ],
            }
        },
        "rutas": {
            "clasica": "/biblioteca-clasica/index.html",
            "api": "/api/biblioteca",
            "subidas": "api/data/biblioteca/",
        },
        "aviso": (
            "La biblioteca clásica sigue disponible en /biblioteca-clasica/index.html. "
            "Los documentos subidos se guardan fuera de Git, en api/data/biblioteca/."
        ),
    }


def _resultado_mythic(data: BibliotecaAccion) -> tuple[dict, str, list[int]]:
    tipo = (data.tipo or "pregunta").strip().lower()
    resultado = mythic.generar(
        tipo,
        odds=data.odds or "50/50",
        chaos=data.chaos if data.chaos is not None else 5,
        tirada=data.tirada,
        tirada_foco=data.tirada_foco,
        tirada_accion=data.tirada_accion,
        tirada_sujeto=data.tirada_sujeto,
        tirada_descriptor=data.tirada_descriptor,
    )
    if tipo in {"pregunta", "fate", "si-no", "sino"}:
        expr, tiradas = "1d100", [resultado["tirada"]]
    elif tipo in {"evento", "significado", "event_meaning"}:
        expr, tiradas = "2d100", list(resultado["tiradas"])
    elif tipo in {"foco", "event_focus", "descriptor", "descriptor_evento"}:
        expr, tiradas = "1d100", [resultado["tirada"]]
    elif tipo in {"escena", "scene", "ajuste"}:
        expr, tiradas = "1d10", [resultado["tirada"]]
    else:
        expr, tiradas = "4d100", list(resultado["tiradas"])
    return resultado, expr, tiradas


@router.get("/api/modules/biblioteca/state")
def estado_biblioteca(session: Session = Depends(get_session)):
    return _estado(session)


@router.post("/api/modules/biblioteca/action")
def accion_biblioteca(data: BibliotecaAccion, session: Session = Depends(get_session)):
    if data.action == "seleccionar":
        if not data.ficha_id:
            raise HTTPException(400, "Falta ficha_id.")
        activo = library.seleccionar(session, data.ficha_id)
        if not activo:
            raise HTTPException(404, "No existe esa ficha en la biblioteca.")
        emit(session, "biblioteca", "seleccionar", {"id": activo["id"], "titulo": activo["titulo"]})
        return {"ok": True, "sistema_activo": activo, "estado": _estado(session)}

    if data.action == "limpiar":
        library.limpiar(session)
        emit(session, "biblioteca", "limpiar", {})
        return {"ok": True, "sistema_activo": None, "estado": _estado(session)}

    if data.action in {"vincular_documento", "desvincular_documento"}:
        if not data.documento_id:
            raise HTTPException(400, "Falta documento_id.")
        docs = {d["id"]: d for d in library.documentos(session)}
        if data.documento_id not in docs:
            raise HTTPException(404, "No existe ese documento.")
        activo = library.activa(session)
        sistema_id = None if data.action == "desvincular_documento" else (data.sistema_id or (activo or {}).get("id"))
        if sistema_id and not library.ficha(sistema_id):
            raise HTTPException(404, "No existe el sistema al que quieres vincular el documento.")
        library.vincular(session, data.documento_id, sistema_id)
        emit(
            session,
            "biblioteca",
            "vincular_documento",
            {"documento_id": data.documento_id, "sistema_id": sistema_id},
        )
        return {"ok": True, "estado": _estado(session)}

    if data.action == "mythic_tirar":
        try:
            resultado, expr, tiradas = _resultado_mythic(data)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        razon = data.pregunta.strip() or f"Mythic: {(data.tipo or 'pregunta')}"
        fila = DiceLog(
            expr=expr,
            tiradas_json=dumps(tiradas),
            mod=0,
            total=int(tiradas[0]) if tiradas else 0,
            razon=razon,
            modo="mythic",
            personaje="",
        )
        session.add(fila)
        session.commit()
        session.refresh(fila)
        emit(
            session,
            "biblioteca",
            "mythic_tirar",
            {"tipo": data.tipo or "pregunta", "pregunta": data.pregunta, "resultado": resultado},
        )
        return {
            "ok": True,
            "resultado": resultado,
            "tirada": {
                "id": fila.id,
                "expr": fila.expr,
                "tiradas": tiradas,
                "total": fila.total,
                "razon": fila.razon,
                "modo": fila.modo,
                "ts": fila.ts,
            },
            "estado": _estado(session),
        }

    raise HTTPException(400, "Acción de biblioteca no reconocida.")


@router.get("/api/biblioteca/fichas/{ficha_id}")
def detalle_ficha(ficha_id: str, session: Session = Depends(get_session)):
    detalle = library.ficha(ficha_id)
    if not detalle:
        raise HTTPException(404, "No existe esa ficha.")
    detalle["documentos"] = [
        d for d in library.documentos(session) if d.get("sistema_id") == ficha_id
    ]
    return detalle


@router.get("/api/biblioteca/contexto")
def contexto_biblioteca(session: Session = Depends(get_session)):
    return library.contexto(session)


@router.get("/api/biblioteca/documentos")
def listar_documentos(session: Session = Depends(get_session)):
    return {"documentos": library.documentos(session)}


@router.post("/api/biblioteca/documentos")
async def subir_documento(
    archivo: UploadFile = File(...),
    sistema_id: str | None = Form(default=None),
    session: Session = Depends(get_session),
):
    contenido = await archivo.read()
    try:
        documento = library.guardar_documento(archivo.filename or "documento", contenido)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    sistema = (sistema_id or "").strip() or None
    if sistema:
        if not library.ficha(sistema):
            raise HTTPException(404, "No existe el sistema al que quieres vincular el documento.")
        library.vincular(session, documento["id"], sistema)
    emit(session, "biblioteca", "subir_documento", {"documento": documento, "sistema_id": sistema})
    return {"ok": True, "documento": documento, "estado": _estado(session)}


@router.get("/api/biblioteca/documentos/{documento_id}")
def leer_documento(documento_id: str, max_chars: int = 24000):
    try:
        documento = library.leer_documento(documento_id, max_chars=max_chars)
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(422, f"No se pudo extraer el texto del documento: {exc}") from exc
    if not documento:
        raise HTTPException(404, "No existe ese documento.")
    return documento


@router.get("/api/biblioteca/documentos/{documento_id}/archivo")
def archivo_documento(documento_id: str):
    path = library.ruta_documento(documento_id)
    if not path:
        raise HTTPException(404, "No existe ese documento.")
    return FileResponse(path, filename=path.name)


@router.delete("/api/biblioteca/documentos/{documento_id}")
def borrar_documento(documento_id: str, session: Session = Depends(get_session)):
    if not library.eliminar_documento(documento_id):
        raise HTTPException(400, "Solo se pueden borrar documentos subidos por el usuario.")
    library.vincular(session, documento_id, None)
    emit(session, "biblioteca", "borrar_documento", {"documento_id": documento_id})
    return {"ok": True, "estado": _estado(session)}
