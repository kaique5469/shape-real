"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Program, Session } from "@/lib/domain/types";

/** Carrega dados assíncronos com estados de carregamento/erro e recarga manual. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fnRef.current());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload, setData };
}

/** Próximo dia da ficha ativa, seguindo a rotação a partir do último treino registrado. */
export function nextDayKey(program: Program, sessions: Session[]): string {
  const last = sessions.filter((s) => s.programId === program.id && s.dayKey).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (!last) return program.days[0]?.key ?? "A";
  const i = program.days.findIndex((d) => d.key === last.dayKey);
  return program.days[(i + 1) % program.days.length]?.key ?? program.days[0]!.key;
}

export function relativeDay(iso: string | null, now = new Date()): string {
  if (!iso) return "nunca";
  const d = new Date(iso);
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  if (days < 30) return `há ${Math.floor(days / 7)} sem.`;
  return d.toLocaleDateString("pt-BR");
}

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" }) {
  return new Date(iso.length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString("pt-BR", opts).replace(".", "");
}

export function fmtNum(v: number | null | undefined, digits = 1) {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("pt-BR", { maximumFractionDigits: digits });
}
