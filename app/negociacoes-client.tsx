"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CircleCheck, FolderOpen, Handshake, Info, RefreshCw, Trash2, TriangleAlert, Upload, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { KpiCard } from "@/components/kpi-card";
import { MotivoChart } from "@/components/motivo-chart";
import { Painel, Vazio } from "@/components/painel";
import { CidadeTabela, ComercialTabela, TopTabela } from "@/components/tabelas-negociacoes";
import { FILTROS_VAZIOS, datasDisponiveis, sanitizarFiltros } from "@/lib/filtros";
import { fmtData, fmtMes, fmtQtd, fmtR0, hhmmss, plural, VAZIO } from "@/lib/formato";
import {
  amigavel,
  carregarArquivos,
  entradasDeArquivos,
  idb,
  listarPasta,
  temIdb,
  temPicker,
  type Entrada,
  type JanelaComPicker,
  type PastaHandle,
} from "@/lib/fontes";
import { SEM_CLUSTER, calcular } from "@/lib/medidas";
import { mensagemDaCarga, type Aviso } from "@/lib/mensagens";
import type { Filtros, Medidas, Modelo, ResultadoArquivo } from "@/lib/tipos";
import { cn } from "@/lib/utils";

interface Fonte {
  kind: "pasta" | "arquivos";
  /** "handle" = acesso contínuo à pasta; "input" = arquivos escolhidos à mão. */
  modo: "handle" | "input";
  nome: string;
  handle?: PastaHandle;
  entradas?: Entrada[];
}

const INTERVALO_MS = 60_000;

// O servidor (export estático) não sabe o que o navegador oferece: o suporte só vale depois de hidratar.
const semAssinatura = () => () => undefined;

const CARDS_QTD: Array<[keyof Medidas, string, boolean?]> = [
  ["principal", "Negociação Principal"],
  ["cadastro", "Cadastro Desdobro"],
  ["corte", "Negociação Corte"],
  ["desdobro", "Negociação Desdobro"],
  ["pos", "Negociação Pós Corte"],
  ["total", "Total Negociações", true],
];
const CARDS_VAL: Array<[keyof Medidas, string, boolean?]> = [
  ["valPrincipal", "Negociação Principal $"],
  ["valCorte", "Negociação $ Desdobro Corte"],
  ["valDesdobro", "Negociação $ Desdobro"],
  ["valPos", "Negociação $ Desdobro Pós Corte"],
  ["valTotal", "Negociação Tot $", true],
];

const ESTILO_AVISO: Record<Aviso["kind"], string> = {
  info: "border-marca-linha bg-marca-suave text-marca-media",
  success: "border-[#cddbd0] bg-[#edf2ee] text-[#2d573a]",
  warning: "border-[#e6dcb9] bg-[#f6f1e3] text-[#6b5416]",
  error: "border-[#e6c9c7] bg-[#f6e9e8] text-[#8a2e2a]",
};

function AvisoView({ aviso, aoFechar }: { aviso: Aviso; aoFechar: () => void }) {
  const Icone = aviso.kind === "success" ? CircleCheck : aviso.kind === "info" ? Info : TriangleAlert;
  return (
    <Alert data-aviso={aviso.kind} role={aviso.kind === "error" ? "alert" : "status"} className={cn("pr-12", ESTILO_AVISO[aviso.kind])}>
      <Icone />
      <AlertTitle className="line-clamp-none">{aviso.title}</AlertTitle>
      <AlertDescription className="col-start-2 text-current/90">
        {aviso.detail ? <p className="break-words">{aviso.detail}</p> : null}
        {aviso.items && aviso.items.length ? (
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            {aviso.items.map((t, i) => (
              <li key={i} className="break-words">
                {t}
              </li>
            ))}
          </ul>
        ) : null}
        {aviso.progress !== undefined ? <Progress className="mt-2 h-1.5" value={Math.round(aviso.progress * 100)} aria-label="Progresso da leitura" /> : null}
        {aviso.actions && aviso.actions.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {aviso.actions.map((a) => (
              <Button key={a.label} size="sm" variant="outline" onClick={a.run}>
                {a.label}
              </Button>
            ))}
          </div>
        ) : null}
      </AlertDescription>
      {aviso.progress === undefined ? (
        <Button variant="ghost" size="icon-xs" className="absolute top-2.5 right-2.5" aria-label="Fechar mensagem" onClick={aoFechar}>
          <X />
        </Button>
      ) : null}
    </Alert>
  );
}

