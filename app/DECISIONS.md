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
As telas antigas com "20 de nov" não mudam nesta rodada. O modelo continua impresso com "Validade: N semanas": as
cópias contam a validade da própria criação, e uma data a partir da criação do modelo seria falsa.

## 2026-11-23 — Teste de uso de cor com lista PENDENTE

`src/lib/ui/color-usage.test.ts` aplica as regras de cor (a–f da U7) a todas as telas e começa verde com uma lista
PENDENTE explícita dos arquivos ainda não convertidos, cada um com o item que o converte. Cada item tira o seu
arquivo; o teste falha se uma entrada ficar sobrando. Ficam pendentes com motivo ao fim desta rodada: os arquivos do
U7c (página do aluno, /receber, colar link, envio por texto da ficha, app no celular e cadastro do aluno), que vão
com a rodada do questionário. O "52,5" da ilustração do /entrar, que estava sem dono, foi convertido na integração
(`text-brand` + `data-brand`, mesmo hex, sem mudança visual) e saiu da lista.

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

## 2026-11-23 — Treino não enviado: "Você ainda não enviou este treino para Rafael."

A tabela da U2 dizia "Este treino ainda não foi enviado para Rafael.". O texto casa com a guarda contra "enviado para"
(testes e aceite da própria U2), que existe para nenhum estado afirmar entrega. A frase em primeira pessoa diz o mesmo
sem a forma proibida.

## 2026-11-23 — Situação do envio da ficha: o que pede ação vem primeiro

No detalhe (D) do envio da ficha, a ordem é: dieta mudou, dieta ainda não foi, eco antigo e, por último, "A
confirmação aparece quando…". A U2 punha o eco antigo e a confirmação antes da dieta. A linha da página do aluno é
sempre uma das linhas do diálogo; com a ficha em dia e a dieta não, ela mostra a linha da dieta, e não a manchete
("Mensagem com a ficha atual copiada…" com a dieta nova ainda não enviada seria falso).

`ficha_link_sent.situacao`: `nunca` = nada do que vai no link tinha ido; `repetido` = tudo já tinha ido (inclui
`confirmado`); `mudou` = algo mudou ou entrou depois do último envio; `sem_info` = conteúdo anterior ao registro.

`useFichaLink(student, enabled, opts?)` é a peça da anamnese (§8.6) com o mesmo nome e a mesma chamada de dois
argumentos; o 3º, opcional (`{ where, version }`), leva a medição e refaz o link depois de salvar. Sem
`program.sharedAt`: o toque grava só o registro `sr:sent:{aluno}:ficha`.

## 2026-11-23 — Eco da versão: só com o mesmo personal e o mesmo aluno

O eco (`ficha` no pacote de treinos) só é gravado em `/receber` quando o personal do pacote é o deste aparelho e o
aluno do pacote é o escolhido no painel. Escolher outro aluno à mão gravaria a versão da ficha de outra pessoa. O
"veio com a versão antiga" (`staleEcho`) vale para o item da manchete: a ficha, ou a dieta quando o aluno não tem
ficha. Treino igual ao que já está no painel (`sameSession`, que trata `null` como campo ausente) não é gravado de
novo e conta como "já estava no painel", nunca como "atualizado". Com um treino só, o título de `/receber` fica no
singular ("Este treino já está no painel de Juliana").

## 2026-11-23 — Editor: a barra depois de salvar não fecha com um envio feito por ela

Envio pela barra: o botão sai da barra, no lugar da frase aparece o estado do toque ("Mensagem copiada às 09:41…") e
o botão do painel volta. Sem diálogo, fechar a barra apagaria a única confirmação perto do toque, e fechar durante o
clique desconectaria a âncora antes de o navegador abrir o WhatsApp. A barra fecha na próxima alteração e em
"Fechar resumo". Na barra, "Copiar" fica só com o ícone abaixo de 640 px (nome acessível "Copiar mensagem"), para a
barra da chegada do gerador ficar com 190 px ou menos. O envio do editor usa o rótulo da anamnese, "Enviar link no
WhatsApp" (os aceites da U5 diziam "Enviar para o celular de Juliana"), e o texto pelo WhatsApp vira o secundário
"Mandar como texto" em "Outras formas": um verde só no painel.

## 2026-11-23 — Relatório e gráficos: "Melhor", sem "+0%" e eixo legível

O relatório mostra Antes e Melhor (a melhor marca válida do período), com o título "Exercícios que melhoraram" e
"não melhorou" no lugar de "manteve a carga", que era falso para quem caiu. Quando o % arredonda para 0 num exercício
que melhorou, aparece a diferença em kg ou reps ("+0,2 kg"); "+5 reps" usa o mesmo destaque do "+17%". Nos gráficos,
o vão mínimo de 56 px entre rótulos do eixo X conta sobre a área entre o primeiro e o último ponto (contar sobre a
largura inteira encostava rótulos a 640 px); o gráfico deixa a página rolar sob o dedo (`touch-pan-y`) e um toque
mostra o valor. `evolution_compare_shown.suspect` = alguma marca suspeita no exercício, não só a última. O atalho
"Comentar com {Nome} no WhatsApp" no cartão fica adiado com a observação do personal: seria a quinta entrada de
WhatsApp do personal sem evidência de pedido, e a medição que o reabriria já existe sem botão novo.

## 2026-11-23 — Desvios da spec nesta rodada (integração)

Registro único dos desvios que as trilhas fizeram e a integração conferiu. Cada um tem teste ou conferência no
navegador; os que já têm entrada própria acima não se repetem aqui.

**Sessão.** O selo de recorde no ✓ feito é desenhado na própria sessão (`data-record`, `bg-record`, troféu branco),
sem variante nova no `RecordMark`: a variante `icon` poria troféu vermelho sobre o verde (1,09:1). O hover da série
pendente escurece o fundo, não a borda (borda `iron` é o sinal de "preenchida"). A rolagem depois do ✓ que abre outro
exercício vai até a 1ª série pendente dele, não necessariamente a 1ª. `remocao_cancelada` conta qualquer fechamento
sem confirmar (Manter, X, Esc, fundo). Acima de 999: o campo volta ao valor que tinha quando recebeu o foco (o "303"
do meio também não foi querido), o aviso aparece já ao digitar e some na próxima edição da linha; `selectAllSoon`
seleciona de novo no 1º `mouseup` depois do foco, porque só o `setTimeout(0)` deixava "3035" no toque.
`workout_resumed` sai em todo rascunho reaberto. No resumo, a nuvem e o "Ver como aluno" mostram só "Treino
concluído" (nunca "salvo neste …"); a ficha só é regravada quando alguma carga muda, e exercício repetido no treino
leva a maior carga feita. O ícone de "Semana N seguida" continua `plate-yellow` (decoração no escuro, sem token). O
plano B do teclado do iPhone (`visualViewport`) só entra com evidência de aparelho real.

**Envio.** `SendToCoach` fixa os treinos ao abrir o diálogo e avisa `onSent(via, at)`; a faixa do Hoje e o botão do
Histórico continuam montados depois do toque, para a cópia não fechar o diálogo no meio. "Excluir treino" usa
`text-danger!` (no CSS gerado, o `text-iron` do ghost viria depois). `useFichaDelivery` mora em `use-ficha-link.ts`
(reexportado por `transfer-share.tsx`). O botão "Avisar … que recebi" e o recibo ficam para a próxima rodada, como a
spec manda. Os links reais de antes da U2c estão colados em `transfer.test.ts` (abrem com `TRANSFER_VERSION` 1).

**Dieta.** "Para mudar, fale com Rafael." e "Se Rafael mandar…" no lugar de "ele": o aparelho não sabe o gênero do
personal. A nota do painel é "Texto e PDF não atualizam o app de Juliana." (o painel também imprime). "Sem mudança" é
medido pelas refeições (50 → 250 → 50 não marca ajuste). "Ver como aluno" e a nuvem nunca gravam `adjustedAt`
(mesma regra da ficha). Na edição do plano próprio, "Cancelar" com alterações pergunta "Descartar as alterações?".
`section_viewed` da dieta vai sem `proxima` (a próxima refeição é a U3d, adiada). O painel de envio da dieta é
próprio (`SendDietPanel`) e não usa o `SendFichaLink` do editor: aquele só habilita com ficha ativa e bloquearia aluno
só com dieta; os dois usam o mesmo `useFichaLink` e os mesmos textos. Só macros abaixo da meta: "Abaixo das metas em
proteína." (a forma curta só depois de "Acima das metas em …").

**Ficha e editor.** A assinatura do rascunho usa a unidade gravada para exercício próprio (`custom_*`): a biblioteca
dele chega depois da página e não pode invalidar o rascunho. Toda ficha com `adjustedAt` sai sem a assinatura do
personal; a linha "Ajustada em …" só na ficha recebida. Ficha recebida inativa não diz "passa a valer no lugar
desta" (a nova substitui a ativa). Ficha inativa vence "aluno de exemplo" no próximo passo da barra. Fechar a barra
leva o foco ao contêiner dela; "Tornar ativa" fecha a barra. O diálogo de envio da página do aluno manteve a abertura
("no celular dela/dele").

**Evolução e relatório.** O caso "3×12, 3×17, 3×15 → melhor nenhuma" da U6 §5.2 contradiz a R-9: vale a R-9 (3×17 é
a melhor marca). O relatório olha o histórico até o fim do período; sem nenhuma linha, só "Nenhum exercício com carga
melhorou no período.". O eixo X do gráfico de barras também usa o vão de 56 px (a 360 px, 4 das 8 semanas têm
rótulo; o toque mostra cada uma) e a legenda do ponto em foco passou a dd/mm. Com um registro só, o cartão usa o título
da R-14 e "Primeiro registro · dd/mm". `trackedExercises` saiu de `progression.ts` (sem uso).

