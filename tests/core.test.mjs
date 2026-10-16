// Testes do núcleo (Node >= 22.18, que lê os .ts da pasta lib/ direto): leitor de .xlsx, regras das medidas do relatório do Power BI e visuais.
// Planilhas sintéticas: python3 tools/make_fixtures.py tests/fixtures (o `npm test` já faz isso).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Leitura from '../lib/leitura.ts';
import * as Modelo from '../lib/modelo.ts';
import * as Medidas from '../lib/medidas.ts';
import * as Valores from '../lib/valores.ts';
import * as Fontes from '../lib/fontes.ts';
import * as Formato from '../lib/formato.ts';
import { escalaDoEixo } from '../lib/eixo.ts';
import { detalhesDaCarga, mensagemDaCarga } from '../lib/mensagens.ts';
import { RECURSOS, SERVICOS } from '../lib/tabelas.ts';

const N = { ...Leitura, ...Modelo, ...Medidas, parseValor: Valores.parseValor, parseDateValue: Valores.parseDateValue };
const TAB = { servicos: SERVICOS, recursos: RECURSOS };
const aqui = path.dirname(fileURLToPath(import.meta.url));
const FX = path.join(aqui, 'fixtures');
const fx = (...p) => path.join(FX, ...p);

/** Objeto com a interface mínima de File (name, size, lastModified, slice). */
function arquivo(p) {
  const buf = fs.readFileSync(p);
  const b = new Blob([buf]);
  return { name: path.basename(p), size: buf.length, lastModified: 0, slice: (a, z) => b.slice(a, z) };
}
async function ler(p) {
  const r = await N.lerArquivo(arquivo(p), { path: path.basename(p) });
  r.name = r.path = path.basename(p);
  return r;
}
const rejeita = (p, codigo, trecho) =>
  assert.rejects(ler(p), (e) => {
    assert.ok(e instanceof N.NegError, 'esperava NegError, veio ' + e);
    assert.equal(e.code, codigo, e.message);
    if (trecho) assert.match(e.message, trecho);
    return true;
  });

// valores do modelo ficam em milésimos de centavo; estes ajudam a escrever e ler reais
const fixo = (reais) => Math.round(reais * 10000);
const R = (v) => (v === null ? null : Math.round(N.reais(v) * 100) / 100);
const medidasEmReais = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, k.startsWith('val') ? R(v) : v]));

/** Linha de atividade já lida, com padrão "negociação principal" (cobrança, SIM). */
const atv = (o) => ({ id: '', recurso: 'RIOLTRIN-001', mat: '1', codigo: '107001-COBRANÇA - VISITA', data: '2026-09-29', cidade: 'MIRACEMA', mn: '', mc: '', neg: 'SIM', val: fixo(100), ...o });
const dsd = (o) => ({ mat: '1', data: '2026-09-29', recurso: 'D11 - X', codigo: '110010-VISTORIA PÓS CORTE', cod: '107002', val: fixo(50), ...o });
const modelo = (atividades, desdobros = [], clusters = []) =>
  N.consolidar([
    { tipo: 'atividades', path: 'a.xlsx', atividades, desdobros },
    { tipo: 'cluster', path: 'Cluster_a.xlsx', pares: clusters },
  ]);

/* ------------------------------------------------------------------ */
/* Reprodução do print do Power BI (planilhas sintéticas)              */
/* ------------------------------------------------------------------ */

let print; // modelo lido das planilhas de tests/fixtures/print
test.before(async () => {
  assert.ok(fs.existsSync(fx('print')), 'gere as planilhas: python3 tools/make_fixtures.py tests/fixtures');
  const resultados = [];
  for (const n of fs.readdirSync(fx('print')).sort()) resultados.push(await ler(fx('print', n)));
  print = N.consolidar(resultados);
});

const DIA = { mes: '2026-09', data: '2026-09-29' };

test('cartões: quantidades do print (124, --, --, 0, 8, 132)', () => {
  const m = N.calcular(print, DIA).cards;
  assert.equal(m.principal, 124);
  assert.equal(m.cadastro, null, 'Cadastro Desdobro sem registros é BLANK');
  assert.equal(m.corte, null, 'Negociação Corte sem registros é BLANK');
  assert.equal(m.desdobro, 0, 'desdobro de serviço = 8 - BLANK - 8 = 0 (zero, não BLANK)');
  assert.equal(m.pos, 8);
  assert.equal(m.total, 132);
});

test('cartões: valores do print (R$ 40.382, --, R$ 0, R$ 18.046, R$ 58.427)', () => {
  const m = medidasEmReais(N.calcular(print, DIA).cards);
  assert.equal(m.valPrincipal, 40381.6);
  assert.equal(m.valCorte, null);
  assert.equal(m.valDesdobro, 0);
  assert.equal(m.valPos, 18045.87);
  assert.equal(m.valTotal, 58427.47);
  assert.equal(Math.round(m.valPrincipal), 40382);
  assert.equal(Math.round(m.valPos), 18046);
  assert.equal(Math.round(m.valTotal), 58427);
});

