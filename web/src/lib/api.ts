export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8100";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_URL}${path}`;
  const esFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        ...(esFormData ? {} : { "Content-Type": "application/json" }),
        ...(init?.headers || {}),
      },
    });
  } catch {
    throw new ApiError(0, "No se pudo conectar con la API en el puerto 8100.");
  }
  if (!res.ok) {
    let detalle = `Error ${res.status}`;
    try {
      const cuerpo = await res.json();
      detalle = typeof cuerpo?.detail === "string" ? cuerpo.detail : JSON.stringify(cuerpo?.detail ?? cuerpo);
    } catch {
      /* respuesta sin JSON */
    }
    throw new ApiError(res.status, detalle);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown = {}) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  upload: <T>(path: string, body: FormData) =>
    request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body: unknown = {}) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export function errorTexto(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Error inesperado";
}
