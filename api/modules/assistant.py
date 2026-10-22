"""Módulo Asistente IA: contexto total, chat, acciones whitelist y textos NPC."""
from __future__ import annotations

import json
import re
import unicodedata
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ai.llm import LLM
from context import build_context
from db import get_session
from events import emit
from models import AiMessage, Npc
from serializers import npc_dict
from utils import hash_contexto, loads

router = APIRouter(tags=["asistente"])
llm = LLM()

ACCIONES_PERMITIDAS: dict[str, dict[str, Any]] = {
    "tirar_dado": {
        "descripcion": "Tira dados (NdX±M) en el motor autoritativo.",
        "campos": {"expr": str, "razon": str, "personaje": str},
    },
    "activar_escena": {
        "descripcion": "Activa una escena existente por id o nombre.",
        "campos": {"id": int, "nombre": str},
    },
    "play_sound": {
        "descripcion": "Reproduce un sonido de la biblioteca por id.",
        "campos": {"id": int},
    },
    "anadir_item": {
        "descripcion": "Añade un item real a una sección del inventario.",
        "campos": {"section_id": int, "nombre": str, "qty": int, "icono": str},
    },
    "cambiar_hp": {
        "descripcion": "Cambia los HP actuales de un personaje o criatura.",
        "campos": {"character_id": int, "hp": int},
    },
    "crear_nota": {
        "descripcion": "Añade una nota a las notas del DM.",
        "campos": {"texto": str},
    },
    "redactar_npc": {
        "descripcion": "Redacta un texto breve para un NPC existente.",
        "campos": {"npc_id": int, "situacion": str},
    },
}


class TurnoIn(BaseModel):
    mensaje: str
    conversacion: str = "principal"


class AsistenteAccion(BaseModel):
    action: str
    conversacion: str = "principal"


class NpcTextoIn(BaseModel):
    npc_id: int
    situacion: str = ""


# --------------------------------------------------------------------- historial
def _historial(session: Session, conversacion: str, limite: int = 12) -> list[dict]:
    filas = session.exec(
        select(AiMessage).where(AiMessage.conversacion == conversacion)
        .order_by(AiMessage.id.desc()).limit(limite)
    ).all()
    return [{"role": f.role, "content": f.contenido} for f in reversed(filas)]


def _estado_asistente(session: Session, conversacion: str = "principal") -> dict:
    filas = session.exec(
        select(AiMessage).where(AiMessage.conversacion == conversacion).order_by(AiMessage.id)
    ).all()
    return {
        "mensajes": [{
            "id": f.id, "role": f.role, "contenido": f.contenido,
            "proveedor": f.proveedor, "ts": f.ts,
        } for f in filas],
        "conversacion": conversacion,
        "providers": llm.estado(),
        "acciones_permitidas": {
            nombre: {
                "descripcion": meta["descripcion"],
                "campos": list(meta["campos"].keys()),
            }
            for nombre, meta in ACCIONES_PERMITIDAS.items()
        },
    }


# ------------------------------------------------------------------ prompt sistema
def _system_prompt(contexto: dict) -> str:
    acciones = "\n".join(
        f"- {k}: {v['descripcion']} Campos: {', '.join(v['campos'])}"
        for k, v in ACCIONES_PERMITIDAS.items()
    )
    contexto_json = json.dumps(contexto, ensure_ascii=False, indent=1, default=str)
    return f"""Eres el Asistente-DM de TTRPG-Assistant, una mesa de rol digital.
Hablas español de España, con tono cercano, preciso y de mesa. Eres juez y copiloto del DM,
pero NUNCA inventas recursos: solo usas lo que aparece en el CONTEXTO.

REGLAS DURAS
1. Responde en 2-5 frases. Directo, sin florituras vacías.
2. Toda tirada, objeto, personaje, escena, NPC o sonido que menciones debe existir en el CONTEXTO
   y coincidir con sus datos reales (nombres, totales, cantidades).
3. Si no hay un dato, dilo: "no consta en la mesa". No rellenes huecos.
4. Las notas del DM son privadas: úsalas para coherencia, no las cites literalmente si parecen secretos.
5. Si el usuario pide una acción mecánica, añade AL FINAL un bloque de código JSON exactamente así:
```json
{{"actions":[{{"action":"tirar_dado","expr":"d20+3","razon":"..."}}]}}
```
   Máximo 3 acciones. Usa solo esta lista blanca:
{acciones}
6. No ejecutes acciones tú: el frontend las mostrará al usuario para que las confirme.
7. Si el usuario solo conversa, responde sin bloque de acciones.
8. La mezcla de reglas activa manda: si una regla no está activa, no la uses.

CONTEXTO JSON DE LA MESA
{contexto_json}
"""


