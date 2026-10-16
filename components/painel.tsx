import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Painel com a faixa de título em azul; o conteúdo cresce por inteiro (sem rolagem interna), então o Total fica sempre à vista. */
export function Painel({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <Card data-painel={id} className="gap-0 overflow-hidden py-0 shadow-sm" aria-labelledby={`t-${id}`}>
      <CardHeader className="bg-gradient-to-r from-marca-media to-marca-escura px-4 py-2.5">
        <CardTitle id={`t-${id}`} className="text-center text-sm font-bold tracking-wide text-white">
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent className="scrollbar-thin min-h-[120px] overflow-x-auto p-0">{children}</CardContent>
    </Card>
  );
}

export function Vazio({ texto }: { texto: string }) {
  return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{texto}</p>;
}
