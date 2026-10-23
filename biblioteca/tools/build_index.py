#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genera datos.js y fichas.json a partir de las fichas Markdown.

Uso:
    python tools/build_index.py

No modifica las fichas: solo lee su front matter, el cuerpo y la clasificación
editorial de `taxonomia.json`.
"""

import json
import sys
import unicodedata
from datetime import date
from pathlib import Path

LIB = Path(__file__).resolve().parents[1]
FICHAS = LIB / "fichas"
INDICES = LIB / "indices"
TAXONOMIA = LIB / "taxonomia.json"

TIPOS_DEFECTO = {
    "ficha": ("sistema", "Sistema"),
    "sistema": ("sistema", "Sistema"),
    "coleccion": ("coleccion", "Colección"),
    "indice": ("indice", "Índice"),
    "documento": ("documento", "Documento"),
}


def normalizar(value: str) -> str:
    value = unicodedata.normalize("NFD", str(value or ""))
    return "".join(c for c in value if unicodedata.category(c) != "Mn").lower()


def parse_front_matter(text: str):
    # Tolerar archivos guardados con CRLF (por ejemplo, desde Notepad).
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---\n", 4)
    if end == -1:
        return {}, text
    raw = text[4:end]
    body = text[end + 5:]
    data = {}
    for line in raw.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()
        try:
            parsed = json.loads(value)
        except Exception:
            parsed = value.strip('"')
        if key == "tags":
            if isinstance(parsed, str):
                if parsed.startswith("[") and parsed.endswith("]"):
                    parsed = [
                        part.strip().strip('"').strip("'")
                        for part in parsed[1:-1].split(",")
                        if part.strip()
                    ]
                else:
                    parsed = [parsed.strip('"').strip("'")] if parsed else []
        elif key == "orden":
            try:
                parsed = int(parsed)
            except Exception:
                parsed = 9999
        data[key] = parsed
    return data, body


def strip_title_and_lead(body: str) -> str:
    lines = body.splitlines()
    # quita líneas vacías iniciales
    while lines and not lines[0].strip():
        lines.pop(0)
    # quita el H1 (el título ya se muestra en la interfaz)
    if lines and lines[0].startswith("# "):
        lines.pop(0)
    # quita la blockquote de metadatos inicial
    while lines and not lines[0].strip():
        lines.pop(0)
    if lines and lines[0].startswith(">"):
        while lines and lines[0].startswith(">"):
            lines.pop(0)
        while lines and not lines[0].strip():
            lines.pop(0)
    return "\n".join(lines).strip()


def cargar_taxonomia() -> dict:
    if not TAXONOMIA.exists():
        return {"fichas": {}}
    return json.loads(TAXONOMIA.read_text(encoding="utf-8"))


def inferir_categoria(fm: dict, tipo_ui: str) -> str:
    tags = [normalizar(t) for t in fm.get("tags", [])]
    if tipo_ui in {"indice", "documento"}:
        if "literatura" in tags or "novela" in tags or "novella" in tags:
            return "literatura"
        return "guia"
    if "juegos-de-mesa" in tags or "juego-de-mesa" in tags:
        return "juego-de-mesa"
    if "wargame" in tags or "minis" in tags:
        return "wargame"
    return "rol"


def inferir_familia(fm: dict) -> str:
    tags = [normalizar(t) for t in fm.get("tags", [])]
    if "literatura" in tags:
        return "literatura"
    if "juegos-de-mesa" in tags:
        return "mesa"
    for clave, familia in (
        ("osr", "osr"),
        ("year-zero", "year-zero"),
        ("year zero", "year-zero"),
        ("pbta", "pbta"),
        ("forged", "forged-dark"),
        ("2d20", "2d20"),
        ("d100", "d100"),
        ("d20", "d20"),
        ("2d6", "2d6"),
        ("d10", "d10-pool"),
        ("d6", "d6-pool"),
    ):
        if clave in tags:
            return familia
    return "varios"


def main():
    if not FICHAS.exists():
        sys.exit(f"No existe {FICHAS}")

    taxonomia = cargar_taxonomia()
    tax_fichas = taxonomia.get("fichas", {})
    categorias = taxonomia.get("categorias", {})
    tipos = taxonomia.get("tipos", {})
    familias = taxonomia.get("familias", {})

    files = sorted(FICHAS.rglob("*.md"))
    if INDICES.exists():
        files += sorted(INDICES.glob("*.md"))

    fichas = []
    for path in files:
        text = path.read_text(encoding="utf-8")
        fm, body = parse_front_matter(text)
        if not fm.get("id"):
            print(f"AVISO: sin id en {path}")
            continue
        ficha_id = fm["id"]
        tax = tax_fichas.get(ficha_id, {})
        body = strip_title_and_lead(body)

        tipo_origen = fm.get("tipo", "ficha")
        tipo_ui, tipo_label = TIPOS_DEFECTO.get(
            tipo_origen, (tipo_origen, fm.get("tipo_label", "Ficha"))
        )
        tipo_ui = tax.get("tipo", tipo_ui)
        tipo_label = tipos.get(tipo_ui, tipo_label)

        categoria = tax.get("categoria") or inferir_categoria(fm, tipo_ui)
        categoria_label = categorias.get(categoria, categoria.replace("-", " ").title())

        familia = tax.get("familia") or inferir_familia(fm)
        familia_label = familias.get(familia, familia.replace("-", " ").title())

        titulo = tax.get("titulo_ui") or fm.get("titulo", path.stem)
        alias = tax.get("alias", [])
        motor = tax.get("motor", "")
        dados = tax.get("dados", [])
        recursos = tax.get("recursos", [])
        tags = fm.get("tags", [])
        resumen = fm.get("resumen", "")

        busqueda = normalizar(
            " ".join(
                [
                    titulo,
                    fm.get("titulo", ""),
                    " ".join(alias),
                    resumen,
                    " ".join(tags),
                    motor,
                    " ".join(dados),
                    " ".join(recursos),
                    body[:1600],
                ]
            )
        )

        item = {
            "id": ficha_id,
            "titulo": titulo,
            "titulo_original": fm.get("titulo", path.stem),
            "genero": fm.get("genero", "sin-genero"),
            "genero_label": fm.get("genero_label", "Sin género"),
            "tipo": tipo_origen,
            "tipo_ui": tipo_ui,
            "tipo_label": tipo_label,
            "categoria": categoria,
            "categoria_label": categoria_label,
            "familia": familia,
            "familia_label": familia_label,
            "motor": motor,
            "dados": dados,
            "recursos": recursos,
            "alias": alias,
            "icono": fm.get("icono", "📄"),
            "color": fm.get("color", "#7c3aed"),
            "tags": tags,
            "resumen": resumen,
            "fuente": fm.get("fuente", ""),
            "seccion": fm.get("seccion", ""),
            "orden": fm.get("orden", 9999),
            "actualizado": fm.get("actualizado", ""),
            "ruta": path.relative_to(LIB).as_posix(),
            "busqueda": busqueda,
            "contenido": body,
        }
        if fm.get("logo"):
            item["logo"] = fm["logo"]
        fichas.append(item)

    fichas.sort(key=lambda x: (x["orden"], x["titulo"].lower()))

    payload = {
        "generado": date.today().isoformat(),
        "total": len(fichas),
        "fichas": fichas,
    }

    datos_js = "/* Generado por tools/build_index.py. No editar a mano. */\n"
    datos_js += "window.BIBLIOTECA = "
    datos_js += json.dumps(payload, ensure_ascii=False, indent=2)
    datos_js += ";\n"
    datos_js = datos_js.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    (LIB / "datos.js").write_text(datos_js, encoding="utf-8", newline="\n")

    metadata = {
        "generado": payload["generado"],
        "total": len(fichas),
        "fichas": [
            {k: v for k, v in f.items() if k not in {"contenido", "busqueda"}}
            for f in fichas
        ],
    }
    (LIB / "fichas.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )

    def md_cell(value):
        return str(value).replace("|", "\\|").replace("\n", " ").strip()

    indice = [
        "# Índice de la biblioteca",
        "",
        f"> Generado por `tools/build_index.py` · {len(fichas)} entradas · {payload['generado']}",
        ">",
        "> Abre `index.html` para la versión navegable. Este archivo es el índice de respaldo para leer desde el sistema de archivos o para que lo consuma el DM IA.",
        "",
        "| Icono | Ficha | Categoría | Género | Tipo | Motor | Tags | Resumen |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for f in fichas:
        indice.append(
            "| {icono} | [{titulo}]({ruta}) | {categoria} | {genero} | {tipo} | {motor} | {tags} | {resumen} |".format(
                icono=md_cell(f["icono"]),
                titulo=md_cell(f["titulo"]),
                ruta=f["ruta"],
                categoria=md_cell(f["categoria_label"]),
                genero=md_cell(f["genero_label"]),
                tipo=md_cell(f["tipo_label"]),
                motor=md_cell(f["motor"] or "—"),
                tags=md_cell(", ".join(f["tags"])),
                resumen=md_cell(f["resumen"]),
            )
        )
    indice += [
        "",
        "## Cómo usar este índice",
        "",
        "1. Elige una ficha por categoría, género, tipo o tag.",
        "2. Abre su archivo `.md` (la columna Ficha enlaza directamente).",
        "3. Lee el cuerpo base y después la sección **Personalización del usuario**.",
        "4. Para campañas, abre los índices de `indices/`.",
        "",
    ]
    (LIB / "INDICE.md").write_text("\n".join(indice), encoding="utf-8", newline="\n")

    print(f"OK: {len(fichas)} fichas -> datos.js, fichas.json e INDICE.md")


if __name__ == "__main__":
    main()
