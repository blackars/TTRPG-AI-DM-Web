"use client";

import { useEffect, useRef, useState } from "react";
import { API_URL } from "@/lib/api";
import { cn } from "@/lib/format";
import { fondo, type Escena, type PresentacionEscena } from "./SceneBoard";

const PX_POR_CM_96DPI = 96 / 2.54;

function urlMapa(valor: string): string {
  if (!valor) return "";
  if (/^(https?:|data:|blob:)/i.test(valor)) return valor;
  return `${API_URL}${valor.startsWith("/") ? "" : "/"}${valor}`;
}

/**
 * Lienzo del proyector: mapa, luz ambiental, tokens y rejilla física.
 *
 * La imagen y los tokens viven en la capa transformable (zoom, rotación,
 * paneo); la rejilla queda fija sobre la pantalla para poder ajustar su
 * tamaño real en centímetros sin que el zoom de la imagen la deforme.
 */
export function ProjectorStage({
  escena,
  presentacion,
  grid = { cols: 12, rows: 9 },
  pantallaCm = 0,
  mostrarTokens = true,
  mostrarRejilla = true,
  className,
}: {
  escena: Escena;
  presentacion: PresentacionEscena;
  grid?: { cols: number; rows: number };
  pantallaCm?: number;
  mostrarTokens?: boolean;
  mostrarRejilla?: boolean;
  className?: string;
}) {
  const cajaRef = useRef<HTMLDivElement>(null);
  const [medidas, setMedidas] = useState({ w: 0, h: 0 });
  const [anchoPantalla, setAnchoPantalla] = useState(0);
  const [aspectoMapa, setAspectoMapa] = useState<number | null>(null);

  useEffect(() => {
    const caja = cajaRef.current;
    if (!caja) return;
    const medir = () => setMedidas({ w: caja.clientWidth, h: caja.clientHeight });
    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(caja);
    window.addEventListener("resize", medir);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, []);

  useEffect(() => {
    const medirPantalla = () => setAnchoPantalla(window.screen.width);
    medirPantalla();
    window.addEventListener("resize", medirPantalla);
    return () => window.removeEventListener("resize", medirPantalla);
  }, []);

  const mapa = urlMapa(presentacion.mapa_url);
  useEffect(() => {
    setAspectoMapa(null);
  }, [mapa]);

  const zoom = Math.max(0.2, Math.min(8, presentacion.zoom || 1));
  const rotacion = presentacion.rotacion || 0;
  const panX = presentacion.pan_x || 0;
  const panY = presentacion.pan_y || 0;
  const transform = `translate(${(panX / 100) * medidas.w}px, ${(panY / 100) * medidas.h}px) rotate(${rotacion}deg) scale(${zoom})`;

  // Caja del contenido: respeta la proporción real de la imagen para que los
  // tokens queden sobre el mapa aunque el proyector tenga otro aspect ratio.
  const aspecto = mapa ? (aspectoMapa ?? (medidas.w / medidas.h || 16 / 9)) : medidas.w / medidas.h || 16 / 9;
  const anchoMapa = Math.min(medidas.w, medidas.h * aspecto);
  const altoMapa = anchoMapa / aspecto;
  const leftMapa = (medidas.w - anchoMapa) / 2;
  const topMapa = (medidas.h - altoMapa) / 2;

  // px/cm efectivos en ESTE lienzo. Si el lienzo es la pantalla completa,
  // coincide con la calibración; si es la vista previa, se reduce con ella.
  const pxPorCmPantalla =
    pantallaCm > 0 && anchoPantalla > 0 ? anchoPantalla / pantallaCm : PX_POR_CM_96DPI;
  const escala =
    anchoPantalla > 0 && medidas.w > 0 ? Math.min(1, medidas.w / anchoPantalla) : 0;
  const celdaPx = Math.max(0, (presentacion.grid_cm || 2.5) * pxPorCmPantalla * escala);
  const tamanoToken = Math.max(18, Math.min(64, (anchoMapa || medidas.w) / 26));
  const opacidadLuz = Math.max(0, Math.min(0.9, escena.light?.opacity ?? 0.18));
  const colorLuz = escena.light?.color || "#f5b544";
  const alfaLuz = Math.round(opacidadLuz * 255)
    .toString(16)
    .padStart(2, "0");

  return (
    <div
      ref={cajaRef}
      className={cn("relative h-full w-full select-none overflow-hidden bg-black", className)}
    >
      <div className="absolute inset-0" style={fondo(escena.bg)} />
      <div
        className="absolute"
        style={{
          left: leftMapa, top: topMapa, width: anchoMapa, height: altoMapa,
          transform, transformOrigin: "center", willChange: "transform",
        }}
      >
        {mapa ? (
          <img
            src={mapa}
            alt=""
            draggable={false}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth && img.naturalHeight) {
                setAspectoMapa(img.naturalWidth / img.naturalHeight);
              }
            }}
            className="pointer-events-none h-full w-full object-contain"
          />
        ) : null}
      </div>

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 35%, ${colorLuz}${alfaLuz} 0%, transparent 68%)`,
          mixBlendMode: "screen",
        }}
      />

      {presentacion.grid_visible && mostrarRejilla ? (
        <GridOverlay
          ancho={medidas.w}
          alto={medidas.h}
          celdaPx={celdaPx}
          color={presentacion.grid_color}
          opacidad={presentacion.grid_opacity}
        />
      ) : null}

      {mostrarTokens && escena.tokens.length ? (
        <div
          className="pointer-events-none absolute z-20"
          style={{
            left: leftMapa, top: topMapa, width: anchoMapa, height: altoMapa,
            transform, transformOrigin: "center", willChange: "transform",
          }}
        >
          {escena.tokens.map((token) => {
            const x = ((token.x + 0.5) / (grid.cols || 12)) * 100;
            const y = ((token.y + 0.5) / (grid.rows || 9)) * 100;
            return (
              <span
                key={token.id}
                title={`${token.nombre} (${token.x}, ${token.y})`}
                className="absolute flex items-center justify-center rounded-full border border-white/70 shadow-lg"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  width: tamanoToken,
                  height: tamanoToken,
                  fontSize: Math.round(tamanoToken * 0.52),
                  backgroundColor: token.color ? `${token.color}33` : "rgba(8,10,15,0.72)",
                  transform: `translate(-50%, -50%) scale(${1 / zoom}) rotate(${-rotacion}deg)`,
                  boxShadow: "0 2px 10px rgba(0,0,0,0.55)",
                }}
              >
                <span className="drop-shadow">{token.emoji}</span>
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function GridOverlay({
  ancho,
  alto,
  celdaPx,
  color,
  opacidad,
}: {
  ancho: number;
  alto: number;
  celdaPx: number;
  color: string;
  opacidad: number;
}) {
  if (!ancho || !alto || !celdaPx || celdaPx < 4) return null;
  const lineas = [];
  for (let x = 0; x <= ancho; x += celdaPx) {
    lineas.push(
      <line key={`v-${x}`} x1={x} y1={0} x2={x} y2={alto} stroke={color} strokeOpacity={opacidad} strokeWidth={1} />,
    );
  }
  for (let y = 0; y <= alto; y += celdaPx) {
    lineas.push(
      <line key={`h-${y}`} x1={0} y1={y} x2={ancho} y2={y} stroke={color} strokeOpacity={opacidad} strokeWidth={1} />,
    );
  }
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-10"
      width={ancho}
      height={alto}
      viewBox={`0 0 ${ancho} ${alto}`}
      aria-hidden
    >
      {lineas}
    </svg>
  );
}
