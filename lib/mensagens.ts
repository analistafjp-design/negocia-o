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

/** Até 3 nomes (sem o caminho das subpastas) e "e mais N". */
function nomesIgnorados(caminhos: string[]): string {
  const nomes = caminhos.map((c) => c.slice(c.lastIndexOf("/") + 1));
  return nomes.slice(0, 3).join(", ") + (nomes.length > 3 ? " e mais " + (nomes.length - 3) : "");
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
  if (rel.semArquivosDoPainel) {
    return {
      kind: "warning",
      title: "Nenhum arquivo de Atividades ou Cluster_ na pasta",
      detail:
        (o.fonte ? "Fonte: " + o.fonte + ". " : "") +
        'Na pasta só são lidos os .xlsx com "Atividade" ou "Cluster" no nome (como no Power BI). Ignorados: ' + nomesIgnorados(rel.ignoradosPorNome) + "." + manteve,
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

  // Só o que pede uma ação do usuário aparece na tela. O resumo da leitura e as observações do Power BI
  // (recursos sem setor, atividades repetidas, JSON fora do formato…) ficam em "Detalhes da leitura", no rodapé.
  const { problemas } = analisar(rel);
  if (!problemas.length) return null;
  return { kind: "warning", title: "Atenção na leitura", detail: "A base foi carregada. Confira o que segue.", items: problemas };
}

/** O que o rodapé guarda em "Detalhes da leitura": o resumo e todas as observações da leitura. */
export interface Detalhes {
  titulo: string;
  detalhe: string;
  itens: string[];
}

export function detalhesDaCarga(rel: RelatorioCarga, o: { auto: boolean }): Detalhes | null {
  if (!rel.modelo) return null;
  const r = rel.modelo.resumo;
  const { problemas, notas } = analisar(rel);
  return {
    titulo:
      (o.auto ? "Pasta atualizada: " : "Base carregada: ") + fmtQtd(r.atividades) + " " + plural(r.atividades, "atividade", "atividades") + " e " +
      fmtQtd(r.desdobros) + " " + plural(r.desdobros, "desdobro", "desdobros") + " de " + r.arquivos + " " + plural(r.arquivos, "arquivo", "arquivos"),
    detalhe:
      "Cluster: " + fmtQtd(r.clusterMatriculas) + " " + plural(r.clusterMatriculas, "matrícula", "matrículas") + " de " + r.arquivosCluster + " " +
      plural(r.arquivosCluster, "arquivo", "arquivos") + ". Lidos do arquivo agora: " + rel.leitura.lidos + " · reaproveitados: " + rel.leitura.reaproveitados + "." +
      (rel.ignoradosPorNome.length
        ? ' Ignorados (sem "Atividade" nem "Cluster" no nome): ' + nomesIgnorados(rel.ignoradosPorNome) + "."
        : ""),
    itens: [...problemas, ...notas],
  };
}

/**
 * Separa o que a leitura achou: `problemas` pedem uma ação (arquivo que falhou, formato não aceito, arquivo que não é do
 * painel, falta do Cluster, coluna opcional ausente); `notas` são só informação (regras do Power BI e qualidade das linhas).
 */
function analisar(rel: RelatorioCarga): { problemas: string[]; notas: string[] } {
  const problemas: string[] = [];
  const notas: string[] = [];
  if (!rel.modelo) return { problemas, notas };
  const r = rel.modelo.resumo;
  rel.falhas.forEach((f) => problemas.push("Não importado: " + f.path + " — " + f.motivo));
  rel.ignoradosFormato.forEach((p) => problemas.push("Ignorado (formato não suportado, salve como .xlsx): " + p));
  rel.ignorados.forEach((x) => problemas.push("Ignorado (não é de atividades nem Cluster): " + (x.path ?? "")));
  rel.atividades.forEach((a) =>
    a.avisos.forEach((t) => (/^Coluna "/.test(t) ? problemas : notas).push((a.name ?? "") + ": " + t))
  );
  if (!rel.clusters.length) problemas.push('Nenhum arquivo Cluster_ encontrado: todas as negociações aparecem como "(sem cluster)".');
  if (r.descartadasSemSetor) {
    const top = r.recursosSemSetor.slice(0, 4).map((x) => x.recurso + " (" + fmtQtd(x.linhas) + ")").join(", ");
    notas.push(
      fmtQtd(r.descartadasSemSetor) + " " + plural(r.descartadasSemSetor, "atividade", "atividades") + " de recursos sem setor no cadastro de recursos " +
        plural(r.descartadasSemSetor, "ficou", "ficaram") + " de fora, como no Power BI (a tabela de desdobros não tem esse corte): " + top +
        (r.recursosSemSetor.length > 4 ? "…" : "") + "."
    );
  }
  if (r.idsRepetidos) {
    notas.push(
      fmtQtd(r.idsRepetidos) + " " + plural(r.idsRepetidos, "atividade repetida", "atividades repetidas") +
        " (mesmo ID da Atividade em mais de uma linha ou arquivo): contadas em duplicidade, como no Power BI. Se os arquivos se sobrepõem, deixe só o mais recente na pasta."
    );
  }
  if (r.semCodigoConhecido) {
    notas.push(
      fmtQtd(r.semCodigoConhecido) + " " + plural(r.semCodigoConhecido, "atividade com código", "atividades com código") +
        " de serviço fora da tabela de códigos: não contam como cobrança."
    );
  }
  return { problemas, notas };
}
