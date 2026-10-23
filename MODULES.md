# Módulos de TTRPG-Assistant

Este documento es el mapa de los **17 módulos** registrados. La fuente de verdad del render es `web/src/modules/registry.tsx`; su gemelo de validación es `api/registry.py`. Toda pantalla se compone desde ahí, nunca con imports directos.

## Contrato común

```http
GET  /api/modules/<id>/state
POST /api/modules/<id>/action
```

- `state` devuelve el estado persistido que necesita el componente.
- `action` recibe `{ "action": "...", ... }` y **siempre** devuelve el estado actualizado.
- Cada acción relevante escribe en `events_log` para que el resto de pantallas se refresque.
- Todos los datos aportan a `GET /api/assistant/context` (campo general o `badges_de_modulos`).

## Resumen

| Módulo | id | Slot por defecto | Backend | Acciones principales |
| --- | --- | --- | --- | --- |
| Reloj de mesa | `reloj` | lateral | `modules/core.py` | `sincronizar` |
| Notas del DM | `notas` | inferior | `modules/core.py` | `guardar` |
| Estado de partida | `estado` | lateral | `modules/core.py` | `resumen` |
| Dados | `dado` | principal | `modules/dice.py` | `tirar` |
| Inventario | `inventario` | principal | `modules/inventory.py` | secciones e items CRUD + mover |
| Núcleos de reglas | `reglas` | principal | `modules/rules.py` | `toggle`, `set_opcion`, `guardar_ruleset`, checks |
| Escenario activo | `escenario` | principal | `modules/scenes.py` (alias) | tokens y luz sobre la escena activa |
| Escenarios | `escenarios` | lateral | `modules/scenes.py` | CRUD, activar, tokens, luz |
| Proyector | `proyector` | principal | `modules/core.py` | `publicar`, `refrescar` |
| Sonido ambiente | `sonido` | overlay | `modules/sounds.py` | crear/editar/borrar/asignar |
| Personajes y criaturas | `personajes` | lateral | `modules/characters.py` | crear/editar/borrar/enviar al tablero |
| NPCs | `npcs` | lateral | `modules/npcs.py` | crear/editar/borrar + texto IA |
| Partidas guardadas | `partidas` | principal | `modules/saves.py` | guardar/cargar/borrar + export/import |
| Asistente IA | `asistente` | overlay | `modules/assistant.py` | `limpiar` + chat en `/api/assistant/turn` |
| MiniBase | `minibase` | lateral | `modules/minibase.py` | `probar`, `buscar`, `importar`, `publicar_escena` |
| Biblioteca TTRPG | `biblioteca` | principal | `modules/biblioteca.py` + `library.py` | `seleccionar`, `limpiar`, `vincular_documento`, `mythic_tirar` |
| Editor de pantallas | `editor` | overlay | `modules/core.py` | crear pantalla, añadir/quitar/colapsar módulo |

---

## Reloj de mesa (`reloj`)

- **Frontend:** `web/src/modules/RelojModule.tsx`
- **Qué hace:** hora local, fecha en español y zona horaria. Se actualiza cada segundo en cliente.
- **API:** `GET /api/modules/reloj/state`, `POST /api/modules/reloj/action` (`sincronizar`).
- **Contexto:** badge `reloj: 1`; la fecha real va en `fecha`.

## Notas del DM (`notas`)

- **Frontend:** `web/src/modules/NotasModule.tsx`
- **Qué hace:** cuaderno libre persistente, contador de palabras y guardado explícito.
- **API:** `GET .../notas/state`, `POST .../notas/action` → `{action:"guardar", texto}`.
- **Contexto:** `notas_dm` con el texto completo. El prompt advierte que son privadas y no deben citarse literalmente si parecen secretos.
- **Persistencia:** tabla `app_kv`, clave `notas_mesa`.

## Estado de partida (`estado`)

- **Frontend:** `web/src/modules/EstadoModule.tsx`
- **Qué hace:** resumen vivo de escena, mezcla de reglas, personajes, criaturas, items, tiradas, NPCs y sonidos.
- **API:** `GET .../estado/state`, `POST .../estado/action` (`resumen`).
- **Contexto:** es una vista derivada de `build_context`; no almacena estado propio.

