// Leitura dos CSV de arrecadação ("Arrecadação diária" e "Arrecadação acumulada"): só as parcelas quitadas.
// Por streaming (blocos de 4 MB), sem bibliotecas: reconhece a codificação (UTF-8 ou Windows-1252) e o
// separador (; , tab |) pelo próprio arquivo e acha as colunas pelo nome, como as planilhas de atividades.
import { matriculaTexto, normHeader, paraFixo, trimStr } from "./leitura.ts";
import { parseDateText, parseValor, isoDate } from "./valores.ts";
import { NegError, type ArquivoLido } from "./xlsx-reader.ts";
import type { EstatisticasArrecadacao, PagamentoLido, RegistroLeitura, ResultadoArrecadacao } from "./tipos.ts";

const BLOCO = 4 * 1024 * 1024;
const MAX_LINHAS_CABECALHO = 30;
const DELIMITADORES = [";", "\t", ",", "|"];

type Chave = "mat" | "valor" | "data" | "tipo" | "situacao" | "venc" | "nota";
const OBRIGATORIAS: Array<[Chave, string]> = [
  ["mat", "Nº Ligação"],
  ["valor", "Valor Pago"],
  ["data", "Data Pagto."],
  ["tipo", "Tipo Fatura"],
  ["situacao", "Situação Pagto"],
];

/** Qual coluna do arquivo de arrecadação é este título (já normalizado por `normHeader`). */
function chaveDaColuna(h: string): Chave | null {
  if (h === "matricula" || /^(n|num|numero|no)? ?ligac?/.test(h)) return "mat";
  if (h === "valor pago") return "valor";
  if (/^data pag/.test(h)) return "data"; // Data Pagto.
  if (h === "tipo fatura") return "tipo";
  if (/^situa.* pag/.test(h)) return "situacao"; // Situação Pagto (tolera o acento quebrado)
  if (h === "vencimento") return "venc";
  if (h === "n nota" || h === "nota") return "nota";
  return null;
}

/** Texto do arquivo: UTF-8 quando os bytes do começo são UTF-8 válido; senão, Windows-1252 (o "ANSI" do Excel). */
export function codificacaoDe(b: Uint8Array): string {
  if (b[0] === 0xff && b[1] === 0xfe) return "utf-16le";
  if (b[0] === 0xfe && b[1] === 0xff) return "utf-16be";
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return "utf-8";
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(b, { stream: true });
    return "utf-8";
  } catch {
    return "windows-1252";
  }
}

/** Separador: o que mais aparece na linha do cabeçalho (vazio se nenhum aparece ao menos duas vezes). */
function delimitadorDe(linha: string): string {
  let melhor = "";
  let n = 1;
  for (const d of DELIMITADORES) {
    const c = linha.split(d).length - 1;
    if (c > n) {
      n = c;
      melhor = d;
    }
  }
  return melhor;
}

/** Campos de uma linha com aspas ("" dentro do campo vale uma aspa). */
function camposComAspas(linha: string, d: string): string[] {
  const out: string[] = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (aspas) {
      if (ch === '"') {
        if (linha[i + 1] === '"') {
          atual += '"';
          i++;
        } else aspas = false;
      } else atual += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === d) {
      out.push(atual);
      atual = "";
    } else atual += ch;
  }
  out.push(atual);
  return out;
}

/** Campos de uma linha sem aspas; só corta os das colunas pedidas (`quer`), que é o que pesa em arquivos grandes. */
function camposSimples(linha: string, d: string, quer: boolean[], saida: string[]): void {
  let ini = 0;
  for (let c = 0; c < quer.length; c++) {
    const f = linha.indexOf(d, ini);
    const fim = f < 0 ? linha.length : f;
    if (quer[c]) saida[c] = linha.slice(ini, fim);
    if (f < 0) {
      for (let k = c + 1; k < quer.length; k++) if (quer[k]) saida[k] = "";
      return;
    }
    ini = f + 1;
  }
}

