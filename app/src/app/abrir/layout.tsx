import type { Metadata } from "next";

// O link da ficha leva dados do aluno no "#d=": a página nunca entra em buscador, mesmo citada em outro lugar.
// A página continua de cliente; os metadados ficam neste layout (metadata só existe em componente de servidor).
export const metadata: Metadata = { title: "Abrir ficha", robots: { index: false, follow: false } };

export default function AbrirLayout({ children }: { children: React.ReactNode }) {
  return children;
}
