"use client";

import { use } from "react";
import { ProgramEditor } from "@/components/program/program-editor";
import { Skeleton } from "@/components/ui";
import { useStudent } from "../../student";

export default function EditarFichaAluno({ params }: { params: Promise<{ id: string; pid: string }> }) {
  const { id, pid } = use(params);
  const { data: student, loading } = useStudent(id);
  if (loading) return <Skeleton className="h-96" />;
  return <ProgramEditor programId={pid} student={student} back={{ href: `/alunos/${id}?aba=ficha`, label: student?.name ?? "Voltar ao aluno" }} />;
}
