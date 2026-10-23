# ROADMAP — TTRPG-Assistant

Memoria del proyecto entre sesiones. Cada fase se cierra con tests, `npm run build` cuando toca y un commit `M<n>: ...`. El estado se actualiza aquí y en `dev_dairy.md`.

## Estado general

**MVP completo:** fases M0–M12 implementadas. Backend con **21 tests en verde**, frontend compilando y demo funcional en `http://127.0.0.1:3010/pantalla/mesa`.

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
| **M10** | Biblioteca TTRPG integrada: fichas, taxonomía, documentos propios, sistema activo y generadores Mythic | ✅ | `biblioteca/`, `library.py`, `modules/biblioteca.py`, `BibliotecaModule`, `taxonomia.json`, `documentos/`, tests |
| **M11** | Proyector de mapas: subida de imágenes, rotación, zoom, paneo, rejilla con tamaño de celda y calibración física, popup sincronizado | ✅ | `scenes.py` (`presentacion_json`, endpoints de mapa), `ProjectorStage`, `ProyectorModule`, `/proyector`, `lib/proyector.ts`, tests |
| **M12** | Luces y efectos superpuestos: presets, niebla, portales, degradados, texturas PNG/WebP/MP4, capas sobre mapa/rejilla, arrastre de tokens en el proyector, tablero editable en el catálogo, luz ambiental en la sala y capas ancladas al recuadro del mapa | ✅ | `serializers.py`, `scenes.py` (endpoints de efectos), `ProjectorEffects`, `ProjectorEffectsPanel`, `ProjectorStage`, `SceneBoard`, `ProyectorModule`, `EscenariosModule`, tests |

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
- La biblioteca es un módulo más: la fuente editable vive en `biblioteca/`, la API la lee en caliente y el sistema activo + documentos vinculados entran en el contexto del asistente.
- La taxonomía editorial no reescribe las fichas originales: se mezcla desde `biblioteca/taxonomia.json` en el índice y en la API.
- Las subidas de material propio van a `api/data/biblioteca/` y nunca se versionan; los PDF se leen con `pypdf` y se cachean como texto.
- La presentación del proyector se guarda dentro de `scenes.presentacion_json` (una columna nueva migrada de forma idempotente) para no fragmentar el contrato de escenas.
- Los mapas subidos van a `api/data/escenarios/` (fuera de Git) y se sirven por `/escenas-assets/`; la rejilla nunca se hornea en la imagen.
- La rejilla se calcula en centímetros físicos: `cm × (ancho_px_pantalla / ancho_cm_pantalla)`. Si no hay calibración se usan 96 dpi; el popup recalcula con el ancho de su propia pantalla.
- La ventana principal y el popup se sincronizan con `BroadcastChannel` + `localStorage`, con sondeo de la API como respaldo.
- Las capas de efectos viven en `scenes.presentacion_json.efectos`; los archivos comparten `api/data/escenarios/` y `/escenas-assets/`. Se dibujan por encima de la rejilla y por debajo de los tokens salvo que `encima_tokens` esté activo.
- Con `anclado_mapa` la capa se posiciona en porcentaje del recuadro del mapa y se pinta dentro de su capa transformada: al arrastrar, la posición del puntero se invierte (rotación y zoom) para medir en el espacio local de la imagen.
- El arrastre de tokens del proyector usa la misma inversión de transformación, así que la celda de destino es exacta aunque el mapa esté girado o ampliado; solo la vista previa edita, el popup pinta.

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
- [x] (M10) Abrir Biblioteca, filtrar fichas, activar un sistema, leer el PDF de familias, tirar Mythic y ver el contexto del asistente actualizado.
- [x] (M11) Subir un mapa, rotarlo, hacer zoom, ajustar la rejilla en centímetros y proyectarlo en un popup a pantalla completa sin perder la ventana de control.
- [x] (M12) Añadir luz cálida, niebla y portal desde los presets, arrastrar una capa en la vista previa, subir una textura PNG/WebP/MP4 y verla también en el popup; arrastrar un token a otra celda y persistir su posición.
- [x] (M12) Arrastrar un token sobre el mapa del proyector y en el tablero del catálogo de escenas, cambiar la luz ambiental desde la sala de proyección y anclar una capa al recuadro del mapa para que viaje con el zoom y el paneo.
- [x] Todo el estado en `GET /api/assistant/context`, coherente y listo para la IA.

## Pendientes / ideas futuras (no bloquean el MVP)

1. **Drag & drop de módulos** entre slots (los tokens ya se arrastran sobre la rejilla; el editor de módulos sigue usando botones).
2. **Subida de archivos** de sonido/tokens desde la UI (hoy se copian a `api/data/` y se indexan).
3. **Visión/cámara** como módulo futuro (la arquitectura ya lo permite; no está en el MVP).
4. **MiniBase real:** validar `GET /api/minis`, búsqueda semántica y `table_state` contra una instancia con `MINIBASE_URL`/`MINIBASE_TOKEN`.
5. **Autenticación/multiusuario** si el proyecto sale de la mesa local.
6. **WebSocket/SSE** en lugar de polling para el bus de eventos.
7. **Tests E2E** automatizados en CI (hoy hay CDP manual + pytest + build).
8. **Biblioteca:** revisar una a una las campañas/enlaces heredados, añadir logos con licencia y medir el contexto con un modelo real (hoy se recorta a ~14k caracteres).
9. **Proyector:** guardar la calibración física por pantalla en el backend, gestos táctiles de zoom/rotación en la vista previa y offsets finos de rejilla para mapas que no empiezan en la esquina.

## Cómo retomar

1. Leer este ROADMAP, `MODULES.md`, `dev_dairy.md` y `git log --oneline`.
2. Arrancar con `.\iniciar.ps1` (o los dos comandos de `README.md`).
3. Verificar `GET /health` y `/api/assistant/context`.
4. Elegir un pendiente, implementarlo como módulo/extensión y documentar aquí antes de tocar código.
5. `pytest -q`, `npm run build`, actualizar los tres docs y commit `M<n>: ...`.
