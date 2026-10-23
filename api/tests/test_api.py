"""Pruebas de humo y contrato de la API (sin red, proveedor mock)."""
from __future__ import annotations

import base64
import os
import tempfile
from pathlib import Path

RUTA_DB = Path(tempfile.gettempdir()) / "ttrpg_assistant_test.db"
RUTA_DB.unlink(missing_ok=True)
os.environ["TTRPG_DB"] = str(RUTA_DB)
os.environ["DM_PROVIDER"] = "mock"
os.environ["MINIBASE_URL"] = ""

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


def test_health_y_contexto(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["ok"] is True
    ctx = client.get("/api/assistant/context").json()
    for clave in ("fecha", "mix_reglas", "ultimas_tiradas", "escena_activa",
                  "personajes", "npcs", "sonidos_disponibles", "badges_de_modulos"):
        assert clave in ctx
    assert len(ctx["personajes"]) == 5
    assert len(ctx["npcs"]) == 3
    assert ctx["escena_activa"]["nombre"] == "Claro de los Susurros"
    assert ctx["mix_reglas"]["activos"] == ["d20", "ventaja", "mythic", "spawn"]
    assert "presentacion" in ctx["escena_activa"]
    assert "grid_cm" in ctx["table_state"] and "mapa_url" in ctx["table_state"]


def test_contrato_modulos_completo(client):
    """Todos los módulos del registro deben exponer state y action."""
    ids = [
        "reloj", "notas", "estado", "dado", "inventario", "reglas", "escenario",
        "escenarios", "proyector", "sonido", "personajes", "npcs", "partidas",
        "asistente", "minibase", "biblioteca", "editor",
    ]
    for modulo in ids:
        r = client.get(f"/api/modules/{modulo}/state")
        assert r.status_code == 200, f"{modulo}: {r.text}"

    # Asistente: el estado debe serializar proveedores y acciones (regresión).
    asistente = client.get("/api/modules/asistente/state").json()
    assert isinstance(asistente["providers"], list) and asistente["providers"]
    assert "tirar_dado" in asistente["acciones_permitidas"]

    # Módulos de solo lectura: su acción real es sincronizar/refrescar.
    assert client.post("/api/modules/reloj/action", json={"action": "sincronizar"}).status_code == 200
    assert client.post("/api/modules/estado/action", json={"action": "resumen"}).status_code == 200
    proyector = client.post("/api/modules/proyector/action", json={"action": "publicar"})
    assert proyector.status_code == 200 and proyector.json()["activa"]["nombre"]

    # Alias del tablero sobre la escena activa.
    escena = client.get("/api/modules/escenario/state").json()["activa"]
    token = client.post("/api/modules/escenario/action", json={
        "action": "agregar_token", "token_nombre": "Token alias", "emoji": "🔷", "x": 1, "y": 2,
    })
    assert token.status_code == 200 and token.json()["activa"]["id"] == escena["id"]
    nuevo = next(t for t in token.json()["activa"]["tokens"] if t["nombre"] == "Token alias")
    assert client.post("/api/modules/escenario/action", json={
        "action": "borrar_token", "token_id": nuevo["id"]}).status_code == 200

    # Editor: crear pantalla y añadirle un módulo por el contrato del módulo.
    creada = client.post("/api/modules/editor/action", json={
        "action": "crear_pantalla", "nombre": "Pantalla contrato"})
    assert creada.status_code == 200, creada.text
    pantalla = creada.json()["pantalla"]
    agregado = client.post("/api/modules/editor/action", json={
        "action": "anadir_modulo", "screen_id": pantalla["id"], "module_id": "reloj"})
    assert agregado.status_code == 200, agregado.text


def test_pantallas_persisten(client):
    mesa = client.get("/api/screens/mesa").json()
    assert mesa["pantalla"]["slug"] == "mesa"
    slots = {i["slot"] for i in mesa["instancias"]}
    assert {"principal", "lateral", "inferior", "overlay"} <= slots
    antes = len(mesa["instancias"])
    r = client.post(f"/api/screens/{mesa['pantalla']['id']}/instances",
                    json={"module_id": "reloj", "slot": "lateral"})
    assert r.status_code == 200, r.text
    iid = r.json()["id"]
    mesa2 = client.get("/api/screens/mesa").json()
    assert len(mesa2["instancias"]) == antes + 1
    dup = client.post(f"/api/screens/{mesa['pantalla']['id']}/instances",
                      json={"module_id": "reloj", "slot": "lateral"})
    assert dup.status_code == 409
    assert client.delete(f"/api/screens/{mesa['pantalla']['id']}/instances/{iid}").status_code == 200


def test_dados_autoritativos(client):
    r = client.post("/api/modules/dado/action",
                    json={"action": "tirar", "expr": "3d6+2", "razon": "prueba de suma"})
    assert r.status_code == 200, r.text
    t = r.json()["tirada"]
    assert t["total"] == sum(t["tiradas"]) + 2
    assert t["expr"] == "3d6+2"
    hist = client.get("/api/modules/dado/state").json()["historial"]
    assert hist[0]["razon"] == "prueba de suma"
    malo = client.post("/api/modules/dado/action", json={"action": "tirar", "expr": "d7"})
    assert malo.status_code == 400


def test_reglas_mezcla_y_checks(client):
    estado = client.get("/api/modules/reglas/state").json()
    assert {r["id"] for r in estado["catalogo"]} == {"d20", "ventaja", "mythic", "spawn"}

    r = client.post("/api/modules/reglas/action",
                    json={"action": "check_d20", "mod": 4, "dificultad": 15, "razon": "forzar puerta"})
    assert r.status_code == 200, r.text
    assert r.json()["resultado"]["total"] == r.json()["tirada"]["total"]

    r = client.post("/api/modules/reglas/action",
                    json={"action": "fate_check", "pregunta": "¿Hay trampas?", "odds": "50/50", "chaos": 6})
    assert r.status_code == 200 and "texto" in r.json()["resultado"]

    r = client.post("/api/modules/reglas/action",
                    json={"action": "spawn", "cantidad": 23, "criatura": "trasgos"})
    assert r.status_code == 200
    assert r.json()["resultado"]["sugerencia"]["expr"] == "d20+3"

    # apagar d20 debe impedir checks y ventaja; luego se restaura
    apagar = client.post("/api/modules/reglas/action",
                         json={"action": "toggle", "rule_id": "d20", "activo": False})
    assert apagar.status_code == 200
    bloqueado = client.post("/api/modules/reglas/action",
                            json={"action": "check_d20", "mod": 1, "dificultad": 10})
    assert bloqueado.status_code == 409
    client.post("/api/modules/reglas/action", json={"action": "toggle", "rule_id": "d20", "activo": True})
    client.post("/api/modules/reglas/action", json={"action": "toggle", "rule_id": "ventaja", "activo": True})


def test_inventario_crud_y_movimiento(client):
    inv = client.get("/api/modules/inventario/state").json()
    kaelen = next(p for p in inv["personajes"] if p["nombre"] == "Kaelen")
    assert kaelen["secciones"]

    r = client.post("/api/modules/inventario/action", json={
        "action": "crear_seccion", "character_id": kaelen["id"], "nombre": "Pruebas"})
    assert r.status_code == 200, r.text
    inv = r.json()
    kaelen = next(p for p in inv["personajes"] if p["nombre"] == "Kaelen")
    seccion = next(s for s in kaelen["secciones"] if s["nombre"] == "Pruebas")

    r = client.post("/api/modules/inventario/action", json={
        "action": "crear_item", "section_id": seccion["id"],
        "nombre": "Cuerda", "qty": 2, "icono": "🪢", "nota": "50 pies"})
    assert r.status_code == 200
    inv = r.json()
    kaelen = next(p for p in inv["personajes"] if p["nombre"] == "Kaelen")
    seccion = next(s for s in kaelen["secciones"] if s["nombre"] == "Pruebas")
    item = next(i for i in seccion["items"] if i["nombre"] == "Cuerda")
    assert item["qty"] == 2

    r = client.post("/api/modules/inventario/action", json={
        "action": "editar_item", "item_id": item["id"], "qty": 5, "nota": "editada"})
    assert r.status_code == 200
    r = client.post("/api/modules/inventario/action", json={
        "action": "mover_item", "item_id": item["id"],
        "section_id": next(s for s in kaelen["secciones"] if s["nombre"] == "Consumibles")["id"]})
    assert r.status_code == 200
    r = client.post("/api/modules/inventario/action", json={
        "action": "borrar_item", "item_id": item["id"]})
    assert r.status_code == 200
    r = client.post("/api/modules/inventario/action", json={
        "action": "borrar_seccion", "section_id": seccion["id"]})
    assert r.status_code == 200


def test_escenas_tokens_y_activacion(client):
    estado = client.get("/api/modules/escenarios/state").json()
    assert len(estado["escenas"]) >= 3
    cripta = next(e for e in estado["escenas"] if e["nombre"] == "Cripta de Ceniza")

    r = client.post("/api/modules/escenarios/action", json={
        "action": "agregar_token", "scene_id": cripta["id"],
        "token_nombre": "Prueba", "emoji": "🔺", "x": 1, "y": 1})
    assert r.status_code == 200
    cripta = next(e for e in r.json()["escenas"] if e["id"] == cripta["id"])
    token = next(t for t in cripta["tokens"] if t["nombre"] == "Prueba")

    r = client.post("/api/modules/escenarios/action", json={
        "action": "mover_token", "scene_id": cripta["id"], "token_id": token["id"], "x": 7, "y": 4})
    assert r.status_code == 200
    cripta = next(e for e in r.json()["escenas"] if e["id"] == cripta["id"])
    assert next(t for t in cripta["tokens"] if t["id"] == token["id"])["x"] == 7

    r = client.post("/api/modules/escenarios/action", json={"action": "activar", "id": cripta["id"]})
    assert r.status_code == 200
    assert r.json()["activa"]["nombre"] == "Cripta de Ceniza"

    r = client.post("/api/modules/escenarios/action", json={
        "action": "set_light", "scene_id": cripta["id"], "color": "#ff0000", "opacity": 0.5})
    assert r.status_code == 200
    assert r.json()["activa"]["light"]["color"] == "#ff0000"

    r = client.post("/api/modules/escenarios/action", json={
        "action": "borrar_token", "scene_id": cripta["id"], "token_id": token["id"]})
    assert r.status_code == 200

    # devolver el escenario inicial para el resto de pruebas
    claro = next(e for e in estado["escenas"] if e["nombre"] == "Claro de los Susurros")
    client.post("/api/modules/escenarios/action", json={"action": "activar", "id": claro["id"]})


def test_escena_presentacion_y_mapa(client):
    estado = client.get("/api/modules/escenarios/state").json()
    activa = estado["activa"]
    assert activa and activa["presentacion"]["grid_cm"] == 2.5

    r = client.post("/api/modules/escenarios/action", json={
        "action": "set_presentacion",
        "scene_id": activa["id"],
        "presentacion": {
            "zoom": 1.75, "rotacion": 90, "pan_x": 12.5, "pan_y": -4,
            "grid_visible": False, "grid_cm": 3.25, "grid_color": "#ff5500",
            "grid_opacity": 0.42,
        },
    })
    assert r.status_code == 200, r.text
    p = next(e for e in r.json()["escenas"] if e["id"] == activa["id"])["presentacion"]
    assert p["zoom"] == 1.75
    assert p["rotacion"] == 90
    assert p["pan_x"] == 12.5
    assert p["grid_visible"] is False
    assert p["grid_cm"] == 3.25
    assert p["grid_color"] == "#ff5500"

    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
        "+A8AAQUBAScY42YAAAAASUVORK5CYII="
    )
    r = client.post(
        f"/api/escenarios/{activa['id']}/mapa",
        files={"archivo": ("mapa-prueba.png", png, "image/png")},
    )
    assert r.status_code == 200, r.text
    p = next(e for e in r.json()["escenas"] if e["id"] == activa["id"])["presentacion"]
    assert p["mapa_url"].startswith("/escenas-assets/")
    imagen = client.get(p["mapa_url"])
    assert imagen.status_code == 200 and imagen.content == png

    r = client.delete(f"/api/escenarios/{activa['id']}/mapa")
    assert r.status_code == 200
    p = next(e for e in r.json()["escenas"] if e["id"] == activa["id"])["presentacion"]
    assert p["mapa_url"] == ""
    assert client.get(p["mapa_url"] or "/escenas-assets/no-existe").status_code == 404

    # Restaurar la presentación por defecto para no contaminar otras pruebas.
    client.post("/api/modules/escenarios/action", json={
        "action": "set_presentacion",
        "scene_id": activa["id"],
        "presentacion": {
            "zoom": 1, "rotacion": 0, "pan_x": 0, "pan_y": 0,
            "grid_visible": True, "grid_cm": 2.5,
            "grid_color": "#22ff88", "grid_opacity": 0.6,
        },
    })


