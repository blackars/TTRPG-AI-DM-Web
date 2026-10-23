"""Biblioteca TTRPG: lectura de fichas Markdown, documentos y contexto para la IA.

La fuente editable vive en `biblioteca/`. La API solo lee esos archivos; las
subidas del usuario se guardan en `api/data/biblioteca/` para no ensuciar el
contenido versionado.
"""
from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlmodel import Session

from db import DATA_DIR
from models import AppKv
from utils import dumps, loads

ROOT = Path(__file__).resolve().parents[1]
BIBLIOTECA_DIR = ROOT / "biblioteca"
FICHAS_DIR = BIBLIOTECA_DIR / "fichas"
INDICES_DIR = BIBLIOTECA_DIR / "indices"
DOCUMENTOS_DIR = BIBLIOTECA_DIR / "documentos"
TAXONOMIA_PATH = BIBLIOTECA_DIR / "taxonomia.json"
UPLOADS_DIR = DATA_DIR / "biblioteca"
CACHE_DIR = DATA_DIR / "biblioteca_cache"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)

ACTIVA_KEY = "biblioteca_activa"
VINCULOS_KEY = "biblioteca_vinculos"
EXTENSIONES = {".md", ".txt", ".pdf"}
MAX_DOCUMENTO = 12 * 1024 * 1024
MAX_CONTEXTO = 14000

TIPOS_DEFECTO = {
    "ficha": ("sistema", "Sistema"),
    "sistema": ("sistema", "Sistema"),
    "coleccion": ("coleccion", "Colección"),
    "indice": ("indice", "Índice"),
    "documento": ("documento", "Documento"),
}
CATEGORIAS_DEFECTO = {
    "rol": "Rol",
    "wargame": "Wargame",
    "juego-de-mesa": "Juego de mesa",
    "literatura": "Literatura",
    "guia": "Guía",
}
FAMILIAS_DEFECTO = {
    "d20": "d20",
    "d100": "d100 / BRP",
    "2d6": "2d6",
    "d6-pool": "d6 pool",
    "d10-pool": "d10 pool",
    "2d20": "2d20",
    "age": "AGE",
    "osr": "OSR",
    "year-zero": "Year Zero",
    "pbta": "PbtA",
    "forged-dark": "Forged in the Dark",
    "narrativo": "Narrativo",
    "propio": "Propio",
    "oraculo": "Oráculo",
    "literatura": "Literatura",
    "mesa": "Juego de mesa",
    "varios": "Varios motores",
}


def normalizar(value: str) -> str:
    value = unicodedata.normalize("NFD", str(value or ""))
    return "".join(c for c in value if unicodedata.category(c) != "Mn").lower()


def _fecha_iso(ts: float) -> str:
    return datetime.fromtimestamp(ts).astimezone().isoformat(timespec="seconds")


