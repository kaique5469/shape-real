import type { Metadata } from "next";
import { LegalPage } from "../legal";

export const metadata: Metadata = { title: "Privacidade", alternates: { canonical: "/privacidade" } };

export default function Privacidade() {
  return (
    <LegalPage title="Política de privacidade" updated="22/11/2026">
      <p>
        Esta política explica como o Shape Real trata seus dados, em conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018). Revise este texto com seu
        assessor jurídico antes da publicação comercial.
      </p>
      <h2>Quais dados coletamos</h2>
      <ul>
        <li>Conta: nome, e-mail e papel (aluno ou personal).</li>
        <li>Treino: fichas, séries, cargas, repetições e anotações.</li>
        <li>Dados de saúde (sensíveis): peso, medidas, percentual de gordura, fotos de evolução, dieta e limitações físicas que você informar.</li>
        <li>
          Uso do app: quais telas e recursos são usados e os erros técnicos que acontecem, para corrigir falhas e melhorar o produto. Esses registros não levam dados de
          saúde, nomes de alunos, telefones nem o texto que você digita.
        </li>
      </ul>
      <h2>Base legal e finalidade</h2>
      <p>
        Dados de saúde são tratados com <strong>consentimento específico</strong>, exclusivamente para montar e acompanhar o treino e a dieta. O app guarda a data da
        autorização e por qual caminho ela foi dada:
      </p>
      <ul>
        <li>
          <strong>Cadastro feito pelo personal.</strong> Limitações, peso, altura e medidas do aluno só são salvos quando o personal marca “O aluno autorizou registrar
          estes dados de saúde”. Ao marcar, o personal confirma que pediu e recebeu essa autorização do aluno.
        </li>
        <li>
          <strong>Ficha recebida por link.</strong> Ao abrir o link enviado pelo personal, o aluno lê, logo acima do botão “Salvar no meu celular”, que ao salvar autoriza
          guardar no celular os dados de treino e saúde enviados pelo personal. O toque no botão registra a autorização.
        </li>
        <li>
          <strong>Quem usa sozinho.</strong> Na primeira vez que salva peso ou medidas, a pessoa marca “Autorizo guardar meus dados de saúde neste celular”.
        </li>
      </ul>
      <p>
        No uso sem cadastro, a autorização nunca é registrada sozinha: ela depende sempre de uma dessas ações. Você pode revogar o consentimento a qualquer momento
        apagando os dados ou a conta.
      </p>
      <h2>Quem acessa</h2>
      <p>
        Somente você e o personal que você aceitou por código de convite. O personal perde o acesso quando o vínculo é desfeito por qualquer uma das partes. Fotos ficam em
        armazenamento privado com links temporários.
      </p>
      <h2>Inteligência artificial</h2>
      <p>
        A IA só é usada quando está ligada para você (no beta, apenas no teste por convite). Sem ela, fichas e análises de dieta são calculadas no próprio celular e
        nada é enviado. Com ela, para gerar fichas e analisar dietas, enviamos ao provedor de IA apenas as informações necessárias (objetivo, nível, limitações informadas,
        metas, peso e texto da refeição). Não enviamos nome, e-mail ou fotos.
      </p>
      <h2>Medição de uso e erros</h2>
      <p>
        Usamos o PostHog (operador com servidores nos Estados Unidos) para contar o uso das telas e registrar erros. A gravação de tela fica desligada, o texto dos
        elementos clicados não é coletado e, sem conta, os registros são anônimos. No modo de teste sem cadastro, alunos, fichas, treinos, medidas e dietas ficam
        guardados apenas no seu aparelho.
      </p>
      <h2>Seus direitos</h2>
      <p>Acesso, correção, portabilidade (exportação em planilha), anonimização e exclusão. Use a página Conta no app ou escreva para o contato do controlador.</p>
      <h2>Retenção</h2>
      <p>Mantemos os dados enquanto a conta existir. Ao excluir a conta, os dados são apagados em até 30 dias, salvo obrigação legal.</p>
    </LegalPage>
  );
}
