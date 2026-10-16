// Fontes de dados no navegador: pasta (acesso contínuo pela File System Access API) ou arquivos escolhidos,
// com os resultados já lidos guardados no IndexedDB para não reler tudo a cada atualização.
// Nada daqui envia dados para fora do computador.
import { NegError, PARSER_VERSION, lerArquivo } from "./leitura.ts";
import { consolidar } from "./modelo.ts";
import type { Modelo, ResultadoArquivo, ResultadoAtividades, ResultadoCluster, ResultadoIgnorado } from "./tipos.ts";

/** Um arquivo candidato: nome, caminho relativo e acesso ao `File`. */
export interface Entrada {
  name: string;
  path: string;
  getFile(): Promise<File>;
}

/** Pasta escolhida pelo usuário (a File System Access API ainda não está completa no lib.dom). */
export interface PastaHandle {
  kind: "directory";
  name: string;
  entries(): AsyncIterableIterator<[string, PastaHandle | ArquivoHandle]>;
  queryPermission(opts: { mode: "read" }): Promise<PermissionState>;
  requestPermission(opts: { mode: "read" }): Promise<PermissionState>;
}
interface ArquivoHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
}

export type JanelaComPicker = Window & {
  showDirectoryPicker?: (opts?: { id?: string; mode?: "read" | "readwrite" }) => Promise<PastaHandle>;
};

export const temPicker = (): boolean => typeof window !== "undefined" && typeof (window as JanelaComPicker).showDirectoryPicker === "function";
export const temIdb = (): boolean => typeof indexedDB !== "undefined";

/* ------------------------------------------------------------------ */
/* IndexedDB                                                           */
/* ------------------------------------------------------------------ */

const DB = "negociacoes-interior";

