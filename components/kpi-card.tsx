import { Card, CardContent } from "@/components/ui/card";
import { VAZIO } from "@/lib/formato";
import { cn } from "@/lib/utils";

/**
 * Cartão de um indicador: rótulo e valor. O destaque (Total) usa o azul cheio.
 * `negociado`: com arquivo de arrecadação o valor grande é o arrecadado e o negociado vem pequeno logo abaixo.
 */
export function KpiCard({ id, rotulo, valor, destaque, negociado }: { id: string; rotulo: string; valor: string; destaque?: boolean; negociado?: string }) {
  const vazio = valor === VAZIO;
  return (
    <Card
      data-kpi={id}
      className={cn("gap-0 py-3.5 shadow-sm", destaque && "border-transparent bg-gradient-to-br from-marca-media to-marca text-white")}
    >
      <CardContent className="px-4">
        <p className={cn("text-xs leading-snug font-semibold", destaque ? "text-white/75" : "text-muted-foreground")}>{rotulo}</p>
        <p
          data-kpi-valor
          title={vazio ? "Sem registros no período" : undefined}
          className={cn(
            "kpi-valor mt-1.5 text-[clamp(1.5rem,2.1vw,1.9rem)] leading-tight font-bold tracking-tight break-words",
            vazio && (destaque ? "text-white/55" : "text-[#a9b4cc]")
          )}
        >
          {valor}
        </p>
        {negociado !== undefined ? (
          <p data-kpi-negociado className={cn("mt-0.5 text-xs font-medium tabular-nums", destaque ? "text-white/75" : "text-muted-foreground")}>
            arrecadado de {negociado} negociados
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
