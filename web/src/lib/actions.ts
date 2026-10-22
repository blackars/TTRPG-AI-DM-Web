"use client";

import { api } from "./api";
import { audioEngine, type Sonido } from "./audio";
import type { AccionIA } from "./types";

export const NOMBRES_ACCION: Record<string, string> = {
  tirar_dado: "Tirar dados",
  activar_escena: "Activar escena",
  play_sound: "Reproducir sonido",
  anadir_item: "Añadir item",
  cambiar_hp: "Cambiar HP",
  crear_nota: "Añadir nota",
  redactar_npc: "Redactar NPC",
};

export interface ResultadoAccion {
  ok: boolean;
  mensaje: string;
}

interface EstadoEscenas {
  escenas: Array<{ id: number; nombre: string; activo: boolean }>;
  activa: { id: number; nombre: string } | null;
}

interface EstadoSonido {
  grupos: Array<{ nombre: string; sonidos: Sonido[] }>;
}

interface EstadoNotas {
  texto: string;
  ts: string | null;
}

/** Ejecuta una acción propuesta por el asistente contra el módulo real. */
export async function ejecutarAccion(accion: AccionIA): Promise<ResultadoAccion> {
  switch (accion.action) {
    case "tirar_dado": {
      const expr = String(accion.expr || "d20");
      const res = await api.post<{ tirada: { expr: string; total: number } }>(
        "/api/modules/dado/action",
        {
          action: "tirar",
          expr,
          razon: String(accion.razon || "Acción del asistente"),
          personaje: String(accion.personaje || ""),
        },
      );
      return { ok: true, mensaje: `Tirada ${res.tirada.expr} = ${res.tirada.total}` };
    }

    case "activar_escena": {
      let sceneId = accion.id !== undefined ? Number(accion.id) : null;
      if (!sceneId) {
        const estado = await api.get<EstadoEscenas>("/api/modules/escenarios/state");
        const buscado = String(accion.nombre || "").toLowerCase();
        const encontrada = estado.escenas.find((e) => e.nombre.toLowerCase() === buscado)
          ?? estado.escenas.find((e) => e.nombre.toLowerCase().includes(buscado));
        if (!encontrada) throw new Error(`No existe la escena «${accion.nombre}»`);
        sceneId = encontrada.id;
      }
      const res = await api.post<EstadoEscenas>("/api/modules/escenarios/action", {
        action: "activar",
        id: sceneId,
      });
      return { ok: true, mensaje: `Escena activa: ${res.activa?.nombre ?? "desconocida"}` };
    }

    case "play_sound": {
      const estado = await api.get<EstadoSonido>("/api/modules/sonido/state");
      const sonidos = estado.grupos.flatMap((g) => g.sonidos);
      const sound = sonidos.find((s) => s.id === Number(accion.id));
      if (!sound) throw new Error("El sonido ya no existe en la biblioteca");
      const listo = await audioEngine.init();
      if (!listo) throw new Error("El navegador bloqueó el audio; pulsa en la página y reintenta");
      await audioEngine.play(sound);
      return { ok: true, mensaje: `Sonando: ${sound.nombre}` };
    }

    case "anadir_item": {
      if (accion.section_id === undefined) throw new Error("La acción no indica una sección de inventario");
      await api.post("/api/modules/inventario/action", {
        action: "crear_item",
        section_id: Number(accion.section_id),
        nombre: String(accion.nombre || "Objeto"),
        qty: Math.max(1, Number(accion.qty || 1)),
        icono: String(accion.icono || "📦"),
      });
      return { ok: true, mensaje: `Añadido al inventario: ${accion.nombre}` };
    }

    case "cambiar_hp": {
      const res = await api.post<{ personajes: Array<{ id: number; nombre: string; hp: number; hp_max: number }> }>(
        "/api/modules/personajes/action",
        { action: "editar", id: Number(accion.character_id), hp: Number(accion.hp) },
      );
      const p = res.personajes.find((x) => x.id === Number(accion.character_id));
      return {
        ok: true,
        mensaje: p ? `${p.nombre}: ${p.hp}/${p.hp_max} HP` : "HP actualizados",
      };
    }

    case "crear_nota": {
      const actual = await api.get<EstadoNotas>("/api/modules/notas/state");
      const texto = String(accion.texto || "").trim();
      if (!texto) throw new Error("La nota está vacía");
      const nuevo = actual.texto?.trim() ? `${actual.texto.trim()}\n\n- ${texto}` : `- ${texto}`;
      await api.post("/api/modules/notas/action", { action: "guardar", texto: nuevo });
      return { ok: true, mensaje: "Nota añadida al cuaderno del DM" };
    }

    case "redactar_npc": {
      const res = await api.post<{ texto: string; npc: { nombre: string }; proveedor: string }>(
        "/api/assistant/npc_text",
        { npc_id: Number(accion.npc_id), situacion: String(accion.situacion || "") },
      );
      return { ok: true, mensaje: `${res.npc.nombre} (${res.proveedor}): ${res.texto}` };
    }

    default:
      throw new Error(`Acción no permitida: ${accion.action}`);
  }
}