def test_borrar_escena_limpia_mapa(client):
    creada = client.post("/api/modules/escenarios/action", json={
        "action": "crear", "nombre": "Escena temporal M11"})
    assert creada.status_code == 200
    escena = next(e for e in creada.json()["escenas"] if e["nombre"] == "Escena temporal M11")
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
        "+A8AAQUBAScY42YAAAAASUVORK5CYII="
    )
    subida = client.post(
        f"/api/escenarios/{escena['id']}/mapa",
        files={"archivo": ("mapa-temporal.png", png, "image/png")},
    )
    url = next(e for e in subida.json()["escenas"] if e["id"] == escena["id"])["presentacion"]["mapa_url"]
    assert client.get(url).status_code == 200

    borrada = client.post("/api/modules/escenarios/action", json={
        "action": "borrar", "id": escena["id"]})
    assert borrada.status_code == 200
    assert all(e["id"] != escena["id"] for e in borrada.json()["escenas"])
    assert client.get(url).status_code == 404


def test_personajes_y_envio_al_tablero(client):
    r = client.post("/api/modules/personajes/action", json={
        "action": "crear", "nombre": "Prueba PC", "kind": "personaje", "emoji": "🧪",
        "hp": 9, "hp_max": 10, "stats": {"FUE": 11}})
    assert r.status_code == 200, r.text
    p = next(x for x in r.json()["personajes"] if x["nombre"] == "Prueba PC")
    r = client.post("/api/modules/personajes/action", json={
        "action": "enviar_a_escena", "id": p["id"]})
    assert r.status_code == 200
    r = client.post("/api/modules/personajes/action", json={
        "action": "editar", "id": p["id"], "hp": 3})
    assert r.status_code == 200
    assert next(x for x in r.json()["personajes"] if x["id"] == p["id"])["hp"] == 3
    r = client.post("/api/modules/personajes/action", json={"action": "borrar", "id": p["id"]})
    assert r.status_code == 200


