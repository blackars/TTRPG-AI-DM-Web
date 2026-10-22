"""Base de datos SQLite única del asistente."""
from __future__ import annotations

import os
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
TOKENS_DIR = DATA_DIR / "tokens"
SOUNDS_DIR = DATA_DIR / "sounds"
TOKENS_DIR.mkdir(parents=True, exist_ok=True)
SOUNDS_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = Path(os.environ.get("TTRPG_DB", str(DATA_DIR / "assistant.db")))
engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
    echo=False,
)


def init_db() -> None:
    # Importar modelos registra las tablas en SQLModel.metadata.
    import models  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
