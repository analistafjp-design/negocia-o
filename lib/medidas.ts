// Medidas do relatório "Report Negociações Acumulado" do Power BI e os visuais do painel.
// BLANK do DAX = null. Valores em milésimos de centavo (use `reais`).
import { chave } from "./leitura.ts";
import { K_CORTE, K_COBRANCA, K_POS } from "./modelo.ts";
import type { Atividade, Desdobro, Filtros, Medidas, Modelo, NoArvore, LinhaTop, Visao } from "./tipos.ts";

/** Recursos retirados somente do Top 10 (grafia exata do relatório, inclusive "MIRCMA"). */
export const EXCLUIDOS_TOP10: readonly string[] = [
  "D11 - APERIBÉ. CAMBUCI. ITAOCARA. MIRCMA",
  "D11.1 - SÃO FRANCISCO DE ITABAPOANA",
  "D11.2 - CANTAGL. CORD. D BARRAS. S SB AT",
  "D12 - RIO BONITO. CACHOEIRAS DE MACACU",
  "D13.1 - CASIMIRO DE ABREU",
];
const TOP_N = 11; // Ranking Negociações < 11
/** Valor do filtro "Sem cluster". */
export const SEM_CLUSTER = "__sem_cluster__";
const MOTIVO_IGNORADO = "suspenso";

const nz = (n: number): number | null => (n === 0 ? null : n); // COUNTROWS de tabela vazia é BLANK
const soma = (s: number, n: number): number | null => (n === 0 ? null : s); // SUM sem nenhum valor é BLANK
export const add = (a: number | null, b: number | null): number | null => (a === null && b === null ? null : (a || 0) + (b || 0));
export const sub = (a: number | null, b: number | null): number | null => (a === null && b === null ? null : (a || 0) - (b || 0));

/** Reais a partir de milésimos de centavo. */
export const reais = (v: number | null): number | null => (v === null ? null : v / 10000);

/**
 * Todas as medidas do relatório para um conjunto de atividades `a` e de desdobros `d` já filtrados pelo contexto.
 */
export function medidas(a: readonly Atividade[], d: readonly Desdobro[]): Medidas {
  let pN = 0;
  let pS = 0;
  let pV = 0;
  let pA = 0; // arrecadado das negociações principais
  for (const r of a) {
    if (!r.cob || !r.sim) continue; // Categoria 12 = COBRANÇA e Negociou O Débito? = SIM
    pN++;
    pA += r.arr;
    if (r.val !== null) {
      pS += r.val;
      pV++;
    }
  }
  // por código (0 = 107002, 1 = 207002) e categoria principal (0 todas, 1 corte, 2 pós corte)
  const cnt = [[0, 0, 0], [0, 0, 0]];
  const sum = [[0, 0, 0], [0, 0, 0]];
  const nv = [[0, 0, 0], [0, 0, 0]];
  const arr = [[0, 0, 0], [0, 0, 0]]; // arrecadado, nos mesmos recortes
  let cad = 0;
  const acumula = (i: number, j: number, x: Desdobro): void => {
    cnt[i][j]++;
    arr[i][j] += x.arr;
    if (x.val !== null) {
      sum[i][j] += x.val;
      nv[i][j]++;
    }
  };
  for (const x of d) {
    if (x.i >= 0) {
      acumula(x.i, 0, x);
      if (x.k === K_CORTE) acumula(x.i, 1, x);
      else if (x.k === K_POS) acumula(x.i, 2, x);
    } else if (x.cad && (x.k === K_COBRANCA || x.k === K_CORTE)) cad++;
  }
  const contar = (j: number): number | null => add(nz(cnt[0][j]), nz(cnt[1][j]));
  const somar = (j: number): number | null => add(soma(sum[0][j], nv[0][j]), soma(sum[1][j], nv[1][j]));
  const arrecadar = (j: number): number | null => add(soma(arr[0][j], cnt[0][j]), soma(arr[1][j], cnt[1][j])); // BLANK só sem negociações
  const principal = nz(pN);
  const negDesdobro = contar(0); // Neegociação Desdobro
  const corte = contar(1);
  const pos = contar(2);
  const valPrincipal = soma(pS, pV);
  const valCorte = somar(1);
  const valPos = somar(2);
  const valDesdobro = sub(sub(somar(0), valPos), valCorte); // Negocição $ Desdobro
  // Arrecadado real: a mesma conta dos valores negociados, sobre o que foi pago de cada negociação
  const arrPrincipal = soma(pA, pN);
  const arrCorte = arrecadar(1);
  const arrPos = arrecadar(2);
  const arrDesdobro = sub(sub(arrecadar(0), arrPos), arrCorte);
  return {
    principal,
    cadastro: nz(cad),
    corte,
    desdobro: sub(sub(negDesdobro, corte), pos), // Desdobro Negociação Serv.
    pos,
    total: add(principal, negDesdobro),
    valPrincipal,
    valCorte,
    valDesdobro,
    valPos,
    valTotal: add(add(add(valDesdobro, valPos), valCorte), valPrincipal),
    arrPrincipal,
    arrCorte,
    arrDesdobro,
    arrPos,
    arrTotal: add(add(add(arrDesdobro, arrPos), arrCorte), arrPrincipal),
  };
}

