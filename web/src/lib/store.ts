"use client";

import { create } from "zustand";

type TipoToast = "ok" | "error";

interface AppStore {
  tick: number;
  bump: () => void;
  apiOnline: boolean | null;
  setApiOnline: (online: boolean) => void;
  selectedCharacterId: number | null;
  setSelectedCharacter: (id: number | null) => void;
  openPanels: Record<string, boolean>;
  togglePanel: (id: string) => void;
  setPanel: (id: string, abierto: boolean) => void;
  toast: { id: number; texto: string; tipo: TipoToast } | null;
  notify: (texto: string, tipo?: TipoToast) => void;
  audioMuted: boolean;
  setAudioMuted: (muted: boolean) => void;
  masterVolume: number;
  setMasterVolume: (volumen: number) => void;
  audioReady: boolean;
  setAudioReady: (listo: boolean) => void;
}

let toastSeq = 0;

export const useAppStore = create<AppStore>((set) => ({
  tick: 0,
  bump: () => set((s) => ({ tick: s.tick + 1 })),
  apiOnline: null,
  setApiOnline: (apiOnline) => set({ apiOnline }),
  selectedCharacterId: null,
  setSelectedCharacter: (selectedCharacterId) => set({ selectedCharacterId }),
  openPanels: { asistente: false, sonido: false, editor: false },
  togglePanel: (id) =>
    set((s) => ({ openPanels: { ...s.openPanels, [id]: !s.openPanels[id] } })),
  setPanel: (id, abierto) =>
    set((s) => ({ openPanels: { ...s.openPanels, [id]: abierto } })),
  toast: null,
  notify: (texto, tipo = "ok") => {
    const id = ++toastSeq;
    set({ toast: { id, texto, tipo } });
    setTimeout(() => {
      set((s) => (s.toast?.id === id ? { toast: null } : s));
    }, 4200);
  },
  audioMuted: false,
  setAudioMuted: (audioMuted) => set({ audioMuted }),
  masterVolume: 0.75,
  setMasterVolume: (masterVolume) => set({ masterVolume }),
  audioReady: false,
  setAudioReady: (audioReady) => set({ audioReady }),
}));
