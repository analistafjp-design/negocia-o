"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Abaixo disso o conteúdo para de encolher e passa a rolar para o lado, para o texto não ficar ilegível. */
const ESCALA_MINIMA = 0.6;
/** Folga (px) que sobra à direita quando o conteúdo encolhe, para ele não ficar colado na borda do painel. */
const FOLGA = 12;

/**
 * Encolhe o conteúdo, sem mexer no layout dele, até caber na largura que existe (os números diminuem um pouco).
 * Mede de novo quando a tela muda de tamanho e quando o conteúdo cresce, por exemplo ao abrir um "+".
 * Em largura que já cabe, não faz nada. O conteúdo precisa ter largura natural própria (em `xl`, `w-max`).
 */
export function AjustarALargura({ children }: { children: ReactNode }) {
  const caixa = useRef<HTMLDivElement>(null);
  const conteudo = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);
  const [natural, setNatural] = useState({ largura: 0, altura: 0 });

  useLayoutEffect(() => {
    const c = caixa.current;
    const i = conteudo.current;
    if (!c || !i) return;
    const medir = () => {
      const largura = i.offsetWidth; // largura sem encolher (a transformação não conta)
      const disponivel = c.clientWidth - FOLGA;
      setEscala(largura > disponivel ? Math.max(disponivel / largura, ESCALA_MINIMA) : 1);
      setNatural({ largura, altura: i.offsetHeight });
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(c);
    obs.observe(i);
    return () => obs.disconnect();
  }, []);

  const encolhido = escala < 1;
  // A transformação não muda o tamanho do layout; por isso o conteúdo encolhido fica numa caixa com o tamanho já
  // encolhido (e o que sobra do tamanho original é cortado). Assim não aparece rolagem à toa, nem na horizontal nem na
  // vertical; só rola para o lado se nem na escala mínima ele couber.
  return (
    <div ref={caixa} data-ajuste={encolhido ? escala.toFixed(2) : "1"} className="scrollbar-thin overflow-x-auto overflow-y-hidden">
      <div
        className={encolhido ? "overflow-hidden" : undefined}
        style={encolhido ? { width: Math.ceil(natural.largura * escala) + 2, height: Math.ceil(natural.altura * escala) + 2 } : undefined}
      >
        <div ref={conteudo} className="xl:w-max" style={encolhido ? { transform: `scale(${escala})`, transformOrigin: "top left" } : undefined}>
          {children}
        </div>
      </div>
    </div>
  );
}
