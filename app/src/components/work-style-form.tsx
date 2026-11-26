"use client";

import { useId, useState } from "react";
import { Field, Segmented, Select, cx } from "@/components/ui";
import { ALIMENTACOES, ATENDIMENTOS, PUBLICOS, type Alimentacao, type Atendimento, type Publico, type WorkStyle } from "@/lib/domain/anamnese-types";
import { SYSTEMS } from "@/lib/domain/systems";
import type { SystemId } from "@/lib/domain/types";
import {
  ALIMENTACAO_ROTULO,
  ATENDIMENTO_ROTULO,
  DIAS_JEITO,
  DICA_ALIMENTACAO,
  MINUTOS_JEITO,
  PERGUNTAS_JEITO,
  PUBLICO_MAX,
  PUBLICO_ROTULO,
  SEMANAS_JEITO,
  alternarPublico,
} from "@/lib/domain/work-style";

/**
 * As 5 perguntas do jeito de trabalhar (spec §3.2), só toques: grupos de rádio nas de escolha única e chips com
 * `aria-pressed` em "Quem você mais atende?" (até 2). Alvos de 44 px. `compact` = versão do onboarding (sem a
 * "Divisão preferida", que fica em Conta). Controlado: cada toque chama `onChange` com o jeito inteiro; quem salva é
 * quem chama. Raiz com `ph-no-capture`.
 */
export function WorkStyleForm({ value, onChange, compact = false }: { value: WorkStyle | undefined; onChange: (ws: WorkStyle) => void; compact?: boolean }) {
  const ws = value ?? {};
  const patch = (p: Partial<WorkStyle>) => onChange({ ...ws, ...p });
  const publico = ws.publico ?? [];
  const cheio = publico.length >= PUBLICO_MAX;
  const [aviso, setAviso] = useState<string | null>(null);
  const avisoId = useId();

  return (
    <div className={cx("ph-no-capture", compact ? "space-y-6" : "space-y-7")}>
      <Field group label={PERGUNTAS_JEITO.atendimento}>
        <Segmented<Atendimento | "">
          label={PERGUNTAS_JEITO.atendimento}
          value={ws.atendimento ?? ""}
          onChange={(v) => v && patch({ atendimento: v })}
          className="grid grid-cols-1 sm:grid-cols-2"
          options={ATENDIMENTOS.map((a) => ({ value: a, label: ATENDIMENTO_ROTULO[a] }))}
        />
      </Field>

      <Field group label={`${PERGUNTAS_JEITO.publico} (até ${PUBLICO_MAX})`}>
        <div className="flex flex-wrap gap-1.5">
          {PUBLICOS.map((p: Publico) => {
            const on = publico.includes(p);
            const bloqueado = !on && cheio;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                aria-disabled={bloqueado || undefined}
                aria-describedby={bloqueado && aviso ? avisoId : undefined}
                onClick={() => {
                  if (bloqueado) return setAviso(`Você já marcou ${PUBLICO_MAX}. Desmarque uma para trocar.`);
                  setAviso(null);
                  patch({ publico: alternarPublico(publico, p) });
                }}
                className={cx(
                  "min-h-11 rounded-full border px-3.5 text-[0.9375rem] font-semibold",
                  on ? "border-iron bg-iron text-chalk" : "border-rule-strong bg-paper text-iron hover:border-iron",
                  bloqueado && "opacity-50",
                )}
              >
                {PUBLICO_ROTULO[p]}
              </button>
            );
          })}
        </div>
        <p id={avisoId} role="status" className={cx("text-sm text-steel", aviso && "mt-1.5")}>
          {aviso}
        </p>
      </Field>

      <Field group label={PERGUNTAS_JEITO.diasMinutos}>
        <div className="space-y-3">
          <div>
            <span className="mb-1 block text-[0.8125rem] text-steel" aria-hidden>
              Dias por semana
            </span>
            <Segmented<number>
              label="Dias por semana"
              value={ws.dias ?? 0}
              onChange={(d) => patch({ dias: d as WorkStyle["dias"] })}
              columns={4}
              options={DIAS_JEITO.map((d) => ({ value: d, label: `${d} dias` }))}
            />
          </div>
          <div>
            <span className="mb-1 block text-[0.8125rem] text-steel" aria-hidden>
              Tempo por treino
            </span>
            <Segmented<number>
              label="Tempo por treino"
              value={ws.minutos ?? 0}
              onChange={(m) => patch({ minutos: m as WorkStyle["minutos"] })}
              columns={4}
              options={MINUTOS_JEITO.map((m) => ({ value: m, label: `${m} min` }))}
            />
          </div>
        </div>
      </Field>

      <Field group label={PERGUNTAS_JEITO.semanas}>
        <Segmented<number>
          label={PERGUNTAS_JEITO.semanas}
          value={ws.semanas ?? 0}
          onChange={(n) => patch({ semanas: n as WorkStyle["semanas"] })}
          columns={2}
          options={SEMANAS_JEITO.map((n) => ({ value: n, label: `${n} semanas` }))}
        />
      </Field>

      <Field group label={PERGUNTAS_JEITO.alimentacao} hint={DICA_ALIMENTACAO}>
        <Segmented<Alimentacao | "">
          label={PERGUNTAS_JEITO.alimentacao}
          value={ws.alimentacao ?? ""}
          onChange={(v) => v && patch({ alimentacao: v })}
          className="mb-1 grid grid-cols-1"
          options={ALIMENTACOES.map((a) => ({ value: a, label: ALIMENTACAO_ROTULO[a] }))}
        />
      </Field>

      {compact ? null : (
        <Field label="Divisão preferida (opcional)" hint="Vale na ficha gerada quando cabe nos dias do aluno. Sem escolha, o app sugere pelos dias e pelo nível.">
          <Select
            value={ws.divisao ?? ""}
            onChange={(e) => {
              const v = e.target.value as SystemId | "";
              if (v) return patch({ divisao: v });
              const { divisao: _d, ...resto } = ws;
              void _d;
              onChange(resto);
            }}
          >
            <option value="">Deixar o app sugerir</option>
            {SYSTEMS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </div>
  );
}
