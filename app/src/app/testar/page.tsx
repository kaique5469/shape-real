"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/brand";
import { Alert, Button } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { saveTesterPass } from "@/lib/ai/client";

/**
 * Link de teste: entra direto no painel do personal, sem cadastro e sem formulário.
 * Os dados ficam no aparelho de quem testa. `?k=` é o código que libera a IA real.
 */
export default function TestarPage() {
  return (
    <Suspense>
      <Testar />
    </Suspense>
  );
}

function Testar() {
  const { ready, startTester } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const started = useRef(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    const pass = params.get("k");
    if (pass) saveTesterPass(pass);
    startTester()
      .then(() => router.replace("/alunos?bemvindo=1"))
      .catch(() => setError(true));
  }, [ready, startTester, router, params]);

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-sm text-center">
        <Logo className="justify-center" />
        {error ? (
          <div className="mt-8 space-y-4 text-left">
            <Alert tone="error">
              Não foi possível preparar o teste neste navegador. Isso acontece em aba anônima ou quando o armazenamento do site está bloqueado. Abra o link em uma aba normal do Chrome ou do Safari.
            </Alert>
            <Button className="w-full" onClick={() => location.reload()}>
              Tentar de novo
            </Button>
          </div>
        ) : (
          <div className="mt-8" role="status" aria-live="polite">
            <div className="mx-auto h-1.5 w-40 overflow-hidden rounded-full bg-chalk-2">
              {/* Barra de carregamento: identidade, não estado (U7 R1). */}
              <div data-brand className="h-full w-1/2 animate-[slide_1.1s_ease-in-out_infinite] rounded-full bg-brand" />
            </div>
            <p className="mt-5 text-lg font-bold">Preparando seu ambiente de teste…</p>
            <p className="mt-1 text-sm text-steel">Sem cadastro. Seus dados ficam só neste aparelho.</p>
          </div>
        )}
      </div>
    </main>
  );
}
