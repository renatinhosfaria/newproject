import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../styles/tokens.css";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Pacaembu Orbit CRM",
  description: "CRM Pacaembu — ciclo preparatório com Agent simulado.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#003D4C",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
