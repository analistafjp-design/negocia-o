# Casos de erro para revisão — importador local

Os cenários abaixo usam dados fictícios. Os testes do piloto estão em `tests/piloto.test.mjs`;
as regras de negócio preservadas também são verificadas em `tests/core.test.mjs`.
Os resultados não comprovam a qualidade da base real nem o vínculo com um acordo específico.

## Impedem a nova carga ou sua promoção

| Situação simulada | Resultado observado no teste | Como fica a carga anterior |
| --- | --- | --- |
| XLSX sem `Negociou O Débito?` | Erro `COLUNAS_AUSENTES`, com arquivo registrado no relatório de falha | Preservada |
| CSV sem `Valor Pago` | Erro `COLUNAS_AUSENTES`; ausência não vira zero | Preservada |
| XLSX corrompido | Erro `NOT_XLSX`; pasta de carga incompleta é removida | Preservada |
| Total diferente da referência | Diferença guardada com o caminho do campo; comando termina com código 2 | Preservada; carga divergente fica disponível para análise |
| Arquivo de uma carga anterior foi alterado | Reaproveitamento recusado por integridade; arquivo alterado não é regravado | Ponteiro não é promovido; a carga alterada requer investigação |
| Só há Cluster, sem Atividades | Carga recusada; `ultima.json` não é criado na saída nova | Nenhuma nova carga é promovida |
| Valor acima da precisão inteira do painel | Carga interrompida; não há arredondamento silencioso | Nenhuma nova carga é promovida |
| Saída dentro de `public/` ou sobreposta à entrada | Execução recusada antes de importar | Preservada |
| Já há um lock na saída | Segunda execução recusada; lock existente é mantido | Preservada |

No teste de divergência, a referência fictícia é alterada de **132 para 133 negociações**. O importador
obtém **132**, informa `without_payments.cards.total` como divergente e mantém o apontador anterior.
Isso verifica o mecanismo de comparação sem alterar qualquer regra do painel.

## São sinalizados ou ignorados conforme a regra atual

| Situação simulada | Resultado observado no teste | Ponto para analisar |
| --- | --- | --- |
| Data e valor inválidos em uma atividade | Atividade mantida com data vazia/valor `null`; origem marcada `parcial`, com os dois motivos | Não equivale a excluir a atividade de todas as contagens |
| JSON do desdobro interrompido | Código recuperado pela regra existente; atividade e desdobro marcados `parcial` | Recuperação fica explícita para revisão |
| Matrícula repetida no mesmo Cluster | Primeira linha mantida; segunda ignorada com motivo e linha de origem | Preserva o comportamento atual |
| Pagamento de fatura mensal | Ignorado: `OUTRO_TIPO_FATURA` | Só parcelas entram |
| Parcela pendente | Ignorada: `PARCELA_NAO_QUITADA` | Não entra como arrecadação |
| Pagamento sem matrícula, data válida ou valor legível | Ignorado com o motivo específico | A linha física continua identificada |
| Pagamento anterior à negociação | Não é atribuído à negociação; aparece no resumo dos sem negociação anterior | Mesmo CPF/matrícula não basta para atribuição |
| Pagamento posterior à negociação | Associado pela matrícula e pela negociação anterior mais recente | Não prova que pertence ao acordo específico |

## Duplicidade e origem

| Situação simulada | Resultado observado no teste |
| --- | --- |
| Mesmo pagamento na diária e na acumulada | Sobreposição removida pela regra existente |
| Dois pagamentos iguais no mesmo arquivo | Ambos preservados, conforme a regra atual |
| Executar outra vez com os mesmos arquivos, mudando só o horário do arquivo | Mesma carga reaproveitada; não soma os registros novamente |
| Informar duas vezes a mesma pasta | Cada caminho é enumerado uma vez |
| Duas planilhas de atividade distintas com conteúdo igual | Quatro atividades lidas no exemplo, dois IDs repetidos sinalizados; sem exclusão automática |
| Cabeçalho e registros em posições esparsas no Excel | Origens apontam para aba `Dados`, linhas 7 e 12, sem usar a posição sequencial como linha |
| CSV com BOM, CRLF e campo multilinha | Primeiro registro aponta para linhas 2 a 3; próximos registros conservam suas linhas físicas |
| Registro CSV atravessa bloco de 4 MB | Dois pagamentos lidos com intervalos de linha corretos |
| Atalho simbólico, arquivo temporário do Excel ou arquivo de outro assunto | Ignorados e identificados no manifesto, sem abrir como fonte do painel |
| Campo sem valor versus zero | Comparação acusa diferença entre `null` e `0` |

## Limite que depende das fontes reais

Sem identificador de acordo ou parcela, um pagamento posterior pode pertencer a outro parcelamento da
mesma matrícula. O importador preserva a associação por matrícula/data e não a apresenta como vínculo
comprovado. A solução exige uma fonte que permita identificar o acordo/parcela e validar essa relação.

Ainda não foram verificados: falha física de disco, encerramento forçado em cada ponto da gravação,
volume de produção, sincronização real do OneDrive e permissões do Windows. Nenhum cenário acima deve
ser interpretado como certificação de segurança ou validação em produção.
