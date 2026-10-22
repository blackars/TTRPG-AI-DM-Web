export function cn(...partes: Array<string | false | null | undefined>): string {
  return partes.filter(Boolean).join(" ");
}

const FECHA = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const HORA = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const FECHA_LARGA = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function fechaCorta(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return FECHA.format(d);
}

export function horaCorta(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return HORA.format(d);
}

export function fechaLarga(d: Date): string {
  const texto = FECHA_LARGA.format(d);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function porcentaje(actual: number, maximo: number): number {
  if (maximo <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((actual / maximo) * 100)));
}
