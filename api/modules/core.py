"""Módulo núcleo: pantallas componibles, bus de eventos, reloj, notas y estado."""
from __future__ import annotations

import re
import unicodedata
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field as PField
from sqlmodel import Session, select

from context import build_context
from db import get_session
from events import emit, ultimo_id
from models import AppKv, ModuleInstance, Screen
from registry import MODULE_MAP, MODULES, SLOTS
from serializers import screen_dict
from utils import dumps, loads

router = APIRouter(tags=["núcleo"])


# --------------------------------------------------------------------- helpers
def _slug(texto: str) -> str:
    base = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    base = re.sub(r"[^a-zA-Z0-9]+", "-", base).strip("-").lower()
    return base or "pantalla"


def _sync_layout(session: Session, screen_id: int) -> None:
    pantalla = session.get(Screen, screen_id)
    if not pantalla:
        return
    instancias = session.exec(
        select(ModuleInstance).where(ModuleInstance.screen_id == screen_id)
        .order_by(ModuleInstance.slot, ModuleInstance.orden, ModuleInstance.id)
    ).all()
    layout: dict[str, list[int]] = {}
    for inst in instancias:
        layout.setdefault(inst.slot, []).append(int(inst.id))
    pantalla.layout_json = dumps(layout)
    session.add(pantalla)
    session.commit()


def _instancia_dict(inst: ModuleInstance) -> dict:
    return {
        "id": inst.id, "screen_id": inst.screen_id, "module_id": inst.module_id,
        "slot": inst.slot, "orden": inst.orden, "props": loads(inst.props_json, {}),
        "collapsed": inst.collapsed, "ts": inst.ts,
    }


def _overlay_instances(session: Session, screen_id: int) -> list[ModuleInstance]:
    return session.exec(
        select(ModuleInstance)
        .where(ModuleInstance.screen_id == screen_id, ModuleInstance.slot == "overlay")
    ).all()


# -------------------------------------------------------------------- pantallas
class ScreenIn(BaseModel):
    nombre: str = PField(min_length=1, max_length=80)
    slug: str | None = None


class InstanceIn(BaseModel):
    module_id: str
    slot: str | None = None
    props: dict = {}
    collapsed: bool = False


class InstancePatch(BaseModel):
    slot: str | None = None
    orden: int | None = None
    props: dict | None = None
    collapsed: bool | None = None


@router.get("/api/screens")
def listar_pantallas(session: Session = Depends(get_session)):
    pantallas = session.exec(select(Screen).order_by(Screen.orden, Screen.id)).all()
    return [screen_dict(p) for p in pantallas]


@router.post("/api/screens")
def crear_pantalla(data: ScreenIn, session: Session = Depends(get_session)):
    slug = _slug(data.slug or data.nombre)
    if session.exec(select(Screen).where(Screen.slug == slug)).first():
        raise HTTPException(409, "Ya existe una pantalla con ese slug")
    orden = len(session.exec(select(Screen)).all())
    pantalla = Screen(nombre=data.nombre.strip(), slug=slug, orden=orden)
    session.add(pantalla)
    session.flush()
    for module_id in ("asistente", "sonido", "editor"):
        meta = MODULE_MAP[module_id]
        session.add(ModuleInstance(
            screen_id=int(pantalla.id), module_id=module_id, slot="overlay",
            orden=0, props_json=dumps({"abierto": False}), collapsed=meta["id"] == "editor",
        ))
    session.commit()
    session.refresh(pantalla)
    _sync_layout(session, int(pantalla.id))
    emit(session, "editor", "pantalla_creada", {"id": pantalla.id, "slug": slug})
    return screen_dict(pantalla)


@router.get("/api/screens/{slug}")
def obtener_pantalla(slug: str, session: Session = Depends(get_session)):
    pantalla = session.exec(select(Screen).where(Screen.slug == slug)).first()
    if not pantalla and slug.isdigit():
        pantalla = session.get(Screen, int(slug))
    if not pantalla:
        raise HTTPException(404, "Pantalla no encontrada")
    instancias = session.exec(
        select(ModuleInstance).where(ModuleInstance.screen_id == pantalla.id)
        .order_by(ModuleInstance.slot, ModuleInstance.orden, ModuleInstance.id)
    ).all()
    return {
        "pantalla": screen_dict(pantalla),
        "instancias": [_instancia_dict(i) for i in instancias],
        "modulos": MODULES,
        "slots": sorted(SLOTS),
    }


