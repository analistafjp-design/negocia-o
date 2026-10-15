#!/usr/bin/env python3
"""
Gera lib/tabelas.ts a partir da extração do relatório do Power BI ("Report Negociações Acumulado").

As duas tabelas de apoio estão embutidas, comprimidas, no código M do relatório
(`d_Cod/Desc  Corresp` e `Recursos`). Este script decodifica os blocos e repete os passos de
Power Query que o relatório aplica a eles, para que o painel use exatamente as mesmas linhas:

  d_Cod/Desc  Corresp : SERVICO vira inteiro e Table.Distinct por SERVICO (fica a primeira linha).
  Recursos            : Table.Distinct por Recurso (fica a primeira linha) e as substituições
                        RIOSETB2 -> RIOPCRNT, "Ação de Verão" -> "Recuperação de Cortados" e
                        RIOCERB1 -> RIOVCGVENIN (as outras duas trocas do M se anulam).

Só tabelas de apoio (códigos de serviço e recursos): nada de dados de clientes.

Uso: python3 tools/gerar_tabelas.py <Report_Negociacoes_Acumulado_Extracao_Completa.md> [saida.ts]
"""
import base64
import json
import re
import sys
import zlib
from pathlib import Path


def bloco_m(texto, nome):
    i = texto.index("### Consulta / função / parâmetro: `%s`" % nome)
    j = texto.index("```powerquery", i)
    k = texto.index("```", j + 10)
    return texto[j:k]


def dados(texto, nome):
    m = re.search(r'Binary\.FromText\("([^"]+)"', bloco_m(texto, nome))
    cru = zlib.decompress(base64.b64decode(re.sub(r"\s+", "", m.group(1))), -15)  # Compression.Deflate = deflate cru
    return json.loads(cru.decode("utf-8"))


def servicos(linhas):
    vistos, saida = set(), []
    for codigo_descricao, _descricao, servico, _abertura, categoria, setor in linhas:
        n = int(str(servico).strip())  # Int64.Type
        if n in vistos:  # Table.Distinct por SERVICO
            continue
        vistos.add(n)
        saida.append([codigo_descricao, n, categoria or "", setor or ""])
    return saida


def recursos(linhas):
    vistos, saida = set(), []
    for recurso, setor in linhas:
        if recurso in vistos:  # Table.Distinct por Recurso
            continue
        vistos.add(recurso)
        saida.append([recurso, setor])
    for r in saida:
        r[0] = r[0].replace("RIOSETB2", "RIOPCRNT").replace("RIOCERB1", "RIOVCGVENIN")
        r[1] = r[1].replace("Ação de Verão", "Recuperação de Cortados")
        # "Recuperação de Cortados" -> "Vendas - VCG" -> "Recuperação de Cortados": os dois passos se anulam
    repetidos = {r[0] for r in saida if sum(1 for x in saida if x[0] == r[0]) > 1}
    if repetidos:
        print("ATENÇÃO: recursos repetidos depois das substituições:", sorted(repetidos), file=sys.stderr)
    return saida


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    texto = Path(sys.argv[1]).read_text(encoding="utf-8")
    saida = Path(sys.argv[2] if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / "lib" / "tabelas.ts")
    s = servicos(dados(texto, "d_Cod/Desc  Corresp"))
    r = recursos(dados(texto, "Recursos"))
    ts = (
        "// Tabelas de apoio do relatório do Power BI (códigos de serviço e recursos). Gerado por tools/gerar_tabelas.py; não editar à mão.\n"
        "// SERVICOS: [CODIGO/DESCRICAO, SERVICO, CATEGORIA, Setor]    RECURSOS: [Recurso abreviado, Setor do Recurso]\n\n"
        "export const SERVICOS: ReadonlyArray<readonly [string, number, string, string]> = "
        + json.dumps(s, ensure_ascii=False, indent=2)
        + ";\n\n"
        "export const RECURSOS: ReadonlyArray<readonly [string, string]> = "
        + json.dumps(r, ensure_ascii=False, indent=2)
        + ";\n"
    )
    saida.write_text(ts, encoding="utf-8")
    print("gerado", saida, "-", len(s), "serviços,", len(r), "recursos")


if __name__ == "__main__":
    main()
