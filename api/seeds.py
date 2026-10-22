"""Seeds placeholder: 3 personajes, 2 criaturas, 18 items, 3 escenas, reglas,
NPCs, sonidos sintéticos y 7 pantallas componibles. Idempotente por versión.
"""
from __future__ import annotations

import uuid

from sqlmodel import Session, select

from models import (
    AiMessage, AppKv, Character, DiceLog, InventoryItem, InventorySection,
    ModuleInstance, Npc, Ruleset, Scene, Screen, SoundAsset,
)
from registry import MODULE_MAP
from rules.catalog import MIX_INICIAL, mix_texto, normalizar_mix
from utils import dumps

SEED_VERSION = 1


def _token(nombre: str, emoji: str, x: int, y: int, color: str = "#f5b544",
           character_id: int | None = None) -> dict:
    return {
        "id": uuid.uuid4().hex[:10],
        "nombre": nombre,
        "emoji": emoji,
        "x": x,
        "y": y,
        "color": color,
        "character_id": character_id,
    }


def _add_section(session: Session, character_id: int, nombre: str, orden: int) -> InventorySection:
    seccion = InventorySection(character_id=character_id, nombre=nombre, orden=orden)
    session.add(seccion)
    session.flush()
    return seccion


def _add_item(session: Session, section_id: int, nombre: str, qty: int = 1,
              valor: str = "", nota: str = "", icono: str = "📦") -> InventoryItem:
    item = InventoryItem(section_id=section_id, nombre=nombre, qty=qty, valor=valor,
                         nota=nota, icono=icono)
    session.add(item)
    session.flush()
    return item


def _pantalla(session: Session, nombre: str, slug: str, orden: int,
              layout: dict[str, list[tuple[str, dict, bool]]]) -> Screen:
    pantalla = Screen(nombre=nombre, slug=slug, orden=orden)
    session.add(pantalla)
    session.flush()
    # overlays disponibles en todas las pantallas (el asistente vive en cualquiera)
    layout = {k: list(v) for k, v in layout.items()}
    layout.setdefault("overlay", [])
    existentes = {m[0] for m in layout["overlay"]}
    for module_id in ("asistente", "sonido", "editor"):
        if module_id not in existentes:
            layout["overlay"].append((module_id, {"abierto": False}, module_id == "editor"))
    resumen: dict[str, list[int]] = {}
    for slot, instancias in layout.items():
        resumen[slot] = []
        for i, (module_id, props, collapsed) in enumerate(instancias):
            if module_id not in MODULE_MAP:
                continue
            inst = ModuleInstance(
                screen_id=int(pantalla.id), module_id=module_id, slot=slot,
                orden=i, props_json=dumps(props), collapsed=collapsed,
            )
            session.add(inst)
            session.flush()
            resumen[slot].append(int(inst.id))
    pantalla.layout_json = dumps(resumen)
    session.add(pantalla)
    session.flush()
    return pantalla


