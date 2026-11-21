"use client";

import Link from "next/link";
import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ProgramGenerator } from "@/components/program/program-generator";
import { Alert, LinkButton, PageHeader, Skeleton } from "@/components/ui";
import { firstName } from "@/lib/domain/format";
import { useStudent } from "../../student";

export default function NovaFichaAluno({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: student, loading } = useStudent(id);
  if (loading) return <Skeleton className="h-96" />;
  if (!student)
    return (
      <div className="space-y-4">
        <Alert tone="error">Aluno não encontrado.</Alert>
        <LinkButton href="/alunos" variant="secondary">
          Voltar para alunos
        </LinkButton>
      </div>
    );
  return (
    <>
      <Link href={`/alunos/${id}?aba=ficha`} className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-steel hover:text-iron">
        <ArrowLeft className="size-4" /> {student.name}
      </Link>
      <PageHeader title={`Nova ficha para ${firstName(student.name)}`} sub="As respostas vêm do cadastro do aluno. Ajuste o que quiser, gere uma base e revise antes de salvar." />
      <ProgramGenerator owner={student} forName={student.name} onSaved={(p) => router.push(`/alunos/${id}/ficha/${p.id}?enviada=1`)} />
    </>
  );
}
