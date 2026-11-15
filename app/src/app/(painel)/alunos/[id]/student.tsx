"use client";

import { useApp } from "@/lib/app-context";
import { useLoad } from "@/lib/hooks";

/** Carrega o perfil do aluno (o RLS garante que só o personal vinculado enxerga). */
export function useStudent(id: string) {
  const { repo } = useApp();
  return useLoad(() => repo.getProfile(id), [id, repo]);
}