def test_sonidos_y_playlist(client):
    estado = client.get("/api/modules/sonido/state").json()
    assert estado["total"] >= 7
    sonido = estado["grupos"][0]["sonidos"][0]
    escena = estado["escena_activa"]
    r = client.post("/api/modules/sonido/action", json={
        "action": "asignar_escena", "id": sonido["id"], "scene_id": escena["id"], "activo": True})
    assert r.status_code == 200, r.text
    assert sonido["id"] in r.json()["escena_activa"]["playlist"]


def test_npcs_y_texto(client):
    estado = client.get("/api/modules/npcs/state").json()
    assert estado["total"] >= 3
    npc = estado["npcs"][0]
    r = client.post("/api/assistant/npc_text", json={
        "npc_id": npc["id"], "situacion": "El grupo le pide ayuda con la cripta."})
    assert r.status_code == 200, r.text
    assert r.json()["texto"]
    assert r.json()["proveedor"] == "mock"

    r = client.post("/api/modules/npcs/action", json={
        "action": "crear", "nombre": "NPC Prueba", "voz": "aguda", "tono": "nervioso",
        "frases": ["No, no, no."]})
    assert r.status_code == 200
    nuevo = next(n for n in r.json()["npcs"] if n["nombre"] == "NPC Prueba")
    assert client.post("/api/modules/npcs/action", json={
        "action": "borrar", "id": nuevo["id"]}).status_code == 200


