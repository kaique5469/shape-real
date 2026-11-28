import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "../legal";

export const metadata: Metadata = { title: "Termos de uso", alternates: { canonical: "/termos" } };

export default function Termos() {
  return (
    <LegalPage title="Termos de uso" updated="27/11/2026">
      <p>Ao usar o Shape Real você concorda com estes termos. Revise este texto com seu assessor jurídico antes da publicação comercial.</p>
      <h2>Natureza do serviço</h2>
      <p>
        O Shape Real é uma ferramenta de organização de treino e alimentação. As sugestões geradas, inclusive por inteligência artificial, são informativas e não substituem
        avaliação médica, de profissional de educação física (CREF) ou de nutricionista (CRN).
      </p>
      <h2>Beta sem cadastro</h2>
      <p>
        No beta, os dados ficam no aparelho de quem usa, sem conta na nuvem. Se o navegador apagar os dados do site, ou se o aparelho for perdido sem uma cópia de
        segurança, não há como recuperar. Faça a cópia de segurança de vez em quando. Os detalhes estão na{" "}
        <Link href="/privacidade" className="font-semibold underline">
          Política de privacidade
        </Link>
        .
      </p>
      <h2>Responsabilidade</h2>
      <p>Interrompa o exercício em caso de dor e procure um profissional. Personais são responsáveis pelas prescrições que enviam aos seus alunos.</p>
      <h2>Planos e pagamento</h2>
      <p>
        No beta não há cobrança. Depois do beta, os planos pagos serão cobrados de forma recorrente e poderão ser cancelados a qualquer momento, valendo até o fim do
        período pago.
      </p>
      <h2>Uso aceitável</h2>
      <p>É proibido usar o serviço para fins ilícitos, compartilhar dados de terceiros sem autorização ou tentar acessar dados de outros usuários.</p>
    </LegalPage>
  );
}