@router.patch("/api/screens/{screen_id}")
def renombrar_pantalla(screen_id: int, data: ScreenIn, session: Session = Depends(get_session)):
    pantalla = session.get(Screen, screen_id)
    if not pantalla:
        raise HTTPException(404, "Pantalla no encontrada")
    pantalla.nombre = data.nombre.strip()
    session.add(pantalla)
    session.commit()
    session.refresh(pantalla)
    emit(session, "editor", "pantalla_renombrada", {"id": pantalla.id})
    return screen_dict(pantalla)


@router.post("/api/screens/{screen_id}/instances")
def agregar_instancia(screen_id: int, data: InstanceIn, session: Session = Depends(get_session)):
    pantalla = session.get(Screen, screen_id)
    if not pantalla:
        raise HTTPException(404, "Pantalla no encontrada")
    meta = MODULE_MAP.get(data.module_id)
    if not meta:
        raise HTTPException(400, f"Módulo desconocido: {data.module_id}")
    slot = data.slot or ("overlay" if meta["overlay"] else meta["slot"])
    if slot not in SLOTS:
        raise HTTPException(400, f"Slot inválido: {slot}")
    if slot != "overlay" and meta["overlay"]:
        slot = "overlay"
    if meta["singleton"]:
        existente = session.exec(
            select(ModuleInstance).where(
                ModuleInstance.screen_id == screen_id,
                ModuleInstance.module_id == data.module_id,
            )
        ).first()
        if existente:
            raise HTTPException(409, f"El módulo {meta['nombre']} ya está en esta pantalla")
    hermanos = session.exec(
        select(ModuleInstance).where(
            ModuleInstance.screen_id == screen_id, ModuleInstance.slot == slot)
    ).all()
    inst = ModuleInstance(
        screen_id=screen_id, module_id=data.module_id, slot=slot,
        orden=len(hermanos), props_json=dumps(data.props), collapsed=data.collapsed,
    )
    session.add(inst)
    session.commit()
    session.refresh(inst)
    _sync_layout(session, screen_id)
    emit(session, "editor", "modulo_agregado", {"screen_id": screen_id, "module_id": data.module_id})
    return _instancia_dict(inst)


@router.patch("/api/screens/{screen_id}/instances/{instance_id}")
def editar_instancia(screen_id: int, instance_id: int, data: InstancePatch,
                     session: Session = Depends(get_session)):
    inst = session.get(ModuleInstance, instance_id)
    if not inst or inst.screen_id != screen_id:
        raise HTTPException(404, "Instancia no encontrada")
    if data.slot is not None:
        if data.slot not in SLOTS:
            raise HTTPException(400, "Slot inválido")
        meta = MODULE_MAP.get(inst.module_id) or {}
        inst.slot = "overlay" if (meta.get("overlay") or data.slot == "overlay") else data.slot
    if data.orden is not None:
        inst.orden = max(0, data.orden)
    if data.props is not None:
        inst.props_json = dumps(data.props)
    if data.collapsed is not None:
        inst.collapsed = data.collapsed
    session.add(inst)
    session.commit()
    session.refresh(inst)
    _sync_layout(session, screen_id)
    emit(session, "editor", "instancia_editada", {"id": instance_id, "slot": inst.slot})
    return _instancia_dict(inst)


@router.delete("/api/screens/{screen_id}/instances/{instance_id}")
def borrar_instancia(screen_id: int, instance_id: int, session: Session = Depends(get_session)):
    inst = session.get(ModuleInstance, instance_id)
    if not inst or inst.screen_id != screen_id:
        raise HTTPException(404, "Instancia no encontrada")
    meta = MODULE_MAP.get(inst.module_id) or {}
    if meta.get("overlay") and inst.module_id in ("asistente", "editor"):
        raise HTTPException(409, "Asistente y editor son parte del chasis; no se pueden quitar")
    session.delete(inst)
    session.commit()
    _sync_layout(session, screen_id)
    emit(session, "editor", "modulo_quitado", {"screen_id": screen_id, "module_id": inst.module_id})
    return {"ok": True}


