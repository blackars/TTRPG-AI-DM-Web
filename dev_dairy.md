# Diario de desarrollo — TTRPG-Assistant

Bitácora de construcción y memoria operativa. Se actualiza al cerrar cada fase.
Fecha de la sesión principal: **2026-10-22**.

---

## Sesión 1 — MVP completo M0–M9

### Contexto de arranque

- Proyecto nuevo, hoy ubicado en `C:\Users\OSCAR\Desktop\TTRPG-AI-DM`.
- Referencias de solo lectura: `parte vieja` (reglas JEV, estilo DM, router de IA) y `MiniBase-Web` (solo contrato, sin arrancar).
- Puertos reservados: API **8100**, web **3010**. No se tocaron 8000/3000/8010.
- Todo el código, docs y mensajes en español.

### M0 — Esqueleto y módulos

- Repo y `git init`; `.gitignore` para `.venv`, `node_modules`, `.next`, `data/` y `.env`.
- `api/main.py` con FastAPI, CORS local, estáticos `/sounds` y `/tokens`, lifespan que crea DB y siembra.
- Modelos base: `screens`, `module_instances`, `events_log`, `app_kv`.
- Registro gemelo `web/src/modules/registry.tsx` ↔ `api/registry.py`.
- Shell con navegación, salud de API, bus de eventos por polling, atajos A/S/E y overlays.
- Editor de pantallas: crear pantalla, añadir/quitar módulos, colapsar; layout persistido.
- **Decisión:** una pantalla es datos, no código; los overlays viven en todas las pantallas.

### M1 — Backend sólido y seeds

- SQLModel + `create_all`, DB en `api/data/assistant.db`.
- Seeds idempotentes por `seed_version`: 3 personajes, 2 criaturas, 18 items, 3 escenas, 4 núcleos de reglas, 3 NPCs, 7 sonidos, 7 pantallas y mensajes de bienvenida.
- `GET /api/assistant/context` agrega todo y calcula `badges_de_modulos`.
- Health, CORS para 3010 y tests de contrato.
- **Decisión:** `notas_mesa` vive en `app_kv` para no crear una tabla por cada ajuste simple.

### M2 — Dados

- Portado el motor JEV a `api/rules/dice.py`: `NdX±M`, ventaja/desventaja, d4–d20, d100 y dF.
- `POST /api/modules/dado/tirar` y alias `/action`; log en `dice_logs` y evento al bus.
- Frontend con selector de caras, cantidad, modificador, expresión, historial y repetición.
- Animación 2D SVG y 3D con `three` puro. **La animación no decide nada:** la cara se ajusta al total del backend.
- Prueba CDP: cada clic en «Tirar d20» incrementa el total persistido y el historial.

### M3 — Inventario

- Secciones CRUD por personaje/criatura, items con emoji, cantidad, valor, nota y búsqueda.
- Detalle editable al hacer clic; mover item entre secciones.
- `data/tokens/placeholder.svg` generado al arrancar para el modo token digital.
- **Bug encontrado:** el primer personaje por defecto era una criatura sin secciones y el panel abría vacío. Corregido priorizando `kind === "personaje"`.

### M4 — Reglas mezclables

- Núcleos `d20`, `ventaja`, `mythic`, `spawn` con metadata, opciones y ejemplo.
- Panel «MIX ACTIVO» con texto explicativo; el mix se guarda en `rulesets` y solo uno está activo.
- Checks d20, fate check Mythic, significado de evento y spawn `dX+Y`.
- Si una regla no está activa, el endpoint devuelve 409 y la UI lo explica.

### M5 — Asistente IA

- Router portado de `dm/llm.py`: `glm → local → openai → mock`, circuit breaker y presupuesto horario.
- `POST /api/assistant/turn` arma prompt con contexto completo, historial y lista blanca de acciones.
- Mock contextual: cita escena, inventario, última tirada y reglas reales; propone acciones ejecutables.
- Frontend: chat en overlay, visor del contexto, badge de proveedor/latencia y tarjetas de acción con confirmación.
- **Bug 1:** `GET /api/modules/asistente/state` devolvía 500 porque `acciones_permitidas` incluía tipos Python (`str`, `int`) no serializables. Se serializan como listas de nombres de campos.
- **Bug 2:** el refresco por eventos desmontaba el overlay y borraba las acciones propuestas. La página `pantalla/[id]` mostraba el skeleton con cada `loading`; ahora solo espera si no hay datos. También se conserva el overlay si falla un refresco.
- Resultado CDP: abrir asistente, enviar sugerencia, recibir respuesta, ejecutar tirada propuesta, editor y sonido abren; **0 errores de consola**.

### M6 — Escenarios

- Tablero 12×9, tokens por clic, selección, movimiento y borrado; luz con color/opacidad.
- Activación de escena cambia fondo, tokens, luz y playlist en todas las vistas.
- Ruta `/proyector` para segundo monitor; lee el mismo estado y se refresca por polling.
- Alias `/api/modules/escenario/state|action` para cumplir el contrato del módulo «Escenario activo».
- **Decisión:** una sola escena activa a la vez, garantizada por el endpoint `activar`.

### M7 — Persistencia completa

- CRUD de personajes y criaturas con HP, stats libres, notas y envío al tablero.
- NPCs con voz, tono, frases y redacción IA (`/api/assistant/npc_text`).
- Snapshots de partida: personajes, inventarios, escenas, reglas, tiradas, NPCs, sonidos, mensajes IA, notas y layouts.
- Export/import JSON con formato `ttrpg-assistant/partida`; importar crea una copia con nombre nuevo.
- Test de guardar → modificar → cargar → verificar restauración.

### M8 — Sonido

- Biblioteca por grupos; 7 ambientes sintéticos generados con WebAudio (sin archivos obligatorios).
- Playlist por escena, volumen/loop y crossfade al activar otra escena.
- Indexación automática de mp3/ogg/wav dejados en `api/data/sounds/`.
- Acción de la IA `play_sound` encola la reproducción en el frontend, previa confirmación.

### M9 — MiniBase

- Adaptador `api/modules/minibase.py` con `MINIBASE_URL` y `MINIBASE_TOKEN`.
- Acciones: `probar`, `buscar`, `importar` (token o item con `external_key`) y `publicar_escena`.
- Modo degradado: sin URL o sin respuesta, devuelve error controlado y la mesa sigue operando.
- **No se arrancó ni modificó MiniBase.** La validación real queda pendiente de credenciales.

### Cierre técnico

- `pytest -q`: **14 passed**.
- `npm run build`: compila Next.js 14.2.35 sin errores de tipos.
- Prueba CDP completa: mesa, asistente, acción propuesta/ejecutada, editor, sonido y tirada persistida. Sin errores de consola.
- DB de demo reiniciada para dejar solo seeds (sin tiradas ni conversaciones de prueba).

### Cómo retomar

1. `.\iniciar.ps1` o los comandos del README.
2. Leer `ROADMAP.md` (pendientes) y `MODULES.md` (contratos).
3. Antes de cambiar un módulo, revisar su entrada en el registro y su test.
4. Al cerrar: pytest, build, actualizar los tres documentos y commit `M<n>: ...`.

### Frases para la próxima sesión

- «Los dados mandan en Python; el 3D solo actúa.»
- «Si un módulo nuevo no está en el registry y en el contexto, no existe.»
- «MiniBase es un invitado de solo lectura; nunca bloquea la mesa.»
