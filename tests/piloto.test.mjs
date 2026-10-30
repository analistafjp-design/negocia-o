// Importador local: dados sintéticos, origem física e preservação da última carga válida.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { importarPiloto, lerReferencia, conferirReferencia } from '../tools/importar-piloto.mjs';
import { lerArquivo } from '../lib/leitura.ts';
import { lerArrecadacao } from '../lib/arrecadacao-csv.ts';

const executar = promisify(execFile);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FX = path.join(RAIZ, 'tests', 'fixtures');
const REF = path.join(RAIZ, 'piloto', 'BASELINE.md');
const entradas = [path.join(FX, 'print'), path.join(FX, 'arrecadacao')];
const json = async p => JSON.parse(await fs.readFile(p, 'utf8'));
const auditar = async p => (await fs.readFile(p, 'utf8')).trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
const existe = async p => fs.stat(p).then(() => true).catch(e => { if (e.code === 'ENOENT') return false; throw e; });

async function ambiente(t) {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'neg-piloto-'));
  t.after(() => fs.rm(raiz, { recursive: true, force: true }));
  const entrada = path.join(raiz, 'entrada'), saida = path.join(raiz, 'saida');
  await fs.mkdir(entrada);
  return { raiz, entrada, saida };
}
async function arquivo(p) {
  const b = new Blob([await fs.readFile(p)]);
  return { name: path.basename(p), size: b.size, lastModified: 0, slice: (a, z) => b.slice(a, z) };
}
async function atividade(entrada, caso = 'valores_em_texto.xlsx', nome = 'Atividades.xlsx') {
  await fs.copyFile(path.join(FX, 'casos', caso), path.join(entrada, nome));
}
const CAB = 'Nº Ligação;Valor Pago;Data Pagto.;Tipo Fatura;Situação Pagto;Cliente';

test('referência: quatro fontes reproduzem totais, null/zero e sobreposição diária/acumulada', async t => {
  const { saida } = await ambiente(t);
  const r = await importarPiloto({ entradas, saida, referencia: REF });
  const resumo = await json(path.join(r.carga, 'resumo.json'));
  assert.deepEqual(r.comparacao, { confere: true, diferencas: [] });
  assert.equal(r.arquivos, 4);
  assert.equal(resumo.without_payments.cards.total, 132);
  assert.equal(resumo.without_payments.commercial_total.total, 131);
  assert.equal(resumo.without_payments.cards.valTotal, 584274700);
  assert.equal(resumo.without_payments.cards.cadastro, null);
  assert.equal(resumo.without_payments.cards.desdobro, 0);
  const linhas = await auditar(path.join(r.carga, 'linhas.ndjson'));
  assert.equal(new Set(linhas.map(l => l.id)).size, linhas.length);
  const lidos = await json(path.join(r.carga, 'leitura.json'));
  const arrays = { atividade: 'atividades', desdobro: 'desdobros', cluster: 'pares', pagamento: 'pagamentos' };
  for (const l of linhas.filter(l => l.estado !== 'ignorado')) {
    const fonte = lidos.find(f => f.path === l.arquivo);
    assert.ok(fonte[arrays[l.tipo]][l.indice], 'origem aponta para registro normalizado existente');
  }
  if (process.platform !== 'win32') {
    assert.equal((await fs.stat(saida)).mode & 0o077, 0);
    assert.equal((await fs.stat(path.join(r.carga, 'leitura.json'))).mode & 0o077, 0);
  }
});

test('reimportação idêntica reaproveita a carga, mesmo com mtime diferente', async t => {
  const { entrada, saida } = await ambiente(t);
  await atividade(entrada);
  const a = await importarPiloto({ entradas: [entrada], saida });
  await fs.utimes(path.join(entrada, 'Atividades.xlsx'), new Date(), new Date());
  const b = await importarPiloto({ entradas: [entrada, entrada], saida });
  assert.equal(b.estado, 'reaproveitado');
  assert.equal(b.carga, a.carga);
  assert.equal((await fs.readdir(saida)).filter(n => n.startsWith('carga-')).length, 1);
});

