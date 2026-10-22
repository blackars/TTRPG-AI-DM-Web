"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ScreenView } from "@/components/ScreenView";
import { Button, Empty, ErrorBox } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import type { PantallaData } from "@/lib/types";

interface ModulosResp {
  modulos: unknown[];
  badges: Record<string, number>;
}

export default function PantallaPage({ params }: { params: { id: string } }) {
  const { data, error } = useApi<PantallaData>(`/api/screens/${params.id}`);
  const { data: meta } = useApi<ModulosResp>("/api/modules");

  if (error && !data) {
    return (
      <AppShell slug={params.id}>
        <div className="mx-auto max-w-xl pt-10">
          <ErrorBox>{error}</ErrorBox>
          <div className="mt-4 rounded-2xl border border-line bg-panel p-6 text-center">
            <Empty
              icon="🧭"
              title="Esta pantalla no existe"
              action={
                <div className="flex gap-2">
                  <Link href="/pantalla/mesa"><Button variant="primary">Volver a la mesa</Button></Link>
                  <Button
                    variant="secondary"
                    onClick={() => window.location.reload()}
                  >
                    Reintentar
                  </Button>
                </div>
              }
            >
              La pantalla «{params.id}» no está en la base de datos. Si acabas de importar una partida,
              el layout puede haber cambiado.
            </Empty>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell slug={params.id}>
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="h-72 animate-pulse rounded-2xl border border-line bg-white/[0.03]" />
          <div className="space-y-3">
            <div className="h-36 animate-pulse rounded-2xl border border-line bg-white/[0.03]" />
            <div className="h-52 animate-pulse rounded-2xl border border-line bg-white/[0.03]" />
          </div>
        </div>
        <p className="mt-3 text-center text-[10px] uppercase tracking-[0.22em] text-slate-600">
          Montando la mesa…
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell slug={params.id} pantalla={data} badges={meta?.badges}>
      <ScreenView data={data} badges={meta?.badges} />
    </AppShell>
  );
}
