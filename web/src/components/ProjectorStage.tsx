"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { API_URL } from "@/lib/api";
import { cn } from "@/lib/format";
import { ProjectorEffect } from "./ProjectorEffects";
import { fondo, type Escena, type EfectoEscena, type PresentacionEscena, type TokenEscena } from "./SceneBoard";

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
  efectosEditables = false,
  tokensEditables = false,
  efectoSeleccionado = null,
  onSeleccionarEfecto,
  onMoverEfecto,
  onMoverToken,
  className,
}: {
  escena: Escena;
  presentacion: PresentacionEscena;
  grid?: { cols: number; rows: number };
  pantallaCm?: number;
  mostrarTokens?: boolean;
  mostrarRejilla?: boolean;
  efectosEditables?: boolean;
  tokensEditables?: boolean;
  efectoSeleccionado?: string | null;
  onSeleccionarEfecto?: (id: string) => void;
  onMoverEfecto?: (id: string, x: number, y: number) => void;
  onMoverToken?: (token: TokenEscena, x: number, y: number) => void;
  className?: string;
}) {
  const cajaRef = useRef<HTMLDivElement>(null);
  const [medidas, setMedidas] = useState({ w: 0, h: 0 });
  const [anchoPantalla, setAnchoPantalla] = useState(0);
  const [aspectoMapa, setAspectoMapa] = useState<number | null>(null);
  const dragEfectoRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    w: number;
    h: number;
    anclado: boolean;
    zoom: number;
    rotacion: number;
  } | null>(null);
  const dragTokenRef = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    movido: boolean;
  } | null>(null);
  const [arrastreToken, setArrastreToken] = useState<{ id: string; x: number; y: number } | null>(null);

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
  const efectos = presentacion.efectos ?? [];
  // Las capas ancladas al recuadro del mapa se pintan dentro de su caja
  // transformada: viajan con el zoom, la rotación y el paneo de la imagen.
  const efectosLibres = efectos.filter((e) => !e.anclado_mapa);
  const efectosAnclados = efectos.filter((e) => e.anclado_mapa && !e.encima_tokens);
  const efectosAncladosEncima = efectos.filter((e) => e.anclado_mapa && e.encima_tokens);

  function iniciarArrastreEfecto(e: ReactPointerEvent<HTMLDivElement>, efecto: EfectoEscena) {
    if (!efectosEditables) return;
    e.stopPropagation();
    e.preventDefault();
    onSeleccionarEfecto?.(efecto.id);
    if (!onMoverEfecto) return;
    const rect = cajaRef.current?.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    // Las capas ancladas viven dentro de la caja del mapa (anchoMapa×altoMapa)
    // con la transformación puesta, así que el arrastre se deshace en ese
    // espacio local; las libres se calculan sobre el lienzo completo.
    dragEfectoRef.current = {
      id: efecto.id,
      startX: e.clientX,
      startY: e.clientY,
      baseX: efecto.x,
      baseY: efecto.y,
      w: efecto.anclado_mapa ? anchoMapa || 1 : rect?.width || 1,
      h: efecto.anclado_mapa ? altoMapa || 1 : rect?.height || 1,
      anclado: Boolean(efecto.anclado_mapa),
      zoom,
      rotacion,
    };
  }

  function moverArrastreEfecto(e: ReactPointerEvent<HTMLDivElement>) {
    const inicio = dragEfectoRef.current;
    if (!inicio || !onMoverEfecto) return;
    e.stopPropagation();
    const dx = e.clientX - inicio.startX;
    const dy = e.clientY - inicio.startY;
    let movidoX = dx;
    let movidoY = dy;
    if (inicio.anclado) {
      // Quitar la rotación y el zoom de la capa para medir en su espacio local.
      const rad = (-inicio.rotacion * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      movidoX = (dx * cos - dy * sin) / Math.max(0.01, inicio.zoom);
      movidoY = (dx * sin + dy * cos) / Math.max(0.01, inicio.zoom);
    }
    const x = Math.max(0, Math.min(100, inicio.baseX + (movidoX / inicio.w) * 100));
    const y = Math.max(0, Math.min(100, inicio.baseY + (movidoY / inicio.h) * 100));
    onMoverEfecto(inicio.id, x, y);
  }

  function soltarArrastreEfecto(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragEfectoRef.current) return;
    e.stopPropagation();
    dragEfectoRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  /**
   * Convierte un punto del puntero en celda del tablero invirtiendo la
   * transformación del mapa (pan + rotación + zoom). Así el token cae donde
   * apunta el ratón aunque la imagen esté girada o ampliada.
   */
  function celdaDesdePunto(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = cajaRef.current?.getBoundingClientRect();
    if (!rect || !anchoMapa || !altoMapa || !medidas.w || !medidas.h) return null;
    const dx = clientX - rect.left - medidas.w / 2 - (panX / 100) * medidas.w;
    const dy = clientY - rect.top - medidas.h / 2 - (panY / 100) * medidas.h;
    const rad = (-rotacion * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const lx = (dx * cos - dy * sin) / Math.max(0.01, zoom) + anchoMapa / 2;
    const ly = (dx * sin + dy * cos) / Math.max(0.01, zoom) + altoMapa / 2;
    const cols = grid.cols || 12;
    const rows = grid.rows || 9;
    return {
      x: Math.min(cols - 1, Math.max(0, Math.floor((lx / anchoMapa) * cols))),
      y: Math.min(rows - 1, Math.max(0, Math.floor((ly / altoMapa) * rows))),
    };
  }

  function tokenPointerDown(e: ReactPointerEvent<HTMLSpanElement>, token: TokenEscena) {
    if (!tokensEditables || !onMoverToken || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragTokenRef.current = {
      id: token.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      movido: false,
    };
    setArrastreToken(null);
  }

  function tokenPointerMove(e: ReactPointerEvent<HTMLSpanElement>, token: TokenEscena) {
    const inicio = dragTokenRef.current;
    if (!inicio || inicio.id !== token.id || inicio.pointerId !== e.pointerId) return;
    e.stopPropagation();
    if (!inicio.movido) {
      if (Math.hypot(e.clientX - inicio.startX, e.clientY - inicio.startY) < 5) return;
      inicio.movido = true;
    }
    const celda = celdaDesdePunto(e.clientX, e.clientY);
    if (celda) setArrastreToken({ id: token.id, x: celda.x, y: celda.y });
  }

  function tokenPointerUp(e: ReactPointerEvent<HTMLSpanElement>, token: TokenEscena) {
    const inicio = dragTokenRef.current;
    if (!inicio || inicio.id !== token.id) return;
    e.stopPropagation();
    dragTokenRef.current = null;
    const celda = celdaDesdePunto(e.clientX, e.clientY);
    setArrastreToken(null);
    if (inicio.movido && celda) onMoverToken?.(token, celda.x, celda.y);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  function tokenPointerCancel() {
    dragTokenRef.current = null;
    setArrastreToken(null);
  }

  /** Capa transformada idéntica a la del mapa para las capas ancladas. */
  function capaAnclada(lista: EfectoEscena[], zIndex: number) {
    return (
      <div
        className="pointer-events-none absolute"
        style={{
          left: leftMapa, top: topMapa, width: anchoMapa, height: altoMapa,
          transform, transformOrigin: "center", willChange: "transform", zIndex,
        }}
      >
        {lista.map((efecto) => (
          <ProjectorEffect
            key={efecto.id}
            efecto={efecto}
            interactivo={efectosEditables}
            seleccionado={efectoSeleccionado === efecto.id}
            onPointerDown={(e) => iniciarArrastreEfecto(e, efecto)}
            onPointerMove={moverArrastreEfecto}
            onPointerUp={soltarArrastreEfecto}
          />
        ))}
      </div>
    );
  }

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

      {efectosLibres.map((efecto) => (
        <ProjectorEffect
          key={efecto.id}
          efecto={efecto}
          interactivo={efectosEditables}
          seleccionado={efectoSeleccionado === efecto.id}
          onPointerDown={(e) => iniciarArrastreEfecto(e, efecto)}
          onPointerMove={moverArrastreEfecto}
          onPointerUp={soltarArrastreEfecto}
        />
      ))}

      {efectosAnclados.length ? capaAnclada(efectosAnclados, 15) : null}
      {efectosAncladosEncima.length ? capaAnclada(efectosAncladosEncima, 25) : null}

      {mostrarTokens && escena.tokens.length ? (
        <div
          className="pointer-events-none absolute z-20"
          style={{
            left: leftMapa, top: topMapa, width: anchoMapa, height: altoMapa,
            transform, transformOrigin: "center", willChange: "transform",
          }}
        >
          {escena.tokens.map((token) => {
            const editable = tokensEditables && Boolean(onMoverToken);
            const arrastrando = arrastreToken?.id === token.id ? arrastreToken : null;
            const x = ((arrastrando?.x ?? token.x) + 0.5) / (grid.cols || 12) * 100;
            const y = ((arrastrando?.y ?? token.y) + 0.5) / (grid.rows || 9) * 100;
            return (
              <span
                key={token.id}
                title={`${token.nombre} (${token.x}, ${token.y})${editable ? " · arrastra para mover" : ""}`}
                onPointerDown={editable ? (e) => tokenPointerDown(e, token) : undefined}
                onPointerMove={editable ? (e) => tokenPointerMove(e, token) : undefined}
                onPointerUp={editable ? (e) => tokenPointerUp(e, token) : undefined}
                onPointerCancel={editable ? tokenPointerCancel : undefined}
                className={cn(
                  "absolute flex items-center justify-center rounded-full border border-white/70 shadow-lg",
                  editable && "touch-none select-none",
                  arrastrando && "opacity-95 ring-2 ring-gold",
                )}
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  width: tamanoToken,
                  height: tamanoToken,
                  fontSize: Math.round(tamanoToken * 0.52),
                  backgroundColor: token.color ? `${token.color}33` : "rgba(8,10,15,0.72)",
                  transform: `translate(-50%, -50%) scale(${1 / zoom}) rotate(${-rotacion}deg)`,
                  boxShadow: "0 2px 10px rgba(0,0,0,0.55)",
                  pointerEvents: editable ? "auto" : undefined,
                  cursor: editable ? "grab" : undefined,
                }}
              >
                <span className="drop-shadow">{token.emoji}</span>
              </span>
            );
          })}

          {arrastreToken ? (
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-gold/80 bg-gold/10"
              style={{
                left: `${((arrastreToken.x + 0.5) / (grid.cols || 12)) * 100}%`,
                top: `${((arrastreToken.y + 0.5) / (grid.rows || 9)) * 100}%`,
                width: tamanoToken,
                height: tamanoToken,
                transform: `translate(-50%, -50%) scale(${1 / zoom}) rotate(${-rotacion}deg)`,
              }}
            />
          ) : null}
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