def _leer_texto(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace").replace("\r\n", "\n").replace("\r", "\n")


def _parse_front_matter(text: str) -> tuple[dict[str, Any], str]:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---\n", 4)
    if end == -1:
        return {}, text
    raw = text[4:end]
    body = text[end + 5:]
    data: dict[str, Any] = {}
    for line in raw.splitlines():
        if not line.strip() or line.lstrip().startswith("#") or ":" not in line:
            continue
        key, value = line.split(":", 1)
        key, value = key.strip(), value.strip()
        try:
            parsed: Any = json.loads(value)
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


def _sin_titulo(body: str) -> str:
    lines = body.splitlines()
    while lines and not lines[0].strip():
        lines.pop(0)
    if lines and lines[0].startswith("# "):
        lines.pop(0)
    while lines and not lines[0].strip():
        lines.pop(0)
    if lines and lines[0].startswith(">"):
        while lines and lines[0].startswith(">"):
            lines.pop(0)
        while lines and not lines[0].strip():
            lines.pop(0)
    return "\n".join(lines).strip()


def _cargar_taxonomia() -> dict:
    if not TAXONOMIA_PATH.exists():
        return {"fichas": {}, "categorias": {}, "tipos": {}, "familias": {}}
    try:
        return json.loads(TAXONOMIA_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"fichas": {}, "categorias": {}, "tipos": {}, "familias": {}}


def _inferir_categoria(fm: dict, tipo_ui: str) -> str:
    tags = [normalizar(t) for t in fm.get("tags", [])]
    if tipo_ui in {"indice", "documento"}:
        if any(t in tags for t in ("literatura", "novela", "novella")):
            return "literatura"
        return "guia"
    if any(t in tags for t in ("juegos-de-mesa", "juego-de-mesa")):
        return "juego-de-mesa"
    if any(t in tags for t in ("wargame", "minis")):
        return "wargame"
    return "rol"


def _inferir_familia(fm: dict) -> str:
    tags = [normalizar(t) for t in fm.get("tags", [])]
    if "literatura" in tags:
        return "literatura"
    if "juegos-de-mesa" in tags:
        return "mesa"
    for clave, familia in (
        ("osr", "osr"),
        ("year-zero", "year-zero"),
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


def _personalizacion(body: str) -> str:
    patron = re.compile(r"^##\s+Personalizaci[oó]n del usuario\s*$", re.IGNORECASE | re.MULTILINE)
    encontrado = patron.search(body)
    if not encontrado:
        return ""
    texto = body[encontrado.end():]
    # Cortar en el siguiente H2, si existe.
    siguiente = re.search(r"^##\s+", texto, re.MULTILINE)
    if siguiente:
        texto = texto[:siguiente.start()]
    texto = re.sub(r"<!--.*?-->", "", texto, flags=re.DOTALL)
    # Quitar el bloque de ejemplo de comandos, que no es contenido del usuario.
    texto = re.sub(
        r"```(?:ya?ml)?\s*\n# Ejemplo de configuración.*?```",
        "",
        texto,
        flags=re.DOTALL | re.IGNORECASE,
    )
    lineas: list[str] = []
    for linea in texto.splitlines():
        limpia = linea.strip()
        if limpia.startswith("> **Zona reservada.**"):
            continue
        if re.match(r"^\|\s*2026-10-22\s*\|\s*Extracción inicial", limpia, re.IGNORECASE):
            continue
        lineas.append(linea)
    limpio = "\n".join(lineas).strip()
    # Si solo quedan títulos, tablas de ejemplo o líneas vacías, no hay
    # personalización real que enviar a la IA.
    util = []
    for linea in limpio.splitlines():
        s = linea.strip()
        if not s or s.startswith("#") or s.startswith("|") or s.startswith("---"):
            continue
        util.append(s)
    if not util:
        return ""
    return limpio


def _enlaces(body: str) -> list[str]:
    vistos: list[str] = []
    for url in re.findall(r"https?://[^\s<>)\]]+", body):
        limpio = url.rstrip(".,;:")
        if limpio not in vistos:
            vistos.append(limpio)
    return vistos[:12]


def _meta_desde_archivo(path: Path, taxonomia: dict) -> dict:
    text = _leer_texto(path)
    fm, body = _parse_front_matter(text)
    ficha_id = fm.get("id") or path.stem
    tax = taxonomia.get("fichas", {}).get(ficha_id, {})
    tipo_origen = fm.get("tipo", "ficha")
    tipo_ui, tipo_label = TIPOS_DEFECTO.get(tipo_origen, (tipo_origen, fm.get("tipo_label", "Ficha")))
    tipo_ui = tax.get("tipo", tipo_ui)
    tipo_label = taxonomia.get("tipos", {}).get(tipo_ui, tipo_label)
    categoria = tax.get("categoria") or _inferir_categoria(fm, tipo_ui)
    categoria_label = taxonomia.get("categorias", {}).get(
        categoria, CATEGORIAS_DEFECTO.get(categoria, categoria.replace("-", " ").title())
    )
    familia = tax.get("familia") or _inferir_familia(fm)
    familia_label = taxonomia.get("familias", {}).get(
        familia, FAMILIAS_DEFECTO.get(familia, familia.replace("-", " ").title())
    )
    titulo = tax.get("titulo_ui") or fm.get("titulo", path.stem)
    body = _sin_titulo(body)
    busqueda = normalizar(
        " ".join(
            [
                titulo,
                fm.get("titulo", ""),
                " ".join(tax.get("alias", [])),
                fm.get("resumen", ""),
                " ".join(fm.get("tags", [])),
                tax.get("motor", ""),
                " ".join(tax.get("dados", [])),
                " ".join(tax.get("recursos", [])),
                body[:1800],
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
        "motor": tax.get("motor", ""),
        "dados": tax.get("dados", []),
        "recursos": tax.get("recursos", []),
        "alias": tax.get("alias", []),
        "icono": fm.get("icono", "📄"),
        "color": fm.get("color", "#7c3aed"),
        "tags": fm.get("tags", []),
        "resumen": fm.get("resumen", ""),
        "fuente": fm.get("fuente", ""),
        "seccion": fm.get("seccion", ""),
        "orden": fm.get("orden", 9999),
        "actualizado": fm.get("actualizado", ""),
        "ruta": path.relative_to(BIBLIOTECA_DIR).as_posix(),
        "busqueda": busqueda,
        "enlaces": _enlaces(body),
    }
    if fm.get("logo"):
        item["logo"] = fm["logo"]
    return item, body


def catalogo() -> list[dict]:
    taxonomia = _cargar_taxonomia()
    paths: list[Path] = []
    if FICHAS_DIR.exists():
        paths += sorted(FICHAS_DIR.rglob("*.md"))
    if INDICES_DIR.exists():
        paths += sorted(INDICES_DIR.glob("*.md"))
    items = []
    for path in paths:
        meta, _ = _meta_desde_archivo(path, taxonomia)
        items.append(meta)
    items.sort(key=lambda x: (int(x.get("orden", 9999)), str(x.get("titulo", "")).lower()))
    return items


def facetas(items: list[dict]) -> dict:
    def unicos(clave: str, label: str) -> list[dict]:
        vistos: dict[str, str] = {}
        for item in items:
            valor = str(item.get(clave) or "")
            if valor:
                vistos.setdefault(valor, str(item.get(label) or valor))
        return [{"valor": k, "label": v} for k, v in sorted(vistos.items(), key=lambda x: x[1].lower())]

    return {
        "categorias": unicos("categoria", "categoria_label"),
        "generos": unicos("genero", "genero_label"),
        "tipos": unicos("tipo_ui", "tipo_label"),
        "familias": unicos("familia", "familia_label"),
        "recursos": sorted({r for item in items for r in item.get("recursos", [])}, key=str.lower),
    }


def _buscar_path(ficha_id: str) -> Path | None:
    if not ficha_id or "/" in ficha_id or "\\" in ficha_id or ficha_id.startswith("."):
        return None
    for path in list(FICHAS_DIR.rglob("*.md")) + list(INDICES_DIR.glob("*.md")):
        fm, _ = _parse_front_matter(_leer_texto(path))
        if (fm.get("id") or path.stem) == ficha_id:
            return path
    return None


def ficha(ficha_id: str) -> dict | None:
    path = _buscar_path(ficha_id)
    if not path:
        return None
    meta, body = _meta_desde_archivo(path, _cargar_taxonomia())
    return {
        **meta,
        "contenido": body,
        "personalizacion": _personalizacion(body),
        "documentos": [],
    }


# ---------------------------------------------------------------- selección

def _kv(session: Session, key: str) -> dict:
    fila = session.get(AppKv, key)
    return loads(fila.value_json, {}) if fila else {}


def _guardar_kv(session: Session, key: str, valor: dict) -> None:
    fila = session.get(AppKv, key)
    if fila:
        fila.value_json = dumps(valor)
        fila.ts = datetime.now().astimezone().isoformat(timespec="seconds")
    else:
        fila = AppKv(key=key, value_json=dumps(valor))
    session.add(fila)
    session.commit()


def activa(session: Session) -> dict | None:
    dato = _kv(session, ACTIVA_KEY)
    ficha_id = dato.get("id")
    if not ficha_id:
        return None
    detalle = ficha(str(ficha_id))
    if not detalle:
        return None
    return {
        "id": detalle["id"],
        "titulo": detalle["titulo"],
        "categoria": detalle["categoria"],
        "categoria_label": detalle["categoria_label"],
        "tipo_ui": detalle["tipo_ui"],
        "tipo_label": detalle["tipo_label"],
        "genero": detalle["genero"],
        "genero_label": detalle["genero_label"],
        "familia": detalle["familia"],
        "familia_label": detalle["familia_label"],
        "motor": detalle["motor"],
        "icono": detalle["icono"],
        "color": detalle["color"],
        "seleccionado": dato.get("ts", ""),
    }


def seleccionar(session: Session, ficha_id: str) -> dict | None:
    detalle = ficha(ficha_id)
    if not detalle:
        return None
    _guardar_kv(
        session,
        ACTIVA_KEY,
        {"id": ficha_id, "ts": datetime.now().astimezone().isoformat(timespec="seconds")},
    )
    return activa(session)


def limpiar(session: Session) -> None:
    fila = session.get(AppKv, ACTIVA_KEY)
    if fila:
        session.delete(fila)
        session.commit()


def vinculos(session: Session) -> dict[str, str]:
    return {str(k): str(v) for k, v in _kv(session, VINCULOS_KEY).items()}


def vincular(session: Session, documento_id: str, sistema_id: str | None) -> dict[str, str]:
    datos = vinculos(session)
    if sistema_id:
        datos[documento_id] = sistema_id
    else:
        datos.pop(documento_id, None)
    _guardar_kv(session, VINCULOS_KEY, datos)
    return datos


# ---------------------------------------------------------------- documentos

def _doc_id(path: Path) -> str:
    try:
        rel = path.relative_to(BIBLIOTECA_DIR).as_posix()
    except ValueError:
        rel = "subidas/" + path.name
    return "doc_" + hashlib.sha1(rel.encode("utf-8")).hexdigest()[:10]


def _doc_titulo(path: Path) -> str:
    if path.suffix.lower() == ".md":
        try:
            fm, _ = _parse_front_matter(_leer_texto(path))
            if fm.get("titulo"):
                return str(fm["titulo"])
        except OSError:
            pass
    return path.stem.replace("-", " ").replace("_", " ").strip().capitalize()


def _iter_documentos() -> list[tuple[Path, str]]:
    encontrados: list[tuple[Path, str]] = []
    for raiz, origen in ((DOCUMENTOS_DIR, "biblioteca"), (UPLOADS_DIR, "subida")):
        if not raiz.exists():
            continue
        for path in sorted(raiz.rglob("*")):
            if (
                path.is_file()
                and path.suffix.lower() in EXTENSIONES
                and not path.name.startswith(".")
                and not (origen == "biblioteca" and path.name.lower() == "readme.md")
            ):
                encontrados.append((path, origen))
    return encontrados


def documentos(session: Session) -> list[dict]:
    enlaces = vinculos(session)
    salida = []
    for path, origen in _iter_documentos():
        doc_id = _doc_id(path)
        stat = path.stat()
        salida.append(
            {
                "id": doc_id,
                "titulo": _doc_titulo(path),
                "nombre": path.name,
                "tipo": path.suffix.lower().lstrip("."),
                "icono": {"md": "📝", "txt": "📄", "pdf": "📕"}.get(path.suffix.lower().lstrip("."), "📄"),
                "bytes": stat.st_size,
                "actualizado": _fecha_iso(stat.st_mtime),
                "origen": origen,
                "sistema_id": enlaces.get(doc_id, ""),
                "ruta": path.relative_to(BIBLIOTECA_DIR).as_posix()
                if BIBLIOTECA_DIR in path.parents
                else f"api/data/biblioteca/{path.name}",
            }
        )
    salida.sort(key=lambda x: (x["origen"] != "biblioteca", x["titulo"].lower()))
    return salida


def _doc_path(documento_id: str) -> tuple[Path, str] | None:
    for path, origen in _iter_documentos():
        if _doc_id(path) == documento_id:
            return path, origen
    return None


def ruta_documento(documento_id: str) -> Path | None:
    encontrado = _doc_path(documento_id)
    return encontrado[0] if encontrado else None


def _limpiar_pdf(texto: str) -> str:
    lineas: list[str] = []
    recientes: list[str] = []
    for linea in texto.replace("\r", "\n").splitlines():
        limpia = re.sub(r"[ \t]+", " ", linea).strip()
        if not limpia:
            if lineas and lineas[-1] != "":
                lineas.append("")
            continue
        if limpia in recientes[-3:]:
            continue
        lineas.append(limpia)
        recientes.append(limpia)
        if len(recientes) > 8:
            recientes.pop(0)
    return "\n".join(lineas).strip()


def _extraer_pdf(path: Path) -> str:
    cache = CACHE_DIR / (hashlib.sha1(f"{path}:{path.stat().st_mtime}:{path.stat().st_size}".encode()).hexdigest() + ".txt")
    if cache.exists():
        return cache.read_text(encoding="utf-8")
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError("Falta la dependencia pypdf para leer PDF.") from exc
    reader = PdfReader(str(path))
    texto = "\n\n".join((pagina.extract_text() or "") for pagina in reader.pages)
    texto = _limpiar_pdf(texto)
    cache.write_text(texto, encoding="utf-8")
    return texto


def leer_documento(documento_id: str, max_chars: int = 24000) -> dict | None:
    encontrado = _doc_path(documento_id)
    if not encontrado:
        return None
    path, origen = encontrado
    if path.suffix.lower() == ".pdf":
        contenido = _extraer_pdf(path)
    else:
        contenido = _leer_texto(path)
    return {
        "id": documento_id,
        "titulo": _doc_titulo(path),
        "nombre": path.name,
        "tipo": path.suffix.lower().lstrip("."),
        "origen": origen,
        "contenido": contenido[:max_chars],
        "truncado": len(contenido) > max_chars,
        "caracteres": len(contenido),
    }


def _slug(nombre: str) -> str:
    base = Path(nombre).stem
    ext = Path(nombre).suffix.lower()
    limpio = unicodedata.normalize("NFKD", base).encode("ascii", "ignore").decode("ascii")
    limpio = re.sub(r"[^a-zA-Z0-9]+", "-", limpio).strip("-").lower() or "documento"
    return f"{limpio}{ext}"


def guardar_documento(nombre: str, data: bytes) -> dict:
    ext = Path(nombre).suffix.lower()
    if ext not in EXTENSIONES:
        raise ValueError("Solo se aceptan archivos .md, .txt o .pdf.")
    if len(data) > MAX_DOCUMENTO:
        raise ValueError("El archivo supera el límite de 12 MB.")
    destino = UPLOADS_DIR / _slug(nombre)
    if destino.exists():
        contador = 2
        while True:
            candidato = UPLOADS_DIR / f"{destino.stem}-{contador}{ext}"
            if not candidato.exists():
                destino = candidato
                break
            contador += 1
    destino.write_bytes(data)
    return {
        "id": _doc_id(destino),
        "titulo": _doc_titulo(destino),
        "nombre": destino.name,
        "tipo": ext.lstrip("."),
        "origen": "subida",
        "bytes": destino.stat().st_size,
        "ruta": f"api/data/biblioteca/{destino.name}",
    }


def eliminar_documento(documento_id: str) -> bool:
    encontrado = _doc_path(documento_id)
    if not encontrado:
        return False
    path, origen = encontrado
    if origen != "subida" or UPLOADS_DIR not in path.parents:
        return False
    path.unlink(missing_ok=True)
    return True


# ---------------------------------------------------------------- contexto IA

def _recortar(texto: str, limite: int) -> tuple[str, bool]:
    texto = texto.strip()
    if len(texto) <= limite:
        return texto, False
    return texto[:limite].rstrip() + "\n\n[…recortado para el contexto…]", True


def contexto(session: Session, max_chars: int = MAX_CONTEXTO) -> dict:
    items = catalogo()
    activo = activa(session)
    if not activo:
        return {
            "catalogo_total": len(items),
            "sistema_activo": None,
            "ficha_base": "",
            "personalizacion": "",
            "documentos_vinculados": [],
            "generadores": ["mythic"],
            "instruccion": (
                "No hay sistema activo en la biblioteca. Si el usuario habla de reglas, "
                "pregunta qué sistema quiere usar o propone uno de la biblioteca."
            ),
        }
    detalle = ficha(activo["id"]) or {}
    documentos_vinculados = []
    for doc in documentos(session):
        if doc.get("sistema_id") != activo["id"]:
            continue
        leido = leer_documento(doc["id"], max_chars=2600)
        if leido:
            documentos_vinculados.append(
                {
                    "id": doc["id"],
                    "titulo": leido["titulo"],
                    "tipo": leido["tipo"],
                    "contenido": leido["contenido"],
                    "truncado": leido["truncado"],
                }
            )
    base, base_truncada = _recortar(detalle.get("contenido", ""), max(1200, max_chars - 5200))
    personalizacion, pers_truncada = _recortar(detalle.get("personalizacion", ""), 3200)
    return {
        "catalogo_total": len(items),
        "sistema_activo": activo,
        "ficha_base": base,
        "ficha_truncada": base_truncada,
        "personalizacion": personalizacion,
        "personalizacion_truncada": pers_truncada,
        "documentos_vinculados": documentos_vinculados[:4],
        "generadores": ["mythic"],
        "instruccion": (
            "Usa la ficha_base y la personalizacion como marco del sistema activo. "
            "Si hay documentos_vinculados, son material de la campaña del usuario y "
            "tienen prioridad para escenas, pistas y continuidad. No inventes reglas "
            "que contradigan la ficha; si falta un dato, dilo y propone una aproximación."
        ),
    }
