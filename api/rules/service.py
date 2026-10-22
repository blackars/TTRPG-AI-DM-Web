"""Servicio de reglas: obtiene/guarda el mix activo de forma consistente."""
from __future__ import annotations

from sqlmodel import Session, select

from models import Ruleset
from rules.catalog import MIX_INICIAL, mix_texto, normalizar_mix
from utils import dumps, loads


def ruleset_activo(session: Session) -> Ruleset | None:
    return session.exec(select(Ruleset).where(Ruleset.activo == True)).first()  # noqa: E712


def mix_actual(session: Session) -> tuple[dict, Ruleset | None]:
    rs = ruleset_activo(session)
    if not rs:
        return normalizar_mix(MIX_INICIAL), None
    return normalizar_mix(loads(rs.mix_json, {})), rs


def guardar_mix_activo(session: Session, mix: dict) -> Ruleset:
    normal = normalizar_mix(mix)
    rs = ruleset_activo(session)
    if not rs:
        rs = Ruleset(nombre="Mesa actual", activo=True, mix_json=dumps(normal))
        session.add(rs)
    else:
        rs.mix_json = dumps(normal)
        session.add(rs)
    session.commit()
    session.refresh(rs)
    return rs


def activar(session: Session, ruleset_id: int) -> Ruleset:
    rs = session.get(Ruleset, ruleset_id)
    if not rs:
        raise ValueError("ruleset no encontrado")
    for otro in session.exec(select(Ruleset)).all():
        if otro.id != rs.id and otro.activo:
            otro.activo = False
            session.add(otro)
    rs.activo = True
    session.add(rs)
    session.commit()
    session.refresh(rs)
    return rs


def texto_actual(session: Session) -> str:
    mix, _ = mix_actual(session)
    return mix_texto(mix)
