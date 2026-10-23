"use client";

import type { Escena, PresentacionEscena } from "@/components/SceneBoard";

export const PROYECTOR_CANAL = "ttrpg-proyector";
export const PROYECTOR_STORAGE = "ttrpg_proyector_estado";
export const PANTALLA_CM_KEY = "ttrpg_pantalla_cm";

export interface EstadoProyector {
  escena: Escena | null;
  grid: { cols: number; rows: number };
  presentacion: PresentacionEscena;
  pantalla_cm: number;
  ts: number;
}

export function leerPantallaCm(): number {
  try {
    const valor = Number(localStorage.getItem(PANTALLA_CM_KEY));
    return Number.isFinite(valor) && valor > 0 ? valor : 0;
  } catch {
    return 0;
  }
}

export function guardarPantallaCm(cm: number): void {
  try {
    if (cm > 0) localStorage.setItem(PANTALLA_CM_KEY, String(cm));
    else localStorage.removeItem(PANTALLA_CM_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

export function publicarProyector(estado: Omit<EstadoProyector, "ts">): void {
  const payload: EstadoProyector = { ...estado, ts: Date.now() };
  try {
    localStorage.setItem(PROYECTOR_STORAGE, JSON.stringify(payload));
  } catch {
    /* el estado sigue yendo por BroadcastChannel/API */
  }
  try {
    const canal = new BroadcastChannel(PROYECTOR_CANAL);
    canal.postMessage(payload);
    canal.close();
  } catch {
    /* navegador sin BroadcastChannel: queda el polling de la API */
  }
}

export function leerProyectorLocal(): EstadoProyector | null {
  try {
    const crudo = localStorage.getItem(PROYECTOR_STORAGE);
    if (!crudo) return null;
    const datos = JSON.parse(crudo) as EstadoProyector;
    if (!datos?.presentacion || !datos?.grid) return null;
    return datos;
  } catch {
    return null;
  }
}

export function escucharProyector(callback: (estado: EstadoProyector) => void): () => void {
  let canal: BroadcastChannel | null = null;
  const alRecibir = (valor: unknown) => {
    if (!valor || typeof valor !== "object") return;
    const estado = valor as EstadoProyector;
    if (estado.presentacion && estado.grid) callback(estado);
  };
  try {
    canal = new BroadcastChannel(PROYECTOR_CANAL);
    canal.onmessage = (evento) => alRecibir(evento.data);
  } catch {
    canal = null;
  }
  const porStorage = (evento: StorageEvent) => {
    if (evento.key !== PROYECTOR_STORAGE || !evento.newValue) return;
    try {
      alRecibir(JSON.parse(evento.newValue));
    } catch {
      /* JSON inválido */
    }
  };
  window.addEventListener("storage", porStorage);
  return () => {
    canal?.close();
    window.removeEventListener("storage", porStorage);
  };
}