# ---------------------------------------------------------------- extraer acciones
def _limpiar_accion(accion: dict) -> dict | None:
    if not isinstance(accion, dict):
        return None
    nombre = accion.get("action")
    if nombre not in ACCIONES_PERMITIDAS:
        return None
    limpia: dict[str, Any] = {"action": nombre}
    for campo, tipo in ACCIONES_PERMITIDAS[nombre]["campos"].items():
        if campo not in accion:
            continue
        valor = accion[campo]
        try:
            if tipo is int:
                limpia[campo] = int(valor)
            else:
                limpia[campo] = str(valor)[:600]
        except (TypeError, ValueError):
            continue
    if nombre == "tirar_dado" and not limpia.get("expr"):
        return None
    if nombre == "activar_escena" and "id" not in limpia and not limpia.get("nombre"):
        return None
    if nombre == "play_sound" and "id" not in limpia:
        return None
    if nombre == "anadir_item" and ("section_id" not in limpia or not limpia.get("nombre")):
        return None
    if nombre == "cambiar_hp" and ("character_id" not in limpia or "hp" not in limpia):
        return None
    if nombre == "crear_nota" and not limpia.get("texto"):
        return None
    if nombre == "redactar_npc" and "npc_id" not in limpia:
        return None
    return limpia


def extraer_acciones(texto: str) -> tuple[str, list[dict]]:
    """Devuelve (texto sin bloque de acciones, acciones validadas)."""
    acciones: list[dict] = []
    limpio = texto or ""
    bloques = list(re.finditer(r"```(?:json)?\s*(.*?)```", limpio, re.DOTALL | re.IGNORECASE))
    for m in bloques:
        try:
            obj = json.loads(m.group(1).strip())
        except (ValueError, TypeError):
            continue
        if isinstance(obj, dict) and isinstance(obj.get("actions"), list):
            for a in obj["actions"][:3]:
                limpia = _limpiar_accion(a)
                if limpia:
                    acciones.append(limpia)
            limpio = limpio.replace(m.group(0), "").strip()
    # JSON suelto (algunos modelos no ponen fences)
    for m in re.finditer(r'\{"actions"\s*:', limpio):
        try:
            obj, fin = json.JSONDecoder().raw_decode(limpio[m.start():])
        except ValueError:
            continue
        if isinstance(obj, dict) and isinstance(obj.get("actions"), list):
            for a in obj["actions"][:3]:
                limpia = _limpiar_accion(a)
                if limpia:
                    acciones.append(limpia)
            limpio = (limpio[:m.start()] + limpio[m.start() + fin:]).strip()
    # deduplicar conservando orden
    vistos = set()
    unicas = []
    for a in acciones:
        clave = json.dumps(a, sort_keys=True, ensure_ascii=False)
        if clave not in vistos:
            vistos.add(clave)
            unicas.append(a)
    return limpio.strip(), unicas[:3]


# ------------------------------------------------------------------ respuesta mock
def _norm(texto: str) -> str:
    sin = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", sin).strip().lower()


def _mejor_item(contexto: dict) -> tuple[str, dict] | tuple[None, None]:
    for p in contexto.get("personajes", []):
        if p.get("kind") != "personaje":
            continue
        for item in p.get("inventario_resumen", []):
            if item.get("qty", 0) > 0:
                return p["nombre"], item
    return None, None


