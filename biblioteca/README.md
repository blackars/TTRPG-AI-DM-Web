# Biblioteca TTRPG · DM IA

Esta carpeta es la versión **navegable y editable** de `BIBLIOTECA_TTRPG.md`. Cada ficha vive en su propio archivo Markdown, con metadatos, contenido base y una zona reservada para tus personalizaciones.

- **45 fichas, colecciones e índices** de ciencia ficción, horror y fantasía, más **3 entradas universales** (panorama de sistemas, Mythic GME y sistemas genéricos).
- **1 PDF de referencia** en `documentos/` con las familias mecánicas d20, d100/BRP, PbtA, Fate y 3D6/GURPS.
- **1 taxonomía editorial** en `taxonomia.json` que añade categoría, tipo de UI, familia, motor, dados, recursos y alias.
- **1 interfaz HTML clásica** para explorar, buscar y leer todo sin servidor.
- **1 integración nativa** en la app: módulo `biblioteca`, sistema activo y documentos propios.
- **1 plantilla** para añadir universos nuevos.

## Abrir la interfaz

Haz doble clic en `index.html`.

No necesita servidor ni conexión: carga `datos.js`, `assets/marked.min.js`, `assets/style.css` y `assets/app.js` desde la misma carpeta. Si mueves `index.html` fuera de `biblioteca/`, la interfaz deja de encontrar los datos.

La interfaz permite:

- buscar por título, tag, regla, campaña o cualquier texto de la ficha;
- filtrar por género (ciencia ficción, horror, fantasía) y por tipo (ficha, colección, índice);
- ordenar por orden de biblioteca, título o género;
- abrir el `.md` original de cada ficha;
- copiar la ruta de la ficha para pasársela al agente;
- leer las tablas, bloques de código y enlaces del Markdown.

La app integrada añade búsqueda por texto completo, filtros por categoría, género, tipo y familia mecánica, activación de un sistema para el DM, generadores Mythic y subida de documentos propios. La interfaz clásica sigue siendo útil para abrir la biblioteca sin arrancar la API.

## Estructura

```text
biblioteca/
├─ index.html                 Interfaz de exploración clásica
├─ datos.js                   Datos embebidos para la interfaz (generado)
├─ fichas.json                Índice legible por máquina (generado)
├─ INDICE.md                  Índice de respaldo en Markdown (generado)
├─ taxonomia.json             Clasificación editorial (categoría, familia, motor…)
├─ README.md                  Este archivo
├─ plantilla-ficha.md         Plantilla para nuevas fichas
├─ assets/
│  ├─ app.js                  Lógica de la interfaz
│  ├─ style.css               Estilos
│  ├─ marked.min.js           Renderizador Markdown (MIT)
│  └─ logos/                  Logos locales opcionales
├─ documentos/
│  └─ principales-sistemas-de-rol-de-mesa.pdf
├─ fichas/
│  ├─ ciencia-ficcion/        16 fichas y colecciones
│  ├─ horror/                 13 fichas y colecciones
│  ├─ fantasia/               13 fichas y colecciones
│  └─ universal/              3 entradas nuevas (panorama, Mythic, genéricos)
├─ indices/
│  ├─ campanas-sci-fi.md
│  ├─ campanas-horror.md
│  └─ campanas-fantasia.md
└─ tools/
   └─ build_index.py          Regenera datos.js, fichas.json e INDICE.md
```

## Cómo lo usa el DM IA

1. Lee `fichas.json` para ver el catálogo: `id`, `titulo`, `genero`, `tipo`, `tags`, `resumen`, `ruta`.
2. Filtra por género, tipo o tag según lo que pida el usuario.
3. Abre la ruta de la ficha elegida, por ejemplo `fichas/horror/call-of-cthulhu.md`.
4. Usa el cuerpo del archivo como **reglas base** del universo.
5. Lee al final la sección **Personalización del usuario**. Esa sección tiene prioridad sobre la ficha base: contiene las reglas de la casa, variaciones, historias, locaciones, personajes y comandos del usuario.
6. Si la petición es una campaña, abre también el índice `indices/campanas-*.md` correspondiente.
7. En la app integrada, el módulo `biblioteca` añade el sistema activo, la personalización y los documentos vinculados a `GET /api/assistant/context`.

Regla de precedencia sugerida:

```text
Personalización del usuario > ficha individual > documentos de campaña vinculados > índice de campañas > BIBLIOTECA_TTRPG.md
```

Los documentos propios (`.md`, `.txt`, `.pdf`) se suben desde el módulo y se guardan en `api/data/biblioteca/`. El PDF de familias mecánicas se conserva en `documentos/` y se extrae con `pypdf` para que el DM lo lea como texto.

## Front matter

Cada ficha empieza con un bloque YAML sencillo:

