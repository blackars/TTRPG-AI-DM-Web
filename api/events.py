"""Bus de eventos: toda acción de módulo genera una fila en events_log.

El frontend hace polling de `GET /api/events?since=<id>`; cualquier pantalla
abierta recarga sus módulos y el contexto del asistente se recalcula.
"""
from __future__ import annotations

from sqlmodel import Session

from models import EventLog
from utils import dumps


def emit(session: Session, modulo: str, tipo: str, payload: dict | None = None) -> EventLog:
    evento = EventLog(modulo=modulo, tipo=tipo, payload_json=dumps(payload or {}))
    session.add(evento)
    session.commit()
    session.refresh(evento)
    return evento


def ultimo_id(session: Session) -> int:
    from sqlmodel import select

    fila = session.exec(select(EventLog).order_by(EventLog.id.desc()).limit(1)).first()
    return int(fila.id or 0) if fila else 0
