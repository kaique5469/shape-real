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
