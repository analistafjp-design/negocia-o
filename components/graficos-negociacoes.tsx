"use client";

import { useEffect, useRef, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, LabelList, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { escalaDoEixo } from "@/lib/eixo";
import { fmtMil, fmtQtd, fmtR2 } from "@/lib/formato";
import { reais } from "@/lib/medidas";
import type { LinhaCidade, LinhaTop, Medidas } from "@/lib/tipos";

/** Um ponto do gráfico: coluna e linha, em números (valor em reais; null = BLANK, sem coluna nem rótulo). */
interface Ponto {
  rotulo: string;
  col: number | null;
  lin: number | null;
  /** Textos exatos para o balão. */
  dica: { titulo: string; col: string; lin: string };
  /** Células da linha da tabela escondida (leitor de tela): o mesmo que a tabela do relatório mostra. */
  celulas: Array<string | number>;
}

interface Cores {
  col: string;
  linha: string;
}

interface Props {
  id: string;
  pontos: Ponto[];
  nomeCol: string;
  nomeLin: string;
  fmtCol: (n: number) => string;
  fmtLin: (n: number) => string;
  colInteira: boolean;
  linInteira: boolean;
  cores: Cores;
  /** Rótulo da coluna dentro da base (letra branca) em vez de acima. Só cabe quando as colunas são largas. */
  rotuloDentro: boolean;
  /** Inclinação (graus) dos nomes do eixo X. */
  angulo: number;
  total: Medidas;
}

type Ctx = { x?: number | string; y?: number | string; value?: unknown };
const num = (v: number | string | undefined): number => Number(v ?? 0);
const LARGURA_CARACTERE = 6.4;
const MIN_LARGURA = 600;

function TickInclinado({ x, y, payload, angulo }: { x?: number | string; y?: number | string; payload?: { value?: unknown }; angulo: number }) {
  return (
    <text transform={`translate(${num(x) + 4},${num(y) + 10}) rotate(${-angulo})`} textAnchor="end" className="fill-foreground text-[11.5px]">
      {String(payload?.value ?? "")}
    </text>
  );
}

function Dica({ active, payload, nomeCol, nomeLin }: { active?: boolean; payload?: ReadonlyArray<{ payload?: Ponto }>; nomeCol: string; nomeLin: string }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-bold">{p.dica.titulo}</p>
      <p>
        {nomeCol}: <strong>{p.dica.col}</strong>
      </p>
      <p>
        {nomeLin}: <strong>{p.dica.lin}</strong>
      </p>
    </div>
  );
}

