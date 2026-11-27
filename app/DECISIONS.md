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
  celular". Toque até "Começar treino" clicável: 2,29 s na base contra 1,24 s (faixa 1,11–1,37); sem SW, 0,93 s.
  A cobertura continua: as 14 telas guardadas 9,7 s depois do toque. Quem fecha o app antes de 20 s fica coberto pelo
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
- **PostHog depois do load + 3 s + ocioso (RM-03).** O SDK sai do primeiro carregamento: −119,5 KB por rota (medida do tech lead sobre o
  c6bd5e6; com o RM-05, −181,8 a −183,0 KB aqui). Os eventos de quem fecha a aba antes disso se perdem: a fila fica só em memória, com teto de 200
  chamadas e 20 erros não tratados. Isso inclui as recargas do RM-02: com sinal fraco, uma navegação interna pode virar
  recarga, e a página que vive menos que load + 3 s + ocioso perde a $pageview e o que esperava na fila (MEDIDO pela
  revisão, recarga 1,5 s depois do load em /abrir e /questionario: 1 $pageview em M-A, 2 na base; eventos de produto
  iguais no roteiro do questionário). Não guardamos a fila no aparelho para reenviar no próximo carregamento: seria um
  armazenamento novo de dados de medição (proibido para o aluno do link, que é justamente quem abre por link com sinal
  fraco), com risco de evento duplicado na volta do bfcache, e mais código em toda rota, com o peso já 2 KB acima da
  medida do tech lead. Efeito esperado (ESTIMADO): funis com menos registros nas sessões de sinal fraco. Não há
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
  extensão ligada é coberta por teste (ESTIMADO no navegador: a regra do kit aborta /ingest, inclusive a extensão). Medido: o SDK é pedido 3,0 s depois do load e o primeiro pedido a /ingest sai ~3,1 s depois
  (na base, antes do load); nenhuma chave `ph_` em /questionario#d=.
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
- **Peso: −181,8 a −183,0 KB por rota, não −184 (desvio pequeno).** As duas bibliotecas saíram inteiras (nenhuma rota de
  link nem /entrar carrega posthog-js ou @supabase antes do load). Os ~2,6 KB de diferença para a medição do tech lead
  são, por conta (ESTIMADO), o código novo que entra em toda rota: gatilhos e "guardar-esta" (RM-01/RM-04) e a fila com a $pageview da
  abertura (RM-03). Rotas: / 219,7; /entrar 260,0; /abrir 258,6; /questionario 316,3; /receber 296,0 KB.
- **Kit: a conferência de privacidade da medição não via eventos (revisão).** Com o user agent padrão (HeadlessChrome) e
  `navigator.webdriver`, o posthog-js 1.453.2 descarta todo evento como robô: os "72 pedidos a /ingest sem dado
  sensível" eram só /flags, a config e a extensão, e a frase da integração "com /ingest abortado o SDK não manda evento"
  estava errada. `posthog-check.js`, `posthog-corpo.js` e `e2e/questionario.js` agora usam user agent de Android e
  `webdriver` falso. Com eventos de verdade, nenhum vazamento (ver os números da revisão final abaixo).
- **Medição local, não na Vercel.** Local, o servidor responde na hora, e a conversão no /abrir da base já fica em 2,29 s
  (Vercel 4,70 s). A meta de 2,2 s passa com folga mesmo contra a referência local (controle sem SW + 0,35 s ≈ 1,3 s:
  1,24 s). Android médio + SW, /hoje até "Começar treino": 1,50 → 1,22 s (meta 1,3 s).
