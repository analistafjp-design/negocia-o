// Liga os pagamentos de parcela (arquivos de arrecadação) às negociações executadas, pela matrícula.
//
// Regra (pedido do usuário, 16/10/2026): só parcelas quitadas; o pagamento conta para uma negociação da MESMA
// matrícula feita até a data do pagamento (pagamento no dia da negociação ou depois); cada pagamento conta uma
// única vez. Havendo mais de uma negociação anterior, vale a mais recente (a que estava em vigor no pagamento);
// se várias foram no mesmo dia (a principal e os desdobros), o pagamento se divide entre elas na proporção do
// valor negociado de cada uma (em partes iguais quando nenhuma tem valor). Pagamento sem negociação anterior da
// matrícula não entra em nenhum número do painel; fica só no resumo (`semNegociacao`).
import type { Atividade, Desdobro, PagamentoLido, ResultadoArrecadacao, ResumoArrecadacao } from "./tipos.ts";

interface Item {
  data: string;
  peso: number;
  alvo: { arr: number };
}

/** Divide `val` (milésimos de centavo) entre os itens, sem perder nem criar nem um milésimo. */
function repartir(val: number, itens: Item[]): void {
  if (itens.length === 1) {
    itens[0].alvo.arr += val;
    return;
  }
  let total = 0;
  for (const i of itens) total += i.peso;
  let usado = 0;
  for (let k = 0; k < itens.length; k++) {
    const parte = k === itens.length - 1 ? val - usado : Math.round(total > 0 ? (val * itens[k].peso) / total : val / itens.length);
    itens[k].alvo.arr += parte;
    usado += parte;
  }
}

/**
 * Soma em `arr` de cada negociação o que foi pago depois dela. Altera `A` e `D` e devolve o resumo da ligação.
 * Negociação = atividade de cobrança com Negociou O Débito? = SIM, ou desdobro de negociação (107002/207002), com data.
 * O mesmo pagamento em mais de um arquivo (a diária repete o que a acumulada já traz) vale uma vez; repetição dentro
 * de um mesmo arquivo é pagamento diferente e vale cada uma.
 */
export function ligarArrecadacao(A: Atividade[], D: Desdobro[], arquivos: ResultadoArrecadacao[]): ResumoArrecadacao {
  const unicos = new Map<string, { p: PagamentoLido; n: number }>();
  let linhas = 0;
  let lidos = 0;
  let primeira = "";
  let ultima = "";
  for (const f of arquivos) {
    linhas += f.stats.linhas;
    if (f.stats.primeira && (!primeira || f.stats.primeira < primeira)) primeira = f.stats.primeira;
    if (f.stats.ultima > ultima) ultima = f.stats.ultima;
    const local = new Map<string, number>();
    for (const p of f.pagamentos) {
      lidos++;
      const k = p[0] + "|" + p[1] + "|" + p[2] + "|" + p[3];
      const n = (local.get(k) || 0) + 1;
      local.set(k, n);
      const g = unicos.get(k);
      if (!g) unicos.set(k, { p, n: 1 });
      else if (n > g.n) g.n = n; // vale a maior contagem em um único arquivo
    }
  }

  const porMat = new Map<string, Array<[string, number]>>(); // matrícula -> [data, valor]
  let pagamentos = 0;
  let valor = 0;
  for (const { p, n } of unicos.values()) {
    let l = porMat.get(p[0]);
    if (!l) porMat.set(p[0], (l = []));
    for (let i = 0; i < n; i++) {
      l.push([p[1], p[2]]);
      pagamentos++;
      valor += p[2];
    }
  }

  const itens = new Map<string, Item[]>();
  const guarda = (mat: string, data: string, val: number | null, alvo: { arr: number }): void => {
    if (!data || !porMat.has(mat)) return;
    const it: Item = { data, peso: Math.max(0, val ?? 0), alvo };
    const l = itens.get(mat);
    if (l) l.push(it);
    else itens.set(mat, [it]);
  };
  for (const a of A) if (a.cob && a.sim) guarda(a.mat, a.data, a.val, a);
  for (const d of D) if (d.i >= 0) guarda(d.mat, d.data, d.val, d);

  let ligados = 0;
  let valorLigado = 0;
  for (const [mat, pags] of porMat) {
    const its = itens.get(mat);
    if (!its) continue;
    its.sort((x, y) => (x.data < y.data ? -1 : x.data > y.data ? 1 : 0));
    pags.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
    let k = 0; // negociações com data até o pagamento
    for (const [data, val] of pags) {
      while (k < its.length && its[k].data <= data) k++;
      if (k === 0) continue;
      let s = k - 1;
      while (s > 0 && its[s - 1].data === its[k - 1].data) s--;
      repartir(val, its.slice(s, k));
      ligados++;
      valorLigado += val;
    }
  }
  return {
    arquivos: arquivos.length,
    linhas,
    pagamentos,
    valor,
    repetidos: lidos - pagamentos,
    ligados,
    valorLigado,
    semNegociacao: pagamentos - ligados,
    valorSemNegociacao: valor - valorLigado,
    primeira,
    ultima,
  };
}
