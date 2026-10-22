"""Módulo Inventario: secciones CRUD por personaje/criatura e items editables."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from db import get_session
from events import emit
from models import Character, InventoryItem, InventorySection
from serializers import character_dict, item_dict, section_dict
from utils import dumps

router = APIRouter(tags=["inventario"])


class InventarioAccion(BaseModel):
    action: str
    character_id: int | None = None
    section_id: int | None = None
    item_id: int | None = None
    nombre: str | None = None
    qty: int | None = None
    valor: str | None = None
    nota: str | None = None
    icono: str | None = None
    token_path: str | None = None
    orden: int | None = None


def _inventario(session: Session) -> dict:
    personajes = session.exec(select(Character).order_by(Character.kind, Character.nombre)).all()
    secciones = session.exec(select(InventorySection).order_by(InventorySection.orden, InventorySection.id)).all()
    items = session.exec(select(InventoryItem).order_by(InventoryItem.id)).all()
    por_seccion: dict[int, list[dict]] = {}
    for item in items:
        por_seccion.setdefault(int(item.section_id), []).append(item_dict(item))
    salida = []
    for p in personajes:
        d = character_dict(p)
        d["secciones"] = [
            {**section_dict(s), "items": por_seccion.get(int(s.id), [])}
            for s in secciones if int(s.character_id) == int(p.id)
        ]
        salida.append(d)
    return {
        "personajes": salida,
        "total_items": sum(i["qty"] for i in (item_dict(x) for x in items)),
        "total_secciones": len(secciones),
    }


def _seccion(session: Session, section_id: int | None) -> InventorySection:
    if section_id is None:
        raise HTTPException(400, "Falta section_id")
    seccion = session.get(InventorySection, section_id)
    if not seccion:
        raise HTTPException(404, "Sección no encontrada")
    return seccion


def _item(session: Session, item_id: int | None) -> InventoryItem:
    if item_id is None:
        raise HTTPException(400, "Falta item_id")
    item = session.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(404, "Item no encontrado")
    return item


@router.get("/api/modules/inventario/state")
def estado_inventario(session: Session = Depends(get_session)):
    return _inventario(session)


@router.post("/api/modules/inventario/action")
def accion_inventario(data: InventarioAccion, session: Session = Depends(get_session)):
    accion = data.action

    if accion == "crear_seccion":
        if not data.character_id or not (data.nombre or "").strip():
            raise HTTPException(400, "character_id y nombre son obligatorios")
        if not session.get(Character, data.character_id):
            raise HTTPException(404, "Personaje no encontrado")
        hermanas = session.exec(
            select(InventorySection).where(InventorySection.character_id == data.character_id)
        ).all()
        seccion = InventorySection(
            character_id=data.character_id, nombre=data.nombre.strip()[:80],
            orden=len(hermanas),
        )
        session.add(seccion)
        session.commit()
        session.refresh(seccion)
        emit(session, "inventario", "seccion_creada", {"id": seccion.id, "nombre": seccion.nombre})
        return _inventario(session)

    if accion == "editar_seccion":
        seccion = _seccion(session, data.section_id)
        if data.nombre is not None:
            if not data.nombre.strip():
                raise HTTPException(400, "El nombre no puede estar vacío")
            seccion.nombre = data.nombre.strip()[:80]
        if data.orden is not None:
            seccion.orden = max(0, data.orden)
        session.add(seccion)
        session.commit()
        emit(session, "inventario", "seccion_editada", {"id": seccion.id})
        return _inventario(session)

    if accion == "borrar_seccion":
        seccion = _seccion(session, data.section_id)
        for item in session.exec(
            select(InventoryItem).where(InventoryItem.section_id == seccion.id)
        ).all():
            session.delete(item)
        session.delete(seccion)
        session.commit()
        emit(session, "inventario", "seccion_borrada", {"id": data.section_id})
        return _inventario(session)

    if accion == "crear_item":
        seccion = _seccion(session, data.section_id)
        if not (data.nombre or "").strip():
            raise HTTPException(400, "El nombre del item es obligatorio")
        item = InventoryItem(
            section_id=int(seccion.id), nombre=data.nombre.strip()[:120],
            qty=max(1, int(data.qty or 1)), valor=(data.valor or "")[:60],
            nota=(data.nota or "")[:1000], icono=(data.icono or "📦")[:12],
            token_path=(data.token_path or "")[:300],
        )
        session.add(item)
        session.commit()
        session.refresh(item)
        emit(session, "inventario", "item_creado", {
            "id": item.id, "nombre": item.nombre, "qty": item.qty,
            "character_id": seccion.character_id,
        })
        return _inventario(session)

    if accion == "editar_item":
        item = _item(session, data.item_id)
        if data.nombre is not None:
            if not data.nombre.strip():
                raise HTTPException(400, "El nombre no puede estar vacío")
            item.nombre = data.nombre.strip()[:120]
        if data.qty is not None:
            item.qty = max(0, int(data.qty))
        if data.valor is not None:
            item.valor = data.valor[:60]
        if data.nota is not None:
            item.nota = data.nota[:1000]
        if data.icono is not None:
            item.icono = data.icono[:12] or "📦"
        if data.token_path is not None:
            item.token_path = data.token_path[:300]
        if data.section_id is not None and data.section_id != item.section_id:
            _seccion(session, data.section_id)
            item.section_id = data.section_id
        session.add(item)
        session.commit()
        emit(session, "inventario", "item_editado", {"id": item.id, "nombre": item.nombre})
        return _inventario(session)

    if accion == "mover_item":
        item = _item(session, data.item_id)
        seccion = _seccion(session, data.section_id)
        item.section_id = int(seccion.id)
        session.add(item)
        session.commit()
        emit(session, "inventario", "item_movido", {
            "id": item.id, "section_id": seccion.id, "seccion": seccion.nombre,
        })
        return _inventario(session)

    if accion == "borrar_item":
        item = _item(session, data.item_id)
        session.delete(item)
        session.commit()
        emit(session, "inventario", "item_borrado", {"id": data.item_id})
        return _inventario(session)

    raise HTTPException(400, f"Acción no soportada: {accion}")
