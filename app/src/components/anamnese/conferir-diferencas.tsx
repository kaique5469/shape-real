"use client";

import { useId, type ReactElement } from "react";
import { Alert, Segmented } from "@/components/ui";
import type { Diferenca, DiffLimitacoes, EscolhaMescla, Escolhas } from "@/lib/domain/anamnese-types";
import { CONFERIR_TEXTO } from "@/lib/questionario-receber";

/**
 * "Conferir antes de salvar" (spec §8.2): uma linha por campo em que o cadastro e a resposta divergem, com
 * [Manter o seu] · [Usar a resposta] (o padrão vem de `diferenca.padrao`), e a linha das limitações com [Aplicar]
 * (padrão) · [Manter como está]. Com `excede`, as limitações não mudam e o aviso diz por quê (sem escolha a fazer).
 * Compartilhado pela recepção do link (/receber) e pelo fim do modo junto (/questionario). Quem usa põe o título.
 * `aluno` (opcional): o nome em "Você: X · {aluno}: Y"; sem ele, "Aluno".
 * Raiz com `ph-no-capture` (as linhas mostram respostas). Alvos de 44 px e duas colunas iguais cabem em 360 px.
 */
export function ConferirDiferencas(props: { diferencas: Diferenca[]; limitacoes?: DiffLimitacoes; value: Escolhas; onChange: (v: Escolhas) => void; aluno?: string }): ReactElement | null {
  const { diferencas, limitacoes, value, onChange, aluno = "" } = props;
  const linhaLim = limitacoes ? CONFERIR_TEXTO.limitacoes(limitacoes) : null;
  if (!diferencas.length && !linhaLim) return null;
  return (
    <div className="ph-no-capture">
      <ul className="ruled rounded-[var(--radius-ficha)] border border-rule bg-paper">
        {diferencas.map((d) => (
          <LinhaCampo key={d.campo} d={d} aluno={aluno} valor={value[d.campo] ?? d.padrao} onEscolha={(v) => onChange({ ...value, [d.campo]: v })} />
        ))}
        {linhaLim && limitacoes ? (
          <LinhaLimitacoes texto={linhaLim} excede={limitacoes.excede} valor={value.limitacoes ?? "aplicar"} onEscolha={(v) => onChange({ ...value, limitacoes: v })} />
        ) : null}
      </ul>
    </div>
  );
}

function LinhaCampo({ d, aluno, valor, onEscolha }: { d: Diferenca; aluno: string; valor: EscolhaMescla; onEscolha: (v: EscolhaMescla) => void }) {
  const id = useId();
  return (
    <li className="px-4 py-3">
      <div role="group" aria-labelledby={`${id}-r ${id}-l`}>
        <p id={`${id}-r`} className="text-sm font-semibold text-steel">
          {d.rotulo}
        </p>
        <p id={`${id}-l`} className="mt-0.5 text-[0.9375rem] break-words text-iron">
          {CONFERIR_TEXTO.linha(d, aluno)}
        </p>
        <Segmented<EscolhaMescla>
          className="mt-2"
          label={d.rotulo}
          columns={2}
          value={valor}
          onChange={onEscolha}
          options={[
            { value: "cadastro", label: CONFERIR_TEXTO.manterOSeu },
            { value: "resposta", label: CONFERIR_TEXTO.usarResposta },
          ]}
        />
      </div>
    </li>
  );
}

function LinhaLimitacoes({ texto, excede, valor, onEscolha }: { texto: string; excede: boolean; valor: "aplicar" | "manter"; onEscolha: (v: "aplicar" | "manter") => void }) {
  const id = useId();
  return (
    <li className="px-4 py-3">
      <div role="group" aria-labelledby={`${id}-l`}>
        <p id={`${id}-l`} className="text-[0.9375rem] break-words text-iron">
          {texto}
        </p>
        {excede ? (
          <Alert tone="warn" className="mt-2">
            {CONFERIR_TEXTO.excede}
          </Alert>
        ) : (
          <Segmented<"aplicar" | "manter">
            className="mt-2"
            label="Limitações"
            columns={2}
            value={valor}
            onChange={onEscolha}
            options={[
              { value: "aplicar", label: CONFERIR_TEXTO.aplicar },
              { value: "manter", label: CONFERIR_TEXTO.manterComoEsta },
            ]}
          />
        )}
      </div>
    </li>
  );
}
