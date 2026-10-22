"""Motor autoritativo de dados (portado de TTRPG-AI-DM/jev/dice.py).

Soporta d4, d6, d8, d10, d12, d20, d100, dF, NdX±M. La animación del frontend
es decorativa: el resultado que se muestra es SIEMPRE este.
"""
from __future__ import annotations

import random
import re
from dataclasses import dataclass

DADOS = [4, 6, 8, 10, 12, 20]
_EXPR = re.compile(r"^\s*(\d*)d(\d+|F)\s*([+-]\s*\d+)?\s*$", re.IGNORECASE)


@dataclass
class Tirada:
    expr: str
    tiradas: list[int]
    mod: int
    total: int


def tirar(expr: str, rng: random.Random | None = None) -> Tirada:
    rng = rng or random
    m = _EXPR.match(expr or "")
    if not m:
        raise ValueError(f"expresión de dado inválida: {expr!r}")
    n = int(m.group(1) or 1)
    caras_txt = m.group(2)
    mod = int((m.group(3) or "0").replace(" ", ""))
    if n < 1 or n > 100:
        raise ValueError("cantidad de dados fuera de rango (1-100)")
    if caras_txt.upper() == "F":
        tiradas = [rng.choice([-1, 0, 1]) for _ in range(n)]
    else:
        caras = int(caras_txt)
        if caras not in (4, 6, 8, 10, 12, 20, 100):
            raise ValueError(f"dado no soportado: d{caras}")
        tiradas = [rng.randint(1, caras) for _ in range(n)]
    return Tirada(expr=(expr or "").strip(), tiradas=tiradas, mod=mod, total=sum(tiradas) + mod)


def sugerir_dado(cantidad: int) -> dict:
    """Dado+mod tal que max(dado)+mod = cantidad, con |mod| mínimo."""
    cantidad = int(cantidad)
    if cantidad <= 0:
        return {"expr": "0", "dado": 0, "mod": 0, "nota": "nada que spawnear"}
    if cantidad == 1:
        return {"expr": "1", "dado": 0, "mod": 0, "nota": "C=1: spawn directo sin tirada"}
    if cantidad > 40:
        mod = cantidad - 40
        expr = "2d20" + (f"{mod:+d}" if mod else "")
        return {"expr": expr, "dado": "2d20", "mod": mod,
                "nota": "C>40: combinar 2d20 + mod (doc 01 §3)"}
    mejor: tuple | None = None
    for dado in DADOS:
        mod = cantidad - dado
        score = (abs(mod), -mod)  # menor |mod|; en empate, prefiere mod positivo
        if mejor is None or score < mejor[0]:
            mejor = (score, dado, mod)
    assert mejor is not None
    _, dado, mod = mejor
    expr = f"d{dado}" + (f"{mod:+d}" if mod else "")
    return {"expr": expr, "dado": dado, "mod": mod,
            "nota": f"max d{dado}{mod:+d} = {cantidad}".replace("+0", "")}
