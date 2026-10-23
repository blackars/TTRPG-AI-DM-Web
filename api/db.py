"""Base de datos SQLite única del asistente."""
from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
TOKENS_DIR = DATA_DIR / "tokens"
SOUNDS_DIR = DATA_DIR / "sounds"
ESCENARIOS_DIR = DATA_DIR / "escenarios"
TOKENS_DIR.mkdir(parents=True, exist_ok=True)
SOUNDS_DIR.mkdir(parents=True, exist_ok=True)
ESCENARIOS_DIR.mkdir(parents=True, exist_ok=True)

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
    _migrar_escenas()


def _migrar_escenas() -> None:
    """Añade columnas nuevas a bases ya creadas sin borrar datos.

    `create_all` crea tablas que faltan, pero no altera tablas existentes. La
    presentación del mapa se incorporó después del MVP; esta migración es
    idempotente y deja las escenas antiguas con la presentación por defecto.
    """
    inspector = inspect(engine)
    if "scenes" not in inspector.get_table_names():
        return
    columnas = {columna["name"] for columna in inspector.get_columns("scenes")}
    if "presentacion_json" not in columnas:
        with engine.begin() as conexion:
            conexion.execute(
                text("ALTER TABLE scenes ADD COLUMN presentacion_json TEXT NOT NULL DEFAULT '{}'")
            )


def get_session():
    with Session(engine) as session:
        yield session