function Filtro({ id, rotulo, valor, aoMudar, desabilitado, children }: { id: string; rotulo: string; valor: string; aoMudar: (v: string) => void; desabilitado: boolean; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1 [&_[data-slot=native-select-wrapper]]:w-full">
      <label htmlFor={id} className="text-[11.5px] font-semibold tracking-wide text-muted-foreground">
        {rotulo}
      </label>
      <NativeSelect id={id} value={valor} disabled={desabilitado} onChange={(e) => aoMudar(e.target.value)} className="w-full">
        {children}
      </NativeSelect>
    </div>
  );
}

export default function NegociacoesClient() {
  const [modelo, setModelo] = useState<Modelo | null>(null);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [aberto, setAberto] = useState<Record<string, boolean>>({});
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [fonte, setFonte] = useState<Fonte | null>(null);
  const [leituraEm, setLeituraEm] = useState<Date | null>(null);
  const [verificadaEm, setVerificadaEm] = useState<Date | null>(null);
  const gravacao = useSyncExternalStore(semAssinatura, temIdb, () => false);

  const cache = useRef(new Map<string, ResultadoArquivo>());
  const assinatura = useRef("");
  const ocupado = useRef(false);
  const modeloRef = useRef<Modelo | null>(null);
  const fonteRef = useRef<Fonte | null>(null);
  const inpArquivos = useRef<HTMLInputElement>(null);
  const inpPasta = useRef<HTMLInputElement>(null);
  const ultimoProgresso = useRef(0);

  useEffect(() => {
    modeloRef.current = modelo;
  }, [modelo]);
  useEffect(() => {
    fonteRef.current = fonte;
  }, [fonte]);

  const visao = useMemo(() => (modelo ? calcular(modelo, filtros) : null), [modelo, filtros]);

  /** Lê os arquivos e atualiza o painel; mantém a base anterior quando nada válido é carregado. */
  /**
   * `soPorNome`: ao ler uma pasta, só entram os .xlsx com "Atividade" ou "Cluster" no nome (como no Power BI).
   * Nos arquivos escolhidos à mão (Importar Excel) vale o que o usuário escolheu.
   */
  const carregar = useCallback(async (entradas: Entrada[], auto: boolean, nomeFonte: string, soPorNome: boolean) => {
    if (ocupado.current) return;
    ocupado.current = true;
    setCarregando(true);
    try {
      const rel = await carregarArquivos(entradas, {
        cache: cache.current,
        assinaturaAnterior: assinatura.current,
        auto,
        soPorNome,
        temModelo: modeloRef.current !== null,
        onProgresso: (p) => {
          if (auto || (p.fracao < 1 && Date.now() - ultimoProgresso.current < 120)) return;
          ultimoProgresso.current = Date.now();
          setAviso({
            kind: "info",
            title: "Lendo arquivos…",
            detail: `Arquivo ${p.indice + 1} de ${p.total}: ${p.arquivo} — ${p.fase} (${Math.round(p.fracao * 100)}%)`,
            progress: (p.indice + p.fracao) / p.total,
          });
        },
      });
      setVerificadaEm(new Date());
      const msg = mensagemDaCarga(rel, { auto, fonte: nomeFonte, temModeloAnterior: modeloRef.current !== null });
      if (rel.modelo) {
        assinatura.current = rel.assinatura;
        const novo = rel.modelo;
        setFiltros((f) => sanitizarFiltros(f, novo.opcoes, modeloRef.current === null));
        setModelo(novo);
        setLeituraEm(new Date());
      }
      if (msg) setAviso(msg);
      else if (!rel.modelo) setAviso(null);
    } catch (err) {
      setAviso({ kind: "error", title: "Erro ao atualizar", detail: amigavel(err) + (modeloRef.current ? " A base anterior foi mantida." : "") });
    } finally {
      ocupado.current = false;
      setCarregando(false);
    }
  }, []);

  const lerPasta = useCallback(
    async (f: Fonte, auto: boolean) => {
      if (!f.handle) return;
      try {
        let perm = await f.handle.queryPermission({ mode: "read" });
        if (perm !== "granted") {
          if (auto) {
            setAviso({ kind: "warning", title: "Permissão de acesso à pasta expirou", detail: 'Clique em "Atualizar" para autorizar novamente. A base atual continua na tela.' });
            return;
          }
          perm = await f.handle.requestPermission({ mode: "read" });
          if (perm !== "granted") {
            setAviso({ kind: "error", title: "Acesso à pasta não autorizado", detail: "Sem permissão de leitura não é possível atualizar. A base atual foi mantida." });
            return;
          }
        }
        await carregar(await listarPasta(f.handle), auto, f.nome, true);
      } catch (err) {
        setAviso({ kind: "error", title: "Não foi possível ler a pasta", detail: amigavel(err) + (modeloRef.current ? " A base anterior foi mantida." : "") });
      }
    },
    [carregar]
  );

  const conectarPasta = useCallback(async () => {
    const janela = window as JanelaComPicker;
    if (janela.showDirectoryPicker) {
      let handle: PastaHandle;
      try {
        handle = await janela.showDirectoryPicker({ id: "negociacoes-interior", mode: "read" });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setAviso({ kind: "error", title: "Não foi possível abrir o seletor de pasta", detail: err instanceof Error ? err.message : String(err) });
        return;
      }
      const nova: Fonte = { kind: "pasta", modo: "handle", nome: handle.name, handle };
      setFonte(nova);
      assinatura.current = "";
      if (temIdb()) idb.set("pasta", handle).catch(() => undefined);
      await lerPasta(nova, false);
    } else {
      inpPasta.current?.click();
    }
  }, [lerPasta]);

  const atualizar = useCallback(() => {
    const f = fonteRef.current;
    if (!f) return void conectarPasta();
    if (f.modo === "handle") return void lerPasta(f, false);
    if (f.kind === "pasta") {
      setAviso({ kind: "info", title: "Selecione a pasta novamente", detail: "Este navegador não mantém acesso contínuo à pasta. Escolha-a de novo para reler os arquivos." });
      inpPasta.current?.click();
    } else {
      setAviso({ kind: "info", title: "Selecione os arquivos novamente", detail: "A importação manual não monitora os arquivos. Selecione-os de novo para reler." });
      inpArquivos.current?.click();
    }
  }, [conectarPasta, lerPasta]);

  const aoEscolherPasta = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivos = e.target.files;
    if (!arquivos || !arquivos.length) return;
    const primeiro = (arquivos[0] as File & { webkitRelativePath?: string }).webkitRelativePath || "";
    const nova: Fonte = { kind: "pasta", modo: "input", nome: primeiro.split("/")[0] || "pasta selecionada", entradas: entradasDeArquivos(arquivos) };
    setFonte(nova);
    assinatura.current = "";
    void carregar(nova.entradas as Entrada[], false, nova.nome, true);
    e.target.value = "";
  };
  const aoEscolherArquivos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivos = e.target.files;
    if (!arquivos || !arquivos.length) return;
    const nova: Fonte = {
      kind: "arquivos",
      modo: "input",
      nome: `${arquivos.length} ${plural(arquivos.length, "arquivo selecionado", "arquivos selecionados")}`,
      entradas: entradasDeArquivos(arquivos),
    };
    setFonte(nova);
    assinatura.current = "";
    void carregar(nova.entradas as Entrada[], false, nova.nome, false);
    e.target.value = "";
  };

  // Ao abrir: volta para a última pasta usada (se o navegador ainda lembrar da permissão).
  useEffect(() => {
    if (!temPicker() || !temIdb()) return;
    let vivo = true;
    (async () => {
      let handle: PastaHandle | undefined;
      try {
        handle = await idb.get<PastaHandle>("pasta");
      } catch {
        return;
      }
      if (!handle || !vivo || fonteRef.current) return;
      const f: Fonte = { kind: "pasta", modo: "handle", nome: handle.name, handle };
      setFonte(f);
      let perm: PermissionState = "prompt";
      try {
        perm = await handle.queryPermission({ mode: "read" });
      } catch {
        /* ignora */
      }
      if (perm === "granted") await lerPasta(f, false);
      else {
        setAviso({
          kind: "info",
          title: `Última pasta usada: "${handle.name}"`,
          detail: "Autorize a leitura para carregar os arquivos novamente.",
          actions: [{ label: "Reconectar pasta", run: () => void lerPasta(f, false) }],
        });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [lerPasta]);

  // Leitura periódica (60 s) apenas com a página visível e acesso contínuo autorizado.
  useEffect(() => {
    const verificar = () => {
      const f = fonteRef.current;
      if (document.visibilityState !== "visible" || ocupado.current || !f || f.modo !== "handle") return;
      void lerPasta(f, true);
    };
    const t = setInterval(verificar, INTERVALO_MS);
    return () => clearInterval(t);
  }, [lerPasta]);

  const apagarGravados = useCallback(async () => {
    try {
      await idb.arquivoLimpar(null);
    } catch {
      /* nada gravado */
    }
    cache.current.clear();
    assinatura.current = "";
    setAviso({ kind: "success", title: "Dados gravados apagados", detail: "Os resultados lidos dos arquivos que ficavam guardados neste navegador foram removidos. Na próxima leitura os arquivos são lidos de novo." });
  }, []);

  const mudarFiltro = (campo: keyof Filtros, valor: string) => {
    if (!modelo) return;
    setFiltros((f) => sanitizarFiltros({ ...f, [campo]: valor }, modelo.opcoes, false));
  };

  const op = modelo?.opcoes;
  const cards = visao?.cards ?? null;
  const valorCard = (k: keyof Medidas, dinheiro: boolean): string => {
    const v = cards ? cards[k] : null;
    return dinheiro ? fmtR0(v) : fmtQtd(v);
  };
  const temDados = modelo !== null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <input ref={inpArquivos} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" multiple hidden data-entrada="arquivos" onChange={aoEscolherArquivos} />
      <input ref={inpPasta} type="file" multiple hidden data-entrada="pasta" onChange={aoEscolherPasta} {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)} />

      <header className="border-b border-white/10 bg-gradient-to-r from-marca-media to-marca-escura text-white">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-3 py-4 sm:px-5 sm:py-5 lg:px-8 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/10 sm:size-12 sm:rounded-2xl">
              <Handshake className="size-6 text-white" />
            </div>
            <h1 className="text-[clamp(1.25rem,2.6vw,1.75rem)] leading-tight font-bold tracking-tight">Negociação</h1>
          </div>
          <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:flex xl:w-auto xl:flex-wrap xl:items-center">
            <div className="mr-2 min-w-0 text-xs text-white/60">
              {leituraEm ? <p data-ultima-leitura>Atualizado às {hhmmss(leituraEm)}</p> : null}
              {fonte?.modo === "handle" && verificadaEm ? <p className="text-[11px] text-white/45">Verificação automática a cada 60 s</p> : null}
            </div>
            <Button
              data-acao="pasta"
              className="w-full bg-white whitespace-nowrap text-marca-escura hover:bg-marca-suave xl:w-auto"
              onClick={() => void (fonte?.modo === "handle" || temDados ? atualizar() : conectarPasta())}
              disabled={carregando}
            >
              {carregando ? <RefreshCw className="animate-spin" /> : fonte || temDados ? <RefreshCw /> : <FolderOpen />}
              {carregando ? "Lendo…" : fonte || temDados ? "Atualizar" : "Conectar pasta"}
            </Button>
            {fonte ? (
              <Button
                data-acao="trocar-pasta"
                variant="outline"
                className="w-full border-white/25 bg-white/10 whitespace-nowrap text-white hover:bg-white/20 hover:text-white xl:w-auto"
                onClick={() => void conectarPasta()}
                disabled={carregando}
              >
                <FolderOpen />
                Trocar pasta
              </Button>
            ) : null}
            <Button
              data-acao="importar"
              variant="outline"
              className="w-full border-white/25 bg-white/10 whitespace-nowrap text-white hover:bg-white/20 hover:text-white xl:w-auto"
              onClick={() => inpArquivos.current?.click()}
              disabled={carregando}
            >
              <Upload />
              Importar Excel
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1500px] space-y-4 px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
        {aviso ? <AvisoView aviso={aviso} aoFechar={() => setAviso(null)} /> : null}

        <Card className="py-0 shadow-sm" aria-label="Filtros">
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Filtro id="f-frente" rotulo="Frente de serviço" valor={filtros.frente} aoMudar={(v) => mudarFiltro("frente", v)} desabilitado={!op}>
              <NativeSelectOption value="">Todas</NativeSelectOption>
              {(op?.frentes ?? []).map((x) => (
                <NativeSelectOption key={x} value={x}>
                  {x}
                </NativeSelectOption>
              ))}
            </Filtro>
            <Filtro id="f-cluster" rotulo="Cluster" valor={filtros.cluster} aoMudar={(v) => mudarFiltro("cluster", v)} desabilitado={!op}>
              <NativeSelectOption value="">Todos</NativeSelectOption>
              {(op?.clusters ?? []).map((x) => (
                <NativeSelectOption key={x} value={x}>
                  {x}
                </NativeSelectOption>
              ))}
              {op?.temSemCluster ? <NativeSelectOption value={SEM_CLUSTER}>(sem cluster)</NativeSelectOption> : null}
            </Filtro>
            <Filtro id="f-mes" rotulo="Mês/ano" valor={filtros.mes} aoMudar={(v) => mudarFiltro("mes", v)} desabilitado={!op}>
              <NativeSelectOption value="">Todos</NativeSelectOption>
              {(op?.meses ?? []).map((x) => (
                <NativeSelectOption key={x} value={x}>
                  {fmtMes(x)}
                </NativeSelectOption>
              ))}
            </Filtro>
            <Filtro id="f-data" rotulo="Data" valor={filtros.data} aoMudar={(v) => mudarFiltro("data", v)} desabilitado={!op}>
              <NativeSelectOption value="">Todas</NativeSelectOption>
              {(op ? datasDisponiveis(op, filtros.mes) : []).map((x) => (
                <NativeSelectOption key={x} value={x}>
                  {fmtData(x)}
                </NativeSelectOption>
              ))}
            </Filtro>
          </CardContent>
        </Card>

        <section aria-label="Quantidade de negociações" className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
          {CARDS_QTD.map(([k, rotulo, destaque]) => (
            <KpiCard key={k} id={k} rotulo={rotulo} valor={valorCard(k, false)} destaque={destaque} />
          ))}
        </section>
        <section aria-label="Valor negociado" className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
          {CARDS_VAL.map(([k, rotulo, destaque]) => (
            <KpiCard key={k} id={k} rotulo={rotulo} valor={valorCard(k, true)} destaque={destaque} />
          ))}
        </section>

        <section aria-label="Detalhamento" className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1.05fr_1.05fr]">
          <Painel id="comercial" titulo="Negociações Comercial">
            {visao && visao.comercial.linhas.length ? (
              <ComercialTabela
                linhas={visao.comercial.linhas}
                total={visao.comercial.total}
                aberto={aberto}
                aoAlternar={(id, abre) => setAberto((a) => ({ ...a, [id]: abre }))}
              />
            ) : (
              <Vazio texto={temDados ? "Sem negociações neste filtro." : "Conecte a pasta para ver os dados."} />
            )}
          </Painel>
          <Painel id="top10" titulo="Top 10 Negociações">
            {visao && visao.top10.linhas.length ? (
              <TopTabela linhas={visao.top10.linhas} total={visao.top10.total} />
            ) : (
              <Vazio texto={temDados ? "Sem negociações neste filtro." : "Conecte a pasta para ver os dados."} />
            )}
          </Painel>
          <Painel id="cidade" titulo="Negociação x Cidade">
            {visao && visao.cidades.linhas.length ? (
              <CidadeTabela linhas={visao.cidades.linhas} total={visao.cidades.total} />
            ) : (
              <Vazio texto={temDados ? "Sem negociações neste filtro." : "Conecte a pasta para ver os dados."} />
            )}
          </Painel>
          <Painel id="motivo" titulo="Motivo da não Execução">
            {visao && visao.motivos.length ? (
              <MotivoChart linhas={visao.motivos} />
            ) : (
              <Vazio texto={temDados ? "Nenhum motivo de não execução neste filtro." : "Conecte a pasta para ver os dados."} />
            )}
          </Painel>
        </section>

        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pb-4 text-xs text-muted-foreground">
          <p className="min-w-[260px] flex-1 break-words" data-rodape>
            {fonte ? (
              <>
                Fonte: <strong className="font-semibold text-foreground">{fonte.nome}</strong>
                {leituraEm ? ` · lida às ${hhmmss(leituraEm)}` : ""}
                {fonte.modo === "handle" && verificadaEm ? ` · verificada às ${hhmmss(verificadaEm)}` : ""}
              </>
            ) : (
              "Regras iguais às do relatório “Negociações” do Power BI. Nenhum dado sai deste computador."
            )}
            {temDados ? ` · ${VAZIO} = sem registros` : ""}
          </p>
          {gravacao ? (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void apagarGravados()}>
              <Trash2 />
              Apagar dados gravados neste navegador
            </Button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
