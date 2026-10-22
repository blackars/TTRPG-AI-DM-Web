"""Catálogo de núcleos de reglas mezclables + normalización del mix activo."""
from __future__ import annotations

from copy import deepcopy

REGLAS: list[dict] = [
    {
        "id": "d20",
        "nombre": "Chequeo d20",
        "icono": "🎯",
        "aporta": "Resuelve acciones inciertas con d20 + modificador contra una dificultad (CD).",
        "ejemplo": "Kaelen fuerza la puerta: d20+4 vs CD 15 → 17, éxito.",
        "dados": "d20",
        "depende": [],
        "opciones": [
            {"key": "dificultad", "label": "CD por defecto", "tipo": "number", "default": 15},
            {"key": "modo", "label": "Modo de tirada", "tipo": "select",
             "opciones": ["normal", "ventaja", "desventaja"], "default": "normal"},
        ],
    },
    {
        "id": "ventaja",
        "nombre": "Ventaja / desventaja",
        "icono": "⚖️",
        "aporta": "Permite tirar 2d20 y quedarse el mayor (ventaja) o el menor (desventaja).",
        "ejemplo": "Atacar a un enemigo derribado: 2d20, se queda el 18.",
        "dados": "2d20",
        "depende": ["d20"],
        "opciones": [],
    },
    {
        "id": "mythic",
        "nombre": "Mythic GM Emulator",
        "icono": "🔮",
        "aporta": "Responde preguntas sí/no con caos y genera significados de evento 100×100.",
        "ejemplo": "¿La cripta está vigilada? 50/50, caos 6 → Sí, y además.",
        "dados": "d100",
        "depende": [],
        "opciones": [
            {"key": "odds", "label": "Probabilidad", "tipo": "select",
             "opciones": ["imposible", "casi imposible", "muy improbable", "improbable",
                          "50/50", "probable", "muy probable", "casi seguro", "seguro"],
             "default": "50/50"},
            {"key": "chaos", "label": "Caos (1-9)", "tipo": "number", "default": 5},
        ],
    },
    {
        "id": "spawn",
        "nombre": "Spawn dX+Y",
        "icono": "👹",
        "aporta": "Sugiere el dado y modificador que reproducen exactamente una cantidad de criaturas.",
        "ejemplo": "23 trasgos → d20+3; si sale 18, aparecen 18 y quedan 5 en reserva.",
        "dados": "dX",
        "depende": [],
        "opciones": [],
    },
]

REGLAS_MAP = {r["id"]: r for r in REGLAS}
ORDEN_REGLAS = [r["id"] for r in REGLAS]

OPCIONES_DEFECTO: dict[str, dict] = {}
for _regla in REGLAS:
    OPCIONES_DEFECTO[_regla["id"]] = {
        op["key"]: op["default"] for op in _regla.get("opciones", [])
    }

MIX_INICIAL = {
    "activos": ["d20", "ventaja", "mythic", "spawn"],
    "opciones": deepcopy(OPCIONES_DEFECTO),
}


def normalizar_mix(mix: dict | None) -> dict:
    mix = mix or {}
    activos = [r for r in (mix.get("activos") or []) if r in REGLAS_MAP]
    # orden canónico, sin duplicados
    activos = [r for r in ORDEN_REGLAS if r in activos]
    opciones = deepcopy(OPCIONES_DEFECTO)
    for regla_id, valores in (mix.get("opciones") or {}).items():
        if regla_id in opciones and isinstance(valores, dict):
            opciones[regla_id].update(valores)
    # coherencia: ventaja solo tiene sentido con d20
    if "ventaja" in activos and "d20" not in activos:
        activos.remove("ventaja")
    if "ventaja" not in activos:
        opciones["d20"]["modo"] = "normal"
    try:
        opciones["d20"]["dificultad"] = max(1, min(40, int(opciones["d20"].get("dificultad", 15))))
    except (TypeError, ValueError):
        opciones["d20"]["dificultad"] = 15
    try:
        opciones["mythic"]["chaos"] = max(1, min(9, int(opciones["mythic"].get("chaos", 5))))
    except (TypeError, ValueError):
        opciones["mythic"]["chaos"] = 5
    return {"activos": activos, "opciones": opciones}


def mix_texto(mix: dict) -> str:
    activos = mix.get("activos") or []
    partes: list[str] = []
    if "d20" in activos:
        modo = mix["opciones"]["d20"].get("modo", "normal")
        extra = f" con {modo}" if modo != "normal" else ""
        partes.append(f"d20+mod vs CD {mix['opciones']['d20'].get('dificultad', 15)}{extra}")
    if "ventaja" in activos:
        partes.append("ventaja/desventaja 2d20")
    if "mythic" in activos:
        partes.append(f"Mythic (caos {mix['opciones']['mythic'].get('chaos', 5)}) para sí/no y eventos")
    if "spawn" in activos:
        partes.append("spawn dX+Y para cantidades de criaturas")
    return " + ".join(partes) if partes else "Sin núcleos activos: solo dados libres"


def resumen_reglas(activos: list[str]) -> list[dict]:
    return [
        {"id": r["id"], "nombre": r["nombre"], "icono": r["icono"], "aporta": r["aporta"]}
        for r in REGLAS if r["id"] in activos
    ]