## Dados (`dado`)

- **Frontend:** `web/src/modules/DadoModule.tsx`, `components/DiceStage3D.tsx`
- **Qué hace:** botones d4, d6, d8, d10, d12, d20, d100 y dF; N dados, modificador, expresión manual, modo 2D/3D, historial con razón y repetición.
- **API:**
  - `GET /api/modules/dado/state` → tipos, historial y total.
  - `POST /api/modules/dado/action` → `{action:"tirar", expr:"3d6+2", razon:"...", personaje:"Kaelen"}`.
  - Alias: `POST /api/modules/dado/tirar`.
- **Autoridad:** el total sale de `api/rules/dice.py` (motor JEV portado). La animación 3D es decorativa y se fuerza al resultado del servidor.
- **Persistencia:** `dice_logs`.
- **Contexto:** `ultimas_tiradas` (20) y badge `dado`.

## Inventario (`inventario`)

- **Frontend:** `web/src/modules/InventarioModule.tsx`
- **Qué hace:** selector de personaje/criatura (prioriza personajes), secciones plegables, búsqueda, detalle de item editable, emoji picker y movimiento entre secciones.
- **API:**
  - `GET /api/modules/inventario/state`
  - `POST .../action`: `crear_seccion`, `editar_seccion`, `borrar_seccion`, `crear_item`, `editar_item`, `mover_item`, `borrar_item`.
- **Persistencia:** `inventory_sections` e `inventory_items`, colgadas de `characters.id`.
- **Contexto:** cada personaje lleva `inventario_resumen` y `inventario_total_items`; badge `inventario`.

## Núcleos de reglas (`reglas`)

- **Frontend:** `web/src/modules/ReglasModule.tsx`
- **Qué hace:** tarjetas explicativas con toggle, panel de **MIX ACTIVO**, opciones por regla (p. ej. caos Mythic), checks rápidos, guardar/activar/borrar rulesets.
- **Reglas incluidas:**
  - `d20`: check `d20 + mod` contra CD.
  - `ventaja`: 2d20 y se queda el mejor/peor.
  - `mythic`: `fate_check` (sí/no con caos) y `event_meaning`.
  - `spawn`: sugiere `dX+Y` para cantidades de criaturas.
- **API:** `GET .../reglas/state`; `POST .../action`: `toggle`, `set_opcion`, `guardar_ruleset`, `activar_ruleset`, `borrar_ruleset`, `check_d20`, `fate_check`, `event_meaning`, `spawn`.
- **Persistencia:** `rulesets` con `mix_json`; solo uno activo.
- **Contexto:** `mix_reglas` con activos, opciones, texto explicativo y ruleset.

## Escenario activo (`escenario`)

- **Frontend:** `web/src/modules/EscenarioModule.tsx`, `components/SceneBoard.tsx`
- **Qué hace:** tablero 12×9 de la escena activa, tokens con emoji, clic para colocar/mover/seleccionar, control de luz y playlist.
- **API:**
  - `GET /api/modules/escenario/state` → escena activa, grid, sonidos.
  - `POST .../escenario/action` → alias que opera sobre la escena activa para `agregar_token`, `mover_token`, `borrar_token`, `set_light`.
- **Contexto:** `escena_activa` con tokens y luz; `table_state` listo para proyector.

## Escenarios (`escenarios`)

- **Frontend:** `web/src/modules/EscenariosModule.tsx`
- **Qué hace:** catálogo de escenas, creación/edición/borrado, activación, playlist por escena, presets de fondo.
- **API:** `GET .../escenarios/state`; `POST .../action`: `crear`, `editar`, `borrar`, `activar`, `agregar_token`, `mover_token`, `borrar_token`, `set_light`.
- **Persistencia:** `scenes` (`bg`, `light_json`, `tokens_json`, `playlist_json`, `activo`). Solo una escena activa.
- **Contexto:** `escena_activa`, listado `escenas`, badge `escenarios`.

## Proyector (`proyector`)

