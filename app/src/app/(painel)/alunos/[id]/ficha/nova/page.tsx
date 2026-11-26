"use client";

import Link from "next/link";
import { Suspense, use, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ProgramGenerator } from "@/components/program/program-generator";
import { Alert, LinkButton, PageHeader, Skeleton } from "@/components/ui";
import { firstName } from "@/lib/domain/format";
import { readAnamnese } from "@/lib/domain/questionario-link";
import { useStudent } from "../../student";

export default function NovaFichaAluno({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <NovaFicha id={id} />
    </Suspense>
  );
}

/**
 * `?auto=1` (passo "Gerar ficha com estas respostas" e resumo do aluno): a prévia já abre gerada quando não há trava
 * nem porta; com elas, abre o diálogo. O parâmetro vale uma vez: sai da barra para a recarga não gerar de novo.
 */
function NovaFicha({ id }: { id: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const [auto] = useState(() => search.get("auto") === "1");
  const { data: student, loading, setData } = useStudent(id);
  useEffect(() => {
    if (auto) window.history.replaceState(null, "", window.location.pathname);
  }, [auto]);
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
  const first = firstName(student.name);
  const comRespostas = readAnamnese(student) !== null;
  return (
    <>
      <Link href={`/alunos/${id}?aba=ficha`} className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-steel hover:text-iron">
        <ArrowLeft className="size-4" /> {student.name}
      </Link>
      <PageHeader
        title={`Nova ficha para ${first}`}
        sub={
          comRespostas
            ? `As escolhas vêm do questionário e do cadastro de ${first}. Ajuste o que quiser, gere uma base e revise antes de salvar.`
            : "As respostas vêm do cadastro do aluno. Ajuste o que quiser, gere uma base e revise antes de salvar."
        }
      />
      <ProgramGenerator owner={student} forName={student.name} auto={auto} onOwnerChange={setData} onSaved={(p) => router.push(`/alunos/${id}/ficha/${p.id}?enviada=1`)} />
    </>
  );
}
