// Leitura dos arquivos .xlsx da pasta: atividades (aba "Page 1") e Cluster_ (aba "Planilha1").
// Reconhece cada arquivo pelas colunas; o nome do arquivo só ajuda na escolha da aba.
import { isoDate, parseDateValue, parseValor, type TipoCelula } from "./valores.ts";
import { NegError, openWorkbook, scanSheet, type Aba, type ArquivoLido, type Contexto, type Planilha } from "./xlsx-reader.ts";
import type {
  AtividadeLida,
  DesdobroLido,
  EstatisticasLeitura,
  ResultadoArquivo,
  ResultadoAtividades,
  ResultadoCluster,
  RegistroLeitura,
} from "./tipos.ts";

export { NegError };

/** Versão das regras de leitura; muda quando o resultado gravado de um arquivo deixa de valer. */
export const PARSER_VERSION = 1;

const stripAccents = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
export const normHeader = (v: unknown): string =>
  stripAccents(String(v == null ? "" : v)).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const trimStr = (v: unknown): string => (v == null ? "" : String(v).trim());
/** Chave de comparação de texto: o DAX não diferencia maiúsculas de minúsculas. */
export const chave = (v: unknown): string => trimStr(v).toLowerCase();

/** Códigos de desdobro que contam como negociação (107002 e 207002) e os do Cadastro Desdobro. */
export const COD_NEGOCIACAO = ["107002", "207002"] as const;
export const COD_CADASTRO = ["202002", "102002", "202004", "102004"] as const;
/** Só esses códigos de desdobro entram nas medidas; os demais não são guardados. */
const CODIGOS_DESDOBRO = new Set<string>([...COD_NEGOCIACAO, ...COD_CADASTRO]);

interface Campo {
  key: string;
  header: string;
  req?: boolean; // sem essa coluna as medidas ficariam erradas: o arquivo é recusado e a mensagem diz qual falta
}

const CAMPOS_ATV: Campo[] = [
  { key: "recurso", header: "Recurso", req: true },
  { key: "id", header: "ID da Atividade" },
  { key: "matricula", header: "Matrícula", req: true },
  { key: "codigo", header: "Código/Descrição", req: true },
  { key: "data", header: "Data", req: true },
  { key: "cidade", header: "Cidade" },
  { key: "motivoN", header: "Motivo de Não Execução - Normal" },
  { key: "motivoC", header: "Motivo de Não Execução - Cobrança" },
  { key: "negociou", header: "Negociou O Débito?", req: true },
  { key: "valor", header: "Valor Total dos Débitos", req: true },
  { key: "body", header: "Body Adicional Executado", req: true },
];
const CAMPOS_CLUSTER: Campo[] = [
  { key: "matricula", header: "NUM_LIGACAO", req: true },
  { key: "cluster", header: "CLUSTER SALDO", req: true },
];
const mapaCampos = (campos: Campo[]): Map<string, number> => new Map(campos.map((c, i): [string, number] => [normHeader(c.header), i]));
const MAPA_ATV = mapaCampos(CAMPOS_ATV);
const MAPA_CLUSTER = mapaCampos(CAMPOS_CLUSTER);
const FI: Record<string, number> = {};
CAMPOS_ATV.forEach((c, i) => (FI[c.key] = i));

const MIN_CAMPOS_ATV = 5; // colunas esperadas que precisam aparecer para reconhecer o cabeçalho de atividades
const MAX_LINHAS_CABECALHO = 30;

/** Procura as colunas esperadas em uma linha de cabeçalho: campo -> coluna (a primeira repetição vale). */
function acharCampos(n: number, cols: number[], vals: string[], mapa: Map<string, number>): Map<number, number> {
  const found = new Map<number, number>();
  for (let j = 0; j < n; j++) {
    const fi = mapa.get(normHeader(vals[j]));
    if (fi !== undefined && !found.has(fi)) found.set(fi, cols[j]);
  }
  return found;
}

/** Valor em milésimos de centavo (4 casas, como o Currency.Type do Power BI): a soma fica exata. */
export const paraFixo = (v: number): number => Math.round(v * 10000);

