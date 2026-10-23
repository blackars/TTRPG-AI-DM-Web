# Diario de desarrollo — TTRPG-Assistant

Bitácora de construcción y memoria operativa. Se actualiza al cerrar cada fase.
Sesión 1 (MVP M0–M9): **2026-10-22**. Sesión 2 (Biblioteca M10): **2026-10-23**. Sesión 3 (Proyector M11): **2026-10-23**.

---

## Sesión 1 — MVP completo M0–M9

### Contexto de arranque

- Proyecto nuevo, hoy ubicado en `C:\Users\OSCAR\Desktop\G I T H U B R E P O S\TTRPG-Assistant`.
- Referencias de solo lectura: `C:\Users\OSCAR\Desktop\TTRPG-AI-DM\parte vieja` (reglas JEV, estilo DM, router de IA) y `MiniBase-Web` (solo contrato, sin arrancar).
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

---

## Sesión 2 — Biblioteca TTRPG (M10)

**Fecha:** 2026-10-23. **Objetivo:** integrar la biblioteca de fichas y documentos en la app sin romper la interfaz clásica ni el MVP M0–M9.

### Qué se hizo

- Copiada la biblioteca de referencia a `biblioteca/`, con fichas, índices, assets, herramientas, PDF y la interfaz estática.
- Añadidas tres entradas universales: `panorama-sistemas-rol` (guía del PDF), `mythic-gme` (oráculo) y `sistemas-genericos` (GURPS, Fate, Savage Worlds, Cypher y BRP).
- Creada `biblioteca/taxonomia.json` para clasificar las 48 entradas por categoría, tipo de UI, familia, motor, dados, recursos y alias. Los nombres confusos se corrigieron con `titulo_ui` (`Cyberpunk OSR y derivados`, `Wargames de ciencia ficción`, `Arkham Horror (juegos de mesa)`, `Investigación alternativa (GUMSHOE y PbtA)`, etc.).
- `build_index.py` ahora mezcla la taxonomía y regenera `datos.js`, `fichas.json` e `INDICE.md`; el `tipo` original se conserva para la interfaz clásica.
- Copiado el PDF a `biblioteca/documentos/principales-sistemas-de-rol-de-mesa.pdf`. La API lo extrae con `pypdf` y lo cachea como texto.
- Nuevo `api/library.py`: parser Markdown, catálogo, detalle, personalización, enlaces, documentos, vínculos, selección activa y contexto IA.
- Nuevo `api/modules/biblioteca.py`: contrato `state/action`, acciones `seleccionar`, `limpiar`, `vincular_documento`, `desvincular_documento` y `mythic_tirar`; endpoints REST de fichas, documentos, subida, descarga y borrado.
- Mythic ampliado en `api/rules/builtin/mythic.py`: foco de evento, descriptor, ajuste de escena y evento completo. Las tiradas se resuelven en backend y se guardan en `dice_logs`.
- Registro gemelo actualizado: `biblioteca` en `web/src/modules/registry.tsx` y `api/registry.py`; nueva pantalla `biblioteca` y migración idempotente `ensure_library_screen()` para bases ya sembradas.
- Nuevo `web/src/modules/BibliotecaModule.tsx` con catálogo, búsqueda y filtros, detalle Markdown, activación del sistema, generadores y pestaña de material propio.
- Añadido `web/src/components/MarkdownView.tsx` con `react-markdown` + `remark-gfm` y estilos propios; instalado también un icono SVG para evitar el 404 de favicon.
- `api/context.py` incorpora `biblioteca` y su badge; el prompt del asistente recibe `sistema_activo`, `ficha_base`, `personalizacion` y `documentos_vinculados`.
- Documentación actualizada: `README.md`, `MODULES.md`, `ROADMAP.md`, `biblioteca/README.md` y `biblioteca/assets/logos/README.md`.

### Decisiones y detalles

