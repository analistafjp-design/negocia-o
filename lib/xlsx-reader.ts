// Leitor de .xlsx por streaming: ZIP + XML incremental, sem árvore DOM e sem bibliotecas.
// Vem do painel Pós-Corte Interior (mesmo autor), em TypeScript. Lê só as colunas pedidas, o que importa
// para as planilhas de atividades, que têm centenas de colunas.
import { isoDate, pad2, serialToParts, type TipoCelula } from "./valores.ts";

export class NegError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "NegError";
    this.code = code;
  }
}

/** O que o leitor precisa de um arquivo: o `File` do navegador serve, e o Node, nos testes, entrega um Blob. */
export interface ArquivoLido {
  name: string;
  size: number;
  lastModified: number;
  slice(start?: number, end?: number): Blob;
}

interface EntradaZip {
  name: string;
  flags: number;
  method: number;
  csize: number;
  usize: number;
  loff: number;
}
interface Zip {
  file: ArquivoLido;
  entries: Map<string, EntradaZip>;
}
export interface Aba {
  name: string;
  path: string;
  state: string;
  index: number;
}
export interface Contexto {
  sst: string[];
  dateStyle: boolean[];
  date1904: boolean;
}
export interface Planilha {
  zip: Zip;
  sheets: Aba[];
  date1904: boolean;
  sstPath: string | null;
  stylesPath: string | null;
  loadContext(): Promise<Contexto>;
}
interface Manipuladores {
  open(name: string, inner: string, selfClosing: boolean): void;
  close(name: string): void;
  text(texto: string, raw: boolean): void;
}
interface Relacao {
  id: string;
  type: string;
  target: string;
  mode: string;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function tick(): Promise<void> {
  if (typeof MessageChannel !== 'undefined') {
    return new Promise((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => {
        ch.port1.close();
        resolve();
      };
      ch.port2.postMessage(0);
    });
  }
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function readBytes(file: ArquivoLido, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

async function openZip(file: ArquivoLido): Promise<Zip> {
  const size = file.size;
  if (!size) throw new NegError('EMPTY', 'O arquivo está vazio (0 bytes). Pode ainda estar sendo sincronizado pelo OneDrive.');
  if (size < 22) throw new NegError('NOT_XLSX', 'O arquivo é pequeno demais para ser um .xlsx válido.');

  const head = await readBytes(file, 0, Math.min(8, size));
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) {
    throw new NegError(
      'OLE2',
      'Formato incompatível: é um .xls antigo ou um Excel protegido por senha. Abra no Excel e salve uma cópia como .xlsx sem senha.'
    );
  }

  const tailStart = Math.max(0, size - 65557);
  const tail = await readBytes(file, tailStart, size);
  let e = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
      e = i;
      break;
    }
  }
  if (e < 0) {
    if (head[0] === 0x50 && head[1] === 0x4b) {
      throw new NegError('TRUNCATED', 'Arquivo incompleto ou corrompido (fim do .xlsx não encontrado). Se estiver no OneDrive, aguarde a sincronização terminar.');
    }
    throw new NegError('NOT_XLSX', 'O arquivo não é um .xlsx válido (não é um pacote ZIP/OOXML).');
  }
  const dv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  const total = dv.getUint16(e + 10, true);
  const cdSize = dv.getUint32(e + 12, true);
  const cdOffset = dv.getUint32(e + 16, true);
  const zip64Locator = e >= 20 && dv.getUint32(e - 20, true) === 0x07064b50;
  if (zip64Locator || total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new NegError('ZIP64', 'Arquivo com ZIP64, não suportado por este leitor. Salve uma cópia .xlsx compatível pelo Excel.');
  }
  if (cdOffset + cdSize > size) {
    throw new NegError('TRUNCATED', 'Arquivo incompleto ou corrompido (diretório interno fora do arquivo).');
  }

