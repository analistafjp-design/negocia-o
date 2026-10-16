# Negociações Interior

Painel das **negociações do Interior (Águas do Rio) por frente de serviço e cluster**. É a versão em página
web do relatório *Negociações* do Power BI: mesmos cartões, mesmas regras de cálculo, só que lendo as
planilhas direto da pasta, no navegador. Nenhum dado sai do computador.

Mesma base técnica do Painel Executivo: **TypeScript, Next.js (export estático), React, Tailwind, shadcn/ui e
Recharts**. A cor é o azul do painel Cadastro e Venda (`#364dd4`, cabeçalho azul-marinho), definida nos tokens `--marca*` de `app/globals.css`.

## O que a tela mostra

| Bloco | Conteúdo |
| --- | --- |
| Filtros | Frente de serviço, Cluster, Mês/ano e Data (abre no mês mais recente) |
| Cartões de quantidade | Negociação Principal · Cadastro Desdobro · Negociação Corte · Negociação Desdobro · Negociação Pós Corte · **Total Negociações** |
| Cartões de valor | Negociação Principal $ · $ Desdobro Corte · $ Desdobro · $ Desdobro Pós Corte · **Negociação Tot $** |
| Negociações Comercial | Árvore Total › Cluster Perfil › frente de serviço › recurso (o + abre e o − fecha); abre para o lado em tela larga e empilha no celular |
| Top 10 Negociações | Gráfico de colunas (quantidade) e linha (valor), por recurso, na ordem do ranking |
| Negociação x Cidade | Gráfico de colunas (valor) e linha (quantidade), por cidade |
| Motivo da não Execução | Cobranças sem negociação, por motivo |

Os quatro painéis de baixo ocupam a largura toda, um embaixo do outro, nessa ordem.

`—` é o BLANK do Power BI (sem registros), diferente de `0`.

## Como usar

1. Abra o painel no **Chrome ou no Edge** (só eles deixam uma página ler uma pasta do computador).
2. **Conectar pasta** e escolha a pasta com as planilhas (a do OneDrive serve; subpastas são lidas):
   - arquivos de **atividades** (aba `Page 1`), com as colunas `Recurso`, `Matrícula`, `Código/Descrição`,
     `Data`, `Negociou O Débito?`, `Valor Total dos Débitos` e `Body Adicional Executado`
     (opcionais: `ID da Atividade`, `Cidade`, `Motivo de Não Execução - Cobrança/Normal`);
   - o arquivo **Cluster_** (aba `Planilha1`), com `NUM_LIGACAO` e `CLUSTER SALDO`.
   Na pasta, **só são lidos os `.xlsx` com "Atividade" ou "Cluster" no nome** (como no Power BI), inclusive nas
   subpastas; os demais (por exemplo `Termos de Janeiro a Agosto.xlsx`) são ignorados sem nem serem abertos e
   aparecem no resumo da leitura. Dentro de cada arquivo, a aba é reconhecida pelas colunas.
3. Nas próximas vezes ele lembra da pasta, relê só o que mudou e confere a pasta sozinho a cada 60 s.
4. Outro navegador? Use **Importar Excel** e escolha os arquivos (sem acompanhamento automático); aí vale o que
   você escolheu, qualquer que seja o nome.

O resumo da leitura (arquivos lidos, ignorados, observações do Power BI) fica recolhido em **Detalhes da leitura**, no
rodapé. Na tela só aparece aviso quando algo pede ação, como a falta do arquivo `Cluster_`.

Os resultados lidos ficam guardados **no navegador** (só as colunas usadas) para não reler tudo; o botão
*Apagar dados gravados neste navegador* limpa isso. A base real nunca vai para o repositório
(`.gitignore` bloqueia `.xlsx` e `.csv`).

## Regras iguais às do Power BI

As medidas foram portadas do relatório `Report Negociações Acumulado` (`lib/medidas.ts`, `lib/modelo.ts`):

- **Negociação Principal** = atividades com categoria do serviço `COBRANÇA` e `Negociou O Débito? = SIM`.
- **Desdobro** = itens do `Body Adicional Executado` (JSON) com código `107002` ou `207002`. **Corte** e **Pós
  Corte** vêm da categoria da atividade de origem (`CORTE` / `VISTORIA PÓS CORTE`); **Negociação Desdobro** é o
  que sobra. **Cadastro Desdobro** (`202002`, `102002`, `202004`, `102004`, origem COBRANÇA ou CORTE) não entra no total.
