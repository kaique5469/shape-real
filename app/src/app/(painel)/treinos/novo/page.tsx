"use client";

import { useRouter } from "next/navigation";
import { ProgramGenerator } from "@/components/program/program-generator";
import { PageHeader } from "@/components/ui";
import { useApp } from "@/lib/app-context";

export default function NovaFichaPage() {
  const { user } = useApp();
  const router = useRouter();
  return (
    <>
      <PageHeader title="Nova ficha" sub="Responda e a IA monta a ficha no sistema escolhido. Você revisa antes de salvar." />
      <ProgramGenerator owner={user!} onSaved={(p) => router.push(`/treinos/${p.id}?salva=1`)} />
    </>
  );
}