/** Chama `aoLer` com cada registro do arquivo (uma linha, ou várias quando um campo entre aspas tem quebra de linha). */
async function varrerRegistros(file: ArquivoLido, aoLer: (registro: string, linha: number, linhaFim: number) => boolean | void, onProgress?: (fracao: number) => void): Promise<void> {
  let dec: TextDecoder | null = null;
  let resto = "";
  let aberto = ""; // registro com aspas ainda abertas, esperando a próxima linha
  let parar = false;
  let linhaFisica = 0;
  let inicioAberto = 0;
  const registro = (linha: string): void => {
    linhaFisica++;
    if (aberto) {
      aberto += "\n" + linha;
      if ((aberto.split('"').length - 1) % 2 === 0) {
        const pronto = aberto;
        aberto = "";
        if (aoLer(pronto, inicioAberto, linhaFisica) === true) parar = true;
      }
      return;
    }
    if (linha.indexOf('"') >= 0 && (linha.split('"').length - 1) % 2 === 1) {
      aberto = linha;
      inicioAberto = linhaFisica;
      return;
    }
    if (aoLer(linha, linhaFisica, linhaFisica) === true) parar = true;
  };
  for (let ini = 0; ini < file.size && !parar; ini += BLOCO) {
    const bytes = new Uint8Array(await file.slice(ini, Math.min(file.size, ini + BLOCO)).arrayBuffer());
    if (!dec) dec = new TextDecoder(codificacaoDe(bytes));
    const texto = resto + dec.decode(bytes, { stream: true });
    const linhas = texto.split("\n");
    resto = linhas.pop() ?? "";
    for (const l of linhas) {
      registro(l.endsWith("\r") ? l.slice(0, -1) : l);
      if (parar) break;
    }
    onProgress?.(Math.min(1, (ini + BLOCO) / file.size));
  }
  if (!parar) {
    const fim = resto + (dec ? dec.decode() : "");
    if (fim) registro(fim.endsWith("\r") ? fim.slice(0, -1) : fim);
    if (aberto) aoLer(aberto, inicioAberto, linhaFisica);
  }
}

export interface OpcoesCsv {
  onProgress?: (p: { phase: string; fraction: number }) => void;
  onRegistro?: (registro: RegistroLeitura) => void;
}

/**
 * Lê um CSV de arrecadação e devolve só as parcelas quitadas (Tipo Fatura "PARCELA" e Situação Pagto "Quitada"):
 * matrícula, data do pagamento e valor pago. As notas fiscais mensais e o que não está quitado só são contados.
 */
