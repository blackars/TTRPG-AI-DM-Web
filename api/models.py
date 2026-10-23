"""Modelos SQLModel de TTRPG-Assistant.

Convención: los campos JSON se guardan como texto (SQLite) y se serializan en
los módulos con `json.loads`. Las fechas son ISO 8601 en hora local.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Column, Text
from sqlmodel import Field, SQLModel


def ahora() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


class Character(SQLModel, table=True):
    __tablename__ = "characters"

    id: Optional[int] = Field(default=None, primary_key=True)
    nombre: str
    kind: str = "personaje"  # personaje | criatura
    emoji: str = "🧙"
    hp: int = 10
    hp_max: int = 10
    notas: str = Field(default="", sa_column=Column(Text))
    stats_json: str = Field(default="{}", sa_column=Column(Text))
    created_at: str = Field(default_factory=ahora)


class InventorySection(SQLModel, table=True):
    __tablename__ = "inventory_sections"

    id: Optional[int] = Field(default=None, primary_key=True)
    character_id: int = Field(foreign_key="characters.id", index=True)
    nombre: str
    orden: int = 0


class InventoryItem(SQLModel, table=True):
    __tablename__ = "inventory_items"

    id: Optional[int] = Field(default=None, primary_key=True)
    section_id: int = Field(foreign_key="inventory_sections.id", index=True)
    nombre: str
    qty: int = 1
    valor: str = ""
    nota: str = Field(default="", sa_column=Column(Text))
    icono: str = "📦"
    token_path: str = ""
    external_key: str = ""
    created_at: str = Field(default_factory=ahora)


class DiceLog(SQLModel, table=True):
    __tablename__ = "dice_logs"

    id: Optional[int] = Field(default=None, primary_key=True)
    expr: str
    tiradas_json: str = Field(default="[]", sa_column=Column(Text))
    mod: int = 0
    total: int = 0
    razon: str = ""
    modo: str = "normal"
    personaje: str = ""
    ts: str = Field(default_factory=ahora)


class Ruleset(SQLModel, table=True):
    __tablename__ = "rulesets"

    id: Optional[int] = Field(default=None, primary_key=True)
    nombre: str
    activo: bool = False
    mix_json: str = Field(default="{}", sa_column=Column(Text))
    ts: str = Field(default_factory=ahora)


class Scene(SQLModel, table=True):
    __tablename__ = "scenes"

    id: Optional[int] = Field(default=None, primary_key=True)
    nombre: str
    descripcion: str = Field(default="", sa_column=Column(Text))
    bg: str = "#101522"
    light_json: str = Field(default='{"color":"#f5b544","opacity":0.18}', sa_column=Column(Text))
    tokens_json: str = Field(default="[]", sa_column=Column(Text))
    playlist_json: str = Field(default="[]", sa_column=Column(Text))
    presentacion_json: str = Field(default="{}", sa_column=Column(Text))
    activo: bool = False
    ts: str = Field(default_factory=ahora)


class Screen(SQLModel, table=True):
    __tablename__ = "screens"

    id: Optional[int] = Field(default=None, primary_key=True)
    nombre: str
    slug: str = Field(index=True, unique=True)
    layout_json: str = Field(default="{}", sa_column=Column(Text))
    orden: int = 0
    ts: str = Field(default_factory=ahora)


class ModuleInstance(SQLModel, table=True):
    __tablename__ = "module_instances"

    id: Optional[int] = Field(default=None, primary_key=True)
    screen_id: int = Field(foreign_key="screens.id", index=True)
    module_id: str
    slot: str = "principal"  # principal | lateral | inferior | overlay
    orden: int = 0
    props_json: str = Field(default="{}", sa_column=Column(Text))
    collapsed: bool = False
    ts: str = Field(default_factory=ahora)


class EventLog(SQLModel, table=True):
    __tablename__ = "events_log"

    id: Optional[int] = Field(default=None, primary_key=True)
    ts: str = Field(default_factory=ahora)
    modulo: str
    tipo: str
    payload_json: str = Field(default="{}", sa_column=Column(Text))


class AiMessage(SQLModel, table=True):
    __tablename__ = "ai_messages"

    id: Optional[int] = Field(default=None, primary_key=True)
    conversacion: str = "principal"
    role: str  # user | assistant | system
    contenido: str = Field(sa_column=Column(Text))
    contexto_hash: str = ""
    proveedor: str = ""
    ts: str = Field(default_factory=ahora)


class GameSave(SQLModel, table=True):
    __tablename__ = "game_saves"

    id: Optional[int] = Field(default=None, primary_key=True)
    nombre: str
    snapshot_json: str = Field(sa_column=Column(Text))
    ts: str = Field(default_factory=ahora)


class SoundAsset(SQLModel, table=True):
    __tablename__ = "sound_assets"

    id: Optional[int] = Field(default=None, primary_key=True)
    nombre: str
    grupo: str = "Ambiente"
    src: str = ""
    loop: bool = True
    volumen: float = 0.6
    sintetico: bool = True
    ts: str = Field(default_factory=ahora)


class Npc(SQLModel, table=True):
    __tablename__ = "npcs"

    id: Optional[int] = Field(default=None, primary_key=True)
    nombre: str
    voz: str = ""
    tono: str = ""
    phrases_json: str = Field(default="[]", sa_column=Column(Text))
    notas: str = Field(default="", sa_column=Column(Text))
    ts: str = Field(default_factory=ahora)


class AppKv(SQLModel, table=True):
    __tablename__ = "app_kv"

    key: str = Field(primary_key=True)
    value_json: str = Field(default="{}", sa_column=Column(Text))
    ts: str = Field(default_factory=ahora)


class MiniLink(SQLModel, table=True):
    __tablename__ = "mini_links"

    id: Optional[int] = Field(default=None, primary_key=True)
    external_key: str = Field(index=True)
    kind: str = "token"  # token | item
    local_ref: str = ""
    nombre: str = ""
    payload_json: str = Field(default="{}", sa_column=Column(Text))
    ts: str = Field(default_factory=ahora)
