"use client";

import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { API_URL } from "@/lib/api";
import type { EfectoEscena } from "./SceneBoard";

function urlEfecto(valor: string): string {
  if (!valor) return "";
  if (/^(https?:|data:|blob:)/i.test(valor)) return valor;
  return `${API_URL}${valor.startsWith("/") ? "" : "/"}${valor}`;
}

function fondoPatron(efecto: EfectoEscena): CSSProperties {
  const a = efecto.color;
  const b = efecto.color2;
  switch (efecto.patron) {
    case "conico":
      return {
        background: `conic-gradient(from 0deg, transparent 0deg, ${a} 35deg, ${b} 95deg, transparent 150deg, transparent 210deg, ${a} 260deg, ${b} 315deg, transparent 360deg)`,
      };
    case "lineal":
      return {
        background: `linear-gradient(115deg, transparent 5%, ${a} 35%, ${b} 65%, transparent 95%)`,
      };
    case "ondas":
      return {
        background:
          `radial-gradient(ellipse at 22% 60%, ${a} 0%, transparent 45%), ` +
          `radial-gradient(ellipse at 72% 28%, ${b} 0%, transparent 48%), ` +
          `radial-gradient(ellipse at 55% 82%, ${a} 0%, transparent 44%)`,
      };
    default:
      return {
        background: `radial-gradient(circle at 50% 50%, ${a} 0%, ${b}88 38%, transparent 72%)`,
      };
  }
}

function estiloAnimacion(efecto: EfectoEscena): CSSProperties | undefined {
  if (efecto.animacion === "ninguna") return undefined;
  const duracion = Math.max(1.8, 9 / Math.max(0.1, efecto.velocidad));
  return {
    animationName: `ttrpg-${efecto.animacion}`,
    animationDuration: `${duracion.toFixed(2)}s`,
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
    animationDirection: efecto.animacion === "rotar" ? "normal" : "alternate",
    animationFillMode: "both",
    transformOrigin: "center",
    willChange: "transform, opacity",
  };
}

export function ProjectorEffect({
  efecto,
  interactivo = false,
  seleccionado = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  efecto: EfectoEscena;
  interactivo?: boolean;
  seleccionado?: boolean;
  onPointerDown?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (e: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const esTextura = efecto.tipo === "textura";

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.playbackRate = Math.max(0.1, Math.min(5, efecto.velocidad));
    void videoRef.current.play().catch(() => {
      /* el navegador puede bloquear el autoplay hasta la interacción */
    });
  }, [efecto.url, efecto.velocidad]);

  if (!efecto.visible) return null;
  if (esTextura && !efecto.url) return null;

  return (
    <div
      title={`${efecto.nombre}${interactivo ? " · arrastra para mover" : ""}`}
      onPointerDown={interactivo ? onPointerDown : undefined}
      onPointerMove={interactivo ? onPointerMove : undefined}
      onPointerUp={interactivo ? onPointerUp : undefined}
      onPointerCancel={interactivo ? onPointerUp : undefined}
      className={interactivo ? "absolute touch-none" : "pointer-events-none absolute"}
      style={{
        left: `${efecto.x}%`,
        top: `${efecto.y}%`,
        width: `${efecto.ancho}%`,
        height: `${efecto.alto}%`,
        transform: `translate(-50%, -50%) rotate(${efecto.rotacion}deg)`,
        opacity: efecto.opacidad,
        mixBlendMode: efecto.mezcla,
        filter: efecto.suavizado > 0 ? `blur(${efecto.suavizado}px)` : undefined,
        cursor: interactivo ? "move" : undefined,
        pointerEvents: interactivo ? "auto" : "none",
        zIndex: efecto.encima_tokens ? 25 : 15,
        outline: seleccionado ? "2px solid rgba(245,181,68,0.95)" : undefined,
        outlineOffset: 4,
        boxShadow: seleccionado ? "0 0 24px rgba(245,181,68,0.45)" : undefined,
      }}
    >
      <div className="h-full w-full" style={estiloAnimacion(efecto)}>
        {esTextura ? (
          efecto.tipo_archivo === "video" ? (
            <video
              ref={videoRef}
              src={urlEfecto(efecto.url)}
              autoPlay
              loop
              muted
              playsInline
              draggable={false}
              className="h-full w-full"
              style={{ objectFit: efecto.ajuste }}
            />
          ) : (
            <img
              src={urlEfecto(efecto.url)}
              alt=""
              draggable={false}
              className="h-full w-full"
              style={{ objectFit: efecto.ajuste }}
            />
          )
        ) : (
          <div className="h-full w-full" style={fondoPatron(efecto)} />
        )}
      </div>
    </div>
  );
}
