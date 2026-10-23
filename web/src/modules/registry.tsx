"use client";

import type { ComponentType } from "react";
import type { ModuleMetaApi } from "@/lib/types";
import type { ModuleProps } from "./types";
import { RelojModule } from "./RelojModule";
import { NotasModule } from "./NotasModule";
import { EstadoModule } from "./EstadoModule";
import { DadoModule } from "./DadoModule";
import { InventarioModule } from "./InventarioModule";
import { ReglasModule } from "./ReglasModule";
import { EscenarioModule } from "./EscenarioModule";
import { EscenariosModule } from "./EscenariosModule";
import { ProyectorModule } from "./ProyectorModule";
import { SonidoModule } from "./SonidoModule";
import { PersonajesModule } from "./PersonajesModule";
import { NpcsModule } from "./NpcsModule";
import { PartidasModule } from "./PartidasModule";
import { AsistenteModule } from "./AsistenteModule";
import { MiniBaseModule } from "./MiniBaseModule";
import { BibliotecaModule } from "./BibliotecaModule";
import { EditorModule } from "./EditorModule";

export interface ModuleDef extends ModuleMetaApi {
  Component: ComponentType<ModuleProps>;
}

/**
 * Registro gemelo de `api/registry.py`. Es la fuente de verdad del render:
 * ninguna pantalla importa módulos directamente, todas se resuelven aquí.
 */
const DEFINICIONES: Array<ModuleDef> = [
  {
    id: "reloj", nombre: "Reloj de mesa", icono: "🕰️",
    descripcion: "Hora local, fecha y duración de la sesión.",
    slot: "lateral", overlay: false, singleton: true, Component: RelojModule,
  },
  {
    id: "notas", nombre: "Notas del DM", icono: "📝",
    descripcion: "Cuaderno persistente de la partida, visible para la IA.",
    slot: "inferior", overlay: false, singleton: true, Component: NotasModule,
  },
  {
    id: "estado", nombre: "Estado de partida", icono: "📊",
    descripcion: "Resumen vivo: escena, reglas, personajes y última tirada.",
    slot: "lateral", overlay: false, singleton: true, Component: EstadoModule,
  },
  {
    id: "dado", nombre: "Dados", icono: "🎲",
    descripcion: "Tiradas NdX±M con animación 2D/3D e historial autoritativo.",
    slot: "principal", overlay: false, singleton: true, Component: DadoModule,
  },
  {
    id: "inventario", nombre: "Inventario", icono: "🎒",
    descripcion: "Secciones, items con emoji, detalle editable y búsqueda.",
    slot: "principal", overlay: false, singleton: true, Component: InventarioModule,
  },
  {
    id: "reglas", nombre: "Núcleos de reglas", icono: "🧬",
    descripcion: "Mezcla d20 + ventaja + Mythic + spawn y rulesets guardados.",
    slot: "principal", overlay: false, singleton: true, Component: ReglasModule,
  },
  {
    id: "escenario", nombre: "Escenario activo", icono: "🗺️",
    descripcion: "Tablero 12×9 con tokens, luz y tokens movibles por clic.",
    slot: "principal", overlay: false, singleton: true, Component: EscenarioModule,
  },
  {
    id: "escenarios", nombre: "Escenarios", icono: "🎭",
    descripcion: "Catálogo de escenas, edición, activación y playlist.",
    slot: "lateral", overlay: false, singleton: true, Component: EscenariosModule,
  },
  {
    id: "proyector", nombre: "Proyector", icono: "📺",
    descripcion: "Vista a pantalla completa de la escena activa para el segundo monitor.",
    slot: "principal", overlay: false, singleton: true, Component: ProyectorModule,
  },
  {
    id: "sonido", nombre: "Sonido ambiente", icono: "🔊",
    descripcion: "Biblioteca de sonidos, volumen, loop y crossfade por escena.",
    slot: "overlay", overlay: true, singleton: true, Component: SonidoModule,
  },
  {
    id: "personajes", nombre: "Personajes y criaturas", icono: "🧙",
    descripcion: "Fichas editables con HP, stats libres y envío al tablero.",
    slot: "lateral", overlay: false, singleton: true, Component: PersonajesModule,
  },
  {
    id: "npcs", nombre: "NPCs", icono: "💬",
    descripcion: "Voces, tonos y frases; redacción de textos NPC con IA.",
    slot: "lateral", overlay: false, singleton: true, Component: NpcsModule,
  },
  {
    id: "partidas", nombre: "Partidas guardadas", icono: "💾",
    descripcion: "Snapshots completos, carga, borrado y export/import JSON.",
    slot: "principal", overlay: false, singleton: true, Component: PartidasModule,
  },
  {
    id: "asistente", nombre: "Asistente IA", icono: "✨",
    descripcion: "Chat DM que lee todo el contexto y propone acciones ejecutables.",
    slot: "overlay", overlay: true, singleton: true, Component: AsistenteModule,
  },
  {
    id: "minibase", nombre: "MiniBase", icono: "🧩",
    descripcion: "Búsqueda e importación opcional de minis reales (fase M9, read-only).",
    slot: "lateral", overlay: false, singleton: true, Component: MiniBaseModule,
  },
  {
    id: "biblioteca", nombre: "Biblioteca TTRPG", icono: "📚",
    descripcion: "Fichas de sistemas, wargames, literatura y documentos; sistema activo y generadores Mythic.",
    slot: "principal", overlay: false, singleton: true, Component: BibliotecaModule,
  },
  {
    id: "editor", nombre: "Editor de pantallas", icono: "🧰",
    descripcion: "Añade, quita o superpone módulos; el layout persiste en SQLite.",
    slot: "overlay", overlay: true, singleton: true, Component: EditorModule,
  },
];

export const MODULES_REGISTRY: Record<string, ModuleDef> = Object.fromEntries(
  DEFINICIONES.map((m) => [m.id, m]),
);

export const MODULE_LIST = DEFINICIONES;

export function getModule(id: string): ModuleDef | null {
  return MODULES_REGISTRY[id] ?? null;
}

export const OVERLAY_MODULES = DEFINICIONES.filter((m) => m.overlay);
