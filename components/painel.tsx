import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Painel com a faixa de título em grafite e o conteúdo com rolagem própria. */
export function Painel({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <Card data-painel={id} className="gap-0 overflow-hidden py-0 shadow-sm" aria-labelledby={`t-${id}`}>
      <CardHeader className="bg-gradient-to-r from-marca-media to-marca-escura px-4 py-2.5">
        <CardTitle id={`t-${id}`} className="text-center text-sm font-bold tracking-wide text-white">
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent className="scrollbar-thin max-h-[520px] min-h-[120px] overflow-auto p-0 xl:max-h-[560px]">{children}</CardContent>
    </Card>
  );
}

export function Vazio({ texto }: { texto: string }) {
  return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{texto}</p>;
}