  const cd = await readBytes(file, cdOffset, cdOffset + cdSize);
  const cdv = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const entries = new Map<string, EntradaZip>();
  const dec = new TextDecoder('utf-8');
  let p = 0;
  for (let i = 0; i < total; i++) {
    if (p + 46 > cd.length || cdv.getUint32(p, true) !== 0x02014b50) {
      throw new NegError('CORRUPT', 'Arquivo corrompido (diretório interno inválido).');
    }
    const flags = cdv.getUint16(p + 8, true);
    const method = cdv.getUint16(p + 10, true);
    const csize = cdv.getUint32(p + 20, true);
    const usize = cdv.getUint32(p + 24, true);
    const nlen = cdv.getUint16(p + 28, true);
    const xlen = cdv.getUint16(p + 30, true);
    const clen = cdv.getUint16(p + 32, true);
    const loff = cdv.getUint32(p + 42, true);
    const name = dec.decode(cd.subarray(p + 46, p + 46 + nlen)).replace(/\\/g, '/');
    p += 46 + nlen + xlen + clen;
    if (csize === 0xffffffff || usize === 0xffffffff || loff === 0xffffffff) {
      throw new NegError('ZIP64', 'Arquivo com ZIP64, não suportado por este leitor. Salve uma cópia .xlsx compatível pelo Excel.');
    }
    if (name.endsWith('/')) continue;
    entries.set(name, { name, flags, method, csize, usize, loff });
  }
  return { file, entries };
}

function findEntry(zip: Zip, path: string): EntradaZip | null {
  const exata = zip.entries.get(path);
  if (exata) return exata;
  const lower = path.toLowerCase();
  for (const [k, v] of zip.entries) if (k.toLowerCase() === lower) return v;
  return null;
}

async function entryStream(zip: Zip, entry: EntradaZip): Promise<ReadableStream<Uint8Array>> {
  if (entry.flags & 1) {
    throw new NegError('ENCRYPTED', `A parte "${entry.name}" está criptografada. Remova a senha do arquivo.`);
  }
  if (entry.method !== 0 && entry.method !== 8) {
    throw new NegError('METHOD', `Compressão não suportada na parte "${entry.name}" (método ${entry.method}).`);
  }
  const lh = await readBytes(zip.file, entry.loff, entry.loff + 30);
  const lv = new DataView(lh.buffer, lh.byteOffset, lh.byteLength);
  if (lh.length < 30 || lv.getUint32(0, true) !== 0x04034b50) {
    throw new NegError('CORRUPT', `Arquivo corrompido (cabeçalho local inválido em "${entry.name}").`);
  }
  const start = entry.loff + 30 + lv.getUint16(26, true) + lv.getUint16(28, true);
  const blob = zip.file.slice(start, start + entry.csize);
  let stream = blob.stream();
  if (entry.method === 8) stream = stream.pipeThrough(new DecompressionStream('deflate-raw'));
  return stream;
}

/** Lê uma parte do pacote como texto UTF-8 em pedaços, chamando onText(str); onText pode devolver true para parar. */
async function streamEntryText(zip: Zip, entry: EntradaZip, onText: (texto: string) => boolean | void, onBytes?: (n: number) => void): Promise<void> {
  const stream = await entryStream(zip, entry);
  const reader = stream.getReader();
  const dec = new TextDecoder('utf-8');
  let last = now();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (onBytes) onBytes(value.byteLength);
      if (onText(dec.decode(value, { stream: true })) === true) {
        await reader.cancel().catch(() => {});
        return;
      }
      if (now() - last > 40) {
        await tick();
        last = now();
      }
    }
    const rest = dec.decode();
    if (rest) onText(rest);
  } catch (err) {
    if (err instanceof NegError) throw err;
    throw new NegError('CORRUPT', `Arquivo corrompido ou incompleto (falha ao descompactar "${entry.name}").`);
  }
}

/* ------------------------------------------------------------------ */
/* XML incremental (estilo SAX)                                        */
/* ------------------------------------------------------------------ */

/**
 * Devolve uma cópia independente do texto. Trechos (substring) de textos longos ficam presos ao
 * pedaço grande de XML de onde saíram e o mantêm na memória; copiar libera esses pedaços.
 * O espaço inicial é removido: todo consumidor aplica trim aos valores.
 */