/** Matrícula como texto de dígitos: 12345.0, 012345 e 12345 são a mesma (no Power BI é número inteiro). */
export function matriculaTexto(v: unknown): string {
  const t = trimStr(v).replace(/^(\d+)\.0+$/, "$1");
  return /^\d+$/.test(t) ? t.replace(/^0+(?=\d)/, "") : t;
}

/** Códigos de serviço do "Body Adicional Executado" (JSON): uma lista de registros, cada um com cadServicoDefinicaoExecutado. */
export function codigosDoBody(texto: string): { cods: string[]; erro: boolean } {
  const cods: string[] = [];
  try {
    const j: unknown = JSON.parse(texto);
    for (const e of Array.isArray(j) ? j : [j]) {
      if (e && typeof e === "object") {
        const cod = (e as Record<string, unknown>).cadServicoDefinicaoExecutado;
        if (cod != null) cods.push(String(cod).trim());
      }
    }
    return { cods, erro: false };
  } catch {
    // JSON quebrado: ainda dá para achar os códigos pelo nome do campo
    const re = /"cadServicoDefinicaoExecutado"\s*:\s*"?\s*([^",}\s\]]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(texto))) cods.push(m[1]);
    return { cods, erro: true };
  }
}

/** Descobre se a aba é de atividades ou de Cluster olhando as primeiras linhas. */
async function sondarAba(wb: Planilha, sheet: Aba, ctx: Contexto): Promise<{ tipo: "atividades" | "cluster" | null; melhor: number }> {
  let linhas = 0;
  let tipo: "atividades" | "cluster" | null = null;
  let melhor = 0;
  await scanSheet(wb, sheet, ctx, (n, cols, vals) => {
    if (++linhas > MAX_LINHAS_CABECALHO) return true;
    const a = acharCampos(n, cols, vals, MAPA_ATV).size;
    const c = acharCampos(n, cols, vals, MAPA_CLUSTER).size;
    melhor = Math.max(melhor, a);
    if (a >= MIN_CAMPOS_ATV) {
      tipo = "atividades";
      return true;
    }
    if (c >= 2) {
      tipo = "cluster";
      return true;
    }
    return false;
  });
  return { tipo, melhor };
}

type AoProgresso = (fracao: number) => void;