- **Frontend:** `web/src/modules/ProyectorModule.tsx` y ruta limpia `web/src/app/proyector/page.tsx`.
- **Qué hace:** vista de segunda pantalla con fondo, tokens, luz, personajes y última tirada. Se refresca por polling y responde a eventos.
- **API:** `GET /api/modules/proyector/state`, `POST .../proyector/action` (`publicar` / `refrescar`).
- **Contexto:** `table_state` (`phase`, `grid_visible`, `tokens`).

## Sonido ambiente (`sonido`)

- **Frontend:** `web/src/modules/SonidoModule.tsx`, motor en `web/src/lib/audio.ts`.
- **Qué hace:** biblioteca por grupos, play/stop, volumen, loop, presets sintéticos WebAudio, asignación a la escena activa y crossfade al cambiar de escena.
- **API:**
  - `GET /api/modules/sonido/state` → grupos, total, escena activa, presets, carpeta.
  - `POST .../action`: `crear_sintetico`, `editar`, `borrar`, `asignar_escena`.
- **Archivos:** los mp3/ogg/wav depositados en `api/data/sounds/` se indexan automáticamente.
- **Contexto:** `sonidos_disponibles` con id, nombre, grupo, loop y volumen.

## Personajes y criaturas (`personajes`)

- **Frontend:** `web/src/modules/PersonajesModule.tsx`
- **Qué hace:** fichas con emoji, tipo (`personaje`/`criatura`), HP con +/- rápido, stats libres, notas, edición y envío al tablero.
- **API:** `GET .../personajes/state`; `POST .../action`: `crear`, `editar`, `borrar`, `enviar_a_escena`.
- **Persistencia:** tabla única `characters` con `kind`.
- **Contexto:** `personajes` con HP, stats, notas e inventario resumido.

## NPCs (`npcs`)

- **Frontend:** `web/src/modules/NpcsModule.tsx`
- **Qué hace:** nombre, voz, tono, frases frecuentes y notas; botón «Redactar texto» que llama a la IA con el tono del NPC y permite copiar/editar.
- **API:** `GET .../npcs/state`; `POST .../action`: `crear`, `editar`, `borrar`; texto en `POST /api/assistant/npc_text`.
- **Contexto:** `npcs` con voz, tono, frases y notas.

## Partidas guardadas (`partidas`)

- **Frontend:** `web/src/modules/PartidasModule.tsx`
- **Qué hace:** guardar snapshot con nombre, listar, cargar, borrar, exportar JSON e importar un JSON.
- **API:**
  - `GET .../partidas/state`; `POST .../action`: `guardar`, `cargar`, `borrar`.
  - `GET /api/saves/{id}/export`.
  - `POST /api/saves/import`.
- **Snapshot:** personajes, inventarios, escenas, reglas, tiradas, NPCs, sonidos, mensajes IA, notas y layouts de pantallas.
- **Contexto:** badge `partidas`.

## Asistente IA (`asistente`)

- **Frontend:** `web/src/modules/AsistenteModule.tsx`, ejecutor en `web/src/lib/actions.ts`.
- **Qué hace:** chat de DM en cualquier pantalla, visor del contexto real, proveedor activo, latencia y tarjetas de acción pendientes de confirmación.
- **API:**
  - `GET .../asistente/state` → mensajes, proveedores, lista blanca serializada.
  - `POST .../asistente/action` → `limpiar`.
  - `POST /api/assistant/turn` → respuesta + acciones propuestas.
  - `GET /api/assistant/context`, `GET /api/assistant/providers`, `POST /api/assistant/npc_text`.
- **Lista blanca:** `tirar_dado`, `activar_escena`, `play_sound`, `anadir_item`, `cambiar_hp`, `crear_nota`, `redactar_npc`.
- **Seguridad:** la IA nunca ejecuta; el usuario confirma «Ejecutar». Cada acción se valida contra ids reales.
- **Persistencia:** `ai_messages` con `contexto_hash`.

## MiniBase (`minibase`)