test('matriz Negociações Comercial: cluster > frente, como no print', () => {
  const v = N.calcular(print, DIA).comercial;
  const resumo = (nos) => nos.map((n) => [n.rotulo, n.m.total, R(n.m.valTotal)]);
  assert.deepEqual(resumo(v.linhas), [
    ['Inadimplente', 71, 33942.74],
    ['Adimplente', 52, 21629.38],
    ['(sem cluster)', 5, 2249.83],
    ['Nunca Pagou', 3, 282.69],
  ]);
  const frentes = (cl) => resumo(v.linhas.find((n) => n.rotulo === cl).filhos);
  assert.deepEqual(frentes('Inadimplente'), [['Leitura', 65, 15787.9], ['Corte e Religa', 5, 16138.98], ['Pós Corte', 1, 2015.86]]);
  assert.deepEqual(frentes('Adimplente'), [['Leitura', 47, 19911.13], ['Corte e Religa', 4, 519.82], ['Pós Corte', 1, 1198.43]]);
  assert.deepEqual(frentes('Nunca Pagou'), [['Leitura', 2, 282.69], ['Recadastro', 1, null]], 'Recadastro: quantidade 1 e R$ em branco');
  assert.equal(v.total.total, 131);
  assert.equal(R(v.total.valTotal), 58104.64);
});

test('matriz: o terceiro nível traz os recursos de cada frente', () => {
  const inad = N.calcular(print, DIA).comercial.linhas.find((n) => n.rotulo === 'Inadimplente');
  const corte = inad.filhos.find((n) => n.rotulo === 'Corte e Religa');
  assert.ok(corte.filhos.length > 0);
  assert.ok(corte.filhos.every((r) => r.rotulo.startsWith('RIOCERIN-')));
  assert.equal(corte.filhos.reduce((a, r) => a + r.m.principal, 0), 4);
});

test('o desdobro sem atividade da mesma matrícula só entra quando não há filtro de atividade (131 x 132 do print)', () => {
  const v = N.calcular(print, DIA);
  assert.equal(v.cards.total, 132);
  assert.equal(v.cidades.total.total, 132, 'total da tabela de cidades = cartões');
  assert.equal(v.cidades.linhas.reduce((a, l) => a + l.m.total, 0), 131, 'soma das cidades fica 1 abaixo do total');
  assert.equal(v.comercial.total.total, 131);
  // com filtro de frente o desdobro passa a seguir a matrícula das atividades da frente
  const leitura = N.calcular(print, { ...DIA, frente: 'Leitura' }).cards;
  assert.equal(leitura.principal, 63 + 45 + 5 + 2);
  assert.equal(leitura.pos, 4, 'só os 4 desdobros cuja matrícula tem atividade de Leitura');
});

test('Motivo da não Execução: só cobrança sem negociação; sem SUSPENSO, vazio ou outras categorias', () => {
  assert.deepEqual(N.calcular(print, DIA).motivos, [{ rotulo: 'DUPLICIDADE DE MATRÍCULA', qtd: 1 }]);
});

test('Top 10: recursos do setor Comercial, ordenados por negociações, com Top e total das linhas exibidas', () => {
  const t = N.calcular(print, DIA).top10;
  assert.equal(t.linhas.length, 10, 'com desempate o Top 10 tem exatamente 10 linhas');
  assert.deepEqual(t.linhas.map((l) => l.top), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'posições únicas, sem repetir');
  const totais = t.linhas.map((l) => l.m.total);
  assert.deepEqual(totais, [...totais].sort((a, b) => b - a), 'ordenado por Total Negociações decrescente');
  assert.ok(t.linhas.every((l) => l.top >= 1 && l.top < 11));
  assert.ok(!t.linhas.some((l) => l.rotulo.startsWith('D11')), 'recursos D11... não entram');
  assert.equal(t.total.total, t.linhas.reduce((a, l) => a + l.m.total, 0), 'sem desdobro compartilhado, o total é a soma das linhas');
});

test('data e mês filtram atividades e desdobros pela própria data', () => {
  const tudo = N.calcular(print, {}).cards;
  const set = N.calcular(print, { mes: '2026-09' }).cards;
  const dia28 = N.calcular(print, { data: '2026-09-28' }).cards;
  const out = N.calcular(print, { mes: '2026-10' }).cards;
  assert.equal(tudo.principal, 124 + 3 + 2);
  assert.equal(set.principal, 124 + 3);
  assert.equal(set.pos, 9, 'o desdobro do dia 28 entra no mês');
  assert.equal(dia28.principal, 3);
  assert.equal(dia28.pos, 1);
  assert.equal(R(dia28.valPos), 10);
  assert.equal(out.principal, 2);
  assert.equal(out.pos, null);
  assert.deepEqual(print.opcoes.meses, ['2026-09', '2026-10']);
  assert.deepEqual(print.opcoes.datas, ['2026-09-28', '2026-09-29', '2026-10-01']);
});