- La fuente editable sigue siendo `biblioteca/`; la API lee los archivos en caliente. Las subidas del usuario van a `api/data/biblioteca/` y no se versionan.
- La personalización vacía se detecta y no se envía al prompt: evita gastar contexto en el texto de plantilla.
- La selección activa y los vínculos se guardan en `app_kv`; no se creó una tabla nueva para el MVP.
- `biblioteca` no ejecuta acciones de la IA por su cuenta: el usuario activa, vincula y tira desde la UI.
- Los logos oficiales no se incluyen por derechos; el fallback es emoji + color y el soporte de `logo:` queda documentado.

### Verificación

- `pytest -q`: **17 passed** (nuevos tests de catálogo, detalle, contexto, documentos, vínculos, Mythic, PDF e interfaz clásica).
- `npm run build`: Next.js 14.2.35 compila sin errores de tipos.
- Prueba CDP real: abrir Biblioteca, leer una ficha, activar D&D 5e, quitarla, cambiar a Generadores, tirar Mythic, abrir Mi material y comprobar el PDF. Sin errores de consola; el único 404 era `favicon.ico`, corregido con `web/src/app/icon.svg`.
- La DB de demo se deja sin sistema activo ni tiradas Mythic de prueba.

### Pendientes conscientes

- Revisar una a una las campañas y recursos enlazados (la biblioteca original no verificó todos).
- Añadir logos con licencia clara; hoy todas las fichas usan emoji.
- Medir el contexto con un modelo real y, si hace falta, resumir fichas largas o buscar por secciones.

---

## Sesión 3 — Proyector de mapas (M11)

**Fecha:** 2026-10-23. **Objetivo:** llevar la funcionalidad de grid/proyección de MiniBase-Web al sistema de escenas existente, sin crear una pantalla aislada ni tocar MiniBase.

### Qué se hizo

- `Scene` gana `presentacion_json` (columna de texto) y `db.init_db` migra bases antiguas con `ALTER TABLE ... ADD COLUMN` idempotente; no se borra ni se recrea nada.
- `serializers.py` centraliza `PRESENTACION_BASE`, `normalizar_presentacion()` y `presentacion_dict()`. La API normaliza zoom, rotación, paneo, rejilla, color, opacidad y el nombre del mapa, y devuelve solo la URL pública.
- `modules/scenes.py` añade la acción `set_presentacion` y los endpoints `POST/DELETE /api/escenarios/{id}/mapa`. Los archivos van a `api/data/escenarios/` y se sirven por el nuevo mount `/escenas-assets/`.
- `main.py` monta los estáticos y `context.py` publica `grid_visible`, `grid_cm` y `mapa_url` en `table_state`.
- Nuevo `web/src/components/ProjectorStage.tsx`: capa de mapa transformable (zoom, rotación, paneo), luz ambiental, tokens que acompañan al mapa pero se mantienen derechos y rejilla física fija por encima.
- Nuevo `web/src/lib/proyector.ts`: bus de sincronización con `BroadcastChannel` + `localStorage` y lectura de la calibración física.
- `ProyectorModule.tsx` se convierte en la sala de control: selector de escena en directo, subida/borrado de mapa (botón o drag & drop), rotación con sliders y giros de 90°, zoom, paneo arrastrando, toggle/color/opacidad de rejilla, dial de tamaño de celda en centímetros, calibración del ancho físico, `Proyectar` y `Pantalla 2`.
- `web/src/app/proyector/page.tsx` pasa a ser el popup limpio: solo tablero, controles flotantes que se ocultan, botón de pantalla completa, cierre, indicador de reconexión y sincronización en vivo.
- `EscenariosModule` muestra la miniatura del mapa, botón **Proyectar** y enlace a la sala; `EscenarioModule` enlaza a la sala de proyección.
- Tests: nuevo `test_escena_presentacion_y_mapa` que cubre normalización, subida, servido estático, borrado y restauración; `test_borrar_escena_limpia_mapa` comprueba que borrar una escena también elimina su archivo.

### Decisiones y detalles