function ColunasLinha({ id, pontos, nomeCol, nomeLin, fmtCol, fmtLin, colInteira, linInteira, cores, rotuloDentro, angulo, total }: Props) {
  const maxCol = Math.max(0, ...pontos.map((p) => p.col ?? 0));
  const maxLin = Math.max(0, ...pontos.map((p) => p.lin ?? 0));
  const ec = escalaDoEixo(maxCol, 5, colInteira);
  const el = escalaDoEixo(maxLin, 5, linInteira);
  const maior = Math.max(0, ...pontos.map((p) => p.rotulo.length));
  const rad = (angulo * Math.PI) / 180;
  const alturaEixo = Math.ceil(maior * LARGURA_CARACTERE * Math.sin(rad)) + 26;
  const largura = Math.max(MIN_LARGURA, pontos.length * 52 + 130);
  const config = { col: { label: nomeCol, color: cores.col }, lin: { label: nomeLin, color: cores.linha } } satisfies ChartConfig;
  // O gráfico tem largura mínima; em tela estreita ele rola para o lado dentro do painel, e um aviso diz isso.
  const rolo = useRef<HTMLDivElement>(null);
  const [rola, setRola] = useState(false);
  useEffect(() => {
    const el = rolo.current;
    if (!el) return;
    const medir = () => setRola(el.scrollWidth > el.clientWidth + 1);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [pontos.length]);
  return (
    <div data-grafico={id}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-marca-linha bg-tabela px-3.5 py-2 text-xs text-tabela-texto">
        <span className="inline-flex items-center gap-1.5">
          <i className="size-3 rounded-[3px]" style={{ background: cores.col }} />
          Colunas: {nomeCol}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="24" height="12" aria-hidden>
            <line x1="0" x2="24" y1="6" y2="6" stroke={cores.linha} strokeWidth="2" />
            <circle cx="12" cy="6" r="3.5" fill="#fff" stroke={cores.linha} strokeWidth="2" />
          </svg>
          Linha: {nomeLin}
        </span>
      </div>
      {rola ? (
        <p data-dica-rolagem className="px-3.5 pt-2 text-[11px] text-tabela-texto">
          Deslize para o lado para ver o gráfico inteiro →
        </p>
      ) : null}
      <div ref={rolo} className="scrollbar-thin overflow-x-auto px-1 pt-3">
        <ChartContainer config={config} className="aspect-auto" style={{ height: 300 + alturaEixo, minWidth: largura, width: "100%" }}>
          <ComposedChart data={pontos} margin={{ top: 22, right: 4, bottom: 0, left: 14 }}>
            <CartesianGrid vertical={false} stroke="var(--marca-linha)" />
            <XAxis dataKey="rotulo" interval={0} height={alturaEixo} tickLine={false} axisLine={{ stroke: "var(--marca-linha)" }} tick={(p: Ctx & { payload?: { value?: unknown } }) => <TickInclinado x={p.x} y={p.y} payload={p.payload} angulo={angulo} />} />
            <YAxis yAxisId="col" orientation="left" width={52} domain={[0, ec.max]} ticks={ec.ticks} tickFormatter={fmtMil} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
            <YAxis yAxisId="lin" orientation="right" width={58} domain={[0, el.max]} ticks={el.ticks} tickFormatter={fmtMil} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
            <Tooltip cursor={{ fill: "var(--marca-suave)", opacity: 0.6 }} content={(p) => <Dica active={p.active} payload={p.payload as ReadonlyArray<{ payload?: Ponto }>} nomeCol={nomeCol} nomeLin={nomeLin} />} />
            <Bar yAxisId="col" dataKey="col" fill={cores.col} radius={[3, 3, 0, 0]} maxBarSize={56} isAnimationActive={false}>
              <LabelList
                dataKey="col"
                position={rotuloDentro ? "insideBottom" : "top"}
                formatter={(v: unknown) => (typeof v === "number" ? fmtCol(v) : "")}
                className={rotuloDentro ? "fill-white text-[11.5px] font-bold" : "fill-foreground text-[11.5px] font-bold"}
              />
            </Bar>
            <Line yAxisId="lin" dataKey="lin" type="linear" stroke={cores.linha} strokeWidth={2.2} dot={{ r: 4, fill: "#fff", stroke: cores.linha, strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false}>
              <LabelList
                dataKey="lin"
                content={(p: Ctx) =>
                  typeof p.value === "number" ? (
                    <text x={num(p.x)} y={num(p.y) - 10} textAnchor="middle" fontSize={11} fontWeight={700} fill={cores.linha} stroke="#fff" strokeWidth={3.5} paintOrder="stroke" strokeLinejoin="round">
                      {fmtLin(p.value)}
                    </text>
                  ) : null
                }
              />
            </Line>
          </ComposedChart>
        </ChartContainer>
      </div>
      <p className="flex flex-wrap items-baseline justify-between gap-x-4 border-t-2 border-marca bg-tabela px-3.5 py-2 text-sm font-bold">
        <span>Total</span>
        <span>
          <span data-total="neg">{fmtQtd(total.total)}</span>
          <span className="mx-2 font-normal text-tabela-texto">·</span>
          <span data-total="valor">{fmtR2(total.valTotal)}</span>
        </span>
      </p>
      {/* os mesmos números, em tabela, para leitor de tela */}
      <table className="sr-only">
        <caption>{nomeCol} e {nomeLin}</caption>
        <tbody>
          {pontos.map((p) => (
            <tr key={p.rotulo} data-linha={p.rotulo}>
              {p.celulas.map((c, i) => (
                <td key={i}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Top 10 Negociações: colunas = quantidade, linha = valor (R$). */
export function TopGrafico({ linhas, total }: { linhas: LinhaTop[]; total: Medidas }) {
  const pontos: Ponto[] = linhas.map((l) => ({
    rotulo: l.rotulo,
    col: l.m.total,
    lin: reais(l.m.valTotal),
    dica: { titulo: `Top ${l.top} · ${l.rotulo}`, col: fmtQtd(l.m.total), lin: fmtR2(l.m.valTotal) },
    celulas: [l.rotulo, l.top, fmtQtd(l.m.total), fmtR2(l.m.valTotal)],
  }));
  return (
    <ColunasLinha
      id="top10"
      pontos={pontos}
      nomeCol="quantidade de negociações"
      nomeLin="valor (R$)"
      fmtCol={fmtQtd}
      fmtLin={fmtMil}
      colInteira
      linInteira={false}
      cores={{ col: "var(--serie-top)", linha: "var(--serie-top-linha)" }}
      rotuloDentro
      angulo={38}
      total={total}
    />
  );
}

/** Negociação x Cidade: colunas = valor (R$), linha = quantidade (a lista vem ordenada por valor). */
export function CidadeGrafico({ linhas, total }: { linhas: LinhaCidade[]; total: Medidas }) {
  const pontos: Ponto[] = linhas.map((l) => ({
    rotulo: l.rotulo,
    col: reais(l.m.valTotal),
    lin: l.m.total,
    dica: { titulo: l.rotulo, col: fmtR2(l.m.valTotal), lin: fmtQtd(l.m.total) },
    celulas: [l.rotulo, fmtQtd(l.m.total), fmtR2(l.m.valTotal)],
  }));
  return (
    <ColunasLinha
      id="cidades"
      pontos={pontos}
      nomeCol="valor (R$)"
      nomeLin="quantidade"
      fmtCol={fmtMil}
      fmtLin={fmtQtd}
      colInteira={false}
      linInteira
      cores={{ col: "var(--serie-cidade)", linha: "var(--serie-cidade-linha)" }}
      rotuloDentro={false}
      angulo={50}
      total={total}
    />
  );
}