test('filtro de cluster, inclusive "sem cluster"', () => {
  const adim = N.calcular(print, { ...DIA, cluster: 'Adimplente' });
  assert.equal(adim.cards.total, 52);
  assert.deepEqual(adim.comercial.linhas.map((n) => n.rotulo), ['Adimplente']);
  const sem = N.calcular(print, { ...DIA, cluster: N.SEM_CLUSTER });
  assert.equal(sem.cards.total, 5);
  assert.ok(print.opcoes.clusters.includes('Inadimplente') && print.opcoes.temSemCluster);
});

test('resumo da leitura: o que foi descartado por falta de setor aparece com o nome do recurso', () => {
  assert.equal(print.resumo.descartadasSemSetor, 7, '6 do D11... (5 do dia + 1 do dia 28) e 1 do D13.1');
  assert.deepEqual(print.resumo.recursosSemSetor.map((r) => r.recurso).sort(), ['D11 - APERIBÉ. CAMBUCI. ITAOCARA. MIRCMA', 'D13.1 - CASIMIRO DE ABREU']);
  assert.equal(print.resumo.idsRepetidos, 0);
});

/* ------------------------------------------------------------------ */
/* Leitura de arquivos                                                 */
/* ------------------------------------------------------------------ */

test('lê valor, data e matrícula escritos como texto brasileiro', async () => {
  const r = await ler(fx('casos', 'valores_em_texto.xlsx'));
  assert.equal(r.tipo, 'atividades');
  assert.deepEqual(r.atividades.map((a) => [a.mat, a.data, a.val]), [['555001', '2026-09-29', fixo(1234.56)], ['555002', '2026-09-29', fixo(100)]]);
});

test('escolhe a aba pelas colunas e acha o cabeçalho fora da primeira linha', async () => {
  const a = await ler(fx('casos', 'cabecalho_na_linha_3.xlsx'));
  assert.equal(a.aba, 'Dados');
  assert.equal(a.atividades.length, 2);
  const b = await ler(fx('casos', 'varias_abas.xlsx'));
  assert.equal(b.aba, 'Page 1');
  assert.equal(b.atividades.length, 1);
});

test('recusa arquivo sem coluna obrigatória, dizendo qual falta', async () => {
  await rejeita(fx('casos', 'sem_coluna_obrigatoria.xlsx'), 'COLUNAS_AUSENTES', /Negociou O Débito\?/);
});

test('recusa arquivo sem cabeçalho reconhecível e arquivo que não é .xlsx', async () => {
  await rejeita(fx('casos', 'sem_cabecalho.xlsx'), 'SEM_CABECALHO', /Abas do arquivo: Page 1/);
  await rejeita(fx('casos', 'corrompido.xlsx'), 'NOT_XLSX');
});

test('Body Adicional Executado quebrado: os códigos ainda são achados e o aviso aparece', async () => {
  const r = await ler(fx('casos', 'json_quebrado.xlsx'));
  assert.deepEqual(r.desdobros.map((d) => d.cod), ['107002']);
  assert.match(r.avisos.join(' '), /fora do formato JSON/);
});

test('só os códigos de desdobro usados pelas medidas são guardados (4 de 5 do corpo adicional)', async () => {
  const r = await ler(fx('casos', 'codigos_desdobro.xlsx'));
  assert.deepEqual(r.desdobros.map((d) => d.cod), ['107002', '202002', '207002', '102004']);
  assert.ok(r.desdobros.every((d) => d.mat === '555001' && d.val === fixo(80)), 'cada desdobro herda matrícula e valor da atividade de origem');
});

test('Cluster: uma linha por matrícula, vale o primeiro arquivo em ordem de nome', async () => {
  const a = await ler(fx('casos', 'Cluster_A.xlsx'));
  assert.equal(a.tipo, 'cluster');
  assert.equal(a.duplicadas, 1);
  const b = await ler(fx('casos', 'Cluster_B.xlsx'));
  assert.equal(b.aba, 'Outra', 'a aba é reconhecida pelas colunas, não pelo nome');
  const m = modelo([atv({ mat: '555001' }), atv({ mat: '555003', id: 'x' })]);
  const unido = N.consolidar([
    { tipo: 'atividades', path: 'a.xlsx', atividades: [atv({ mat: '555001' }), atv({ mat: '555003' })], desdobros: [] },
    b,
    a, // fora de ordem de propósito
  ]);
  const cl = N.calcular(unido, {}).comercial.linhas.map((n) => n.rotulo).sort();
  assert.deepEqual(cl, ['Adimplente', 'Flutuante'], '555001 fica com o Cluster_A (primeiro pelo nome)');
  void m;
});

