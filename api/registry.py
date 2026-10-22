"""Registro único de módulos del sistema.

El frontend mantiene su gemelo en `web/src/modules/registry.tsx`. Este registro
es la fuente de verdad para validar el editor de pantallas y para los badges que
consume el asistente. Ningún módulo se hardcodea en una pantalla.
"""
from __future__ import annotations

MODULES: list[dict] = [
    {
        "id": "reloj",
        "nombre": "Reloj de mesa",
        "icono": "🕰️",
        "descripcion": "Hora local, fecha y duración de la sesión.",
        "slot": "lateral",
        "overlay": False,
        "singleton": True,
    },
    {
        "id": "notas",
        "nombre": "Notas del DM",
        "icono": "📝",
        "descripcion": "Cuaderno persistente de la partida, visible para la IA.",
        "slot": "inferior",
        "overlay": False,
        "singleton": True,
    },
    {
        "id": "estado",
        "nombre": "Estado de partida",
        "icono": "📊",
        "descripcion": "Resumen vivo: escena, reglas, personajes y última tirada.",
        "slot": "lateral",
        "overlay": False,
        "singleton": True,
    },
    {
        "id": "dado",
        "nombre": "Dados",
        "icono": "🎲",
        "descripcion": "Tiradas NdX±M con animación 2D/3D e historial autoritativo.",
        "slot": "principal",
        "overlay": False,
        "singleton": True,
    },
    {
        "id": "inventario",
        "nombre": "Inventario",
        "icono": "🎒",
        "descripcion": "Secciones, items con emoji, detalle editable y búsqueda.",
        "slot": "principal",
        "overlay": False,
        "singleton": True,
    },
    {
        "id": "reglas",
        "nombre": "Núcleos de reglas",
        "icono": "🧬",
        "descripcion": "Mezcla d20 + ventaja + Mythic + spawn y rulesets guardados.",
        "slot": "principal",
        "overlay": False,
        "singleton": True,
    },
    {
        "id": "escenario",
        "nombre": "Escenario activo",
        "icono": "🗺️",
        "descripcion": "Tablero 12×9 con tokens, luz y tokens movibles por clic.",
        "slot": "principal",
        "overlay": False,
        "singleton": True,
    },
    {
        "id": "escenarios",
        "nombre": "Escenarios",
        "icono": "🎭",
        "descripcion": "Catálogo de escenas, edición, activación y playlist.",
        "slot": "lateral",
        "overlay": False,
        "singleton": True,
    },
    {
        "id": "proyector",
        "nombre": "Proyector",
        "icono": "📺",
        "descripcion": "Vista a pantalla completa de la escena activa para el segundo monitor.",
        "slot": "principal",
        "overlay": False,
        "singleton": True,
    },
    {
        "id": "sonido",
        "nombre": "Sonido ambiente",
        "icono": "🔊",
        "descripcion": "Biblioteca de sonidos, volumen, loop y crossfade por escena.",
        "slot": "overlay",
        "overlay": True,
        "singleton": True,
    },
    {
        "id": "personajes",
        "nombre": "Personajes y criaturas",
        "icono": "🧙",
        "descripcion": "Fichas editables con HP, stats libres y envío al tablero.",
        "slot": "lateral",
        "overlay": False,
        "singleton": True,
    },
    {
        "id": "npcs",
        "nombre": "NPCs",
        "icono": "💬",
        "descripcion": "Voces, tonos y frases; redacción de textos NPC con IA.",
        "slot": "lateral",
        "overlay": False,
        "singleton": True,
    },
    {
        "id": "partidas",
        "nombre": "Partidas guardadas",
        "icono": "💾",
        "descripcion": "Snapshots completos, carga, borrado y export/import JSON.",
        "slot": "principal",
        "overlay": False,
        "singleton": True,
    },
    {
        "id": "asistente",
        "nombre": "Asistente IA",
        "icono": "✨",
        "descripcion": "Chat DM que lee todo el contexto y propone acciones ejecutables.",
        "slot": "overlay",
        "overlay": True,
        "singleton": True,
    },
    {
        "id": "minibase",
        "nombre": "MiniBase",
        "icono": "🧩",
        "descripcion": "Búsqueda e importación opcional de minis reales (fase M9, read-only).",
        "slot": "lateral",
        "overlay": False,
        "singleton": True,
    },
    {
        "id": "editor",
        "nombre": "Editor de pantallas",
        "icono": "🧰",
        "descripcion": "Añade, quita o superpone módulos; el layout persiste en SQLite.",
        "slot": "overlay",
        "overlay": True,
        "singleton": True,
    },
]

MODULE_IDS = {m["id"] for m in MODULES}
MODULE_MAP = {m["id"]: m for m in MODULES}
SLOTS = {"principal", "lateral", "inferior", "overlay"}


def meta(module_id: str) -> dict | None:
    return MODULE_MAP.get(module_id)