def _mock_texto(mensaje: str, contexto: dict) -> str:
    m = _norm(mensaje)
    escena = contexto.get("escena_activa")
    tiradas = contexto.get("ultimas_tiradas") or []
    mix = contexto.get("mix_reglas", {})
    personaje, item = _mejor_item(contexto)
    partes: list[str] = []

    pide_tirada = bool(re.search(r"\b(tira|tirar|tirad|tirando)\b", m)) or bool(
        re.search(r"\b\d*d(4|6|8|10|12|20|100|f)\b", m)
    )
    pide_inventario = any(p in m for p in ("inventario", "lleva", "llevamos", "objeto", "item", "mochila"))
    pide_escena = any(p in m for p in ("escena", "delante", "donde", "sitio", "lugar"))
    pide_reglas = any(p in m for p in ("regla", "reglas", "sistema", "mecanica", "mecanica"))
    pide_npc = any(p in m for p in ("npc", "voz", "dialogo", "texto de"))

    if pide_tirada:
        expr = "d20"
        encontrado = re.search(r"(\d*)d(\d+|f)(\s*[+-]\s*\d+)?", m)
        if encontrado:
            expr = encontrado.group(0).replace(" ", "")
        partes.append(f"Preparo la tirada `{expr}` con el motor autoritativo de la mesa.")
        partes.append("Pulsa «Ejecutar» en la acción y verás el resultado real, no una estimación.")
    if pide_inventario:
        if item:
            partes.append(f"{personaje} lleva **{item['nombre']}** ×{item['qty']} "
                          f"en «{item['seccion']}» (icono {item['icono']}).")
        else:
            partes.append("No consta inventario cargado en la mesa.")
    if pide_escena:
        if escena:
            partes.append(f"La escena activa es **{escena['nombre']}**: {escena['descripcion']} "
                          f"Hay {len(escena['tokens'])} tokens colocados.")
        else:
            partes.append("No hay ninguna escena activa en este momento.")
    if pide_reglas:
        partes.append(f"La mezcla activa es: {mix.get('texto', 'sin reglas')}.")
    if pide_npc:
        npcs = contexto.get("npcs") or []
        if npcs:
            n = npcs[0]
            frase = (n.get("frases") or ["..."])[0]
            partes.append(f"Para {n['nombre']} (tono: {n['tono'] or 'neutro'}): «{frase}»")
    if tiradas and not pide_tirada:
        t = tiradas[0]
        partes.append(f"La última tirada fue `{t['expr']}` = **{t['total']}**"
                      + (f" ({t['razon']})" if t.get("razon") else "."))
    if escena and not pide_escena:
        partes.append(f"Seguimos en **{escena['nombre']}**.")
    if not partes:
        if escena:
            partes.append(f"Estamos en **{escena['nombre']}**: {escena['descripcion']}")
        if item:
            partes.append(f"Un recurso real disponible: **{item['nombre']}** ×{item['qty']} de {personaje}.")
        partes.append("¿Qué quieres consultar: la escena, el inventario, las reglas o una tirada?")

    # acciones sugeridas
    acciones: list[dict] = []
    if pide_tirada:
        expr = "d20"
        encontrado = re.search(r"(\d*)d(\d+|f)(\s*[+-]\s*\d+)?", m)
        if encontrado:
            expr = encontrado.group(0).replace(" ", "")
        acciones.append({"action": "tirar_dado", "expr": expr,
                         "razon": mensaje[:120], "personaje": personaje or ""})
    if "activa" in m and "escena" in m:
        for e in contexto.get("escenas", []):
            if _norm(e["nombre"]) in m:
                acciones.append({"action": "activar_escena", "id": e["id"]})
                partes.append(f"Puedo activar **{e['nombre']}**; confirma la acción.")
                break
    if acciones:
        partes.append("```json\n" + json.dumps({"actions": acciones}, ensure_ascii=False) + "\n```")
    return " ".join(partes)


# ------------------------------------------------------------------------- endpoints
@router.get("/api/assistant/context")
def contexto(session: Session = Depends(get_session)):
    return build_context(session)


@router.get("/api/assistant/providers")
def proveedores():
    return {"cadena": llm.chain(), "estado": llm.estado()}


@router.get("/api/modules/asistente/state")
def estado_asistente(conversacion: str = "principal", session: Session = Depends(get_session)):
    return _estado_asistente(session, conversacion)


@router.post("/api/modules/asistente/action")
def accion_asistente(data: AsistenteAccion, session: Session = Depends(get_session)):
    if data.action != "limpiar":
        raise HTTPException(400, "Acción no soportada")
    filas = session.exec(
        select(AiMessage).where(AiMessage.conversacion == data.conversacion)
    ).all()
    for f in filas:
        session.delete(f)
    session.commit()
    emit(session, "asistente", "conversacion_limpiada", {"conversacion": data.conversacion})
    return _estado_asistente(session, data.conversacion)


