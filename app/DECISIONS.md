# Decisões

Escolhas que divergem da spec do lote ou que não são óbvias pelo código. Uma entrada por decisão, com data e motivo.

## 2026-11-22 — Textos de sugestão de carga encurtados para caber em 2 linhas a 360 px

A spec de "por que esse peso" pede textos literais e, no mesmo item, "no máximo 2 linhas a 360 px". Medido com a
fonte do app (Archivo 600, 14/20 px, parágrafo de 310 px), três textos passavam de 2 linhas. Venceu a regra das 2 linhas:

- Salto grande: "Salto grande (14 → 16 kg): abaixo de 10 reps no início é normal. Mantenha 16 kg."
- Retorno após pausa: "Faz 18 dias sem este exercício: volte com 36 kg e reencontre o ritmo." (vale para carga,
  peso extra, ajuda do graviton e "sem forçar"; o pior caso, "120 dias" com "67,5 kg de peso extra", fica em 2 linhas).
- Cargas variadas: "Cargas variadas: repita o esquema e tente mais 1 rep na série mais pesada."

## 2026-11-22 — Guarda de digitação mede contra a mediana de todas as séries

A spec dizia "1,5× a mediana das outras séries". Com 3 séries, isso fazia uma única série mais leve (4/40/40 ou
aquecimento 15/50/50) derrubar as duas séries reais e a sugestão virar 4 ou 15 kg. Agora a série é ignorada só se passar
de 1,5× a mediana de todas as séries do registro e se for minoria. Série mais leve nunca é tratada como erro.

## 2026-11-22 — Retorno após pausa: o Hoje não promete "10%"

O motor continua sugerindo ~90% da carga, arredondado para baixo até uma carga que existe. Em máquina de anilha com
degrau de 10 kg e carga baixa (leg press a 40 kg), isso dá 30 kg (25% a menos). Em vez de criar exceções de
arredondamento, o aviso do Hoje passou a dizer "Hoje as cargas sugeridas vêm mais leves." sem número.

## 2026-11-22 — Diálogo "Você preencheu N séries sem marcar" sempre com 3 botões

A spec pede os 3 botões mesmo sem nenhuma série marcada. "Finalizar sem elas" continua visível; sem nenhuma série
marcada, o toque mostra "Marque pelo menos uma série como feita para salvar o treino." (nada é salvo vazio).

## 2026-11-22 — Lembrete de cópia: "nunca fez" conta a partir da criação do perfil

A spec diz "só quando houver 14 dias ou mais sem cópia". Contar "nunca" como atrasado mostrava o lembrete no primeiro
dia, logo depois do 1º aluno real. Quem nunca fez cópia vê o lembrete em Hoje e em /alunos 14 dias depois da criação
do perfil (com os dados relevantes de sempre). Em Conta a linha continua aparecendo sempre.

## 2026-11-22 — Autorização de saúde sem origem não vale em perfil de aluno

Versões anteriores gravavam `consentHealthAt` sozinhas em todo aluno cadastrado pelo personal (`managedBy`) e em toda
ficha recebida por link (`remoteCoach`). Nesses perfis, data sem `consentSource` não conta como autorização: o checkbox
começa desmarcado e o personal (ou o aluno, em Conta) confirma de novo. No perfil próprio, a data sem origem continua
valendo, porque só era gravada pelo checkbox do onboarding ou de Conta. Nada é apagado do armazenamento.

## 2026-11-22 — /abrir no Safari do iPhone sem perfil: card só informativo

O card "Usa o Shape Real pela tela de início?" deixou de ter o botão "Salvar aqui mesmo". O caminho principal fica
igual ao do Android: texto de autorização logo acima de "Salvar no meu celular" (com aria-describedby) e "Sem cadastro…".

## 2026-11-22 — Botões − e + das séries continuam com 32 px de largura a 360 px