**Fila do personal.** O ícone da pendência fica na linha do texto (numa coluna à parte, "Sem notícias há 12 dias ·
último treino recebido em 11/11" ia a 3 linhas a 360 px). `programLine`, `topReason` e `pendingText` ficam no lugar de
`attentionOf`/`reasonText` da U4 §4; a U4b pode absorvê-los. A caixa da fila continua `plate-yellow`/`plate-blue-ink`
até a U4b. Uma busca antiga não filtra a lista quando o campo de busca não aparece (menos de 7 alunos).

**Acabamento.** A caixa de cópia atrasada usa os tokens de atenção (`warn-line`, `warn-surface`, ícone `warn-ink`); em
Conta, a linha curta vale em qualquer largura. Selo BETA e faixa de demonstração em `warn-fill` (mesmo hex). Os chips
de músculo das preferências e o botão da faixa de demonstração ganharam 44 px no toque, fora da lista do aceite A8. A
barra de progresso e o selo de exercício completo da sessão continuam verdes cheios (`bg-done`, já eram verdes).

**Fica para a rodada do questionário (U7c).** `program-generator.tsx` continua com `sticky bottom-20` (o grep do aceite
U8 A6 ainda encontra essa linha), e o selo "N recordes" da página do aluno continua `bg-plate-red` sem `data-record`:
os dois arquivos são reescritos pela anamnese.

## 2026-11-26 — Correções da revisão da rodada (estado, privacidade, 360 px, números)

**Apagar dados deste aparelho (modo local).** Passa a usar `wipe()`, como "Apagar tudo e recomeçar": no modo local,
"dados deste aparelho" é o aparelho inteiro. `deleteAccount` apagava só o próprio perfil e deixava, no aparelho do
personal, perfis, fichas, treinos, medidas e dietas dos alunos (órfãos e invisíveis) e as chaves `sr:sent*`; no da
aluna, o rascunho do treino com cargas e o perfil do personal. `wipe()` agora também apaga `sr:draft:*`. Depois de apagar, a página recarrega em "/" (`location.assign`, como
"Apagar e recomeçar"): nada da memória da página sobrevive, e o painel não disputa a navegação mandando para /entrar.
Na nuvem continua `deleteAccount`. Teste: `local.apagar.test.ts`.

**Eco da versão (U2c) com ajuste no celular do aluno.** O aluno só ecoa o que continua igual ao recebido
(`echoFor`): a ficha, se a ativa é do personal e não tem `adjustedAt`; a dieta, nas mesmas condições. O eco prova a
versão recebida, não o conteúdo em uso; sem o filtro, o personal lia "está com a ficha e a dieta atuais" enquanto o
celular dela dizia "ajustado por você". Não entrou o campo `ajustada` sugerido na revisão (com o texto "Juliana
ajustou a ficha no celular dela"): o celular da aluna promete "Os ajustes ficam só neste celular e não aparecem para
Rafael", e contar ao personal que houve ajuste contradiz isso; mudar essa promessa é decisão do dono. Sem texto novo:
quando um treino registrado depois do envio vem com eco mas sem a versão do item da manchete (`headMissingFromEcho`),
a promessa "A confirmação aparece quando … mandar o próximo treino" sai. Resíduo aceito: com ficha E dieta ajustadas
o pacote vai sem eco nenhum (como um link antigo), nada é registrado e a promessa continua. Teste:
`transfer.u2c-ajuste.test.ts`.

**Link só com dieta (U3c).** /abrir diz "sua dieta chegou." e "Atualizar minha dieta"; salvar leva a
`/hoje?dieta=1` ("Dieta salva neste celular." + "Ver a dieta"), nunca "Ficha salva". No Hoje do modo local, o vazio
com personal passou de "Seu personal ainda não enviou a ficha" (afirmava o outro lado) para "Nenhuma ficha de Rafael
neste celular ainda" / "Quando a ficha de Rafael chegar pelo link, ela aparece aqui…"; na nuvem o texto antigo fica
(lá o servidor sabe). A mensagem do WhatsApp sem ficha diz "para guardar e consultar quando quiser" em vez de "para
treinar, registrar as cargas e me mandar cada treino".

**Foco atrás do menu e das barras fixas (WCAG 2.4.11).** `html:has([data-bottom-nav])` abaixo de 64rem ganha
`scroll-padding-top: 4rem` (cabeçalho h-14 + 8 px) e `scroll-padding-bottom: calc(5.5rem + área segura)` (menu +
8 px). As barras "Salvar ajustes"/"Salvar dieta" e "Salvar ficha" usam `useStickyBarScrollPadding` (hooks.ts): o
padding de baixo é o `bottom` calculado da barra + a altura dela + 8 px, medido por ResizeObserver, e sai ao
desmontar. Lê o `bottom` da própria barra (5rem + área segura no celular, 1rem no lg) em vez da altura do menu: o menu
mede ~67 px e a barra fica a 80 px do pé. A sessão continua com o estilo inline dela. Fora da lista da revisão, mas
achado na mesma medição: a barra "Cancelar / Salvar ajustes" da dieta saiu do bloco do cardápio para o contêiner da
tela. Dentro dele, ela só grudava depois de rolar (o bloco começa abaixo das metas) e, ao abrir o ajuste no topo da
página, ficava inteira atrás do menu de baixo (685–741 com o menu em 673–740); agora fica em 604–660 desde o início.

**Painel de envio da dieta.** "Texto no WhatsApp" virou "Mandar como texto", o mesmo rótulo do editor (spec-ux §2).
A única diferença que sobra entre os dois painéis é a nota ("Texto e PDF" × "Texto, PDF e planilha": a dieta não tem
planilha).

**Números da Evolução e do relatório.** A % do 1RM (`markDeltaPct`) e a ordem do relatório (`gain`) saem do 1RM sem
arredondar (`e1rmRaw`), com corte do resíduo de ponto flutuante: o mesmo +1 rep a partir de 10 dava +2% ou +3%
conforme a carga. O "1RM ~27,3" mostrado continua arredondado. Com a primeira e a última marca idênticas, o cartão
não mostra "Força estimada (1RM): menos de 1% de diferença" (a linha de cima já diz "Mesma carga e mesmas reps"). O
eixo Y não usa passo 0,25 (abaixo de 1, só 1, 2 e 5 × 10^k): peso com 1 casa não ganha eixo com 2. Testes:
`report.u6a-pct.test.ts`, `evolution.u6c-indicador.test.ts`, `chart-scale.u6b-decimal.test.ts`.

**Textos fora do literal da U6 §3.3 A.** No lugar do gráfico: duplo → "Com carga e repetições no mesmo exercício, não
dá para fazer um gráfico só. Compare pelos registros abaixo." (tempo: "Com carga e tempo…"); reps altas → "A maioria
dos treinos passou de 12 repetições, e aí a força estimada deixa de ser confiável. Por isso não há gráfico: compare
pelos registros abaixo.". O literal afirmava que carga e reps "mudaram juntas" quando só uma mudou, e negava a força
estimada logo abaixo de um 1RM válido (duas marcas de 12 reps).

**Acabamento.** Selects Descanso, Contagem e Técnica do editor em 16 px (sem `text-sm`, R13 da U8). Logo de /receber
e /abrir com 44 px de altura. Cartão do relatório no resumo do aluno: "exercícios que melhoraram". Em `leitura_metas`
a dieta não mostra "Cardápio de Rafael · versão de …" (contradizia "sem cardápio por refeição").

## 2026-11-26 — Questionário inicial: entradas 1 a 27 da spec da anamnese (§17)

Registradas pela fundação (F0) de uma vez, com a numeração da spec (`spec.md §17`), para a spec e as trilhas citarem
"entrada N". A data de cada uma é a da decisão. Onde o código mudou depois da spec (rodada 1 de UX), a entrada diz o
que vale agora.

1. **2026-11-23 — "Questionário inicial" na interface; `anamnese` no código.** Motivo: a Res. CFM 2.416/2024 chama
   de ato médico a anamnese da história clínica.
2. **2026-11-23 — PAR-Q literal do Anexo I (7 perguntas) e termo opcional por caixa de confirmação.** Motivo: texto
   conferido na Alesp; a lei condiciona a matrícula, não o envio; nome digitado não traz ganho no beta.
3. **2026-11-23 — Alertas em 4 níveis; vermelho trava o gerador assistido até a liberação; laranja abre porta com
   "Seguir mesmo assim"; PAR-Q 5 ou 6 isolado não abre porta.** Motivo: diretriz do ACSM e calibragem contra excesso
   de encaminhamento. Confirmada pelo dono (entrada 19, pergunta 1).
4. **2026-11-23 — `intensityCap` no lugar de `cautious`; vale para a ficha inteira e é desligável no gerador.** Motivo:
   `conservative` só age no 5×5; o motor não tem fases.
5. **2026-11-23 — Mescla por campo: treino e medidas mantêm o personal; sexo e ano usam o aluno; nas limitações, o app
   junta e tira só os termos que ele mesmo pôs (`limitacoesDoQuestionario`); autorização original mantida.**
6. **2026-11-23 — Texto livre não entra em Limitações; parte de cima das costas fora do motor.** Motivo: a regex de
   lombar do gerador casa "coluna" e "dor … costas".
7. **2026-11-23 — Respostas voltam comprimidas, sem cifra, com aviso explícito; cifra no próximo lote, depois de teste
   em aparelhos.** Confirmada pelo dono e pelo tech lead em 26/11: o link de respostas é comprimido como o da ficha, e o
   texto de autorização avisa que quem tiver o link consegue ler as respostas.
8. **2026-11-23 — "Montar dieta" condicionado ao jeito de trabalhar; passo clínico de nutricionista sempre acima.**
   Motivo: Lei 8.234/1991. Confirmada pelo dono (entrada 19, pergunta 2): para quem encaminha ao nutricionista ou tem
   parceiro, some só o PASSO; a aba Dieta continua.
9. **2026-11-23 — Novo `ConsentSource: "aluno_questionario"`; `CONSENT_TEXT_ID = "c1"`.** No preenchimento junto, a
   origem é `"personal"`.
10. **2026-11-23 — Primeiro lote só com condutas FATO; alertas de precaução podem ser HIPÓTESE e são rotulados.**
11. **2026-11-23 — Preencher junto em `/questionario?aluno=` (rota estática, offline); sem rede, o fim do junto também
    fica em `/questionario`.**
12. **2026-11-23 — A divisão da ficha não é perguntada no jeito de trabalhar: padrão aprendido (Entrega 2) e "Divisão
    preferida" em Conta.**
13. **2026-11-23 — Base legal das respostas de saúde: consentimento (art. 11, I), mesmo com o art. 11, II, "f"
    disponível.** HIPÓTESE jurídica.
14. **2026-11-23 — PostHog em memória em `/questionario` com `#d=` e sem perfil de personal; IP descartado nessa
    página.** Motivo: o aluno do link não aceitou os termos do app; o personal no junto mantém o `distinct_id`. O
    `href` e os atributos de elemento já não saem (`instrumentation-client.ts`, commit `71741e0` e rodada 1): o track D
    só acrescenta o que falta (`ph-no-capture` nas telas do questionário, persistência em memória, IP).
15. **2026-11-23 — Cadastro rápido grava só nome e telefone.** Motivo: os padrões de treino gravados criariam
    diferenças falsas na mescla.
16. **2026-11-23 — Edição do aluno não grava padrões; Limitações com `maxLength` de 1.000.** Motivo: a edição gravava
    hipertrofia, iniciante, 3 dias, 60 min e academia sem ninguém escolher; teto do link da ficha.
17. **2026-11-23, adaptada em 26/11 — Envio da ficha: link como ação principal no editor e texto como secundário.** O
    `program.sharedAt` da spec NÃO existe: vale a entrada "Um registro só do envio da ficha" (23/11, acima). O toque
    grava `sr:sent:{aluno}:ficha` e o passo `enviar_ficha` lê esse registro (`PassosInput.envioFicha`, a
    `FichaDelivery` de `useFichaDelivery`). `saveProgram`/`saveDiet(…, { keepUpdatedAt })` já estão na interface, no
    modo local e na nuvem desde a rodada 1. `useFichaLink` mora em `src/lib/use-ficha-link.ts` (reexportado por
    `transfer-share.tsx`) e o painel do editor (`SendFichaLink`) já tem "Enviar link no WhatsApp" como ação principal
    e "Mandar como texto" como secundária.
18. **2026-11-23, substituída em 26/11 pela entrada 20 — Duas entregas e chave `questionario`.** As duas entregas
    continuam. A chave não fica mais restrita ao `/testar` e ao convite: vem ligada para todos (entrada 20).
19. **2026-11-23 — Aprovação do dono (passo F-1).** Resposta do dono ao resumo: "Veja tudo isso bote na ordem… só o
    que for válido você executa". Não há gate pendente. Respostas às perguntas da §19:
    1. Trava em "Gerar ficha com estas respostas" só no alerta VERMELHO, até o personal registrar a liberação; laranja
       abre a porta "Seguir mesmo assim"; "sim" isolado no PAR-Q 5 ou 6 só lembra o termo; montar a ficha do zero
       continua possível.
    2. Para quem encaminha ao nutricionista ou tem parceiro, some só o PASSO "Montar dieta"; a aba Dieta continua (com
       gatilho clínico, o aviso fixo na aba).
    3. Menores de 18 entram na Entrega 1: responsável obrigatório para enviar dados de saúde (sem ele, só "Enviar sem
       dados de saúde"), lembrete legal A-MENOR e, abaixo de 12 anos, faixa pedindo que o responsável preencha.
    4. Perguntas próprias do personal: não nesta entrega (Entrega 2).
    5. Revisão clínica: entrada 20.
20. **2026-11-26 — Revisão clínica da §16.1: RECOMENDADA, não bloqueia.** Decisão do dono e do tech lead. A revisão
    por um profissional de educação física com CREF e por um médico do esporte continua recomendada, mas não segura a
    Entrega 1. A chave `questionario` (`src/lib/flags.ts`) vem LIGADA PARA TODOS (`QUESTIONARIO_PADRAO = "todos"`) e
    existe para desligar rápido: `NEXT_PUBLIC_QUESTIONARIO=convite` no build volta ao `/testar` e ao convite
    (`/entrar?beta=questionario`); `=desligada` desliga para todos. Mitigação: textos de alerta só com fonte (PAR-Q
    literal do Anexo I da Lei SP 16.724/2018 e triagem do ACSM), e o resumo diz que não substitui a avaliação
    presencial. Quando a revisão acontecer, nomes, registros profissionais e data entram aqui.
21. **2026-11-23 — Medição do aluno do link por legítimo interesse (art. 7º, IX), só contagens e categorias, com aviso
    no rodapé e IP descartado.** HIPÓTESE jurídica.
22. **2026-11-23 — Calibragem: "pressão alta" e "artrose" como token só quando pedem; A-CIRURGIA azul; "sem treino
    regular" fora dos alertas; assoalho na gestante sem token de pós-parto.** Motivo: regras de população do gerador e
    fadiga de alerta.
23. **2026-11-23 — Respostas casam por `studentRef`; sem ref, pelo nome completo e com confirmação.**
24. **2026-11-23 — `readAnamnese` como única porta de leitura; versão nova ou dado danificado viram trava;
    restauração mantém a anamnese mais nova e une liberações.** Motivo: a restauração gravava o perfil como veio.
25. **2026-11-23 — Reavaliação "só a saúde" pergunta ano e sexo e herda as respostas de treino; idade ou sexo
    desconhecido mostram as perguntas de segurança.** Entrega 2.
26. **2026-11-23 — Eventos sem derivado de saúde: nada de `dorMais`, `modulos_n` pelo pedido, `dieta` e
    `nutricionista` fora de `next_step_clicked`.**
27. **2026-11-23 — WhatsApp aberto no toque, com o link montado antes; a regra "nunca `<a href>`" cai.** Motivo:
    Safari do iPhone; `href` já protegido (`71741e0`).

## 2026-11-26 — Fundação do questionário: o que mudou em relação à spec

**Medição com tipo fechado.** Os 12 eventos do questionário e o `link_dead_end_shown` entram em `StrictEventProps`
(como os da UX de 23/11), com as chaves em `EVENT_PROPS`; um teste de tipo garante que as duas listas batem. Por isso
as funções de `anamnese-events.ts` devolvem o tipo fechado de cada evento (não `TrackProps`), e as chaves novas de
eventos antigos têm tipo próprio (`ProgramGeneratedExtra`, `FichaLinkExtra`, `StudentCreatedExtra`). `evNextStep`
aceita também `"lembrar"` (a ação "Lembrar {aluno}"), que a spec lista como valor de `passo` mas não é um `StepId`.

**"Enviado sem saúde" também não sai por ausência.** No modo junto sem a autorização da boas-vindas, as partes `parq`,
`saude` e `dor` não existem: `evPartDone` devolve null para elas no junto, `secoesDoPedido` (base de `indice`) não
depende de `semSaude`, e `anamnese_sent.incompleto` não conta as partes de saúde deixadas de fora por falta de
autorização. Motivo: a spec §11.3 põe "enviado sem saúde" entre os derivados proibidos.

**Envio da ficha.** `PassosInput.activeProgram` perde `sharedAt` e o passo `enviar_ficha` lê `envioFicha:
FichaDelivery | null` (entrada 17). `Program.sugerido` entra tipado; o teste da assinatura da ficha passou a usar esse
formato no lugar do `sugerido: true` provisório. O `useFichaLink` da rodada 1 não foi recriado: a assinatura real é
`useFichaLink(student, enabled, opts?: { where?, version? })`, com `estado.programa`/`estado.dieta` como objetos,
`entrega`, `toque` e `aoEnviar(via)` devolvendo o toque.

**Itens da Entrega 2 nos esqueletos.** Ficam com a assinatura e retorno neutro, marcados "[E2] Não implementar na
Entrega 1": `diffAnswers`, `herdarDaAnterior`, `reconfirmarLiberacao`, `cuidadosNaFicha`, `proximaReavaliacao`,
`learnedSuggestion`, `aceitarSugestao`, `dispensarSugestao` e `evWorkStyleSuggestion`. Os tipos de dados da Entrega 2
(partes extras, reavaliação, perguntas próprias, letra maior, validade da liberação) ficam completos: são o formato do
link e do aparelho.

**Outros.** `QUESTIONARIO_DESDE` é provisório (2026-11-26, a data da fundação): a costura troca pela data de
publicação. `hasHealthData` passa a contar o questionário com saúde (`anamnese` sem `healthOmitted`). `CopyButton`
mudou para `src/components/copy-button.tsx` sem mudar o comportamento.

## 2026-11-26 — Questionário: desvios das trilhas, conferidos na costura

Registro único das leituras e desvios que as trilhas A a E fizeram em relação à spec da anamnese. Cada item tem teste
ou foi conferido no navegador (360 px). O que já tem entrada própria acima não se repete.

**Triagem, resumo e passos (A).**
- Leitura cautelosa onde o texto literal deixaria um caso sem alerta: a pergunta `orientacao` também aparece com
  "Prefiro falar pessoalmente"; A-GESTANTE dispara com a gestante sem resposta sobre o obstetra (com "Pular por
  agora" no junto, ela ficaria sem alerta nenhum); A-PRESSAO dispara quando a pergunta da pressão estava à vista e
  ficou sem resposta (conta como "Não sei").
- Uma liberação cobre o alerta se foi registrada depois de `receivedAt` (ou de `answeredAt` no modo junto), e não de
  `answeredAt` como diz §6.4: os dois tempos ficam no relógio do aparelho do personal; o relógio do celular do aluno
  não prende nem solta a trava. Lado seguro: liberação registrada entre a resposta e a chegada pede "Registre de novo".
- O ano é guardado entre 1900 e 2100 (o esquema do link); a faixa da tela, (ano atual − 100) a (ano atual − 10), é
  conferida no "Continuar" (`erroAno`). Um ano fora do esquema deixaria o perfil ilegível.
- O aviso da coluna só aparece com a pergunta `dorAlerta` à vista (dor na lombar ou nas costas altas): uma resposta
  antiga ainda não limpa não dispara alerta falso.
- O passo `liberacao` (e o selo "Liberação pendente") não dispara por A-SEM-TRIAGEM nem por A-PARQ-INCOMPLETO: esses
  têm passo próprio (triagem pessoalmente; completar o questionário), e o "Avisar" pediria liberação médica a quem só
  não autorizou.
- `motivoTetoModerado` devolve o título do alerta; com saúde omitida, "Sem triagem de saúde"; com `regular` sem
  resposta, "Sem resposta sobre treino regular" (nunca afirma "sem treino regular" sem evidência).
- `enviar_ficha` só aparece com `nao_enviado` ou `mudou`; "desconhecido" (conteúdo anterior ao registro) não afirma nada.
- Respostas ilegíveis: com "versao_nova", nenhum passo de questionário (o caso é atualizar o app); com "invalida",
  "Fazer o questionário inicial" e a ficha do zero. O termo do PAR-Q com idade desconhecida é pedido.
- Junto sem autorização: somem também peso e altura (são dados de saúde) e as opções "sem dor", barreira "dor" e
  motivo "médico/dor". O bloco 8 (`falta`) fica vazio na Entrega 1, com os blocos 4 a 9.
- Mantidos de propósito: o passo "Montar dieta" aparece para quem enviou sem dados de saúde (não há como saber o
  gatilho, igual a quem não respondeu); `next_step_clicked{passo:"questionario"}` também sai em "Completar o
  questionário" (inferência fraca, o mesmo valor serve para "Fazer").

**Ficha a partir das respostas (B).**
- "Pressão alta" sem resposta sobre o controle conta como "não sei". "Idoso" também vale com A-QUEDA e idade
  desconhecida (§6.3 manda o token; §8.3 exigia 65+); queda respondida abaixo de 65 (resposta oculta) não conta.
- Texto livre vazio: "Não adaptado pelo gerador: dor em outro lugar. Ajuste à mão." e "Lesão antiga, sem descrição.
  Se ainda limita, descreva em Limitações."
- Rodada com o mesmo id substitui a anterior, mantendo `overrides` e `conversei` (registros datados); respostas
  atuais ilegíveis vão para `anamnesePrev` em vez de sumir.
- Divisão: a preferida do aluno só vale se couber nos dias (senão, o mesmo aviso da que não cabe). Aviso de dias fora
  de 2–6 só quando o valor veio do aluno. "sem X" no resumo curto: até dois nomes e "e mais N".
- O jeito de trabalhar vale no gerador do personal para aluno mesmo sem questionário (reserva de dias, tempo, local,
  divisão e validade); o aluno para si e o modelo não usam. `sugerido` só nas fichas do personal para alunos. A
  caixa "Intensidade moderada" só aparece com questionário.
- Trava por respostas ilegíveis: só [Voltar] (não há alerta a cobrir). "Seguir mesmo assim" sem a caixa "Conversei"
  marcada mostra o erro em `role="alert"` e leva o foco à caixa (botão habilitado).
- `?enviada=1` continua com a barra da rodada 1 ("Revise se quiser e envie quando estiver pronta.", com o link como
  primeiro botão verde), não o texto da spec; ficha inativa: "Torne a ficha ativa para enviar o link.".
- Jeito de trabalhar: com 2 públicos marcados, o 3º não entra (aviso); "Divisão preferida" fica no formulário (fora do
  `compact`); "O que isso muda" lista só o que age na Entrega 1. No diálogo de liberação, "Quem liberou?" começa sem
  marca e "Liberou para…" em "Atividade sem restrição" (3 toques). O aviso de saúde na cópia de segurança aparece só
  para o personal.

**Página do aluno (C).**
- `contactReason` recebe os dias do pedido pendente como 4º parâmetro (o 3º já era `hasProgram`). Selo com 0 ou 1
  dia: "pedido hoje" / "1 dia".
- "Apagar também" tira só o que foi copiado: os trechos de limitação que o app pôs e peso/altura iguais à resposta
  (o texto do personal fica). Revogar e apagar também tiram as marcas de "feito" dos passos clínicos (derivado de
  saúde); na revogação, respostas ilegíveis saem inteiras. `marcarApagado` só grava depois que o perfil foi salvo.
- `marcarVisto` roda sempre que a aba Resumo mostra respostas (senão o selo "Respostas novas" nunca sairia entrando
  pela lista). `summary_viewed` também sai sem questionário (`tem_questionario: false`).
- Trava vermelha no bloco 3: no lugar de "Gerar ficha com estas respostas", o texto da trava, [Registrar liberação] e
  "Montar a ficha do zero". Com A-ALIMENTAR, o peso some também de "Respostas completas" e da impressão.
- "Apagar respostas do questionário" aparece mesmo com a chave desligada (direito do aluno). Aluno de exemplo: sem
  "Mandar pelo WhatsApp"; "Avisar" continua. Telefone segue opcional no modo WhatsApp (o diálogo oferece o seletor de
  contatos). A demonstração antiga também recebe jeito de trabalhar e respostas de exemplo, uma vez.

**Questionário no celular (D).**
- PostHog em memória e sem `warm` em `/questionario` sem perfil de personal, sem exigir `#d=` (a página limpa o
  fragmento antes dos efeitos e a recarga chega sem ele). Sem IP: `$ip: null` e `$geoip_disable: true` (HIPÓTESE,
  conferir na documentação do PostHog e ligar "Discard client IP data" no projeto). Exceções em `/questionario` e
  `/receber` só com o tipo e o código.
- O que vai para todas as telas mora em `questionario-base.ts`, sem catálogo. O fim do junto entra na rota por import
  estático (o `warm` do service worker só guarda o que o HTML cita; um pedaço sob demanda quebraria o modo avião).
- `salvarRascunho` devolve se gravou ("Salvo…" só com gravação feita). `deleteAccount` lê só o id cru das rodadas
  (`readAnamnese` devolveria "invalida" e perderia o id). O pedido fica na aba (`sessionStorage sr:v1:qpedido-aba`,
  só a identidade) para a recarga no meio não perdê-lo. `pulouPorAgora` guarda só ids.
- Montagem: o termo só é gravado com algum "Sim" no PAR-Q; a autorização do responsável só vale com o nome dele;
  `consent.at` = hora da montagem.
- Sem rede, Enviar é bloqueado e anunciado; "Copiar mensagem" conta como toque. "Deu certo?" usa o `Dialog` do app
  (Esc e X valem "tentar de novo"). No junto, "declaro" é obrigatório só para [Salvar e ver o resumo].
  `anamnese_part_done` também sai para "enviar". `tipo_desconhecido` usa o motivo `versao_nova`.

**Link e recepção (E).**
- `TRANSFER_VERSION` e a conferência de data ISO são cópias locais em `questionario-link.ts` (com teste de
  igualdade): os originais puxariam o motor para `/questionario`. `packetProblem` não confere o conteúdo de ficha e
  treinos (continua com `parsePacket`).
- Mesmo id com `answeredAt` mais antigo dá "mais antigas" (a regra literal trocaria a mais nova sem aviso). "Já
  registradas" é procurado em todos os alunos. Os botões que dizem "registrar" registram direto quando não há nada
  para conferir.
- Leitura tolerante do perfil: texto até 5.000 caracteres, PAR-Q pela metade com `null` (o "Salvar o que já tem" do
  junto) e id de alerta desconhecido descartado em `overrides`/`conversei` (a porta volta, lado seguro).
- `mesclarRestauracao`, quando fica a rodada do aparelho, leva também o texto de limitações (os tokens só fazem
  sentido com ele) e a autorização do aparelho se a cópia não tiver.
- Link que nem abre em `/receber`: "Este link veio cortado ou incompleto. Peça para o aluno mandar de novo."; tipo
  desconhecido: "Atualize…". Depois de registrar: `/alunos/{id}?aba=resumo&questionario=novo&recebido=1`.
- Pedido: prévia com o link encurtado (o envio e a cópia levam o inteiro); `anamnese_requested` uma vez por abertura
  do diálogo; com conta na nuvem, o diálogo avisa que o questionário por link ainda não está disponível.

## 2026-11-26 — Costura do questionário: pontas ligadas e o que ficou como estava

Caminho conferido de ponta a ponta no navegador (360 px, dois aparelhos): cadastro rápido → pedido pelo WhatsApp →
`/questionario` no aparelho do aluno → `/receber` → resumo → "Gerar ficha com estas respostas" → editor com
`?enviada=1` → "Enviar link no WhatsApp" → o passo `enviar_ficha` some.

- **`?recebido=1`** mostra "Pronto. Se quiser, apague a mensagem…" no topo do Resumo (some ao trocar de aba) e o
  `summary_viewed` sai com origem "receber". `questionario` e `recebido` saem da barra numa chamada só: duas
  `replaceState` com o mesmo `search` devolveriam o primeiro parâmetro.
- **Nuvem**: o pedido por link não é oferecido no menu, nos passos ("Mandar pelo WhatsApp", "Lembrar") nem no
  cadastro rápido (o `/receber` da nuvem não registra respostas).
- **Nome provisório "Personal"** (o `/testar` começa assim): o diálogo do pedido pede o nome junto com o WhatsApp,
  como as outras telas já tratam esse nome como "sem nome". Sem isso o aluno lia "Aqui é Personal" e "Autorizo
  Personal…".
- **`sugerido` não vai no link da ficha** (fica no aparelho do personal, para o padrão aprendido da Entrega 2). A
  mensagem do envio por link virou função pura (`fichaLinkMessage`), com teste de que leva `/abrir#d=` e não leva o
  texto da ficha.
- **"Veio de"** usa a pergunta curta do catálogo (`curtoDe`), a mesma do "Por quê" da triagem; o mapa próprio do
  gerador saiu.
- **`QUESTIONARIO_DESDE` = 2026-11-26**, a data desta publicação. Se o deploy sair em outro dia, trocar.
- **`NEXT_PUBLIC_QUESTIONARIO`** documentada no README e no `.env.example`.
- **Ficam como estão, com dono para decidir:** a página e o editor usam `!student.sample` para "aluno real", não
  `ehExemplo` (os alunos `demo-*` da demonstração continuam vendo o painel de envio da rodada 1); a IA, quando ligar,
  ignora `avoidIds` e `intensityCap` (usar o motor local sempre que existirem); o texto da barra de `?enviada=1`.
- **Pendências fora do código:** ligar "Discard client IP data" no PostHog; medir o JS da primeira carga de
  `/questionario` no build (meta: 30 KB gzip acima de `/abrir`); teste em aparelho real (Safari do iPhone, app
  instalado, TalkBack/VoiceOver, modo avião com o service worker); revisão clínica (entrada 20).

## 2026-11-26 — U7c: cor e celular nos arquivos da anamnese; lista PENDENTE vazia

Convertidos na costura, depois das trilhas: página do aluno (quadro "Limitação" em atenção com ícone âmbar e texto
`iron`; "N de M" sempre `iron`; título "Treinos recebidos nas últimas 4 semanas" no modo local; `RecordMark` no último
treino; validade com `validityTone`/`validityIcon`; abas em grade 3×2 abaixo de `sm`, sem arrastar; links dos painéis
com 44 px no toque), `/receber` (`RecordMark variant="icon"`), "Colar aqui" (16 px, borda `field`/`danger`, erro com
ícone), app no celular e envio por texto da ficha (erro com ícone), cadastro completo do aluno (`aria-invalid` e
`aria-describedby` nos campos com erro, borda e texto `danger` com ícone na autorização, "Ex.: " nos placeholders que
parecem dado), Conta (aviso do CREF com `TriangleAlert`; "1x" a "7x" numa linha, `columns={7}`), onboarding e dieta
(placeholders "Ex.: "), gerador (`bottom-nav-safe`). `color-usage.test.ts` fica sem PENDENTE e `grep bottom-20 src`
volta vazio. O "000000-G/UF" do CREF continua: é a máscara do formato, não um dado.

## 2026-11-26 — Integração do questionário (Entrega 1): build, medição e o que fica para o dono

`tsc` limpo, 60 arquivos de teste com 1.597 testes verdes (33 s; nenhum arquivo perto de 60 s) e `next build` sem
erro. Nenhuma correção de código foi necessária na integração. Conferido no build de produção (`next start`, 360 px):
links da ficha e de treinos gerados pelo código de antes da rodada 2 (commit `6d39f27`) abrem e registram; o caminho
cadastro rápido → pedido → `/questionario` → `/receber` → resumo → gerador → envio da ficha por link; modo avião com o
service worker; alerta vermelho no junto (aviso do SAMU na hora, trava no resumo e no gerador, sem "Seguir mesmo
assim", e a ficha só depois de registrar a liberação); retomar o link no mesmo navegador; `noindex` e `robots.txt`.

**JS de `/questionario` acima da meta.** Soma gzip dos scripts citados no HTML: `/abrir` 476 KB, `/questionario`
529 KB, ou seja, 53 KB a mais, contra a meta de 30 KB (que era ESTIMATIVA). Na primeira abertura do link num aparelho
limpo vão 617 KB (`/abrir`: 565 KB). No "4G lento" do DevTools (1,6 Mbit/s e 150 ms), o botão "Começar" aparece em
cerca de 3,5 s, o mesmo tempo de `/abrir`. O aparelho do aluno não aquece o service worker (nenhum cache gravado).

O excesso vem de três partes:
- o catálogo (20 KB) e o formulário (11 KB), que a spec já aceitava;
- o fim do junto em import estático (cerca de 32 KB): resumo, diálogos de liberação, termo e apagar, triagem,
  recepção e "Conferir antes de salvar".

**Mantido, por enquanto.** O fim do junto sem rede está na lista "nunca cortar", e o `warm` só guarda o que o HTML
cita. Se a medição em aparelho real mostrar prejuízo, o caminho é a Entrega 2:
- carregar sob demanda o fim do junto no modo link;
- fazer o `warm` também buscar esses pedaços.

**Para o dono decidir (sem mudança agora):**
- **A cópia de segurança não leva as marcas `sr:v1:qapagado:*`.** Restaurar uma cópia feita antes de "Apagar
  respostas" traz as respostas de volta, porque o aparelho não tem rodada mais nova para manter. A cópia é arquivo do
  próprio personal e restaurar é um ato explícito, mas a revogação do aluno (§11.3) fica dependendo disso. A correção
  possível: levar as marcas na cópia e, ao restaurar, não trazer rodada marcada como apagada.
- **Com alerta vermelho aberto, o passo "Gerar ficha com estas respostas" continua na lista de próximos passos**, com
  [Gerar]. O botão leva ao gerador, que abre a trava; não há caminho que gere sem a liberação. Mesmo assim, pode valer
  esconder o passo enquanto houver trava, como o bloco 3 já faz.

## 2026-11-27 — Correção da revisão da rodada 2 (questionário): o que mudou e por quê

Os 26 achados da revisão (fluxos, segurança clínica, LGPD, 360 px, links) foram conferidos no código antes de mexer;
nenhum era falso positivo. O que muda em relação à spec ou às decisões anteriores:

**Cadastro e conferência**
- **Limitação que só entra num cadastro vazio é preenchida sem perguntar** (`limitacoesPedemConferencia`). A linha
  "Limitações" de "Conferir antes de salvar" só aparece quando sai um token do app, quando o texto passaria do teto ou
  quando entra token num cadastro que já tem limitações. Em `applyAnamnese`, "Manter como está" com o cadastro vazio
  não vale: antes, o cadastro rápido via "Entra: joelho", o personal tocava "Manter" e a ficha saía com agachamento sem
  aviso.
- **"Completar o questionário" continua a rodada do junto salva pela metade** (`rascunhoDaIncompleta`): sem rascunho no
  aparelho, a boas-vindas oferece "Continuar de onde parei" com as respostas dela, na primeira parte incompleta. A
  rodada incompleta do junto é sempre completada com o mesmo id (`idDaRodadaIncompleta`), também por "Começar de
  novo": `applyAnamnese` a substitui e ela nunca vira `anamnesePrev`.

**Triagem**
- **Saúde ou Dores puladas no junto contam como dado que falta.** Reaproveita `A-PARQ-INCOMPLETO` (laranja, porta, sem
  pedir liberação médica) para não mexer na união `AlertId`. O título passa a ser "Triagem de saúde incompleta", e a
  ação, "Completar a saúde com {aluno}". O PAR-Q sozinho continua "PAR-Q incompleto". Antes, o resumo dizia "Nenhum
  sinal de alerta" e o gerador abria livre.
- **"Seguir mesmo assim" e "Conversei" só cobrem as respostas que já tinham chegado**, como a liberação (§6.4): um
  reenvio no mesmo id, ou o junto completado, reabre os alertas. O registro impresso continua com o histórico.
- **A-MENOR usa a mesma leitura cautelosa da idade do questionário** (`precisaResponsavel`, com a idade de hoje): a
  frase da lei SP vale para quem pode ter menos de 15.
- **Sem saúde num menor, o texto não diz que o aluno não autorizou**: "faltou a autorização de {aluno} ou do
  responsável". Vale para A-SEM-TRIAGEM e para o registro impresso, que vai para o CONFEF.
- No `/receber`, a autorização de um menor nomeia o responsável. A recepção recusa saúde de menor sem
  `consent.responsavel` (`menor_sem_responsavel`): o app sempre manda, então só um pacote mexido à mão cai aqui.

**Privacidade e IA**
- **Com questionário, a base da ficha sai sempre do motor do app, mesmo com a IA ligada** (`motivoDoMotorLocal`). O
  mesmo vale com os termos do app nas limitações, com o teto moderado ou com "não quero fazer". Resolve a pendência da
  integração ("a IA ignora `avoidIds` e `intensityCap`"). Também cumpre a regra do tech lead ("nada do questionário vai
  para /api/ai") e o texto da autorização ("as respostas não passam pelo servidor do Shape Real"). Na dieta, o peso
  igual ao respondido no questionário não vai para /api/ai/diet (`pesoParaIA`).
- **Restaurar uma cópia de antes não desfaz a revogação nem o "Apagar respostas".** O perfil ganha as datas
  `saudeRevogadaEm` e `respostasApagadasEm` (só datas, gravadas por `revogarSaude` e `apagarRespostas`). A cópia passa
  a levar as marcas `sr:v1:qapagado:*` (`apagadas`), restauradas sem trocar uma mais nova. Em `mesclarRestauracao`,
  quando a marca do aparelho é mais nova que a da cópia, ou a rodada da cópia tem `qapagado` gravado aqui depois dela:
  - da cópia não voltam as rodadas nem as liberações de antes do ato;
  - peso, altura e limitações ficam como no aparelho;
  - com a revogação, a autorização também fica como no aparelho.

  Muda a regra "liberações unidas por id" da spec (§9.2) e resolve a pendência das marcas `qapagado` da integração.
  Aluno inexistente no aparelho continua recebendo a cópia como veio.
- **A revogação pela tela não trava mais**: desmarcar a autorização com saúde do questionário vai direto para a
  confirmação, sem pedir "Marque a autorização…" (`faltaAutorizacao`). Perfil com saúde digitada e sem questionário
  continua como antes (pede para esvaziar os campos): o texto da confirmação fala do questionário. Fica para o dono.
- **"Apagar respostas" e a revogação apagam também o rascunho do junto** (`esquecerQuestionarioDoAluno`), e o card
  "Questionário pela metade" some na hora.
- **Junto com menor sem a caixa do responsável**: o botão vira "Salvar sem dados de saúde", com a linha dizendo o que
  não é salvo (`rotuloDoSalvarJunto`), como no link.

**Pedido pelo WhatsApp**
- **Reenvio e "Lembrar" mantêm o mesmo id, mas refazem o pacote** (`pedidoParaEnviar`), com o personal de agora e um
  `sentAt` novo. A spec §5.3 dizia "mesmo id e mesmo packed"; o que mantém o rascunho e o "Você já enviou" do aluno é
  só o id. Com o pacote antigo, um WhatsApp trocado em Conta mandava as respostas para o número velho, e o lembrete de
  um pedido de mais de 60 dias abria em "Este pedido é de DD/MM". A frase da spec §5.3 fica "mesmo id".

**Histórico, foco e 360 px**
- **`limparEndereco` (share-link.ts) troca o endereço sem perder o estado do roteador.** Com o roteador já ativo, a
  chamada vai pelo `replaceState` dele, que copia o estado e sincroniza o endereço. No efeito da primeira carga, o
  estado atual vai junto à mão. Antes, o `replaceState(null)` apagava `__NA`, e o primeiro voltar do Android recarregava
  a página do aluno, com o foco no `<body>`. Usado em /questionario, /receber, /abrir, gerador (`?auto=1`), editor da
  ficha e página do aluno.
- **Fim do questionário recolhe as entradas das partes**: cada entrada guarda `qDepth`, e o fim faz
  `history.go(-qDepth)`. No junto com rede, o resumo entra com `router.replace` no lugar da página. Pelo link, o próximo
  voltar sai da página. Outras mudanças de navegação:
  - `history.scrollRestoration = "manual"` enquanto o questionário está aberto: o voltar leva ao topo da parte;
  - /receber registra com `router.replace`: o link já consumido sai do histórico.
- **/receber e /abrir escutam `hashchange`** (outro link na mesma aba), como /questionario. Kind desconhecido ou
  `v` acima de `TRANSFER_VERSION` mostra "Atualize" em /abrir, /receber e "Colar aqui" (`ehLinkDeVersaoNova`, com o
  texto copiado de `PROBLEMA_TEXTO` e teste que compara os dois).
- **Recuo da rolagem medido**: o bloco "Sem internet" saiu da barra fixa de "Conferir e enviar" e foi para o conteúdo,
  como aviso. O recuo de baixo acompanha a altura da barra (`useStickyBarScrollPadding`) no questionário e no
  onboarding.
- Ajustes de 360 px e foco:
  - botões de /receber com nome no rótulo crescem com o texto;
  - o diálogo da trava/porta fica montado e devolve o foco ao botão (aberto por `?auto=1`, o foco vai para o título);
  - "Salvar e continuar" do pedido leva o foco para a etapa da mensagem.

Testes novos (arquivos novos): `anamnese-ficha.conferir`, `questionario-completar`, `questionario-receber.menor`,
`triagem.revisao`, `export.restauracao`, `questionario-link.revisao`, `student-form-state.revogar`,
`anamnese-perfil.ia`, `questionario-apagar`. Ajustados: o vizinho negativo de A-MENOR (19 anos), o texto de
A-SEM-TRIAGEM do menor e a integração catálogo × esquema (ano de menor leva o responsável).

## 2026-11-27 — Fechamento do QA da rodada 2 (questionário)

- **Passo "Gerar" com vermelho aberto (A1).** O passo não promete mais "Gerar" quando o gerador vai travar: vira "Montar a ficha de {aluno}", com a linha "Gerar com estas respostas libera depois de registrar a liberação" e o botão "Montar do zero" (o mesmo que a trava oferece). Com laranja o passo continua "Gerar", porque a porta fica dentro do gerador. Motivo: um botão que promete uma ação bloqueada ensina o personal a desconfiar do resumo.
- **Faixa do editor depois de "Seguir mesmo assim" (A2).** A faixa "avaliação médica pendente" continua acesa até a liberação ser registrada. O override libera o gerador, mas não é liberação (spec §6.1). O passo `liberacao` some com o override, como já estava na spec §7. A faixa é o lembrete que fica.
- **Rótulo de limitação pelo que foi escrito (A3).** A regra "idade ou artrose" passa a nomear só o que apareceu no texto ("idade", "artrose", "osteoporose", "prótese", juntos com "e"). Motivo: a spec §6.2 proíbe escrever uma condição que o aluno não marcou. O aluno de 76 anos aparecia com "idade ou artrose".
- **Fontes no aquecimento do service worker (D2).** `warm()` lê o CSS e guarda os `.woff2` latin e latin-ext. O cache sobe para v5. Sem isso, a primeira sessão sem rede abria com a fonte reserva, mais larga, e cortava o título do cabeçalho do junto (D1). O cabeçalho agora quebra a linha em vez de sobrepor.

## 2026-11-27 — Rodada M, fase M-A: JS fora do caminho crítico e service worker

Itens RM-01 a RM-05 da spec da Rodada M. Nenhuma tela mudou. Números MEDIDOS no build local (Android médio emulado,
pares intercalados contra o HEAD 11de1ab, kit `M/m-verif`), salvo indicação.

- **VERSION do service worker continua "v5" (RM-01).** O formato dos caches não mudou. A entrada nova
  `/hoje?aquecimento` em sr-pages (a marca do último aquecimento completo) não exige trocar a versão. Trocar faria todos
  os aparelhos baixarem as 14 telas de novo. Efeito visível: depois de um aquecimento completo, sr-pages tem 15 entradas
  (14 telas + a marca). Quem conta "14 telas" conta os caminhos do CORE, não o total de entradas.
- **Aquecimento depois da conversão (RM-01).** O SW continua registrado no load. O "warm" sai no primeiro gatilho entre:
  primeira navegação interna terminada + ocioso (no máximo 3 s) + 3 s; 20 s depois do load sem navegação; página oculta.
  Nunca sem rede, com economia de dados ou em 2g/slow-2g, e a regra do questionário sem perfil continua. A situação é
  avaliada no momento do gatilho, não no load. Motivo: no load, o aquecimento disputava a banda com "Salvar no meu
  celular". Toque até "Começar treino" clicável: 2,30 s na base contra 1,14 s (rodadas 1,08–1,40); sem SW, 0,92 s.
  A cobertura continua: as 14 telas guardadas 9,3–9,8 s depois do toque. Quem fecha o app antes de 20 s fica coberto pelo
  gatilho da página oculta e pelo "guardar-esta", e, se o sistema encerrar o SW no meio do aquecimento, pela próxima
  abertura (ver "Trava de 6 h" abaixo).
- **A regra do questionário sem perfil vale também para a página do load (revisão).** O gatilho (a) dispara depois de
  uma navegação interna, então a página do gatilho já pode ser outra: o aluno do link que tocava "Saiba mais" no
  rodapé do questionário ia para /privacidade, e o warm saía (MEDIDO: 14 de 14 telas e 52 arquivos no plano de dados de
  quem só abriu o questionário; na base, 0). Agora o `PwaRegister` guarda a página do load, e o bloqueio vale se ela ou
  a do gatilho for o questionário sem perfil. Os perfis continuam lidos no gatilho: quem criou um perfil depois aquece.
  Conferido no navegador: 0 de 14 telas, `sr:sw-warm` vazio, só a cópia do próprio questionário (guardar-esta).
- **Trava de 6 h só com a marca do aquecimento completo (revisão).** O `sr:sw-warm` é gravado quando o pedido sai, não
  quando o aquecimento termina. Com a página oculta logo depois de "Salvar no meu celular" e o SW encerrado 1,2 s depois
  (o iOS faz isso em segundo plano), ficavam 2 de 14 telas por 6 h, e /sessao, /treinos e /historico mostravam "Esta
  tela ainda não foi aberta" sem sinal. Agora o app confere `/hoje?aquecimento` (`caches.match`) no gatilho: sem a
  marca, o pedido recente não trava. Sem Cache API legível, vale a trava de sempre. Para não somar aquecimentos, o SW
  atende um de cada vez: um pedido que chega no meio espera o que está correndo. Custo aceito: se uma tela do CORE falhar
  sempre, cada carregamento pede um aquecimento (só os HTML, ~46 KB; os arquivos já guardados não são baixados de novo).
  Conferido no navegador: na abertura seguinte, 14 de 14 telas, a marca e 52 arquivos.
- **O aquecimento não baixa o polyfill noModule** (38,7 KB a menos; 0 KB medido) e baixa 3 arquivos de cada vez, com
  prioridade baixa. Primeiro acesso por /abrir em 30 s: 1059 → 962 KB, as duas contando a fonte latin-ext do CSS
  (os 120 KB do PostHog só mudaram de lugar).
- **O aquecimento lê as fontes de todo CSS, mesmo já guardado (integração).** O "guardar-esta" guarda o CSS da tela sem
  as fontes, de propósito (o aluno do questionário não baixa o app inteiro). Depois dele, o aquecimento achava o CSS no
  cache e pulava a leitura das fontes: a latin-ext ficava de fora (MEDIDO: sr-assets só com a latin, a que a página
  usou; na base, as duas), e a primeira sessão sem rede voltava à fonte reserva fora do latin (o D2 da rodada 2). Agora
  o warm lê as fontes de todo CSS, guardado ou não; fonte já guardada não é baixada de novo.
- **Trim por uso, não por ordem de inserção (revisão; o defeito já existia).** O cache de arquivos apagava os mais
  antigos ao passar de 320. Arquivo que não muda entre deploys nunca é regravado, e o VERSION não muda mais a cada
  deploy, então em ~20 deploys (ESTIMADO) o CSS e os chunks do /hoje guardado seriam apagados e a tela abriria sem sinal
  e sem botões (MEDIDO na simulação da revisão: 12 de 21 arquivos do /hoje apagados, 0 botões hidratados). Agora só sai,
  do mais antigo para o mais novo, o arquivo de /_next/static que nenhum HTML de sr-pages cita, nem como fonte de um CSS
  citado (chunks de deploys antigos, o polyfill noModule, `import()` que nenhuma tela guardada pede). Ícones ficam. Se
  tudo estiver em uso, o cache passa do teto: melhor que uma tela guardada quebrada. Na mesma simulação: 320 arquivos,
  nenhum em uso apagado (só falta o polyfill noModule, que nunca é guardado) e /hoje abre sem sinal com "Começar treino"
  e 22 botões hidratados.
- **Reaquecimento de 6 h compara com a marca do último aquecimento completo**, e não com a cópia de /hoje. Motivo:
  /hoje é rede primeiro e vive aberta, então a cópia dela já teria o deploy novo e esconderia as outras 13 telas
  desatualizadas. Sem deploy, só /hoje sai do SW (conferido pelo proxy: 1 pedido, nenhum arquivo); com a marca
  diferente, as 14 telas.
- **HTML guardado em 400 ms (RM-02).** Com cópia guardada, a rede tem 400 ms (antes 2,5 s) para entregar o HTML inteiro.
  A resposta atrasada continua atualizando a cópia, agora com o SW mantido vivo até gravar. Risco aceito: em rede lenta,
  o HTML de um deploy atrás aparece mais vezes. O RM-26 resolve. Abrir /hoje com sinal fraco: 2,93 → 0,79 s até
  "Começar treino".
- **Os limites de 400 ms e 1,5 s contam até o fim do corpo (revisão).** Antes valiam até o cabeçalho: com perda depois do
  primeiro pacote (o cabeçalho chega e o corpo fica preso), o SW entregava a resposta travada e a cópia nunca era usada.
  Agora o HTML e o RSC só ganham da cópia com o corpo inteiro (o RSC tem ~10 KB; a resposta devolvida é a original, já
  lida pelo clone, com `url` e `redirected`). Custo: o HTML e o RSC de rede deixam de chegar aos pedaços nesses 400 ms e
  1,5 s. As 14 telas do CORE são estáticas. MEDIDO (proxy da revisão, corpo preso 10 s, 2 pares intercalados): /hoje até
  "Começar treino" 0,72–0,79 s (base 10,4–10,5 s); "Começar treino" até "Série 1 feita" 2,26–2,32 s (base 10,2 s); menu
  Treinos 2,15–2,22 s (base 10,1 s). No modelo do kit (resposta inteira presa), os mesmos números de antes.
- **Limite de 1,5 s no RSC da navegação (RM-02).** Só quando há cópia daquele caminho em sr-pages e a página que pede está
  em outro caminho (ver abaixo), e conta até o fim do corpo. Estourou: o SW devolve erro de rede e o Next 16.4.6 cai na navegação completa, servida da cópia. Sem cópia,
  rede sem limite. Depende de `experimental.useOffline` desligado: com ele ligado, o Next esperaria a conexão em vez de
  recarregar. Sinal fraco: "Começar treino" até "Série 1 feita" 7,7 → 2,4 s; menu Treinos 5,4 → 2,2 s. Com rede normal,
  nenhuma navegação interna virou recarga (17 toques, também durante o aquecimento) e o console não mostrou "Failed to
  fetch RSC payload". Risco (a) da spec conferido: sair do treino no meio com sinal fraco recarrega /hoje pela cópia
  (2,3 s) e "Continuar treino" volta com a série 1 marcada (o rascunho fica no localStorage).
- **RSC da mesma tela sem limite (revisão).** Uma troca só de busca (`router.replace` na sessão, `?aba=`) virava recarga
  com o RSC acima de 1,5 s. Na sessão, "Continuar aquele treino" (rascunho de mais de 6 h) troca a URL; a recarga
  perguntava de novo, em laço, e o rascunho de ontem nunca reabria em rede lenta (MEDIDO: 3 de 3 toques recarregavam;
  na base, abria na hora). Agora o SW lê a página que pediu (`event.clientId` → `clients.get`) e, no mesmo caminho,
  deixa a rede sem limite, como a base. Conferido: rede lenta (2 s por resposta), abre sem recarga e sem a pergunta, na
  base e em M-A. **Fica para a costura de M-B:** sem sinal, o mesmo toque ainda entra em laço, na base e em M-A (o RSC
  falha, o Next recarrega, a tela pergunta de novo). A correção é na tela (`resumeSaved` em `sessao/page.tsx`:
  `history.replaceState` no lugar de `router.replace`, ou marcar o rascunho como retomado), fora dos arquivos de M-A e
  numa tela que a rodada 3 muda.
- **Desvio da spec: o prefetch do roteador não passa pelo SW (integração).** A spec fala em "um GET … com RSC", e a trilha
  aplicava o limite também ao prefetch. Medido com sinal fraco: cada prefetch abortado em 1,5 s liberava a vez para os
  prefetches das telas sem cópia, que disputavam a banda com o toque. O personal tocando num aluno nunca aberto passou de
  11,8 s para mais de 20 s (coach-liefi), e de 5,6 para 13,6 s depois do toque no modelo do proxy. Além disso, o prefetch
  das telas guardadas nunca terminava, então toda navegação custava limite + recarga, mesmo depois de minutos na tela.
  Agora o prefetch (cabeçalho `Next-Router-Prefetch`) segue direto para a rede, como antes. O aluno nunca aberto voltou
  a 11,9–12,0 s; do goto até o aluno aberto, 10,5 s nos dois (o limite é a banda). E, depois de 30 s numa tela com o menu, o
  toque seguinte abre em ~60 ms pelo prefetch pronto, contra 2,2 s + recarga com o limite no prefetch. A navegação cria o
  próprio pedido RSC mesmo com o prefetch pendente, e esse pedido continua com o limite. Os tempos do sinal fraco acima
  já são com este ajuste.
- **"guardar-esta" (RM-04).** No carregamento que não passou pelo SW, em qualquer rota, o app pede ao SW que guarde a tela
  (só o caminho, sem busca nem #) e os arquivos /_next/static e .woff2 que ela já baixou (do cache HTTP). Não segue a
  regra do questionário sem perfil (custa só o HTML) e não lê as fontes do CSS. Resposta com redirecionamento nunca é
  guardada. Medido: o aluno que abriu o questionário uma vez reabre sem sinal com "Continuar de onde parei" (sr-pages 1,
  sr-assets 21, sem aquecimento).
- **PostHog depois do load + 3 s + ocioso (RM-03).** O SDK sai do primeiro carregamento: −119,5 KB por rota (medida do
  tech lead sobre o c6bd5e6; com o RM-05, −181,3 a −182,4 KB aqui). Os eventos de quem fecha a aba antes disso se
  perdem: a fila fica só em memória, com teto de 200 chamadas e 20 erros não tratados. Isso inclui as recargas do RM-02: com sinal fraco, uma navegação interna pode virar
  recarga, e a página que vive menos que load + 3 s + ocioso perde a $pageview e o que esperava na fila (MEDIDO pela
  revisão, recarga 1,5 s depois do load em /abrir e /questionario: 1 $pageview em M-A, 2 na base; eventos de produto
  iguais no roteiro do questionário). Não guardamos a fila no aparelho para reenviar no próximo carregamento: seria um
  armazenamento novo de dados de medição (proibido para o aluno do link, que é justamente quem abre por link com sinal
  fraco), com risco de evento duplicado na volta do bfcache, e mais código em toda rota, com o peso já 2 a 3 KB acima
  da medida do tech lead. Efeito esperado (ESTIMADO): funis com menos registros nas sessões de sinal fraco. Não há
  economia de dados (os ~120 KB vêm depois do load).
- **Nova tentativa do SDK também com a rede ligada (revisão).** Antes só no evento `online`, que só dispara na passagem
  de sem rede para com rede: um import que falhasse com a rede ligada (sinal instável; chunk antigo com 404 depois de um
  deploy, com o HTML velho vindo do SW em 400 ms) deixava a medição desligada até recarregar, e a fila enchia. Agora
  `nova-tentativa.ts` tenta de novo no `online`, quando a página volta a ficar visível e depois de 15 s, 60 s e 5 min
  (depois disso, só pelos eventos). O mesmo vale para o módulo da nuvem em app-context.tsx. MEDIDO (os 2 chunks com 503
  nas 2 primeiras tentativas, rede ligada): novo pedido em 18,4 s (load + 15 s) e eventos a partir de 18,5 s; antes,
  nenhum pedido em 45 s.
- **Erros não tratados entre o init e a captura automática do SDK (revisão).** A captura automática do posthog-js chega
  num arquivo à parte (/ingest/static/exception-autocapture.js), pedido ~3,1 s depois do load, e só então embrulha o
  `window.onerror`. Entre o init e ela, e para sempre se ela não vier (sinal fraco), nada capturava. Agora os ouvintes
  de instrumentation-client.ts ficam depois do init e mandam direto para o SDK (`captureException`, `handled: false`)
  até `window.__PosthogExtensions__.errorWrappingFunctions` existir; daí saem, para não mandar duas vezes. MEDIDO: erro
  6,0 s depois do load (extensão abortada) sai, com o horário dele; antes, não saía. A ausência de duplicata com a
  extensão ligada é coberta por teste (ESTIMADO no navegador: a regra do kit aborta /ingest, inclusive a extensão).
  Medido: o SDK é pedido 3,0 s depois do load e o primeiro pedido a /ingest sai 3,05–3,08 s depois (na base, antes do
  load); nenhuma chave `ph_` em /questionario#d=.
- **A $pageview da abertura é nossa (RM-03).** Ela sai com a URL e o horário de quando a página abriu (sem `?k=` e sem
  `#`). A do SDK é descartada uma vez por uma trava no `capture` público, porque a trava interna do SDK tem o nome
  encurtado no pacote publicado (um teste lê o pacote e falha se a forma mudar). Página que muda dentro da fila ganha uma
  $pageview com o horário da primeira chamada dela; página visitada antes do SDK sem nenhuma chamada fica sem $pageview.
  `title`, `$prev_pageview_*` e `$initial_current_url` são os da hora do envio, aproximados.
- **Exceções que esperaram na fila saem com o horário da ação (revisão).** O `captureException` não aceita horário, mas
  chama o `capture` da própria instância na mesma hora: só durante a chamada, o `capture` acrescenta `timestamp` ao
  `$exception` e volta a ser o de antes (um teste lê o pacote publicado e falha se a forma mudar). MEDIDO: erro de
  /receber 0,40 s depois do load sai com horário de 0,401 s (antes, 3,12 s). A página (`$current_url`/`$pathname`) é a
  da ação. Erro de /questionario ou /receber enviado depois de a pessoa sair da tela sai
  só com o tipo e o código, sem a pilha, porque o `before_send` olha a página atual. As regras (telas de respostas,
  código e tipo) vêm de `questionario-base.ts`, as mesmas de `limparEventoPosthog`.
- **O teto de 200 vale só para os eventos (revisão).** `identify`, `resetIdentity` e `setContext` têm teto próprio de 50:
  com a fila cheia de eventos (sessão longa sem rede), um `register` perdido deixava o contexto velho em todos os
  eventos seguintes, e um `reset` perdido ligava os eventos depois de "Sair" à conta anterior. No uso normal são poucos
  (login, saída, mudança de modo).
- **Nenhuma propriedade nova na medição.** O horário e a página vão em campos que o SDK já manda (`timestamp`,
  `$current_url`, `$pathname`, `$referrer`). O init do PostHog é o mesmo de antes, linha por linha.
- **supabase-js só com a nuvem configurada (RM-05).** −65 KB por rota (tech lead); neste deploy o módulo nunca é pedido. Com a nuvem
  ligada e o import falhando (sem rede, arquivo fora do aparelho), o app abre com o perfil guardado (`cachedSelf`) e um
  repositório que responde "Sem conexão…" a toda leitura e gravação, nunca com o armazenamento local; a entrada tenta de
  novo no `online`. Sair da conta sem o módulo vale só neste aparelho. Telas com `.catch(() => [])` mostram lista vazia
  nesse caso: quando a nuvem for ligada, o módulo tem que entrar na pré-carga (RM-12).
- **Peso: −181,3 a −182,4 KB por rota, não −184 (desvio pequeno).** As duas bibliotecas saíram inteiras (nenhuma rota de
  link nem /entrar carrega posthog-js ou @supabase antes do load). Os 2,1 a 3,2 KB de diferença para a medição do tech
  lead (−184,5) são, por conta (ESTIMADO), o código novo que entra em toda rota: gatilhos e "guardar-esta" (RM-01/RM-04),
  a fila com a $pageview da abertura (RM-03) e, depois da revisão, a nova tentativa do SDK e os ouvintes de erro até a
  captura do SDK (+0,6 KB sobre a integração). Rotas: / 220,3; /entrar 260,6; /abrir 259,2; /questionario 316,9;
  /receber 296,5 KB.
- **Kit: a conferência de privacidade da medição não via eventos (revisão).** Com o user agent padrão (HeadlessChrome) e
  `navigator.webdriver`, o posthog-js 1.453.2 descarta todo evento como robô: os "72 pedidos a /ingest sem dado
  sensível" eram só /flags, a config e a extensão, e a frase da integração "com /ingest abortado o SDK não manda evento"
  estava errada. `posthog-check.js`, `posthog-corpo.js` e `e2e/questionario.js` agora usam user agent de Android e
  `webdriver` falso. Com eventos de verdade, nenhum vazamento (ver "Medição final" no fim desta entrada).
- **Medição local, não na Vercel.** Local, o servidor responde na hora, e a conversão no /abrir da base já fica em 2,30 s
  (Vercel 4,70 s). A meta de 2,2 s passa com folga mesmo contra a referência local (controle sem SW + 0,35 s ≈ 1,2 a
  1,3 s: 1,14 s). Android médio + SW, /hoje até "Começar treino": 1,35 → 1,18 s (meta 1,3 s).
- **Medição final (corretor, sobre o código desta entrada; build local, base 11de1ab em pares intercalados; tudo
  MEDIDO).** Onde diferem, estes números substituem os da integração citados acima.
  - Peso (KB gzip, base → M-A): / 401,6 → 220,3; /entrar 441,9 → 260,6; /abrir 440,5 → 259,2; /questionario 499,3 →
    316,9; /receber 478,0 → 296,5; /testar 396,3 → 214,9; /hoje 498,6 → 317,3; /sessao 504,9 → 323,6; /alunos 497,5 →
    316,2. Nenhuma rota de link nem /entrar pede posthog-js ou @supabase antes do load.
  - LCP (faixa de 2 rodadas): /abrir#d= 3,70–3,81 → 2,37–2,40 s; /questionario#d= 3,92–4,00 → 2,73–2,74;
    /receber#d= 3,88–3,92 → 2,59–2,60; /entrar 3,31–3,34 → 2,16–2,22; / 0,84–0,87 → 0,82–0,88. Pronto: /abrir 2,42–2,47;
    /questionario 2,81–2,89; /receber 2,72–2,79 (meta 2,8, perto do limite).
  - Conversão em /abrir com SW: 2,25–2,40 → 1,08–1,40 s (mediana 1,14; 4 rodadas, porque as 2 primeiras variaram mais
    de 10% entre si). Cobertura: 14 telas do CORE e a marca, 9,3–9,8 s depois do toque. noModule no aquecimento: 38,7 →
    0 KB. Primeiro acesso por /abrir em 30 s: 1059 → 964 KB.
  - Sinal fraco (m01-m04): "Começar treino" até "Série 1 feita" 7,57–7,74 → 2,22–2,29 s (aluno-liefi 8,18–8,22 →
    2,51–2,64); menu Treinos 5,31–5,34 → 2,13–2,20 s (aluno-liefi 8,98–9,07 → 2,29–2,31); /hoje até "Começar treino"
    2,82–2,98 → 0,69–0,73 s (HTML em 403–404 ms). Android médio + SW: 1,32–1,36 → 1,15–1,21 s. Personal: aluno nunca
    aberto 11,8 → 11,5 s; Carla, aberta antes, 11,3 → 2,5 s.
  - Sem sinal: questionário reabre depois de uma abertura (sr-pages 1, sr-assets 21); fluxos 13/13. O caso B do offline2
    (`/treinos/[id]` sem sinal) falha na base e aqui: é o RM-13, de M-B.
  - Medição de uso: uma $pageview por abertura; /hoje → /entrar dá duas, na ordem; nenhuma URL com `#` ou `k=`; nenhum
    erro. Erro 6,0 s depois do load (extensão abortada) sai com o horário dele; erro da fila sai com o horário da ação
    (0,40 s); erro de /receber enviado depois de sair da tela vai só com o tipo. Import com 503 e a rede ligada: novo
    pedido em 18,4 s.
  - Roteiros dos achados da revisão: "Saiba mais" no questionário sem perfil: 0 de 14 telas (base 0; antes da correção,
    14); corpo preso 10 s: /hoje 0,69–0,72 s, sessão 2,24–2,35 s, menu Treinos 2,16–2,20 s (base 10,1–10,5 s); SW
    encerrado no meio do aquecimento: a abertura seguinte guarda as 14 telas e a marca; trim com 320 arquivos: os 21
    do /hoje ficam, e /hoje abre sem sinal com 22 botões; rascunho de mais de 6 h em rede lenta: abre sem recarga, na
    base e aqui (sem sinal, o laço continua nos dois).
  - Roteiros de navegador (medição abortada): beta 9/9, tester 10/10, tester2 7/7, tester3 7/7, pwa 4/4, questionario
    27/27, com 132 eventos reais no questionário. Numa das duas execuções completas, 1 de 262 envios bateu na lista de
    dados sensíveis com "2010", no caso 4, que não usa esse ano (só o caso 3 usa); a busca do roteiro não exige palavra
    inteira e também bate em trechos de identificadores e horários (ESTIMADO). Na execução seguinte, que imprime o
    trecho de cada acerto: 0 de 264.

## 2026-11-27 — Rodada 3 (spec de 26/11 + estudo externo 2)

Fontes: a spec da rodada 3 (handoff externo de 26/11, itens R3-1 a R3-9) e o adendo do estudo externo 2, que muda
R3-1 a R3-9, cria R3-10 a R3-20 e vale onde os dois divergem. Triagem item a item (396 itens, com `arquivo:linha` do
11de1ab e testes descartáveis): `triagem.md`. A rodada trabalha por cima da M-A (50b5d58) e não desfaz nada dela.

**Feito (já no código; só preservar ou retestar).** Estados da série, envio honesto, metas × cardápio, "antes e agora"
na Evolução, cores semânticas e apagar dados locais (rodada 1); volume do QA-03 (1.230 kg); busca e fila no painel;
questionário (rodada 2); fotos fora da cópia, já avisado; link futuro, cortado ou adulterado (QA-04) e dois links na
mesma aba (QA-05), só reteste no e2e; "1 garrafa de 500 ml de água" já dá 500 g; o descarte do IP no PostHog está
ligado desde 21/11 (a frase da política fica; reconferir no painel antes de publicar). A triagem conta 86 itens nessa
classe.

**Agora (R3-1 a R3-20).** Prioridade, trilha e o essencial:
- R3-1 (P0, L): identidade nos links (`fichaLinkMatch`), "Ver como aluno" + link sem misturar perfis nem apagar o
  contato do personal, perfis de entrada (`perfisDeEntrada`) para "Perfis neste aparelho", restaurar a cópia de um
  aluno no aparelho do personal sem regravar o perfil dele, cancelar sem escrita, /receber sem escolha pelo nome.
- R3-2 (P1, era P0, H): `/api/versao` com `{ sha, at, protocolo, copia }` sem cache, rodapé de versão na Conta,
  checklist de release com cliente antigo e rollback. Motivo da queda: não mistura dado de pessoas.
- R3-3 (P1, L): "para enviar", "preparado sem confirmação" e "Já enviei" (declaração da pessoa); cópia que falha
  avisa; `markSessionsPrepared` diz se gravou; "Enviar 20 de 23 treinos".
- R3-4 (P1, S) + R3-10 (P1, S): minutos ativos; `plannedSets` gravado antes do filtro de `finish`; "{feitas} de
  {planejadas}"; "Continuar aquele treino" sem laço sem sinal.
- R3-5 (P1, N): leitura de alimentos (o Fato da spec "300 ml de suco → 500 g" não reproduz; o caso que falha é "1 copo
  de suco de 300 ml"); total parcial nunca vira conselho; ambiguidade vira "confira"; ml→g visível. A unidade original
  NÃO é gravada agora (depois da confirmação, os gramas são a verdade).
- R3-6 A (P1, L): restaurar com foto em memória (`comFotoDoArmazenamento`), validação antes da 1ª escrita, versão
  futura recusada, plano de restauração que não desfaz edição mais nova (P2) e roteiro em dois contextos (P2).
  R3-6 B (P1, S): volume com uma convenção só (`volumeElegivel`/`volumeDaSessao`) lido nos 5 pontos; CSV com unidade.
  Do R3-6 da spec seguem também: faixa de reps invertida (N no editor, S no schema do link) e `listStudents` lendo
  cada coleção uma vez (H).
- R3-7 (P1, S): o comportamento muda. Com dor marcada, nenhuma sugestão de carga (nem "Manter") e campo de carga
  vazio; "Dor marcada" visível no texto do envio; dor nunca no analytics.
- R3-8 (P2, H): Hoje com "Treino de hoje registrado" (completude quando houver `plannedSets`) e o aviso de 7 a 13 dias.
- R3-9 (texto, H) + R3-18 (P2, H): privacidade em três blocos (beta no aparelho, o que vai pelo WhatsApp, nuvem quando
  existir), aviso único "Quem tiver o link consegue ler…", sem "em conformidade", Termos sem cobrança no beta, FAQ,
  âncoras, rótulo anual verdadeiro, link do blog fora (decidido na rodada: o dono não abriu o domínio, mas a main do
  repositório mostra autores com registro profissional fictício) e a landing sem prometer que o aluno devolve o treino
  sozinho.
- R3-11 (P1, N): o resumo do questionário nunca diz "Nenhum sinal de alerta" com alerta azul; A-PARQ-INCOMPLETO também
  fora do modo junto. R3-12 (P1, N): nota do cardápio sem "mantendo a quantidade".
- R3-13 (P2, L): "Remover aluno" + restaurar não traz a saúde de volta no mesmo aparelho.
- R3-14 (P2, S): CSV não executa fórmula. R3-15 (P2, S e H): "recebidos", não "feitos", no modo local. R3-16 (P2, S):
  meta da semana com uma regra só. R3-17 (P2, L): o envio da ficha diz o que vai no link.
- R3-19 (P2, Fundação): analytics filtra propriedades por evento em tempo de execução.
- R3-20 (P2, revisão e QA): lente "leitor de tela" com script fora do app.
Se faltar tempo, sai primeiro: R3-20, R3-16, R3-15, R3-17, R3-14, R3-19, R3-18, R3-13, R3-8. Não cortar: R3-1, R3-6 A,
R3-7, R3-4 com R3-10, R3-11, R3-12, R3-5, R3-3, R3-9, R3-6 B, R3-2.

**Vai para M-B.** Aceites novos do RM-07 (erro da geração visível), RM-15 (foco volta a quem abriu o diálogo) e RM-24
(maiúsculas acentuadas); o mínimo do RM-26 já entra no aceite do R3-2; o laço sem sinal do RM-02 virou o R3-10; lente 6
e passadas com TalkBack, VoiceOver e tablet; roteiro §7 (campo 30 → 35; aviso do iPhone no silencioso, se confirmado);
E2-a11y-orientacao (P3). Arquivos que a R3 toca antes da M-B, nunca em paralelo: site-chrome.tsx, (site)/page.tsx,
diet-demo.tsx, alunos/page.tsx, conta/page.tsx e resumo-aluno.tsx.

**Gate da nuvem (nada agora).** C-01 (vínculo redirecionável), C-03 (fila descarta treino), C-04 (histórico cortado em
80) e a matriz E2E multiator são P0 antes de existir `NEXT_PUBLIC_SUPABASE_URL` em produção; C-02, C-05, C-06, banco
real, rede e concorrência são P1; troca de conta offline e C-07 são P2; CSP, checkout, README como runbook, textos e
remetente do link vêm antes de ligar ou de cobrar. Correções numa migração 0003, forward-only.

**Depois (motivo ou gatilho).** Biblioteca com mídia licenciada (licença e revisão); RIR/RPE avançado; filtros por
motivo (carteiras pequenas); editor compacto no desktop; redesenho do Hoje, com estado de cuidado, descanso planejado e
pausa que não zera a sequência (dados do piloto); lembretes (sem push confiável no PWA); check-in semanal; nuvem (gate
acima); unidade original da dieta no item e no link (o piloto pedir); lembrar em /receber a escolha manual de aluno
(aparelho do personal recriado sem cópia, raro); aviso de treino aberto em outra aba (relato de série perdida); editar
série salva (marcas suspeitas no piloto); cifra dos links (teste em aparelhos; sigilo exige a chave fora do link);
senha na cópia (exige recuperação e suporte); IA com teto de gasto (o dono ligar a IA); ensino no momento certo e tempo
por série (piloto); carteira com mais de 20 alunos; eventos novos só com a função (nunca `next_action_selected`). P3
baratos só como carona no arquivo já aberto: E2-relatorio-sem-base (no R3-15) e E2-meta-snapshot (no R3-16); os demais
(E2-mais-seguro, E2-cadastro-padroes, QA-24 e E2-ameaca-wipe, QA-33, E2-flag-questionario, E2-prazo-retencao) ficam
para a próxima rodada.

**Não fazer (motivo).** "Conferido pelo personal", recorde dourado, "Salvar e enviar" e diário alimentar (já
rejeitados pelo dono); rankings, streak diário e feed social (fora do MVP); PRs separados. Do adendo: recusar a cópia
por exercício próprio sem definição (recusaria cópias legítimas); marcador `sr:restore:pendente` (mais uma escrita que
pode falhar); "Manter {carga}" ou carga pré-preenchida com dor (manutenção automática); "Continuar o Treino B" no card
do Hoje (segunda sessão no mesmo dia); derivar séries planejadas de `sets.length` (subconta); equivalência de alimentos
calculada na nota (orientação nova, decisão do dono); linha de "dados de saúde" na cópia do aluno (DECISIONS de 26/11:
aviso só para o personal); "restaurar traz de volta" no diálogo de restaurar (falso depois do R3-13); enfraquecer a
frase do IP; duas soluções no filtro de analytics (uma allowlist; o regex vira teste); recusar no schema o PAR-Q pela
metade (perderia respostas antigas; a triagem sinaliza); manter marcas de exclusão depois de "Apagar tudo" sem decisão
do dono; chamar o link de "seguro", "protegido" ou "criptografado"; "comunicar prontidão" do questionário offline;
bloquear sempre treinos de B em A no /receber (há caso legítimo; vale a confirmação); adiar a M-A; marketplace,
afiliados e anúncios; esconder o menu em paisagem (E8). As decisões que são do dono estão listadas na triagem.

**Fundação: o que mudou em relação à spec e ao adendo.**
- **Filtro de analytics na drenagem, listas fora do primeiro carregamento (R3-19).** `ALLOWED_PROPS` (`satisfies
  Record<EventName, readonly string[]>`) e `filtrarProps` ficam em `src/lib/analytics-props.ts`, importado só por
  posthog-init.ts, que entrega o filtro a `anexarPosthog`; a fila e as chamadas seguintes passam por ele antes de ir
  ao SDK. O adendo dizia "em `track()`, antes de enfileirar"; a fila fica só em memória e nada sai do aparelho antes
  do SDK, então o efeito para a privacidade é o mesmo, e as listas (ESTIMATIVA do adendo: ~1,5 KB gzip) não entram em
  rota nenhuma no load. Em analytics.ts entram só a variável do filtro e a chamada (ESTIMATIVA: menos de 0,1 KB; a
  integração mede / e /abrir). Em desenvolvimento sem token, `track` pede analytics-props.ts por `import()` só para
  avisar (fora do build de produção). Descarta chave fora da lista, texto com mais de 64 caracteres e valor que não é
  número, booleano ou null; o aviso cita a chave, nunca o valor. DROP_PROPS continua; o regex FORBIDDEN virou teste.
  Um teste lê todas as chamadas a `track()` pelo verificador de tipos e falha com chave fora da lista.
- **`workout_completed.minutes` (duração bruta) sai da lista; entra `minutos_ativos`** (`FaixaMinutosAtivos`, com
  `faixaMinutosAtivos` em session-time.ts). Até a trilha S trocar a chamada, a duração não sai no evento (exceção
  documentada no teste do inventário). Motivo: a spec pede faixa de minutos ativos, nunca o bruto.
- **Sugestão com dor tipada em progression.ts**, onde o tipo já morava: `SuggestionKind` ganha `"dor"` e
  `LoadSuggestion` vira união em que `kind: "dor"` só aceita `loadKg: null`. `parseDraft` (workout-draft.ts) passou a
  zerar a carga de uma sugestão "dor" vinda do rascunho, para o tipo fechar.
- **Leitores de session-time.ts implementados, não neutros.** `activeMinutes`, `sessionCompleteness` e
  `faixaMinutosAtivos` seguem a regra literal da spec e do adendo (sem `activeMin`, bruto só até 180 min; sem
  `plannedSets`, `planejadas` null) e têm teste: o Hoje (H) e a costura dependem deles em paralelo. A gravação de
  `activeMin` e de `plannedSets` é da trilha S.
- **`volumeElegivel` e `volumeDaSessao` implementados** (convenção do R3-6 B, com teste). `sessionVolume` não mudou: a
  troca dos leitores é da trilha S.
- **`fichaLinkMatch` e `perfisDeEntrada` com retorno neutro** (o comportamento de hoje); a trilha L preenche.
- **`comFotoDoArmazenamento(fn, incompleta?)`**: foto em memória de `sr:v1:*` e `sr:sent:*`; em qualquer erro volta à
  foto (primeiro apaga as chaves novas, depois regrava as que mudaram, as que encolhem a cota antes) e confere. Cota →
  `DataError(TEXTO_COTA_LOCAL, "limit")`; outro erro sobe intacto (os erros tipados de quem chama continuam
  reconhecíveis); volta que falha → `ArmazenamentoIncompleto` com o texto da restauração ou o que quem chama passar
  (link de ficha e retorno de treinos precisam de texto próprio). Pode ser aninhada. Fotos (IndexedDB) e o rascunho
  (`sr:draft:*`) ficam fora da foto.
- **Texto único de cota no modo local** em toda gravação do repositório local: "Não coube neste aparelho. Nada foi
  alterado. Libere espaço e tente de novo." (sai "crie uma conta na nuvem"). "Nada foi alterado" vale para a gravação
  que falhou e, com a foto, para as operações de várias gravações. Risco residual: operações locais de várias
  gravações fora da foto (ficha ativa ao salvar, cadastro de aluno, exclusão de conta) podem parar no meio com a cota.
- **CSV em `domain/export-csv.ts`**, reexportado por export.ts (nenhum importador mudou; `downloadText` ficou em
  export.ts). Os testes de CSV moram em arquivos mistos e continuam lá.
- **`components/send-to-coach.tsx`** com `usePendingWorkouts`, `useSessionDelivery` e `SendToCoach`, reexportados por
  transfer-share.tsx. Contrato do hook: `{ toSend, prepared, declareSent(ids), dismiss(ids) }`, com o comportamento de
  antes até a trilha L mudar: `prepared` vazio, `declareSent` grava na lista antiga, `dismiss` não faz nada. Hoje e
  Histórico leem `toSend`.
- **Duas abas (R3-4, item 4): limitação conhecida.** Um rascunho por usuário e nenhum ouvinte de `storage` na sessão:
  vale a última gravação, e séries marcadas na outra aba podem sumir (HIPÓTESE, não reproduzida). O aviso fica em Depois.

**Ficam para a costura ou a integração registrar** (dependem do que as trilhas fizerem): a escolha do R3-10
(`history.replaceState` ou marca no rascunho); o limiar de "parcial" e se a meta semanal conta dias distintos (R3-4);
a convenção do volume (R3-6 B); a mudança da promessa do diálogo de restaurar (R3-6 A.4) e a frase que substitui a de
"Remover aluno" + restaurar (R3-13); a §6.2 da spec da anamnese e o D-20 (R3-11); a regra única da meta (R3-16); o link
do blog fora e a correção da pendência do IP (R3-9); e o peso medido do R3-19 em / e /abrir.

## 2026-11-27 — Rodada 3, costura: pontas ligadas e desvios das trilhas

**Pontas ligadas na costura.**
- **Hoje** (H + L + S): banner forte só com `toSend` e linha dos copiados com [Já enviei] [Copiar de novo] [Dispensar]
  (hook do L, tela do H); card "Treino B registrado hoje · 1 de 24 séries" pelo `plannedSets` (`completude`); "Sua
  semana" com "2 de 3" e, embaixo, "1 parcial" (`parciaisNaSemana`, session-time.ts), só com meta e só com 1 ou mais.
  Sem meta, o card mostra o volume e nenhum rótulo de parcial.
- **/alunos**: a linha do aluno ganha "· 1 parcial" depois de "2 de 4 na semana" (`StudentSummary.partialWeek`,
  calculado em `summarizeStudent` pela mesma regra; vale para o local e, quando existir, para a nuvem).
- **Duração**: nenhum leitor faz `finishedAt − startedAt` fora de `activeMinutes` (session-time.ts). Hoje e /alunos
  não mostram duração de treino (o "cerca de N min" do Hoje é a estimativa da ficha, não do treino feito).
- **Volume**: nenhum leitor usa `s.volumeKg` (Hoje por `volumeDaSemana`, relatório, CSV, página do aluno, Histórico,
  Evolução e sessão por `volumeDaSessao`/`volumeElegivel`; demo.ts grava o cache por `sessionVolume`, que delega).
  `sameSession` passa a ignorar `volumeKg`: o cache recalculado na chegada pelo link não faz um treino igual virar
  "atualizado" no /receber nem "diferente" no plano de restauração. Com isso o pedido do L (recalcular o `volumeKg` em
  `importTreinos`) já está coberto: `parsePacket` recalcula e a comparação ignora o cache.
- **Dor no treino recebido** (S): a prévia do /receber mostra "Dor marcada: {exercícios}" em cada treino com dor, com
  ícone (como a página do aluno e o Histórico).
- **Conta** (L + H): no modo local, o "Sair" explica "Seus dados continuam neste aparelho; para voltar, toque no seu
  nome na entrada." (`aria-describedby`) e leva a /entrar ("Perfis neste aparelho"); na nuvem, segue para /. A
  autorização de saúde diz "Fica neste celular; só vai para o personal o que você enviar." no modo local (R3-9 item
  5); na nuvem fica o texto de antes ("Só eu e o personal que eu aceitar temos acesso."), que só lá é verdadeiro.
  "Apagar dados deste aparelho" também tira `sr:hoje-retomar:*` (o "Dispensar" do convite de retomar).
- **Frase curta das cópias** (R3-9 item 4): `TEXTO_COPIAS_ANTIGAS` ("Cópias de segurança feitas antes continuam com
  esses dados. Apague os arquivos se não precisar deles.") no fim de `TEXTO_REVOGAR`, do diálogo "Apagar respostas" e
  do "Remover {nome}?" (só no ramo de remover; o "Desvincular" da nuvem não). NÃO entra no diálogo de restaurar. A
  spec da anamnese (§11.2) dizia `TEXTO_REVOGAR` literal: o literal continua, com a frase depois.
- **Aviso do link** (R3-17) no SendDietPanel e no SendFichaLink (save-summary.tsx, fora da barra compacta; substituído na
  correção da revisão de 28/11: o aviso também na barra compacta), só com o
  envio liberado: sem ficha nem cardápio, ou com alteração por salvar, o aviso falaria de outro link. Carona do R3-3 no
  SendDietPanel: a cópia que falha mostra o mesmo texto do CopyButton e não registra o toque.
- **Analytics**: a exceção `workout_completed.minutes` saiu do teste do inventário (a sessão já manda
  `minutos_ativos`). Nenhuma chave nova em `track()` nas trilhas.
- **Comentário de `semAlertasTexto`** (anamnese-types.ts) descreve os três casos do R3-11.
- **Meta semanal: continua contando sessões** (Hoje, /alunos e relatório, sem mudança). O adendo recomenda dias
  distintos; trocar muda os três juntos (`sessionsThisWeek` e report.ts) e o "150%" do repro só aparece com dois
  treinos no mesmo dia. Fica para o dono decidir.
- Peso: `summarizeStudent` (repository.ts, carregado pelo AppProvider em todas as rotas) passou a importar
  session-time.ts; /entrar, /abrir, /receber e /questionario já o tinham pelo transfer.ts. ESTIMATIVA para / e /testar:
  menos de 0,5 KB gzip (só `parciaisNaSemana` e `completude`). A integração mede.

**Trilha L (R3-1, R3-6 A, R3-13, R3-3, R3-17).**
1. "Manter" o personal como perfil de entrada também tira o vínculo e os exercícios próprios do link, não só o
   contato. Sem isso o aluno do link entraria no painel do personal, e a próxima cópia o tornaria aluno dele.
2. `importTreinos` pede `confirmedOther` também com link de outro personal (o adendo só pede o aviso na tela; a camada
   garante que a tela o mostrou). Mesmo personal e aluno do link: nada muda.
3. Contato do personal = regra do adendo + "criador de conteúdo" (quem criou ficha ou dieta de aluno sem
   `managedBy`), sem campo novo: depois de "Trocar de personal", o contato antigo não aparece como perfil de entrada.
4. "Perfis neste aparelho" fica em transfer-client.ts (não pesa no app-context); no app-context só `continueAsLocal` e
   `perfisDeEntrada`.
5. A restauração lê `sr:v1:{programs,sessions,metrics,diets}` direto, uma vez (`colecaoLocal`): o repositório não lê
   por id entre perfis.
6. R3-13 substitui a frase "Aluno inexistente no aparelho continua recebendo a cópia como veio" (entrada de 27/11,
   correção da revisão da rodada 2): sem perfil no aparelho, a cópia passa pelo mesmo corte das rodadas marcadas ou
   respondidas antes da marca mais nova. Sem marca nenhuma, a saúde volta: é o limite do modo local.
7. Plano de restauração: muda a promessa do diálogo (as linhas do plano no lugar de "os mesmos registros são
   substituídos"); treino diferente dos dois lados fica o do aparelho; medida diferente entra a da cópia; ficha e
   dieta, a mais nova pelo `updatedAt` (empate com conteúdo diferente: a cópia, como antes; data ilegível nunca vence);
   a ficha ativa continua a do aparelho. Relógio mexido para trás pode fazer uma edição parecer mais velha.
8. R3-3: copiar de novo depois de "Já enviei" volta a "preparado" (vale o fato mais novo). Dispensar vale só para os
   toques anteriores.
9. R3-17: o aviso cita peso, altura e limitações, não sexo nem ano de nascimento, para caber a 360 px.
10. /abrir: o perfil do link que já está no celular é atualizado, nunca duplicado (busca só por `remoteCoach.id` e
    `studentRef`, só perfil de entrada, só com exatamente um). Sem perfil aberto, entra como "mesmo"; com outro aberto,
    "Este link é do perfil de {dono}" com "Atualizar o perfil de {dono}" e "Voltar".
11. Homônimos: com o mesmo primeiro nome, as telas usam o nome inteiro; com nomes iguais, "Mesmo nome, outro cadastro
    de {personal}."
12. "Ver como" no /abrir: "Voltar ao painel" leva a /alunos; no /receber o personal fica na página.
13. Restaurar que falha mantém o diálogo aberto com o erro e "Tentar de novo"; o perfil com rodadas omitidas só abre
    em "Continuar" (o aviso do R3-13 sumia no redirecionamento).
14. CopyButton vira um bloco (`flex-1 flex-col`): o botão e a linha de falha juntos em qualquer fila.
15. /receber: o aviso de outro personal vem antes da escolha; o botão de confirmação usa o nome inteiro do aluno.

**Trilha S (R3-7, R3-4, R3-10, R3-6 B, R3-14, R3-15, R3-16).**
- R3-10: as duas soluções. `resumeSaved` usa `history.replaceState` (sem navegação sem sinal) e grava `resumedAt` no
  rascunho; a regra das 6 h (`decidirRascunho`) conta da retomada. Só uma delas não cobre "recarregar continua no
  treino" com rascunho antigo, nem depende do service worker no recarregamento forçado.
- R3-4: um limiar só, 30 min (`PAUSA_LONGA_MS`): intervalo de até 30 min conta inteiro; acima disso sai inteiro, com
  "Você ficou {X} fora. Esse tempo não entra no treino." Minutos de cardio marcados justificam o intervalo. Relógio que
  volta não soma. Rascunho antigo sem relógio: sem `activeMin`, vale a duração registrada até 180 min, rotulada
  "início ao fim". O esboço da spec (cortar acima de 20 min para 20) criava um degrau e contradizia o aviso.
- Completude: `plannedSets` = séries no treino ao finalizar (inclui as acrescentadas). "{feitas} de {planejadas}"
  sempre que menor; o rótulo "parcial" só abaixo de 50% (`LIMIAR_PARCIAL`).
- Volume, convenção única: carga × reps só em série feita contada em reps (`unitOf`); assistida, tempo e peso
  corporal sem carga dão 0; unilateral não dobra. `volumeKg` é cache, recalculado no Finalizar e na chegada pelo link.
- Dor: treino sem nenhuma série feita continua sem salvar (a dor de quem parou o treino inteiro não fica). Trocar o
  exercício tira o "Senti dor" dele. Desmarcar no resumo tira do que é gravado e enviado o exercício que só estava
  lá pela dor (a tela continua mostrando). "Senti dor" é caixa opcional, nunca obrigatória, nunca no analytics.
- Campos novos do link tolerantes (`.optional().catch(undefined)`): valor malformado some e o link nunca é recusado.
  `TRANSFER_VERSION` continua 1.
- Correção dos minutos depois de salvar (a spec diz antes): o treino já é gravado no Finalizar; a correção grava de
  novo e marca "(ajustado)", como sentimento e anotação.
- Relógio do cabeçalho pelo tempo ativo (sem isso o treino de ontem retomado mostraria "1440:00"); conta o intervalo
  sem atividade só até 30 min e, passado isso, volta ao tempo ativo gravado (correção da revisão: antes parava em
  +30 min, que o resumo nunca gravava); rascunho antigo mostra a duração só até 180 min.
- Aviso de pausa no rodapé fixo (a retomada rola até o exercício e esconderia um aviso no topo).
- R3-14: `cell()` põe apóstrofo em texto que começa com `=`, `+`, `-`, `@` (também depois de espaços), TAB ou CR;
  números nunca. R3-15: no modo local, "Treinos recebidos", "Frequência pelos treinos recebidos" e "N de P treinos
  combinados recebidos" no relatório e no texto do WhatsApp. R3-16: meta por `weeklyGoal` na página do aluno e
  `reportGoal` no relatório; "de {meta}" só em "Esta semana" e a nota "Combinados pela frequência atual: N treinos por
  semana." (E2-meta-snapshot). E2-relatorio-sem-base: "Nenhum exercício com carga tem dois registros no período para
  comparar."
- Os testes de texto pedidos em transfer.test.ts e report.test.ts estão em transfer.r3.test.ts e report.r3.test.ts.

**Trilha N (R3-11, R3-12, R3-5, faixa do R3-6).**
- R3-11 altera a §6.2 da spec da anamnese e o D-20 (o D-30 continua): com algum alerta azul e nada mais forte, "Há
  cuidados para revisar nas respostas de DD/MM (veja abaixo). Nenhum deles trava ou limita a ficha. Isso não
  substitui a avaliação presencial." e ícone `Info` em steel (neutro; o azul é o tom dos cartões logo abaixo). Com
  A-GESTANTE-OK, "Nenhum deles trava a ficha." (o token ajusta a ficha, "não limita" seria falso). A-PARQ-INCOMPLETO
  passa a valer fora do junto, sem recusar o pacote.
- R3-5: medida explícita depois de uma contagem vence a porção padrão; "cada" multiplica, "no total" usa a medida
  inteira, sem nenhum dos dois o item fica "confira" com as duas leituras (no total parcial entra a menor). ml → g só
  para `ML_IGUAL_G` (foods.ts), com a conversão visível. Entradas cruas da TACO (`arroz_cru`, `macarrao_cru`,
  `feijao_cru`); "cru" sem entrada crua fica "confira" (sem o apelido "feijão preto cru", que mudava a ordem da busca).
  Pacote sem peso = 100 g com "confira"; teto de 3 kg por item com "confira". Corrigida a vírgula decimal ("0,5 kg"
  dava 3000 g). A unidade original continua sem ser gravada (Depois).
- Resumo parcial diz "item(ns) não reconhecido(s)", não "linha(s)" (dois trechos podem estar na mesma linha); o pedido
  varia com o que falta conferir. No total parcial também saem "Distribua a proteína" e "Não encontrei salada".
- Revisão na Dieta: itens da IA editáveis, e depois da correção as dicas da IA saem com uma linha explicando (o motor
  não refaz dica de item sem `foodId`). "Não contar" por trecho não lido (decisão explícita da pessoa). "Usar como
  cardápio" com item a conferir não pede confirmação, só a linha "1 item ainda está para conferir…". Teto de 3000 g na
  revisão; o editor do cardápio continua com 2000. Região viva "Análise pronta. {resumo}" e, depois de cada correção,
  "{o que mudou} Total [parcial]: …" (800 ms de espera ao digitar). Foco: remover vai para a quantidade do item
  seguinte; "Não contar" vai para o próximo "Não contar"; escolher opção ou "Está certo" vai para a quantidade.
- R3-12: nota nova do cardápio ("Cardápio de referência montado para as suas metas. Para trocar um alimento, edite o
  item: o total do dia é recalculado."); a frase da água fica até a decisão do dono; dieta já salva não é reescrita.
- R3-6 (editor): a faixa invertida troca Mín e Máx ao sair do campo (antes igualava) e anuncia "Faixa posta em ordem:
  de 8 a 12."; fichas antigas salvas invertidas só se ajeitam na primeira edição ou salvamento (`normalizeForSave`).
- O teste da matriz chama-se nutrition.handoff.test.ts (o adendo dizia nutrition.r3-5.test.ts).
- Redação final do texto de saúde (frase do cuidado, nota do cardápio, frase da água) fica com o dono.

**Trilha H (R3-9, R3-18, R3-2, R3-8, listStudents).**
- Link do blog fora (site-chrome.tsx) enquanto a main tiver autoria ou credenciais não comprovadas; volta em 2 linhas
  se o dono confirmar que o domínio não mostra esse bloco.
- R3-18: o parágrafo do personal na landing perdeu "Pare de mandar ficha em PDF e cobrar foto de carga pelo WhatsApp."
  e o "no painel" da redação do adendo. O aceite pede até 4 linhas a 360 px; medido com Archivo 17 px: texto do adendo
  5 linhas, com a frase do PDF 6, o escolhido 4. O dono pode reescrever.
- R3-9 item 3: "Discard client IP data" está ligado no PostHog desde 21/11 e o questionário manda `$ip` null; a
  pendência da costura do questionário (26/11, "ligar 'Discard client IP data'") está desatualizada. Esta entrada
  corrige; a antiga fica. A frase do IP na política fica. Reconferir no painel do PostHog antes de publicar.
- R3-9: política em três blocos (aparelho, WhatsApp, nuvem "hoje não disponível"); o aviso "Quem tiver o link consegue
  ler…" fica uma vez, no bloco do WhatsApp, valendo para todos os links. Termos com "Beta sem cadastro" e "No beta não
  há cobrança.". Rótulo anual: "2 meses grátis" só quando o anual é exatamente N mensalidades (Personal); senão
  "economia de R$ X" (Pro, R$ 89,80). O preço não muda (a recomendação ao dono continua: Pro anual R$ 199). Textos da
  política, dos Termos e da landing feitos na etapa 1 (o texto é o item).
- R3-2: `NEXT_PUBLIC_BUILD_SHA` (7 caracteres de `VERCEL_GIT_COMMIT_SHA`, ou "local") e `NEXT_PUBLIC_BUILD_AT` pelo
  `env` do next.config; `GET /api/versao` = `{ sha, at, protocolo, copia }`, no-store, force-dynamic; o formato do sha
  é conferido de novo em src/lib/versao.ts (arquivo novo: route.ts não exporta funções avulsas e o next.config não
  importa de src). Troca o teste antigo "nenhum valor de process.env com mais de 8 caracteres" (o `at` é ISO). O
  rodapé "Versão {sha} · dd/mm · links v{N}" aparece na Conta para todos os perfis, inclusive teste e "Ver como aluno";
  a página só renderiza no navegador, então o fuso não diverge na hidratação.
- R3-8: convite de retomar de 7 a 13 dias de calendário (`RETOMAR_APOS_DIAS`); de 14 em diante, o aviso de volta de
  sempre. "Ficou parcial" só para o último treino, se não for de hoje e tiver menos de 7 dias. Dois treinos no mesmo
  dia: "2 treinos registrados hoje", sem completude. Sem "Continuar" no card. Com treino registrado hoje, o card
  "Treino B registrado hoje · 1 de 24 séries" (o título é a própria linha, para não repetir "registrado hoje") toma o
  lugar do card do próximo treino, que fica recolhido em "Ver o próximo treino" com "Começar o treino C agora"
  secundário. O "Dispensar" do convite grava `sr:hoje-retomar:{userId}` = id do último treino (fora de `sr:v1` e da
  cópia; a costura incluiu a chave no "Apagar dados deste aparelho"); treino novo seguido de outra pausa traz o
  convite de volta.
- R3-3 no Hoje: falha ao gravar "Já enviei" ou "Dispensar" diz "Não deu para registrar neste aparelho. Tente de novo." e
  a linha fica; "Dispensar" nunca vira confirmação ("Lembrete dispensado. O treino continua no Histórico.").
- R3-6: `listStudents` local lê cada coleção uma vez e agrupa por aluno (antes, 3 leituras da coleção inteira por
  aluno); resultado idêntico (teste de equivalência).
- Os testes de função pura do R3-8 estão em hooks.r3.test.ts (não em hooks.test.ts).

## 2026-11-27 — Rodada 3, integração: build, links antigos, peso e uma correção de grafo

**Estado.** `npx tsc --noEmit` limpo; `npx vitest run` com 104 arquivos e 2.321 testes verdes (o maior,
engine.test.ts, leva 25 s; nenhum arquivo perto de 60 s, nada dividido); `npm run build` sem erro, com
`.env.production.local` só durante o build (token FICTÍCIO do PostHog, para o pacote ficar igual ao de produção) e
apagado depois. Sem commit nem deploy.

**Emendas conferidas (passo 4 do adendo).**
- Nenhum TODO nem esqueleto com retorno neutro nos arquivos da rodada: todo `return null/[]/0/false` acrescentado é
  guarda de entrada.
- Links e cópias de ANTES da rodada abrem. As fixtures foram geradas com o código da M-A (50b5d58, produção), por um
  teste rodado numa extração desse commit: ficha com dieta e exercício próprio, treinos, pedido e respostas do
  questionário, cópia v2 do personal, cópia v2 do aluno e v1. Somam-se os links da interface do 11de1ab (kit da rodada
  M). Ficam em `src/lib/integracao.r3.fixtures.ts`; o teste é `src/lib/integracao.r3.test.ts` (11 testes).
  - O teste cobre: link de ficha num aparelho vazio entra como perfil novo e, reaberto, atualiza sem duplicar;
    retorno de treinos sem `plannedSets` e sem dor registra 2 treinos, sem completude inventada, com o volume
    recalculado; reabrir o mesmo retorno não duplica; pedido e respostas abrem; cópias v1 e v2 restauram num aparelho
    limpo; restaurar 2 vezes dá as mesmas contagens.
  - O schema aceita `plannedSets`, `activeMin` e `pain` malformados, descartando só esses campos. Bem formados,
    passam.
  - No build de produção, a 360 px, a mesma lista abre no navegador sem erro nem rolagem horizontal. As cópias
    restauradas pelo /entrar mostram o plano antes de confirmar.
- `/api/versao` responde exatamente `{ sha, at, protocolo: 1, copia: 2 }`, com `cache-control: no-store`. O `sha` é
  "local" sem `VERCEL_GIT_COMMIT_SHA`. O `at` não muda ao reiniciar o `next start`, é o mesmo valor inlinado no pacote
  do navegador, e o rodapé da Conta mostra "Versão local · 27/11 · links v1", batendo com a API.
- Analytics: nenhuma chave de dor em evento nenhum (analytics.allowlist.test.ts); `workout_completed` leva só a faixa
  `minutos_ativos`.
- spec-m §5:
  - Nenhum import estático novo de generator, exercises, foods, zod, posthog ou supabase em /abrir, /questionario,
    /receber, /entrar, app-context.tsx ou pwa.tsx. Os módulos novos que entram ali são puros: link-identity,
    perfis-de-entrada e completude.
  - O kit confirma que nenhuma das rotas medidas carrega posthog ou supabase antes do `load`.
- Roteiros de navegador rodados no build final, porta 3572, com a medição de uso abortada:
  - `rodada3/e2e/restaurar-dois-contextos.js` (trilha L): 15 de 15 passos. Inclui o R3-6 A.5 (dois contextos: o
    aparelho B restaura e vê 2 alunos, o NOME do exercício próprio e 1 treino), o "Ver como" + link, "Voltar" sem
    gravar e "Perfis neste aparelho" nos dois aparelhos.
  - `rodada3/integ/r3-10-offline.cjs` (R3-10, SW ligado):
    - o rascunho de 7 h com série feita pergunta com rede;
    - sem sinal, um toque em "Continuar aquele treino" abre o treino com a série marcada e o aviso "Você ficou 7 h
      fora", sem a pergunta repetida;
    - recarregar sem sinal continua no treino.
  - Âncoras do menu: em 1024×768, "Planos" de /privacidade e de /termos leva a `/#planos` com a seção visível.
  - A 360 px, /, /privacidade e /termos ficam sem rolagem horizontal.

**Correção da integração: código de tela fora do grafo de toda rota.**
- O app-context importava duas funções de link-identity.ts. Por isso as telas e os textos do /abrir e do /receber iam
  para o chunk raiz de TODAS as rotas, porque o Turbopack não poda exportação dentro do módulo.
- O mesmo acontecia com o relógio do treino (session-time.ts), via repository.ts (`parciaisNaSemana`, da costura).
- Agora:
  - `perfisDeEntrada`, `criadoresDeConteudo`, `ehContatoDePersonal` e `ehPerfilDeTesteOuExemplo` moram em
    `domain/perfis-de-entrada.ts`, puro;
  - a completude (`sessionCompleteness`, `completude`, `completudeLinha`, `parciaisNaSemana`, `textoParciais`,
    `LIMIAR_PARCIAL`) mora em `domain/completude.ts`;
  - link-identity.ts e session-time.ts reexportam tudo, então nenhum importador nem teste muda de import;
  - app-context.tsx, repository.ts e hooks.ts importam dos módulos pequenos;
  - o teste de pureza de link-identity aceita o import do irmão puro e confere que perfis-de-entrada.ts só importa
    tipos.
- Medido com o mesmo build, antes e depois: o chunk raiz cai 2,2 KB em todas as rotas.
- As rotas que usam esse código passam a levá-lo nos próprios chunks:

  | Rota | Diferença |
  |---|---|
  | / | −2,3 KB |
  | /testar | −2,2 KB |
  | /questionario | −1,3 KB |
  | /abrir | +0,3 KB |
  | /receber | +0,1 KB |
  | /hoje | +0,2 KB |
  | /alunos | +0,5 KB |
  | /entrar | +1,1 KB |
  | /sessao | +1,6 KB |

- Somando as 9 rotas, o saldo é −2 KB. Ficou assim porque a landing, o /testar e o link do questionário são primeiro
  contato, sem service worker aquecido. A /sessao costuma abrir pelo SW aquecido.

**Peso por rota** (kit da rodada M, `ETAPAS=peso`, KB gzip-6 dos scripts citados no HTML, sem noModule). Rótulo
`r3-integ` contra `ma2` (M-A final):

| Rota | M-A | R3 | Diferença |
|---|---|---|---|
| / | 220,3 | 225,4 | +5,1 |
| /entrar | 260,6 | 271,5 | +10,9 |
| /abrir | 259,2 | 269,3 | +10,1 |
| /questionario | 316,9 | 325,8 | +8,9 |
| /receber | 296,5 | 306,0 | +9,5 |
| /testar | 214,9 | 219,8 | +4,9 |
| /hoje | 317,3 | 293,3 | −24,0 |
| /sessao | 323,6 | 338,2 | +14,6 |
| /alunos | 316,2 | 326,9 | +10,7 |

O total de cada rota é MEDIDO. A atribuição abaixo é ESTIMATIVA: tamanho isolado de cada módulo (esbuild minificado
+ gzip-6, M-A contra agora) e busca de textos nos chunks.

- **R3-19 (meta de até 1 KB): cumprida.** No caminho do `load` entra só a variável do filtro e a chamada em
  analytics.ts, com +0,03 KB isolado.
  - As listas (`analytics-props.ts`, cerca de 1,6 KB isolado) estão só no chunk do SDK, que posthog-init.ts baixa 3 s
    depois do `load`. Nenhuma rota cita esse chunk no HTML.
  - O filtro já nasceu na drenagem, a alternativa do adendo, então não houve segunda medição.
- **Todas as rotas, +4,9 KB no chunk raiz.** Partes:
  - leitor de alimentos do R3-5 (nutrition.ts, cerca de 1,8 KB). Está na raiz porque data/demo.ts, importado de forma
    estática pelo app-context desde antes da M-A, usa `buildDietTemplate`;
  - validação, plano de restauração e R3-13 em export.ts (cerca de 1,1 KB), que entra pela local.ts e pela pwa.tsx;
  - foto do armazenamento e `listStudents` numa leitura em local.ts (cerca de 0,7 KB);
  - dor e volume elegível em progression.ts (cerca de 0,3 KB);
  - entradas cruas em foods.ts (cerca de 0,2 KB);
  - perfis-de-entrada.ts e completude.ts (cerca de 0,4 KB cada).
- **/ (+5,1) e /testar (+4,9):** só o chunk raiz, e na / mais o rótulo "parcial" da demo e o rótulo anual (+0,3).
- **/abrir (+10,1), /receber (+9,5), /entrar (+10,9):** raiz mais 4,6 a 6 KB das rotas de link:
  - identidade e telas do R3-1 (link-identity, cerca de 1,9 KB);
  - transfer-client com importação por identidade, foto, declarações do R3-3 e restauração (cerca de +1,7 KB);
  - relógio e rótulos de duração, que transfer.ts usa no texto do link (session-time, cerca de 1,2 KB);
  - estados de envio em delivery.ts (+0,75 KB);
  - as próprias páginas (+0,3 a +0,9 KB).
- **/questionario (+8,9):** raiz mais cerca de 4 KB:
  - funções do Hoje em hooks.ts (R3-8, cerca de 0,9 KB), que vêm no chunk de componentes que a rota já carregava;
  - campos tolerantes do schema no chunk do zod (+0,7);
  - falha de cópia do CopyButton (+0,3);
  - resumo do R3-11 (+0,15).
- **/sessao (+14,6):** raiz mais cerca de 9,7 KB:
  - tela da sessão com "Senti dor", aviso de pausa e "Corrigir minutos ativos" (+1,5);
  - relógio do treino (+1,2);
  - rascunho e fim do treino (+0,9);
  - envio ao personal e identidade, que chegam pelo lembrete de cópia de segurança e pelo envio (cerca de 4 KB).
- **/alunos (+10,7):** raiz mais cerca de 5,8 KB: os mesmos módulos de envio e identidade, mais as funções do Hoje.
- **/hoje (−24,0):** o Hoje passou a importar `SendToCoach` de send-to-coach.tsx (spec-m §5), não mais de
  transfer-share.tsx. Saem da rota o catálogo e o resumo do questionário, cerca de 35 KB, e entram os cards do
  R3-8/R3-3.

**Mantido, por enquanto:** os acréscimos acima são o código dos itens P0 e P1 nas rotas que os usam. Caminhos para a
M-B, se a medição em aparelho mostrar prejuízo:
- tirar o plano de restauração de export.ts (sai da raiz; muda os imports de dois testes);
- `seedDemo` sob demanda no app-context, para tirar nutrition.ts e generator.ts da raiz (mexe no app-context; é
  decisão da M-B).

## 2026-11-28 — Rodada 3, correção da revisão: o que mudou, desvios e peso

**Estado.** `npx tsc --noEmit` limpo; `npx vitest run` com 105 arquivos e 2.361 testes verdes; `npm run build` sem erro
(com `.env.production.local` só durante o build, token FICTÍCIO do PostHog, apagado depois). Servidor da porta 3572
religado com o build da correção. Sem commit nem deploy.

**Achados corrigidos (todos conferidos antes de mexer; nenhum falso positivo).**
- Restaurar cópia antiga não desfaz mais o registro de envio (R3-6 A.4 + R3-3). `mesclarChaveDeEnvio` (delivery.ts) junta
  cada chave `sr:sent:*` do aparelho com a da cópia: lista antiga por união (teto 500); `:at` e `:ficha` pela data mais
  nova; `:log` por treino e `:decl` por treino e campo, a data mais nova; `:ack` por `nextAck`. Aparelho limpo: a cópia
  entra como vinha.
- Contato do personal anterior (R3-1). Nova chave local `sr:v1:contatos` (só ids; fora da cópia de segurança; sai com
  "Apagar dados"). É gravada dentro da foto em `importFicha` (personal do link que vira ou já é contato, e o personal
  anterior ao "Trocar de personal neste perfil") e em `restoreBackup` (contato criado). A cópia de um PERSONAL
  restaurada tira o id dele da lista (é quem usa o aparelho). `criadoresEContatos` (perfis-de-entrada.ts) é a mesma conta
  no `continueAsLocal`, no `perfisNesteAparelho`, no `importFicha` e no `restoreBackup`. Personal com aluno `managedBy`
  dele continua entrando.
- R3-13: aluno que não estava no aparelho e cujas rodadas todas ficaram de fora volta SEM os tokens do questionário, sem
  os trechos deles nas limitações (o texto do personal fica), sem peso e altura iguais às respostas e sem os passos
  clínicos (`semSaudeDasRodadasOmitidas`, chamada em `restoreBundle`). Feito fora de `mesclarRestauracao` para não mudar o
  teste puro dela (que confere o cadastro de volta). `apagarRespostas` não foi chamado: anamnese-perfil.ts traz zod e o
  gerador para /entrar. A retirada dos trechos é a mesma conta de `mergeLimitations(texto, tokens, [])`, conferida por
  teste de paridade; o `normalize` foi escrito ali para não ligar restauracao.ts ao catálogo de exercícios (RM-10).
  `PASSOS_CLINICOS` passou para anamnese-types.ts (uma lista só).
- Homônimos em "Perfis neste aparelho": a linha de apoio diz o vínculo ("Aluno de Paulo Mendes", "Aluno sem personal",
  "Personal") e, se ainda empatar, "criado em dd/mm"; com o nome inteiro igual, o botão leva o diferencial ("Continuar
  como Rafael Souza (de Paulo)").
- R3-4: o cabeçalho conta o intervalo sem atividade só até 30 min e, passado isso, volta ao tempo ativo gravado. No
  Finalizar, a pausa longa antes do toque vira o aviso do resumo ("Você ficou 8 h fora. Esse tempo não entra no treino.").
- R3-15: o calendário do relatório no modo local do personal diz "Treinos recebidos por dia", "Dias com treino recebido no
  período", "treino recebido" e "nada recebido" (`reportCalendarLabels`); o do aluno não muda.
- R3-9: "Uso do app" saiu da lista do que fica no navegador; um parágrafo logo depois diz que a medição de uso vai para o
  PostHog. "o que você preencher no cadastro" virou "no seu perfil".
- R3-17: o aviso do link aparece também na barra compacta depois de salvar (letra menor). Substitui a exceção "fora da
  barra compacta" registrada na costura.
- R3-3: na falha de cópia, o CopyButton mostra a mensagem inteira (link incluído) num campo só de leitura com
  `ph-no-capture`, e a frase diz "segure o texto abaixo". O SendDietPanel usa o CopyButton (a cópia duplicada saiu).
- R3-6: em /entrar o erro de "Restaurar cópia" vem logo abaixo do link, antes do texto de apoio, e a tela rola até ele
  (`scrollIntoView` com `block: "nearest"`, sem animação). Medido a 360×740: fim do aviso em 740.
- R3-1: o texto de autorização das telas de escolha do /abrir diz "Ao atualizar ou criar o perfil, você autoriza…".
- Desvio do texto da spec: no Hoje, "Copiar de novo" virou **"Enviar de novo"**. O toque abre o diálogo de envio, com o
  ícone de envio, e o rótulo passa a dizer o que o toque faz (o mesmo verbo do resumo, "Enviar de novo para {personal}").
- Privacidade da medição: "Senti dor" (botão do treino e grupo do resumo) com `ph-no-capture`. Também no posthog-init.ts,
  arquivo protegido da M-A, alterado só pela correção:
  - `capture_performance`, `capture_heatmaps` e `capture_dead_clicks` em false;
  - `before_send` descarta `$$heatmap` e `$dead_click` (segunda trava);
  - `cleanBag` recursivo, para `navigationURL` e `$current_url` aninhados dos web vitals.
  Conferido com a configuração remota simulada: 0 `$web_vitals`, 0 `$$heatmap`, nenhum `?k=` nem `#d=` e nenhum
  `$autocapture` do "Senti dor".
- R3-8: com o treino de hoje registrado, o card mostra o nome da ficha, e o aviso de `?ficha=1` aponta para "Ver o próximo
  treino". Nos exemplos, `simulateSessions` não gera treino no dia de hoje (o "Ver como aluno" sempre abre com "Começar
  treino").
- R3-20:
  - "Pular" e "OK" do descanso levam o foco à próxima série por marcar (sem nenhuma, ao "Finalizar treino");
  - o fim do descanso com o foco perdido ou no rodapé foca o "OK";
  - `<main>` no /entrar e no resumo do treino;
  - "Sua semana" com o estado do dia em texto `sr-only`.
  A spec deixava o foco para a lente 6 da M-B. Ficou aqui porque o achado é médio e a correção é pequena.

**Testes que mudaram de asserção por causa de uma correção pedida** (nenhum outro):
- session-telas.r3.test.ts: o relógio parado além de 30 min volta ao ativo;
- costura.r3.test.ts: o aviso na barra compacta e o CopyButton no SendDietPanel;
- hoje-tela.r3.test.ts: "Enviar de novo"; o mock do `useSearchParams` passou a ler o estado do teste;
- analytics.fila.test.ts: as três opções novas do init, com o caso de web vitals, mapa de calor e clique morto.
Só o caminho de import mudou (de export.ts para restauracao.ts) em export-restaurar, export.restauracao, export,
transfer e transfer-client.restauracao: o Turbopack não descarta reexportação sem uso (o CSV, só reexportado por
export.ts, estava no chunk raiz), então export.ts não reexporta a restauração. Testes novos:
- correcao-revisao.r3.test.ts (22);
- casos novos em transfer-client.restauracao, transfer-client.r3-1, link-identity, session-time e hoje-tela.
O teste negativo do R3-20 foi feito num build local: sem o aria-label do "Mais ações", o leitor-de-tela.js sai com 1 e
aponta `button#mais-…` em /sessao. Com o aria-label de volta, saem 0 problemas.

**Peso (achado da integração).** Três módulos separados, sem mudar comportamento:
- `domain/nutrition-base.ts`: metas, itens, totais e o cardápio-base. data/demo.ts, diet-share.ts, Hoje, Conta, cadastro
  e diet-read importam daqui. nutrition.ts reexporta tudo e fica com o leitor de texto livre, que saiu do chunk raiz e das
  rotas de link.
- `domain/restauracao.ts`: a leitura da cópia e o plano de restauração. Saíram de export.ts, que entra em todas as telas.
- `lib/link-client.ts`: o que os links gravam e o registro de envio. /abrir, /receber, /entrar, send-to-coach e
  use-ficha-link importam daqui. transfer-client.ts ficou com a cópia de segurança e a restauração e reexporta link-client:
  nenhum teste muda de import.

Kit da rodada M, `ETAPAS=peso`, KB gzip-6 sem noModule; rótulo `r3-fix` contra `ma2` e `r3-integ`:

| Rota | M-A | Integração | Agora | Agora − M-A |
|---|---|---|---|---|
| / | 220,3 | 225,4 | 223,0 | +2,7 |
| /entrar | 260,6 | 271,5 | 267,1 | +6,5 |
| /abrir | 259,2 | 269,3 | 260,2 | +1,0 |
| /questionario | 316,9 | 325,8 | 318,0 | +1,1 |
| /receber | 296,5 | 306,0 | 297,0 | +0,5 |
| /testar | 214,9 | 219,8 | 211,6 | −3,3 |
| /hoje | 317,3 | 293,3 | 290,2 | −27,1 |
| /sessao | 323,6 | 338,2 | 329,1 | +5,5 |
| /alunos | 316,2 | 326,9 | 323,2 | +7,0 |

O chunk raiz ficou menor que o da M-A (o /testar, que é quase só ele, caiu 3,3 KB). Rotas que seguem mais de 2 KB acima
da M-A, com o motivo:
- **/ (+2,7):** o leitor de texto livre saiu da raiz e foi para a landing, que o usa na demonstração da dieta
  (diet-demo.tsx, com o R3-5). Carregar o leitor sob demanda mexe na demonstração que o RM-17 (M-B) refaz.
- **/entrar (+6,5):** "Perfis neste aparelho" (R3-1) e "Restaurar cópia" com plano, validação e R3-13 (R3-6) são desta
  tela. Carregar a restauração só no toque quebraria restaurar sem sinal, porque o chunk sob demanda não está no
  aquecimento do service worker.
- **/sessao (+5,5):** "Senti dor", aviso de pausa, "Corrigir minutos" e o envio ao personal no resumo (R3-3, R3-4, R3-7),
  com link-client e link-identity.
- **/alunos (+7,0):** o lembrete de cópia (backup-reminder) importa `makeBackup` de transfer-client, que traz a
  restauração. Tirar isso exige mudar o import do lembrete, e os testes dele simulam transfer-client. Também dá para
  carregar só no toque, mas aí a cópia não sai sem sinal. Fica para o RM-10 da M-B.


## 2026-11-28 — Rodada 3, QA final: correção das duas falhas (só no kit de medição)

**Estado.** O QA final não achou defeito do app. As duas falhas eram do kit de medição, e só o kit mudou: nada em `src`,
`public` ou `next.config.ts`. `npx tsc --noEmit` limpo; `npx vitest run` com 105 arquivos e 2.361 testes verdes;
`npm run build` sem erro (com `.env.production.local` só durante o build, token FICTÍCIO do PostHog, apagado depois),
BUILD_ID `_kfb540w_GH9XDDyE-XUt`. O servidor da porta 3572 foi religado com esse build (grupo em `rodada3/server.pid`). O
log do servidor do QA, com as 270 tentativas de proxy, foi guardado em `rodada3/server-3572.qa-final.log`. Sem commit
nem deploy.

**Falha 1: o `e2e/questionario.js` deixava a medição de uso chegar ao servidor.**
- Conferida antes de mexer. Rodei o roteiro original atrás de um proxy de diagnóstico que responde ele mesmo a
  `/ingest/**`. Chegaram 68 `POST /ingest/e/?compression=base64`, todos `no-cors`, `text/plain` e com o user agent padrão:
  são os `navigator.sendBeacon` do pagehide (o lote pendente e a fila de nova tentativa do posthog-js), que saem pelo
  processo do navegador, fora do `context.route`.
- **Desvio da correção sugerida pelo QA.** Trocar o beacon por um fetch comum para a mesma URL não basta. Com uma marca
  na URL, 29 desses fetches ainda chegaram ao proxy numa execução inteira, sempre no pagehide e com o user agent padrão.
  Por isso o beacon vira um fetch comum para `http://127.0.0.1:9` (porta fechada, mesma máquina), com o mesmo caminho.
  Se o route vê o pedido, guarda o corpo e aborta. Se não vê, a conexão é recusada ali mesmo. Depois da troca: 0 pedidos
  no proxy de diagnóstico e 0 tentativas de proxy no log do 3572 (execução do `run-e2e.sh r3-corr`, 27/27 passos).
- **Limite, que já existia antes.** O corpo do beacon do pagehide não entra na checagem de privacidade. O Playwright não
  entrega nada do documento que está saindo: testei route, `exposeBinding` e `console`. Os mesmos tipos de evento chegam
  pelos envios normais, que o route lê (132 eventos reais por execução), e o filtro do app é testado em
  `analytics.allowlist.test.ts`.
- Mesma troca no `rodada3/e2e/estudo2.js`, que também usava o fetch para a mesma URL. O `ONLY=qa15` passou 11/11, com os
  8 eventos lidos e 0 tentativas de proxy.
- **Ajustes no mesmo roteiro (desvios declarados, só no roteiro).**
  - A checagem de privacidade agora lê corpo em base64 puro, o formato do beacon. Antes ela o lia como texto cru.
  - A checagem também ignora "anos" que aparecem dentro de uuid ou carimbo de tempo. Era falso positivo intermitente: "2010"
    na base M-A (`out/ma2`), "1980" e "1950" no diagnóstico do QA, "1992" na minha reprodução. Esses casos vão para as
    notas com o trecho. Na execução final ficaram 2 descartes, ambos "2015" dentro do uuid de um evento `$set`.
  - O aviso "chegada do ?enviada=1 sem a barra de envio" era falso negativo intermitente, também na base M-A. A barra é
    sticky e vem depois da lista de exercícios no DOM, e o texto do main era cortado em 1.500 caracteres. A captura da
    minha reprodução mostra a barra na tela. Agora o roteiro espera o texto e lê o main inteiro.

**Falha 2: o `aluno-liefi.js` esperava um alvo que o R3-8 tirou do Hoje.**
- Conferida: com o treino de hoje registrado, o Hoje mostra "Começar o treino A agora" só dentro de "Ver o próximo
  treino", que vem fechado. Por isso o passo "Concluir → /hoje" estourava (">25000") nos 3 perfis.
- O alvo passa a ser `^Começar treino|^Enviar treino para |^Enviar \d+ treinos para |^Enviar \d+ de \d+ treinos`. São os
  rótulos de `rotuloDoEnvio` em delivery.ts. O resumo da sessão diz "Enviar para …" e não casa com eles. "Começar
  treino" continua no alvo para medir builds anteriores ao R3-8.
- Rodada `r3-corr`: médio 176 ms, lie-fi 2.243 ms, offline 350 ms (M-A: 144, 2.268 e 394). Com o passo destravado, os
  menus Treinos e Evolução no lie-fi medem a navegação de verdade (2.232 e 2.300 ms; M-A 2.292 e 2.300).

**QA final (registro).** O QA acrescentou o cenário de rollback do R3-2, porque o build anterior já estava servido.
Também usou uma vez `pkill -P <pid>`, que a regra proíbe, só nos próprios processos `tail` e `grep`, e registrou isso. A
pasta `rodada3/qa/build-ma` pode ser apagada quando o rollback não precisar mais de reteste.

## 2026-11-28 — Rodada 3, fechamento: feito, parcial, adiado e o que vai para a M-B

**Estado, conferido no fechamento.**
- Árvore: HEAD `86cb6d3` (WIP) com 46 mudanças sem commit.
- Suíte inteira, rodada agora (28/11, 05:45 UTC): `npx tsc --noEmit` limpo; `npx vitest run` com 105 arquivos e 2.361
  testes verdes. Log em `rodada3/fechamento/vitest.json`.
- Build local de produção: BUILD_ID `_kfb540w_GH9XDDyE-XUt`. O `/api/versao` respondeu
  `{ sha: "local", at: "2026-11-28T05:15:56.804Z", protocolo: 1, copia: 2 }` com `no-store`. Nenhum arquivo de `src`,
  `public` ou `next.config.ts` é mais novo que esse build.
- O QA final (2ª passada) não achou defeito do app:
  - os 16 cenários do passo 6 deram 132/132 conferências;
  - os roteiros do kit e as cópias ajustadas, incluindo o leitor de tela, passaram;
  - as 14 metas de tempo ficaram no alvo, com a maior piora em +1,8% contra a M-A.
- Servidor da porta 3572 (grupo 16013) parado pelo grupo no fechamento. Nada sobrou: nem processo, nem porta ocupada,
  nem zumbi.
- Sem commit, push nem deploy.

**Feito: implementado e validado no build local de produção.**
- R3-1, R3-3, R3-4, R3-5, R3-7, R3-8, R3-10, R3-11, R3-12 (no navegador só na revisão), R3-13, R3-14, R3-15, R3-16 (só
  teste unitário), R3-17, R3-18, R3-19 e R3-20.
- Nenhum item chegou a "validado em preview": não existe Preview da Vercel desta árvore.
- A tabela item a item (modo afetado, teste, evidência, risco residual, status e a coluna "público" vazia) está em
  `rodada3/fechamento.md`.

**Parcial.**
- **R3-2:** o código e os itens 2 (cliente antigo) e 4 (rollback) do checklist foram feitos na máquina, com o build
  50b5d58 servido de verdade. Os itens 1 (SHA no alias) e 3 (registro de releases) dependem do deploy. Checklist com o
  rollback: `rodada3/checklist-release.md`.
- **R3-6 A.5:** o passo no aparelho do dono (Safari → app instalado) não foi feito, porque depende do aparelho. O
  resto do R3-6 está feito.
- **R3-9:** o texto está feito. Antes de publicar, três pendências do dono:
  - reconferir "Discard client IP data";
  - abrir o domínio do blog;
  - revisão jurídica, com controlador e contato.
- **R3-1:** o QA-05 (dois links na mesma aba) não foi retestado no navegador. O código é de antes da rodada; o QA-04
  foi retestado na revisão.

**Adiado.** O "Depois" da entrada de 27/11 continua igual. A rodada acrescenta, todos como decisão do dono:
- se a meta semanal conta sessões ou dias distintos;
- revisão profissional dos textos de dor (R3-7), do cuidado (R3-11) e do cardápio e da água (R3-12);
- reduzir o que o link da ficha leva (R3-17);
- "restaurar mesmo assim" a saúde omitida (R3-13).

**Para a M-B.** O "Vai para M-B" de 27/11 continua igual. A rodada acrescenta:
- **Peso:**
  - /alunos (+7,0 KB): tirar a restauração do lembrete de cópia (RM-10);
  - / (+2,7 KB): leitor de dieta sob demanda na demonstração (RM-17);
  - /entrar (+6,5 KB) e /sessao (+5,5 KB) ficam pelos motivos da correção da revisão.
- **Lente 6** com TalkBack, VoiceOver e tablet, reaproveitando `rodada3/e2e/leitor-de-tela.js`. A parte de foco do
  R3-20 já entrou nesta rodada.
- **Alvos menores que 44 px** que já existiam antes da rodada e a revisão listou:
  - perguntas da FAQ da landing (28 px de altura);
  - "Voltar ao início" (35 px) e "Demonstração do aluno/personal" (36 px), no /entrar.
  O − e + de 32 px seguem a entrada de 22/11.
- **Kit:** o `beta.js` original do kit (`mobile/m-verif/e2e`) ainda falha no passo "personal-recebe-os-treinos",
  porque o texto do relatório mudou por design. A cópia ajustada (`rodada3/e2e/beta.js`) dá 9/9. Trocar o seletor do
  kit antes de a M-B medir.

**Erratas do nosso handoff.** As 26 correções que procedem (14 inteiras e 12 em parte) estão em
`rodada3/errata-handoff.md`, no formato onde estava, o que dizia e o que passa a valer. O documento do handoff não foi
editado.
