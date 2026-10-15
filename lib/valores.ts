// Datas e valores das planilhas (formato brasileiro e números seriais do Excel).
// Vem do painel Pós-Corte Interior, já em TypeScript.

export interface PartesData {
  y: number;
  m: number;
  d: number;
  H: number;
  M: number;
  S: number;
  time: boolean;
}

/** Tipo da célula lida: 0 texto, 1 número cru, 2 número com formato de data (já convertido para texto ISO). */
export type TipoCelula = 0 | 1 | 2;

export const pad2 = (n: number): string => (n < 10 ? "0" + n : "" + n);

function validYMD(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || y < 1900 || y > 2200) return false;
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return d <= dim;
}

/** Data serial do Excel -> partes da data. */
export function serialToParts(serial: number, date1904: boolean): PartesData | null {
  if (!isFinite(serial) || serial < 1 || serial > 2958465) return null;
  let days = Math.floor(serial);
  let secs = Math.round((serial - days) * 86400);
  if (secs >= 86400) {
    secs -= 86400;
    days += 1;
  }
  const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const d = new Date(base + days * 86400000);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    H: Math.floor(secs / 3600),
    M: Math.floor((secs % 3600) / 60),
    S: secs % 60,
    time: secs > 0,
  };
}

const RE_DATE_BR = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?)?\s*$/;
const RE_DATE_ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]+(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?)?(?:Z|[+-]\d{2}:?\d{2})?\s*$/;

/** Texto de data (dd/mm/aaaa, aaaa-mm-dd, com ou sem hora) -> partes, ou null. */
export function parseDateText(texto: string): PartesData | null {
  const s = String(texto).trim();
  if (!s) return null;
  let y: number, mo: number, d: number, H: number, M: number, S: number, time: boolean;
  let m = RE_DATE_ISO.exec(s);
  if (m) {
    y = +m[1];
    mo = +m[2];
    d = +m[3];
    H = m[4] ? +m[4] : 0;
    M = m[5] ? +m[5] : 0;
    S = m[6] ? +m[6] : 0;
    time = m[4] !== undefined;
  } else if ((m = RE_DATE_BR.exec(s))) {
    d = +m[1];
    mo = +m[2];
    y = +m[3];
    if (m[3].length === 2) y += 2000;
    H = m[4] ? +m[4] : 0;
    M = m[5] ? +m[5] : 0;
    S = m[6] ? +m[6] : 0;
    time = m[4] !== undefined;
  } else {
    return null;
  }
  if (!validYMD(y, mo, d) || H > 23 || M > 59 || S > 59) return null;
  return { y, m: mo, d, H, M, S, time };
}

/** Interpreta o valor de uma célula de data (texto, número serial ou texto ISO já convertido). */
export function parseDateValue(val: string | undefined | null, kind: TipoCelula, date1904: boolean): PartesData | null {
  if (val == null || val === "") return null;
  if (kind === 1) {
    const n = Number(val);
    return n >= 20000 && n < 80000 ? serialToParts(n, date1904) : null;
  }
  const p = parseDateText(val);
  if (p) return p;
  if (kind === 0 && /^\d{5}(\.\d+)?$/.test(String(val).trim())) {
    const n = Number(val);
    return n >= 20000 && n < 80000 ? serialToParts(n, date1904) : null;
  }
  return null;
}

export const isoDate = (p: PartesData): string => p.y + "-" + pad2(p.m) + "-" + pad2(p.d);

/** Valor monetário no padrão brasileiro (R$ 1.234,56). Devolve número, null (vazio) ou NaN (ilegível). */
export function parseValor(val: string | undefined | null, kind: TipoCelula): number | null {
  if (val == null) return null;
  if (kind === 1) {
    const n = Number(val);
    return isFinite(n) ? n : NaN;
  }
  let s = String(val).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/R\s*\$/gi, "").replace(/\s+/g, "");
  if (s === "") return null; // "R$ " sozinho = sem valor informado
  if (/^[-−]/.test(s)) {
    neg = !neg;
    s = s.slice(1);
  }
  if (!/^[.,]?\d[\d.,]*$/.test(s)) return NaN; // aceita ",03"
  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;
  if (dots && commas) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (commas) {
    s = commas === 1 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (dots) {
    if (dots > 1) s = s.replace(/\./g, "");
    else if (/^[1-9]\d{0,2}\.\d{3}$/.test(s)) s = s.replace(".", "");
  }
  const n = Number(s);
  if (!isFinite(n)) return NaN;
  return neg ? -n : n;
}