function own(s: string): string {
  return s.length < 13 ? s : (' ' + s).trimStart();
}

function decodeEntities(s: string): string {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|lt|gt|amp|quot|apos);/g, (m: string, e: string) => {
    switch (e) {
      case 'lt': return '<';
      case 'gt': return '>';
      case 'amp': return '&';
      case 'quot': return '"';
      case 'apos': return "'";
    }
    const cp = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    try {
      return String.fromCodePoint(cp);
    } catch {
      return m;
    }
  });
}

/** Texto de nó: entidades XML e escapes _xHHHH_ do OOXML. */
function decodeText(s: string): string {
  if (s.indexOf('&') >= 0) s = decodeEntities(s);
  if (s.indexOf('_x') >= 0) s = s.replace(/_x([0-9A-Fa-f]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
  return s;
}

const IRREGULAR_ATTRS = /[\t\r\n]|\s=|=\s/;
function getAttr(inner: string, name: string): string | undefined {
  let p = inner.indexOf(' ' + name + '=');
  if (p < 0) {
    if (!IRREGULAR_ATTRS.test(inner)) return undefined;
    const m = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')').exec(inner);
    return m ? (m[1] !== undefined ? m[1] : m[2]) : undefined;
  }
  p += name.length + 2;
  const q = inner.charCodeAt(p);
  if (q !== 34 && q !== 39) return undefined;
  const e = inner.indexOf(q === 34 ? '"' : "'", p + 1);
  return e < 0 ? undefined : inner.substring(p + 1, e);
}

/**
 * Tokenizador incremental: recebe pedaços de texto via write(), emite
 * open(name, inner, selfClosing) / close(name) / text(str, raw).
 * Nomes vêm sem prefixo de namespace. Nunca monta árvore DOM.
 */
class XmlStream {
  private h: Manipuladores;
  private tail: string;
  constructor(handlers: Manipuladores) {
    this.h = handlers;
    this.tail = '';
  }

  write(chunk: string): void {
    const h = this.h;
    const s = this.tail ? this.tail + chunk : chunk;
    let i = 0;
    for (;;) {
      const lt = s.indexOf('<', i);
      if (lt < 0) break;
      const c1 = s.charCodeAt(lt + 1);
      if (c1 !== c1) break; // fim do pedaço logo após '<'
      let end; // índice do último caractere da marcação
      if (c1 === 33) {
        // <!
        if (s.startsWith('<!--', lt)) {
          end = s.indexOf('-->', lt + 4);
          if (end < 0) break;
          end += 2;
          if (lt > i) h.text(s.substring(i, lt), false);
        } else if (s.startsWith('<![CDATA[', lt)) {
          end = s.indexOf(']]>', lt + 9);
          if (end < 0) break;
          if (lt > i) h.text(s.substring(i, lt), false);
          const cd = s.substring(lt + 9, end);
          if (cd) h.text(cd, true);
          end += 2;
        } else {
          end = s.indexOf('>', lt + 2);
          if (end < 0) break;
          if (lt > i) h.text(s.substring(i, lt), false);
        }
      } else if (c1 === 63) {
        // <?
        end = s.indexOf('?>', lt + 2);
        if (end < 0) break;
        end += 1;
        if (lt > i) h.text(s.substring(i, lt), false);
      } else if (c1 === 47) {
        // </
        end = s.indexOf('>', lt + 2);
        if (end < 0) break;
        if (lt > i) h.text(s.substring(i, lt), false);
        let name = s.substring(lt + 2, end).trim();
        const cp = name.indexOf(':');
        if (cp >= 0) name = name.substring(cp + 1);
        h.close(name);
      } else {
        end = s.indexOf('>', lt + 1);
        if (end < 0) break;
        if (lt > i) h.text(s.substring(i, lt), false);
        const inner = s.substring(lt + 1, end);
        const selfClosing = inner.charCodeAt(inner.length - 1) === 47;
        let ne = 0;
        const L = inner.length;
        while (ne < L) {
          const c = inner.charCodeAt(ne);
          if (c === 32 || c === 47 || c === 9 || c === 10 || c === 13) break;
          ne++;
        }
        let name = inner.substring(0, ne);
        const cp = name.indexOf(':');
        if (cp >= 0) name = name.substring(cp + 1);
        h.open(name, inner, selfClosing);
        if (selfClosing) h.close(name);
      }
      i = end + 1;
    }
    this.tail = i < s.length ? s.substring(i) : '';
  }

  end(): void {
    if (this.tail.trim() !== '') {
      throw new NegError('XML_TRUNCATED', 'Conteúdo XML incompleto (arquivo cortado ou corrompido).');
    }
  }
}

const NOOP_HANDLERS: Manipuladores = { open() {}, close() {}, text() {} };

async function parseSmallPart(zip: Zip, path: string, handlers: Partial<Manipuladores>, { required = true } = {}): Promise<boolean> {
  const entry = findEntry(zip, path);
  if (!entry) {
    if (required) throw new NegError('MISSING_PART', `Estrutura do .xlsx incompleta: parte "${path}" não encontrada.`);
    return false;
  }
  const xs = new XmlStream(Object.assign({}, NOOP_HANDLERS, handlers));
  await streamEntryText(zip, entry, (t) => xs.write(t));
  xs.end();
  return true;
}

/* ------------------------------------------------------------------ */
/* Pacote OOXML: workbook, relacionamentos, strings, estilos           */
/* ------------------------------------------------------------------ */

const dirname = (p: string) => (p.lastIndexOf('/') >= 0 ? p.substring(0, p.lastIndexOf('/')) : '');
const basename = (p: string) => p.substring(p.lastIndexOf('/') + 1);

function resolveTarget(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.substring(1);
  const parts = (baseDir ? baseDir.split('/') : []).concat(target.split('/'));
  const out = [];
  for (const seg of parts) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.join('/');
}

async function readRels(zip: Zip, path: string): Promise<Relacao[] | null> {
  const rels: Relacao[] = [];
  const ok = await parseSmallPart(
    zip,
    path,
    {
      open(name, inner) {
        if (name === 'Relationship') {
          rels.push({
            id: decodeEntities(getAttr(inner, 'Id') || ''),
            type: decodeEntities(getAttr(inner, 'Type') || ''),
            target: decodeEntities(getAttr(inner, 'Target') || ''),
            mode: getAttr(inner, 'TargetMode') || '',
          });
        }
      },
    },
    { required: false }
  );
  return ok ? rels : null;
}

const BUILTIN_DATE_FMT = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

function isDateFormatCode(code: string): boolean {
  const t = code.trim().toLowerCase();
  if (t === 'general' || t === 'standard') return false;
  if (/\[(h+|m+|s+)\]/i.test(code)) return true;
  const clean = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '').replace(/[_*]./g, '');
  return /[dmyhs]/i.test(clean);
}