A linha da série tem, em 310 px, número, carga, reps e ✓ (44 px). Com − e + de 44 px nas duas células, o campo de carga
ficaria com 26 px e "102,5" (43 px em negrito) seria cortado. Os botões ficam com 32 × 48 px no celular e 40 px a partir
de sm. O "Fechar" dos diálogos passou para 44 × 44 px.

## 2026-11-23 — Revisão de UX externa: o que entra nesta rodada

Entram só os itens de UX marcados como "agora" na spec consolidada (U1–U8), menos o U7c, que vai junto com o
questionário de anamnese (os arquivos dele são reescritos lá). O questionário em si é a próxima rodada. Ficaram
rejeitados pelo dono: "Conferido pelo personal", abas "Meu plano/Diário", recorde dourado, "Salvar e enviar" e o
rodapé compacto ligado ao foco. As entradas abaixo são as decisões de UX desta rodada, escritas de uma vez.

## 2026-11-23 — Série: caixa vazia no pendente, preenchida sinalizada no controle, recorde verde com selo

O pendente mostrava um ✓ preto numa borda de 1,93:1, com cara de feito: passa a caixa vazia com borda `field`. A
série preenchida e sem ✓ ganha borda `iron` no controle e a descrição "Preenchida, falta marcar"; os valores
continuam em `suggest`, porque o preto dos valores significa "registrado" (pintar de preto aumentaria o "esqueci de
marcar"). Recorde = ✓ verde de concluído + selo de troféu em `record`: uma aparência só para "feito".

## 2026-11-23 — Remoção no ⋯, com confirmação só quando há dado em jogo; Desfazer adiado

"− Série" e "Remover" saem da linha do exercício (eram 4 botões iguais e apagavam série feita sem perguntar) e vão
para o ⋯. Confirma só quando há série digitada ou marcada; vazio sai na hora. A barra "Desfazer" fica adiada: seria
mais uma faixa num rodapé que já cobre até 237 px e ruído na ação mais frequente. Reabre se `remocao_cancelada`
mostrar que os diálogos pegam muita remoção por engano.

## 2026-11-23 — Grupo de bi-set fixado no rascunho no início do treino; avanço só com o exercício completo

Os grupos eram recalculados a cada render: removido um membro, o app inventava um par ("Faça em sequência com
Abdominal supra"). Agora o grupo é gravado no rascunho quando o treino começa; grupo que ficou com um exercício é
"desfeito neste treino" (descanso normal). Marcar a última série com outras pendentes não fecha mais o exercício.

## 2026-11-23 — Valor digitado acima de 999 não é aceito nem gravado como 999

Com a seleção do Safari falhando, "30" + "35" virava "3035" e o app gravava 999 sem aviso. Número que a pessoa não
digitou não pode ser gravado: o campo volta ao valor anterior e avisa "Acima de 999 não é aceito.". O + continua
parando em 999.

## 2026-11-23 — Estados de envio descrevem o que o aparelho viu; "Conferido pelo personal" rejeitado

Sem servidor, o app só sabe que houve o toque em "Enviar no WhatsApp" ou a cópia da mensagem, e quando. Os textos
dizem isso ("Envio iniciado às 18:40", "Mensagem copiada às 18:40") e nunca "enviado para", "aberto no WhatsApp",
"chegou" ou "conferido". "Recebido" só com evidência (o treino de volta com a versão da ficha). Recibo dentro do app
e a inferência "não está no app" ficam para a próxima rodada, por gatilho.

## 2026-11-23 — Um registro só do envio da ficha: `sr:sent:{aluno}:ficha`, gravado no toque

Decisão do dono e do tech lead, acima da spec da anamnese (D-27, `program.sharedAt`): o envio da ficha e da dieta
fica num registro único no aparelho do personal, `sr:sent:{alunoId}:ficha` = `{ at, via, programAt, dietAt }`,
gravado no toque de envio (`markFichaPrepared`). Não existe `program.sharedAt`. Motivos: o editor grava a ficha
inteira a partir do próprio estado e apagaria `sharedAt` no próximo "Salvar ficha"; o registro guarda também a versão
da dieta; e não pede coluna na nuvem para um dado só do modo local. A versão é por conteúdo (o `updatedAt` que vai no
pacote e volta como eco com os treinos), não pelo `sentAt` do pacote, que muda a cada abertura do diálogo. Um bloco
`ficha` malformado no link de treinos é ignorado sem recusar o link. O marcador `sr:sent:@desde` diz desde quando o
aparelho registra envios e fica fora da cópia de segurança: num aparelho novo, o que é mais antigo vira "sem
informação" em vez de "não enviada". "Apagar dados deste aparelho" apaga todas as chaves `sr:sent*`; remover um
aluno apaga as dele.

## 2026-11-23 — `updatedAt` da ficha e da dieta = edição de conteúdo

Finalizar treino, copiar a carga que o aluno fez e restaurar a cópia gravam com `keepUpdatedAt`; enviar não grava
nada na ficha. Sem isso, a ficha "mudaria" depois de cada treino e o registro de envio afirmaria uma versão nova que
ninguém editou. A opção entrou no contrato do repositório (`saveProgram` e `saveDiet`, local e nuvem) já nesta
rodada, como a peça mínima que a fundação da anamnese faria. O rascunho do editor guarda a assinatura da versão de
partida, para não voltar por cima de uma carga espelhada depois.

## 2026-11-23 — Conteúdo alterado no aparelho do aluno não leva nome nem CREF do personal

Ficha ou dieta ajustada pelo aluno (`adjustedAt`, só no aparelho dele e descartado no link) sai no texto e na
impressão como "Ajustada em 24/11/2026 a partir da ficha de Rafael Nunes.", sem a assinatura nem o CREF: o conteúdo
já não é o que o personal prescreveu.

## 2026-11-23 — Dieta: "Metas do dia" × "Total do cardápio", sem barras e sem cor de estado

As barras e o vermelho de "passou" faziam o total do cardápio parecer o que a pessoa já comeu. A tela separa as
metas do dia do total do cardápio, sem comparação na leitura; nenhum número de dieta usa cor de estado. No ajuste do
plano do personal só as refeições mudam. O analisador não grava o texto e não manda a nota à medição (o `score` sai
de `diet_analyzed` e é descartado mesmo se uma tela antiga mandar). Diário alimentar e abas "Meu plano/Diário" ficam
de fora; a próxima refeição (com tolerância de 30 min) vem depois, com dado de uso.

## 2026-11-23 — Fila do personal: sem ficha nunca vira "Chamar … Se treinou"

Aluno sem ficha entrava como "sem notícias" com "Se treinou, me manda pelo app". Agora não entra no "Chamar". Para
quem nunca mandou treino, as notícias contam de max(vínculo, criação da ficha). "Revisão combinada para hoje" não é
motivo: na anamnese, reavaliação = fim da validade da ficha, que já aparece como ficha vencendo ou vencida.

## 2026-11-23 — Evolução e relatório: "Antes e agora" × "Primeiro e último registro"

"Antes e agora" só para o aluno com marca nos últimos 14 dias; senão, "Primeiro e último registro". Tipos de
progresso (força, repetições, tempo, ajuda, duplo); nada de 1RM acima de 12 repetições; marca com mais que o dobro
da maior válida anterior fica fora (mesma trava do recorde). O relatório usa só força, com a mesma comparação. A
observação do personal na Evolução fica adiada, com critério de volta.

## 2026-11-23 — Cores: vermelho vivo é marca, anilha e recorde; atenção é âmbar; destrutivo e erro são vinho

Identidade e recorde dividem o vermelho (#d3241c) e se distinguem pela forma: recorde sempre com troféu + palavra
(`RecordMark`); recorde dourado rejeitado (o amarelo já é atenção e seleção, e o dourado que passa no contraste vira
marrom). Atenção = âmbar (ícone `warn-ink`, texto `iron`). Destrutivo, erro e bloqueio de segurança = vinho
(`danger`), sem preenchimento e com ícone. A variante de botão `record` deixou de existir: "Finalizar treino" e
"Parar" são `primary`, "Enviar para {personal}" no resumo é `inverse`. O `Segmented` continua preto. Borda de campo =
`pencil` (`field`, 3,39:1 no papel e 3,02:1 no chalk; o tom proposto antes falhava no chalk). Foco em superfície
escura = chalk, por uma regra fora de `@layer`; todo `Dialog` declara `data-surface="light"` para o azul voltar. Os
níveis de alerta do questionário ficam mapeados nos tokens (vermelho → `danger` com `data-alert-level="stop"`,
laranja e amarelo → `warn`, azul → `info`, cinza → neutro), sem token laranja: os laranjas que passam no papel ficam
a 1,0–1,5:1 do vinho e do âmbar e só a matiz os separaria. A frente da anamnese confirma quando implementar.

## 2026-11-23 — Celular: campos com 16 px; rodapé compacto ligado ao foco rejeitado

Campos com 16 px de letra (abaixo disso o iPhone amplia a tela ao tocar) e `touch-action: manipulation` nos controles
(o + da carga não dá zoom em toques rápidos; a pinça continua). Botão `sm` com 44 px em tela de toque. Barras fixas
usam `bottom-nav-safe` (menu de baixo + área segura). O rodapé compacto ligado ao foco foi rejeitado: perde o toque
no ✓ com o teclado aberto. `interactive-widget` não é declarado. Os botões − e + da série somem abaixo de 360 px (a
partir de 360 continuam como na entrada de 22/11).

## 2026-11-23 — Datas de estado em dd/mm nos dois aparelhos; impressão DD/MM/AAAA

A mesma data aparece igual para o personal e para o aluno ("versão de 10/11") e cabe a 360 px. Hora em HH:MM no fuso
do aparelho (`fmtTime`). Impressão com "Válida até DD/MM/AAAA" (`validityEnd`, a mesma conta de `programValidity`).
As telas antigas com "20 de nov" não mudam nesta rodada.

## 2026-11-23 — Teste de uso de cor com lista PENDENTE

`src/lib/ui/color-usage.test.ts` aplica as regras de cor (a–f da U7) a todas as telas e começa verde com uma lista
PENDENTE explícita dos arquivos ainda não convertidos, cada um com o item que o converte. Cada item tira o seu
arquivo; o teste falha se uma entrada ficar sobrando. Ficam pendentes com motivo ao fim desta rodada: os arquivos do
U7c (página do aluno, /receber, colar link, envio por texto da ficha, app no celular e cadastro do aluno), que vão
com a rodada do questionário, e o "52,5" da ilustração do /entrar, sem dono nesta rodada (troca de classe para
`text-brand`, sem mudança visual).

## 2026-11-23 — "Salvar e enviar" rejeitado; um controle de envio por vez

Depois de salvar, a barra do editor mostra o envio OU uma frase de próximo passo, nunca os dois, e o painel do fim
mostra só as linhas de situação. Modo compacto do editor, frase de resumo das alterações e lista "o que mudou" ficam
adiados, com gatilhos na spec.

## 2026-11-23 — Medição: eventos novos com propriedades fechadas no tipo

`diet_adjust_started`, `evolution_compare_shown` e `workout_resumed` entram na união de eventos com as propriedades
fechadas no typecheck (`StrictEventProps`): chave ou valor fora da categoria não compila. Os eventos que já existiam
ganham as chaves novas por contrato (`EXTRA_PROPS` e os tipos de categoria em `analytics.ts`), sem mudar a assinatura
de quem já chama. Só contagens, booleanos e categorias; nunca nome, telefone, carga, texto digitado ou dado de saúde,
nem derivado (por isso o `score` de `diet_analyzed` é descartado na saída).