```yaml
---
id: "stargrave"
titulo: "Stargrave"
genero: "ciencia-ficcion"       # ciencia-ficcion | horror | fantasia
genero_label: "Ciencia ficción"
tipo: "ficha"                   # ficha | coleccion | indice
tipo_label: "Ficha"
icono: "🛰️"
color: "#f59e0b"
tags: ["ciencia-ficcion", "minis", "cartas"]
resumen: "Una línea para el catálogo."
fuente: "BIBLIOTECA_TTRPG.md §4.1"
seccion: "4.1"
orden: 401
actualizado: "2026-10-22"
logo: "assets/logos/stargrave.png"   # opcional
---
```

- `orden` controla la posición en la biblioteca. Usa el patrón `4xx` para sci-fi, `5xx` para horror y `6xx` para fantasía.
- `logo` es opcional. Si no existe, la interfaz usa el emoji de `icono`.
- `tags` debe ser una lista JSON/YAML de cadenas sin espacios.

La clasificación editorial vive aparte, en `taxonomia.json`. Para cada `id` puede añadir:

```json
{
  "categoria": "rol",
  "tipo": "sistema",
  "familia": "d20",
  "motor": "d20",
  "dados": ["d20"],
  "recursos": ["reglas", "campaña"],
  "alias": ["D&D 5e", "5e"],
  "titulo_ui": "D&D 5e / 2024"
}
```

`build_index.py` mezcla esa capa sin reescribir los Markdown. Los valores originales de `tipo` se conservan para no romper la interfaz clásica; `tipo_ui` es el tipo normalizado que usa el módulo React.

## Personalizar un universo

Abre el `.md` y baja hasta **Personalización del usuario**. No borres la ficha base: añade debajo. La plantilla incluye:

- **Seguridad y líneas**: herramientas de seguridad, líneas y velos, temas a evitar.
- **Reglas de la casa**: modificaciones mecánicas, tiradas caseras, límites.
- **Variaciones y tono**: época, continuidad, censura, crossovers.
- **Historias y arcos**: campañas, semillas, finales alternativos.
- **Locaciones**: ciudades, planetas, edificios, mapas.
- **Personajes y facciones**: NPCs, villanos, relaciones, secretos.
- **Comandos para el agente**: configuración YAML que el DM IA debe cargar.
- **Registro de cambios**: fecha, cambio y autor.

Ejemplo de comando para el agente:

```yaml
al_seleccionar:
  cargar: ["ficha", "personalizacion"]
  tono: "horror cósmico con humor negro"
  reglas_opcionales:
    - "la cordura baja al presenciar el Mythos"
  prohibiciones:
    - "no matar a los PJ sin una señal previa"
  fuentes:
    - "fichas/horror/call-of-cthulhu.md"
    - "indices/campanas-horror.md"
```

## Añadir una ficha nueva

1. Copia `plantilla-ficha.md` en `fichas/<genero>/<slug>.md`.
2. Cambia `id`, `titulo`, `genero`, `tipo`, `icono`, `color`, `tags`, `resumen` y `orden`.
3. Rellena el cuerpo con el sistema, el tono, el material y los enlaces.
4. Añade tu sección de personalización.
5. Regenera la interfaz:

```powershell
cd "C:\Users\OSCAR\Desktop\G I T H U B R E P O S\TTRPG-Assistant"
python biblioteca\tools\build_index.py
```

6. Recarga `index.html`.

## Iconos y logos

La biblioteca usa **iconos propios basados en emoji** y un color por universo. No se incluyen logos oficiales para evitar problemas de derechos.

Si quieres usar un logo local:

1. Guarda la imagen en `assets/logos/`, por ejemplo `assets/logos/stargrave.png`.
2. Añade `logo: "assets/logos/stargrave.png"` al front matter de la ficha.
3. Ejecuta `python biblioteca\tools\build_index.py` y recarga la interfaz.

## Regenerar datos

Cada vez que edites una ficha o añadas una nueva:

```powershell
cd "C:\Users\OSCAR\Desktop\G I T H U B R E P O S\TTRPG-Assistant"
python biblioteca\tools\build_index.py
```

El script:

- lee todos los `.md` de `fichas/` e `indices/`;
- valida que tengan `id` y front matter;
- regenera `datos.js` (para la interfaz), `fichas.json` (para el agente) e `INDICE.md` (índice de respaldo);
- no modifica las fichas.

Requiere Python 3.10 o superior. No usa dependencias externas.

## Relación con `BIBLIOTECA_TTRPG.md`

`BIBLIOTECA_TTRPG.md` sigue siendo la **obra de referencia** y el snapshot completo de la investigación. Las fichas de esta carpeta son las **copias de trabajo** que se personalizan a largo plazo.

La extracción inicial se hizo desde el maestro. A partir de ahora, edita las fichas individuales. Si vuelves a extraer desde el maestro, haz una copia de seguridad antes: la extracción puede sobrescribir personalizaciones.

## Nota legal

La biblioteca enlaza reglas gratuitas oficiales, SRDs, quickstarts y tiendas legales. No incluye ni enlaza PDFs piratas. Los textos originales de Lovecraft están en dominio público; las traducciones y ediciones anotadas pueden tener copyright. Los logos y marcas pertenecen a sus respectivos titulares.