function abrir(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("arquivos")) db.createObjectStore("arquivos");
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function operar<T>(loja: "kv" | "arquivos", modo: IDBTransactionMode, fn: (st: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await abrir();
  try {
    return await new Promise<T | undefined>((res, rej) => {
      const tx = db.transaction(loja, modo);
      const req = fn(tx.objectStore(loja));
      tx.oncomplete = () => res(req ? req.result : undefined);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  } finally {
    db.close();
  }
}

export const idb = {
  get: <T>(k: string) => operar<T>("kv", "readonly", (st) => st.get(k) as IDBRequest<T>),
  set: (k: string, v: unknown) => operar("kv", "readwrite", (st) => void st.put(v, k)),
  // resultado já lido de cada arquivo (só as colunas usadas); a chave inclui versão das regras, caminho, tamanho e data
  async arquivoTem(k: string): Promise<boolean> {
    return ((await operar<number>("arquivos", "readonly", (st) => st.count(k))) ?? 0) > 0;
  },
  arquivoGet: (k: string) => operar<ResultadoArquivo>("arquivos", "readonly", (st) => st.get(k) as IDBRequest<ResultadoArquivo>),
  arquivoPut: (k: string, v: ResultadoArquivo) => operar("arquivos", "readwrite", (st) => void st.put(v, k)),
  arquivoLimpar(manter: Set<string> | null) {
    return operar("arquivos", "readwrite", (st) => {
      const q = st.openKeyCursor();
      q.onsuccess = () => {
        const c = q.result;
        if (!c) return;
        if (!manter || !manter.has(String(c.key))) st.delete(c.key);
        c.continue();
      };
    });
  },
};

/* ------------------------------------------------------------------ */
/* Pasta e arquivos                                                    */
/* ------------------------------------------------------------------ */

export async function listarPasta(dir: PastaHandle, prefixo = "", prof = 0): Promise<Entrada[]> {
  const out: Entrada[] = [];
  for await (const [name, handle] of dir.entries()) {
    const path = prefixo + name;
    if (handle.kind === "file") out.push({ name, path, getFile: () => handle.getFile() });
    else if (handle.kind === "directory" && prof < 10) out.push(...(await listarPasta(handle, path + "/", prof + 1)));
  }
  return out;
}

export function entradasDeArquivos(lista: FileList | File[]): Entrada[] {
  return [...lista].map((f) => ({ name: f.name, path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, getFile: async () => f }));
}

/** Mensagem em português para um erro de leitura. */
export function amigavel(err: unknown): string {
  if (err instanceof NegError) return err.message;
  const n = err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : "";
  if (n === "NotFoundError") return "Arquivo não encontrado (foi movido ou apagado durante a leitura).";
  if (n === "NotReadableError" || n === "SecurityError") {
    return 'Não foi possível ler o arquivo. Se ele está no OneDrive, confirme que está baixado neste computador ("Sempre manter neste dispositivo") e que não está bloqueado por outro programa.';
  }
  if (err instanceof RangeError) return "Memória insuficiente ao processar o arquivo.";
  return "Falha inesperada ao ler o arquivo (" + (n || "erro") + ": " + (err instanceof Error ? err.message : String(err)) + ").";
}

/* ------------------------------------------------------------------ */
/* Carga                                                               */
/* ------------------------------------------------------------------ */

export interface ProgressoCarga {
  arquivo: string;
  indice: number;
  total: number;
  fase: string;
  fracao: number; // 0..1 do arquivo atual
}

export interface RelatorioCarga {
  /** Sem .xlsx na pasta. */
  semXlsx: boolean;
  /** Nenhum arquivo de atividades válido. */
  semAtividades: boolean;
  /** Leitura automática em que nada mudou desde a última. */
  semMudanca: boolean;
  /** Pasta com .xlsx, mas nenhum com "Atividade" ou "Cluster" no nome. */
  semArquivosDoPainel: boolean;
  /** .xlsx da pasta que não foram abertos: o nome não tem "Atividade" nem "Cluster". */
  ignoradosPorNome: string[];
  modelo: Modelo | null;
  assinatura: string;
  leitura: { lidos: number; reaproveitados: number };
  falhas: Array<{ path: string; motivo: string }>;
  ignorados: ResultadoIgnorado[];
  ignoradosFormato: string[];
  atividades: ResultadoAtividades[];
  clusters: ResultadoCluster[];
}

export interface OpcoesCarga {
  /** Resultados já lidos nesta sessão (chave = versão + caminho + tamanho + data). */
  cache: Map<string, ResultadoArquivo>;
  /** Assinatura da última carga que virou modelo; com `auto`, igual a esta significa "nada mudou". */
  assinaturaAnterior: string;
  auto: boolean;
  /** Pasta: só lê os .xlsx com "Atividade" ou "Cluster" no nome. Arquivos escolhidos à mão: lê todos. */
  soPorNome?: boolean;
  temModelo: boolean;
  onProgresso?: (p: ProgressoCarga) => void;
}

const isXlsx = (n: string): boolean => /\.xlsx$/i.test(n);

const semAcento = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/**
 * Na pasta, só os arquivos com "Atividade" ou "Cluster" no nome são do painel (a regra do relatório do Power BI,
 * sem diferenciar maiúsculas nem acentos). "Termos de Janeiro a Agosto.xlsx", por exemplo, fica de fora e nem é aberto.
 */
export const ehArquivoDoPainel = (nome: string): boolean => /atividade|cluster/.test(semAcento(nome));
const isFormatoAntigo = (n: string): boolean => /\.(xls|xlsb|xlsm)$/i.test(n);

/**
 * Lê os arquivos (só os novos ou modificados), reaproveitando o que já foi lido antes, e monta o modelo.
 * Quem chama decide o que mostrar; aqui só há leitura e cálculo.
 */
export async function carregarArquivos(entries: Entrada[], opts: OpcoesCarga): Promise<RelatorioCarga> {
  const rel: RelatorioCarga = {
    semXlsx: false,
    semAtividades: false,
    semMudanca: false,
    semArquivosDoPainel: false,
    ignoradosPorNome: [],
    modelo: null,
    assinatura: "",
    leitura: { lidos: 0, reaproveitados: 0 },
    falhas: [],
    ignorados: [],
    ignoradosFormato: [],
    atividades: [],
    clusters: [],
  };
  const candidatos: Entrada[] = [];
  for (const e of entries) {
    if (e.name.startsWith("~$")) continue; // temporários do Excel
    if (isXlsx(e.name)) {
      if (opts.soPorNome && !ehArquivoDoPainel(e.name)) rel.ignoradosPorNome.push(e.path);
      else candidatos.push(e);
    } else if (isFormatoAntigo(e.name)) rel.ignoradosFormato.push(e.path);
  }
  if (!candidatos.length) {
    rel.semArquivosDoPainel = rel.ignoradosPorNome.length > 0;
    rel.semXlsx = !rel.semArquivosDoPainel;
    return rel;
  }

  // a chave identifica uma versão do arquivo: só é lido do disco o que é novo ou foi modificado
  const versao = "v" + PARSER_VERSION + ":";
  const metas: Array<{ e: Entrada; file: File; chave: string }> = [];
  for (const e of candidatos) {
    try {
      const file = await e.getFile();
      metas.push({ e, file, chave: versao + e.path + "|" + file.size + "|" + file.lastModified });
    } catch (err) {
      rel.falhas.push({ path: e.path, motivo: amigavel(err) });
    }
  }
  const chaves = metas.map((m) => m.chave);
  const lidos: ResultadoArquivo[] = [];
  for (let i = 0; i < metas.length; i++) {
    const m = metas[i];
    let res: ResultadoArquivo | undefined | null = opts.cache.get(m.chave);
    if (res) {
      rel.leitura.reaproveitados++;
    } else if (temIdb()) {
      try {
        if (await idb.arquivoTem(m.chave)) res = (await idb.arquivoGet(m.chave)) ?? null;
      } catch {
        res = null; // sem armazenamento: lê do arquivo
      }
      if (res) {
        opts.cache.set(m.chave, res);
        rel.leitura.reaproveitados++;
      }
    }
    if (!res) {
      try {
        try {
          const lido = await lerArquivo(m.file, {
            onProgress: (p) => opts.onProgresso?.({ arquivo: m.e.name, indice: i, total: metas.length, fase: p.phase, fracao: p.fraction }),
          });
          res = lido;
        } catch (err) {
          // outro Excel qualquer da pasta (nem atividades, nem Cluster): só fica registrado como ignorado
          if (!(err instanceof NegError) || err.code !== "SEM_CABECALHO") throw err;
          res = { tipo: "ignorado", motivo: err.message };
        }
        res.path = m.e.path;
        res.name = m.e.name;
        res.size = m.file.size;
        res.lastModified = m.file.lastModified;
        opts.cache.set(m.chave, res);
        if (temIdb()) idb.arquivoPut(m.chave, res).catch(() => undefined); // sem espaço: continua só na memória
        rel.leitura.lidos++;
      } catch (err) {
        rel.falhas.push({ path: m.e.path, motivo: amigavel(err) });
        continue;
      }
    }
    if (res.tipo === "ignorado") rel.ignorados.push(res);
    else lidos.push(res);
  }
  for (const k of [...opts.cache.keys()]) if (!chaves.includes(k)) opts.cache.delete(k);
  if (lidos.length && temIdb()) idb.arquivoLimpar(new Set(chaves)).catch(() => undefined);

  rel.assinatura = chaves.slice().sort().join("\n");
  if (opts.auto && rel.assinatura === opts.assinaturaAnterior && opts.temModelo) {
    rel.semMudanca = true;
    return rel;
  }
  rel.atividades = lidos.filter((r): r is ResultadoAtividades => r.tipo === "atividades");
  rel.clusters = lidos.filter((r): r is ResultadoCluster => r.tipo === "cluster");
  if (!rel.atividades.length) {
    rel.semAtividades = true;
    return rel;
  }
  rel.modelo = consolidar(lidos);
  return rel;
}