async function lerAbaAtividades(wb: Planilha, sheet: Aba, ctx: Contexto, onProgress?: AoProgresso, onRegistro?: (r: RegistroLeitura) => void) {
  const fieldOfCol = new Int16Array(16384).fill(-1);
  const D1904 = ctx.date1904;
  const fv: Array<string | undefined> = new Array(CAMPOS_ATV.length);
  const fk: TipoCelula[] = new Array(CAMPOS_ATV.length).fill(0);
  let found: Map<number, number> | null = null;
  let linhasCab = 0;
  const atividades: AtividadeLida[] = [];
  const desdobros: DesdobroLido[] = [];
  const st: EstatisticasLeitura = { linhas: 0, vazias: 0, semData: 0, dataInvalida: 0, valorInvalido: 0, jsonInvalido: 0 };

  const res = await scanSheet(
    wb,
    sheet,
    ctx,
    (n, cols, vals, kinds, linha) => {
      if (!found) {
        if (++linhasCab > MAX_LINHAS_CABECALHO) return true;
        const achados = acharCampos(n, cols, vals, MAPA_ATV);
        if (achados.size < MIN_CAMPOS_ATV) return false;
        found = achados;
        for (const [fi, c] of achados) fieldOfCol[c] = fi;
        return false;
      }
      fv.fill(undefined);
      fk.fill(0);
      let algum = false;
      for (let j = 0; j < n; j++) {
        const c = cols[j];
        const fi = c < 16384 ? fieldOfCol[c] : -1;
        if (fi < 0) continue;
        fv[fi] = vals[j];
        fk[fi] = kinds[j];
        if (trimStr(vals[j]) !== "") algum = true;
      }
      if (!algum) {
        st.vazias++;
        onRegistro?.({ tipo: "atividade", aba: sheet.name, linha, estado: "ignorado", motivos: ["LINHA_VAZIA"] });
        return false;
      }
      st.linhas++;
      let data = "";
      if (fv[FI.data] !== undefined && trimStr(fv[FI.data]) !== "") {
        const p = parseDateValue(fv[FI.data], fk[FI.data], D1904);
        if (p) data = isoDate(p);
        else st.dataInvalida++;
      }
      if (!data) st.semData++;
      let val: number | null = null;
      if (fv[FI.valor] !== undefined && trimStr(fv[FI.valor]) !== "") {
        const v = parseValor(fv[FI.valor], fk[FI.valor]);
        if (Number.isNaN(v)) st.valorInvalido++;
        else if (v !== null) val = paraFixo(v);
      }
      const mat = matriculaTexto(fv[FI.matricula]);
      const recurso = trimStr(fv[FI.recurso]);
      const codigo = trimStr(fv[FI.codigo]);
      const motivos: string[] = [];
      if (!data) motivos.push(trimStr(fv[FI.data]) ? "DATA_INVALIDA" : "SEM_DATA");
      if (val === null && trimStr(fv[FI.valor])) motivos.push("VALOR_INVALIDO");
      const indiceAtividade = atividades.length;
      atividades.push({
        id: trimStr(fv[FI.id]),
        recurso,
        mat,
        codigo,
        data,
        cidade: trimStr(fv[FI.cidade]),
        mn: trimStr(fv[FI.motivoN]),
        mc: trimStr(fv[FI.motivoC]),
        neg: trimStr(fv[FI.negociou]),
        val,
      });
      const body = trimStr(fv[FI.body]);
      if (body) {
        const { cods, erro } = codigosDoBody(body);
        if (erro) { st.jsonInvalido++; motivos.push("JSON_INVALIDO_COM_RECUPERACAO"); }
        for (const cod of cods) if (CODIGOS_DESDOBRO.has(cod)) {
          const indice = desdobros.length;
          desdobros.push({ mat, data, recurso, codigo, cod, val });
          onRegistro?.({ tipo: "desdobro", aba: sheet.name, linha, estado: motivos.length ? "parcial" : "aceito", motivos: [...motivos], indice });
        }
      }
      onRegistro?.({ tipo: "atividade", aba: sheet.name, linha, estado: motivos.length ? "parcial" : "aceito", motivos, indice: indiceAtividade });
      return false;
    },
    onProgress,
    (c) => found === null || (c < 16384 && fieldOfCol[c] >= 0)
  );

  const achadas: Map<number, number> = found ?? new Map();
  const faltam = CAMPOS_ATV.filter((_, i) => !achadas.has(i));
  const obrigatorias = faltam.filter((c) => c.req);
  if (obrigatorias.length) {
    throw new NegError(
      "COLUNAS_AUSENTES",
      `Faltam colunas obrigatórias na aba "${sheet.name}": ${obrigatorias.map((c) => c.header).join(", ")}. Sem elas as medidas ficariam erradas.`
    );
  }
  const avisos: string[] = [];
  for (const c of faltam) {
    avisos.push(`Coluna "${c.header}" não encontrada: ${c.key === "cidade" ? "a cidade fica em branco" : "os motivos da não execução dessa coluna ficam vazios"}.`);
  }
  if (st.dataInvalida) avisos.push(`${st.dataInvalida} linhas com "Data" que não pôde ser interpretada (ficam sem data).`);
  if (st.valorInvalido) avisos.push(`${st.valorInvalido} linhas com "Valor Total dos Débitos" que não pôde ser interpretado (contam sem valor).`);
  if (st.jsonInvalido) avisos.push(`${st.jsonInvalido} linhas com "Body Adicional Executado" fora do formato JSON: os códigos foram procurados pelo nome do campo.`);
  if (res.badSst) avisos.push(`${res.badSst} células apontam para textos inexistentes no arquivo.`);
  return { atividades, desdobros, stats: st, avisos };
}

