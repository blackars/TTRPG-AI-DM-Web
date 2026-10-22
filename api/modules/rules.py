"""Módulo Reglas: catálogo mezclable, rulesets guardados y ejecución de checks."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from db import get_session
from events import emit
from models import DiceLog, Ruleset
from rules.builtin import d20 as regla_d20
from rules.builtin import mythic, spawn
from rules.catalog import REGLAS, REGLAS_MAP, mix_texto, normalizar_mix
from rules.service import activar, guardar_mix_activo, mix_actual
from serializers import dice_dict
from utils import dumps, loads

router = APIRouter(tags=["reglas"])


class ReglasAccion(BaseModel):
    action: str
    rule_id: str | None = None
    activo: bool | None = None
    key: str | None = None
    value: str | int | float | None = None
    ruleset_id: int | None = None
    nombre: str | None = None
    # checks
    atributo: int = 0
    mod: int = 0
    dificultad: int | None = None
    modo: str | None = None
    razon: str = ""
    pregunta: str = ""
    odds: str | None = None
    chaos: int | None = None
    cantidad: int | None = None
    criatura: str = ""


def _payload(session: Session) -> dict:
    mix, rs = mix_actual(session)
    rulesets = session.exec(select(Ruleset).order_by(Ruleset.id)).all()
    return {
        "catalogo": REGLAS,
        "activos": mix["activos"],
        "opciones": mix["opciones"],
        "texto": mix_texto(mix),
        "ruleset_activo": ({"id": rs.id, "nombre": rs.nombre} if rs else None),
        "rulesets": [{
            "id": r.id, "nombre": r.nombre, "activo": r.activo,
            "mix": normalizar_mix(loads(r.mix_json, {})), "ts": r.ts,
        } for r in rulesets],
    }


def _log(session: Session, expr: str, tiradas: list[int], mod: int, total: int,
         razon: str, modo: str = "normal") -> dict:
    fila = DiceLog(expr=expr, tiradas_json=dumps(tiradas), mod=mod, total=total,
                   razon=razon[:300], modo=modo)
    session.add(fila)
    session.commit()
    session.refresh(fila)
    emit(session, "dado", "tirada", {
        "id": fila.id, "expr": fila.expr, "total": fila.total,
        "tiradas": tiradas, "razon": fila.razon, "origen": "reglas",
    })
    return dice_dict(fila)


def _exigir(activos: list[str], regla_id: str) -> None:
    if regla_id not in activos:
        nombre = REGLAS_MAP[regla_id]["nombre"]
        raise HTTPException(409, f"El núcleo «{nombre}» no está activo en la mezcla actual")


@router.get("/api/modules/reglas/state")
def estado_reglas(session: Session = Depends(get_session)):
    return _payload(session)


@router.post("/api/modules/reglas/action")
def accion_reglas(data: ReglasAccion, session: Session = Depends(get_session)):
    mix, _ = mix_actual(session)
    activos = list(mix["activos"])
    accion = data.action

    if accion == "toggle":
        if data.rule_id not in REGLAS_MAP:
            raise HTTPException(404, "Regla desconocida")
        if data.activo:
            if data.rule_id == "ventaja" and "d20" not in activos:
                raise HTTPException(409, "Ventaja requiere el núcleo d20 activo")
            if data.rule_id not in activos:
                activos.append(data.rule_id)
            mix["activos"] = activos
        else:
            mix["activos"] = [r for r in activos if r != data.rule_id]
            if data.rule_id == "d20" and "ventaja" in mix["activos"]:
                mix["activos"].remove("ventaja")
        guardar_mix_activo(session, mix)
        emit(session, "reglas", "toggle", {"regla": data.rule_id, "activo": data.activo})
        return _payload(session)

    if accion == "set_opcion":
        if data.rule_id not in REGLAS_MAP or not data.key:
            raise HTTPException(400, "Regla o clave inválida")
        opciones_def = {o["key"]: o for o in REGLAS_MAP[data.rule_id].get("opciones", [])}
        if data.key not in opciones_def:
            raise HTTPException(400, "Opción desconocida")
        if data.rule_id not in activos:
            raise HTTPException(409, "Activa la regla antes de configurar sus opciones")
        opcion = opciones_def[data.key]
        valor = data.value
        if opcion["tipo"] == "number":
            try:
                valor = int(valor)
            except (TypeError, ValueError) as exc:
                raise HTTPException(400, "Valor numérico inválido") from exc
        if opcion["tipo"] == "select" and valor not in opcion.get("opciones", []):
            raise HTTPException(400, "Valor fuera del catálogo")
        if data.key == "modo" and valor != "normal" and "ventaja" not in activos:
            raise HTTPException(409, "Activa «Ventaja / desventaja» para usar ese modo")
        mix["opciones"].setdefault(data.rule_id, {})[data.key] = valor
        guardar_mix_activo(session, mix)
        emit(session, "reglas", "opcion", {"regla": data.rule_id, "key": data.key})
        return _payload(session)

    if accion == "guardar_ruleset":
        nombre = (data.nombre or "").strip()
        if not nombre:
            raise HTTPException(400, "Ponle un nombre a la mezcla")
        existente = session.exec(select(Ruleset).where(Ruleset.nombre == nombre)).first()
        for r in session.exec(select(Ruleset)).all():
            if r.activo:
                r.activo = False
                session.add(r)
        if existente:
            existente.mix_json = dumps(mix)
            existente.activo = True
            session.add(existente)
            guardado = existente
        else:
            guardado = Ruleset(nombre=nombre[:80], activo=True, mix_json=dumps(mix))
            session.add(guardado)
        session.commit()
        session.refresh(guardado)
        emit(session, "reglas", "ruleset_guardado", {"id": guardado.id, "nombre": guardado.nombre})
        return _payload(session)

    if accion == "activar_ruleset":
        if data.ruleset_id is None:
            raise HTTPException(400, "Falta ruleset_id")
        try:
            activado = activar(session, data.ruleset_id)
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc
        emit(session, "reglas", "ruleset_activado", {"id": activado.id, "nombre": activado.nombre})
        return _payload(session)

    if accion == "borrar_ruleset":
        if data.ruleset_id is None:
            raise HTTPException(400, "Falta ruleset_id")
        rs = session.get(Ruleset, data.ruleset_id)
        if not rs:
            raise HTTPException(404, "Ruleset no encontrado")
        if rs.activo:
            raise HTTPException(409, "No puedes borrar el ruleset activo; activa otro primero")
        session.delete(rs)
        session.commit()
        emit(session, "reglas", "ruleset_borrado", {"id": data.ruleset_id})
        return _payload(session)

    if accion == "check_d20":
        _exigir(activos, "d20")
        opciones = mix["opciones"]["d20"]
        dificultad = int(data.dificultad if data.dificultad is not None else opciones.get("dificultad", 15))
        modo = (data.modo or opciones.get("modo") or "normal").lower()
        if modo != "normal":
            _exigir(activos, "ventaja")
        resultado = regla_d20.check(data.atributo, data.mod, dificultad, modo)
        expr = "d20" + (f"{data.mod:+d}" if data.mod else "")
        tirada = _log(session, expr, resultado["dados"], data.mod, resultado["total"],
                      data.razon or "Chequeo d20", modo)
        return {"resultado": resultado, "tirada": tirada, "estado": _payload(session)}

    if accion == "fate_check":
        _exigir(activos, "mythic")
        opciones = mix["opciones"]["mythic"]
        odds = data.odds or opciones.get("odds", "50/50")
        chaos = int(data.chaos if data.chaos is not None else opciones.get("chaos", 5))
        try:
            resultado = mythic.fate_check(odds, chaos)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        razon = f"Mythic: {data.pregunta or 'pregunta sin texto'} ({resultado['odds']}, caos {chaos})"
        tirada = _log(session, "d100", [resultado["tirada"]], 0, resultado["tirada"], razon)
        return {"resultado": resultado, "tirada": tirada, "estado": _payload(session)}

    if accion == "event_meaning":
        _exigir(activos, "mythic")
        resultado = mythic.event_meaning()
        tirada = _log(session, "d100+d100", resultado["tiradas"], 0,
                      sum(resultado["tiradas"]), "Mythic: significado de evento")
        return {"resultado": resultado, "tirada": tirada, "estado": _payload(session)}

    if accion == "spawn":
        _exigir(activos, "spawn")
        if data.cantidad is None or int(data.cantidad) < 1:
            raise HTTPException(400, "Indica una cantidad de criaturas mayor que 0")
        resultado = spawn.calcular_spawn(int(data.cantidad))
        razon = f"Spawn dX+Y: {data.criatura or 'criaturas'} ×{data.cantidad}"
        tirada = _log(session, resultado["expresion"], resultado["tiradas"],
                      resultado["sugerencia"].get("mod", 0), resultado["tirada_total"], razon)
        return {"resultado": resultado, "tirada": tirada, "estado": _payload(session)}

    raise HTTPException(400, f"Acción no soportada: {accion}")