test('arquivos de atividade distintos com conteúdo igual são mantidos e sinalizados, sem mudar regra', async t => {
  const { entrada, saida } = await ambiente(t);
  await atividade(entrada);
  await atividade(entrada, 'valores_em_texto.xlsx', 'Atividades-copia.xlsx');
  const r = await importarPiloto({ entradas: [entrada], saida });
  const s = await json(path.join(r.carga, 'resumo.json'));
  assert.equal(s.without_payments.summary.linhas, 4);
  assert.equal(s.without_payments.summary.idsRepetidos, 2);
});

test('XLSX: linha física, aba e problemas parciais preservados sem descartar a atividade', async () => {
  const origens = [];
  const a = await lerArquivo(await arquivo(path.join(FX, 'casos', 'auditoria_esparsa.xlsx')), { onRegistro: r => origens.push(r) });
  assert.deepEqual(origens.map(r => [r.aba, r.linha, r.indice]), [['Dados', 7, 0], ['Dados', 12, 1]]);
  assert.equal(origens[0].estado, 'parcial');
  assert.deepEqual(origens[0].motivos, ['DATA_INVALIDA', 'VALOR_INVALIDO']);
  assert.equal(a.atividades[0].val, null);
  assert.equal(a.atividades.length, 2);
  assert.equal(origens[1].estado, 'aceito');
});

test('JSON interrompido recupera o desdobro existente e marca a origem como parcial', async () => {
  const origens = [];
  const a = await lerArquivo(await arquivo(path.join(FX, 'casos', 'json_quebrado.xlsx')), { onRegistro: r => origens.push(r) });
  assert.equal(a.desdobros.length, 1);
  assert.deepEqual(origens.map(r => [r.tipo, r.linha, r.estado, r.motivos]), [
    ['desdobro', 2, 'parcial', ['JSON_INVALIDO_COM_RECUPERACAO']],
    ['atividade', 2, 'parcial', ['JSON_INVALIDO_COM_RECUPERACAO']],
  ]);
});

test('cluster repetido mantém a primeira linha e informa por que ignorou a segunda', async () => {
  const origens = [];
  const a = await lerArquivo(await arquivo(path.join(FX, 'casos', 'Cluster_A.xlsx')), { onRegistro: r => origens.push(r) });
  assert.equal(a.pares.length, 2);
  assert.deepEqual(origens[1], { tipo: 'cluster', aba: 'Planilha1', linha: 3, estado: 'ignorado', motivos: ['CLUSTER_MATRICULA_REPETIDA'] });
});

test('CSV: motivo por registro e linhas físicas com BOM, CRLF e campo multilinha', async t => {
  const { entrada } = await ambiente(t);
  const p = path.join(entrada, 'arrecadacao.csv');
  const texto = '\ufeff' + CAB + '\r\n' + [
    '555001;10,00;30/09/2026;3-PARCELA;Quitada;"Cliente\r\nTeste"',
    '555001;10,00;30/09/2026;1-NOTA FISCAL MENSAL;Quitada;Teste',
    '555001;10,00;30/09/2026;3-PARCELA;Pendente;Teste',
    ';10,00;30/09/2026;3-PARCELA;Quitada;Teste',
    '555001;10,00;data inválida;3-PARCELA;Quitada;Teste',
    '555001;valor inválido;30/09/2026;3-PARCELA;Quitada;Teste',
  ].join('\r\n');
  await fs.writeFile(p, texto);
  const origens = [];
  const a = await lerArrecadacao(await arquivo(p), { onRegistro: r => origens.push(r) });
  assert.equal(a.pagamentos.length, 1);
  assert.deepEqual(origens.map(r => [r.linha, r.linhaFim]), [[2, 3], [4, 4], [5, 5], [6, 6], [7, 7], [8, 8]]);
  assert.deepEqual(origens.map(r => r.motivos[0] || 'ACEITO'), ['ACEITO', 'OUTRO_TIPO_FATURA', 'PARCELA_NAO_QUITADA', 'SEM_MATRICULA', 'SEM_DATA_OU_DATA_INVALIDA', 'VALOR_PAGO_INVALIDO']);
  assert.equal(origens[0].indice, 0);
});

