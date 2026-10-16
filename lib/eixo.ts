// Escala dos eixos dos gráficos de colunas + linha: os dois eixos têm o mesmo número de divisões,
// para as linhas de grade valerem para as colunas e para a linha.

const PASSOS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/** Eixo de 0 até `max` (com ~12% de folga para o rótulo), em `intervalos` divisões de passo "redondo". */
export function escalaDoEixo(max: number, intervalos = 5, inteiro = false): { max: number; ticks: number[] } {
  let passo = 1;
  if (max > 0) {
    const bruto = (max * 1.12) / intervalos;
    const p = 10 ** Math.floor(Math.log10(bruto));
    passo = PASSOS.map((m) => m * p).find((s) => s >= bruto) ?? 10 * p;
  }
  if (inteiro) passo = Math.max(1, Math.ceil(passo));
  return { max: passo * intervalos, ticks: Array.from({ length: intervalos + 1 }, (_, k) => k * passo) };
}