- **Total Negociações** = principal + desdobro. **Negociação Tot $** = principal $ + desdobro $ (corte + pós corte + resto).
- Só entram atividades de recursos com setor no cadastro de recursos (`RIOLTRIN` → Leitura etc.); a tabela de
  desdobros não tem esse corte, como no relatório.
- **Negociações Comercial** só traz serviços do setor `COMERCIAL` e tira a frente Manutenção. **Top 10**:
  setor Comercial, sem os recursos `D11…/D12…/D13.1…` da lista de exclusão, `Ranking < 11` (por
  `total × 0,15 + valor × 0,0000001`) e `Total > 0`. **Com desempate** (pedido do usuário, 16/10/2026; o Power BI
  divide a posição entre empatados e o Top 10 passava de 10 linhas): mesma quantidade e mesmo valor, vale quem
  negociou por último e, ainda empatado, a ordem alfabética do recurso. O Top 10 tem sempre até 10 linhas, com
  posições 1 a 10 sem repetir.
- **Motivo da não Execução**: cobrança com `Negociou ≠ SIM`; vale o motivo *Normal* quando existe, senão o de
  *Cobrança*; fora vazio e `SUSPENSO`.
- Comparações **não diferenciam maiúsculas de minúsculas** (como o DAX) e textos que só diferem nisso viram um só.
- As tabelas de códigos e de recursos vêm do próprio relatório: `python3 tools/gerar_tabelas.py <extração.md>`
  regenera `lib/tabelas.ts`.

### Pontos para conferir com a base real

Estes dois vieram da leitura da extração e do print, sem dados reais para confirmar:

1. **Desdobro × matrícula.** No Power BI o desdobro se liga às atividades pela matrícula (muitos-para-muitos).
   Aqui ele só é amarrado à matrícula quando há filtro de atividade (frente, cluster, linha de tabela); só com
   Data/Mês conta todos os desdobros do período. É a leitura que reproduz o print: **132** nos cartões e no total
   de cidades, e **131** na soma das cidades e na matriz Comercial (um desdobro sem atividade da mesma matrícula).
2. **Coluna "Top".** Com os números do print, a fórmula do ranking documentada daria outra ordem em
   `RIOLTRIN-009`/`-023`. O painel segue a fórmula documentada e, desde 16/10/2026, desempata os iguais (acima).

## Desenvolvimento

```bash
npm install
npm run dev          # http://localhost:3000
npm run lint && npm run typecheck
npm test             # planilhas sintéticas + núcleo (Node) + build + interface (Chromium)
```

- Node 22.18+ (os testes do núcleo importam os `.ts` de `lib/` direto).
- Testes de interface: `npx playwright install chromium` (ou `CHROMIUM_PATH=/caminho/do/chromium`).
- `tools/make_fixtures.py` (precisa de `xlsxwriter`) gera planilhas **sintéticas** em `tests/fixtures/`. A pasta
  `print/` monta um conjunto que, lido pelo painel, reproduz os cartões e a matriz Cluster × Frente do print.

```
app/                 página (negociacoes-client.tsx) e tema
components/          cartões, painéis, tabelas, gráfico e shadcn/ui
lib/
  xlsx-reader.ts     leitor de .xlsx por streaming (ZIP + XML), sem bibliotecas
  leitura.ts         reconhece e lê atividades e Cluster
  modelo.ts          junta arquivos e liga as tabelas (como o modelo do Power BI)
  medidas.ts         medidas do relatório e os visuais
  eixo.ts            escala dos eixos dos gráficos de colunas + linha
  fontes.ts          pasta, arquivos e cache (IndexedDB)
  tabelas.ts         códigos de serviço e recursos (gerado)
tests/               core.test.mjs (regras) e ui.test.mjs (tela)
```

## Publicar (GitHub Pages)

O site é estático e não tem dados. O workflow `.github/workflows/deploy-pages.yml` publica a cada envio para
a `main`. Ajuste único no GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
O endereço fica `https://analistafjp-design.github.io/negocia-o/`. Para o botão no Hub de Painéis, coloque esse
endereço em `docs/paineis.js` do repositório `hub-de-paineis`.