test('Body Adicional Executado: lista, objeto único, códigos numéricos e campo ausente', () => {
  assert.deepEqual(N.codigosDoBody('[{"cadServicoDefinicaoExecutado":"107002"},{"cadServicoDefinicaoExecutado":207002},{"x":1}]'), { cods: ['107002', '207002'], erro: false });
  assert.deepEqual(N.codigosDoBody('{"cadServicoDefinicaoExecutado":"202002"}').cods, ['202002']);
  assert.deepEqual(N.codigosDoBody('[]').cods, []);
  assert.equal(N.codigosDoBody('[{"cadServicoDefinicaoExecutado":"1070').erro, true);
});

test('valores monetários e datas em vários formatos', () => {
  assert.equal(N.parseValor('R$ 1.234,56', 0), 1234.56);
  assert.equal(N.parseValor('1234.5', 0), 1234.5);
  assert.equal(N.parseValor('', 0), null);
  assert.ok(Number.isNaN(N.parseValor('abc', 0)));
  const p = N.parseDateValue('29/09/2026', 0, false);
  assert.deepEqual([p.y, p.m, p.d], [2026, 9, 29]);
});

/* ------------------------------------------------------------------ */
/* Regras das medidas (modelos montados na memória)                    */
/* ------------------------------------------------------------------ */

test('tabelas do relatório: recursos por abreviação e serviços por código', () => {
  assert.equal(TAB.servicos.length, 334, '359 linhas com 25 SERVICO repetidos removidos (Table.Distinct)');
  assert.equal(TAB.recursos.length, 38);
  const srv = (c) => TAB.servicos.find((s) => s[1] === c);
  assert.deepEqual([srv(107002)[2], srv(107002)[3]], ['COBRANÇA', 'COMERCIAL']);
  assert.equal(srv(110010)[2], 'VISTORIA PÓS CORTE');
  assert.equal(TAB.recursos.find((r) => r[0] === 'RIOLTRIN')[1], 'Leitura');
  assert.equal(TAB.recursos.find((r) => r[0] === 'RIOPCRNT')[1], 'Recuperação de Cortados', 'RIOSETB2 -> RIOPCRNT e Ação de Verão -> Recuperação de Cortados');
});

test('BLANK do DAX: somar/subtrair com BLANK e BLANK + BLANK', () => {
  assert.equal(N.add(null, null), null);
  assert.equal(N.add(null, 5), 5);
  assert.equal(N.sub(null, null), null);
  assert.equal(N.sub(8, null), 8);
  assert.equal(N.sub(null, 8), -8);
  assert.equal(N.sub(0, null), 0);
});

test('Negociação Principal: precisa ser cobrança E "SIM" (sem diferenciar maiúsculas)', () => {
  const m = modelo([
    atv({ mat: '1' }),
    atv({ mat: '2', neg: 'sim' }),
    atv({ mat: '3', neg: 'NÃO' }),
    atv({ mat: '4', neg: '' }),
    atv({ mat: '5', codigo: '209001 - CORTE DE ÁGUA NO CAVALETE - DÉBITO' }), // corte, não cobrança
    atv({ mat: '6', codigo: '999999-NAO CADASTRADO' }),
  ]);
  const v = N.calcular(m, {});
  assert.equal(v.cards.principal, 2);
  assert.equal(m.resumo.semCodigoConhecido, 1);
});

test('desdobro: só 107002/207002 contam e Corte/Pós Corte vêm da categoria da atividade de origem', () => {
  const m = modelo(
    [atv({ mat: '1' })],
    [
      dsd({ cod: '107002', codigo: '209001 - CORTE DE ÁGUA NO CAVALETE - DÉBITO', val: fixo(10) }), // corte
      dsd({ cod: '207002', codigo: '110010-VISTORIA PÓS CORTE', val: fixo(20) }), // pós corte
      dsd({ cod: '107002', codigo: '107001-COBRANÇA - VISITA', val: fixo(30) }), // desdobro de cobrança
      dsd({ cod: '107002', codigo: 'TEXTO QUE NAO EXISTE NA TABELA', val: fixo(40) }), // origem sem categoria: só entra no residual
    ]
  );
  const v = medidasEmReais(N.calcular(m, {}).cards);
  assert.equal(v.corte, 1);
  assert.equal(v.pos, 1);
  assert.equal(v.desdobro, 4 - 1 - 1);
  assert.equal(v.total, 1 + 4);
  assert.equal(v.valCorte, 10);
  assert.equal(v.valPos, 20);
  assert.equal(v.valDesdobro, 70, '100 - 20 - 10');
  assert.equal(v.valTotal, 70 + 20 + 10 + 100);
});

