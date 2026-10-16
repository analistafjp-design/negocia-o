"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Abaixo disso o conteúdo para de encolher e passa a rolar para o lado, para o texto não ficar ilegível. */
const ESCALA_MINIMA = 0.6;

/**
 * Encolhe o conteúdo, sem mexer no layout dele, até caber na largura que existe (os números diminuem um pouco).
 * Mede de novo quando a tela muda de tamanho e quando o conteúdo cresce, por exemplo ao abrir um "+".
 * Em largura que já cabe, não faz nada. O conteúdo precisa ter largura natural própria (em `xl`, `w-max`).
 */
export function AjustarALargura({ children }: { children: ReactNode }) {
  const caixa = useRef<HTMLDivElement>(null);
  const conteudo = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);
  const [altura, setAltura] = useState(0);

  useLayoutEffect(() => {
    const c = caixa.current;
    const i = conteudo.current;
    if (!c || !i) return;
    const medir = () => {
      const natural = i.offsetWidth; // largura sem encolher (a transformação não conta)
      const disponivel = c.clientWidth;
      setEscala(natural > disponivel ? Math.max(disponivel / natural, ESCALA_MINIMA) : 1);
      setAltura(i.offsetHeight);
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(c);
    obs.observe(i);
    return () => obs.disconnect();
  }, []);

  const encolhido = escala < 1;
  return (
    <div ref={caixa} data-ajuste={encolhido ? escala.toFixed(2) : "1"} className="scrollbar-thin overflow-x-auto" style={encolhido ? { height: altura * escala } : undefined}>
      <div ref={conteudo} className="xl:w-max" style={encolhido ? { transform: `scale(${escala})`, transformOrigin: "top left" } : undefined}>
        {children}
      </div>
    </div>
  );
}
