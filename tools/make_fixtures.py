#!/usr/bin/env python3
"""
Gera planilhas SINTÉTICAS para testar o painel de Negociações.

Nada aqui vem da base real: matrículas, valores e a distribuição por recurso/cidade são inventados.
A pasta `print/` monta um conjunto de linhas que, lido pelo painel, reproduz os números do print do
Power BI (cartões e matriz Cluster x Frente de 29/09/2026); isso confere as regras, mas NÃO substitui
a conferência com a base real.

Uso: python3 tools/make_fixtures.py <pasta_saida>
Requer: xlsxwriter (pip install xlsxwriter).
"""
import json
import sys
from datetime import datetime
from pathlib import Path

import xlsxwriter

DIA = "2026-09-29"
MATRICULA_ORFA = 9000001

CABECALHO = [
    "Nome da Origem", "Recurso", "Cód. Protocolo Origem", "ID da Atividade", "Matrícula", "Código/Descrição", "Data",
    "Status da Atividade", "Cidade", "Tipo de Atividade", "Motivo de Não Execução - Cobrança",
    "Motivo de Não Execução - Normal", "Body Adicional Executado", "Valor Total dos Débitos", "Negociou O Débito?",
    "Forma De Negociação", "Observação",
]

CIDADES = ["ITAOCARA", "CANTAGALO", "CASIMIRO DE ABREU", "MIRACEMA", "RIO BONITO", "S.FCO.DO ITABAPOANA",
           "CORDEIRO", "CAMBUCI", "APERIBE", "DUAS BARRAS", "S.SEBASTIAO DO ALTO"]
SUPERVISAO = "D11 - APERIBÉ. CAMBUCI. ITAOCARA. MIRCMA"  # recurso sem setor no cadastro: não entra em f_Atividade, mas gera desdobro
SUPERVISAO_2 = "D13.1 - CASIMIRO DE ABREU"

PRINCIPAL = "107001-COBRANÇA - VISITA"
POS_CORTE = "110010-VISTORIA PÓS CORTE"


def body(cod):
    return json.dumps([{"opeServico": 1, "cadServicoDefinicaoExecutado": cod, "dsParecerExecucao": "Negociado", "flExecutado": True}], ensure_ascii=False)


def fatiar(total_centavos, n):
    """Divide em n partes inteiras (centavos) que somam exatamente o total."""
    base, resto = divmod(total_centavos, n)
    return [base + (1 if i < resto else 0) for i in range(n)]


class Linhas:
    def __init__(self):
        self.atv = []
        self.cluster = []
        self._id = 1000
        self._mat = 100000

    def nova(self, **k):
        self._id += 1
        r = {"ID da Atividade": self._id, "Data": DIA, "Status da Atividade": "Finalizada", "Tipo de Atividade": "Campo"}
        r.update(k)
        self.atv.append(r)
        return r

    def matricula(self, cluster=None):
        self._mat += 1
        if cluster:
            self.cluster.append((self._mat, cluster))
        return self._mat