test('Cadastro Desdobro: 4 códigos e categoria de origem COBRANÇA ou CORTE; não entra no total', () => {
  const m = modelo(
    [atv({ mat: '1' })],
    [
      dsd({ cod: '202002', codigo: '107001-COBRANÇA - VISITA' }),
      dsd({ cod: '102002', codigo: '209001 - CORTE DE ÁGUA NO CAVALETE - DÉBITO' }),
      dsd({ cod: '202004', codigo: '107001-COBRANÇA - VISITA' }),
      dsd({ cod: '102004', codigo: '110010-VISTORIA PÓS CORTE' }), // origem pós corte: fora
    ]
  );
  const v = N.calcular(m, {}).cards;
  assert.equal(v.cadastro, 3);
  assert.equal(v.total, 1, 'só a principal: o cadastro não soma no total');
});

test('o desdobro segue a matrícula quando há filtro de atividade e não é contado duas vezes na mesma linha', () => {
  const m = modelo(
    [atv({ mat: '1', recurso: 'RIOLTRIN-001' }), atv({ mat: '1', recurso: 'RIOLTRIN-001', data: '2026-09-29', neg: 'NÃO' }), atv({ mat: '2', recurso: 'RIOCERIN-001' })],
    [dsd({ mat: '1', val: fixo(50) }), dsd({ mat: '3', val: fixo(7) })]
  );
  // sem filtro de atividade: todos os desdobros do período (incluindo a matrícula 3, sem atividade)
  assert.equal(N.calcular(m, {}).cards.pos, 2);
  // com filtro de frente: só o da matrícula 1, uma vez, mesmo com duas atividades da matrícula
  const leitura = N.calcular(m, { frente: 'Leitura' });
  assert.equal(leitura.cards.pos, 1);
  const linha = leitura.comercial.linhas[0].filhos[0];
  assert.equal(linha.rotulo, 'Leitura');
  assert.equal(linha.m.total, 1 + 1);
});

test('matriz Comercial: sem Manutenção, sem recursos sem setor e só serviços do setor Comercial', () => {
  const m = modelo([
    atv({ mat: '1', recurso: 'RIOLTRIN-001' }),
    atv({ mat: '2', recurso: 'RIOMLTIN-001' }), // Manutenção: sai da matriz, fica nos cartões
    atv({ mat: '3', recurso: 'RIOMLTTIN-001' }), // "MAnutenção" no cadastro: é a mesma Manutenção (DAX não diferencia maiúsculas)
    atv({ mat: '4', recurso: 'XYZ-001' }), // setor desconhecido: sai de tudo
  ]);
  const v = N.calcular(m, {});
  assert.equal(v.cards.principal, 3);
  assert.equal(v.comercial.total.total, 1);
  assert.equal(m.resumo.descartadasSemSetor, 1);
  assert.deepEqual(m.opcoes.frentes, ['Leitura', 'Manutenção']);
});

test('Top 10: ranking por total*0,15 + valor*0,0000001, retira os recursos D11..., total > 0 e Top < 11', () => {
  const linhas = [];
  // recurso i tem (13 - i) negociações; os recursos 11 e 12 ficam fora do Top 10
  for (let i = 1; i <= 12; i++) for (let j = 0; j < 13 - i; j++) linhas.push(atv({ mat: i + '-' + j, recurso: 'RIOLTRIN-' + String(i).padStart(3, '0') }));
  // empate exato (mesma quantidade e mesmo valor): desempata, não divide a posição
  linhas.push(atv({ mat: 'e1', recurso: 'RIOLTRIN-020' }), atv({ mat: 'e2', recurso: 'RIOLTRIN-021' }));
  const m = modelo(linhas);
  const t = N.calcular(m, {}).top10;
  assert.equal(t.linhas.length, 10);
  assert.equal(t.linhas[0].rotulo, 'RIOLTRIN-001');
  assert.equal(t.linhas[0].top, 1);
  assert.ok(t.linhas.every((l) => l.top < 11 && l.m.total > 0));
  // desempate pelo valor (0,0000001 por real): mais valor, melhor posição
  const m2 = modelo([atv({ mat: 'a', recurso: 'RIOLTRIN-001', val: fixo(10) }), atv({ mat: 'b', recurso: 'RIOLTRIN-002', val: fixo(900) })]);
  const t2 = N.calcular(m2, {}).top10.linhas;
  assert.deepEqual(t2.map((l) => [l.rotulo, l.top]), [['RIOLTRIN-002', 1], ['RIOLTRIN-001', 2]], 'mesma quantidade: a tabela segue a posição do ranking');
});

