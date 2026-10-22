# ROADMAP — TTRPG-Assistant

Memoria del proyecto entre sesiones. Cada fase se cierra con tests, `npm run build` cuando toca y un commit `M<n>: ...`. El estado se actualiza aquí y en `dev_dairy.md`.

## Estado general

**MVP completo:** fases M0–M9 implementadas. Backend con **14 tests en verde**, frontend compilando y demo funcional en `http://127.0.0.1:3010/pantalla/mesa`.

- API: `http://127.0.0.1:8100`
- Web: `http://127.0.0.1:3010`
- SQLite: `api/data/assistant.db`
- Proveedor IA por defecto: `mock` contextual si no hay claves; cadena `glm → local → openai → mock`.

## Fases

| Fase | Objetivo | Estado | Evidencia |
| --- | --- | --- | --- |
| **M0** | Esqueleto FastAPI 8100 + Next 3010 + registro de módulos + pantalla `mesa` + editor persistente | ✅ | `registry.tsx`, `api/registry.py`, `screens`, `module_instances`, `events_log`, `OverlayDock`, `EditorModule` |
| **M1** | SQLModel + seeds (3 personajes, 2 criaturas, 18 items, 3 escenas, ruleset) + health + CORS | ✅ | `seeds.py`, `/health`, `/api/assistant/context`, tests |
| **M2** | Dados autoritativos JEV + d4–d20/d100/dF + N dados + mod + 2D/3D + historial | ✅ | `api/rules/dice.py`, `DadoModule`, `DiceStage3D`, `dice_logs` |
| **M3** | Inventario por secciones, CRUD completo, búsqueda, emoji, mover items, tokens | ✅ | `inventory.py`, `InventarioModule`, `data/tokens/placeholder.svg` |
| **M4** | Núcleos d20 + ventaja + Mythic + spawn, mezcla activa, rulesets | ✅ | `api/rules/builtin/*`, `ReglasModule`, `rulesets` |
| **M5** | Asistente IA con contexto total, router de proveedores, mock contextual, acciones whitelist | ✅ | `ai/llm.py`, `assistant.py`, `AsistenteModule`, `lib/actions.ts` |
| **M6** | Escenas: tablero 12×9, tokens, luz, activación, proyector sincronizado | ✅ | `scenes.py`, `SceneBoard`, `EscenarioModule`, `/proyector` |
| **M7** | Personajes/criaturas/NPCs, textos IA, snapshots de partida, export/import | ✅ | `characters.py`, `npcs.py`, `saves.py`, `PartidasModule` |
| **M8** | Sonidos por escena, WebAudio sintético, archivos locales, crossfade | ✅ | `sounds.py`, `lib/audio.ts`, `SonidoModule` |
| **M9** | Adaptador MiniBase read-only (catálogo, vínculos, table_state) sin bloquear la app | ✅ (degradado) | `minibase.py`, `MiniBaseModule`, `mini_links`; falta probar contra una instancia real con token |

## Decisiones de arquitectura

- Una sola tabla `characters` con `kind = personaje | criatura`; el inventario cuelga de `character_id`.
- JSON guardado como `TEXT` en SQLite y serializado en Python; timestamps ISO con zona local.
- `registry.tsx` manda en el render; `api/registry.py` valida y alimenta badges. Los ids deben coincidir.
- Router de IA sin claves obligatorias. El mock cita datos reales y propone acciones válidas.
- Las acciones de la IA se devuelven al frontend; **nunca se auto-ejecutan**.
- Dados 3D con `three` puro (sin `@react-three/fiber`) para evitar dependencias pesadas.
- Sonido: presets sintéticos WebAudio + archivos opcionales en `api/data/sounds/`.
- El layout se refresca con polling de eventos cada 4 s; las pantallas no se desmontan al refrescar (bug corregido en M5/M0).
- MiniBase es solo lectura y opcional; si no hay URL/token, el módulo muestra el modo local.

## Checklist final de demo (sección 10 del prompt)

- [x] Abrir web 3010 y navegar pantallas/módulos sin errores de consola.
- [x] Tirar los 7 dados 2D y 3D con N dados + mod; ver animación, resultado e historial.
- [x] Crear sección + items con emoji, mover item de sección, ver detalle clickeable.
- [x] Activar/desactivar/mezclar reglas (d20 + Mythic + spawn) y ver mezcla explicada.
- [x] Preguntar al asistente y que cite el último dado y un objeto real del inventario.
- [x] Crear escenarios, activar uno y ver proyector + escena + luz sincronizadas.
- [x] Reproducir sonidos asignados a la escena con crossfade al cambiar.
- [x] Crear/editar personaje/criatura/NPC con textos NPC.
- [x] Guardar partida, recargar, cargar y encontrar todo igual.
- [x] Export/import JSON de partida.
- [x] (M9) Buscar mini real y usarla como token/item **cuando hay MiniBase configurada**; sin conexión el módulo degrada sin romper nada.
- [x] Todo el estado en `GET /api/assistant/context`, coherente y listo para la IA.

## Pendientes / ideas futuras (no bloquean el MVP)

1. **Drag & drop real** de tokens y de módulos entre slots (hoy: clic para mover y editor por botones).
2. **Subida de archivos** de sonido/tokens desde la UI (hoy se copian a `api/data/` y se indexan).
3. **Visión/cámara** como módulo futuro (la arquitectura ya lo permite; no está en el MVP).
4. **MiniBase real:** validar `GET /api/minis`, búsqueda semántica y `table_state` contra una instancia con `MINIBASE_URL`/`MINIBASE_TOKEN`.
5. **Autenticación/multiusuario** si el proyecto sale de la mesa local.
6. **WebSocket/SSE** en lugar de polling para el bus de eventos.
7. **Tests E2E** automatizados en CI (hoy hay CDP manual + pytest + build).

## Cómo retomar

1. Leer este ROADMAP, `MODULES.md`, `dev_dairy.md` y `git log --oneline`.
2. Arrancar con `.\iniciar.ps1` (o los dos comandos de `README.md`).
3. Verificar `GET /health` y `/api/assistant/context`.
4. Elegir un pendiente, implementarlo como módulo/extensión y documentar aquí antes de tocar código.
5. `pytest -q`, `npm run build`, actualizar los tres docs y commit `M<n>: ...`.
