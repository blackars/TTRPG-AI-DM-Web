"""Núcleo d20: d20 + atributo/mod vs DC, crítico 20/1, ventaja/desventaja."""
from __future__ import annotations

import random


def check(atributo: int = 0, mod: int = 0, dificultad: int = 15, modo: str = "normal",
          rng: random.Random | None = None) -> dict:
    rng = rng or random
    modo = (modo or "normal").lower()
    if modo == "ventaja":
        dados = [rng.randint(1, 20), rng.randint(1, 20)]
        tirada = max(dados)
    elif modo == "desventaja":
        dados = [rng.randint(1, 20), rng.randint(1, 20)]
        tirada = min(dados)
    else:
        dados = [rng.randint(1, 20)]
        tirada = dados[0]
    total = tirada + int(atributo) + int(mod)
    if tirada == 20:
        grado = "crítico"
    elif tirada == 1:
        grado = "pifia"
    elif total >= int(dificultad):
        grado = "éxito"
    else:
        grado = "fallo"
    return {
        "tirada": tirada,
        "dados": dados,
        "atributo": int(atributo),
        "mod": int(mod),
        "total": total,
        "dificultad": int(dificultad),
        "modo": modo,
        "exito": grado in ("éxito", "crítico"),
        "grado": grado,
    }