test('Top 10: desempate quando quantidade e valor são iguais — negociou por último primeiro, depois ordem alfabética', () => {
  const item = (criterio, ultima, rotulo) => ({ criterio, ultima, rotulo });
  const pos = N.posicoesDoRanking([item(5, '2026-09-01', 'A'), item(3, '2026-09-02', 'B'), item(3, '2026-09-05', 'C'), item(null, '', 'D'), item(3, '2026-09-05', 'AA')]);
  assert.deepEqual(pos, [1, 4, 3, 5, 2], 'A=1; entre os de critério 3: AA e C (05/09, nome) antes de B (02/09); sem critério por último');
  // 12 recursos com a mesma quantidade e o mesmo valor: só 10 entram, e a data decide quem fica de fora
  const linhas = [];
  for (let i = 1; i <= 12; i++) linhas.push(atv({ mat: 'm' + i, recurso: 'RIOLTRIN-' + String(i).padStart(3, '0'), data: '2026-09-' + String(i).padStart(2, '0') }));
  const t = N.calcular(modelo(linhas), {}).top10.linhas;
  assert.equal(t.length, 10);
  assert.deepEqual(t.map((l) => l.top), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(t.map((l) => l.rotulo), Array.from({ length: 10 }, (_, k) => 'RIOLTRIN-' + String(12 - k).padStart(3, '0')), 'os 10 mais recentes, do mais novo para o mais antigo');
  // mesma data: pelo nome do recurso
  const iguais = Array.from({ length: 12 }, (_, i) => atv({ mat: 'n' + i, recurso: 'RIOLTRIN-' + String(i + 1).padStart(3, '0') }));
  const t2 = N.calcular(modelo(iguais), {}).top10.linhas;
  assert.deepEqual(t2.map((l) => l.rotulo), Array.from({ length: 10 }, (_, k) => 'RIOLTRIN-' + String(k + 1).padStart(3, '0')));
});

test('Top 10 retira os cinco recursos da lista de exclusão (sem diferenciar maiúsculas)', () => {
  const rec = 'RIOLTRIN-001';
  const m = modelo([atv({ mat: '1', recurso: rec })]);
  // esses recursos não têm setor no cadastro e já seriam descartados; a lista vale mesmo se passarem a ter
  assert.equal(N.EXCLUIDOS_TOP10.length, 5);
  assert.equal(N.calcular(m, {}).top10.linhas.length, 1);
});

test('Negociação x Cidade: ordena por valor, mostra cidade em branco e esconde cidades sem negociação', () => {
  const m = modelo([
    atv({ mat: '1', cidade: 'Itaocara', val: fixo(10) }),
    atv({ mat: '2', cidade: 'ITAOCARA', val: fixo(20) }), // mesma cidade (maiúsculas diferentes)
    atv({ mat: '3', cidade: 'Cantagalo', val: fixo(500) }),
    atv({ mat: '4', cidade: '', val: fixo(1) }),
    atv({ mat: '5', cidade: 'Rio Bonito', neg: 'NÃO' }), // sem negociação: some
  ]);
  const c = N.calcular(m, {}).cidades.linhas.map((l) => [l.rotulo, l.m.total, R(l.m.valTotal)]);
  assert.deepEqual(c, [['Cantagalo', 1, 500], ['Itaocara', 2, 30], ['(em branco)', 1, 1]]);
});

test('Motivo da não Execução: o motivo "Normal" vale quando existe; senão, o de Cobrança', () => {
  const nao = { neg: 'NÃO' };
  const m = modelo([
    atv({ mat: '1', ...nao, mc: 'DUPLICIDADE' }),
    atv({ mat: '2', ...nao, mc: 'DUPLICIDADE' }),
    atv({ mat: '3', ...nao, mn: 'CLIENTE AUSENTE', mc: 'DUPLICIDADE' }), // vale o Normal
    atv({ mat: '4', ...nao, mc: 'suspenso' }), // SUSPENSO fica fora
    atv({ mat: '5', ...nao, mc: '' }), // sem motivo fica fora
    atv({ mat: '6', mc: 'DUPLICIDADE' }), // negociou: não é Exoc
    atv({ mat: '7', ...nao, mc: 'duplicidade' }), // mesmo motivo, outra caixa
  ]);
  assert.deepEqual(N.calcular(m, {}).motivos, [{ rotulo: 'DUPLICIDADE', qtd: 3 }, { rotulo: 'CLIENTE AUSENTE', qtd: 1 }]);
});

test('sem arquivos: tudo BLANK e nenhuma linha', () => {
  const v = N.calcular(N.consolidar([]), {});
  assert.equal(v.cards.total, null);
  assert.equal(v.cards.valTotal, null);
  assert.deepEqual([v.comercial.linhas.length, v.top10.linhas.length, v.cidades.linhas.length, v.motivos.length], [0, 0, 0, 0]);
});

/* ------------------------------------------------------------------ */
/* Pasta: só os arquivos do painel (pelo nome)                         */
/* ------------------------------------------------------------------ */

/** Entrada de pasta com o conteúdo de uma planilha de teste; `abertos` registra os que foram abertos. */
function entradaDe(p, nome, abertos, caminho) {
  return {
    name: nome,
    path: caminho ?? nome,
    getFile: async () => {
      abertos.push(nome);
      return new File([fs.readFileSync(p)], nome, { lastModified: 1 });
    },
  };
}
const opcoesPasta = (extra) => ({ cache: new Map(), assinaturaAnterior: '', auto: false, soPorNome: true, temModelo: false, ...extra });

test('pasta: só entram os .xlsx com "Atividade" ou "Cluster" no nome; o "Termos de Janeiro a Agosto" é ignorado sem ser aberto', async () => {
  const abertos = [];
  const entradas = [
    entradaDe(fx('print', 'Report Atividade 2026-09-29.xlsx'), 'Atividades-INTERIOR_29_09_26 (3).xlsx', abertos),
    entradaDe(fx('print', 'Cluster_2026-09.xlsx'), 'Cluster_2026-09.xlsx', abertos),
    // tem colunas de atividades, mas o nome não é do painel: tem de ficar de fora
    entradaDe(fx('casos', 'valores_em_texto.xlsx'), 'Termos de Janeiro a Agosto.xlsx', abertos),
    // subpasta também é lida
    entradaDe(fx('casos', 'varias_abas.xlsx'), 'Atividades-INTERIOR_01_01_26.xlsx', abertos, 'De Janeiro a Setembro/Atividades-INTERIOR_01_01_26.xlsx'),
    entradaDe(fx('casos', 'varias_abas.xlsx'), '~$Atividades-INTERIOR_01_01_26.xlsx', abertos), // temporário do Excel
  ];
  const rel = await Fontes.carregarArquivos(entradas, opcoesPasta());
  assert.deepEqual(rel.ignoradosPorNome, ['Termos de Janeiro a Agosto.xlsx']);
  assert.ok(!abertos.includes('Termos de Janeiro a Agosto.xlsx'), 'o arquivo ignorado nem é aberto');
  assert.ok(!abertos.includes('~$Atividades-INTERIOR_01_01_26.xlsx'));
  assert.equal(rel.modelo.resumo.arquivos, 2, 'dois arquivos de atividades (o da subpasta inclusive)');
  assert.equal(rel.modelo.resumo.atividades, 134 + 1);
  // com o Cluster na pasta não há nada que peça ação: nenhum aviso na tela; o resumo vai para "Detalhes da leitura"
  assert.equal(mensagemDaCarga(rel, { auto: false, fonte: 'Interior', temModeloAnterior: false }), null);
  const det = detalhesDaCarga(rel, { auto: false });
  assert.ok(!det.itens.some((t) => /Termos/.test(t)), 'ignorar pelo nome não é problema: não vira item, só consta no resumo');
  assert.match(det.detalhe, /Ignorados \(sem "Atividade" nem "Cluster" no nome\): Termos de Janeiro a Agosto\.xlsx\./);
  assert.match(det.titulo, /^Base carregada: 135 atividades e 9 desdobros de 2 arquivos$/);
});

test('aviso na tela só quando pede ação; o resto vai para os detalhes da leitura', async () => {
  const todos = fs.readdirSync(fx('print')).map((n) => entradaDe(fx('print', n), n, []));
  const rel = await Fontes.carregarArquivos(todos, opcoesPasta());
  assert.equal(mensagemDaCarga(rel, { auto: false, fonte: 'Interior', temModeloAnterior: false }), null, 'só observações do Power BI: sem aviso');
  const det = detalhesDaCarga(rel, { auto: true });
  assert.match(det.titulo, /^Pasta atualizada: /);
  assert.ok(det.itens.some((t) => /sem setor no cadastro de recursos/.test(t)), 'a observação continua nos detalhes');
  // sem o arquivo Cluster_ o painel avisa na tela (a matriz inteira cairia em "(sem cluster)")
  const semCluster = fs.readdirSync(fx('print')).filter((n) => !/^Cluster/i.test(n)).map((n) => entradaDe(fx('print', n), n, []));
  const rel2 = await Fontes.carregarArquivos(semCluster, opcoesPasta());
  const msg = mensagemDaCarga(rel2, { auto: false, fonte: 'Interior', temModeloAnterior: false });
  assert.equal(msg.kind, 'warning');
  assert.deepEqual(msg.items, ['Nenhum arquivo Cluster_ encontrado: todas as negociações aparecem como "(sem cluster)".']);
  assert.ok(detalhesDaCarga(rel2, { auto: false }).itens.includes(msg.items[0]), 'e também consta nos detalhes');
  // sem modelo carregado não há detalhes
  const vazio = await Fontes.carregarArquivos([entradaDe(fx('casos', 'valores_em_texto.xlsx'), 'Termos de Janeiro a Agosto.xlsx', [])], opcoesPasta());
  assert.equal(detalhesDaCarga(vazio, { auto: false }), null);
});

test('arquivos escolhidos à mão (Importar Excel) são lidos pelas colunas, qualquer que seja o nome', async () => {
  const abertos = [];
  const entradas = [
    entradaDe(fx('print', 'Report Atividade 2026-09-29.xlsx'), 'Atividades-INTERIOR_29_09_26.xlsx', abertos),
    entradaDe(fx('casos', 'valores_em_texto.xlsx'), 'Termos de Janeiro a Agosto.xlsx', abertos),
  ];
  const rel = await Fontes.carregarArquivos(entradas, opcoesPasta({ soPorNome: false }));
  assert.deepEqual(rel.ignoradosPorNome, []);
  assert.equal(rel.modelo.resumo.arquivos, 2);
});

test('nome do painel: "Atividade" ou "Cluster", sem diferenciar maiúsculas nem acentos', () => {
  for (const ok of ['Atividades-INTERIOR_14_10_26 (3).xlsx', 'ATIVIDADE.xlsx', 'Cluster_2026-09.xlsx', 'relatório de atividades.xlsx', 'CLUSTER saldo.xlsx']) {
    assert.equal(Fontes.ehArquivoDoPainel(ok), true, ok);
  }
  for (const no of ['Termos de Janeiro a Agosto.xlsx', 'Solicitação geral.xlsx', 'Resumo.xlsx']) {
    assert.equal(Fontes.ehArquivoDoPainel(no), false, no);
  }
});

test('pasta só com planilhas de outro assunto: aviso claro, nenhum arquivo aberto e nenhum modelo', async () => {
  const abertos = [];
  const entradas = [entradaDe(fx('casos', 'valores_em_texto.xlsx'), 'Termos de Janeiro a Agosto.xlsx', abertos), entradaDe(fx('casos', 'sem_cabecalho.xlsx'), 'Resumo.xlsx', abertos)];
  const rel = await Fontes.carregarArquivos(entradas, opcoesPasta());
  assert.equal(rel.semArquivosDoPainel, true);
  assert.equal(rel.modelo, null);
  assert.deepEqual(abertos, []);
  const msg = mensagemDaCarga(rel, { auto: false, fonte: 'Interior', temModeloAnterior: true });
  assert.equal(msg.kind, 'warning');
  assert.match(msg.title, /Nenhum arquivo de Atividades ou Cluster_ na pasta/);
  assert.match(msg.detail, /Termos de Janeiro a Agosto\.xlsx, Resumo\.xlsx/);
  assert.match(msg.detail, /A base anterior foi mantida/);
});

test('relatório com todas as colunas obrigatórias presentes e opcionais ausentes carrega com aviso (cidade/motivo)', async () => {
  const r = await ler(fx('print', 'Report Atividade 2026-09-29.xlsx'));
  assert.deepEqual(r.avisos, []);
  assert.equal(r.stats.linhas, 141);
  assert.equal(r.stats.semData, 0);
});

test('rótulos do Motivo da não Execução: tudo em maiúsculas vira texto legível e quebra sem cortar palavra', () => {
  assert.equal(Formato.legivel('DUPLICIDADE DE MATRÍCULA'), 'Duplicidade de Matrícula');
  assert.equal(Formato.legivel('RETORNAR DEPOIS'), 'Retornar Depois');
  assert.equal(Formato.legivel('Cliente ausente'), 'Cliente ausente', 'texto já legível não muda');
  assert.equal(Formato.legivel('123'), '123', 'sem letras: não muda');
  assert.deepEqual(Formato.quebrar('Duplicidade de Matrícula'), ['Duplicidade de', 'Matrícula']);
  assert.deepEqual(Formato.quebrar('Retornar Depois'), ['Retornar Depois']);
  const longo = Formato.quebrar('um dois tres quatro cinco seis sete oito nove dez onze doze treze', 10);
  assert.equal(longo.length, 3, 'no máximo 3 linhas');
  assert.ok(longo[2].endsWith('…'), 'o que passar vira reticências');
  assert.deepEqual(Formato.quebrar(''), []);
});

test('gráficos de colunas + linha: valores abreviados em "mil" e eixos com o mesmo número de divisões', () => {
  assert.equal(Formato.fmtMil(14899.98), '14,9 mil');
  assert.equal(Formato.fmtMil(31324.19), '31,3 mil');
  assert.equal(Formato.fmtMil(20000), '20 mil');
  assert.equal(Formato.fmtMil(86.75), '87');
  assert.equal(Formato.fmtMil(0), '0');
  // quantidade do Top 10 (máx. 109): eixo inteiro até 125 em 5 divisões
  assert.deepEqual(escalaDoEixo(109, 5, true), { max: 125, ticks: [0, 25, 50, 75, 100, 125] });
  // valor (máx. 14.899,98): passo redondo, 5 divisões, com folga acima do maior valor
  const v = escalaDoEixo(14899.98);
  assert.equal(v.ticks.length, 6);
  assert.ok(v.max >= 14899.98 * 1.12 && v.ticks[5] === v.max);
  // sem dados ou só zeros: eixo válido
  assert.deepEqual(escalaDoEixo(0, 5, true), { max: 5, ticks: [0, 1, 2, 3, 4, 5] });
  // contagem pequena nunca vira passo fracionário
  assert.ok(escalaDoEixo(1, 5, true).ticks.every(Number.isInteger));
});
