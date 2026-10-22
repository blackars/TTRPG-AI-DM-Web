"use client";

import React, { useEffect } from "react";
import { cn } from "@/lib/format";

type Variante = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Tamano = "sm" | "md" | "xs";

const VARIANTES: Record<Variante, string> = {
  primary:
    "bg-gold text-ink border-gold hover:bg-amber-300 shadow-[0_6px_24px_rgba(245,181,68,0.18)]",
  secondary:
    "bg-panel2 text-slate-100 border-line hover:border-gold/50 hover:text-gold",
  ghost: "bg-transparent text-slate-300 border-transparent hover:bg-white/5 hover:text-white",
  danger:
    "bg-red-500/10 text-red-300 border-red-500/30 hover:bg-red-500/20 hover:text-red-200",
  subtle: "bg-white/5 text-slate-200 border-white/10 hover:bg-white/10",
};

const TAMANOS: Record<Tamano, string> = {
  xs: "h-7 px-2 text-[11px] gap-1 rounded-lg",
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variante;
  size?: Tamano;
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center border font-medium transition-all duration-150",
        "disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none",
        "focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink",
        VARIANTES[variant],
        TAMANOS[size],
        className,
      )}
    >
      {loading ? <Spinner className="h-3.5 w-3.5" /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block animate-spin rounded-full border-2 border-current border-t-transparent",
        className || "h-4 w-4",
      )}
    />
  );
}

export function Badge({
  children,
  color = "slate",
  className,
  title,
}: {
  children: React.ReactNode;
  color?: "slate" | "gold" | "violet" | "teal" | "red" | "green";
  className?: string;
  title?: string;
}) {
  const colores: Record<string, string> = {
    slate: "bg-white/5 text-slate-300 border-white/10",
    gold: "bg-gold/10 text-gold border-gold/30",
    violet: "bg-violet-500/10 text-violet-300 border-violet-500/30",
    teal: "bg-teal-500/10 text-teal-300 border-teal-500/30",
    red: "bg-red-500/10 text-red-300 border-red-500/30",
    green: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  };
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        colores[color],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Chip({
  children,
  onRemove,
  className,
}: {
  children: React.ReactNode;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-gold/10 px-2.5 py-1 text-[11px] text-gold",
        className,
      )}
    >
      {children}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full text-gold/60 hover:text-gold"
          aria-label="Quitar"
        >
          ×
        </button>
      ) : null}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{label}</span>
        {hint ? <span className="text-[10px] text-slate-500">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

const CAMPO =
  "w-full rounded-lg border border-line bg-[#0a0d14] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 " +
  "transition-colors focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/10";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(CAMPO, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(CAMPO, "min-h-[90px] resize-y leading-relaxed", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn(CAMPO, "appearance-none pr-8", props.className)}>
      {props.children}
    </select>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
        checked ? "border-gold/50 bg-gold/80" : "border-line bg-white/5",
        disabled && "opacity-40",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-ink shadow transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "relative z-10 max-h-[88vh] w-full overflow-y-auto rounded-2xl border border-line bg-panel p-5 shadow-panel",
          wide ? "max-w-3xl" : "max-w-lg",
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 className="font-display text-xl text-slate-100">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/5 hover:text-white"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({
  icon = "🕯️",
  title,
  children,
  action,
}: {
  icon?: string;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line px-4 py-8 text-center">
      <span className="text-3xl opacity-70">{icon}</span>
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {children ? <p className="max-w-sm text-xs leading-relaxed text-slate-500">{children}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
      {children}
    </div>
  );
}

export function HpBar({ hp, hpMax }: { hp: number; hpMax: number }) {
  const pct = hpMax <= 0 ? 0 : Math.max(0, Math.min(100, (hp / hpMax) * 100));
  const color = pct > 60 ? "bg-emerald-400" : pct > 30 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="space-y-1">
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>{hp} / {hpMax} HP</span>
        <span>{Math.round(pct)}%</span>
      </div>
    </div>
  );
}

const EMOJIS = [
  "🧙", "🧝", "🛡️", "🔮", "🐺", "👹", "🐉", "🧟", "🦂", "🕷️",
  "🗡️", "🏹", "🪓", "🔪", "🪄", "🛡️", "🧪", "💊", "🍖", "🧵",
  "🪙", "💎", "📕", "🗝️", "🟢", "🔥", "❄️", "⚡", "🌿", "🕯️",
  "📦", "🎒", "🏺", "🪢", "🔷", "⭐", "💀", "👑", "🥖", "🍷",
];

export function EmojiPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (emoji: string) => void;
}) {
  return (
    <div className="grid grid-cols-10 gap-1 rounded-lg border border-line bg-[#0a0d14] p-2">
      {EMOJIS.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onChange(e)}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md text-base transition-colors hover:bg-white/10",
            value === e && "bg-gold/20 ring-1 ring-gold/60",
          )}
          aria-label={`Elegir ${e}`}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

export function Divider() {
  return <div className="h-px w-full bg-line/70" />;
}
