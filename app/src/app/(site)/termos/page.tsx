import type { Metadata } from "next";
import { LegalPage } from "../legal";

export const metadata: Metadata = { title: "Termos de uso", alternates: { canonical: "/termos" } };

export default function Termos() {
  return (
    <LegalPage title="Termos de uso" updated="15/11/2026">
      <p>Ao usar o Shape Real você concorda com estes termos. Revise este texto com seu assessor jurídico antes da publicação comercial.</p>
      <h2>Natureza do serviço</h2>
      <p>
        O Shape Real é uma ferramenta de organização de treino e alimentação. As sugestões geradas, inclusive por inteligência artificial, são informativas e não substituem
        avaliação médica, de profissional de educação física (CREF) ou de nutricionista (CRN).
      </p>
      <h2>Responsabilidade</h2>
      <p>Interrompa o exercício em caso de dor e procure um profissional. Personais são responsáveis pelas prescrições que enviam aos seus alunos.</p>
      <h2>Planos e pagamento</h2>
      <p>Planos pagos são cobrados de forma recorrente e podem ser cancelados a qualquer momento, valendo até o fim do período pago.</p>
      <h2>Uso aceitável</h2>
      <p>É proibido usar o serviço para fins ilícitos, compartilhar dados de terceiros sem autorização ou tentar acessar dados de outros usuários.</p>
    </LegalPage>
  );
}
