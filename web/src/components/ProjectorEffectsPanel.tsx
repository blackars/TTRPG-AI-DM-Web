"use client";

import type { EfectoEscena } from "./SceneBoard";
import { Badge, Button, Field, Input, Select, Switch } from "./ui";
import { cn } from "@/lib/format";

export type PresetEfecto = Partial<Omit<EfectoEscena, "id" | "url" | "tipo_archivo">> & {
  nombre: string;
  icono: string;
};

export const PRESETS_EFECTO: PresetEfecto[] = [
  {
    nombre: "Luz cálida", icono: "🕯️", tipo: "luz", patron: "radial",
    color: "#ffb347", color2: "#ff5c8a", ancho: 80, alto: 80,
    opacidad: 0.5, mezcla: "screen", animacion: "pulso", velocidad: 0.6, suavizado: 36,
  },
  {
    nombre: "Niebla", icono: "🌫️", tipo: "luz", patron: "ondas",
    color: "#6ee7b7", color2: "#0ea5e9", ancho: 120, alto: 100, y: 60,
    opacidad: 0.32, mezcla: "screen", animacion: "deriva", velocidad: 0.45, suavizado: 30,
  },
  {
    nombre: "Portal", icono: "🌀", tipo: "luz", patron: "conico",
    color: "#a78bfa", color2: "#22d3ee", ancho: 38, alto: 55,
    opacidad: 0.8, mezcla: "screen", animacion: "rotar", velocidad: 0.45, suavizado: 8,
    anclado_mapa: true,
  },
  {
    nombre: "Aurora", icono: "🪄", tipo: "luz", patron: "lineal",
    color: "#34d399", color2: "#38bdf8", ancho: 115, alto: 70,
    opacidad: 0.32, mezcla: "screen", animacion: "deriva", velocidad: 0.35, suavizado: 26,
  },
  {
    nombre: "Bruma densa", icono: "☁️", tipo: "luz", patron: "ondas",
    color: "#e2e8f0", color2: "#94a3b8", ancho: 130, alto: 105,
    opacidad: 0.28, mezcla: "normal", animacion: "deriva", velocidad: 0.25, suavizado: 42,
  },
];

const MEZCLAS: Array<{ valor: EfectoEscena["mezcla"]; texto: string }> = [
  { valor: "normal", texto: "Normal" },
  { valor: "screen", texto: "Trama de luz (screen)" },
  { valor: "overlay", texto: "Superponer (overlay)" },
  { valor: "soft-light", texto: "Luz suave" },
  { valor: "multiply", texto: "Multiplicar" },
  { valor: "color-dodge", texto: "Color dodge" },
  { valor: "plus-lighter", texto: "Sumar luz" },
];

const ANIMACIONES: Array<{ valor: EfectoEscena["animacion"]; texto: string }> = [
  { valor: "ninguna", texto: "Quieta" },
  { valor: "deriva", texto: "Deriva / niebla" },
  { valor: "pulso", texto: "Pulso" },
  { valor: "parpadeo", texto: "Parpadeo" },
  { valor: "rotar", texto: "Rotar" },
];

function iconoEfecto(efecto: EfectoEscena): string {
  if (efecto.tipo === "textura") return efecto.tipo_archivo === "video" ? "🎞️" : "🖼️";
  if (efecto.patron === "conico") return "🌀";
  if (efecto.patron === "ondas") return "🌫️";
  if (efecto.patron === "lineal") return "🪄";
  return "💡";
}

