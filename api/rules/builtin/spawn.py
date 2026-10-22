"""Spawn dX+Y contra el inventario real (doc 01 §3)."""
from __future__ import annotations

import random

from ..dice import sugerir_dado, tirar


def calcular_spawn(cantidad: int, rng: random.Random | None = None) -> dict:
    rng = rng or random
    sugerencia = sugerir_dado(cantidad)
    if not sugerencia.get("dado"):
        total = max(int(cantidad), 0)
        return {"cantidad": int(cantidad), "sugerencia": sugerencia,
                "expresion": sugerencia["expr"], "tiradas": [],
                "tirada_total": total, "spawneados": total,
                "sobrantes": 0, "nota": sugerencia["nota"]}
    t = tirar(sugerencia["expr"], rng)
    spawneados = max(0, min(t.total, int(cantidad)))
    return {
        "cantidad": int(cantidad),
        "sugerencia": sugerencia,
        "expresion": sugerencia["expr"],
        "tiradas": t.tiradas,
        "tirada_total": t.total,
        "spawneados": spawneados,
        "sobrantes": int(cantidad) - spawneados,
        "nota": f"{sugerencia['expr']} → {t.total}; spawnean {spawneados} de {cantidad}",
    }
