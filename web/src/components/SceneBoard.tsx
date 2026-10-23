"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/format";

export interface TokenEscena {
  id: string;
  nombre: string;
  emoji: string;
  x: number;
  y: number;
  color?: string;
  character_id?: number | null;
  external_key?: string;
}

export interface Escena {
  id: number;
  nombre: string;
  descripcion: string;
  bg: string;
  light: { color: string; opacity: number };
  tokens: TokenEscena[];
  playlist: number[];
  presentacion?: PresentacionEscena;
  activo: boolean;
  ts: string;
}

export interface PresentacionEscena {
  mapa_url: string;
  zoom: number;
  rotacion: number;
  pan_x: number;
  pan_y: number;
  grid_visible: boolean;
  grid_cm: number;
  grid_color: string;
  grid_opacity: number;
}

export const PRESENTACION_VACIA: PresentacionEscena = {
  mapa_url: "",
  zoom: 1,
  rotacion: 0,
  pan_x: 0,
  pan_y: 0,
  grid_visible: true,
  grid_cm: 2.5,
  grid_color: "#22ff88",
  grid_opacity: 0.6,
};

export function fondo(valor: string): CSSProperties {
  if (!valor) return { background: "#101522" };
  if (/^(#|rgb|hsl|linear-gradient|radial-gradient|conic-gradient|url\()/i.test(valor.trim())) {
    return { background: valor };
  }
  return { backgroundColor: valor };
}

export function SceneBoard({
  escena,
  grid,
  selectedId,
  onTokenClick,
  onCellClick,
  readonly = false,
  showGrid = true,
  className,
}: {
  escena: Escena;
  grid: { cols: number; rows: number };
  selectedId?: string | null;
  onTokenClick?: (token: TokenEscena) => void;
  onCellClick?: (x: number, y: number) => void;
  readonly?: boolean;
  showGrid?: boolean;
  className?: string;
}) {
  const cols = grid?.cols || 12;
  const rows = grid?.rows || 9;
  const opacidad = Math.max(0, Math.min(0.9, escena.light?.opacity ?? 0.18));

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-xl border border-line",
        !readonly && onCellClick && "cursor-crosshair",
        className,
      )}
      style={{ aspectRatio: `${cols} / ${rows}`, ...fondo(escena.bg) }}
      onClick={(e) => {
        if (readonly || !onCellClick) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = Math.min(cols - 1, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * cols)));
        const y = Math.min(rows - 1, Math.max(0, Math.floor(((e.clientY - rect.top) / rect.height) * rows)));
        onCellClick(x, y);
      }}
    >
      {showGrid ? (
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.55) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.55) 1px, transparent 1px)",
            backgroundSize: `${100 / cols}% ${100 / rows}%`,
          }}
        />
      ) : null}

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 35%, ${escena.light?.color || "#f5b544"}${Math.round(
            opacidad * 255,
          ).toString(16).padStart(2, "0")} 0%, transparent 68%)`,
          mixBlendMode: "screen",
        }}
      />

      {escena.tokens.map((token) => {
        const x = ((token.x + 0.5) / cols) * 100;
        const y = ((token.y + 0.5) / rows) * 100;
        const seleccionado = selectedId === token.id;
        return (
          <button
            key={token.id}
            type="button"
            title={`${token.nombre} (${token.x}, ${token.y})`}
            onClick={(e) => {
              e.stopPropagation();
              onTokenClick?.(token);
            }}
            className={cn(
              "absolute z-10 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-lg shadow-lg transition-transform",
              "hover:scale-110 focus:outline-none focus:ring-2 focus:ring-gold",
              seleccionado ? "scale-110 border-gold ring-2 ring-gold/70" : "border-white/60",
            )}
            style={{
              left: `${x}%`,
              top: `${y}%`,
              backgroundColor: token.color ? `${token.color}33` : "rgba(8,10,15,0.72)",
              boxShadow: seleccionado ? "0 0 22px rgba(245,181,68,0.55)" : undefined,
            }}
          >
            <span className="drop-shadow">{token.emoji}</span>
          </button>
        );
      })}

      {!escena.tokens.length ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-white/50 backdrop-blur">
            Escena sin tokens
          </p>
        </div>
      ) : null}

      <div className="pointer-events-none absolute left-2 top-2 flex gap-1">
        <span className="rounded-md border border-white/15 bg-black/45 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white/70 backdrop-blur">
          {cols}×{rows}
        </span>
        <span className="rounded-md border border-white/15 bg-black/45 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white/70 backdrop-blur">
          {escena.tokens.length} tokens
        </span>
      </div>
    </div>
  );
}