export async function openWorkbook(file: ArquivoLido): Promise<Planilha> {
  const zip = await openZip(file);

  let wbPath = null;
  const rootRels = await readRels(zip, '_rels/.rels');
  if (rootRels) {
    const r = rootRels.find((x) => /\/officeDocument$/.test(x.type));
    if (r) wbPath = resolveTarget('', r.target);
  }
  if (!wbPath && findEntry(zip, 'xl/workbook.xml')) wbPath = 'xl/workbook.xml';
  if (!wbPath || !findEntry(zip, wbPath)) {
    if (findEntry(zip, 'xl/workbook.bin')) {
      throw new NegError('XLSB', 'Formato .xlsb não suportado. Abra no Excel e salve uma cópia como .xlsx.');
    }
    throw new NegError('NOT_XLSX', 'O arquivo é um ZIP, mas não tem a estrutura de uma planilha Excel (.xlsx): workbook não encontrado.');
  }
  const wbDir = dirname(wbPath);
  const relsList = (await readRels(zip, (wbDir ? wbDir + '/' : '') + '_rels/' + basename(wbPath) + '.rels')) || [];
  const rels = new Map<string, Relacao>(relsList.map((r): [string, Relacao] => [r.id, r]));

  const sheetsRaw: { name: string; rid: string; state: string }[] = [];
  let date1904 = false;
  await parseSmallPart(zip, wbPath, {
    open(name, inner) {
      if (name === 'workbookPr') {
        const d = getAttr(inner, 'date1904');
        date1904 = d === '1' || d === 'true';
      } else if (name === 'sheet') {
        const m = /\s[\w.-]+:id\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(inner);
        sheetsRaw.push({
          name: decodeEntities(getAttr(inner, 'name') || ''),
          rid: m ? (m[1] !== undefined ? m[1] : m[2]) : '',
          state: getAttr(inner, 'state') || 'visible',
        });
      }
    },
  });
  if (!sheetsRaw.length) throw new NegError('NO_SHEETS', 'A planilha não contém abas.');

  const sheets = sheetsRaw.map((s, i) => {
    const rel = rels.get(s.rid);
    const path = rel ? resolveTarget(wbDir, rel.target) : '';
    if (!rel || rel.mode === 'External' || !findEntry(zip, path)) {
      throw new NegError('MISSING_PART', `A aba "${s.name}" aponta para uma parte inexistente no arquivo (arquivo corrompido ou incompleto).`);
    }
    return { name: s.name, path, state: s.state, index: i };
  });

  const relByType = (suffix: string): string | null => {
    const r = relsList.find((x) => x.type.endsWith('/' + suffix) && x.mode !== 'External');
    return r ? resolveTarget(wbDir, r.target) : null;
  };

  let ctxCache: Contexto | null = null;
  const wb: Planilha = {
    zip,
    sheets,
    date1904,
    sstPath: relByType('sharedStrings'),
    stylesPath: relByType('styles'),
    loadContext,
  };
  async function loadContext(): Promise<Contexto> {
    if (ctxCache) return ctxCache;
    const sst: string[] = [];
    if (wb.sstPath && findEntry(zip, wb.sstPath)) {
      let inSi = false, inT = false, inRPh = false, acc = '';
      await parseSmallPart(zip, wb.sstPath, {
        open(name) {
          if (name === 'si') { inSi = true; acc = ''; }
          else if (name === 't' && inSi && !inRPh) inT = true;
          else if (name === 'rPh') inRPh = true;
        },
        close(name) {
          if (name === 't') inT = false;
          else if (name === 'rPh') inRPh = false;
          else if (name === 'si') { sst.push(own(acc)); inSi = false; }
        },
        text(t, raw) {
          if (inT) acc += raw ? t : decodeText(t);
        },
      });
    }
    const dateStyle: boolean[] = [];
    if (wb.stylesPath && findEntry(zip, wb.stylesPath)) {
      const custom = new Set<number>();
      let inXfs = false;
      await parseSmallPart(zip, wb.stylesPath, {
        open(name, inner) {
          if (name === 'numFmt') {
            const id = +(getAttr(inner, 'numFmtId') || 0);
            if (isDateFormatCode(decodeEntities(getAttr(inner, 'formatCode') || ''))) custom.add(id);
          } else if (name === 'cellXfs') inXfs = true;
          else if (name === 'xf' && inXfs) {
            const id = +(getAttr(inner, 'numFmtId') || 0);
            dateStyle.push(BUILTIN_DATE_FMT.has(id) || custom.has(id));
          }
        },
        close(name) {
          if (name === 'cellXfs') inXfs = false;
        },
      });
    }
    ctxCache = { sst, dateStyle, date1904 };
    return ctxCache;
  }
  return wb;
}

