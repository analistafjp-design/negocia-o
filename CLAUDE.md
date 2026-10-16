# Negociações Interior — instruções para a Claude

Converse com o usuário sempre em **português do Brasil**, de forma direta. Leia o `README.md` antes de mexer.
O dono é **Fábio Passos** (AnalistaFJP).

## O que é

Painel das negociações do Interior por **frente de serviço e cluster**: a versão web do relatório *Negociações*
(`Report Negociações Acumulado`) do Power BI. Lê planilhas `.xlsx` (e os `.csv` de arrecadação) da pasta do usuário **no navegador**
(File System Access API, Chrome/Edge) e mostra só o que está no print do Power BI: 6 cartões de quantidade,
5 de valor, Negociações Comercial (cluster › frente › recurso), Top 10, Negociação x Cidade e Motivo da não
Execução. Mesma stack do Painel Executivo (`analistafjp-design/painel-executivo`) e jeito do Pós-Corte
(`analistafjp-design/pos-corte`): TypeScript, Next.js (export estático), React, Tailwind, shadcn/ui, Recharts.
Hospedagem: **GitHub Pages**.

## Como trabalhar com o usuário

- O cabeçalho mostra **só o nome "Negociação"** e **o botão Conectar pasta existe uma vez só, no cabeçalho**
  (pedidos do usuário, 16/10/2026): não recoloque subtítulo, selo, os quatro quadrinhos de apresentação nem
  um cartão com outro botão no corpo da página.
- **Painéis de baixo** (pedidos do usuário, 16/10/2026): os **quatro painéis em tela cheia, um embaixo do outro, nesta
  ordem: Negociações Comercial, Top 10 Negociações, Negociação x Cidade e Motivo da não Execução** (cada um com a
  largura toda; os cartões de cima ficam como estão, o usuário pediu para não mexer neles "por enquanto"). **Sem
  rolagem interna** (o Total fica no pé de cada painel). **Top 10 e Cidade são gráficos de colunas + linha com rótulos
  de dados** (`components/graficos-negociacoes.tsx`, Recharts), cada um num tom: Top 10 em azul (`--serie-top*`) e
  Cidade em verde-água (`--serie-cidade*`), tokens em `app/globals.css`. Top 10: colunas = quantidade, linha = valor
  (R$). Cidade (ordenada por valor): colunas = valor, linha = quantidade. Rótulos de valor abreviados ("14,9 mil",
  `fmtMil`); o balão traz os números exatos, o Total (`data-total`) fica numa faixa sob o gráfico e uma tabela escondida
  (`sr-only`) leva os mesmos números para leitor de tela e para os testes. Os dois eixos têm 5 divisões
  (`escalaDoEixo`, `lib/eixo.ts`). Em tela estreita o gráfico tem largura mínima e rola para o lado **dentro do painel**,
  com aviso. **A matriz Negociações Comercial é uma árvore** (`components/arvore-comercial.tsx`; pedido do usuário, 16/10/2026,
  "Pode fazer a árvore", depois de ver a prévia): Total > cluster > frente > recurso, com **+/−** para abrir e fechar
  (as frentes abrem fechadas e os recursos aparecem no +). Em 1280 px ou mais ela abre para o lado, ligada por fios;
  abaixo disso empilha, com recuo (CSS `.arv*` em `app/globals.css`). **A árvore se ajusta sozinha à largura** (pedido do usuário, 16/10/2026: ao abrir os recursos ela
  saía da tela; `components/ajustar-a-largura.tsx`): se a árvore aberta é mais larga que o painel, ela encolhe até
  caber, sem passar de 60% (abaixo disso rola para o lado dentro do painel); se cabe, não mexe. O Total da raiz (`data-total`) é o da matriz
  (pode ser 131 quando os cartões dizem 132, como no print). **As frentes de um cluster podem somar mais que o cluster**:
  o desdobro de uma matrícula com atividades em mais de uma frente conta em cada frente e uma vez no cluster (medida
  do Power BI; pendente de conferir com um print do relatório). Não recoloque rolagem interna nem as tabelas de Top 10,
  Cidade e Comercial sem ele pedir. O rótulo do Motivo é legível
  (`legivel`/`quebrar`, `lib/formato.ts`).
