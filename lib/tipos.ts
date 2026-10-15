// Tipos do painel de Negociações.
//
// Valores em dinheiro ficam em milésimos de centavo (4 casas, como o Currency.Type do Power BI):
// a soma é exata. Use `reais()` para mostrar. BLANK do DAX é `null`.

/** Uma atividade como vem do arquivo (só as colunas usadas). */
export interface AtividadeLida {
  id: string;
  recurso: string;
  mat: string;
  codigo: string;
  data: string; // aaaa-mm-dd, ou vazio
  cidade: string;
  mn: string; // Motivo de Não Execução - Normal
  mc: string; // Motivo de Não Execução - Cobrança
  neg: string; // Negociou O Débito?
  val: number | null;
}

/** Um desdobro: item do "Body Adicional Executado" de uma atividade, com os dados dela. */
export interface DesdobroLido {
  mat: string;
  data: string;
  recurso: string;
  codigo: string; // Código/Descrição da atividade de origem
  cod: string; // código do serviço executado no desdobro
  val: number | null;
}

export interface EstatisticasLeitura {
  linhas: number;
  vazias: number;
  semData: number;
  dataInvalida: number;
  valorInvalido: number;
  jsonInvalido: number;
}

/** Identificação do arquivo de origem, preenchida por quem lê a pasta. */
export interface OrigemArquivo {
  path?: string;
  name?: string;
  size?: number;
  lastModified?: number;
}

export interface ResultadoAtividades extends OrigemArquivo {
  tipo: "atividades";
  aba: string;
  atividades: AtividadeLida[];
  desdobros: DesdobroLido[];
  stats: EstatisticasLeitura;
  avisos: string[];
}
export interface ResultadoCluster extends OrigemArquivo {
  tipo: "cluster";
  aba: string;
  pares: Array<[string, string]>; // [matrícula, cluster]
  duplicadas: number;
  avisos: string[];
}
export interface ResultadoIgnorado extends OrigemArquivo {
  tipo: "ignorado";
  motivo: string;
}
export type ResultadoArquivo = ResultadoAtividades | ResultadoCluster | ResultadoIgnorado;

/** Atividade já ligada às tabelas de apoio (f_Atividade do relatório). */
export interface Atividade {
  rec: string;
  mat: string;
  setor: string; // Setor do Recurso (frente de serviço)
  cob: boolean; // Categoria 12 = COBRANÇA
  sCom: boolean; // setor do serviço = COMERCIAL
  man: boolean; // Setor do Recurso = Manutenção
  sim: boolean; // Negociou O Débito? = SIM
  data: string;
  mes: string;
  cidade: string;
  mot: string; // Motivo não Execução
  val: number | null;
  cl: string; // CLUSTER SALDO ("" = sem cluster)
}

/** Desdobro já ligado às tabelas de apoio (f_Atividade Desdobro do relatório). */
export interface Desdobro {
  mat: string;
  data: string;
  mes: string;
  i: 0 | 1 | -1; // 0 = 107002, 1 = 207002, -1 = outro código
  cad: boolean; // código do Cadastro Desdobro
  k: number; // Categoria Principal: 0 outra, 1 corte, 2 pós corte, 3 cobrança
  val: number | null;
}

export interface Opcoes {
  frentes: string[];
  clusters: string[];
  temSemCluster: boolean;
  meses: string[];
  datas: string[];
}

export interface Resumo {
  arquivos: number;
  arquivosCluster: number;
  linhas: number;
  atividades: number;
  desdobros: number;
  clusterMatriculas: number;
  descartadasSemSetor: number;
  recursosSemSetor: Array<{ recurso: string; linhas: number }>;
  idsRepetidos: number;
  semCodigoConhecido: number;
}

export interface Modelo {
  A: Atividade[];
  D: Desdobro[];
  opcoes: Opcoes;
  resumo: Resumo;
}

export interface Filtros {
  mes: string; // aaaa-mm
  data: string; // aaaa-mm-dd
  frente: string;
  cluster: string; // nome, SEM_CLUSTER ou vazio
}

/** As medidas do relatório (BLANK = null). */
export interface Medidas {
  principal: number | null;
  cadastro: number | null;
  corte: number | null;
  desdobro: number | null;
  pos: number | null;
  total: number | null;
  valPrincipal: number | null;
  valCorte: number | null;
  valDesdobro: number | null;
  valPos: number | null;
  valTotal: number | null;
}

export interface NoArvore {
  id: string;
  nivel: number;
  rotulo: string;
  m: Medidas;
  filhos: NoArvore[];
}
export interface LinhaTop {
  rotulo: string;
  top: number;
  m: Medidas;
}
export interface LinhaCidade {
  rotulo: string;
  m: Medidas;
}
export interface LinhaMotivo {
  rotulo: string;
  qtd: number;
}

export interface Visao {
  cards: Medidas;
  comercial: { linhas: NoArvore[]; total: Medidas };
  top10: { linhas: LinhaTop[]; total: Medidas };
  cidades: { linhas: LinhaCidade[]; total: Medidas };
  motivos: LinhaMotivo[];
}
