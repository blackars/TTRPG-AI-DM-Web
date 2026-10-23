"use client";

import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
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

export type MezclaEfecto =
  | "normal"
  | "screen"
  | "overlay"
  | "soft-light"
  | "multiply"
  | "color-dodge"
  | "plus-lighter";

export type AnimacionEfecto = "ninguna" | "deriva" | "pulso" | "parpadeo" | "rotar";

export interface EfectoEscena {
  id: string;
  tipo: "luz" | "textura";
  nombre: string;
  url: string;
  tipo_archivo: "css" | "imagen" | "video";
  patron: "radial" | "conico" | "lineal" | "ondas";
  color: string;
  color2: string;
  x: number;
  y: number;
  ancho: number;
  alto: number;
  rotacion: number;
  opacidad: number;
  mezcla: MezclaEfecto;
  animacion: AnimacionEfecto;
  velocidad: number;
  suavizado: number;
  ajuste: "contain" | "cover" | "fill";
  encima_tokens: boolean;
  anclado_mapa: boolean;
  visible: boolean;
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
  efectos: EfectoEscena[];
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
  efectos: [],
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
  onTokenMove,
  onCellClick,
  readonly = false,
  showGrid = true,
  className,
}: {
  escena: Escena;
  grid: { cols: number; rows: number };
  selectedId?: string | null;
  onTokenClick?: (token: TokenEscena) => void;
  onTokenMove?: (token: TokenEscena, x: number, y: number) => void;
  onCellClick?: (x: number, y: number) => void;
  readonly?: boolean;
  showGrid?: boolean;
  className?: string;
}) {
  const cols = grid?.cols || 12;
  const rows = grid?.rows || 9;
  const opacidad = Math.max(0, Math.min(0.9, escena.light?.opacity ?? 0.18));
  const tableroRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    tokenId: string;
    pointerId: number;
    startX: number;
    startY: number;
    movido: boolean;
  } | null>(null);
  const [arrastre, setArrastre] = useState<{ id: string; x: number; y: number } | null>(null);

  function celdaDesdePunto(clientX: number, clientY: number): { x: number; y: number } {
    const rect = tableroRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return { x: 0, y: 0 };
    return {
      x: Math.min(cols - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * cols))),
      y: Math.min(rows - 1, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * rows))),
    };
  }

  function tokenPointerDown(e: ReactPointerEvent<HTMLButtonElement>, token: TokenEscena) {
    if (readonly || !onTokenMove || e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      tokenId: token.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      movido: false,
    };
    setArrastre(null);
  }

  function tokenPointerMove(e: ReactPointerEvent<HTMLButtonElement>, token: TokenEscena) {
    const inicio = dragRef.current;
    if (!inicio || inicio.tokenId !== token.id || inicio.pointerId !== e.pointerId) return;
    if (!inicio.movido) {
      if (Math.hypot(e.clientX - inicio.startX, e.clientY - inicio.startY) < 5) return;
      inicio.movido = true;
    }
    const { x, y } = celdaDesdePunto(e.clientX, e.clientY);
    setArrastre({ id: token.id, x, y });
  }

  function tokenPointerUp(e: ReactPointerEvent<HTMLButtonElement>, token: TokenEscena) {
    const inicio = dragRef.current;
    if (!inicio || inicio.tokenId !== token.id) return;
    e.stopPropagation();
    dragRef.current = null;
    const { x, y } = celdaDesdePunto(e.clientX, e.clientY);
    setArrastre(null);
    if (inicio.movido) onTokenMove?.(token, x, y);
    else onTokenClick?.(token);
  }

  function tokenPointerCancel() {
    dragRef.current = null;
    setArrastre(null);
  }

  return (
    <div
      ref={tableroRef}
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
        const arrastrando = arrastre?.id === token.id ? arrastre : null;
        const x = ((arrastrando?.x ?? token.x) + 0.5) / cols * 100;
        const y = ((arrastrando?.y ?? token.y) + 0.5) / rows * 100;
        const seleccionado = selectedId === token.id;
        return (
          <button
            key={token.id}
            type="button"
            draggable={false}
            title={`${token.nombre} (${token.x}, ${token.y}) · arrastra para mover`}
            onPointerDown={(e) => tokenPointerDown(e, token)}
            onPointerMove={(e) => tokenPointerMove(e, token)}
            onPointerUp={(e) => tokenPointerUp(e, token)}
            onPointerCancel={tokenPointerCancel}
            onClick={(e) => {
              e.stopPropagation();
              // Teclado: Enter/Espacio. El puntero se gestiona en pointerup
              // para poder distinguir un clic de un arrastre.
              if (e.detail === 0 || !onTokenMove) onTokenClick?.(token);
            }}
            className={cn(
              "absolute z-10 flex h-9 w-9 touch-none -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-lg shadow-lg transition-transform",
              "hover:scale-110 focus:outline-none focus:ring-2 focus:ring-gold",
              onTokenMove ? "cursor-grab active:cursor-grabbing" : "",
              arrastrando ? "scale-110 opacity-95" : "",
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

      {arrastre ? (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-gold/80 bg-gold/10"
          style={{
            left: `${((arrastre.x + 0.5) / cols) * 100}%`,
            top: `${((arrastre.y + 0.5) / rows) * 100}%`,
            width: 36,
            height: 36,
          }}
        />
      ) : null}

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
