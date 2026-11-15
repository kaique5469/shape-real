import type { Metadata } from "next";
import { LegalPage } from "../legal";

export const metadata: Metadata = { title: "Privacidade", alternates: { canonical: "/privacidade" } };

export default function Privacidade() {
  return (
    <LegalPage title="Política de privacidade" updated="15/11/2026">
      <p>
        Esta política explica como o Shape Real trata seus dados, em conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018). Revise este texto com seu
        assessor jurídico antes da publicação comercial.
      </p>
      <h2>Quais dados coletamos</h2>
      <ul>
        <li>Conta: nome, e-mail e papel (aluno ou personal).</li>
        <li>Treino: fichas, séries, cargas, repetições e anotações.</li>
        <li>Dados de saúde (sensíveis): peso, medidas, percentual de gordura, fotos de evolução, dieta e limitações físicas que você informar.</li>
        <li>Uso do app: eventos de navegação sem dados de saúde, para melhorar o produto.</li>
      </ul>
      <h2>Base legal e finalidade</h2>
      <p>
        Dados de saúde são tratados com seu <strong>consentimento específico</strong>, registrado no cadastro, exclusivamente para gerar e acompanhar seu treino e sua dieta.
        Você pode revogar o consentimento a qualquer momento apagando os dados ou a conta.
      </p>
      <h2>Quem acessa</h2>
      <p>
        Somente você e o personal que você aceitou por código de convite. O personal perde o acesso quando o vínculo é desfeito por qualquer uma das partes. Fotos ficam em
        armazenamento privado com links temporários.
      </p>
      <h2>Inteligência artificial</h2>
      <p>
        Para gerar fichas e analisar dietas, enviamos ao provedor de IA apenas as informações necessárias (objetivo, nível, metas, texto da refeição). Não enviamos nome,
        e-mail ou fotos.
      </p>
      <h2>Seus direitos</h2>
      <p>Acesso, correção, portabilidade (exportação em planilha), anonimização e exclusão. Use a página Conta no app ou escreva para o contato do controlador.</p>
      <h2>Retenção</h2>
      <p>Mantemos os dados enquanto a conta existir. Ao excluir a conta, os dados são apagados em até 30 dias, salvo obrigação legal.</p>
    </LegalPage>
  );
}
