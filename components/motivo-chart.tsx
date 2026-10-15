"use client";

import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { fmtQtd } from "@/lib/formato";
import type { LinhaMotivo } from "@/lib/tipos";

const config = { qtd: { label: "Qtd.", color: "var(--chart-1)" } } satisfies ChartConfig;
const curto = (t: string): string => (t.length > 24 ? t.slice(0, 23) + "…" : t);

/** Motivo da não Execução: barras horizontais ordenadas por quantidade. */
export function MotivoChart({ linhas }: { linhas: LinhaMotivo[] }) {
  const altura = Math.max(96, linhas.length * 34 + 16);
  return (
    <div data-grafico="motivos" className="px-2 py-2">
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height: altura }}>
        <BarChart accessibilityLayer data={linhas} layout="vertical" margin={{ left: 0, right: 30, top: 2, bottom: 2 }} barCategoryGap={6}>
          <YAxis dataKey="rotulo" type="category" width={156} tickLine={false} axisLine={false} tickFormatter={curto} tick={{ fontSize: 11, fontWeight: 700 }} />
          <XAxis type="number" hide />
          <Bar dataKey="qtd" fill="var(--color-qtd)" radius={4} barSize={16} isAnimationActive={false}>
            <LabelList dataKey="qtd" position="right" formatter={(v: unknown) => fmtQtd(Number(v))} className="fill-foreground text-[11px] font-bold" />
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
