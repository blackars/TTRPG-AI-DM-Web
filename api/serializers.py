"""Serializadores comunes para no repetir formatos en cada módulo."""
from __future__ import annotations

from models import (
    Character, DiceLog, InventoryItem, InventorySection, Npc, Scene, Screen,
    SoundAsset,
)
from utils import loads


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