@router.post("/api/assistant/turn")
def turno(data: TurnoIn, session: Session = Depends(get_session)):
    mensaje = (data.mensaje or "").strip()
    if not mensaje:
        raise HTTPException(400, "El mensaje está vacío")
    if len(mensaje) > 4000:
        raise HTTPException(413, "Mensaje demasiado largo (máx. 4000 caracteres)")
    conversacion = (data.conversacion or "principal")[:40]
    contexto = build_context(session)
    ctx_hash = hash_contexto(contexto)

    usuario = AiMessage(conversacion=conversacion, role="user", contenido=mensaje,
                        contexto_hash=ctx_hash)
    session.add(usuario)
    session.commit()
    session.refresh(usuario)

    historial = _historial(session, conversacion, 12)
    # el último mensaje del historial es el actual; el sistema ya lo recibe aparte
    historial_previo = historial[:-1] if historial else []
    hist_txt = "\n".join(
        f"{m['role']}: {m['content'][:500]}" for m in historial_previo[-8:]
    )
    messages = _system_prompt(contexto)
    if hist_txt:
        messages += f"\n\nHISTORIAL RECIENTE (para coherencia, no lo repitas literal):\n{hist_txt}"
    proveedor = "mock"
    modelo = "mock"
    latencia = 0
    try:
        res = llm.chat("narracion", mensaje, system=messages, temperature=0.4, max_tokens=700)
        texto = res.get("texto", "").strip()
        proveedor = res.get("proveedor", "mock")
        modelo = res.get("modelo", "")
        latencia = int(res.get("latencia_ms", 0))
    except Exception as exc:  # noqa: BLE001
        texto = ""
        proveedor = "mock (fallback)"
        modelo = "mock"
        print(f"[asistente] fallback a mock: {exc}")

    if proveedor.startswith("mock") or not texto:
        texto = _mock_texto(mensaje, contexto)
        proveedor = "mock"
        modelo = "mock-local"

    texto_limpio, acciones = extraer_acciones(texto)
    if not texto_limpio:
        texto_limpio = _mock_texto(mensaje, contexto)
        texto_limpio, acciones = extraer_acciones(texto_limpio)

    asistente = AiMessage(conversacion=conversacion, role="assistant",
                          contenido=texto_limpio, contexto_hash=ctx_hash,
                          proveedor=proveedor)
    session.add(asistente)
    session.commit()
    session.refresh(asistente)
    emit(session, "asistente", "respuesta", {
        "id": asistente.id, "proveedor": proveedor,
        "acciones": len(acciones), "conversacion": conversacion,
    })
    return {
        "respuesta": texto_limpio,
        "mensaje": {"id": asistente.id, "role": "assistant", "contenido": texto_limpio,
                    "proveedor": proveedor, "ts": asistente.ts},
        "acciones": acciones,
        "proveedor": proveedor,
        "modelo": modelo,
        "latencia_ms": latencia,
        "contexto_hash": ctx_hash,
        "contexto_resumen": {
            "escena": contexto["escena_activa"]["nombre"] if contexto["escena_activa"] else None,
            "ultima_tirada": (contexto["ultimas_tiradas"][0]["expr"] + " = " +
                              str(contexto["ultimas_tiradas"][0]["total"]))
                             if contexto["ultimas_tiradas"] else None,
            "personajes": len(contexto["personajes"]),
            "items": contexto["badges_de_modulos"]["inventario"],
        },
    }


@router.post("/api/assistant/npc_text")
def texto_npc(data: NpcTextoIn, session: Session = Depends(get_session)):
    npc = session.get(Npc, data.npc_id)
    if not npc:
        raise HTTPException(404, "NPC no encontrado")
    contexto = build_context(session)
    system = (
        "Eres guionista de una mesa de rol. Escribe SOLO el diálogo de un NPC, en español, "
        "2-4 frases, sin acotaciones ni explicaciones. Respeta estrictamente su voz y tono. "
        "No inventes objetos, lugares ni personajes que no estén en el contexto. "
        f"NPC: {npc.nombre}. Voz: {npc.voz or 'no definida'}. Tono: {npc.tono or 'neutro'}. "
        f"Frases habituales: {npc.phrases_json}. "
        f"Contexto de mesa: {json.dumps(contexto, ensure_ascii=False)[:6000]}"
    )
    situacion = data.situacion.strip() or "El grupo acaba de entrar y le hace una pregunta directa."
    proveedor = "mock"
    texto = ""
    try:
        res = llm.chat("npc", situacion, system=system, temperature=0.8, max_tokens=350)
        texto = (res.get("texto") or "").strip()
        proveedor = res.get("proveedor", "mock")
    except Exception as exc:  # noqa: BLE001
        print(f"[npc] fallback: {exc}")
    if proveedor == "mock" or not texto:
        frases = loads(npc.phrases_json, [])
        base = frases[0] if frases else "No digo más de lo necesario."
        texto = (f"«{base}»\n\n({npc.nombre} os mira en silencio; su tono es "
                 f"{npc.tono.lower() or 'reservado'}. La pregunta queda flotando en el aire.)")
        proveedor = "mock"
    emit(session, "npcs", "texto_generado", {"npc_id": npc.id, "proveedor": proveedor})
    return {"texto": texto, "proveedor": proveedor, "npc": npc_dict(npc)}
