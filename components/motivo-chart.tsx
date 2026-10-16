"use client";

import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { fmtQtd, legivel, quebrar } from "@/lib/formato";
import type { LinhaMotivo } from "@/lib/tipos";

const config = { qtd: { label: "Qtd.", color: "var(--chart-1)" } } satisfies ChartConfig;
const ALTURA_LINHA = 46;
const LINHA_TEXTO = 14;

/** Rótulo do eixo: texto legível (não tudo em maiúsculas), em até 3 linhas centralizadas na altura da barra. */
function Rotulo({ x, y, payload }: { x?: number | string; y?: number | string; payload?: { value?: unknown } }) {
  const original = String(payload?.value ?? "");
  const linhas = quebrar(legivel(original));
  return (
    <text x={x} y={y} textAnchor="end" className="fill-foreground text-xs font-semibold">
      <title>{original}</title>
      {linhas.map((l, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 4 - ((linhas.length - 1) * LINHA_TEXTO) / 2 : LINHA_TEXTO}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

/** Motivo da não Execução: barras horizontais ordenadas por quantidade. */
export function MotivoChart({ linhas }: { linhas: LinhaMotivo[] }) {
  const altura = Math.max(120, linhas.length * ALTURA_LINHA + 16);
  return (
    <div data-grafico="motivos" className="px-2 py-2">
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height: altura }}>
        <BarChart accessibilityLayer data={linhas} layout="vertical" margin={{ left: 0, right: 36, top: 2, bottom: 2 }} barCategoryGap={10}>
          <YAxis dataKey="rotulo" type="category" width={156} tickLine={false} axisLine={false} tick={Rotulo} interval={0} />
          <XAxis type="number" hide />
          <Bar dataKey="qtd" fill="var(--color-qtd)" radius={4} barSize={18} isAnimationActive={false}>
            <LabelList dataKey="qtd" position="right" formatter={(v: unknown) => fmtQtd(Number(v))} className="fill-foreground text-xs font-bold" />
          </Bar>
        </BarChart>
      </ChartContainer>
      {/* os rótulos inteiros e os valores, para leitor de tela */}
      <ul className="sr-only" aria-label="Quantidade por motivo da não execução">
        {linhas.map((l) => (
          <li key={l.rotulo} data-motivo={l.rotulo}>
            {l.rotulo}: {fmtQtd(l.qtd)}
          </li>
        ))}
      </ul>
    </div>
  );
}