export async function lerArrecadacao(file: ArquivoLido, opts: OpcoesCsv = {}): Promise<ResultadoArrecadacao> {
  if (!file.size) throw new NegError("EMPTY", "O arquivo está vazio (0 bytes). Pode ainda estar sendo sincronizado pelo OneDrive.");
  const st: EstatisticasArrecadacao = { linhas: 0, parcelasQuitadas: 0, outrasFaturas: 0, naoQuitadas: 0, semMatricula: 0, semData: 0, valorInvalido: 0, primeira: "", ultima: "" };
  const pagamentos: PagamentoLido[] = [];
  let delim = "";
  let col: Partial<Record<Chave, number>> | null = null;
  let quer: boolean[] = [];
  let linhasCab = 0;
  let melhor: { achadas: Set<Chave> } = { achadas: new Set() };
  const campos: string[] = [];

  await varrerRegistros(
    file,
    (reg, linha, linhaFim) => {
      if (!col) {
        if (++linhasCab > MAX_LINHAS_CABECALHO) return true;
        const d = delimitadorDe(reg);
        if (!d) return false;
        const achadas: Partial<Record<Chave, number>> = {};
        camposComAspas(reg, d).forEach((t, j) => {
          const k = chaveDaColuna(normHeader(t));
          if (k && achadas[k] === undefined) achadas[k] = j;
        });
        const nomes = new Set(Object.keys(achadas) as Chave[]);
        if (nomes.size > melhor.achadas.size) melhor = { achadas: nomes };
        if (OBRIGATORIAS.every(([k]) => achadas[k] !== undefined)) {
          col = achadas;
          delim = d;
          const maior = Math.max(...Object.values(achadas).map((n) => n as number));
          quer = new Array<boolean>(maior + 1).fill(false);
          for (const n of Object.values(achadas)) quer[n as number] = true;
        }
        return false;
      }
      const auditar = (estado: RegistroLeitura["estado"], motivo: string, indice?: number): void => {
        opts.onRegistro?.({ tipo: "pagamento", aba: "CSV", linha, linhaFim, estado, motivos: motivo ? [motivo] : [], ...(indice === undefined ? {} : { indice }) });
      };
      if (reg === "") { auditar("ignorado", "LINHA_VAZIA"); return false; }
      const c = col as Partial<Record<Chave, number>>;
      const f = reg.indexOf('"') >= 0 ? camposComAspas(reg, delim) : (camposSimples(reg, delim, quer, campos), campos);
      const tipo = f[c.tipo as number] ?? "";
      if (tipo === "" && trimStr(f[c.mat as number]) === "") { auditar("ignorado", "LINHA_VAZIA"); return false; }
      st.linhas++;
      if (!/\bparcelas?\b/i.test(tipo)) {
        st.outrasFaturas++;
        auditar("ignorado", "OUTRO_TIPO_FATURA");
        return false;
      }
      if (!/^\s*quitad/i.test(f[c.situacao as number] ?? "")) {
        st.naoQuitadas++;
        auditar("ignorado", "PARCELA_NAO_QUITADA");
        return false;
      }
      const mat = matriculaTexto(f[c.mat as number]);
      if (!mat) {
        st.semMatricula++;
        auditar("ignorado", "SEM_MATRICULA");
        return false;
      }
      const p = parseDateText(f[c.data as number] ?? "");
      if (!p) {
        st.semData++;
        auditar("ignorado", "SEM_DATA_OU_DATA_INVALIDA");
        return false;
      }
      const v = parseValor(f[c.valor as number] ?? "", 0);
      if (v === null || Number.isNaN(v)) {
        st.valorInvalido++;
        auditar("ignorado", "VALOR_PAGO_INVALIDO");
        return false;
      }
      const data = isoDate(p);
      st.parcelasQuitadas++;
      if (!st.primeira || data < st.primeira) st.primeira = data;
      if (data > st.ultima) st.ultima = data;
      const ref = trimStr(c.venc === undefined ? "" : f[c.venc]) + "|" + trimStr(c.nota === undefined ? "" : f[c.nota]);
      pagamentos.push([mat, data, paraFixo(v), ref]);
      auditar("aceito", "", pagamentos.length - 1);
      return false;
    },
    opts.onProgress ? (fr) => opts.onProgress?.({ phase: "Lendo arrecadação", fraction: fr }) : undefined
  );

  if (!col) {
    const faltam = OBRIGATORIAS.filter(([k]) => !melhor.achadas.has(k)).map(([, nome]) => nome);
    if (melhor.achadas.size >= 2) throw new NegError("COLUNAS_AUSENTES", `Faltam colunas no arquivo de arrecadação: ${faltam.join(", ")}. Sem elas não dá para ligar os pagamentos às negociações.`);
    throw new NegError("SEM_CABECALHO", `O arquivo não parece ser de arrecadação (precisa das colunas ${OBRIGATORIAS.map(([, n]) => n).join(", ")}).`);
  }
  const avisos: string[] = [];
  if (st.semData) avisos.push(`${st.semData} parcelas quitadas com "Data Pagto." que não pôde ser interpretada ficaram de fora.`);
  if (st.valorInvalido) avisos.push(`${st.valorInvalido} parcelas quitadas com "Valor Pago" vazio ou ilegível ficaram de fora.`);
  if (st.semMatricula) avisos.push(`${st.semMatricula} parcelas quitadas sem "Nº Ligação" ficaram de fora.`);
  return { tipo: "arrecadacao", pagamentos, stats: st, avisos };
}
