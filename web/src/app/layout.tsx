import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "TTRPG-Assistant · Mesa de rol modular",
  description:
    "Mesa de rol digital con módulos componibles, dados autoritativos y un asistente IA que lee todo el contexto de la partida.",
  applicationName: "TTRPG-Assistant",
};

export const viewport: Viewport = {
  themeColor: "#080a0f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
