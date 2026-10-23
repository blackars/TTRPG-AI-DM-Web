"""TTRPG-Assistant API — FastAPI + SQLModel + SQLite. Puerto 8100."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session

from ai import config as ai_config
from db import DATA_DIR, SOUNDS_DIR, TOKENS_DIR, engine, init_db
from library import BIBLIOTECA_DIR
from modules import (
    assistant, biblioteca, characters, core, dice, inventory, minibase, npcs, rules,
    saves, scenes, sounds,
)
from seeds import ensure_library_screen, seed_all

VERSION = "1.0.0"


def _placeholder_token() -> None:
    destino = TOKENS_DIR / "placeholder.svg"
    if destino.exists():
        return
    destino.write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">'
        '<defs><radialGradient id="g" cx="50%" cy="35%"><stop offset="0%" stop-color="#f5b544"/>'
        '<stop offset="100%" stop-color="#7c3aed"/></radialGradient></defs>'
        '<circle cx="64" cy="64" r="58" fill="url(#g)" stroke="#0b0d12" stroke-width="6"/>'
        '<text x="64" y="82" text-anchor="middle" font-size="58" font-family="Georgia,serif" '
        'fill="#0b0d12" font-weight="bold">T</text></svg>',
        encoding="utf-8",
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    ai_config.load_env()
    init_db()
    _placeholder_token()
    with Session(engine) as session:
        seed_all(session)
    with Session(engine) as session:
        ensure_library_screen(session)
    yield


app = FastAPI(
    title="TTRPG-Assistant API",
    description="Mesa de rol digital con módulos componibles y asistente IA que lee todo el estado.",
    version=VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3010", "http://127.0.0.1:3010",
        "http://localhost:3000", "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(core.router)
app.include_router(dice.router)
app.include_router(inventory.router)
app.include_router(rules.router)
app.include_router(assistant.router)
app.include_router(scenes.router)
app.include_router(characters.router)
app.include_router(saves.router)
app.include_router(sounds.router)
app.include_router(npcs.router)
app.include_router(minibase.router)
app.include_router(biblioteca.router)

app.mount("/sounds", StaticFiles(directory=str(SOUNDS_DIR)), name="sounds")
app.mount("/tokens", StaticFiles(directory=str(TOKENS_DIR)), name="tokens")
app.mount(
    "/biblioteca-clasica",
    StaticFiles(directory=str(BIBLIOTECA_DIR), html=True),
    name="biblioteca-clasica",
)
app.mount(
    "/biblioteca-assets",
    StaticFiles(directory=str(BIBLIOTECA_DIR / "assets")),
    name="biblioteca-assets",
)


@app.get("/health")
def health():
    from sqlmodel import text

    with Session(engine) as session:
        session.exec(text("SELECT 1"))
    return {
        "ok": True,
        "version": VERSION,
        "db": str(DATA_DIR / "assistant.db"),
        "api": 8100,
        "web": 3010,
    }


@app.get("/api/health")
def api_health():
    return health()


@app.get("/")
def root():
    return {
        "ok": True,
        "app": "TTRPG-Assistant",
        "version": VERSION,
        "docs": "/docs",
        "contexto_ia": "/api/assistant/context",
        "pantallas": "/api/screens",
    }