# ----------------------------------------------------------------------- eventos
@router.get("/api/events")
def leer_eventos(since: int = 0, limit: int = 100, session: Session = Depends(get_session)):
    latest = ultimo_id(session)
    if since <= 0:
        return {"events": [], "latest": latest}
    from models import EventLog

    filas = session.exec(
        select(EventLog).where(EventLog.id > since).order_by(EventLog.id).limit(min(limit, 200))
    ).all()
    return {
        "latest": latest,
        "events": [{
            "id": e.id, "ts": e.ts, "modulo": e.modulo, "tipo": e.tipo,
            "payload": loads(e.payload_json, {}),
        } for e in filas],
    }


@router.get("/api/events/latest")
def evento_mas_reciente(session: Session = Depends(get_session)):
    return {"latest": ultimo_id(session)}


# ------------------------------------------------------------------------- reloj
class ModuloAccion(BaseModel):
    action: str = "sincronizar"


@router.get("/api/modules/reloj/state")
def estado_reloj():
    ahora = datetime.now().astimezone()
    return {
        "iso": ahora.isoformat(timespec="seconds"),
        "hora": ahora.strftime("%H:%M:%S"),
        "fecha": ahora.strftime("%A, %d de %B de %Y"),
        "zona": ahora.tzname() or "local",
    }


@router.post("/api/modules/reloj/action")
def accion_reloj(data: ModuloAccion, session: Session = Depends(get_session)):
    """Sincroniza el reloj de mesa con la hora del servidor."""
    if data.action not in ("sincronizar", "refrescar"):
        raise HTTPException(400, f"Acción no soportada: {data.action}")
    estado = estado_reloj()
    emit(session, "reloj", "sincronizado", {"hora": estado["hora"]})
    return {**estado, "action": data.action, "ok": True}


# ------------------------------------------------------------------------- notas
class NotasAccion(BaseModel):
    action: str
    texto: str | None = None


def _notas(session: Session) -> dict:
    fila = session.get(AppKv, "notas_mesa")
    datos = loads(fila.value_json, {}) if fila else {}
    return {"texto": datos.get("texto", ""), "ts": fila.ts if fila else None}


@router.get("/api/modules/notas/state")
def estado_notas(session: Session = Depends(get_session)):
    return _notas(session)


@router.post("/api/modules/notas/action")
def accion_notas(data: NotasAccion, session: Session = Depends(get_session)):
    if data.action != "guardar":
        raise HTTPException(400, "Acción no soportada")
    fila = session.get(AppKv, "notas_mesa")
    if fila:
        fila.value_json = dumps({"texto": data.texto or ""})
        fila.ts = datetime.now().astimezone().isoformat(timespec="seconds")
    else:
        fila = AppKv(key="notas_mesa", value_json=dumps({"texto": data.texto or ""}))
    session.add(fila)
    session.commit()
    emit(session, "notas", "guardadas", {"longitud": len(data.texto or "")})
    return _notas(session)


# ------------------------------------------------------------------------ estado
@router.get("/api/modules/estado/state")
def estado_partida(session: Session = Depends(get_session)):
    ctx = build_context(session)
    escena = ctx.get("escena_activa")
    ultima = (ctx.get("ultimas_tiradas") or [None])[0]
    return {
        "escena": {"id": escena["id"], "nombre": escena["nombre"], "tokens": len(escena["tokens"])} if escena else None,
        "mix": ctx["mix_reglas"],
        "personajes": len([p for p in ctx["personajes"] if p["kind"] == "personaje"]),
        "criaturas": len([p for p in ctx["personajes"] if p["kind"] == "criatura"]),
        "items": ctx["badges_de_modulos"]["inventario"],
        "ultima_tirada": ultima,
        "total_tiradas": ctx["badges_de_modulos"]["dado"],
        "npcs": len(ctx["npcs"]),
        "sonidos": len(ctx["sonidos_disponibles"]),
        "fecha": ctx["fecha"],
    }


