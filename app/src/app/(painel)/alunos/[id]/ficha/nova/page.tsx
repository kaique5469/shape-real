"use client";

import Link from "next/link";
import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ProgramGenerator } from "@/components/program/program-generator";
import { Alert, PageHeader, Skeleton } from "@/components/ui";
import { useStudent } from "../../student";

export default function NovaFichaAluno({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: student, loading } = useStudent(id);
  if (loading) return <Skeleton className="h-96" />;
  if (!student) return <Alert tone="error">Aluno não encontrado.</Alert>;
  return (
    <>
      <Link href={`/alunos/${id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-steel hover:text-iron">
        <ArrowLeft className="size-4" /> {student.name}
      </Link>
      <PageHeader title={`Nova ficha para ${student.name.split(" ")[0]}`} sub="As respostas vêm do perfil do aluno. Ajuste, gere com IA, revise e envie." />
      <ProgramGenerator owner={student} forName={student.name} onSaved={(p) => router.push(`/alunos/${id}/ficha/${p.id}?enviada=1`)} />
    </>
  );
}
