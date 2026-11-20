import type { Metadata } from "next";

export const metadata: Metadata = { title: "Versão de teste", robots: { index: false, follow: false } };

export default function TestarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
