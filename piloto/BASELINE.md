# Referência validada — piloto de base histórica

Data da verificação: 30/10/2026.

## Versão de referência

- Repositório: `analistafjp-design/negocia-o`.
- Código de referência: `5a120ef2ead67f0b90d0ba13a1895192c88a0412`.
- Ramificação do piloto: `piloto/base-historica`.
- Escopo desta entrega: preparar a ramificação e registrar uma referência reproduzível das regras existentes.
- Dados usados: exclusivamente as planilhas e CSV sintéticos gerados por `tools/make_fixtures.py`; nenhum arquivo real de clientes foi utilizado.

## Verificações executadas

| Verificação | Resultado | Evidência |
| --- | --- | --- |
| Correspondência da cópia de trabalho com o código de referência | 53 arquivos conferidos pelo hash de blob Git | Comparação com a árvore do commit de referência |
| Geração das fixtures existentes | Aprovada | 141 linhas de atividade e 129 matrículas no Cluster |
| Testes locais do núcleo | 60 aprovados; 0 falhas; 0 ignorados | `node --test --test-reporter=tap tests/core.test.mjs`, Node 24.22.1 |
| Verificação completa no GitHub | Aprovada na reexecução do job `build-and-test` do código de referência | [Execução do CI](https://github.com/analistafjp-design/negocia-o/actions/runs/38972972681), job [124039993015](https://github.com/analistafjp-design/negocia-o/actions/runs/38972972681/job/124039993015) |

O workflow completo verifica lint, tipos, geração de fixtures, compilação e testes de núcleo/interface. Essa confirmação se refere ao código de referência indicado acima; novos commits devem ter seus próprios checks conferidos.

## Valores de referência — dados sintéticos

Filtro: negociações de setembro de 2026, dia 29/09/2026. O recorte de mês/data é o da negociação, conforme a implementação existente.

| Resultado | Referência |
| --- | ---: |
| Negociação principal | 124 |
| Negociação Pós Corte | 8 |
| Total dos cartões | 132 |
| Valor negociado dos cartões | R$ 58.427,47 |
| Total da matriz Comercial | 131 |
| Parcelas quitadas consolidadas, sem sobreposição entre arquivos | 8 |
| Valor das parcelas quitadas consolidadas | R$ 3.073,56 |
| Pagamentos associados pela regra atual | 6 |
| Valor associado | R$ 1.574,56 |
| Pagamentos sem negociação anterior | 2 |
| Valor sem negociação anterior | R$ 1.499,00 |

A diferença entre 132 nos cartões e 131 na matriz Comercial faz parte do comportamento atual testado: há desdobro sem atividade da mesma matrícula no conjunto sintético. Não deve ser alterada pelo importador.

## Regras preservadas para o piloto

- Apenas parcelas quitadas entram na arrecadação.
- Associação pela mesma matrícula e pela negociação anterior mais recente até a data do pagamento.
- Rateio entre negociações da mesma data conforme a implementação existente.
- Sobreposição diária/acumulada tratada pela maior multiplicidade do mesmo registro em um arquivo; repetições internas legítimas preservadas.
- Atividades repetidas são sinalizadas, sem exclusão automática.
- Valores monetários armazenados em escala inteira de 10.000 unidades por real; `null` permanece diferente de zero.
- O leitor atual não importa identificador de acordo/parcela. Associação por matrícula/data não comprova vínculo com um acordo específico.

## Como reproduzir

```bash
python3 tools/make_fixtures.py tests/fixtures
node --test tests/core.test.mjs
```

Para a validação completa, com as dependências do projeto e Chromium disponíveis:

```bash
npm run lint
npm run typecheck
npm test
```

## Próxima entrega

Implementar o importador em ambiente de teste, preservando arquivo, aba, linha e versão da regra. Comparar os totais e as associações com a referência abaixo antes de integrar banco/API ao painel. Banco histórico, API e importação de dados reais ainda não foram implementados nesta etapa.

## Referência legível por máquina

Os valores monetários no JSON estão em unidades inteiras de 1/10.000 de real, conforme `monetary_scale`.

```json
{
  "source_commit": "5a120ef2ead67f0b90d0ba13a1895192c88a0412",
  "dataset": "fixtures sintéticas existentes no repositório",
  "filters": {
    "mes": "2026-09",
    "data": "2026-09-29"
  },
  "monetary_scale": 10000,
  "without_payments": {
    "summary": {
      "arquivos": 1,
      "arquivosCluster": 1,
      "linhas": 141,
      "atividades": 134,
      "desdobros": 9,
      "clusterMatriculas": 129,
      "descartadasSemSetor": 7,
      "recursosSemSetor": [
        {
          "recurso": "D11 - APERIBÉ. CAMBUCI. ITAOCARA. MIRCMA",
          "linhas": 6
        },
        {
          "recurso": "D13.1 - CASIMIRO DE ABREU",
          "linhas": 1
        }
      ],
      "idsRepetidos": 0,
      "semCodigoConhecido": 0
    },
    "cards": {
      "principal": 124,
      "cadastro": null,
      "corte": null,
      "desdobro": 0,
      "pos": 8,
      "total": 132,
      "valPrincipal": 403816000,
      "valCorte": null,
      "valDesdobro": 0,
      "valPos": 180458700,
      "valTotal": 584274700,
      "arrPrincipal": 0,
      "arrCorte": null,
      "arrDesdobro": 0,
      "arrPos": 0,
      "arrTotal": 0
    },
    "commercial_total": {
      "principal": 124,
      "cadastro": null,
      "corte": null,
      "desdobro": 0,
      "pos": 7,
      "total": 131,
      "valPrincipal": 403816000,
      "valCorte": null,
      "valDesdobro": 0,
      "valPos": 177230400,
      "valTotal": 581046400,
      "arrPrincipal": 0,
      "arrCorte": null,
      "arrDesdobro": 0,
      "arrPos": 0,
      "arrTotal": 0
    }
  },
  "with_payments": {
    "collection": {
      "arquivos": 2,
      "linhas": 12,
      "pagamentos": 8,
      "valor": 30735600,
      "repetidos": 2,
      "ligados": 6,
      "valorLigado": 15745600,
      "semNegociacao": 2,
      "valorSemNegociacao": 14990000,
      "primeira": "2026-09-28",
      "ultima": "2026-10-06"
    },
    "cards": {
      "principal": 124,
      "cadastro": null,
      "corte": null,
      "desdobro": 0,
      "pos": 8,
      "total": 132,
      "valPrincipal": 403816000,
      "valCorte": null,
      "valDesdobro": 0,
      "valPos": 180458700,
      "valTotal": 584274700,
      "arrPrincipal": 1832539,
      "arrCorte": null,
      "arrDesdobro": 0,
      "arrPos": 13913061,
      "arrTotal": 15745600
    },
    "commercial_total": {
      "principal": 124,
      "cadastro": null,
      "corte": null,
      "desdobro": 0,
      "pos": 7,
      "total": 131,
      "valPrincipal": 403816000,
      "valCorte": null,
      "valDesdobro": 0,
      "valPos": 177230400,
      "valTotal": 581046400,
      "arrPrincipal": 1832539,
      "arrCorte": null,
      "arrDesdobro": 0,
      "arrPos": 13913061,
      "arrTotal": 15745600
    }
  }
}
```
