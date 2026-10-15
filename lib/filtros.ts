// Regras dos filtros do painel (Frente de serviço, Cluster, Mês/ano e Data).
import { SEM_CLUSTER } from "./medidas.ts";
import type { Filtros, Opcoes } from "./tipos.ts";

export const FILTROS_VAZIOS: Filtros = { mes: "", data: "", frente: "", cluster: "" };

/**
 * Mantém só os filtros que ainda existem nos dados. Na primeira carga (`inicial`) e sem mês escolhido,
 * usa o mês mais recente: o painel é o acumulado do mês.
 */
export function sanitizarFiltros(f: Filtros, o: Opcoes, inicial: boolean): Filtros {
  const r: Filtros = { ...f };
  if (r.frente && !o.frentes.includes(r.frente)) r.frente = "";
  if (r.cluster === SEM_CLUSTER ? !o.temSemCluster : r.cluster && !o.clusters.includes(r.cluster)) r.cluster = "";
  if (r.mes && !o.meses.includes(r.mes)) r.mes = "";
  if (inicial && !r.mes && o.meses.length) r.mes = o.meses[o.meses.length - 1];
  if (r.data && (!o.datas.includes(r.data) || (r.mes && r.data.slice(0, 7) !== r.mes))) r.data = "";
  return r;
}

/** Datas que podem ser escolhidas: as do mês selecionado (ou todas, sem mês). */
export const datasDisponiveis = (o: Opcoes, mes: string): string[] => o.datas.filter((d) => !mes || d.slice(0, 7) === mes);