def montar_print():
    L = Linhas()
    cid = iter(range(10 ** 6))

    def cidade():
        return CIDADES[next(cid) % len(CIDADES)]

    # célula: (cluster, recurso base, n linhas principais, valor total em centavos, [valores D atribuídos pela matrícula])
    celulas = [
        ("Inadimplente", "RIOLTRIN", 63, 1448765, [70025, 60000]),
        ("Inadimplente", "RIOCERIN", 4, 413898, [1200000]),
        ("Adimplente", "RIOLTRIN", 45, 1870263, [60050, 60800]),
        ("Adimplente", "RIOCERIN", 4, 51982, []),
        (None, "RIOLTRIN", 5, 224983, []),
        ("Nunca Pagou", "RIOLTRIN", 2, 28269, []),
    ]
    recursos_por_base = {"RIOLTRIN": 30, "RIOCERIN": 3}
    contador = {}
    for cluster, base, n, total, ds in celulas:
        valores = fatiar(total, n)
        mats = []
        for i in range(n):
            contador[base] = contador.get(base, 0) + 1
            rec = "%s-%03d" % (base, 1 + (contador[base] - 1) % recursos_por_base[base])
            m = L.matricula(cluster)
            mats.append(m)
            L.nova(**{"Recurso": rec, "Matrícula": m, "Código/Descrição": PRINCIPAL, "Cidade": cidade(), "Negociou O Débito?": "SIM",
                      "Valor Total dos Débitos": valores[i] / 100, "Forma De Negociação": "Parcelado"})
        # desdobros ligados a esta célula pela matrícula: origem em recurso sem setor (só a tabela de desdobro os enxerga)
        for j, v in enumerate(ds):
            L.nova(**{"Recurso": SUPERVISAO, "Matrícula": mats[j], "Código/Descrição": POS_CORTE, "Cidade": cidade(),
                      "Body Adicional Executado": body("107002" if j % 2 == 0 else "207002"), "Valor Total dos Débitos": v / 100})

    # Pós Corte: a própria vistoria (recurso Pós Corte) é a atividade de origem do desdobro
    for cluster, v, rec in (("Inadimplente", 201586, "RIOPCRTIN-001"), ("Adimplente", 119843, "RIOPCRTIN-002")):
        m = L.matricula(cluster)
        L.nova(**{"Recurso": rec, "Matrícula": m, "Código/Descrição": POS_CORTE, "Cidade": cidade(), "Body Adicional Executado": body("107002"),
                  "Valor Total dos Débitos": v / 100})

    # Recadastro: negociação principal sem valor informado (aparece com quantidade e R$ em branco)
    m = L.matricula("Nunca Pagou")
    L.nova(**{"Recurso": "RIORECIN-001", "Matrícula": m, "Código/Descrição": PRINCIPAL, "Cidade": cidade(), "Negociou O Débito?": "SIM"})

    # desdobro de pós corte sem nenhuma atividade da mesma matrícula: só aparece quando não há filtro de atividade
    L.nova(**{"Recurso": SUPERVISAO_2, "Matrícula": MATRICULA_ORFA, "Código/Descrição": POS_CORTE, "Cidade": cidade(),
              "Body Adicional Executado": body("207002"), "Valor Total dos Débitos": 322.83})

    # único motivo de não execução do print + linhas que não podem entrar no gráfico
    L.nova(**{"Recurso": "RIOLTRIN-001", "Matrícula": L.matricula("Inadimplente"), "Código/Descrição": PRINCIPAL, "Cidade": cidade(),
              "Negociou O Débito?": "NÃO", "Motivo de Não Execução - Cobrança": "DUPLICIDADE DE MATRÍCULA", "Status da Atividade": "Encerrada com Ocorrência"})
    L.nova(**{"Recurso": "RIOLTRIN-002", "Matrícula": L.matricula("Inadimplente"), "Código/Descrição": PRINCIPAL, "Cidade": cidade(),
              "Negociou O Débito?": "NÃO", "Motivo de Não Execução - Cobrança": "SUSPENSO"})
    L.nova(**{"Recurso": "RIOLTRIN-004", "Matrícula": L.matricula("Inadimplente"), "Código/Descrição": "209001 - CORTE DE ÁGUA NO CAVALETE - DÉBITO",
              "Cidade": cidade(), "Motivo de Não Execução - Normal": "CLIENTE AUSENTE", "Negociou O Débito?": "NÃO"})
    return L


def montar_extras(L):
    """Linhas fora do dia do print (decoys): o filtro de data/mês tem que deixá-las de fora."""
    for dia, n, v in (("2026-09-28", 3, 10000), ("2026-10-01", 2, 5000)):
        mats = []
        for i in range(n):
            m = L.matricula("Inadimplente")
            mats.append(m)
            L.nova(**{"Recurso": "RIOLTRIN-010", "Matrícula": m, "Código/Descrição": PRINCIPAL, "Cidade": "MIRACEMA", "Data": dia,
                      "Negociou O Débito?": "SIM", "Valor Total dos Débitos": v / 100})
    L.nova(**{"Recurso": SUPERVISAO, "Matrícula": MATRICULA_ORFA + 1, "Código/Descrição": POS_CORTE, "Cidade": "MIRACEMA", "Data": "2026-09-28",
              "Body Adicional Executado": body("107002"), "Valor Total dos Débitos": 10.0})


def escrever_atividades(caminho, linhas, aba="Page 1", cabecalho=CABECALHO, prefixo=(), converter=None):
    wb = xlsxwriter.Workbook(str(caminho))
    ws = wb.add_worksheet(aba)
    fmt_data = wb.add_format({"num_format": "dd/mm/yyyy"})
    r0 = 0
    for linha_prefixo in prefixo:
        ws.write(r0, 0, linha_prefixo)
        r0 += 1
    for c, h in enumerate(cabecalho):
        ws.write(r0, c, h)
    for i, r in enumerate(linhas, start=r0 + 1):
        for c, h in enumerate(cabecalho):
            v = r.get(h)
            if converter:
                v = converter(h, v)
            if v is None or v == "":
                continue
            if h == "Data" and isinstance(v, str) and len(v) == 10 and v[4] == "-":
                ws.write_datetime(i, c, datetime.strptime(v, "%Y-%m-%d"), fmt_data)
            else:
                ws.write(i, c, v)
    wb.close()


def escrever_cluster(caminho, pares, aba="Planilha1"):
    wb = xlsxwriter.Workbook(str(caminho))
    ws = wb.add_worksheet(aba)
    for c, h in enumerate(["NUM_LIGACAO", "SEQ_RESPONSAVEL", "CLUSTER SALDO"]):
        ws.write(0, c, h)
    for i, (m, cl) in enumerate(pares, start=1):
        ws.write(i, 0, m)
        ws.write(i, 1, 1000 + i)
        ws.write(i, 2, cl)
    wb.close()