/* ------------------------------------------------------------------ */
/* Varredura de uma aba (linhas -> células)                            */
/* ------------------------------------------------------------------ */

function colFromRef(ref: string): number {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c >= 65 && c <= 90) n = n * 26 + (c - 64);
    else if (c >= 97 && c <= 122) n = n * 26 + (c - 96);
    else break;
  }
  return n - 1;
}

/**
 * Percorre a aba emitindo onRow(n, cols, vals, kinds) por linha (arrays reutilizados).
 * kinds: 0 texto, 1 número cru (texto original de <v>), 2 número com formato de data (já ISO).
 */
export type AoLerLinha = (n: number, cols: number[], vals: string[], kinds: TipoCelula[]) => boolean | void;

export async function scanSheet(
  wb: Planilha,
  sheet: Aba,
  ctx: Contexto,
  onRow: AoLerLinha,
  onProgress?: (fracao: number) => void,
  wantCol?: (coluna: number) => boolean
): Promise<{ badSst: number }> {
  const entry = findEntry(wb.zip, sheet.path);
  if (!entry) throw new NegError('MISSING_PART', `A aba "${sheet.name}" aponta para uma parte inexistente no arquivo.`);
  const { sst, dateStyle, date1904 } = ctx;
  const cols: number[] = [], vals: string[] = [], kinds: TipoCelula[] = [];
  let n = 0, nextCol = 0;
  let cCol = 0, cType = 'n', cStyle = 0;
  let inV = false, inT = false, inIs = false, inRPh = false;
  let vAcc = '', tAcc = '';
  let badSst = 0;
  let stopped = false;

  function finishCell() {
    if (wantCol !== undefined && !wantCol(cCol)) return; // coluna que o painel não usa: nem é lida
    let v: string | undefined, k: TipoCelula = 0;
    switch (cType) {
      case 's': {
        if (vAcc === '') return;
        v = sst[+vAcc];
        if (v === undefined) { badSst++; return; }
        break;
      }
      case 'inlineStr': v = own(tAcc); break;
      case 'str': v = own(decodeText(vAcc)); break;
      case 'b': v = vAcc === '1' ? 'VERDADEIRO' : 'FALSO'; break;
      case 'e': return;
      case 'd': v = vAcc; break;
      default: {
        if (vAcc === '') return;
        if (dateStyle[cStyle] === true) {
          const p = serialToParts(+vAcc, date1904);
          if (p) {
            v = isoDate(p) + (p.time ? ' ' + pad2(p.H) + ':' + pad2(p.M) + ':' + pad2(p.S) : '');
            k = 2;
          } else { v = vAcc; k = 1; }
        } else { v = vAcc; k = 1; }
      }
    }
    cols[n] = cCol; vals[n] = v; kinds[n] = k; n++;
  }

  const xs = new XmlStream({
    open(name, inner) {
      switch (name) {
        case 'c': {
          const r = getAttr(inner, 'r');
          cCol = r !== undefined ? colFromRef(r) : nextCol;
          nextCol = cCol + 1;
          cType = getAttr(inner, 't') || 'n';
          const s = getAttr(inner, 's');
          cStyle = s === undefined ? 0 : +s;
          vAcc = ''; tAcc = '';
          break;
        }
        case 'v': inV = true; vAcc = ''; break;
        case 'is': inIs = true; tAcc = ''; break;
        case 't': if (inIs && !inRPh) inT = true; break;
        case 'rPh': inRPh = true; break;
        case 'row': n = 0; nextCol = 0; break;
      }
    },
    close(name) {
      switch (name) {
        case 'v': inV = false; break;
        case 't': inT = false; break;
        case 'rPh': inRPh = false; break;
        case 'is': inIs = false; break;
        case 'c': finishCell(); break;
        case 'row':
          if (n > 0 && !stopped && onRow(n, cols, vals, kinds) === true) stopped = true;
          n = 0;
          break;
      }
    },
    text(t, raw) {
      if (inV) vAcc += t;
      else if (inT) tAcc += raw ? t : decodeText(t);
    },
  });

  let bytes = 0;
  const total = entry.usize || 1;
  await streamEntryText(
    wb.zip,
    entry,
    (t) => {
      xs.write(t);
      return stopped; // onRow pode encerrar a leitura antecipadamente (ex.: só o cabeçalho)
    },
    (b) => {
      bytes += b;
      if (onProgress) onProgress(Math.min(1, bytes / total));
    }
  );
  if (!stopped) xs.end();
  return { badSst };
}
