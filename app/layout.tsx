import type { Metadata, Viewport } from "next";
import "./globals.css";

// Em sincronia com o basePath de next.config.ts (GitHub Pages serve o projeto em /<repositório>).
const basePath = process.env.NEXT_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Negociações Interior",
  description: "Negociações do Interior por frente de serviço e cluster, atualizadas por planilhas de uma pasta.",
  icons: {
    icon: `${basePath}/favicon.svg`,
    shortcut: `${basePath}/favicon.svg`,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
