"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ProgramGenerator } from "@/components/program/program-generator";
import { PageHeader } from "@/components/ui";
import { useApp } from "@/lib/app-context";

export default function NovaFichaPage() {
  const { user } = useApp();
  const router = useRouter();
  const coach = user!.role === "coach";
  return (
    <>
      <Link href="/treinos" className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-steel hover:text-iron">
        <ArrowLeft className="size-4" /> {coach ? "Modelos" : "Fichas"}
      </Link>
      <PageHeader
        title={coach ? "Novo modelo de ficha" : "Nova ficha"}
        sub={coach ? "Defina o perfil de aluno para quem o modelo serve. Você revisa tudo antes de salvar." : "Responda e o app monta a ficha no sistema escolhido. Você revisa antes de salvar."}
      />
      <ProgramGenerator owner={user!} onSaved={(p) => router.push(`/treinos/${p.id}?salva=1`)} />
    </>
  );
}