- La rejilla no se hornea: se dibuja encima y queda fija a la pantalla. La imagen se mueve debajo hasta que sus cuadros coincidan.
- La celda se calcula en centímetros físicos: `cm × (ancho_px_pantalla / ancho_cm_pantalla)`. Sin calibrar se usan 96 dpi; el popup recalcula con el ancho de su propia pantalla, como MiniBase-Web.
- El paneo se guarda como porcentaje del lienzo, para que la vista previa y el popup mantengan el encuadre aunque cambien de tamaño.
- La ventana principal controla; el popup solo muestra. `Proyectar` abre el popup sincrónicamente para que el navegador no lo bloquee y `Pantalla 2` intenta colocarlo con la API Multi-Screen.
- La configuración es por escena (no global) y persiste en `presentacion_json`; la calibración física vive en `localStorage` porque depende de la pantalla del usuario.
- Los mapas subidos van a `api/data/escenarios/` y están fuera de Git; al borrar escena o mapa se elimina el archivo.

### Verificación

- `pytest -q`: **19 passed**.
- `npm run build`: Next.js 14.2.35 compila sin errores de tipos.
- Prueba CDP real con Chrome headless: mapa de prueba servido desde `/escenas-assets/`, transformación `matrix(1.35, ...)` con zoom/paneo, rejilla con 8–15 líneas según el tamaño de celda, popup abierto desde la sala, rejilla apagada/encendida en vivo, rotación 90° y zoom 1.75 sincronizados en el popup y persistidos en la API. Sin errores de consola.
- Prueba específica con mapa 4:3 sobre lienzo 16:9: la caja del contenido y los tokens mantienen la proporción y las posiciones esperadas (`token_rel` 0.958/0.944 frente a 11.5/12 y 8.5/9); los campos de calibración y celda aceptan `121` y `0.5` sin saltos ni recortes.
- La DB de demo se restaura sin mapa, sin tokens de prueba y con la presentación por defecto al terminar.

### Pendientes conscientes

- Guardar la calibración física por pantalla en el backend en vez de `localStorage`.
- Gestos táctiles de zoom/rotación y offsets finos de rejilla para mapas que no empiezan en la esquina.
- Valorar drag & drop de tokens directamente sobre la rejilla del mapa en una fase futura.

---

## Sesión 4 — Luces y efectos (M12)

**Fecha:** 2026-10-23. **Objetivo:** añadir capas de ambiente al proyector y cerrar el arrastre real de tokens sin romper la escena activa, el mapa ni la rejilla.

### Qué se hizo

- `serializers.py` añade `normalizar_efecto()` y `efecto_dict()`: valida tipo, patrón, colores, mezcla, animación, posición, tamaño, opacidad y archivo; al guardar de nuevo una presentación recupera el nombre interno desde la URL pública.
- `scenes.py` añade `POST /api/escenarios/{id}/efectos` y `DELETE /api/escenarios/{id}/efectos/{efecto_id}`. Los archivos van a `api/data/escenarios/`, se sirven por `/escenas-assets/` y se borran al quitar la capa o la escena.
- Límites: 24 capas por escena y 80 MB por textura. El mapa conserva su límite de 15 MB.
- `context.py` publica un resumen de efectos en `table_state`; la API sigue entregando el detalle completo a la web.
- `ProjectorEffects.tsx` pinta luces, nieblas, portales y texturas con `mix-blend-mode`, animaciones CSS y vídeo MP4/WEBM. Las capas usan z-index 15 (25 con `encima_tokens`), por encima de la rejilla y por debajo o por encima de los tokens según la capa.
- `ProjectorEffectsPanel.tsx` incorpora los presets **Luz cálida**, **Niebla**, **Portal**, **Aurora** y **Bruma densa**, subida de texturas y controles de edición.
- `ProjectorStage.tsx` permite arrastrar cada capa en la vista previa con pointer events; el arrastre detiene la propagación para no panear el mapa.
- `SceneBoard.tsx` incorpora arrastre real de tokens a otra celda, con captura de puntero, umbral de 5 px y persistencia vía `mover_token`; `EscenarioModule` actualiza la selección y el tablero.
- `PersonajesModule` usa una clave de carga por personaje (`enviar-${id}`) para que el feedback de «enviando» no se mezcle entre fichas.
- Documentación actualizada: `README.md`, `MODULES.md`, `ROADMAP.md` y este diario.