- **Arrecadação real** (pedido do usuário, 16/10/2026: "preciso trazer o valor arrecadado real. O que aparece nele hoje, são os
  valores negociados e não refletem a realidade"; arquivos em `.../Dashboard Executivo Interior/Interior/Arrecadação`: "Arrecadação diária"
  e pastas com "Arrecadação acumulada"; respostas dele: **só parcelas**, **arrecadado em destaque**, arquivos **.csv**).
  `lib/arrecadacao-csv.ts` lê o CSV (colunas `Nº Ligação`, `Valor Pago`, `Data Pagto.`, `Tipo Fatura`, `Situação Pagto`; só
  "PARCELA" + "Quitada" entra) e `lib/arrecadacao.ts` liga cada pagamento a uma negociação da **mesma matrícula feita até a
  data do pagamento** (a mais recente; do mesmo dia, divide pelo valor negociado), cada pagamento uma vez, e o mesmo
  pagamento em dois arquivos (diária × acumulada) vale uma vez. O resultado fica em `arr` de cada atividade/desdobro e
  `medidas()` soma `arr*` na mesma conta dos `val*` (`Visao.temArr` liga a exibição). **Com arquivo de arrecadação o valor
  grande é o arrecadado e o negociado fica pequeno ("arrecadado de R$ … negociados"; na árvore "de R$ …")** nos cartões de
  valor, na árvore, no Top 10 e em Cidade; sem arquivo, a tela é a de antes. **Os filtros de mês e data são os da negociação,
  não os do pagamento.** Pagamento sem negociação anterior fica só no resumo ("Detalhes da leitura"). **Na pasta o `.csv`
  só é lido se "Arrecadação" aparece no nome do arquivo ou de uma pasta do caminho** (os outros nem são abertos); no Importar
  arquivos vale o que o usuário escolheu. Não mude a regra (só parcelas, mesma matrícula, data do pagamento ≥ data da
  negociação) sem ele pedir; **pendente de conferir com a base real** (ver "Pendências"). Os CSV de teste são sintéticos
  e **sem acento no nome** (o Chromium do container não anexa arquivo com acento; o acento é testado em `core.test.mjs`).
  A tabela `sr-only` dos gráficos fica **dentro de uma `div` `sr-only`**: tabela ignora a largura de 1px e alargava a página
  no celular.
- **Aviso da leitura** (pedido do usuário, 16/10/2026: "Isso aqui não precisa aparecer nessa tela. Muito feio!"):
  o resumo da carga ("Base carregada: …") e as observações (recursos sem setor, atividades repetidas, JSON fora do
  formato, código fora da tabela…) **não aparecem mais na tela**; ficam recolhidos em **"Detalhes da leitura", no
  rodapé** (`detalhesDaCarga`, `lib/mensagens.ts`). Só **pede ação na tela** (aviso "Atenção na leitura" ou erro) o que
  o usuário precisa resolver: arquivo que falhou, formato não aceito, arquivo que não é do painel, falta do `Cluster_`
  e coluna opcional ausente (`analisar`). Um aviso de problema continua na tela quando a pasta não mudou; uma leitura
  nova sem problema o tira. Não recoloque o resumo nem as observações no corpo da página.
- Preserve o que já funciona. Não mude cartão, aba ou regra além do que foi pedido; o usuário pediu
  "somente as informações que estão no print", sem exagero.
