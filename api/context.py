"""Agregador de contexto: cada módulo aporta su estado a un único JSON.

`GET /api/assistant/context` es el contrato fijo que consume la IA. Ningún módulo
nuevo puede quedarse fuera: añade aquí su contribución y su badge.
"""
from __future__ import annotations

import os
from datetime import datetime

from sqlmodel import Session, select

from models import (
    AiMessage, AppKv, Character, DiceLog, GameSave, InventoryItem,
    InventorySection, MiniLink, Npc, Scene, Screen, SoundAsset,
)
from serializers import character_dict, dice_dict, npc_dict, scene_dict, sound_dict
from rules.catalog import mix_texto, resumen_reglas
from rules.service import mix_actual
from utils import loads
import library as biblioteca


def _personajes_con_inventario(session: Session) -> list[dict]:
    personajes = session.exec(select(Character).order_by(Character.kind, Character.nombre)).all()
    secciones = session.exec(select(InventorySection)).all()
    items = session.exec(select(InventoryItem)).all()
    por_seccion: dict[int, list[InventoryItem]] = {}
    for item in items:
        por_seccion.setdefault(int(item.section_id), []).append(item)
    por_personaje: dict[int, list[dict]] = {}
    for sec in secciones:
        for item in por_seccion.get(int(sec.id), []):
            por_personaje.setdefault(int(sec.character_id), []).append({
                "seccion": sec.nombre, "nombre": item.nombre, "qty": item.qty,
                "icono": item.icono, "valor": item.valor,
            })
    salida = []
    for p in personajes:
        d = character_dict(p)
        inv = por_personaje.get(int(p.id), [])
        d["inventario_resumen"] = inv
        d["inventario_total_items"] = sum(i["qty"] for i in inv)
        salida.append(d)
    return salida


def build_context(session: Session) -> dict:
    mix, rs = mix_actual(session)
    escenas = session.exec(select(Scene).order_by(Scene.id)).all()
    escena_activa = next((e for e in escenas if e.activo), None)
    tiradas = session.exec(select(DiceLog).order_by(DiceLog.id.desc()).limit(20)).all()
    npcs = session.exec(select(Npc).order_by(Npc.nombre)).all()
    sonidos = session.exec(select(SoundAsset).order_by(SoundAsset.grupo, SoundAsset.nombre)).all()
    pantallas = session.exec(select(Screen).order_by(Screen.orden)).all()
    personajes = _personajes_con_inventario(session)
    saves = session.exec(select(GameSave)).all()
    mensajes = session.exec(select(AiMessage)).all()
    enlaces = session.exec(select(MiniLink)).all()
    notas = session.get(AppKv, "notas_mesa")
    biblioteca_ctx = biblioteca.contexto(session)

    activos = mix.get("activos", [])
    badges = {
        "reloj": 1,
        "notas": 1 if notas else 0,
        "estado": 1,
        "dado": len(tiradas),
        "inventario": len(session.exec(select(InventoryItem)).all()),
        "reglas": len(activos),
        "escenario": len(loads(escena_activa.tokens_json, [])) if escena_activa else 0,
        "escenarios": len(escenas),
        "proyector": 1 if escena_activa else 0,
        "sonido": len(sonidos),
        "personajes": len(personajes),
        "npcs": len(npcs),
        "partidas": len(saves),
        "asistente": len(mensajes),
        "minibase": len(enlaces),
        "biblioteca": int(biblioteca_ctx.get("catalogo_total", 0)),
        "editor": len(pantallas),
    }

    escena_dict = scene_dict(escena_activa) if escena_activa else None
    return {
        "fecha": datetime.now().astimezone().isoformat(timespec="seconds"),
        "version": 1,
        "mix_reglas": {
            "ruleset_id": rs.id if rs else None,
            "ruleset_nombre": rs.nombre if rs else "Sin ruleset",
            "activos": activos,
            "reglas": resumen_reglas(activos),
            "opciones": mix.get("opciones", {}),
            "texto": mix_texto(mix),
        },
        "ultimas_tiradas": [dice_dict(d) for d in tiradas],
        "escena_activa": escena_dict,
        "escenas": [{"id": e.id, "nombre": e.nombre, "activo": e.activo} for e in escenas],
        "personajes": personajes,
        "npcs": [npc_dict(n) for n in npcs],
        "sonidos_disponibles": [sound_dict(s) for s in sonidos],
        "badges_de_modulos": badges,
        "pantallas": [{"slug": p.slug, "nombre": p.nombre} for p in pantallas],
        "notas_dm": loads(notas.value_json, {}).get("texto", "") if notas else "",
        "minibase": {
            "configurado": bool(os.environ.get("MINIBASE_URL")),
            "enlaces": len(enlaces),
        },
        "biblioteca": biblioteca_ctx,
        "table_state": {
            "phase": "narrativa",
            "grid_visible": bool((escena_dict or {}).get("presentacion", {}).get("grid_visible", True)),
            "grid_cm": (escena_dict or {}).get("presentacion", {}).get("grid_cm", 2.5),
            "mapa_url": (escena_dict or {}).get("presentacion", {}).get("mapa_url", ""),
            "tokens": escena_dict["tokens"] if escena_dict else [],
        },
    }