def casos(saida):
    saida.mkdir(parents=True, exist_ok=True)
    base = [
        {"Recurso": "RIOLTRIN-001", "ID da Atividade": 1, "Matrícula": 555001, "Código/Descrição": PRINCIPAL, "Data": "2026-09-29", "Cidade": "MIRACEMA",
         "Negociou O Débito?": "SIM", "Valor Total dos Débitos": 1234.56},
        {"Recurso": "RIOLTRIN-002", "ID da Atividade": 2, "Matrícula": 555002, "Código/Descrição": PRINCIPAL, "Data": "2026-09-29", "Cidade": "MIRACEMA",
         "Negociou O Débito?": "SIM", "Valor Total dos Débitos": 100.0},
    ]
    # 1) valores, datas e matrícula como texto (formato brasileiro), com zeros à esquerda na matrícula
    def como_texto(h, v):
        if h == "Valor Total dos Débitos" and isinstance(v, float):
            return "R$ " + "{:,.2f}".format(v).replace(",", "X").replace(".", ",").replace("X", ".")
        if h == "Data":
            return "29/09/2026"
        if h == "Matrícula":
            return "00" + str(v)
        return v
    escrever_atividades(saida / "valores_em_texto.xlsx", base, converter=como_texto)
    # 2) falta uma coluna obrigatória
    cab = [h for h in CABECALHO if h != "Negociou O Débito?"]
    escrever_atividades(saida / "sem_coluna_obrigatoria.xlsx", base, cabecalho=cab)
    # 3) aba com outro nome e cabeçalho na 3ª linha
    escrever_atividades(saida / "cabecalho_na_linha_3.xlsx", base, aba="Dados", prefixo=("Relatório de atividades", "gerado em 29/09/2026"))
    # 4) aba "Page 1" vem depois de uma aba irrelevante
    wb = xlsxwriter.Workbook(str(saida / "varias_abas.xlsx"))
    wb.add_worksheet("Resumo").write(0, 0, "nada aqui")
    ws = wb.add_worksheet("Page 1")
    for c, h in enumerate(CABECALHO):
        ws.write(0, c, h)
    for c, h in enumerate(CABECALHO):
        v = base[0].get(h)
        if v is not None:
            ws.write(1, c, v)
    wb.close()
    # 5) sem cabeçalho reconhecível
    wb = xlsxwriter.Workbook(str(saida / "sem_cabecalho.xlsx"))
    ws = wb.add_worksheet("Page 1")
    ws.write_row(0, 0, ["a", "b", "c"])
    ws.write_row(1, 0, [1, 2, 3])
    wb.close()
    # 6) JSON quebrado no corpo adicional (os códigos ainda são achados pelo nome do campo)
    quebrado = dict(base[0])
    quebrado["Body Adicional Executado"] = '[{"cadServicoDefinicaoExecutado": "107002", "dsParecerExecucao": "texto cortado'
    escrever_atividades(saida / "json_quebrado.xlsx", [quebrado])
    # 6b) vários códigos no mesmo corpo adicional: só os usados pelas medidas são guardados
    varios = dict(base[0])
    varios["Valor Total dos Débitos"] = 80.0
    varios["Body Adicional Executado"] = json.dumps(
        [{"cadServicoDefinicaoExecutado": c} for c in ("107002", "202002", "999999", 207002, "102004")], ensure_ascii=False
    )
    escrever_atividades(saida / "codigos_desdobro.xlsx", [varios])
    # 7) dois arquivos de Cluster com a mesma matrícula (vale o primeiro, em ordem de nome)
    escrever_cluster(saida / "Cluster_A.xlsx", [(555001, "Adimplente"), (555001, "Inadimplente"), (555002, "Nunca Pagou")])
    escrever_cluster(saida / "Cluster_B.xlsx", [(555001, "Esquecido"), (555003, "Flutuante")], aba="Outra")
    # 8) arquivo que não é xlsx
    (saida / "corrompido.xlsx").write_bytes(b"isto nao e um xlsx")


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    saida = Path(sys.argv[1])
    pasta = saida / "print"
    pasta.mkdir(parents=True, exist_ok=True)
    L = montar_print()
    montar_extras(L)
    escrever_atividades(pasta / "Report Atividade 2026-09-29.xlsx", L.atv)
    escrever_cluster(pasta / "Cluster_2026-09.xlsx", L.cluster)
    casos(saida / "casos")
    print("gerado em", saida, "-", len(L.atv), "linhas de atividade,", len(L.cluster), "matrículas no cluster")


if __name__ == "__main__":
    main()
