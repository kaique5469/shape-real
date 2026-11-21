"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";
import { Button, LinkButton } from "@/components/ui";
import { reportCrash, track } from "@/lib/analytics";

const RELOAD_KEY = "sr:reloaded-after-error";

/** Arquivos de uma versão antiga do app que sumiram depois de uma atualização: recarregar resolve. */
function isStaleBundle(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(text);
}

/**
 * Tela de erro de um trecho do app: registra a falha, tranquiliza sobre os dados e oferece saída.
 * `where` identifica o trecho no acompanhamento de erros.
 */
export function ErrorScreen({ error, retry, where, home = "/" }: { error: unknown; retry: () => void; where: string; home?: string }) {
  useEffect(() => {
    // App atualizado enquanto a aba estava aberta: recarrega uma vez, sem incomodar.
    if (isStaleBundle(error)) {
      try {
        if (!sessionStorage.getItem(RELOAD_KEY)) {
          sessionStorage.setItem(RELOAD_KEY, "1");
          window.location.reload();
          return;
        }
      } catch {
        /* sem sessionStorage: mostra a tela */
      }
    }
    reportCrash(error, where);
    track("error_screen_shown", { where });
  }, [error, where]);

  return (
    <div role="alert" className="mx-auto max-w-md px-4 py-16">
      <h1 className="plate-type text-[1.75rem] leading-tight">Algo deu errado nesta tela</h1>
      <p className="mt-3 text-[0.9375rem] text-steel">
        O erro foi registrado para correção. O que você já salvou continua guardado: alunos, fichas, treinos e dieta não foram perdidos.
      </p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button onClick={() => retry()} icon={<RotateCw className="size-4" />}>
          Tentar de novo
        </Button>
        <LinkButton href={home} variant="secondary">
          Voltar ao início
        </LinkButton>
      </div>
    </div>
  );
}