- **Não invente** dados, nomes de colunas nem resultados de testes. Todo número vem das planilhas lidas.
- Para cada pedido, um branch a partir da `main` e um PR aberto como **draft**. Commits e PRs em português.
- **Pode mesclar sozinha, sem esperar ordem nem perguntar de novo.** O usuário autorizou em 16/10/2026 ("Pode
  mesclar. Não precisa me perguntar novamente! Grave isso.") e vale para qualquer sessão. Mescle quando o check
  `build-and-test` do **último commit** estiver `success`, não houver conflito e não houver pergunta sua em aberto
  ao usuário sobre aquele PR. Antes, tire o PR do modo draft e faça **squash merge com `expectedHeadSha`** (os 40
  caracteres do commit). Depois, **avise o usuário o que foi mesclado** e confira a publicação (os runs "Publicar no
  GitHub Pages" e "CI" da `main`). Check vermelho, conflito ou dúvida sobre o pedido: **não mescle**.
- Nunca diga que algo foi publicado sem conferir; deixe claro se você não abriu o site.

## Regras que não podem ser quebradas

- **Nenhum dado sai do computador**: sem requisição de rede para dados, sem serviço externo. O teste de
  interface confere que a página não faz pedidos para fora do próprio site.
- **Dados pessoais**: a base real (matrículas, débitos) nunca entra no repositório (`.gitignore` bloqueia
  `.xlsx` e `.csv`); os testes usam planilhas **sintéticas** (`tools/make_fixtures.py`).
- **Fidelidade ao Power BI**: as medidas de `lib/medidas.ts` repetem o DAX do relatório. BLANK é `null` e
  aparece como `—`, nunca como zero. Não "corrija" a regra sem o usuário pedir; se uma regra parecer estranha,
  pergunte. Valores ficam em milésimos de centavo (`Currency.Type`), para a soma ser exata.
- **Cor: azul do painel Cadastro e Venda** (pedido do usuário, 16/10/2026; antes era grafite): azul de ação
  `#364dd4`, cabeçalho azul-marinho `#1c3a8f` > `#14296b`, fundo suave `#ebf0fe`. As cores ficam nos tokens
  `--marca*` de `app/globals.css` (e as classes `bg-marca`, `from-marca-media`… do Tailwind); não espalhe cor
  fixa nos componentes. Cores semânticas só nos avisos (verde/âmbar/vermelho bem suaves).
- **Indicador sem coluna** não vira zero silencioso: o arquivo é recusado dizendo qual coluna falta.
- **Pasta: só os .xlsx com "Atividade" ou "Cluster" no nome** (a regra do Power BI; sem diferenciar maiúsculas
  nem acentos, subpastas incluídas). Os outros, como o "Termos de Janeiro a Agosto.xlsx" (pedido do usuário,
  16/10/2026: "ignore esse arquivo e leia todo o resto"), **nem são abertos** e só constam no resumo da leitura
  (`ehArquivoDoPainel`, `lib/fontes.ts`). Nos arquivos escolhidos à mão (Importar Excel) vale o que o usuário
  escolheu, reconhecido pelas colunas. Dentro de um arquivo do painel, a aba é achada pelas colunas.
- As tabelas de códigos e recursos (`lib/tabelas.ts`) são **geradas** do relatório por
  `tools/gerar_tabelas.py`; não edite à mão.

## Estrutura e checagens

- `lib/` tem toda a lógica (testável no Node, sem React); `app/` e `components/` só desenham.
- `npm run lint`, `npm run typecheck` e `npm test` (fixtures → núcleo → build → interface) antes de cada commit.
- Mudança visível: confira no Chromium no computador e no celular (390 px), sem rolagem lateral e sem erro no
  console (`NEG_SHOTS=<pasta> npm run test:ui` salva capturas).
- Todo ajuste de regra ganha um teste em `tests/core.test.mjs`; de tela, em `tests/ui.test.mjs`.

## Pendências para confirmar com a base real

1. Desdobro × matrícula: aqui só se amarra à matrícula com filtro de atividade (explica o 131 × 132 do print).
2. Coluna "Top" do Top 10: o print não segue estritamente a fórmula documentada do ranking. **Desempate pedido pelo
   usuário (16/10/2026)**: mesma quantidade e valor → quem negociou por último; depois, ordem alfabética do
   recurso (`posicoesDoRanking`, `lib/medidas.ts`). O Top 10 tem no máximo 10 linhas, com posições únicas — é uma
   divergência consciente do Power BI (que divide a posição entre empatados); não volte ao ranking denso sem pedido.
3. `Text.BeforeDelimiter` sem hífen no recurso: tratado como vazio (sem setor), a atividade sai.
4. Atividades repetidas entre arquivos não são removidas (o relatório também não); o aviso mostra quantas.
5. Arrecadação: conferir com a base real (a) a escolha da negociação mais recente até a data do pagamento quando há mais de
   uma, (b) se parcelas de outro parcelamento da mesma matrícula entram indevidamente, (c) se `Valor Pago` (e não
   `Val. Autenticado`) é o valor certo, (d) o tamanho dos CSV acumulados (leitura por blocos de 4 MB; o resultado fica no
   cache do navegador).