def seed_all(session: Session) -> bool:
    bandera = session.get(AppKv, "seed_version")
    if bandera:
        return False
    if session.exec(select(Character)).first():
        # base ya poblada por otra vía: no duplicar
        session.add(AppKv(key="seed_version", value_json=dumps({"version": SEED_VERSION})))
        session.commit()
        return False

    # ---------------------------------------------------------------- sonidos
    sonidos = [
        SoundAsset(nombre="Bosque de susurros", grupo="Ambiente", src="synth:bosque", volumen=0.5),
        SoundAsset(nombre="Lluvia sobre piedra", grupo="Ambiente", src="synth:lluvia", volumen=0.45),
        SoundAsset(nombre="Drone de cripta", grupo="Ambiente", src="synth:cripta", volumen=0.5),
        SoundAsset(nombre="Murmullo de mercado", grupo="Ambiente", src="synth:mercado", volumen=0.45),
        SoundAsset(nombre="Tambores de combate", grupo="Música", src="synth:combate", volumen=0.55, loop=True),
        SoundAsset(nombre="Taberna cálida", grupo="Ambiente", src="synth:taberna", volumen=0.4),
        SoundAsset(nombre="Viento gélido", grupo="Ambiente", src="synth:viento", volumen=0.4),
    ]
    for s in sonidos:
        session.add(s)
    session.flush()
    s_bosque, s_lluvia, s_cripta, s_mercado, s_combate, s_taberna, s_viento = sonidos

    # ------------------------------------------------------------- personajes
    kaelen = Character(nombre="Kaelen", kind="personaje", emoji="🧝", hp=24, hp_max=30,
                       notas="Explorador del bosque. Debe un favor al Maestro Voss.",
                       stats_json=dumps({"FUE": 12, "DES": 17, "CON": 14, "INT": 10, "SAB": 15, "CAR": 9}))
    nyx = Character(nombre="Nyx", kind="personaje", emoji="🔮", hp=18, hp_max=22,
                    notas="Hechicera expulsada de la Academia de Sal. Su grimorio tiene una página en blanco.",
                    stats_json=dumps({"FUE": 7, "DES": 13, "CON": 11, "INT": 18, "SAB": 14, "CAR": 16}))
    thorn = Character(nombre="Thorn", kind="personaje", emoji="🛡️", hp=32, hp_max=35,
                      notas="Guerrero veterano. Busca a su hermana en la Cripta de Ceniza.",
                      stats_json=dumps({"FUE": 18, "DES": 10, "CON": 16, "INT": 8, "SAB": 12, "CAR": 11}))
    lobo = Character(nombre="Lobo espectral", kind="criatura", emoji="🐺", hp=11, hp_max=15,
                     notas="Aparece entre la niebla; sus ojos reflejan luz que no existe.",
                     stats_json=dumps({"ataque": "+3", "defensa": 12, "movimiento": 7, "daño": "1d6+1"}))
    trasgo = Character(nombre="Trasgo de ceniza", kind="criatura", emoji="👹", hp=7, hp_max=12,
                       notas="Pequeño, ruidoso y siempre en grupo.",
                       stats_json=dumps({"ataque": "+2", "defensa": 10, "movimiento": 5, "daño": "1d4"}))
    for c in (kaelen, nyx, thorn, lobo, trasgo):
        session.add(c)
    session.flush()

    # -------------------------------------------------------------- inventario
    armas_k = _add_section(session, int(kaelen.id), "Armas", 0)
    cons_k = _add_section(session, int(kaelen.id), "Consumibles", 1)
    tesoro_k = _add_section(session, int(kaelen.id), "Tesoro", 2)
    _add_item(session, int(armas_k.id), "Espada corta", 1, "15 po", "Hoja heredada de su padre.", "🗡️")
    _add_item(session, int(armas_k.id), "Arco largo", 1, "25 po", "Cuerda de tripa de ciervo.", "🏹")
    _add_item(session, int(armas_k.id), "Daga de caza", 2, "5 po", "Una en la bota, otra en el cinturón.", "🔪")
    _add_item(session, int(cons_k.id), "Poción de curación", 3, "50 po", "Sabe a raíz quemada.", "🧪")
    _add_item(session, int(cons_k.id), "Antídoto", 1, "20 po", "", "💊")
    _add_item(session, int(cons_k.id), "Raciones de viaje", 5, "5 pp", "Pan duro y carne ahumada.", "🍖")
    _add_item(session, int(tesoro_k.id), "Monedas de oro", 120, "1 po", "Bolsa de cuero gastada.", "🪙")
    _add_item(session, int(tesoro_k.id), "Amuleto de jade", 1, "?", "Late débilmente cerca de la cripta.", "🟢")

    armas_n = _add_section(session, int(nyx.id), "Armas", 0)
    cons_n = _add_section(session, int(nyx.id), "Consumibles", 1)
    tesoro_n = _add_section(session, int(nyx.id), "Tesoro", 2)
    _add_item(session, int(armas_n.id), "Bastón de sal", 1, "40 po", "Canaliza magia de protección.", "🪄")
    _add_item(session, int(armas_n.id), "Daga ritual", 1, "12 po", "Grabada con nombres que cambian.", "🗡️")
    _add_item(session, int(cons_n.id), "Poción de maná", 2, "60 po", "", "🔵")
    _add_item(session, int(cons_n.id), "Incienso de mirra", 3, "8 po", "Para lecturas difícilles.", "🕯️")
    _add_item(session, int(tesoro_n.id), "Grimorio incompleto", 1, "?", "Falta la página 13.", "📕")
    _add_item(session, int(tesoro_n.id), "Gema de cuarzo", 4, "10 po", "", "💎")

    armas_t = _add_section(session, int(thorn.id), "Armas", 0)
    cons_t = _add_section(session, int(thorn.id), "Consumibles", 1)
    mont_t = _add_section(session, int(thorn.id), "Monturas", 2)
    _add_item(session, int(armas_t.id), "Hacha de guerra", 1, "30 po", "Mellada en tres batallas.", "🪓")
    _add_item(session, int(armas_t.id), "Escudo de torre", 1, "20 po", "Pintado con un cuervo.", "🛡️")
    _add_item(session, int(cons_t.id), "Vendas", 4, "2 po", "", "🩹")
    _add_item(session, int(mont_t.id), "Pony de carga", 1, "25 po", "Se llama Ceniza. Muerde.", "🐴")

    # ----------------------------------------------------------------- escenas
    claro = Scene(
        nombre="Claro de los Susurros",
        descripcion="Un bosque húmedo donde las ramas repiten nombres olvidados. La luz cae en columnas verdes.",
        bg="radial-gradient(120% 90% at 30% 10%, #1e5c3f 0%, #123a2a 45%, #07130f 100%)",
        light_json=dumps({"color": "#9ae6b4", "opacity": 0.18}),
        tokens_json=dumps([
            _token("Kaelen", "🧝", 2, 3, "#67e8f9", int(kaelen.id)),
            _token("Nyx", "🔮", 3, 5, "#c084fc", int(nyx.id)),
            _token("Lobo espectral", "🐺", 8, 2, "#a5b4fc", int(lobo.id)),
        ]),
        playlist_json=dumps([int(s_bosque.id), int(s_viento.id)]),
        activo=True,
    )
    cripta = Scene(
        nombre="Cripta de Ceniza",
        descripcion="Pasillos de piedra negra cubiertos de ceniza tibia. Algo respira al final del corredor.",
        bg="radial-gradient(110% 100% at 70% 20%, #3b1d4f 0%, #1b1026 50%, #08060d 100%)",
        light_json=dumps({"color": "#c084fc", "opacity": 0.3}),
        tokens_json=dumps([
            _token("Thorn", "🛡️", 5, 7, "#f87171", int(thorn.id)),
            _token("Trasgo de ceniza", "👹", 9, 3, "#fb923c", int(trasgo.id)),
            _token("Trasgo de ceniza", "👹", 10, 4, "#fb923c", int(trasgo.id)),
        ]),
        playlist_json=dumps([int(s_cripta.id), int(s_combate.id)]),
        activo=False,
    )
    mercado = Scene(
        nombre="Mercado de Sal",
        descripcion="Puestos de lona ocres, especias picantes y rumores a gritos. Nadie mira dos veces a un extranjero.",
        bg="radial-gradient(120% 90% at 20% 15%, #7c4a1d 0%, #4a2a12 45%, #160d07 100%)",
        light_json=dumps({"color": "#fbbf24", "opacity": 0.16}),
        tokens_json=dumps([
            _token("Nyx", "🔮", 6, 4, "#c084fc", int(nyx.id)),
            _token("Kaelen", "🧝", 7, 5, "#67e8f9", int(kaelen.id)),
        ]),
        playlist_json=dumps([int(s_mercado.id), int(s_taberna.id)]),
        activo=False,
    )
    for esc in (claro, cripta, mercado):
        session.add(esc)
    session.flush()

    # -------------------------------------------------------------------- npcs
    npcs = [
        Npc(nombre="Maestro Voss", voz="Baja, pausada, con roce de carbón",
            tono="Misterioso y cortante; nunca responde dos veces lo mismo.",
            phrases_json=dumps([
                "La ceniza recuerda lo que vosotros olvidáis.",
                "No preguntéis quién abrió la puerta. Preguntad qué quería al otro lado.",
                "Os venderé la verdad, pero no barata.",
            ]),
            notas="Anticuario. Paga con información, nunca con oro."),
        Npc(nombre="Tabernero Guld", voz="Cálida y algo ronca",
            tono="Pragmático y hospitalario; esconde el miedo tras el mostrador.",
            phrases_json=dumps([
                "Aquí se paga antes de beber, forastero.",
                "Anoche bajaron tres hombres a la cripta. Solo subió uno, y no hablaba.",
                "Si buscáis a Ilse, está en la capilla. Rezando o escondiéndose, nunca lo sé.",
            ]),
            notas="Sabe más de lo que dice. Protege a su hija."),
        Npc(nombre="Hermana Ilse", voz="Susurrante, con eco de piedra",
            tono="Profética y compasiva; le incomodan las mentiras directas.",
            phrases_json=dumps([
                "El jade que lleváis ya estaba aquí antes de que hubiera nombres.",
                "No temáis a la oscuridad. Temed a lo que aprende dentro de ella.",
                "Hay una puerta que solo se abre hacia dentro.",
            ]),
            notas="Sacerdotisa de la capilla de sal. Ciega desde el incendio."),
    ]
    for n in npcs:
        session.add(n)

    # ------------------------------------------------------------------ reglas
    mix = normalizar_mix(MIX_INICIAL)
    base = Ruleset(nombre="Mesa base", activo=True, mix_json=dumps(mix))
    dados_puros = Ruleset(nombre="Dados puros", activo=False,
                          mix_json=dumps(normalizar_mix({"activos": ["d20"], "opciones": {}})))
    session.add(base)
    session.add(dados_puros)
    session.flush()

    # ---------------------------------------------------------------- pantallas
    _pantalla(session, "Mesa del DM", "mesa", 0, {
        "principal": [("dado", {}, False), ("escenario", {"compacto": False}, False)],
        "lateral": [("estado", {}, False), ("personajes", {}, False)],
        "inferior": [("notas", {}, False)],
    })
    _pantalla(session, "Escenario", "escenario", 1, {
        "principal": [("escenario", {"compacto": False}, False)],
        "lateral": [("escenarios", {}, False), ("estado", {}, True)],
    })
    _pantalla(session, "Proyector", "proyector", 2, {
        "principal": [("proyector", {}, False)],
        "overlay": [("asistente", {"abierto": False}, False)],
    })
    _pantalla(session, "Reglas", "reglas", 3, {
        "principal": [("reglas", {}, False)],
        "lateral": [("estado", {}, True), ("dado", {}, False)],
    })
    _pantalla(session, "Inventario", "inventario", 4, {
        "principal": [("inventario", {}, False)],
        "lateral": [("personajes", {}, True), ("estado", {}, True)],
    })
    _pantalla(session, "Crónicas", "cronicas", 5, {
        "principal": [("partidas", {}, False), ("npcs", {}, False)],
        "lateral": [("estado", {}, True)],
    })
    _pantalla(session, "Escenas", "escenas", 6, {
        "principal": [("escenarios", {}, False), ("escenario", {}, False)],
        "lateral": [("estado", {}, True)],
    })

    # --------------------------------------------------------------- memoria IA
    session.add(AiMessage(
        conversacion="principal", role="assistant",
        contenido=("Mesa lista. Veo 3 personajes, 3 escenas y la mezcla "
                   f"{mix_texto(mix)}. Pregúntame por la escena, por el inventario "
                   "o pídeme una tirada: siempre citaré los datos reales de esta mesa."),
        proveedor="sistema",
    ))
    session.add(AiMessage(
        conversacion="principal", role="user",
        contenido="¿Qué tenemos delante y qué llevamos encima?",
    ))
    session.add(AiMessage(
        conversacion="principal", role="assistant",
        contenido=("Estáis en **Claro de los Susurros**. Kaelen lleva una espada corta y 120 monedas "
                   "de oro; Nyx carga su grimorio incompleto. Las reglas activas combinan d20, "
                   "ventaja y Mythic. ¿Exploráis el claro o seguís el rastro del lobo espectral?"),
        proveedor="sistema",
    ))

    session.add(AppKv(key="notas_mesa", value_json=dumps({
        "texto": "Sesión 1 — El contrato de Voss.\n\n- El jade de Kaelen reacciona cerca de la cripta.\n"
                 "- Nyx quiere recuperar la página 13 de su grimorio.\n- Thorn busca a su hermana.\n"
                 "- No revelar todavía que Ilse es la hermana de Thorn."
    })))

    session.add(AppKv(key="seed_version", value_json=dumps({"version": SEED_VERSION})))
    session.commit()
    return True