const vazia = (m: Medidas): boolean => m.total === null && m.valTotal === null;

function passaA(r: Atividade, f: Filtros): boolean {
  if (f.mes && r.mes !== f.mes) return false;
  if (f.data && r.data !== f.data) return false;
  if (f.frente && r.setor !== f.frente) return false;
  if (f.cluster && (f.cluster === SEM_CLUSTER ? r.cl !== "" : r.cl !== f.cluster)) return false;
  return true;
}
const passaD = (x: Desdobro, f: Filtros): boolean => (!f.mes || x.mes === f.mes) && (!f.data || x.data === f.data);

type PorMatricula = Map<string, Desdobro[]>;

/** Desdobros de um conjunto de atividades: ligados pela matrícula (relação muitos-para-muitos), cada um uma vez. */
function desdobrosDe(mats: Iterable<string>, porMat: PorMatricula): Desdobro[] {
  const out: Desdobro[] = [];
  for (const m of mats) {
    const l = porMat.get(m);
    if (l) for (const x of l) out.push(x);
  }
  return out;
}

interface Grupo {
  a: Atividade[];
  mats: Set<string>;
}

function agrupar(linhas: readonly Atividade[], chaveFn: (r: Atividade) => string): Map<string, Grupo> {
  const g = new Map<string, Grupo>();
  for (const r of linhas) {
    const k = chaveFn(r);
    let e = g.get(k);
    if (!e) {
      e = { a: [], mats: new Set() };
      g.set(k, e);
    }
    e.a.push(r);
    e.mats.add(r.mat);
  }
  return g;
}

function mapaPorMat(d: readonly Desdobro[]): PorMatricula {
  const m: PorMatricula = new Map();
  for (const x of d) {
    const l = m.get(x.mat);
    if (l) l.push(x);
    else m.set(x.mat, [x]);
  }
  return m;
}

/** Ordem das linhas: mais negociações, depois mais valor, depois pelo nome. */
const porTotal =
  <T extends { m: Medidas }>(rotulo: (v: T) => string) =>
  (x: T, y: T): number =>
    (y.m.total || 0) - (x.m.total || 0) || (y.m.valTotal || 0) - (x.m.valTotal || 0) || rotulo(x).localeCompare(rotulo(y), "pt-BR");

export interface ItemRanking {
  /** total*0,15 + valor*0,0000001 (BLANK = null). */
  criterio: number | null;
  /** Data (AAAA-MM-DD) da negociação mais recente do item; vazio se não houver. */
  ultima: string;
  rotulo: string;
}

/**
 * Ranking Negociações, decrescente sobre o critério do Power BI (total*0,15 + valor*0,0000001), mas com desempate
 * (pedido do usuário, 16/10/2026: no Power BI os empatados dividem a posição e o Top 10 passava de 10 linhas).
 * Empatou o critério (mesma quantidade e mesmo valor): vale quem negociou por último; ainda empatado, o nome do
 * recurso (A a Z). Devolve a posição 1..n de cada item, sem repetir; item sem critério (BLANK) fica no fim.
 */
export function posicoesDoRanking(itens: ItemRanking[]): number[] {
  const c = (v: number | null): number => (v === null ? -Infinity : v);
  const ordem = itens.map((_, i) => i).sort((a, b) => {
    const x = itens[a];
    const y = itens[b];
    if (c(x.criterio) !== c(y.criterio)) return c(y.criterio) > c(x.criterio) ? 1 : -1;
    if (x.ultima !== y.ultima) return x.ultima < y.ultima ? 1 : -1;
    return x.rotulo.localeCompare(y.rotulo, "pt-BR");
  });
  const pos = new Array<number>(itens.length);
  ordem.forEach((i, k) => (pos[i] = k + 1));
  return pos;
}

/** Data da negociação principal mais recente (cobrança com Negociou = SIM). */
const ultimaNegociacao = (as: Atividade[]): string => as.reduce((m, a) => (a.cob && a.sim && a.data > m ? a.data : m), "");

/**
 * Calcula tudo o que o painel mostra para os filtros (mes, data, frente, cluster).
 *
 * O desdobro só é amarrado à matrícula das atividades quando há filtro de atividade (frente, cluster,
 * grupo de linha, setor Comercial...); só com Data/Mês ele vale por inteiro, como nos cartões do Power BI.
 */
