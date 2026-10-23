"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ProjectorStage } from "@/components/ProjectorStage";
import { PRESENTACION_VACIA, type PresentacionEscena } from "@/components/SceneBoard";
import { Badge, Button, Empty, ErrorBox, Field, Input, Switch } from "@/components/ui";
import { api, errorTexto } from "@/lib/api";
import { cn } from "@/lib/format";
import {
  guardarPantallaCm, leerPantallaCm, publicarProyector,
} from "@/lib/proyector";
import { useAppStore } from "@/lib/store";
import { useApi } from "@/lib/useApi";
import type { EscenariosData } from "./EscenarioModule";
import type { ModuleProps } from "./types";

const MAX_MAPA = 15 * 1024 * 1024;
const PX_POR_CM_96DPI = 96 / 2.54;

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.max(minimo, Math.min(maximo, valor));
}

function normalizarRotacion(valor: number): number {
  let grados = valor % 360;
  if (grados > 180) grados -= 360;
  if (grados < -180) grados += 360;
  return Math.round(grados);
}

function ubicarEnSegunda(ventana: Window): void {
  const gsd = (window as unknown as { getScreenDetails?: () => Promise<any> }).getScreenDetails;
  if (!gsd) return;
  void gsd()
    .then((detalles) => {
      const pantallas = Array.from(detalles?.screens ?? []) as any[];
      const segunda = pantallas.find((p) => !p.isPrimary) ?? pantallas[1];
      if (!segunda) return;
      ventana.moveTo(segunda.availLeft + 24, segunda.availTop + 24);
      ventana.resizeTo(Math.max(640, segunda.availWidth - 48), Math.max(480, segunda.availHeight - 96));
    })
    .catch(() => {
      /* el navegador puede pedir permiso o no soportar la API */
    });
}