def test_asistente_usa_contexto_real(client):
    antes = client.get("/api/modules/dado/state").json()["historial"][0]
    r = client.post("/api/assistant/turn", json={
        "mensaje": "¿Qué llevamos en el inventario y cuál fue la última tirada?"})
    assert r.status_code == 200, r.text
    datos = r.json()
    assert datos["proveedor"] == "mock"
    assert "Kaelen" in datos["respuesta"] or "Espada" in datos["respuesta"]
    assert str(antes["total"]) in datos["respuesta"]
    assert datos["contexto_resumen"]["escena"] == "Claro de los Susurros"

    r = client.post("/api/assistant/turn", json={"mensaje": "Tira 2d6+3 para forzar la puerta"})
    datos = r.json()
    assert any(a["action"] == "tirar_dado" and a["expr"] == "2d6+3" for a in datos["acciones"])

    r = client.post("/api/assistant/turn", json={"mensaje": "Activa la escena Cripta de Ceniza"})
    datos = r.json()
    assert any(a["action"] == "activar_escena" for a in datos["acciones"])
    # restaurar escena
    estado = client.get("/api/modules/escenarios/state").json()
    claro = next(e for e in estado["escenas"] if e["nombre"] == "Claro de los Susurros")
    client.post("/api/modules/escenarios/action", json={"action": "activar", "id": claro["id"]})