test('CSV: origem permanece correta quando um registro atravessa o bloco de 4 MB', async t => {
  const { entrada } = await ambiente(t);
  const p = path.join(entrada, 'arrecadacao.csv');
  await fs.writeFile(p, CAB + '\n555001;10,00;30/09/2026;3-PARCELA;Quitada;"' + 'x'.repeat(4 * 1024 * 1024) + '\nTeste"\n555002;20,00;30/09/2026;3-PARCELA;Quitada;Teste\n');
  const origens = [];
  const a = await lerArrecadacao(await arquivo(p), { onRegistro: r => origens.push(r) });
  assert.equal(a.pagamentos.length, 2);
  assert.deepEqual(origens.map(r => [r.linha, r.linhaFim]), [[2, 3], [4, 4]]);
});

for (const [nome, caso, destino, codigo] of [
  ['XLSX sem coluna obrigatória', 'sem_coluna_obrigatoria.xlsx', 'Atividades-quebrada.xlsx', 'COLUNAS_AUSENTES'],
  ['XLSX corrompido', 'corrompido.xlsx', 'Atividades-quebrada.xlsx', 'NOT_XLSX'],
  ['CSV sem Valor Pago', 'arrecadacao_sem_valor.csv', 'arrecadacao-quebrada.csv', 'COLUNAS_AUSENTES'],
]) test(nome + ': falha não substitui a carga válida e limpa a carga incompleta', async t => {
  const { entrada, saida } = await ambiente(t);
  await atividade(entrada);
  await importarPiloto({ entradas: [entrada], saida });
  const antes = await fs.readFile(path.join(saida, 'ultima.json'), 'utf8');
  await fs.copyFile(path.join(FX, 'casos', caso), path.join(entrada, destino));
  await assert.rejects(importarPiloto({ entradas: [entrada], saida }), e => { assert.equal(e.code, codigo); return true; });
  assert.equal(await fs.readFile(path.join(saida, 'ultima.json'), 'utf8'), antes);
  const nomes = await fs.readdir(saida);
  assert.ok(!nomes.some(n => n.startsWith('.carga-') || n === '.importacao.lock'));
  const falha = await json(path.join(saida, nomes.find(n => n.startsWith('falha-'))));
  assert.equal(falha.arquivo, '1/' + destino);
  assert.equal(falha.codigo, codigo);
});

test('divergência da referência guarda evidência, preserva última carga válida e CLI retorna 2', async t => {
  const { raiz, saida } = await ambiente(t);
  await importarPiloto({ entradas, saida, referencia: REF });
  const antes = await fs.readFile(path.join(saida, 'ultima.json'), 'utf8');
  const ref = structuredClone((await lerReferencia(REF)).dados);
  ref.without_payments.cards.total++;
  const referencia = path.join(raiz, 'referencia.json');
  await fs.writeFile(referencia, JSON.stringify(ref));
  const r = await importarPiloto({ entradas, saida, referencia });
  assert.equal(r.comparacao.confere, false);
  assert.equal(r.comparacao.diferencas[0].campo, 'without_payments.cards.total');
  assert.ok(await existe(path.join(r.carga, 'resumo.json')));
  assert.equal(await fs.readFile(path.join(saida, 'ultima.json'), 'utf8'), antes);
  await assert.rejects(executar(process.execPath, ['tools/importar-piloto.mjs', '--entrada', entradas[0], '--entrada', entradas[1], '--saida', saida, '--referencia', referencia], { cwd: RAIZ }), e => {
    assert.equal(e.code, 2);
    assert.equal(JSON.parse(e.stdout).referencia, 'divergente');
    return true;
  });
});