export function ProyectorModule(_props: ModuleProps) {
  const { data, setData, error } = useApi<EscenariosData>("/api/modules/escenarios/state");
  const [presentacion, setPresentacion] = useState<PresentacionEscena | null>(null);
  const [pantallaCm, setPantallaCm] = useState(0);
  const [pantallaCmTexto, setPantallaCmTexto] = useState("");
  const [celdaTexto, setCeldaTexto] = useState("");
  const [guardado, setGuardado] = useState<"idle" | "guardando" | "guardado" | "error">("idle");
  const [subiendo, setSubiendo] = useState(false);
  const [abriendo, setAbriendo] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [arrastrandoMapa, setArrastrandoMapa] = useState(false);
  const timerRef = useRef<number | null>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number; w: number; h: number } | null>(null);
  const bump = useAppStore((s) => s.bump);
  const notify = useAppStore((s) => s.notify);

  const activa = data?.activa ?? null;

  useEffect(() => {
    const guardada = leerPantallaCm();
    setPantallaCm(guardada);
    setPantallaCmTexto(guardada ? String(guardada) : "");
  }, []);

  function fijarPresentacion(p: PresentacionEscena | null) {
    setPresentacion(p);
    setCeldaTexto(p ? String(p.grid_cm) : "");
  }

  useEffect(() => {
    if (!data) return;
    fijarPresentacion(data.activa?.presentacion ?? null);
    // Solo al cambiar de escena: los ajustes locales no deben ser pisados por
    // un refresco de fondo mientras el DM mueve los deslizadores.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.activa?.id]);

  useEffect(() => {
    if (!data || !data.activa || !presentacion) return;
    publicarProyector({
      escena: { ...data.activa, presentacion },
      grid: data.grid,
      presentacion,
      pantalla_cm: pantallaCm,
    });
  }, [data, presentacion, pantallaCm]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  function programarGuardado(p: PresentacionEscena) {
    if (!activa) return;
    const sceneId = activa.id;
    setErrorLocal(null);
    setGuardado("guardando");
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(async () => {
      try {
        await api.post("/api/modules/escenarios/action", {
          action: "set_presentacion",
          scene_id: sceneId,
          presentacion: p,
        });
        setGuardado("guardado");
      } catch (e) {
        setGuardado("error");
        setErrorLocal(errorTexto(e));
      }
    }, 420);
  }

  function actualizar(cambios: Partial<PresentacionEscena>) {
    if (!presentacion) return;
    const siguiente = { ...presentacion, ...cambios };
    setPresentacion(siguiente);
    programarGuardado(siguiente);
  }

  async function activar(id: number, nombre: string) {
    setAbriendo(true);
    setErrorLocal(null);
    try {
      const res = await api.post<EscenariosData>("/api/modules/escenarios/action", {
        action: "activar",
        id,
      });
      setData(res);
      fijarPresentacion(res.activa?.presentacion ?? PRESENTACION_VACIA);
      bump();
      notify(`Escena activa: ${nombre}`);
    } catch (e) {
      setErrorLocal(errorTexto(e));
    } finally {
      setAbriendo(false);
    }
  }

  async function subirMapa(archivo: File) {
    if (!activa) return;
    if (!archivo.type.startsWith("image/")) {
      notify("El mapa debe ser una imagen", "error");
      return;
    }
    if (archivo.size > MAX_MAPA) {
      notify("El mapa supera los 15 MB", "error");
      return;
    }
    setSubiendo(true);
    setErrorLocal(null);
    try {
      const formulario = new FormData();
      formulario.append("archivo", archivo);
      const res = await api.upload<EscenariosData>(`/api/escenarios/${activa.id}/mapa`, formulario);
      setData(res);
      fijarPresentacion(res.activa?.presentacion ?? PRESENTACION_VACIA);
      notify("Mapa cargado en la escena");
    } catch (e) {
      setErrorLocal(errorTexto(e));
    } finally {
      setSubiendo(false);
    }
  }

  async function quitarMapa() {
    if (!activa) return;
    if (!window.confirm("¿Quitar el mapa de esta escena?")) return;
    setSubiendo(true);
    setErrorLocal(null);
    try {
      const res = await api.del<EscenariosData>(`/api/escenarios/${activa.id}/mapa`);
      setData(res);
      fijarPresentacion(res.activa?.presentacion ?? PRESENTACION_VACIA);
      notify("Mapa retirado");
    } catch (e) {
      setErrorLocal(errorTexto(e));
    } finally {
      setSubiendo(false);
    }
  }

  function abrirProyector(enSegunda = false) {
    if (!activa || !presentacion || !data) return;
    publicarProyector({
      escena: { ...activa, presentacion },
      grid: data.grid,
      presentacion,
      pantalla_cm: pantallaCm,
    });
    const ventana = window.open(
      "/proyector",
      "ttrpg-proyector",
      "popup=yes,width=1280,height=800,left=80,top=80",
    );
    if (!ventana) {
      notify("El navegador bloqueó la ventana del proyector", "error");
      return;
    }
    if (enSegunda) ubicarEnSegunda(ventana);
    notify(
      enSegunda
        ? "Proyector abierto; arrástralo a la segunda pantalla y pulsa ⛶"
        : "Proyector abierto en una ventana aparte",
    );
  }

  function cambiarCalibracion(valor: string) {
    setPantallaCmTexto(valor);
    const numero = Number(valor);
    if (valor.trim() === "" || !Number.isFinite(numero) || numero <= 0) {
      setPantallaCm(0);
      guardarPantallaCm(0);
      return;
    }
    const cm = limitar(numero, 10, 400);
    setPantallaCm(cm);
    guardarPantallaCm(cm);
  }

  function normalizarCalibracion() {
    const numero = Number(pantallaCmTexto);
    const cm = Number.isFinite(numero) && numero > 0 ? limitar(numero, 10, 400) : 0;
    setPantallaCm(cm);
    setPantallaCmTexto(cm ? String(cm) : "");
    guardarPantallaCm(cm);
  }

  function cambiarCelda(texto: string) {
    setCeldaTexto(texto);
    const numero = Number(texto);
    if (texto.trim() !== "" && Number.isFinite(numero) && numero >= 0.4 && numero <= 10) {
      actualizar({ grid_cm: numero });
    }
  }

  function normalizarCelda() {
    if (!presentacion) return;
    const numero = Number(celdaTexto);
    const cm = Number.isFinite(numero) && numero > 0 ? limitar(numero, 0.4, 10) : presentacion.grid_cm;
    setCeldaTexto(String(cm));
    actualizar({ grid_cm: cm });
  }

  function panInicio(e: ReactPointerEvent<HTMLDivElement>) {
    if (!presentacion) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      x: e.clientX, y: e.clientY,
      panX: presentacion.pan_x, panY: presentacion.pan_y,
      w: rect.width || 1, h: rect.height || 1,
    };
  }

  function panMover(e: ReactPointerEvent<HTMLDivElement>) {
    const inicio = dragRef.current;
    if (!inicio) return;
    actualizar({
      pan_x: limitar(inicio.panX + ((e.clientX - inicio.x) / inicio.w) * 100, -100, 100),
      pan_y: limitar(inicio.panY + ((e.clientY - inicio.y) / inicio.h) * 100, -100, 100),
    });
  }

  function panFin() {
    dragRef.current = null;
  }

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-white/5" />;
  if (!activa || !presentacion) {
    return (
      <Empty
        icon="📺"
        title="Sin escena que proyectar"
        action={
          <Link href="/pantalla/escenas">
            <Button size="sm" variant="primary">Elegir escena</Button>
          </Link>
        }
      >
        Activa una escena para preparar su mapa, su rejilla y abrir la ventana del proyector.
      </Empty>
    );
  }

  const pxPorCm = pantallaCm > 0 && typeof window !== "undefined"
    ? window.screen.width / pantallaCm
    : PX_POR_CM_96DPI;
  const celdaPx = Math.round(presentacion.grid_cm * pxPorCm);
  const colorRejilla = /^#[0-9a-fA-F]{6}$/.test(presentacion.grid_color)
    ? presentacion.grid_color
    : "#22ff88";
  const estadoGuardado =
    guardado === "guardando" ? "Guardando…" :
    guardado === "guardado" ? "Guardado" :
    guardado === "error" ? "No se pudo guardar" : "";

  return (
    <div className="space-y-3">
      {errorLocal ? <ErrorBox>{errorLocal}</ErrorBox> : null}

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-[0.25em] text-slate-500">Sala de proyección</p>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl leading-tight text-slate-100">{activa.nombre}</h3>
            <Badge color="gold">EN VIVO</Badge>
            {estadoGuardado ? <span className="text-[10px] text-slate-500">{estadoGuardado}</span> : null}
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
            La ventana principal controla el mapa y la rejilla; el popup solo muestra el tablero.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="primary" onClick={() => abrirProyector(false)}>
            🪟 Proyectar
          </Button>
          <Button size="sm" variant="secondary" onClick={() => abrirProyector(true)}>
            📺 Pantalla 2
          </Button>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[350px_minmax(0,1fr)]">
        <div className="space-y-2.5">
          <section className="rounded-xl border border-line bg-white/[0.02] p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[9px] uppercase tracking-[0.22em] text-slate-500">Mapa de la escena</p>
              <Badge color={presentacion.mapa_url ? "green" : "slate"}>
                {presentacion.mapa_url ? "imagen" : "gradiente"}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <label className={cn(
                "inline-flex h-8 cursor-pointer items-center rounded-lg border px-3 text-xs font-medium transition-colors",
                "border-gold/60 bg-gold text-ink hover:bg-amber-300",
                subiendo && "pointer-events-none opacity-50",
              )}>
                {subiendo ? "Subiendo…" : "📷 Subir imagen"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                  className="hidden"
                  onChange={(e) => {
                    const archivo = e.target.files?.[0];
                    if (archivo) void subirMapa(archivo);
                    e.target.value = "";
                  }}
                />
              </label>
              {presentacion.mapa_url ? (
                <Button size="xs" variant="ghost" onClick={() => void quitarMapa()} disabled={subiendo}>
                  Quitar mapa
                </Button>
              ) : null}
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
              También puedes arrastrar una imagen sobre la vista previa. Se guarda en el servidor y se sirve al proyector.
            </p>
          </section>

          <section className="rounded-xl border border-line bg-white/[0.02] p-3">
            <p className="text-[9px] uppercase tracking-[0.22em] text-slate-500">Imagen</p>
            <div className="mt-2 space-y-3">
              <Field label="Rotación" hint={`${presentacion.rotacion}°`}>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={presentacion.rotacion}
                  onChange={(e) => actualizar({ rotacion: Number(e.target.value) })}
                  className="h-1 w-full accent-[#f5b544]"
                />
                <div className="mt-1 flex gap-1">
                  <Button size="xs" variant="secondary" onClick={() => actualizar({ rotacion: normalizarRotacion(presentacion.rotacion - 90) })}>
                    ↺ 90°
                  </Button>
                  <Button size="xs" variant="secondary" onClick={() => actualizar({ rotacion: normalizarRotacion(presentacion.rotacion + 90) })}>
                    ↻ 90°
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => actualizar({ rotacion: 0 })}>0°</Button>
                </div>
              </Field>

              <Field label="Zoom" hint={`${presentacion.zoom.toFixed(2)}×`}>
                <input
                  type="range"
                  min={0.25}
                  max={4}
                  step={0.01}
                  value={presentacion.zoom}
                  onChange={(e) => actualizar({ zoom: Number(e.target.value) })}
                  className="h-1 w-full accent-[#f5b544]"
                />
              </Field>

              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] text-slate-500">Arrastra la vista previa para encuadrar.</p>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => actualizar({ zoom: 1, rotacion: 0, pan_x: 0, pan_y: 0 })}
                >
                  Centrar
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-line bg-white/[0.02] p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[9px] uppercase tracking-[0.22em] text-slate-500">Rejilla</p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500">{presentacion.grid_visible ? "visible" : "oculta"}</span>
                <Switch
                  checked={presentacion.grid_visible}
                  onChange={(visible) => actualizar({ grid_visible: visible })}
                  label="Mostrar rejilla"
                />
              </div>
            </div>
            <div className="mt-2 space-y-3">
              <Field label="Tamaño de celda" hint={`${presentacion.grid_cm.toFixed(2)} cm · ≈ ${celdaPx} px`}>
                <input
                  type="range"
                  min={0.4}
                  max={10}
                  step={0.05}
                  value={presentacion.grid_cm}
                  onChange={(e) => {
                    const cm = Number(e.target.value);
                    setCeldaTexto(String(cm));
                    actualizar({ grid_cm: cm });
                  }}
                  className="h-1 w-full accent-[#22ff88]"
                />
                <div className="mt-1 flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={0.4}
                    max={10}
                    step={0.05}
                    value={celdaTexto}
                    onChange={(e) => cambiarCelda(e.target.value)}
                    onBlur={normalizarCelda}
                    className="h-8 w-24 py-1 font-mono text-xs"
                  />
                  <span className="text-[10px] text-slate-500">cm por celda</span>
                </div>
              </Field>

              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <Field label="Color" hint="línea">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={colorRejilla}
                      onChange={(e) => actualizar({ grid_color: e.target.value })}
                      className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent"
                    />
                    <Input
                      value={presentacion.grid_color}
                      onChange={(e) => actualizar({ grid_color: e.target.value })}
                      className="h-8 py-1 font-mono text-[10px]"
                    />
                  </div>
                </Field>
                <Field label="Opacidad" hint={`${Math.round(presentacion.grid_opacity * 100)}%`}>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={presentacion.grid_opacity}
                    onChange={(e) => actualizar({ grid_opacity: Number(e.target.value) })}
                    className="h-1 w-24 accent-[#22ff88]"
                  />
                </Field>
              </div>
              <p className="text-[10px] leading-relaxed text-slate-500">
                La rejilla queda fija. Ajusta el zoom de la imagen hasta que sus cuadros coincidan; luego afina el tamaño de celda.
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-line bg-white/[0.02] p-3">
            <p className="text-[9px] uppercase tracking-[0.22em] text-slate-500">Calibración física</p>
            <Field
              label="Ancho de la pantalla"
              hint="cm"
              className="mt-2"
            >
              <Input
                type="number"
                min={10}
                max={400}
                step={0.5}
                value={pantallaCmTexto}
                onChange={(e) => cambiarCalibracion(e.target.value)}
                onBlur={normalizarCalibracion}
                placeholder="Ej. 121 para una TV de 55″"
                className="h-8 py-1 text-xs"
              />
            </Field>
            <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
              Sin calibrar se usan 96 dpi. En el popup, la rejilla se recalcula con el ancho de su pantalla.
            </p>
          </section>
        </div>

        <div className="space-y-2.5">
          <div
            className={cn(
              "relative overflow-hidden rounded-xl border bg-black transition-colors",
              arrastrandoMapa ? "border-gold" : "border-line",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setArrastrandoMapa(true);
            }}
            onDragLeave={() => setArrastrandoMapa(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastrandoMapa(false);
              const archivo = e.dataTransfer.files?.[0];
              if (archivo) void subirMapa(archivo);
            }}
          >
            <div
              className="relative aspect-video cursor-grab touch-none active:cursor-grabbing"
              onPointerDown={panInicio}
              onPointerMove={panMover}
              onPointerUp={panFin}
              onPointerCancel={panFin}
              onPointerLeave={panFin}
              onDoubleClick={() => actualizar({ zoom: 1, rotacion: 0, pan_x: 0, pan_y: 0 })}
            >
              <ProjectorStage
                escena={activa}
                presentacion={presentacion}
                grid={data.grid}
                pantallaCm={pantallaCm}
                className="h-full w-full"
              />
              <div className="pointer-events-none absolute left-2 top-2 flex gap-1">
                <span className="rounded-md border border-white/15 bg-black/45 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white/70 backdrop-blur">
                  Vista previa
                </span>
                {presentacion.mapa_url ? (
                  <span className="rounded-md border border-white/15 bg-black/45 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white/70 backdrop-blur">
                    {activa.tokens.length} tokens
                  </span>
                ) : null}
              </div>
              {arrastrandoMapa ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60">
                  <p className="rounded-lg border border-gold/50 bg-ink/90 px-3 py-2 text-xs text-gold">
                    Suelta la imagen para usarla como mapa
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
            <p>
              Arrastra la vista para moverla · ajusta el zoom en el panel de imagen · doble clic para centrar.
            </p>
            <div className="flex items-center gap-1.5">
              <Badge color={presentacion.grid_visible ? "green" : "slate"}>rejilla {presentacion.grid_visible ? "ON" : "OFF"}</Badge>
              <Badge color="slate">{activa.tokens.length} tokens</Badge>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-white/[0.02] p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[9px] uppercase tracking-[0.22em] text-slate-500">Cambiar escena en directo</p>
              <Link href="/pantalla/escenas" className="text-[10px] text-slate-500 underline hover:text-gold">
                Gestionar escenas
              </Link>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {data.escenas.map((escena) => (
                <Button
                  key={escena.id}
                  size="xs"
                  variant={escena.activo ? "primary" : "secondary"}
                  loading={abriendo}
                  onClick={() => {
                    if (escena.activo) return;
                    void activar(escena.id, escena.nombre);
                  }}
                >
                  {escena.activo ? "● " : ""}{escena.nombre}
                </Button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-gold/20 bg-gold/[0.04] p-3 text-[10px] leading-relaxed text-slate-400">
            <p className="font-semibold text-gold/90">Cómo proyectar</p>
            <p className="mt-1">
              1. Elige la escena y ajusta el mapa. 2. Pulsa <strong>Proyectar</strong>. 3. Arrastra el popup a la segunda pantalla.
              4. Pulsa <strong>⛶</strong> dentro del popup. Todo lo que muevas aquí se refleja allí al instante.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
