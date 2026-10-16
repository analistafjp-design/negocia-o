"use client";

import { ChevronRight } from "lucide-react";
import { TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtQtd, fmtR2 } from "@/lib/formato";
import type { Medidas, NoArvore } from "@/lib/tipos";
import { cn } from "@/lib/utils";

const cabecalho = "h-9 bg-tabela px-2 text-center text-xs font-bold tracking-wide text-tabela-texto";
const num = "px-2 py-2 text-right tabular-nums whitespace-nowrap";

function Totais({ rotulo, m }: { rotulo: string; m: Medidas }) {
  return (
    <TableFooter className="bg-tabela text-sm">
      <TableRow className="border-t border-marca-linha hover:bg-tabela">
        <TableCell className="px-2 py-2 font-bold">{rotulo}</TableCell>
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
