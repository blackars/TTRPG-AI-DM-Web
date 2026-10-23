# Documentos de la biblioteca

Esta carpeta guarda documentos de referencia que se versionan con el proyecto.

- `principales-sistemas-de-rol-de-mesa.pdf`: panorama de las familias d20, d100/BRP, PbtA, Fate y 3D6/GURPS. Alimenta la ficha `fichas/universal/panorama-sistemas-rol.md`.
- Los documentos que sube el usuario desde el módulo **Biblioteca** no se guardan aquí: van a `api/data/biblioteca/` para que no entren en Git.
- El módulo acepta `.md`, `.txt` y `.pdf`. Para PDF extrae el texto con `pypdf` y lo cachea en `api/data/biblioteca_cache/`.

No se incluyen PDFs comerciales ni enlaces piratas. Los manuales y aventuras deben provenir de fuentes legales o ser material propio.