async function lerAbaCluster(wb: Planilha, sheet: Aba, ctx: Contexto, onProgress?: AoProgresso, onRegistro?: (r: RegistroLeitura) => void) {
  let colMat = -1;
  let colCl = -1;
  let ok = false;
  const vistos = new Set<string>();
  const pares: Array<[string, string]> = [];
  let linhasCab = 0;
  let duplicadas = 0;
  await scanSheet(
    wb,
    sheet,
    ctx,
    (n, cols, vals, _kinds, linha) => {
      if (!ok) {
        if (++linhasCab > MAX_LINHAS_CABECALHO) return true;
        const achados = acharCampos(n, cols, vals, MAPA_CLUSTER);
        if (achados.size === 2) {
          colMat = achados.get(0) as number;
          colCl = achados.get(1) as number;
          ok = true;
        }
        return false;
      }
      let mat = "";
      let cl = "";
      for (let j = 0; j < n; j++) {
        if (cols[j] === colMat) mat = matriculaTexto(vals[j]);
        else if (cols[j] === colCl) cl = trimStr(vals[j]);
      }
      if (!mat) {
        onRegistro?.({ tipo: "cluster", aba: sheet.name, linha, estado: "ignorado", motivos: ["SEM_MATRICULA"] });
        return false;
      }
      if (vistos.has(mat)) {
        duplicadas++;
        onRegistro?.({ tipo: "cluster", aba: sheet.name, linha, estado: "ignorado", motivos: ["CLUSTER_MATRICULA_REPETIDA"] });
        return false;
      }
      vistos.add(mat);
      const indice = pares.length;
      pares.push([mat, cl]);
      onRegistro?.({ tipo: "cluster", aba: sheet.name, linha, estado: "aceito", motivos: [], indice });
      return false;
    },
    onProgress,
    (c) => !ok || c === colMat || c === colCl
  );
  if (!ok) throw new NegError("SEM_CABECALHO", `A aba "${sheet.name}" não tem as colunas NUM_LIGACAO e CLUSTER SALDO.`);
  return { pares, duplicadas };
}

export interface OpcoesLeitura {
  onProgress?: (p: { phase: string; fraction: number }) => void;
  onRegistro?: (registro: RegistroLeitura) => void;
}

/**
 * Lê um .xlsx e devolve só o que o painel usa. Arquivos de atividades (aba "Page 1") e de Cluster
 * (aba "Planilha1") são reconhecidos pelas colunas.
 */
export async function lerArquivo(file: ArquivoLido, opts: OpcoesLeitura = {}): Promise<ResultadoAtividades | ResultadoCluster> {
  const wb = await openWorkbook(file);
  const ctx = await wb.loadContext();
  const preferidas = ["page 1", "planilha1"];
  const abas = wb.sheets.filter((s) => s.state === "visible" || s.state === "");
  abas.sort((a, b) => (preferidas.includes(chave(b.name)) ? 1 : 0) - (preferidas.includes(chave(a.name)) ? 1 : 0));
  let escolhida: { s: Aba; tipo: "atividades" | "cluster" } | null = null;
  for (const s of abas) {
    const sonda = await sondarAba(wb, s, ctx);
    if (sonda.tipo) {
      escolhida = { s, tipo: sonda.tipo };
      break;
    }
  }
  if (!escolhida) {
    throw new NegError(
      "SEM_CABECALHO",
      `Nenhuma aba parece ser de atividades (precisa de ${MIN_CAMPOS_ATV} destas colunas: ${CAMPOS_ATV.filter((c) => c.req).map((c) => c.header).join(", ")}) nem de Cluster (NUM_LIGACAO e CLUSTER SALDO). Abas do arquivo: ${wb.sheets.map((s) => s.name).join(", ")}.`
    );
  }
  const aba = escolhida.s;
  const onProgress: AoProgresso | undefined = opts.onProgress ? (f) => opts.onProgress?.({ phase: "Lendo aba " + aba.name, fraction: f }) : undefined;
  if (escolhida.tipo === "cluster") {
    const r = await lerAbaCluster(wb, aba, ctx, onProgress, opts.onRegistro);
    return { tipo: "cluster", aba: aba.name, pares: r.pares, duplicadas: r.duplicadas, avisos: [] };
  }
  const r = await lerAbaAtividades(wb, aba, ctx, onProgress, opts.onRegistro);
  return { tipo: "atividades", aba: aba.name, atividades: r.atividades, desdobros: r.desdobros, stats: r.stats, avisos: r.avisos };
}

export type { ResultadoArquivo };
