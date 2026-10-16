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
  /** Há arquivo de arrecadação: o valor em destaque é o arrecadado, com o negociado pequeno ("de R$ …") embaixo. */
  temArr: boolean;
}

const NO = "grid items-center rounded-[10px] border border-marca-linha bg-white";
const QTD = "text-right font-extrabold tabular-nums";
const VALOR = "text-right text-muted-foreground tabular-nums";

/** Valor de um nó: o negociado, ou (com arrecadação) o arrecadado em destaque e "de R$ …" negociado embaixo. */
function Valor({ m, temArr, className }: { m: Medidas; temArr: boolean; className: string }) {
  if (!temArr) return <span className={className}>{fmtR2(m.valTotal)}</span>;
  return (
    <span className={cn(className, "leading-tight")}>
      <span data-arrecadado className="block font-semibold text-foreground">
        {fmtR2(m.arrTotal)}
      </span>{" "}
      <span className="block text-[11px]">de {fmtR2(m.valTotal)}</span>
    </span>
  );
}

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

function Ramo({ no, aberto, aoAlternar, temArr }: { no: NoArvore; aberto: Props["aberto"]; aoAlternar: Props["aoAlternar"]; temArr: boolean }) {
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
          {temArr ? (
            <span className="col-span-3 -mt-0.5 leading-tight tabular-nums">
              <span data-arrecadado className="block font-bold text-marca-escura">
                {fmtR2(no.m.arrTotal)}
              </span>{" "}
              <span className="block text-xs font-medium text-tabela-texto">de {fmtR2(no.m.valTotal)} negociados</span>
            </span>
          ) : (
            <span className="col-span-3 -mt-0.5 font-semibold text-tabela-texto tabular-nums">{fmtR2(no.m.valTotal)}</span>
          )}
        </div>
      ) : no.nivel === 1 ? (
        // Frente de serviço
        <div data-nivel={1} data-linha={no.rotulo} className={cn(NO, "grid-cols-[minmax(0,1fr)_2.75rem_6.25rem_1.5rem] gap-x-2.5 py-1.5 pr-2.5 pl-3.5 text-sm xl:w-[360px]")}>
          <span>{no.rotulo}</span>
          <span className={QTD}>{fmtQtd(no.m.total)}</span>
          <Valor m={no.m} temArr={temArr} className={VALOR} />
          {botao}
        </div>
      ) : (
        // Recurso
        <div data-nivel={no.nivel} data-linha={no.rotulo} className={cn(NO, "grid-cols-[minmax(0,1fr)_2.75rem_6.25rem] gap-x-2.5 px-3.5 py-1.5 text-sm xl:w-[290px]")}>
          <span>{no.rotulo}</span>
          <span className={QTD}>{fmtQtd(no.m.total)}</span>
          <Valor m={no.m} temArr={temArr} className={VALOR} />
        </div>
      )}
      {temFilhos && abre ? (
        <ul className="arv-kids">
          {no.filhos.map((f) => (
            <Ramo key={f.id} no={f} aberto={aberto} aoAlternar={aoAlternar} temArr={temArr} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Negociações Comercial em árvore: Total > cluster > frente de serviço > recurso (o "+" abre e o "−" fecha). */
export function ComercialArvore({ linhas, total, aberto, aoAlternar, temArr }: Props) {
  return (
    <div data-arvore="comercial">
      <p className="border-b border-marca-linha bg-tabela px-3.5 py-2 text-xs text-tabela-texto">
        Total › Cluster Perfil › Frente de serviço › Recurso. Use o <strong>+</strong> para abrir e o <strong>−</strong> para fechar; a árvore se ajusta sozinha à largura da tela.
        {temArr ? (
          <>
            {" "}
            Em destaque, o valor <strong>arrecadado</strong> (parcelas quitadas pagas depois da negociação); “de R$ …” é o valor negociado.
          </>
        ) : null}
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
                {temArr ? (
                  <>
                    <p data-total="arrecadado" className="font-bold tabular-nums">
                      {fmtR2(total.arrTotal)}
                    </p>
                    <p className="text-xs font-medium tabular-nums opacity-80">
                      arrecadado de <span data-total="valor">{fmtR2(total.valTotal)}</span> negociados
                    </p>
                  </>
                ) : (
                  <p data-total="valor" className="font-semibold tabular-nums">
                    {fmtR2(total.valTotal)}
                  </p>
                )}
              </div>
              <ul className="arv-kids">
                {linhas.map((no) => (
                  <Ramo key={no.id} no={no} aberto={aberto} aoAlternar={aoAlternar} temArr={temArr} />
                ))}
              </ul>
            </li>
          </ul>
        </AjustarALargura>
      </div>
    </div>
  );
}
