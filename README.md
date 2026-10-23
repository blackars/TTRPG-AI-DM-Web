# TTRPG-Assistant

Mesa de rol digital con **módulos componibles**, pantallas persistidas y un **asistente de IA** que lee todo el estado del sistema antes de responder. Todo el proyecto está escrito y documentado en español.

- **API:** FastAPI + SQLModel + SQLite → `http://127.0.0.1:8100`
- **Web:** Next.js 14 + TypeScript + Tailwind → `http://127.0.0.1:3010`
- **Dados:** motor autoritativo en Python + animación 2D (SVG/CSS) y 3D (three.js)
- **IA:** router `glm → local → openai → mock`; funciona sin claves gracias al mock contextual
- **MiniBase:** integración opcional de fase M9, **solo lectura** y no bloqueante

## Arranque rápido (Windows)

Requisitos: Python 3.10, Node.js 22 y PowerShell.

```powershell
cd "C:\Users\OSCAR\Desktop\TTRPG-AI-DM"

# 1) Dependencias (solo la primera vez)
python -m venv api\.venv
api\.venv\Scripts\python -m pip install -r api\requirements.txt
npm --prefix web install

# 2) Arrancar API + web en dos ventanas
.\iniciar.ps1
```

También puedes arrancar cada parte a mano:

```powershell
# API (ventana 1)
cd api
.\.venv\Scripts\python -m uvicorn main:app --host 127.0.0.1 --port 8100

# Web (ventana 2)
cd web
npm run dev
```

Abre **`http://127.0.0.1:3010/pantalla/mesa`**. La base de datos y los seeds se crean solos en `api/data/assistant.db`.

## URLs útiles

| URL | Qué hace |
| --- | --- |
| `http://127.0.0.1:3010/pantalla/mesa` | Pantalla principal del DM |
| `http://127.0.0.1:3010/pantalla/escenario` | Tablero de escena |
| `http://127.0.0.1:3010/pantalla/reglas` | Mezcla de reglas |
| `http://127.0.0.1:3010/pantalla/inventario` | Inventarios por personaje/criatura |
| `http://127.0.0.1:3010/pantalla/cronicas` | Partidas guardadas y NPCs |
| `http://127.0.0.1:3010/pantalla/escenas` | Catálogo de escenas |
| `http://127.0.0.1:3010/proyector` | Vista limpia para el segundo monitor |
| `http://127.0.0.1:8100/docs` | OpenAPI interactivo |
| `http://127.0.0.1:8100/api/assistant/context` | Contexto completo que consume la IA |
| `http://127.0.0.1:8100/health` | Salud de la API y ruta de la SQLite |

Atajos de la mesa: **A** abre el asistente, **S** el sonido y **E** el editor de pantallas. `Esc` cierra el panel activo.

## Cómo funciona el sistema de módulos

1. `web/src/modules/registry.tsx` es la **fuente de verdad del render**. Ninguna pantalla importa módulos directamente.
2. `api/registry.py` es el gemelo que valida el editor y calcula los badges del asistente.
3. Una pantalla es un registro de `screens` + `module_instances` con slots `principal`, `lateral`, `inferior` y `overlay`.
4. Cada módulo cumple el contrato:
   - `GET /api/modules/<id>/state`
   - `POST /api/modules/<id>/action`
   - contribución a `GET /api/assistant/context`
5. El **Editor de pantallas** añade, quita, colapsa y superpone módulos; el layout persiste en SQLite.
6. El **bus de eventos** (`GET /api/events?since=...`) refresca todas las pantallas y el contexto de la IA.

El detalle de cada módulo está en [`MODULES.md`](MODULES.md). El plan y el estado por fases están en [`ROADMAP.md`](ROADMAP.md). El diario de construcción está en [`dev_dairy.md`](dev_dairy.md).

## Asistente IA

- `POST /api/assistant/turn` arma el prompt con el contexto JSON real, el historial y la mezcla de reglas activa.
- Sin claves responde un **mock contextual**: cita la escena, los personajes, el inventario y la última tirada reales.
- Puede proponer acciones de la lista blanca (`tirar_dado`, `activar_escena`, `play_sound`, `anadir_item`, `cambiar_hp`, `crear_nota`, `redactar_npc`). **Nunca las ejecuta solo:** el frontend las muestra para que el usuario pulse «Ejecutar».
- Configuración opcional en `api/.env` (copia de `.env.example`):

```env
DM_PROVIDER=auto
ZAI_KEY=
OPENAI_API_KEY=
#OLLAMA_BASE_URL=http://localhost:11434/v1
```

Cadena por defecto: `glm` (si hay `ZAI_KEY`) → `local` (Ollama) → `openai` (si hay clave) → `mock`. Si un proveedor falla o no está configurado, se salta sin bloquear la mesa.

## Dados

- El resultado siempre lo decide el servidor (`api/rules/dice.py`, portado del motor JEV).
- Formatos: `NdX±M`, ventaja/desventaja, `d4`–`d20`, `d100` y `dF` (Fate).
- La animación 3D es decorativa: la cara final se fuerza al total devuelto por la API.
- Cada tirada se guarda en `dice_logs`, aparece en el historial y entra en el contexto de la IA.

## Reglas mezclables

Núcleos incluidos: **d20**, **ventaja/desventaja**, **Mythic** (caos, sí/no, eventos) y **spawn** (`dX+Y`). Se activan por tarjeta, se explica la mezcla activa y se puede guardar como *ruleset* con nombre. La mezcla activa rige el dado y el prompt del asistente.

## MiniBase (M9)

El adaptador vive en `api/modules/minibase.py` y el módulo en `web/src/modules/MiniBaseModule.tsx`.

- Solo se activa si existen `MINIBASE_URL` y `MINIBASE_TOKEN`.
- Es **read-only**: busca minis y las vincula como token o item con `external_key`; nunca escribe en MiniBase.
- Si MiniBase no responde, la app sigue funcionando con datos locales y muestra el estado desconectado.
- **No se enciende ni se modifica** el proyecto MiniBase desde este repositorio.

## Pruebas

```powershell
# Backend: contrato de módulos, dados, reglas, saves, contexto
cd api
.\.venv\Scripts\python -m pytest -q

# Frontend: compilación de producción y tipos
cd web
npm run build
```

Resultado actual: **14 tests backend en verde** y build de Next.js sin errores.

## Estructura

```text
TTRPG-Assistant/
├─ api/
│  ├─ ai/                  Router de proveedores y modelos
│  ├─ modules/             Un router por módulo + contrato común
│  ├─ rules/               Motor de dados y núcleos d20/Mythic/spawn
│  ├─ tests/               pytest del contrato HTTP
│  ├─ context.py           Contexto agregado para la IA
│  ├─ seeds.py             Datos demo idempotentes
│  └─ main.py              FastAPI, CORS, estáticos y lifespan
├─ web/
│  └─ src/
│     ├─ app/              Rutas App Router
│     ├─ components/       Shell, slots, overlays, tablero, dados 3D
│     ├─ lib/              API tipada, store, audio, acciones IA
│     └─ modules/          Los 16 módulos + registry.tsx
├─ iniciar.ps1             Arranque de API + web en Windows
├─ ROADMAP.md
├─ MODULES.md
└─ dev_dairy.md
```

## Estado del MVP

Las fases **M0–M9** están implementadas. El checklist completo de demo está marcado en `ROADMAP.md`. Quedan como mejoras posteriores (no bloqueantes): drag & drop real de tokens, subida de archivos de audio desde la UI, módulo de visión futura y publicación opcional del `table_state` en el proyector de MiniBase.
