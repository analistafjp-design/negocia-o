// Mensagens de status da leitura da pasta, em português do Brasil.
import { fmtQtd, plural } from "./formato.ts";
import type { RelatorioCarga } from "./fontes.ts";

export type TipoAviso = "info" | "success" | "warning" | "error";

export interface Aviso {
  kind: TipoAviso;
  title: string;
  detail?: string;
  items?: string[];
  /** 0..1: mostra a barra de progresso. */
  progress?: number;
  actions?: Array<{ label: string; run: () => void }>;
}

export function mensagemDaCarga(rel: RelatorioCarga, o: { auto: boolean; fonte: string; temModeloAnterior: boolean }): Aviso | null {
  const manteve = o.temModeloAnterior ? " A base anterior foi mantida." : "";
  if (rel.semXlsx) {
    return {
      kind: "warning",
      title: "Nenhum arquivo .xlsx encontrado",
      detail:
        (o.fonte ? "Fonte: " + o.fonte + ". " : "") +
        "Coloque na pasta os arquivos de atividades e o arquivo Cluster_ (.xlsx). Subpastas são lidas; arquivos ~$ temporários são ignorados." +
        manteve,
      items: rel.ignoradosFormato.map((p) => "Formato não suportado (salve como .xlsx): " + p),
    };
  }
  if (rel.semMudanca) return null;
  if (rel.semAtividades || !rel.modelo) {
    return {
      kind: "error",
      title: "Nenhum arquivo de atividades foi carregado",
      detail:
        (o.temModeloAnterior ? "A base anterior foi mantida na tela. " : "") +
        "O painel precisa de arquivos com as colunas Recurso, Matrícula, Código/Descrição, Data, Negociou O Débito?, Valor Total dos Débitos e Body Adicional Executado.",
      items: rel.falhas.map((f) => f.path + " — " + f.motivo).concat(rel.ignorados.map((r) => (r.path ?? "") + " — " + r.motivo)),
    };
  }

  const r = rel.modelo.resumo;
  const itens: string[] = [];
  rel.falhas.forEach((f) => itens.push("Não importado: " + f.path + " — " + f.motivo));
  rel.ignoradosFormato.forEach((p) => itens.push("Ignorado (formato não suportado, salve como .xlsx): " + p));
  rel.ignorados.forEach((x) => itens.push("Ignorado (não é de atividades nem Cluster): " + (x.path ?? "")));
  rel.atividades.forEach((a) => a.avisos.forEach((t) => itens.push((a.name ?? "") + ": " + t)));
  if (!rel.clusters.length) itens.push('Nenhum arquivo Cluster_ encontrado: todas as negociações aparecem como "(sem cluster)".');
  if (r.descartadasSemSetor) {
    const top = r.recursosSemSetor.slice(0, 4).map((x) => x.recurso + " (" + fmtQtd(x.linhas) + ")").join(", ");
    itens.push(
      fmtQtd(r.descartadasSemSetor) + " " + plural(r.descartadasSemSetor, "atividade", "atividades") + " de recursos sem setor no cadastro de recursos " +
        plural(r.descartadasSemSetor, "ficou", "ficaram") + " de fora, como no Power BI (a tabela de desdobros não tem esse corte): " + top +
        (r.recursosSemSetor.length > 4 ? "…" : "") + "."
    );
  }
  if (r.idsRepetidos) {
    itens.push(
      fmtQtd(r.idsRepetidos) + " " + plural(r.idsRepetidos, "atividade repetida", "atividades repetidas") +
        " (mesmo ID da Atividade em mais de uma linha ou arquivo): contadas em duplicidade, como no Power BI. Se os arquivos se sobrepõem, deixe só o mais recente na pasta."
    );
  }
  if (r.semCodigoConhecido) {
    itens.push(
      fmtQtd(r.semCodigoConhecido) + " " + plural(r.semCodigoConhecido, "atividade com código", "atividades com código") +
        " de serviço fora da tabela de códigos: não contam como cobrança."
    );
  }
  return {
    kind: itens.length ? "warning" : "success",
    title:
      (o.auto ? "Pasta atualizada: " : "Base carregada: ") + fmtQtd(r.atividades) + " " + plural(r.atividades, "atividade", "atividades") + " e " +
      fmtQtd(r.desdobros) + " " + plural(r.desdobros, "desdobro", "desdobros") + " de " + r.arquivos + " " + plural(r.arquivos, "arquivo", "arquivos"),
    detail:
      "Cluster: " + fmtQtd(r.clusterMatriculas) + " " + plural(r.clusterMatriculas, "matrícula", "matrículas") + " de " + r.arquivosCluster + " " +
      plural(r.arquivosCluster, "arquivo", "arquivos") + ". Lidos do arquivo agora: " + rel.leitura.lidos + " · reaproveitados: " + rel.leitura.reaproveitados + ".",
    items: itens,
  };
}
