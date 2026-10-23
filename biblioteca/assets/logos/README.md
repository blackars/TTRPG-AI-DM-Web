# Logos locales

Guarda aquí los logos que quieras usar en la biblioteca, por ejemplo:

```text
assets/logos/stargrave.png
assets/logos/call-of-cthulhu.svg
```

Después añade la ruta al front matter de la ficha:

```yaml
logo: "assets/logos/stargrave.png"
```

Y regenera los datos desde la raíz del proyecto:

```powershell
python biblioteca\tools\build_index.py
```

La interfaz clásica usará el logo en la tarjeta y en la cabecera de la ficha. El módulo React lo sirve desde `/biblioteca-assets/` y, si el archivo no existe, cae al emoji de la ficha.

No se incluyen logos oficiales en esta biblioteca para evitar problemas de derechos. Los logos y marcas pertenecen a sus titulares. Por eso las 48 fichas actuales usan emoji + color: es el fallback deliberado hasta que se añadan imágenes con licencia clara.
