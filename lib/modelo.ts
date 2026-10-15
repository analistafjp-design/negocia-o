// Junta o que foi lido dos arquivos e liga as tabelas como no modelo do Power BI.
import { RECURSOS, SERVICOS } from "./tabelas.ts";
import { COD_CADASTRO, COD_NEGOCIACAO, chave, trimStr } from "./leitura.ts";
import type { Atividade, Desdobro, Modelo, ResultadoArquivo, ResultadoAtividades, ResultadoCluster } from "./tipos.ts";

/** Categoria Principal do desdobro (categoria da atividade de origem), em código numérico. */
export const K_OUTRA = 0;
export const K_CORTE = 1;
export const K_POS = 2;
export const K_COBRANCA = 3;
const kDaCategoria = (c: string | undefined): number => {
  const k = chave(c);
  return k === "corte" ? K_CORTE : k === "vistoria pós corte" ? K_POS : k === "cobrança" ? K_COBRANCA : K_OUTRA;
};

/** Une textos que só diferem em maiúsculas/minúsculas e espaços nas pontas (o modelo do Power BI faz isso); vale o 1º visto. */
function criarCanon(): (v: unknown) => string {
  const m = new Map<string, string>();
  return (v) => {
    const t = trimStr(v);
    if (!t) return "";
    const k = t.toLowerCase();
    let c = m.get(k);
    if (c === undefined) {
      c = t;
      m.set(k, c);
    }
    return c;
  };
}

interface Indices {
  recursos: Map<string, string>; // recurso abreviado -> setor do recurso
  porServico: Map<number, { cat: string; setor: string }>;
  porCodDesc: Map<string, string>; // Código/Descrição (minúsculas) -> categoria
  canonSetor: (v: unknown) => string;
}

let indices: Indices | null = null;
/** Tabelas de apoio indexadas: recursos (por abreviação), serviços (por código) e código/descrição. */
function indicesTabelas(): Indices {
  if (indices) return indices;
  const canonSetor = criarCanon();
  const recursos = new Map<string, string>();
  for (const [abrev, setor] of RECURSOS) recursos.set(abrev, canonSetor(setor));
  const porServico = new Map<number, { cat: string; setor: string }>();
  const porCodDesc = new Map<string, string>();
  for (const [codDesc, servico, categoria, setor] of SERVICOS) {
    porServico.set(servico, { cat: categoria, setor });
    porCodDesc.set(chave(codDesc), categoria);
  }
  indices = { recursos, porServico, porCodDesc, canonSetor };
  return indices;
}

const porCaminho = (a: { path?: string; name?: string }, b: { path?: string; name?: string }): number => {
  const x = a.path || a.name || "";
  const y = b.path || b.name || "";
  return x < y ? -1 : x > y ? 1 : 0;
};

/**
 * Junta o que foi lido dos arquivos.
 * - Atividades: como no relatório, não há remoção de duplicadas; só ficam as de recurso com setor conhecido.
 * - Desdobros: todos os de código usado, de qualquer recurso (o relatório não filtra o setor nessa tabela).
 * - Cluster: uma linha por matrícula; vale a primeira encontrada (arquivos em ordem de nome).
 */
export function consolidar(resultados: ResultadoArquivo[]): Modelo {
  const ix = indicesTabelas();
  const atv = resultados.filter((r): r is ResultadoAtividades => r.tipo === "atividades").sort(porCaminho);
  const clu = resultados.filter((r): r is ResultadoCluster => r.tipo === "cluster").sort(porCaminho);
  const canon = { cluster: criarCanon(), cidade: criarCanon(), recurso: criarCanon(), motivo: criarCanon() };

  const clusterDe = new Map<string, string>();
  for (const f of clu) for (const [mat, cl] of f.pares) if (!clusterDe.has(mat)) clusterDe.set(mat, canon.cluster(cl));

  const A: Atividade[] = [];
  const D: Desdobro[] = [];
  const semSetor = new Map<string, number>(); // recurso sem setor conhecido -> linhas descartadas
  const ids = new Map<string, number>();
  let repetidas = 0;
  let semCodigo = 0;
  let totalLinhas = 0;
  for (const f of atv) {
    totalLinhas += f.atividades.length;
    for (const a of f.atividades) {
      const i = a.recurso.indexOf("-");
      const setor = i < 0 ? undefined : ix.recursos.get(a.recurso.slice(0, i)); // Text.BeforeDelimiter + junção exata
      if (setor === undefined) {
        semSetor.set(a.recurso, (semSetor.get(a.recurso) || 0) + 1);
        continue;
      }
      const m = /^\s*(\d+)/.exec(a.codigo);
      const srv = m ? ix.porServico.get(parseInt(m[1], 10)) : undefined;
      if (!srv) semCodigo++;
      if (a.id) {
        const n = (ids.get(a.id) || 0) + 1;
        ids.set(a.id, n);
        if (n > 1) repetidas++;
      }
      const motivo = a.mn !== "" ? a.mn : a.mc; // SWITCH da coluna "Motivo não Execução"
      A.push({
        rec: canon.recurso(a.recurso),
        mat: a.mat,
        setor,
        cob: !!srv && chave(srv.cat) === "cobrança",
        sCom: !!srv && chave(srv.setor) === "comercial",
        man: chave(setor) === "manutenção",
        sim: chave(a.neg) === "sim",
        data: a.data,
        mes: a.data.slice(0, 7),
        cidade: canon.cidade(a.cidade),
        mot: canon.motivo(motivo),
        val: a.val,
        cl: clusterDe.get(a.mat) || "",
      });
    }
    for (const d of f.desdobros) {
      D.push({
        mat: d.mat,
        data: d.data,
        mes: d.data.slice(0, 7),
        i: d.cod === COD_NEGOCIACAO[0] ? 0 : d.cod === COD_NEGOCIACAO[1] ? 1 : -1,
        cad: (COD_CADASTRO as readonly string[]).includes(d.cod),
        k: kDaCategoria(ix.porCodDesc.get(chave(d.codigo))), // Categoria Principal: a da atividade de origem
        val: d.val,
      });
    }
  }
  const frentes = new Set<string>();
  const clusters = new Set<string>();
  const meses = new Set<string>();
  const datas = new Set<string>();
  for (const a of A) {
    frentes.add(a.setor);
    if (a.cl) clusters.add(a.cl);
    if (a.data) {
      datas.add(a.data);
      meses.add(a.mes);
    }
  }
  for (const d of D) {
    if (d.data) {
      datas.add(d.data);
      meses.add(d.mes);
    }
  }
  const ord = (s: Set<string>): string[] => [...s].sort((x, y) => x.localeCompare(y, "pt-BR"));
  return {
    A,
    D,
    opcoes: {
      frentes: ord(frentes),
      clusters: ord(clusters),
      temSemCluster: A.some((a) => !a.cl),
      meses: [...meses].sort(),
      datas: [...datas].sort(),
    },
    resumo: {
      arquivos: atv.length,
      arquivosCluster: clu.length,
      linhas: totalLinhas,
      atividades: A.length,
      desdobros: D.length,
      clusterMatriculas: clusterDe.size,
      descartadasSemSetor: [...semSetor.values()].reduce((x, y) => x + y, 0),
      recursosSemSetor: [...semSetor.entries()].sort((x, y) => y[1] - x[1]).map(([recurso, linhas]) => ({ recurso, linhas })),
      idsRepetidos: repetidas,
      semCodigoConhecido: semCodigo,
    },
  };
}