export function ProjectorEffectsPanel({
  efectos,
  seleccionadoId,
  onSeleccionar,
  onAgregar,
  onSubir,
  onQuitar,
  onEditar,
  subiendo = false,
  eliminando = null,
}: {
  efectos: EfectoEscena[];
  seleccionadoId: string | null;
  onSeleccionar: (id: string) => void;
  onAgregar: (preset: PresetEfecto) => void;
  onSubir: (archivo: File) => void;
  onQuitar: (id: string) => void;
  onEditar: (id: string, cambios: Partial<EfectoEscena>) => void;
  subiendo?: boolean;
  eliminando?: string | null;
}) {
  const seleccionado = efectos.find((e) => e.id === seleccionadoId) ?? null;
  const esLuz = seleccionado?.tipo === "luz";

  return (
    <section className="rounded-xl border border-line bg-white/[0.02] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] uppercase tracking-[0.22em] text-slate-500">Luces y efectos</p>
        <Badge color={efectos.length ? "violet" : "slate"}>{efectos.length} capas</Badge>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {PRESETS_EFECTO.map((preset) => (
          <Button
            key={preset.nombre}
            size="xs"
            variant="secondary"
            onClick={() => onAgregar(preset)}
            title={`Añadir ${preset.nombre}`}
          >
            {preset.icono} {preset.nombre}
          </Button>
        ))}
        <label className={cn(
          "inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg border border-line bg-white/[0.02] px-2 text-[10px] font-medium text-slate-300",
          "transition-colors hover:border-violet-400/40 hover:text-violet-200",
          subiendo && "pointer-events-none opacity-50",
        )}>
          {subiendo ? "Subiendo…" : "📤 Textura PNG / MP4"}
          <input
            type="file"
            accept="image/png,image/webp,image/gif,image/apng,video/mp4,video/webm"
            className="hidden"
            onChange={(e) => {
              const archivo = e.target.files?.[0];
              if (archivo) onSubir(archivo);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {efectos.length ? (
        <div className="mt-2 max-h-36 space-y-1 overflow-y-auto pr-1">
          {efectos.map((efecto) => (
            <div
              key={efecto.id}
              className={cn(
                "flex items-center gap-1 rounded-lg border px-1.5 py-1",
                efecto.id === seleccionadoId
                  ? "border-gold/50 bg-gold/[0.06]"
                  : "border-line bg-white/[0.015]",
              )}
            >
              <button
                type="button"
                onClick={() => onSeleccionar(efecto.id)}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                title="Seleccionar efecto para editar"
              >
                <span className="text-sm">{iconoEfecto(efecto)}</span>
                <span className={cn("truncate text-[11px]", efecto.visible ? "text-slate-200" : "text-slate-500 line-through")}>
                  {efecto.nombre}
                </span>
                <Badge color={efecto.tipo === "textura" ? "teal" : "violet"}>
                  {efecto.tipo === "textura" ? efecto.tipo_archivo : "luz"}
                </Badge>
              </button>
              <button
                type="button"
                onClick={() => onEditar(efecto.id, { visible: !efecto.visible })}
                className="h-6 w-6 rounded text-xs text-slate-500 hover:text-gold"
                title={efecto.visible ? "Ocultar capa" : "Mostrar capa"}
              >
                {efecto.visible ? "◉" : "○"}
              </button>
              <button
                type="button"
                onClick={() => onQuitar(efecto.id)}
                disabled={eliminando === efecto.id}
                className="h-6 w-6 rounded text-xs text-slate-600 hover:text-red-300 disabled:opacity-40"
                title="Quitar efecto"
              >
                {eliminando === efecto.id ? "…" : "✕"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
          Añade una luz, niebla o portal. También puedes subir una textura transparente animada.
        </p>
      )}

      {seleccionado ? (
        <div className="mt-2 space-y-2 border-t border-line pt-2">
          <Field label="Nombre">
            <Input
              value={seleccionado.nombre}
              onChange={(e) => onEditar(seleccionado.id, { nombre: e.target.value })}
              className="h-8 py-1 text-xs"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="X" hint={`${Math.round(seleccionado.x)}%`}>
              <input
                type="range" min={0} max={100} step={1} value={seleccionado.x}
                onChange={(e) => onEditar(seleccionado.id, { x: Number(e.target.value) })}
                className="h-1 w-full accent-[#a78bfa]"
              />
            </Field>
            <Field label="Y" hint={`${Math.round(seleccionado.y)}%`}>
              <input
                type="range" min={0} max={100} step={1} value={seleccionado.y}
                onChange={(e) => onEditar(seleccionado.id, { y: Number(e.target.value) })}
                className="h-1 w-full accent-[#a78bfa]"
              />
            </Field>
            <Field label="Ancho" hint={`${Math.round(seleccionado.ancho)}%`}>
              <input
                type="range" min={5} max={200} step={1} value={seleccionado.ancho}
                onChange={(e) => onEditar(seleccionado.id, { ancho: Number(e.target.value) })}
                className="h-1 w-full accent-[#a78bfa]"
              />
            </Field>
            <Field label="Alto" hint={`${Math.round(seleccionado.alto)}%`}>
              <input
                type="range" min={5} max={200} step={1} value={seleccionado.alto}
                onChange={(e) => onEditar(seleccionado.id, { alto: Number(e.target.value) })}
                className="h-1 w-full accent-[#a78bfa]"
              />
            </Field>
            <Field label="Rotación" hint={`${Math.round(seleccionado.rotacion)}°`}>
              <input
                type="range" min={-180} max={180} step={1} value={seleccionado.rotacion}
                onChange={(e) => onEditar(seleccionado.id, { rotacion: Number(e.target.value) })}
                className="h-1 w-full accent-[#a78bfa]"
              />
            </Field>
            <Field label="Opacidad" hint={`${Math.round(seleccionado.opacidad * 100)}%`}>
              <input
                type="range" min={0} max={1} step={0.01} value={seleccionado.opacidad}
                onChange={(e) => onEditar(seleccionado.id, { opacidad: Number(e.target.value) })}
                className="h-1 w-full accent-[#a78bfa]"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Mezcla">
              <Select
                value={seleccionado.mezcla}
                onChange={(e) => onEditar(seleccionado.id, { mezcla: e.target.value as EfectoEscena["mezcla"] })}
                className="h-8 py-1 text-[11px]"
              >
                {MEZCLAS.map((m) => <option key={m.valor} value={m.valor}>{m.texto}</option>)}
              </Select>
            </Field>
            <Field label="Animación">
              <Select
                value={seleccionado.animacion}
                onChange={(e) => onEditar(seleccionado.id, { animacion: e.target.value as EfectoEscena["animacion"] })}
                className="h-8 py-1 text-[11px]"
              >
                {ANIMACIONES.map((a) => <option key={a.valor} value={a.valor}>{a.texto}</option>)}
              </Select>
            </Field>
            <Field label="Velocidad" hint={`${seleccionado.velocidad.toFixed(1)}×`}>
              <input
                type="range" min={0.1} max={3} step={0.05} value={seleccionado.velocidad}
                onChange={(e) => onEditar(seleccionado.id, { velocidad: Number(e.target.value) })}
                className="h-1 w-full accent-[#a78bfa]"
              />
            </Field>
            <Field label="Desenfoque" hint={`${Math.round(seleccionado.suavizado)} px`}>
              <input
                type="range" min={0} max={60} step={1} value={seleccionado.suavizado}
                onChange={(e) => onEditar(seleccionado.id, { suavizado: Number(e.target.value) })}
                className="h-1 w-full accent-[#a78bfa]"
              />
            </Field>
          </div>

          {esLuz ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Color 1">
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={seleccionado.color}
                    onChange={(e) => onEditar(seleccionado.id, { color: e.target.value })}
                    className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent"
                  />
                  <Input
                    value={seleccionado.color}
                    onChange={(e) => onEditar(seleccionado.id, { color: e.target.value })}
                    className="h-8 py-1 font-mono text-[10px]"
                  />
                </div>
              </Field>
              <Field label="Color 2">
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={seleccionado.color2}
                    onChange={(e) => onEditar(seleccionado.id, { color2: e.target.value })}
                    className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent"
                  />
                  <Input
                    value={seleccionado.color2}
                    onChange={(e) => onEditar(seleccionado.id, { color2: e.target.value })}
                    className="h-8 py-1 font-mono text-[10px]"
                  />
                </div>
              </Field>
            </div>
          ) : (
            <Field label="Ajuste de la textura">
              <Select
                value={seleccionado.ajuste}
                onChange={(e) => onEditar(seleccionado.id, { ajuste: e.target.value as EfectoEscena["ajuste"] })}
                className="h-8 py-1 text-[11px]"
              >
                <option value="contain">Contener (sin recortar)</option>
                <option value="cover">Cubrir (recortar)</option>
                <option value="fill">Estirar</option>
              </Select>
            </Field>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Switch
                checked={seleccionado.encima_tokens}
                onChange={(v) => onEditar(seleccionado.id, { encima_tokens: v })}
                label="Pintar encima de los tokens"
              />
              <span className="text-[10px] text-slate-500">por encima de tokens</span>
            </div>
            <Button
              size="xs"
              variant="danger"
              onClick={() => onQuitar(seleccionado.id)}
              loading={eliminando === seleccionado.id}
            >
              Quitar capa
            </Button>
          </div>

          <Switch
            checked={seleccionado.anclado_mapa}
            onChange={(v) => onEditar(seleccionado.id, { anclado_mapa: v })}
            label="Anclar la capa al recuadro del mapa"
          />

          <p className="text-[9px] leading-relaxed text-slate-600">
            Arrastra la capa en la vista previa para colocarla. Las capas se pintan sobre el mapa y la rejilla;
            activa «encima de tokens» para que también cubran las fichas. Con «anclar al mapa» la capa se
            pega al recuadro de la imagen y viaja con ella al hacer zoom o panear.
          </p>
        </div>
      ) : null}
    </section>
  );
}