test('carga previamente salva com arquivo alterado é recusada, sem regravar por cima', async t => {
  const { entrada, saida } = await ambiente(t);
  await atividade(entrada);
  const r = await importarPiloto({ entradas: [entrada], saida });
  const p = path.join(r.carga, 'resumo.json');
  await fs.writeFile(p, '{"alterado":true}');
  await assert.rejects(importarPiloto({ entradas: [entrada], saida }), /Integridade/);
  assert.equal(await fs.readFile(p, 'utf8'), '{"alterado":true}');
});

test('pasta sem atividades válidas falha sem publicar ultima.json', async t => {
  const { entrada, saida } = await ambiente(t);
  await fs.copyFile(path.join(FX, 'casos', 'Cluster_A.xlsx'), path.join(entrada, 'Cluster.xlsx'));
  await assert.rejects(importarPiloto({ entradas: [entrada], saida }), /sem arquivo de atividades/);
  assert.equal(await existe(path.join(saida, 'ultima.json')), false);
});

test('carga não inicia em pasta pública, em entrada/saída sobrepostas ou com lock ativo', async t => {
  const { entrada, saida } = await ambiente(t);
  await atividade(entrada);
  await assert.rejects(importarPiloto({ entradas: [entrada], saida: path.join(RAIZ, 'public', 'dados-piloto') }), /somente piloto\/dados-local/);
  await assert.rejects(importarPiloto({ entradas: [entrada], saida: path.join(entrada, 'saida') }), /pastas separadas/);
  await fs.mkdir(saida, { mode: 0o700 });
  await fs.writeFile(path.join(saida, '.importacao.lock'), 'teste');
  await assert.rejects(importarPiloto({ entradas: [entrada], saida }), /lock pendente/);
  assert.equal(await fs.readFile(path.join(saida, '.importacao.lock'), 'utf8'), 'teste');
});

test('links simbólicos não são seguidos e formatos fora do escopo ficam no manifesto', { skip: process.platform === 'win32' }, async t => {
  const { raiz, entrada, saida } = await ambiente(t);
  await atividade(entrada);
  await fs.symlink(path.join(entrada, 'Atividades.xlsx'), path.join(entrada, 'Atividades-link.xlsx'));
  await fs.writeFile(path.join(entrada, '~$Atividades.xlsx'), 'temporário');
  await fs.writeFile(path.join(entrada, 'Termos.xlsx'), 'não abrir');
  await fs.writeFile(path.join(entrada, 'Outro.csv'), 'não abrir');
  const r = await importarPiloto({ entradas: [entrada], saida });
  const m = await json(path.join(r.carga, 'manifesto.json'));
  assert.equal(m.fontes.length, 1);
  assert.deepEqual(m.ignorados.map(f => f.motivo).sort(), ['CSV_FORA_DO_ESCOPO', 'LINK_SIMBOLICO', 'TEMPORARIO_EXCEL', 'XLSX_FORA_DO_ESCOPO']);
  const link = path.join(raiz, 'saida-link');
  await fs.symlink(saida, link, 'dir');
  await assert.rejects(importarPiloto({ entradas: [entrada], saida: link }), /link simbólico/);
});

test('valor acima da precisão inteira interrompe a carga, sem arredondar silenciosamente', async t => {
  const { entrada, saida } = await ambiente(t);
  await atividade(entrada);
  await fs.writeFile(path.join(entrada, 'arrecadacao.csv'), CAB + '\n555001;999999999999999;30/09/2026;3-PARCELA;Quitada;Teste');
  await assert.rejects(importarPiloto({ entradas: [entrada], saida }), /precisão inteira/);
  assert.equal(await existe(path.join(saida, 'ultima.json')), false);
});

test('comparação não trata null e zero como equivalentes', () => {
  const a = { filters: {}, monetary_scale: 10000, without_payments: { val: null }, with_payments: {} };
  const b = structuredClone(a);
  b.without_payments.val = 0;
  assert.equal(conferirReferencia(a, b).confere, false);
});
