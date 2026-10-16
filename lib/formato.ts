// Formatação de números, valores e datas para a tela (pt-BR).
import { reais } from "./medidas.ts";

/** BLANK do Power BI. */
export const VAZIO = "—";

const nf = new Intl.NumberFormat("pt-BR");
const brl0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brl2 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const fmtQtd = (n: number | null | undefined): string => (n === null || n === undefined ? VAZIO : nf.format(n));
/** Valor em reais sem centavos (cartões). `v` em milésimos de centavo. */
export const fmtR0 = (v: number | null): string => (v === null ? VAZIO : brl0.format(reais(v) as number));
/** Valor em reais com centavos (tabelas). `v` em milésimos de centavo. */
export const fmtR2 = (v: number | null): string => (v === null ? VAZIO : brl2.format(reais(v) as number));

export const plural = (n: number, um: string, varios: string): string => (n === 1 ? um : varios);
const pad2 = (n: number): string => (n < 10 ? "0" + n : "" + n);
export const hhmmss = (d: Date): string => pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "2026-09" -> "set/2026" */
export const fmtMes = (ym: string): string => MESES[+ym.slice(5, 7) - 1] + "/" + ym.slice(0, 4);
/** "2026-09-29" -> "29/09/2026" */
export const fmtData = (iso: string): string => iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4);

const PEQUENAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o", "para", "por", "com"]);
/** "DUPLICIDADE DE MATRÍCULA" -> "Duplicidade de Matrícula". Só mexe em texto que vem todo em maiúsculas; o resto fica como veio. */
export function legivel(t: string): string {
  if (t !== t.toUpperCase() || t === t.toLowerCase()) return t;
  return t
    .toLowerCase()
    .split(" ")
    .map((p, i) => (i > 0 && PEQUENAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

/** Quebra o texto em até `maxLinhas` linhas de ~`max` caracteres, sem cortar palavra; o que passar vira "…" na última linha. */
export function quebrar(t: string, max = 22, maxLinhas = 3): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of t.split(" ").filter(Boolean)) {
    if (atual && (atual + " " + palavra).length > max && linhas.length < maxLinhas - 1) {
      linhas.push(atual);
      atual = palavra;
    } else atual = atual ? atual + " " + palavra : palavra;
  }
  if (atual) linhas.push(atual);
  const ultima = linhas.length - 1;
  if (ultima >= 0 && linhas[ultima].length > max + 4) linhas[ultima] = linhas[ultima].slice(0, max + 3) + "…";
  return linhas;
}