export function calcular(modelo: Modelo, f: Partial<Filtros> = {}): Visao {
  const filtros: Filtros = { mes: "", data: "", frente: "", cluster: "", ...f };
  const A0 = modelo.A.filter((r) => passaA(r, filtros));
  const D0 = modelo.D.filter((x) => passaD(x, filtros));
  const porMat = mapaPorMat(D0);
  const ligar0 = !!(filtros.frente || filtros.cluster);

  // Cartões
  const cards = medidas(A0, ligar0 ? desdobrosDe(new Set(A0.map((r) => r.mat)), porMat) : D0);

  // Negociações Comercial: cluster > frente de serviço > recurso; só setor Comercial e sem Manutenção
  const Ac = A0.filter((r) => r.sCom && !r.man);
  const nos = (
    linhas: readonly Atividade[],
    chaveFn: (r: Atividade) => string,
    nivel: number,
    idPai: string,
    rotuloFn: (k: string) => string,
    filhosFn?: (ls: Atividade[], id: string) => NoArvore[]
  ): NoArvore[] => {
    const out: NoArvore[] = [];
    for (const [k, g] of agrupar(linhas, chaveFn)) {
      const id = idPai + "/" + k;
      const no: NoArvore = {
        id,
        nivel,
        rotulo: rotuloFn(k),
        m: medidas(g.a, desdobrosDe(g.mats, porMat)),
        filhos: filhosFn ? filhosFn(g.a, id) : [],
      };
      if (!vazia(no.m)) out.push(no);
    }
    return out.sort(porTotal<NoArvore>((n) => n.rotulo));
  };
  const comercial = {
    linhas: nos(Ac, (r) => r.cl, 0, "c", (k) => k || "(sem cluster)", (ls, id) =>
      nos(ls, (r) => r.setor, 1, id, (k) => k, (ls2, id2) => nos(ls2, (r) => r.rec, 2, id2, (k) => k))
    ),
    total: medidas(Ac, desdobrosDe(new Set(Ac.map((r) => r.mat)), porMat)),
  };

  // Top 10 Negociações: recurso, só setor Comercial, sem os recursos da lista de exclusão
  const excl = new Set(EXCLUIDOS_TOP10.map(chave));
  const At = A0.filter((r) => r.sCom && !excl.has(chave(r.rec)));
  const reg = [...agrupar(At, (r) => r.rec)].map(([rec, g]) => ({ rec, g, m: medidas(g.a, desdobrosDe(g.mats, porMat)), top: 0, ultima: ultimaNegociacao(g.a) }));
  const crit = reg.map((r) => add(r.m.total === null ? null : r.m.total * 0.15, r.m.valTotal === null ? null : (r.m.valTotal / 10000) * 0.0000001));
  const rank = posicoesDoRanking(reg.map((r, i) => ({ criterio: crit[i], ultima: r.ultima, rotulo: r.rec })));
  reg.forEach((r, i) => (r.top = rank[i]));
  const visiveis = reg.filter((r) => r.top < TOP_N && (r.m.total || 0) > 0);
  visiveis.sort((x, y) => x.top - y.top); // posições únicas: a tabela segue o ranking
  const matsTop = new Set<string>();
  const aTop: Atividade[] = [];
  for (const r of visiveis) {
    for (const a of r.g.a) {
      aTop.push(a);
      matsTop.add(a.mat);
    }
  }
  const top10 = {
    linhas: visiveis.map((r): LinhaTop => ({ rotulo: r.rec, top: r.top, m: r.m })),
    total: medidas(aTop, desdobrosDe(matsTop, porMat)),
  };

  // Negociação x Cidade: sem outros filtros; o total não traz filtro de atividade (por isso pode passar da soma das cidades)
  const cidades: Array<{ rotulo: string; m: Medidas }> = [];
  for (const [cid, g] of agrupar(A0, (r) => r.cidade)) {
    const m = medidas(g.a, desdobrosDe(g.mats, porMat));
    if (!vazia(m)) cidades.push({ rotulo: cid || "(em branco)", m });
  }
  // Com arrecadação o gráfico mostra o arrecadado nas colunas: a ordem acompanha (maior primeiro); sem ela, o negociado.
  const temArr = modelo.arrecadacao !== null;
  const valorDe = (m: Medidas): number => (temArr ? m.arrTotal : m.valTotal) || 0;
  cidades.sort((x, y) => valorDe(y.m) - valorDe(x.m) || (y.m.valTotal || 0) - (x.m.valTotal || 0) || (y.m.total || 0) - (x.m.total || 0) || x.rotulo.localeCompare(y.rotulo, "pt-BR"));

  // Motivo da não Execução: cobrança sem negociação, por motivo (menos vazio e SUSPENSO)
  const mot = new Map<string, number>();
  for (const r of A0) {
    if (!r.mot || chave(r.mot) === MOTIVO_IGNORADO || !r.cob || r.sim) continue;
    mot.set(r.mot, (mot.get(r.mot) || 0) + 1);
  }
  const motivos = [...mot]
    .map(([rotulo, qtd]) => ({ rotulo, qtd }))
    .sort((x, y) => y.qtd - x.qtd || x.rotulo.localeCompare(y.rotulo, "pt-BR"));

  return { temArr, cards, comercial, top10, cidades: { linhas: cidades, total: cards }, motivos };
}
