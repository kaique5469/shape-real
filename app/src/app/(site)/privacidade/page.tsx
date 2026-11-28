import type { Metadata } from "next";
import { LegalPage } from "../legal";

export const metadata: Metadata = { title: "Privacidade", alternates: { canonical: "/privacidade" } };

/**
 * Rodada 3 (R3-9): três blocos. (1) o beta neste aparelho, (2) o que vai pelo WhatsApp (com o único aviso de que quem
 * tem o link consegue ler) e (3) a conta na nuvem, que ainda não existe. Convite, links temporários e retenção por
 * conta só aparecem no bloco 3 (há teste). Controlador e contato continuam com o dono; a nota jurídica fica.
 */
export default function Privacidade() {
  return (
    <LegalPage title="Política de privacidade" updated="27/11/2026">
      <p>Esta política explica quais dados o Shape Real trata, para quê e quais são seus direitos pela LGPD (Lei 13.709/2018).</p>
      <p>Revise este texto com seu assessor jurídico antes da publicação comercial.</p>

      <section aria-labelledby="neste-aparelho" data-bloco="aparelho" className="space-y-5">
        <h2 id="neste-aparelho">Beta neste aparelho</h2>
        <p>No beta não há conta nem cadastro. O que você registra fica guardado no navegador deste aparelho:</p>
        <ul>
          <li>Perfil: nome, papel (aluno ou personal) e o que você preencher no cadastro.</li>
          <li>Treino: fichas, séries, cargas, repetições e anotações.</li>
          <li>Dados de saúde (sensíveis): peso, medidas, percentual de gordura, fotos de evolução, dieta e limitações físicas que você informar.</li>
          <li>No aparelho do personal: os alunos, as fichas, os treinos que eles mandaram e as respostas do questionário.</li>
          <li>
            Uso do app: quais telas e recursos são usados e os erros técnicos que acontecem, para corrigir falhas e melhorar o produto. Esses registros não levam dados de
            saúde, nomes de alunos, telefones nem o texto que você digita.
          </li>
        </ul>
        <p>
          Os dados ficam neste aparelho até você apagar (Conta → Apagar dados deste aparelho) ou até o navegador limpar os dados do site. Não existe um prazo fixo de
          guarda: depende de você e do navegador. Quem usa este aparelho consegue ver o que está nele.
        </p>
        <p>
          A cópia de segurança é um arquivo com os seus dados, inclusive os de saúde (no aparelho do personal, também os dos alunos). Ela serve para levar tudo a outro
          aparelho. Guarde o arquivo com cuidado e não mande para outras pessoas. As fotos de evolução ficam só no aparelho: não entram na cópia.
        </p>
        <p>
          Apagar ou revogar respostas neste aparelho não apaga cópias de segurança feitas antes. Se uma cópia antiga for restaurada em outro aparelho, as respostas
          voltam. Apague as cópias antigas se não precisar delas.
        </p>
      </section>

      <section aria-labelledby="pelo-whatsapp" data-bloco="whatsapp" className="space-y-5">
        <h2 id="pelo-whatsapp">O que você manda pelo WhatsApp</h2>
        <p>
          Ficha, dieta, treinos e respostas do questionário vão dentro do próprio link, depois do “#”: o conteúdo não passa pelo nosso servidor. Quem recebe guarda
          uma cópia no celular dele e nas cópias de segurança que fizer.
        </p>
        <p>Desfazer o vínculo ou apagar os seus dados não apaga a cópia de quem recebeu. Para o que você já enviou, peça a quem recebeu.</p>
        <p>
          <strong>
            Quem tiver o link consegue ler o conteúdo (vai compactado, sem senha). Não encaminhe a mensagem. Limpar a barra de endereço não apaga a cópia que ficou no
            WhatsApp.
          </strong>
        </p>
      </section>

      <h2>Questionário inicial</h2>
      <p>
        O personal pode pedir o questionário pelo WhatsApp ou preencher com você. As respostas de saúde só são guardadas com a sua autorização, marcada no próprio
        questionário, com data. Elas viajam dentro do link do WhatsApp, que não passa pelo nosso servidor, e ficam no celular do personal e nas cópias de segurança que
        ele fizer. Para ver, corrigir ou apagar, peça ao personal: ele apaga em um toque. Nada das respostas vai para a nossa medição de uso: na página do
        questionário contamos só quantas pessoas abrem e terminam, sem nenhuma resposta e sem guardar o endereço IP. Não pedimos CPF, endereço, fotos nem exames.
      </p>

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
        apagando os dados deste aparelho. O que você já enviou fica com quem recebeu.
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

      <section aria-labelledby="conta-na-nuvem" data-bloco="nuvem" className="space-y-5">
        <h2 id="conta-na-nuvem">Conta na nuvem (quando existir; hoje não disponível)</h2>
        <p>O beta não tem conta na nuvem. Esta parte só vale quando ela existir:</p>
        <ul>
          <li>Conta: nome, e-mail e papel (aluno ou personal).</li>
          <li>
            Quem acessa: você e o personal que você aceitar por código de convite. O personal perde o acesso quando o vínculo é desfeito por qualquer uma das partes.
          </li>
          <li>Fotos em armazenamento privado, com links temporários.</li>
          <li>Retenção: os dados ficam enquanto a conta existir. Ao excluir a conta, eles são apagados em até 30 dias, salvo obrigação legal.</li>
        </ul>
      </section>
    </LegalPage>
  );
}