def test_partidas_guardar_cargar_export_import(client):
    # estado actual
    inv = client.get("/api/modules/inventario/state").json()
    total_antes = inv["total_items"]
    r = client.post("/api/modules/partidas/action", json={"action": "guardar", "nombre": "Sesión de prueba"})
    assert r.status_code == 200, r.text
    save = next(s for s in r.json()["partidas"] if s["nombre"] == "Sesión de prueba")

    # modificar algo
    kaelen = next(p for p in inv["personajes"] if p["nombre"] == "Kaelen")
    seccion = kaelen["secciones"][0]
    client.post("/api/modules/inventario/action", json={
        "action": "crear_item", "section_id": seccion["id"], "nombre": "Temporal", "qty": 1})
    assert client.get("/api/modules/inventario/state").json()["total_items"] == total_antes + 1

    # cargar debe quitar el temporal
    r = client.post("/api/modules/partidas/action", json={"action": "cargar", "id": save["id"]})
    assert r.status_code == 200, r.text
    assert client.get("/api/modules/inventario/state").json()["total_items"] == total_antes

    export = client.get(f"/api/saves/{save['id']}/export")
    assert export.status_code == 200
    snapshot = export.json()
    assert snapshot["formato"] == "ttrpg-assistant/partida"
    snapshot["nombre"] = "Copia importada"
    imp = client.post("/api/saves/import", json=snapshot)
    assert imp.status_code == 200, imp.text
    assert any("importada" in s["nombre"] for s in imp.json()["partidas"])

    # borrar la copia importada
    copia = next(s for s in imp.json()["partidas"] if "importada" in s["nombre"])
    assert client.post("/api/modules/partidas/action", json={"action": "borrar", "id": copia["id"]}).status_code == 200