### Decisiones y detalles

- Las capas se guardan dentro de `Scene.presentacion_json`; no se añadió una tabla nueva. Las posiciones son porcentajes del lienzo proyectado para que la vista previa y el popup mantengan la composición.
- La URL de las texturas se guarda relativa; el frontend antepone `API_URL`. El backend reconstruye el archivo interno desde la URL al recibir una presentación pública.
- Las capas quedan debajo de los tokens por defecto; `encima_tokens` permite que una niebla o un portal cubran las fichas.
- El debounce de guardado se cancela antes de subir/quitar mapas o efectos para que un guardado tardío no recree capas borradas.

### Verificación

- `pytest -q`: **21 passed** (nuevos tests de efectos, URLs públicas, borrado y limpieza de assets).
- `npx tsc --noEmit`: sin errores.
- `npm run build`: Next.js 14.2.35 compila correctamente.
- Prueba CDP real: añadir Luz cálida, arrastrarla sin mover el mapa, activar «encima de tokens», subir una textura PNG, comprobar su URL y su carga en el popup `/proyector`, borrar las capas y dejar la escena limpia. **0 errores de consola.**
- Prueba CDP de tokens: crear un token temporal, arrastrarlo de (1,1) a (5,4), verificar la persistencia en la API y borrarlo; la escena queda con 0 tokens.
- Incidencia corregida: durante una primera prueba, un selector ambiguo tomó el input del mapa y subió un PNG de 1×1. Se recuperó el archivo original desde la caché HTTP de Chrome (coincidencia SHA-256 con la copia de Descargas), se restauró en su URL original `escena-4-0be7b8893d.webp` y el script de prueba ahora selecciona el input de textura por `accept` y hace snapshot/restauración del mapa. La escena, el zoom, la rotación, el paneo y la rejilla del usuario quedaron intactos.

### Cierre de M12 (mismo día)

Los cuatro puntos que quedaban inconclusos se terminaron en la misma sesión:

- **Arrastre de tokens en el mapa del proyector.** `ProjectorStage` acepta `tokensEditables` y `onMoverToken`; la vista previa de la sala convierte el puntero a celda invirtiendo la transformación del mapa (pan, rotación y zoom) y persiste con `mover_token`. El popup no recibe la prop y sigue siendo de solo lectura.
- **Tablero editable en el catálogo de escenas.** El modal de edición de `EscenariosModule` deja de usar `readonly`: selección de token, arrastre, clic en casilla para mover o colocar (con su propio modal de nombre/emoji) y botón **Quitar token**.
- **Controles de luz ambiente en la sala de proyección.** `ProyectorModule` añade color e intensidad con guardado automático (`set_light` con debounce de 420 ms); la luz local se inyecta en el estado publicado para que el popup la reciba al instante.
- **Anclar overlays al recuadro del mapa.** `normalizar_efecto` persiste `anclado_mapa`; las capas ancladas se pintan en una capa transformada idéntica a la del mapa (z 15, o 25 con `encima_tokens`) y su arrastre se mide en el espacio local de la imagen.

### Pendientes conscientes

- Guardar la calibración física por pantalla en el backend.
- Gestos táctiles de zoom/rotación para la vista previa.
- Validar el comportamiento de texturas animadas grandes en equipos de gama baja y ofrecer un modo de reducción de calidad.

---

## Publicación

- Repo oficial: `https://github.com/blackars/TTRPG-AI-DM-Web` (rama `main`).
- El proyecto vive en `C:\Users\OSCAR\Desktop\G I T H U B R E P O S\TTRPG-Assistant`.
- `C:\Users\OSCAR\Desktop\TTRPG-AI-DM` conserva únicamente el material de referencia antiguo.
