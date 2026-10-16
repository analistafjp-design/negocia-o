"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtQtd, fmtR2 } from "@/lib/formato";
import type { LinhaCidade, LinhaTop, Medidas, NoArvore } from "@/lib/tipos";
import { cn } from "@/lib/utils";

const cabecalho = "h-9 bg-tabela px-2 text-center text-xs font-bold tracking-wide text-tabela-texto";
const num = "px-2 py-2 text-right tabular-nums whitespace-nowrap";
/** Linhas alternadas bem suaves nas tabelas planas (a matriz Comercial já separa os grupos pela faixa do cluster). */
const zebra = "even:bg-marca-suave/35";

function Totais({ rotulo, m, vazioNoMeio }: { rotulo: string; m: Medidas; vazioNoMeio?: boolean }) {
  return (
    <TableFooter className="bg-tabela text-sm">
      <TableRow className="border-t border-marca-linha hover:bg-tabela">
        <TableCell className="px-2 py-2 font-bold">{rotulo}</TableCell>
        {vazioNoMeio ? <TableCell /> : null}
        <TableCell data-total="neg" className={cn(num, "font-bold")}>
          {fmtQtd(m.total)}
        </TableCell>
        <TableCell data-total="valor" className={cn(num, "font-bold")}>
          {fmtR2(m.valTotal)}
        </TableCell>
      </TableRow>
    </TableFooter>
  );
}

/** Negociações Comercial: cluster > frente de serviço > recurso, com linhas que abrem e fecham. */
export function ComercialTabela({
  linhas,
  total,
  aberto,
  aoAlternar,
}: {
  linhas: NoArvore[];
  total: Medidas;
  aberto: Record<string, boolean>;
  aoAlternar: (id: string, aberto: boolean) => void;
}) {
  const corpo: React.ReactNode[] = [];
  const visita = (nos: NoArvore[]) => {
    for (const no of nos) {
      const abre = no.id in aberto ? aberto[no.id] : no.nivel === 0;
      const temFilhos = no.filhos.length > 0;
      corpo.push(
        <TableRow key={no.id} data-nivel={no.nivel} data-linha={no.rotulo} className={cn(no.nivel === 0 && "bg-marca-suave/40 font-semibold")}>
          <TableCell className="px-2 py-2 whitespace-normal" style={{ paddingLeft: 8 + no.nivel * 18 }}>
            <div className="flex items-center gap-1">
              {temFilhos ? (
                <button
                  type="button"
                  aria-expanded={abre}
                  aria-label={(abre ? "Recolher " : "Expandir ") + no.rotulo}
                  onClick={() => aoAlternar(no.id, !abre)}
                  className="grid size-5 shrink-0 place-items-center rounded text-tabela-texto hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronRight className={cn("size-3.5 transition-transform", abre && "rotate-90")} />
                </button>
              ) : (
                <span className="size-5 shrink-0" />
              )}
              <span className="break-words">{no.rotulo}</span>
            </div>
          </TableCell>
          <TableCell className={num}>{fmtQtd(no.m.total)}</TableCell>
          <TableCell className={num}>{fmtR2(no.m.valTotal)}</TableCell>
        </TableRow>
      );
      if (temFilhos && abre) visita(no.filhos);
    }
  };
  visita(linhas);
  return (
    <table className="w-full text-sm" data-tabela="comercial">
      <TableCaption className="sr-only">Negociações do setor Comercial por cluster e frente de serviço</TableCaption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={cabecalho}>Cluster Perfil</TableHead>
          <TableHead className={cabecalho}>Neg.</TableHead>
          <TableHead className={cabecalho}>R$</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>{corpo}</TableBody>
      <Totais rotulo="Total" m={total} />
    </table>
  );
}

/** Top 10 Negociações: recurso, posição no ranking, quantidade e valor. */
export function TopTabela({ linhas, total }: { linhas: LinhaTop[]; total: Medidas }) {
  return (
    <table className="w-full text-sm" data-tabela="top10">
      <TableCaption className="sr-only">Recursos com mais negociações no setor Comercial</TableCaption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={cabecalho}>Recurso</TableHead>
          <TableHead className={cabecalho}>Top</TableHead>
          <TableHead className={cabecalho}>Neg.</TableHead>
          <TableHead className={cabecalho}>R$</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {linhas.map((l) => (
          <TableRow key={l.rotulo} data-linha={l.rotulo} className={zebra}>
            <TableCell className="px-2 py-2 whitespace-nowrap">{l.rotulo}</TableCell>
            <TableCell className={num}>
              <span className="inline-grid h-5 min-w-6 place-items-center rounded-full bg-secondary px-1.5 text-xs font-bold">{l.top}</span>
            </TableCell>
            <TableCell className={num}>{fmtQtd(l.m.total)}</TableCell>
            <TableCell className={num}>{fmtR2(l.m.valTotal)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <Totais rotulo="Total" m={total} vazioNoMeio />
    </table>
  );
}

/** Negociação x Cidade. */
export function CidadeTabela({ linhas, total }: { linhas: LinhaCidade[]; total: Medidas }) {
  return (
    <table className="w-full text-sm" data-tabela="cidades">
      <TableCaption className="sr-only">Negociações por cidade</TableCaption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={cabecalho}>Cidade</TableHead>
          <TableHead className={cabecalho}>Qtd.</TableHead>
          <TableHead className={cabecalho} aria-sort="descending" title="Ordenado do maior para o menor valor">
            <span className="inline-flex items-center gap-1">
              Neg. Total
              <ChevronDown className="size-3.5" aria-hidden />
            </span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {linhas.map((l) => (
          <TableRow key={l.rotulo} data-linha={l.rotulo} className={zebra}>
            <TableCell className="px-2 py-2 break-words whitespace-normal">{l.rotulo}</TableCell>
            <TableCell className={num}>{fmtQtd(l.m.total)}</TableCell>
            <TableCell className={num}>{fmtR2(l.m.valTotal)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <Totais rotulo="Total" m={total} />
    </table>
  );
}
