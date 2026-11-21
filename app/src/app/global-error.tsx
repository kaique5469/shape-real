"use client";

import { useEffect } from "react";
import { reportCrash } from "@/lib/analytics";

/**
 * Erro no layout raiz (antes de qualquer tela carregar). Este arquivo substitui o layout inteiro,
 * então traz o próprio <html> e estilos embutidos: os estilos globais não chegam aqui.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    reportCrash(error, "global");
  }, [error]);

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", background: "#f1f2ee", color: "#12151a" }}>
        <title>Algo deu errado · Shape Real</title>
        <main style={{ maxWidth: "28rem", margin: "0 auto", padding: "4rem 1rem" }} role="alert">
          <h1 style={{ fontSize: "1.6rem", lineHeight: 1.15, margin: 0 }}>Algo deu errado ao abrir o app</h1>
          <p style={{ marginTop: "0.75rem", lineHeight: 1.5, color: "#535b67" }}>O erro foi registrado para correção. O que você já salvou continua guardado neste aparelho.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ marginTop: "1.5rem", height: "2.75rem", padding: "0 1.1rem", border: 0, borderRadius: 6, background: "#12151a", color: "#f1f2ee", fontSize: "0.95rem", fontWeight: 600, cursor: "pointer" }}
          >
            Tentar de novo
          </button>
        </main>
      </body>
    </html>
  );
}
