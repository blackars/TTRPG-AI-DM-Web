"""Serializadores comunes para no repetir formatos en cada módulo."""
from __future__ import annotations

import re
import uuid
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
    "efectos": [],
}

COLOR_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")

MAX_EFECTOS = 24
EXT_EFECTO_IMAGEN = {".png", ".webp", ".gif", ".apng", ".jpg", ".jpeg", ".avif"}
EXT_EFECTO_VIDEO = {".mp4", ".webm"}
EXTENSIONES_EFECTO = EXT_EFECTO_IMAGEN | EXT_EFECTO_VIDEO
PATRONES_LUZ = {"radial", "conico", "lineal", "ondas"}
MEZCLAS_EFECTO = {
    "normal", "screen", "overlay", "soft-light", "multiply", "color-dodge", "plus-lighter",
}
ANIMACIONES_EFECTO = {"ninguna", "deriva", "pulso", "parpadeo", "rotar"}
AJUSTES_EFECTO = {"contain", "cover", "fill"}

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


def _texto_corto(valor, defecto: str, maximo: int) -> str:
    texto = str(valor or "").strip()
    return (texto or defecto)[:maximo]


def _id_efecto(valor) -> str:
    limpio = re.sub(r"[^A-Za-z0-9_-]", "", str(valor or ""))[:36]
    return limpio or f"ef-{uuid.uuid4().hex[:10]}"


def normalizar_efecto(raw: dict | None) -> dict | None:
    """Normaliza una capa de luz/textura que se pinta sobre el tablero."""
    if not isinstance(raw, dict):
        return None
    tipo = _texto_corto(raw.get("tipo"), "luz", 12).lower()
    if tipo not in ("luz", "textura"):
        tipo = "luz"
    # El frontend recibe la URL pública, no la ruta interna. Si vuelve a enviar
    # la capa, recuperamos el archivo desde `/escenas-assets/<nombre>`.
    archivo = Path(str(raw.get("archivo") or raw.get("url") or "")).name
    if archivo.startswith("."):
        archivo = ""
    patron = _texto_corto(raw.get("patron"), "radial", 12).lower()
    if patron not in PATRONES_LUZ:
        patron = "radial"
    color = _texto_corto(raw.get("color"), "#ffb347", 9)
    if not COLOR_HEX.match(color):
        color = "#ffb347"
    color2 = _texto_corto(raw.get("color2"), "#ff5c8a", 9)
    if not COLOR_HEX.match(color2):
        color2 = "#ff5c8a"
    mezcla = _texto_corto(raw.get("mezcla"), "screen" if tipo == "luz" else "normal", 20)
    if mezcla not in MEZCLAS_EFECTO:
        mezcla = "screen" if tipo == "luz" else "normal"
    animacion = _texto_corto(raw.get("animacion"), "ninguna", 12)
    if animacion not in ANIMACIONES_EFECTO:
        animacion = "ninguna"
    ajuste = _texto_corto(raw.get("ajuste"), "contain", 12)
    if ajuste not in AJUSTES_EFECTO:
        ajuste = "contain"
    rotacion = _numero(raw.get("rotacion"), 0.0, -360.0, 360.0)
    if rotacion > 180:
        rotacion -= 360
    if rotacion < -180:
        rotacion += 360
    return {
        "id": _id_efecto(raw.get("id")),
        "tipo": tipo,
        "nombre": _texto_corto(raw.get("nombre"), "Luz ambiental" if tipo == "luz" else "Textura", 60),
        "archivo": archivo if tipo == "textura" else "",
        "patron": patron,
        "color": color,
        "color2": color2,
        "x": _numero(raw.get("x"), 50.0, 0.0, 100.0),
        "y": _numero(raw.get("y"), 50.0, 0.0, 100.0),
        "ancho": _numero(raw.get("ancho"), 60.0, 1.0, 300.0),
        "alto": _numero(raw.get("alto"), 60.0, 1.0, 300.0),
        "rotacion": rotacion,
        "opacidad": _numero(raw.get("opacidad"), 0.55 if tipo == "luz" else 0.82, 0.0, 1.0),
        "mezcla": mezcla,
        "animacion": animacion,
        "velocidad": _numero(raw.get("velocidad"), 1.0, 0.1, 5.0),
        "suavizado": _numero(raw.get("suavizado"), 18.0 if tipo == "luz" else 0.0, 0.0, 100.0),
        "ajuste": ajuste,
        "encima_tokens": _booleano(raw.get("encima_tokens"), False),
        "anclado_mapa": _booleano(raw.get("anclado_mapa"), False),
        "visible": _booleano(raw.get("visible"), True),
    }


def normalizar_presentacion(raw: dict | None) -> dict:
    """Normaliza y limita la configuración de imagen/rejilla/efectos de una escena."""
    datos = {**PRESENTACION_BASE, **(raw if isinstance(raw, dict) else {})}
    mapa = Path(str(datos.get("mapa") or "")).name
    if mapa.startswith("."):
        mapa = ""
    rotacion = _numero(datos.get("rotacion"), 0.0, -360.0, 360.0)
    if rotacion > 180:
        rotacion -= 360
    if rotacion < -180:
        rotacion += 360
    color = str(datos.get("grid_color") or PRESENTACION_BASE["grid_color"])
    efectos_raw = datos.get("efectos")
    efectos = []
    if isinstance(efectos_raw, list):
        for item in efectos_raw[:MAX_EFECTOS]:
            efecto = normalizar_efecto(item)
            if efecto:
                efectos.append(efecto)
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
        "efectos": efectos,
    }


def efecto_dict(efecto: dict) -> dict:
    """Versión pública de un efecto: resuelve el archivo servido."""
    datos = {**efecto}
    archivo = Path(str(datos.pop("archivo", "") or "")).name
    sufijo = Path(archivo).suffix.lower()
    datos["url"] = ""
    if archivo and (ESCENARIOS_DIR / archivo).is_file():
        datos["url"] = f"/escenas-assets/{quote(archivo)}"
    if datos.get("tipo") == "textura":
        datos["tipo_archivo"] = "video" if sufijo in EXT_EFECTO_VIDEO else "imagen"
    else:
        datos["tipo_archivo"] = "css"
    return datos


def presentacion_dict(raw: dict | None) -> dict:
    """Versión pública: añade la URL servida del mapa/efectos y oculta rutas internas."""
    datos = normalizar_presentacion(raw)
    mapa = datos.pop("mapa")
    datos["mapa_url"] = ""
    if mapa and (ESCENARIOS_DIR / mapa).is_file():
        datos["mapa_url"] = f"/escenas-assets/{quote(mapa)}"
    datos["efectos"] = [efecto_dict(e) for e in datos.get("efectos", [])]
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
