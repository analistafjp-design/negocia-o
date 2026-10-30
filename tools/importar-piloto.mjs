#!/usr/bin/env node
// Importação LOCAL do piloto. Reaproveita os leitores e as medidas do painel.
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, openAsBlob, constants, writeSync, closeSync, openSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerArquivo } from '../lib/leitura.ts';
import { lerArrecadacao } from '../lib/arrecadacao-csv.ts';
import { ehArquivoDoPainel, ehArquivoDeArrecadacao } from '../lib/fontes.ts';
import { consolidar } from '../lib/modelo.ts';
import { calcular } from '../lib/medidas.ts';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = 1;
const hash = value => createHash('sha256').update(value).digest('hex');
const dentro = (base, alvo) => { const r = path.relative(base, alvo); return r === '' || (!r.startsWith('..' + path.sep) && r !== '..' && !path.isAbsolute(r)); };
const ordem = (a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0;

async function hashArquivo(nome) {
  const h = createHash('sha256');
  for await (const pedaco of createReadStream(nome)) h.update(pedaco);
  return h.digest('hex');
}

async function semLinks(nome) {
  const absoluto = path.resolve(nome), raiz = path.parse(absoluto).root;
  let atual = raiz;
  for (const p of absoluto.slice(raiz.length).split(path.sep).filter(Boolean)) {
    atual = path.join(atual, p);
    try {
      if ((await fs.lstat(atual)).isSymbolicLink()) throw new Error('Caminho com link simbólico não é permitido.');
    } catch (e) { if (e.code === 'ENOENT') break; throw e; }
  }
}

async function escrever(nome, valor) {
  await fs.writeFile(nome, JSON.stringify(valor, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}

async function ultima(saida, carga) {
  const temporario = path.join(saida, '.ultima-' + randomUUID());
  try {
    await escrever(temporario, { carga, schema: SCHEMA });
    await fs.rename(temporario, path.join(saida, 'ultima.json'));
  } finally { await fs.rm(temporario, { force: true }); }
}

export async function lerReferencia(nome) {
  const texto = await fs.readFile(nome, 'utf8');
  const json = path.extname(nome).toLowerCase() === '.md' ? texto.match(/```json\s*\n([\s\S]*?)\n```/)?.[1] : texto;
  if (!json) throw new Error('Referência sem bloco JSON.');
  const dados = JSON.parse(json);
  if (dados.monetary_scale !== 10000 || !dados.without_payments || !dados.with_payments || !dados.filters) throw new Error('Referência incompatível.');
  return { dados, sha256: hash(texto) };
}

export function conferirReferencia(obtido, esperado) {
  const diferencas = [];
  function conferir(a, b, campo) {
    if (a === b) return;
    if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
      const chaves = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const k of chaves) conferir(a[k], b[k], campo ? campo + '.' + k : k);
    } else diferencas.push({ campo, esperado: b === undefined ? '<ausente>' : b, obtido: a === undefined ? '<ausente>' : a });
  }
  for (const chave of ['filters', 'monetary_scale', 'without_payments', 'with_payments']) conferir(obtido[chave], esperado[chave], chave);
  return { confere: diferencas.length === 0, diferencas };
}

function precisao(valor) {
  if (typeof valor === 'number' && !Number.isSafeInteger(valor)) throw new Error('Valor fora da precisão inteira suportada pelo painel.');
  if (valor && typeof valor === 'object') for (const v of Object.values(valor)) precisao(v);
}

function totais(lidos, filtros) {
  const sem = consolidar(lidos.filter(r => r.tipo !== 'arrecadacao'));
  const com = consolidar(lidos);
  const a = calcular(sem, filtros), b = calcular(com, filtros);
  const r = {
    filters: filtros, monetary_scale: 10000,
    without_payments: { summary: sem.resumo, cards: a.cards, commercial_total: a.comercial.total },
    with_payments: { collection: com.arrecadacao, cards: b.cards, commercial_total: b.comercial.total },
  };
  precisao(r);
  return r;
}

async function listar(entradas) {
  const arquivos = [], ignorados = [], vistos = new Set();
  for (let i = 0; i < entradas.length; i++) {
    const raiz = path.resolve(entradas[i]);
    await semLinks(raiz);
    if (!(await fs.stat(raiz)).isDirectory()) throw new Error('Cada entrada deve ser uma pasta.');
    async function visitar(dir, prefixo = '', profundidade = 0) {
      const itens = await fs.readdir(dir, { withFileTypes: true });
      itens.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
      for (const item of itens) {
        const relativo = prefixo + item.name, absoluto = path.join(dir, item.name);
        const chave = String(i + 1) + '/' + relativo;
        if (vistos.has(absoluto)) continue;
        vistos.add(absoluto);
        if (item.isSymbolicLink()) { ignorados.push({ path: chave, motivo: 'LINK_SIMBOLICO' }); continue; }
        if (item.isDirectory()) {
          if (profundidade < 10) await visitar(absoluto, relativo + '/', profundidade + 1);
          else ignorados.push({ path: chave, motivo: 'LIMITE_SUBPASTAS' });
          continue;
        }
        if (!item.isFile()) continue;
        const ext = path.extname(item.name).toLowerCase();
        let motivo = '';
        if (item.name.startsWith('~$')) motivo = 'TEMPORARIO_EXCEL';
        else if (ext === '.xlsx' && !ehArquivoDoPainel(item.name)) motivo = 'XLSX_FORA_DO_ESCOPO';
        else if (ext === '.csv' && !ehArquivoDeArrecadacao(path.basename(raiz) + '/' + relativo)) motivo = 'CSV_FORA_DO_ESCOPO';
        else if (!['.csv', '.xlsx'].includes(ext)) motivo = 'FORMATO_FORA_DO_ESCOPO';
        if (motivo) { ignorados.push({ path: chave, motivo }); continue; }
        const stat = await fs.stat(absoluto), sha256 = await hashArquivo(absoluto);
        arquivos.push({ path: chave, absoluto, name: item.name, size: stat.size, lastModified: stat.mtimeMs, sha256, ext });
      }
    }
    await visitar(raiz);
  }
  arquivos.sort(ordem); ignorados.sort(ordem);
  if (!arquivos.length) throw new Error('Nenhum arquivo de Atividades, Cluster ou Arrecadação reconhecido.');
  return { arquivos, ignorados };
}

async function verificarCarga(dir, identidade) {
  await semLinks(dir);
  const manifesto = JSON.parse(await fs.readFile(path.join(dir, 'manifesto.json'), 'utf8'));
  if (manifesto.identidade !== identidade || manifesto.schema !== SCHEMA || !Array.isArray(manifesto.integridade)) throw new Error('Carga anterior incompatível.');
  for (const f of manifesto.integridade) {
    const nome = path.resolve(dir, f.path);
    if (!dentro(dir, nome)) throw new Error('Caminho inválido no manifesto.');
    await semLinks(nome);
    if (!(await fs.stat(nome)).isFile() || await hashArquivo(nome) !== f.sha256) throw new Error('Integridade da carga anterior não confere.');
  }
  return manifesto;
}

/** Saída imutável por conjunto de entradas + regras + filtros. Nenhuma rede, banco ou API. */
export async function importarPiloto({ entradas, saida, referencia, filtros: pedidos = {} }) {
  if (!Array.isArray(entradas) || !entradas.length || !saida) throw new Error('Informe entrada e saída.');
  saida = path.resolve(saida);
  await semLinks(saida);
  if (dentro(RAIZ, saida) && !dentro(path.join(RAIZ, 'piloto', 'dados-local'), saida)) throw new Error('Dentro do repositório, use somente piloto/dados-local para dados locais.');
  for (const e of entradas) if (dentro(path.resolve(e), saida) || dentro(saida, path.resolve(e))) throw new Error('Entrada e saída devem ficar em pastas separadas.');
  const ref = referencia ? await lerReferencia(referencia) : null;
  const filtros = { ...(ref?.dados.filters || {}), ...pedidos };
  for (const chave of Object.keys(filtros)) if (!['mes', 'data', 'frente', 'cluster'].includes(chave) || typeof filtros[chave] !== 'string') throw new Error('Filtro inválido.');
  if (filtros.mes && !/^\d{4}-(0[1-9]|1[0-2])$/.test(filtros.mes)) throw new Error('Mês inválido.');
  if (filtros.data && (!/^\d{4}-\d{2}-\d{2}$/.test(filtros.data) || Number.isNaN(Date.parse(filtros.data)) || new Date(filtros.data).toISOString().slice(0, 10) !== filtros.data)) throw new Error('Data inválida.');
  if (filtros.mes && filtros.data && !filtros.data.startsWith(filtros.mes + '-')) throw new Error('Data fora do mês informado.');
  await fs.mkdir(saida, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32' && ((await fs.stat(saida)).mode & 0o077)) throw new Error('A pasta de saída deve ser privada (permissão 700).');
  const lock = await fs.open(path.join(saida, '.importacao.lock'), 'wx', 0o600).catch(e => { if (e.code === 'EEXIST') throw new Error('Já existe uma importação em andamento ou um lock pendente.'); throw e; });
  let temporario = null, fd = null, arquivoAtual = null;
  try {
    const { arquivos, ignorados } = await listar(entradas);
    const libs = (await fs.readdir(path.join(RAIZ, 'lib'))).filter(n => n.endsWith('.ts')).sort();
    const regras = [];
    for (const n of libs) regras.push([n, await hashArquivo(path.join(RAIZ, 'lib', n))]);
    regras.push(['tools/importar-piloto.mjs', await hashArquivo(fileURLToPath(import.meta.url))]);
    const versaoRegra = hash(JSON.stringify(regras));
    const fontes = arquivos.map(({ path: p, name, size, sha256 }) => ({ path: p, name, size, sha256 }));
    const identidade = hash(JSON.stringify({ schema: SCHEMA, fontes, ignorados, versaoRegra, filtros, referencia: ref?.sha256 || null }));
    const destino = path.join(saida, 'carga-' + identidade);
    const existe = await fs.lstat(destino).then(() => true).catch(e => { if (e.code === 'ENOENT') return false; throw e; });
    if (existe) {
      const anterior = await verificarCarga(destino, identidade);
      if (anterior.comparacao?.confere !== false) await ultima(saida, path.basename(destino));
      return { estado: 'reaproveitado', carga: destino, comparacao: anterior.comparacao, arquivos: arquivos.length };
    }
    temporario = await fs.mkdtemp(path.join(saida, '.carga-'));
    await fs.chmod(temporario, 0o700);
    await fs.mkdir(path.join(temporario, 'originais'), { mode: 0o700 });
    fd = openSync(path.join(temporario, 'linhas.ndjson'), 'wx', 0o600);
    const lidos = [], fontesCapturadas = [], contagens = { aceito: 0, parcial: 0, ignorado: 0 };
    for (let i = 0; i < arquivos.length; i++) {
      const f = arquivos[i], original = 'originais/' + String(i + 1) + f.ext;
      arquivoAtual = f.path;
      const copia = path.join(temporario, original);
      await fs.copyFile(f.absoluto, copia, constants.COPYFILE_EXCL);
      await fs.chmod(copia, 0o600);
      if (await hashArquivo(copia) !== f.sha256) throw new Error('Arquivo alterado durante a importação; repita após a sincronização.');
      const blob = await openAsBlob(copia);
      const file = { name: f.name, size: blob.size, lastModified: f.lastModified, slice: (a, z) => blob.slice(a, z) };
      const fileId = hash(JSON.stringify([f.path, f.sha256]));
      const onRegistro = r => {
        contagens[r.estado]++;
        const id = hash(JSON.stringify([fileId, r.aba, r.linha, r.tipo, r.indice ?? null]));
        writeSync(fd, JSON.stringify({ id, arquivo_id: fileId, arquivo: f.path, etapa: 'leitura', ...r }) + '\n');
      };
      const r = f.ext === '.csv' ? await lerArrecadacao(file, { onRegistro }) : await lerArquivo(file, { onRegistro });
      precisao(r);
      r.path = f.path; r.name = f.name; r.size = f.size; r.lastModified = f.lastModified;
      lidos.push(r);
      fontesCapturadas.push({ ...fontes[i], id: fileId, original, tipo: r.tipo, aba: r.aba || 'CSV', avisos: r.avisos, stats: r.stats || null });
    }
    arquivoAtual = null;
    closeSync(fd); fd = null;
    if (!lidos.some(r => r.tipo === 'atividades')) throw new Error('Carga sem arquivo de atividades válido.');
    const resultado = totais(lidos, filtros);
    const comparacao = ref ? conferirReferencia(resultado, ref.dados) : null;
    await escrever(path.join(temporario, 'leitura.json'), lidos);
    await escrever(path.join(temporario, 'resumo.json'), resultado);
    const integridade = [];
    for (const p of ['leitura.json', 'resumo.json', 'linhas.ndjson', ...fontesCapturadas.map(f => f.original)]) integridade.push({ path: p, sha256: await hashArquivo(path.join(temporario, p)) });
    await escrever(path.join(temporario, 'manifesto.json'), { schema: SCHEMA, identidade, criadoEm: new Date().toISOString(), versaoRegra, filtros, fontes: fontesCapturadas, ignorados, contagens, comparacao, integridade });
    await fs.rename(temporario, destino); temporario = null;
    if (comparacao?.confere !== false) await ultima(saida, path.basename(destino));
    return { estado: 'importado', carga: destino, comparacao, arquivos: arquivos.length };
  } catch (e) {
    try {
      await escrever(path.join(saida, 'falha-' + randomUUID() + '.json'), { quando: new Date().toISOString(), arquivo: arquivoAtual, codigo: e.code || 'IMPORTACAO', mensagem: e.message });
    } catch { /* Preservar a falha original mesmo se o disco estiver cheio. */ }
    throw e;
  } finally {
    if (fd !== null) closeSync(fd);
    if (temporario) await fs.rm(temporario, { recursive: true, force: true });
    await lock.close();
    await fs.unlink(path.join(saida, '.importacao.lock'));
  }
}

async function main(args) {
  const opcoes = { entradas: [], filtros: {} };
  const mapa = { '--entrada': 'entrada', '--saida': 'saida', '--referencia': 'referencia', '--mes': 'mes', '--data': 'data', '--frente': 'frente', '--cluster': 'cluster' };
  if (args.length === 0 || args.includes('--ajuda')) {
    console.log('Uso: node tools/importar-piloto.mjs --entrada PASTA [--entrada OUTRA_PASTA] --saida PASTA_PRIVADA [--referencia piloto/BASELINE.md] [--mes AAAA-MM] [--data AAAA-MM-DD]');
    return;
  }
  for (let i = 0; i < args.length; i++) {
    const k = mapa[args[i]], v = args[++i];
    if (!k || !v || v.startsWith('--')) throw new Error('Argumento inválido. Consulte --ajuda.');
    if (k === 'entrada') opcoes.entradas.push(v);
    else if (['mes', 'data', 'frente', 'cluster'].includes(k)) opcoes.filtros[k] = v;
    else opcoes[k] = v;
  }
  const r = await importarPiloto(opcoes);
  console.log(JSON.stringify({ estado: r.estado, arquivos: r.arquivos, referencia: r.comparacao === null ? 'nao_solicitada' : r.comparacao.confere ? 'confere' : 'divergente' }));
  if (r.comparacao?.confere === false) process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(() => { console.error('Importação interrompida. Confira os argumentos e os relatórios falha-*.json na pasta privada, quando gerados.'); process.exitCode = 1; });
}
