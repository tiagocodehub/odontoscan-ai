import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "OdontoScan AI — Apoio à decisão em radiografias odontológicas",
  description:
    "Protótipo de pesquisa para apoio à decisão: análise de radiografias odontológicas com IA, demarcação de achados e relatório sugestivo. Não substitui avaliação profissional.",
  applicationName: "OdontoScan AI",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-sky-700 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Pular para o conteúdo principal
        </a>
        {children}
      </body>
    </html>
  );
}
