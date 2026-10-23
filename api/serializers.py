"""Serializadores comunes para no repetir formatos en cada módulo."""
from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import quote

from db import ESCENARIOS_DIR
from models import (
    Character, DiceLog, InventoryItem, InventorySection, Npc, Scene, Screen,
    SoundAsset,
)
from utils import loads

PRESENTACION_BASE = {
    "mapa": "",
    "zoom": 1.0,
    "rotacion": 0.0,
    "pan_x": 0.0,
    "pan_y": 0.0,
    "grid_visible": True,
    "grid_cm": 2.5,
    "grid_color": "#22ff88",
    "grid_opacity": 0.6,
}

COLOR_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def _numero(valor, defecto: float, minimo: float, maximo: float) -> float:
    try:
        numero = float(valor)
    except (TypeError, ValueError):
        return defecto
    return max(minimo, min(maximo, numero))


def _booleano(valor, defecto: bool = True) -> bool:
    if isinstance(valor, bool):
        return valor
    if isinstance(valor, (int, float)):
        return bool(valor)
    if isinstance(valor, str):
        return valor.strip().lower() not in ("", "0", "false", "no", "off")
    return defecto


def normalizar_presentacion(raw: dict | None) -> dict:
    """Normaliza y limita la configuración de imagen/rejilla de una escena."""
    datos = {**PRESENTACION_BASE, **(raw or {})}
    mapa = Path(str(datos.get("mapa") or "")).name
    if mapa.startswith("."):
        mapa = ""
    rotacion = _numero(datos.get("rotacion"), 0.0, -360.0, 360.0)
    if rotacion > 180:
        rotacion -= 360
    if rotacion < -180:
        rotacion += 360
    color = str(datos.get("grid_color") or PRESENTACION_BASE["grid_color"])
    return {
        "mapa": mapa,
        "zoom": _numero(datos.get("zoom"), 1.0, 0.2, 8.0),
        "rotacion": rotacion,
        "pan_x": _numero(datos.get("pan_x"), 0.0, -100.0, 100.0),
        "pan_y": _numero(datos.get("pan_y"), 0.0, -100.0, 100.0),
        "grid_visible": _booleano(datos.get("grid_visible"), True),
        "grid_cm": _numero(datos.get("grid_cm"), 2.5, 0.4, 20.0),
        "grid_color": color if COLOR_HEX.match(color) else PRESENTACION_BASE["grid_color"],
        "grid_opacity": _numero(datos.get("grid_opacity"), 0.6, 0.0, 1.0),
    }


def presentacion_dict(raw: dict | None) -> dict:
    """Versión pública: añade la URL servida del mapa y oculta la ruta interna."""
    datos = normalizar_presentacion(raw)
    mapa = datos.pop("mapa")
    datos["mapa_url"] = ""
    if mapa and (ESCENARIOS_DIR / mapa).is_file():
        datos["mapa_url"] = f"/escenas-assets/{quote(mapa)}"
    return datos


def character_dict(c: Character) -> dict:
    return {
        "id": c.id, "nombre": c.nombre, "kind": c.kind, "emoji": c.emoji,
        "hp": c.hp, "hp_max": c.hp_max, "notas": c.notas,
        "stats": loads(c.stats_json, {}), "created_at": c.created_at,
    }


def section_dict(s: InventorySection) -> dict:
    return {"id": s.id, "character_id": s.character_id, "nombre": s.nombre, "orden": s.orden}


def item_dict(i: InventoryItem) -> dict:
    return {
        "id": i.id, "section_id": i.section_id, "nombre": i.nombre, "qty": i.qty,
        "valor": i.valor, "nota": i.nota, "icono": i.icono,
        "token_path": i.token_path, "external_key": i.external_key,
        "created_at": i.created_at,
    }


def dice_dict(d: DiceLog) -> dict:
    return {
        "id": d.id, "expr": d.expr, "tiradas": loads(d.tiradas_json, []),
        "mod": d.mod, "total": d.total, "razon": d.razon, "modo": d.modo,
        "personaje": d.personaje, "ts": d.ts,
    }


def scene_dict(s: Scene) -> dict:
    return {
        "id": s.id, "nombre": s.nombre, "descripcion": s.descripcion, "bg": s.bg,
        "light": loads(s.light_json, {"color": "#f5b544", "opacity": 0.18}),
        "tokens": loads(s.tokens_json, []), "playlist": loads(s.playlist_json, []),
        "presentacion": presentacion_dict(loads(s.presentacion_json, {})),
        "activo": s.activo, "ts": s.ts,
    }


def sound_dict(s: SoundAsset) -> dict:
    return {
        "id": s.id, "nombre": s.nombre, "grupo": s.grupo, "src": s.src,
        "loop": s.loop, "volumen": s.volumen, "sintetico": s.sintetico,
    }


def npc_dict(n: Npc) -> dict:
    return {
        "id": n.id, "nombre": n.nombre, "voz": n.voz, "tono": n.tono,
        "frases": loads(n.phrases_json, []), "notas": n.notas, "ts": n.ts,
    }


def screen_dict(s: Screen) -> dict:
    return {
        "id": s.id, "nombre": s.nombre, "slug": s.slug,
        "orden": s.orden, "layout": loads(s.layout_json, {}), "ts": s.ts,
    }
