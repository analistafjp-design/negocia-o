# Importador local — piloto do Negociações

Primeira implementação para capturar uma carga local reproduzível e conferir os totais com a
[referência sintética](BASELINE.md). Reutiliza os leitores e cálculos TypeScript do próprio painel,
executados no Node, para evitar uma segunda implementação das regras em Python.

Esta entrega usa arquivos locais e grava snapshots em disco. Banco histórico PostgreSQL, API,
integração com o Sentinela e conferência com dados reais permanecem como etapas seguintes.
O painel continua lendo suas fontes pelo navegador; não consome esses snapshots automaticamente.

## Executar com dados fictícios

Requisitos: Node >= 22.18 e Python com `xlsxwriter` para gerar as planilhas de teste.
O importador em si usa somente APIs nativas do Node e o código de `lib/`, sem instalar serviços.
Execute na raiz do projeto:

```bash
npm run fixtures
npm run importar:piloto -- \
  --entrada tests/fixtures/print \
  --entrada tests/fixtures/arrecadacao \
  --saida piloto/dados-local \
  --referencia piloto/BASELINE.md
```

Resultado esperado: `{"estado":"importado","arquivos":4,"referencia":"confere"}`.
Na repetição idêntica, o estado passa a `reaproveitado`, sem somar outra vez os registros.

`--entrada` aceita uma ou mais pastas. Subpastas são percorridas até dez níveis. A seleção repete a
regra de pastas do painel: XLSX com Atividade/Cluster no nome e CSV com Arrecadação no nome ou caminho.
Um mesmo caminho encontrado em entradas sobrepostas só é enumerado uma vez. Arquivos distintos,
mesmo com conteúdo igual, continuam distintos: atividades repetidas são sinalizadas e mantidas.

`--mes`, `--data`, `--frente` e `--cluster` ajustam o recorte; sem opções, usa os filtros da referência,
ou o conjunto inteiro quando não há referência. Mês/data continuam sendo os da negociação.
Uma referência pode ser JSON ou Markdown com bloco JSON na estrutura de `BASELINE.md`.
Sem `--referencia`, o resumo é calculado, mas a equivalência não é afirmada.

## Saída para revisão

Cada conjunto de arquivos, regras, filtros e referência recebe uma pasta `carga-<sha256>`.
A identidade considera o conteúdo e os caminhos relativos; alterar apenas a data de modificação
não cria uma nova carga. Os nomes `1/`, `2/` etc. identificam a ordem das pastas de entrada.

| Arquivo | Conteúdo |
| --- | --- |
| `ultima.json` | Aponta para a última carga concluída sem divergência da referência, quando solicitada |
| `manifesto.json` | Identidade, horário, versão das regras, filtros, fontes, avisos, contagens e comparação |
| `originais/` | Cópias exatas das fontes capturadas, com hash verificado antes da leitura |
| `leitura.json` | Registros normalizados, com os mesmos arrays usados pelo painel |
| `linhas.ndjson` | Arquivo, aba, linha inicial/final, tipo, estado e motivos de cada registro lido |
| `resumo.json` | Totais e resumo comparáveis com a referência, em inteiros de 1/10.000 de real |
| `falha-<id>.json` | Erro, horário e fonte relativa da carga interrompida, quando o relatório puder ser gravado |

Em `linhas.ndjson`, `indice` é uma posição a partir de zero no array normalizado do respectivo arquivo
(`atividades`, `desdobros`, `pares` ou `pagamentos`). Aba/linha apontam para a posição original, a partir
de um. Um desdobro e sua atividade podem ter a mesma linha. CSV com campo multilinha conserva o intervalo
de linhas físicas. O manifesto registra a versão das regras e o instante da carga para todos os registros.

Os estados `aceito`, `parcial` e `ignorado` descrevem **a leitura**. Uma atividade aceita pode ser
excluída de um indicador por setor, filtro ou categoria. Pagamentos aceitos na leitura ainda podem
ser removidos pela sobreposição entre arquivos ou ficar sem negociação anterior na consolidação.
Esta etapa não grava um razão individual dos rateios nem atribui um identificador de acordo inexistente
nas fontes. A associação continua sendo por matrícula/data, conforme a regra atual.

## Falhas e retomada

Os [casos de erro](CASOS-DE-ERRO.md) detalham as situações verificadas. A carga é preparada numa pasta
temporária e só recebe o nome definitivo ao concluir. Falha de arquivo não troca `ultima.json`.
Uma comparação divergente mantém a nova carga para análise, sem promovê-la a última carga válida.

O comando retorna código 0 ao concluir/reaproveitar, 1 em falha e 2 em divergência de referência.
O terminal mostra somente o estado resumido; detalhes ficam na saída privada. Erros anteriores à abertura
da carga, como argumentos ou pasta de saída inválidos, podem não gerar `falha-*.json`.

A saída usa pastas privadas (700) e arquivos privados (600) em sistemas POSIX. Uma pasta já existente com
acesso para outros usuários é recusada; escolha uma nova pasta privada. No repositório, somente
`piloto/dados-local/` e suas subpastas são aceitas e estão no `.gitignore`. Não use pasta de publicação
nem uma pasta que se sobreponha à entrada. O piloto não acessa rede nem envia arquivos.

`.importacao.lock` impede duas execuções na mesma saída. Se o processo for encerrado à força, confirme
que nenhuma importação está ativa antes de remover o lock e eventuais pastas `.carga-*` pendentes.
Cargas anteriores são verificadas por hash antes do reaproveitamento; alteração de um arquivo é recusada,
sem regravação silenciosa. Esses hashes detectam alterações acidentais; não são assinatura contra adulteração.

## Validação

```bash
npm run fixtures
npm run test:core
npm run test:piloto
```

`npm test` também inclui os testes do piloto, além de build e interface. A validação completa do projeto
continua sendo `npm run lint`, `npm run typecheck` e `npm test` com as dependências e Chromium disponíveis.
Todos os testes desta entrega usam fontes sintéticas. Validação de volume real e ambiente Windows ainda
precisa ser feita antes de uso operacional.
