"""Mythic Game Master Emulator: oráculo, eventos y ajuste de escenas.

Las tablas son curadas y compatibles con el estilo Mythic; no reproducen
literalmente las tablas comerciales. Todas las tiradas se resuelven en el
backend para que queden en el historial.
"""
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

FOCOS = [
    (1, 10, "Acción de PNJ"),
    (11, 20, "PNJ negativo"),
    (21, 30, "PNJ positivo"),
    (31, 40, "Avanzar hacia un hilo"),
    (41, 50, "Alejarse de un hilo"),
    (51, 60, "Cerrar un hilo"),
    (61, 70, "Introducir PNJ nuevo"),
    (71, 80, "Introducir hilo nuevo"),
    (81, 90, "Evento remoto"),
    (91, 100, "Evento ambiguo"),
]

DESCRIPTORES = [
    "Abrupto", "Alegre", "Amenazante", "Antiguo", "Apresurado",
    "Astuto", "Caótico", "Cuidadoso", "Débil", "Desconocido",
    "Doloroso", "Elegante", "Extraño", "Frío", "Fuerte",
    "Hermoso", "Hostil", "Iluminado", "Inesperado", "Íntimo",
    "Justo", "Lento", "Misterioso", "Oculto", "Peligroso",
    "Pequeño", "Poderoso", "Roto", "Sagrado", "Sutil",
    "Tenso", "Terrible", "Triste", "Urgente", "Vacío",
    "Valiente", "Veloz", "Violento", "Vivo", "Vulnerable",
]

AJUSTES = [
    (1, 4, "Escena esperada", "La escena sigue el plan; no hay sorpresas."),
    (5, 7, "Escena alterada", "La escena cambia de tono, lugar o detalle importante."),
    (8, 9, "Escena interrumpida", "Algo irrumpe: un ataque, una noticia o una llegada inesperada."),
    (10, 10, "Escena excepcional", "La escena da un giro mayor y puede abrir o cerrar un hilo."),
]


def _clamp(valor: int, minimo: int, maximo: int) -> int:
    return max(minimo, min(maximo, valor))


def _d100(tirada: int | None = None) -> int:
    return int(tirada) if tirada is not None else random.randint(1, 100)


def _por_rango(tabla: list[tuple[int, int, str]], tirada: int) -> str:
    for minimo, maximo, texto in tabla:
        if minimo <= tirada <= maximo:
            return texto
    return tabla[-1][2]


def fate_check(odds: str = "50/50", chaos: int = 5, tirada: int | None = None) -> dict:
    clave = (odds or "50/50").strip().lower()
    if clave not in ODDS:
        raise ValueError(f"probabilidad no válida: {odds!r}. Usa: {', '.join(ODDS)}")
    umbral = _clamp(ODDS[clave] + (int(chaos) - 5) * 5, 5, 95)
    t = _d100(tirada)
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
    return {
        "tirada": t,
        "umbral": umbral,
        "odds": clave,
        "chaos": int(chaos),
        "exito": exito,
        "excepcional": dobles,
        "texto": texto,
    }


def event_meaning(tirada_accion: int | None = None, tirada_sujeto: int | None = None) -> dict:
    a = _d100(tirada_accion)
    s = _d100(tirada_sujeto)
    accion = ACCIONES[(a - 1) * len(ACCIONES) // 100]
    sujeto = SUJETOS[(s - 1) * len(SUJETOS) // 100]
    return {
        "accion": accion,
        "sujeto": sujeto,
        "texto": f"{accion} {sujeto}",
        "tiradas": [a, s],
    }


def event_focus(tirada: int | None = None) -> dict:
    t = _d100(tirada)
    return {"tirada": t, "texto": _por_rango(FOCOS, t)}


def descriptor(tirada: int | None = None) -> dict:
    t = _d100(tirada)
    return {"tirada": t, "texto": DESCRIPTORES[(t - 1) * len(DESCRIPTORES) // 100]}


def scene_adjustment(tirada: int | None = None) -> dict:
    t = int(tirada) if tirada is not None else random.randint(1, 10)
    for minimo, maximo, texto, detalle in AJUSTES:
        if minimo <= t <= maximo:
            return {"tirada": t, "texto": texto, "detalle": detalle}
    return {"tirada": t, "texto": AJUSTES[-1][2], "detalle": AJUSTES[-1][3]}


def random_event(
    tirada_foco: int | None = None,
    tirada_accion: int | None = None,
    tirada_sujeto: int | None = None,
    tirada_descriptor: int | None = None,
) -> dict:
    foco = event_focus(tirada_foco)
    significado = event_meaning(tirada_accion, tirada_sujeto)
    desc = descriptor(tirada_descriptor)
    return {
        "foco": foco,
        "accion": significado["accion"],
        "sujeto": significado["sujeto"],
        "descriptor": desc["texto"],
        "texto": f"{foco['texto']}: {significado['texto']} ({desc['texto'].lower()})",
        "tiradas": [foco["tirada"], *significado["tiradas"], desc["tirada"]],
    }


def generar(tipo: str, **kwargs) -> dict:
    tipo = (tipo or "").strip().lower()
    if tipo in {"pregunta", "fate", "si-no", "sino"}:
        return fate_check(
            odds=kwargs.get("odds", "50/50"),
            chaos=kwargs.get("chaos", 5),
            tirada=kwargs.get("tirada"),
        )
    if tipo in {"evento", "significado", "event_meaning"}:
        return event_meaning(kwargs.get("tirada_accion"), kwargs.get("tirada_sujeto"))
    if tipo in {"foco", "event_focus"}:
        return event_focus(kwargs.get("tirada"))
    if tipo in {"descriptor", "descriptor_evento"}:
        return descriptor(kwargs.get("tirada"))
    if tipo in {"escena", "scene", "ajuste"}:
        return scene_adjustment(kwargs.get("tirada"))
    if tipo in {"completo", "evento_completo", "random_event"}:
        return random_event(
            kwargs.get("tirada_foco"),
            kwargs.get("tirada_accion"),
            kwargs.get("tirada_sujeto"),
            kwargs.get("tirada_descriptor"),
        )
    raise ValueError(
        "tipo de generador no válido; usa pregunta, evento, foco, descriptor, escena o completo."
    )
