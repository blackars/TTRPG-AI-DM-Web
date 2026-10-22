"""Mythic Game Master Emulator: fate_check + event_meaning (tablas curadas)."""
from __future__ import annotations

import random

ODDS = {
    "imposible": 10,
    "casi imposible": 20,
    "muy improbable": 35,
    "improbable": 45,
    "50/50": 55,
    "media": 55,
    "probable": 65,
    "muy probable": 75,
    "casi seguro": 85,
    "seguro": 95,
}

ACCIONES = [
    "Atacar", "Perseguir", "Esconder", "Revelar", "Negociar",
    "Traicionar", "Ayudar", "Robar", "Destruir", "Crear",
    "Proteger", "Abandonar", "Investigar", "Escapar", "Descansar",
    "Viajar", "Invocar", "Sanar", "Corromper", "Celebrar",
]

SUJETOS = [
    "un aliado", "un enemigo", "el pasado", "el futuro", "un secreto",
    "una puerta", "el líder", "un objeto", "la naturaleza", "la ciudad",
    "un dios", "la muerte", "el grupo", "un extraño", "la magia",
    "una promesa", "el hogar", "un recuerdo", "la guerra", "la esperanza",
]


def _clamp(valor: int, minimo: int, maximo: int) -> int:
    return max(minimo, min(maximo, valor))


def fate_check(odds: str = "50/50", chaos: int = 5, tirada: int | None = None) -> dict:
    clave = (odds or "50/50").strip().lower()
    if clave not in ODDS:
        raise ValueError(f"probabilidad no válida: {odds!r}. Usa: {', '.join(ODDS)}")
    umbral = _clamp(ODDS[clave] + (int(chaos) - 5) * 5, 5, 95)
    t = int(tirada) if tirada is not None else random.randint(1, 100)
    exito = t <= umbral
    dobles = 11 <= t <= 99 and t % 11 == 0
    if exito and dobles:
        texto = "Sí, y además (excepcional)"
    elif exito:
        texto = "Sí"
    elif dobles:
        texto = "No, y además (excepcional)"
    else:
        texto = "No"
    return {"tirada": t, "umbral": umbral, "odds": clave, "chaos": int(chaos),
            "exito": exito, "excepcional": dobles, "texto": texto}


def event_meaning(tirada_accion: int | None = None, tirada_sujeto: int | None = None) -> dict:
    a = int(tirada_accion) if tirada_accion is not None else random.randint(1, 100)
    s = int(tirada_sujeto) if tirada_sujeto is not None else random.randint(1, 100)
    accion = ACCIONES[(a - 1) * len(ACCIONES) // 100]
    sujeto = SUJETOS[(s - 1) * len(SUJETOS) // 100]
    return {"accion": accion, "sujeto": sujeto, "texto": f"{accion} {sujeto}",
            "tiradas": [a, s]}