def test_minibase_no_configurada_no_bloquea(client):
    estado = client.get("/api/modules/minibase/state").json()
    assert estado["configurado"] is False
    r = client.post("/api/modules/minibase/action", json={"action": "buscar", "query": "dragón"})
    assert r.status_code == 200
    assert r.json()["ok"] is False
    assert "MINIBASE_URL" in r.json()["error"]


def test_eventos_bus(client):
    latest = client.get("/api/events/latest").json()["latest"]
    assert latest > 0
    r = client.get(f"/api/events?since={max(0, latest - 5)}")
    assert r.status_code == 200
    assert "events" in r.json()


def test_biblioteca_catalogo_ficha_y_contexto(client):
    r = client.get("/api/modules/biblioteca/state")
    assert r.status_code == 200
    estado = r.json()
    assert estado["total"] >= 48
    assert any(f["id"] == "dnd-5e" for f in estado["catalogo"])
    assert any(c["valor"] == "rol" for c in estado["facetas"]["categorias"])
    assert any(c["valor"] == "universal" for c in estado["facetas"]["generos"])

    r = client.post(
        "/api/modules/biblioteca/action",
        json={"action": "seleccionar", "ficha_id": "dnd-5e"},
    )
    assert r.status_code == 200
    assert r.json()["sistema_activo"]["id"] == "dnd-5e"

    detalle = client.get("/api/biblioteca/fichas/dnd-5e").json()
    assert detalle["titulo"] == "D&D 5e / 2024"
    assert "d20" in detalle["motor"].lower()
    assert len(detalle["contenido"]) > 1000

    ctx = client.get("/api/assistant/context").json()
    assert ctx["biblioteca"]["sistema_activo"]["id"] == "dnd-5e"
    assert "D&D" in ctx["biblioteca"]["ficha_base"]
    assert ctx["badges_de_modulos"]["biblioteca"] >= 48


def test_biblioteca_documentos_vinculos_y_mythic(client):
    texto = "Aventura de prueba.\n\nLa puerta del faro está cerrada."
    r = client.post(
        "/api/biblioteca/documentos",
        files={"archivo": ("aventura-prueba.txt", texto.encode("utf-8"), "text/plain")},
        data={"sistema_id": "call-of-cthulhu"},
    )
    assert r.status_code == 200
    doc = r.json()["documento"]
    assert doc["tipo"] == "txt"

    docs = client.get("/api/biblioteca/documentos").json()["documentos"]
    assert any(d["id"] == doc["id"] and d["sistema_id"] == "call-of-cthulhu" for d in docs)

    leido = client.get(f"/api/biblioteca/documentos/{doc['id']}").json()
    assert "faro" in leido["contenido"]

    r = client.post(
        "/api/modules/biblioteca/action",
        json={"action": "seleccionar", "ficha_id": "call-of-cthulhu"},
    )
    assert r.status_code == 200
    ctx = client.get("/api/biblioteca/contexto").json()
    assert any(d["id"] == doc["id"] for d in ctx["documentos_vinculados"])

    r = client.post(
        "/api/modules/biblioteca/action",
        json={"action": "mythic_tirar", "tipo": "completo", "pregunta": "¿Hay una trampa?"},
    )
    assert r.status_code == 200
    resultado = r.json()["resultado"]
    assert resultado["foco"]["texto"]
    assert resultado["accion"]
    assert resultado["sujeto"]
    assert len(resultado["tiradas"]) == 4

    r = client.delete(f"/api/biblioteca/documentos/{doc['id']}")
    assert r.status_code == 200


def test_biblioteca_pdf_y_version_clasica(client):
    estado = client.get("/api/modules/biblioteca/state").json()
    pdf = next(d for d in estado["documentos"] if d["tipo"] == "pdf")
    leido = client.get(f"/api/biblioteca/documentos/{pdf['id']}", params={"max_chars": 4000}).json()
    assert leido["tipo"] == "pdf"
    assert leido["caracteres"] > 1000
    assert "d20" in leido["contenido"].lower()

    r = client.get("/biblioteca-clasica/index.html")
    assert r.status_code == 200
    assert "Biblioteca TTRPG" in r.text
