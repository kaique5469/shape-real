import type { Metadata } from "next";

// Treinos e respostas do questionário chegam no "#d=": a página nunca entra em buscador, mesmo citada em outro lugar.
// A página continua de cliente; os metadados ficam neste layout (metadata só existe em componente de servidor).
export const metadata: Metadata = { title: "Receber pelo link", robots: { index: false, follow: false } };

export default function ReceberLayout({ children }: { children: React.ReactNode }) {
  return children;
}