- **Frontend:** `web/src/modules/MiniBaseModule.tsx`
- **Qué hace:** probar conexión, buscar minis reales, importarlas como token de escena o item de inventario y publicar la escena activa. Todo degrada a local si no hay conexión.
- **API:** `GET .../minibase/state`; `POST .../action`: `probar`, `buscar`, `importar`, `publicar_escena`.
- **Persistencia:** `mini_links` con `external_key` (`minibase:<id>`) para evitar duplicados.
- **Contexto:** `minibase.configurado`, `minibase.enlaces` y badge.
- **Regla de oro:** integración **read-only**; este repo no arranca ni modifica MiniBase.

## Biblioteca TTRPG (`biblioteca`)

- **Frontend:** `web/src/modules/BibliotecaModule.tsx`, render Markdown en `web/src/components/MarkdownView.tsx`.
- **Qué hace:** catálogo de fichas de sistemas, wargames, juegos de mesa, literatura y guías. Permite buscar, filtrar por categoría/género/tipo/motor, leer la ficha, activar un sistema para la mesa, consultar los generadores Mythic y subir material propio.
- **Fuente editable:** `biblioteca/` (fichas en Markdown, `taxonomia.json`, índices y PDF). `biblioteca/tools/build_index.py` regenera `datos.js`, `fichas.json` e `INDICE.md`.
- **API:**
  - `GET /api/modules/biblioteca/state` → catálogo, facetas, sistema activo, documentos, estadísticas y generadores.
  - `POST /api/modules/biblioteca/action` → `seleccionar`, `limpiar`, `vincular_documento`, `desvincular_documento`, `mythic_tirar`.
  - `GET /api/biblioteca/fichas/{id}` → ficha completa, personalización, enlaces y documentos vinculados.
  - `GET /api/biblioteca/documentos` y `POST /api/biblioteca/documentos` → listar y subir `.md`, `.txt` o `.pdf`.
  - `GET /api/biblioteca/documentos/{id}` → texto extraído (PDF con `pypdf`); `GET .../archivo` → descarga; `DELETE` → borra solo subidas.
  - `GET /api/biblioteca/contexto` → versión resumida para depuración del contexto IA.
- **Clasificación:** `biblioteca/taxonomia.json` mezcla `categoria`, `tipo_ui`, `familia`, `motor`, `dados`, `recursos` y `alias` sobre el front matter original. Los valores `tipo` originales se conservan para no romper la interfaz clásica.
- **Persistencia:** sistema activo y vínculos en `app_kv`; documentos subidos en `api/data/biblioteca/` (fuera de Git). Los PDF se cachean como texto en `api/data/biblioteca_cache/`.
- **Contexto IA:** `biblioteca.sistema_activo`, `ficha_base`, `personalizacion`, `documentos_vinculados` y badge `biblioteca`. El prompt ordena usar ese marco y no inventar reglas.
- **Interfaz clásica:** `GET /biblioteca-clasica/index.html` sirve la biblioteca original sin build; los assets están en `/biblioteca-assets/`.
- **No hace:** no arranca MiniBase, no modifica reglas activas y no ejecuta tiradas Mythic desde el prompt sin confirmación del usuario.

## Editor de pantallas (`editor`)

- **Frontend:** `web/src/modules/EditorModule.tsx`
- **Qué hace:** crear pantalla, elegir pantalla actual, añadir módulos por slot, colapsar/expandir, quitar instancias. Los overlays (asistente, sonido, editor) están en todas las pantallas.
- **API:**
  - `GET /api/modules/editor/state` → pantallas, registro y slots.
  - `POST /api/modules/editor/action` → `crear_pantalla`, `anadir_modulo`, `quitar_modulo`, `colapsar`.
  - También existen las rutas REST equivalentes `/api/screens` y `/api/screens/{id}/instances`.
- **Persistencia:** `screens.layout_json` + `module_instances`.
- **Contexto:** badge `editor` con número de pantallas.

---

## Añadir un módulo nuevo

1. Crear el componente en `web/src/modules/` y registrarlo en `registry.tsx`.
2. Añadir su metadata gemela en `api/registry.py`.
3. Crear `api/modules/<id>.py` con `GET /state` y `POST /action`.
4. Incluir el router en `api/main.py`.
5. Aportar su estado en `api/context.py` (y su badge).
6. Documentarlo aquí y en `ROADMAP.md`.
7. Añadir un test de contrato en `api/tests/test_api.py`.
