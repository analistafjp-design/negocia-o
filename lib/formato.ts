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
