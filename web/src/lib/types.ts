export type Slot = "principal" | "lateral" | "inferior" | "overlay";

export interface Instancia {
  id: number;
  screen_id: number;
  module_id: string;
  slot: Slot;
  orden: number;
  props: Record<string, unknown>;
  collapsed: boolean;
  ts: string;
}

export interface Pantalla {
  id: number;
  nombre: string;
  slug: string;
  orden: number;
  layout: Record<string, number[]>;
  ts: string;
}

export interface PantallaData {
  pantalla: Pantalla;
  instancias: Instancia[];
  modulos: ModuleMetaApi[];
  slots: Slot[];
}

export interface ModuleMetaApi {
  id: string;
  nombre: string;
  icono: string;
  descripcion: string;
  slot: Slot;
  overlay: boolean;
  singleton: boolean;
}

export interface Tirada {
  id: number;
  expr: string;
  tiradas: number[];
  mod: number;
  total: number;
  razon: string;
  modo: string;
  personaje: string;
  ts: string;
}

export interface AccionIA {
  action: string;
  [key: string]: unknown;
}

export interface ContextoResumen {
  escena: string | null;
  ultima_tirada: string | null;
  personajes: number;
  items: number;
}
