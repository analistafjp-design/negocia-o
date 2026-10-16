"use client";

import { Minus, Plus } from "lucide-react";
import { AjustarALargura } from "@/components/ajustar-a-largura";
import { fmtQtd, fmtR2 } from "@/lib/formato";
import type { Medidas, NoArvore } from "@/lib/tipos";
import { cn } from "@/lib/utils";

interface Props {
  linhas: NoArvore[];
  total: Medidas;
  aberto: Record<string, boolean>;
  aoAlternar: (id: string, aberto: boolean) => void;
}

const NO = "grid items-center rounded-[10px] border border-marca-linha bg-white";
const QTD = "text-right font-extrabold tabular-nums";
const VALOR = "text-right text-muted-foreground tabular-nums";

function Alternar({ rotulo, abre, aoClicar }: { rotulo: string; abre: boolean; aoClicar: () => void }) {
  const Icone = abre ? Minus : Plus;
  return (
    <button
      type="button"
      aria-expanded={abre}
      aria-label={(abre ? "Recolher " : "Expandir ") + rotulo}
      onClick={aoClicar}
      className="grid size-5 place-items-center rounded-full border-[1.5px] border-marca text-marca hover:bg-marca-suave focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icone className="size-3" strokeWidth={3} aria-hidden />
    </button>
  );
}

function Ramo({ no, aberto, aoAlternar }: { no: NoArvore; aberto: Props["aberto"]; aoAlternar: Props["aoAlternar"] }) {
  const abre = no.id in aberto ? aberto[no.id] : no.nivel === 0;
  const temFilhos = no.filhos.length > 0;
  const botao = temFilhos ? <Alternar rotulo={no.rotulo} abre={abre} aoClicar={() => aoAlternar(no.id, !abre)} /> : <span />;
  return (
    <li className="arv-k">
      {no.nivel === 0 ? (
        // Cluster Perfil
        <div data-nivel={0} data-linha={no.rotulo} className={cn(NO, "grid-cols-[minmax(0,1fr)_auto_auto] gap-x-2.5 border-l-[5px] border-l-marca bg-marca-suave px-3.5 py-2.5 xl:w-[260px]")}>
          <span className="font-extrabold text-marca-escura">{no.rotulo}</span>
          <span className="text-[22px] leading-none font-extrabold text-marca tabular-nums">{fmtQtd(no.m.total)}</span>
          {botao}
          <span className="col-span-3 -mt-0.5 font-semibold text-tabela-texto tabular-nums">{fmtR2(no.m.valTotal)}</span>
        </div>
      ) : no.nivel === 1 ? (
        // Frente de serviço
        <div data-nivel={1} data-linha={no.rotulo} className={cn(NO, "grid-cols-[minmax(0,1fr)_2.75rem_6.25rem_1.5rem] gap-x-2.5 py-1.5 pr-2.5 pl-3.5 text-sm xl:w-[370px]")}>
          <span>{no.rotulo}</span>
          <span className={QTD}>{fmtQtd(no.m.total)}</span>
          <span className={VALOR}>{fmtR2(no.m.valTotal)}</span>
          {botao}
        </div>
      ) : (
        // Recurso
        <div data-nivel={no.nivel} data-linha={no.rotulo} className={cn(NO, "grid-cols-[minmax(0,1fr)_2.75rem_6.25rem] gap-x-2.5 px-3.5 py-1.5 text-sm xl:w-[290px]")}>
          <span>{no.rotulo}</span>
          <span className={QTD}>{fmtQtd(no.m.total)}</span>
          <span className={VALOR}>{fmtR2(no.m.valTotal)}</span>
        </div>
      )}
      {temFilhos && abre ? (
        <ul className="arv-kids">
          {no.filhos.map((f) => (
            <Ramo key={f.id} no={f} aberto={aberto} aoAlternar={aoAlternar} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Negociações Comercial em árvore: Total > cluster > frente de serviço > recurso (o "+" abre e o "−" fecha). */
export function ComercialArvore({ linhas, total, aberto, aoAlternar }: Props) {
  return (
    <div data-arvore="comercial">
      <p className="border-b border-marca-linha bg-tabela px-3.5 py-2 text-xs text-tabela-texto">
        Total › Cluster Perfil › Frente de serviço › Recurso. Use o <strong>+</strong> para abrir e o <strong>−</strong> para fechar; a árvore se ajusta sozinha à largura da tela.
      </p>
      <div className="p-4 xl:p-6">
        <AjustarALargura>
          <ul className="arv arv-raiz">
            <li className="arv-k">
              <div className="rounded-[10px] bg-gradient-to-br from-marca-media to-marca-escura px-4 py-3.5 text-white xl:w-[220px]">
                <p className="text-xs font-semibold opacity-80">Total de negociações</p>
                <p data-total="neg" className="text-[26px] leading-tight font-extrabold tabular-nums">
                  {fmtQtd(total.total)}
                </p>
                <p data-total="valor" className="font-semibold tabular-nums">
                  {fmtR2(total.valTotal)}
                </p>
              </div>
              <ul className="arv-kids">
                {linhas.map((no) => (
                  <Ramo key={no.id} no={no} aberto={aberto} aoAlternar={aoAlternar} />
                ))}
              </ul>
            </li>
          </ul>
        </AjustarALargura>
      </div>
    </div>
  );
}
