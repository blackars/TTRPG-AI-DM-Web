"""Módulo Dados: motor autoritativo + historial persistente."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from db import get_session
from events import emit
from models import Character, DiceLog
from rules.dice import DADOS, tirar
from serializers import dice_dict
from utils import dumps

router = APIRouter(tags=["dados"])

TIPOS = (
    [{"id": f"d{d}", "caras": d, "nombre": f"d{d}"} for d in (4, 6, 8, 10, 12, 20)]
    + [{"id": "d100", "caras": 100, "nombre": "d100"},
       {"id": "dF", "caras": 3, "nombre": "dF (Fate)"}]
)


class TirarIn(BaseModel):
    action: str = "tirar"
    expr: str
    razon: str = ""
    personaje: str = ""


def _historial(session: Session, limite: int = 30) -> list[dict]:
    filas = session.exec(select(DiceLog).order_by(DiceLog.id.desc()).limit(limite)).all()
    return [dice_dict(f) for f in filas]


def _tirar(data: TirarIn, session: Session) -> dict:
    if data.action not in ("tirar",):
        raise HTTPException(400, "Acción no soportada")
    try:
        resultado = tirar(data.expr)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    personaje = (data.personaje or "").strip()
    if personaje and not session.exec(select(Character).where(Character.nombre == personaje)).first():
        personaje = ""
    log = DiceLog(
        expr=resultado.expr, tiradas_json=dumps(resultado.tiradas), mod=resultado.mod,
        total=resultado.total, razon=(data.razon or "").strip()[:300], personaje=personaje,
    )
    session.add(log)
    session.commit()
    session.refresh(log)
    emit(session, "dado", "tirada", {
        "id": log.id, "expr": log.expr, "total": log.total,
        "tiradas": resultado.tiradas, "razon": log.razon,
    })
    return {"tirada": dice_dict(log), "historial": _historial(session)}


@router.get("/api/modules/dado/state")
def estado_dado(session: Session = Depends(get_session)):
    return {
        "tipos": TIPOS,
        "historial": _historial(session),
        "total": len(session.exec(select(DiceLog)).all()),
    }


@router.post("/api/modules/dado/action")
def accion_dado(data: TirarIn, session: Session = Depends(get_session)):
    return _tirar(data, session)


@router.post("/api/modules/dado/tirar")
def tirar_alias(data: TirarIn, session: Session = Depends(get_session)):
    return _tirar(data, session)