@router.post("/api/modules/estado/action")
def accion_estado(data: ModuloAccion, session: Session = Depends(get_session)):
    """El módulo de estado es de solo lectura: devuelve su resumen actualizado."""
    if data.action not in ("resumen", "refrescar"):
        raise HTTPException(400, f"Acción no soportada: {data.action}")
    resumen = estado_partida(session)
    emit(session, "estado", "resumen", {"escena": (resumen.get("escena") or {}).get("nombre")})
    return {**resumen, "action": data.action, "ok": True}


# --------------------------------------------------------------------- proyector
@router.get("/api/modules/proyector/state")
def estado_proyector(session: Session = Depends(get_session)):
    ctx = build_context(session)
    return {
        "activa": ctx["escena_activa"],
        "table_state": ctx["table_state"],
        "mix_reglas": ctx["mix_reglas"],
        "personajes": [
            {"id": p["id"], "nombre": p["nombre"], "emoji": p["emoji"], "hp": p["hp"],
             "hp_max": p["hp_max"], "kind": p["kind"]}
            for p in ctx["personajes"]
        ],
        "ultima_tirada": (ctx["ultimas_tiradas"] or [None])[0],
        "fecha": ctx["fecha"],
    }


@router.post("/api/modules/proyector/action")
def accion_proyector(data: ModuloAccion, session: Session = Depends(get_session)):
    """Publica el estado actual para el proyector y avisa al bus de eventos."""
    if data.action not in ("publicar", "refrescar"):
        raise HTTPException(400, f"Acción no soportada: {data.action}")
    estado = estado_proyector(session)
    emit(session, "proyector", "publicado", estado["table_state"])
    return {**estado, "action": data.action, "ok": True}


# ------------------------------------------------------------------------ editor
class EditorAccion(BaseModel):
    action: str
    screen_id: int | None = None
    nombre: str | None = None
    slug: str | None = None
    module_id: str | None = None
    slot: str | None = None
    props: dict | None = None
    instance_id: int | None = None
    collapsed: bool | None = None


def _estado_editor(session: Session) -> dict:
    return {
        "pantallas": listar_pantallas(session),
        "modulos": MODULES,
        "slots": sorted(SLOTS),
    }


@router.get("/api/modules/editor/state")
def estado_editor(session: Session = Depends(get_session)):
    return _estado_editor(session)


@router.post("/api/modules/editor/action")
def accion_editor(data: EditorAccion, session: Session = Depends(get_session)):
    if data.action == "crear_pantalla":
        if not (data.nombre or "").strip():
            raise HTTPException(400, "La pantalla necesita un nombre")
        pantalla = crear_pantalla(ScreenIn(nombre=data.nombre.strip(), slug=data.slug), session)
        return {**_estado_editor(session), "ok": True, "pantalla": pantalla}

    if data.action == "anadir_modulo":
        if data.screen_id is None or not data.module_id:
            raise HTTPException(400, "Faltan screen_id o module_id")
        instancia = agregar_instancia(
            data.screen_id,
            InstanceIn(
                module_id=data.module_id, slot=data.slot,
                props=data.props or {}, collapsed=bool(data.collapsed),
            ),
            session,
        )
        return {**_estado_editor(session), "ok": True, "instancia": instancia}

    if data.action == "quitar_modulo":
        if data.screen_id is None or data.instance_id is None:
            raise HTTPException(400, "Faltan screen_id o instance_id")
        borrar_instancia(data.screen_id, data.instance_id, session)
        return {**_estado_editor(session), "ok": True}

    if data.action == "colapsar":
        if data.screen_id is None or data.instance_id is None:
            raise HTTPException(400, "Faltan screen_id o instance_id")
        instancia = editar_instancia(
            data.screen_id, data.instance_id,
            InstancePatch(collapsed=bool(data.collapsed)), session,
        )
        return {**_estado_editor(session), "ok": True, "instancia": instancia}

    raise HTTPException(400, f"Acción no soportada: {data.action}")


# ------------------------------------------------------------------- registro API
@router.get("/api/modules")
def listar_modulos(session: Session = Depends(get_session)):
    ctx = build_context(session)
    return {"modulos": MODULES, "badges": ctx["badges_de_modulos"]}
