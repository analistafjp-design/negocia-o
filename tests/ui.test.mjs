// Testes de interface no Chromium (Playwright) sobre o export estático de `npm run build` (pasta out/).
// Planilhas sintéticas: python3 tools/make_fixtures.py tests/fixtures. Chromium: `npx playwright install chromium`
// ou CHROMIUM_PATH=/caminho/do/chromium.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(raiz, 'out');
const FX = path.join(raiz, 'tests', 'fixtures');
const PRINT = path.join(FX, 'print');
const CASOS = path.join(FX, 'casos');
const SHOTS = process.env.NEG_SHOTS || '';

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain', '.woff2': 'font/woff2' };

let browser;
let server;
let url;

test.before(async () => {
  assert.ok(fs.existsSync(path.join(OUT, 'index.html')), 'rode `npm run build` antes dos testes');
  assert.ok(fs.existsSync(PRINT), 'gere as planilhas: python3 tools/make_fixtures.py tests/fixtures');
  server = http.createServer((req, res) => {
    const caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let arq = path.join(OUT, caminho);
    if (!arq.startsWith(OUT)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(arq) && fs.statSync(arq).isDirectory()) arq = path.join(arq, 'index.html');
    if (!fs.existsSync(arq)) { res.writeHead(404).end('nao encontrado'); return; }
    res.writeHead(200, { 'content-type': TIPOS[path.extname(arq)] || 'application/octet-stream' });
    res.end(fs.readFileSync(arq));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = 'http://127.0.0.1:' + server.address().port + '/';
  browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: process.env.CHROMIUM_PATH || undefined });
});
test.after(async () => {
  await browser?.close();
  server?.close();
});

async function abrir(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.w || 1440, height: opts.h || 900 }, locale: 'pt-BR' });
  const page = await ctx.newPage();
  page.erros = [];
  page.on('pageerror', (e) => page.erros.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.erros.push('console: ' + m.text()); });
  const pedidos = [];
  page.on('request', (r) => { if (!r.url().startsWith(url) && !r.url().startsWith('data:')) pedidos.push(r.url()); });
  page.pedidosExternos = pedidos;
  await page.goto(url);
  await page.waitForSelector('[data-kpi="total"]');
  return page;
}
const semErros = (page) => {
  assert.deepEqual(page.erros, [], 'erros no console/página');
  assert.deepEqual(page.pedidosExternos, [], 'nenhuma requisição para fora do próprio site');
};
const limpa = (t) => t.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const kpi = async (page, k) => limpa(await page.textContent(`[data-kpi="${k}"] [data-kpi-valor]`));
const celulas = (tr) => [...tr.children].map((c) => c.textContent).join(' ');
const linha = async (page, painel, rotulo) =>
  limpa(await page.locator(`[data-painel="${painel}"] tr[data-linha="${rotulo}"]`).first().evaluate(celulas));
const arquivosDoPrint = () => fs.readdirSync(PRINT).map((n) => path.join(PRINT, n));

async function carregarPrint(page) {
  await page.setInputFiles('input[data-entrada="arquivos"]', arquivosDoPrint());
  await page.waitForSelector('[data-aviso="success"], [data-aviso="warning"]');
}
async function filtrarDiaDoPrint(page) {
  await page.selectOption('#f-mes', '2026-09');
  await page.selectOption('#f-data', '2026-09-29');
}

test('sem dados: cartões vazios e um único botão Conectar pasta (o do cabeçalho)', async () => {
  const page = await abrir();
  assert.equal(await kpi(page, 'total'), '—');
  assert.equal(await kpi(page, 'valTotal'), '—');
  assert.match(limpa(await page.textContent('[data-painel="comercial"]')), /Conecte a pasta para ver os dados/);
  assert.equal(await page.isDisabled('#f-frente'), true);
  assert.match(limpa(await page.textContent('[data-acao="pasta"]')), /Conectar pasta/);
  // pedidos do usuário (16/10/2026): título só "Negociação" e o botão Conectar pasta só no cabeçalho
  assert.equal(limpa(await page.textContent('h1')), 'Negociação');
  assert.equal(await page.title(), 'Negociação');
  assert.equal(await page.getByRole('button', { name: 'Conectar pasta' }).count(), 1, 'sem botão repetido no corpo da página');
  assert.equal(await page.locator('[data-vazio]').count(), 0);
  semErros(page);
  await page.context().close();
});

test('cor: azul do painel Cadastro e Venda (cartão de Total e cabeçalho azul-marinho)', async () => {
  const page = await abrir();
  const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
  const total = await page.locator('[data-kpi="total"]').evaluate((el) => getComputedStyle(el).backgroundImage);
  assert.ok(total.includes(rgb('#364dd4')), 'o Total termina no azul de ação #364dd4');
  const cab = await page.locator('header').evaluate((el) => getComputedStyle(el).backgroundImage);
  assert.match(cab, /rgb\(28, 58, 143\)/, 'começa no azul #1c3a8f');
  assert.match(cab, /rgb\(20, 41, 107\)/, 'termina no azul-marinho #14296b');
  semErros(page);
  await page.context().close();
});

test('arquivos do print: cartões de quantidade e de valor como no Power BI', async () => {
  const page = await abrir();
  await carregarPrint(page);
  await filtrarDiaDoPrint(page);
  assert.deepEqual(
    await Promise.all(['principal', 'cadastro', 'corte', 'desdobro', 'pos', 'total'].map((k) => kpi(page, k))),
    ['124', '—', '—', '0', '8', '132']
  );
  assert.deepEqual(
    await Promise.all(['valPrincipal', 'valCorte', 'valDesdobro', 'valPos', 'valTotal'].map((k) => kpi(page, k))),
    ['R$ 40.382', '—', 'R$ 0', 'R$ 18.046', 'R$ 58.427']
  );
  assert.equal(await page.locator('[data-vazio]').count(), 0, 'o convite some depois de carregar');
  semErros(page);
  await page.context().close();
});

test('matriz Cluster Perfil > frente: valores do print, abrir e fechar linhas', async () => {
  const page = await abrir();
  await carregarPrint(page);
  await filtrarDiaDoPrint(page);
  assert.equal(await linha(page, 'comercial', 'Inadimplente'), 'Inadimplente 71 R$ 33.942,74');
  assert.equal(await linha(page, 'comercial', 'Adimplente'), 'Adimplente 52 R$ 21.629,38');
  assert.equal(await linha(page, 'comercial', '(sem cluster)'), '(sem cluster) 5 R$ 2.249,83');
  assert.equal(await linha(page, 'comercial', 'Nunca Pagou'), 'Nunca Pagou 3 R$ 282,69');
  // frentes abertas por padrão (primeira ocorrência de cada nome é a do primeiro cluster: Inadimplente)
  const frentes = (await page.locator('[data-painel="comercial"] tr[data-nivel="1"]').evaluateAll((trs) => trs.map((tr) => [...tr.children].map((c) => c.textContent).join(' ')))).map(limpa);
  assert.ok(frentes.includes('Leitura 65 R$ 15.787,90'));
  assert.ok(frentes.includes('Corte e Religa 5 R$ 16.138,98'));
  assert.ok(frentes.includes('Pós Corte 1 R$ 2.015,86'));
  assert.ok(frentes.includes('Recadastro 1 —'), 'R$ em branco aparece como traço');
  assert.equal(limpa(await page.textContent('[data-painel="comercial"] [data-total="neg"]')), '131');
  assert.equal(limpa(await page.textContent('[data-painel="comercial"] [data-total="valor"]')), 'R$ 58.104,64');
  // fechar o primeiro cluster esconde as frentes dele
  const antes = await page.locator('[data-painel="comercial"] tr[data-nivel="1"]').count();
  await page.getByRole('button', { name: 'Recolher Inadimplente' }).click();
  assert.equal(await page.locator('[data-painel="comercial"] tr[data-nivel="1"]').count(), antes - 3);
  await page.getByRole('button', { name: 'Expandir Inadimplente' }).click();
  // o terceiro nível (recurso) abre pela frente
  assert.equal(await page.locator('[data-painel="comercial"] tr[data-nivel="2"]').count(), 0);
  await page.getByRole('button', { name: 'Expandir Corte e Religa' }).first().click();
  assert.ok((await page.locator('[data-painel="comercial"] tr[data-nivel="2"]').count()) > 0);
  semErros(page);
  await page.context().close();
});

test('Negociação x Cidade: o total dos cartões passa 1 da soma das cidades (131 x 132 do print)', async () => {
  const page = await abrir();
  await carregarPrint(page);
  await filtrarDiaDoPrint(page);
  assert.equal(limpa(await page.textContent('[data-painel="cidade"] [data-total="neg"]')), '132');
  assert.equal(limpa(await page.textContent('[data-painel="cidade"] [data-total="valor"]')), 'R$ 58.427,47');
  const qtds = await page.locator('[data-painel="cidade"] tbody tr').evaluateAll((trs) => trs.map((tr) => Number(tr.children[1].textContent.replace(/\D/g, ''))));
  assert.equal(qtds.reduce((a, b) => a + b, 0), 131);
  semErros(page);
  await page.context().close();
});

test('Top 10 e Motivo da não Execução', async () => {
  const page = await abrir();
  await carregarPrint(page);
  await filtrarDiaDoPrint(page);
  const nomes = await page.locator('[data-painel="top10"] tbody tr').evaluateAll((trs) => trs.map((tr) => tr.getAttribute('data-linha')));
  assert.ok(nomes.length >= 10);
  assert.ok(nomes.every((n) => !n.startsWith('D11')));
  assert.deepEqual(await page.locator('[data-painel="motivo"] [data-motivo]').allTextContents(), ['DUPLICIDADE DE MATRÍCULA: 1']);
  semErros(page);
  await page.context().close();
});

test('filtros: o mês mais recente vem escolhido; frente, cluster e data refazem os números', async () => {
  const page = await abrir();
  await carregarPrint(page);
  assert.equal(await page.inputValue('#f-mes'), '2026-10', 'abre no mês mais recente');
  assert.equal(await kpi(page, 'principal'), '2');
  await page.selectOption('#f-mes', '');
  assert.equal(await kpi(page, 'principal'), '129');
  await page.selectOption('#f-mes', '2026-09');
  assert.equal(await kpi(page, 'principal'), '127');
  assert.deepEqual(await page.locator('#f-data option').allTextContents(), ['Todas', '28/09/2026', '29/09/2026'], 'as datas são as do mês escolhido');
  await page.selectOption('#f-data', '2026-09-28');
  assert.equal(await kpi(page, 'principal'), '3');
  await page.selectOption('#f-mes', '2026-10');
  assert.equal(await page.inputValue('#f-data'), '', 'a data fora do mês é limpa');
  await filtrarDiaDoPrint(page);
  await page.selectOption('#f-frente', 'Leitura');
  assert.equal(await kpi(page, 'principal'), '115');
  await page.selectOption('#f-frente', '');
  await page.selectOption('#f-cluster', 'Adimplente');
  assert.equal(await kpi(page, 'total'), '52');
  const opcoes = await page.locator('#f-cluster option').allTextContents();
  assert.ok(opcoes.includes('(sem cluster)'));
  semErros(page);
  await page.context().close();
});

test('lê a pasta inteira (com subpasta) e ignora o que não é do painel, como o "Termos de Janeiro a Agosto"', async () => {
  const page = await abrir();
  const pasta = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || '/tmp'), 'neg-pasta-'));
  try {
    for (const n of fs.readdirSync(PRINT)) fs.copyFileSync(path.join(PRINT, n), path.join(pasta, n));
    // tem colunas de atividades (2 negociações em 29/09), mas o nome não é do painel: não pode entrar na conta
    fs.copyFileSync(path.join(CASOS, 'valores_em_texto.xlsx'), path.join(pasta, 'Termos de Janeiro a Agosto.xlsx'));
    // arquivo de atividades numa subpasta (1 negociação em 29/09): tem de entrar
    fs.mkdirSync(path.join(pasta, 'De Janeiro a Setembro'));
    fs.copyFileSync(path.join(CASOS, 'varias_abas.xlsx'), path.join(pasta, 'De Janeiro a Setembro', 'Atividades-INTERIOR_01_09_26.xlsx'));
    await page.setInputFiles('input[data-entrada="pasta"]', pasta);
    await page.waitForSelector('[data-aviso="warning"], [data-aviso="success"]');
    await page.selectOption('#f-mes', '2026-09');
    assert.equal(await kpi(page, 'principal'), '128', '124 do dia + 3 do dia 28 + 1 da subpasta; o Termos (2) ficou de fora');
    const aviso = limpa(await page.textContent('[data-aviso]'));
    assert.match(aviso, /Base carregada: 135 atividades e 9 desdobros de 2 arquivos/);
    assert.match(aviso, /Cluster: 129 matrículas de 1 arquivo/);
    assert.match(aviso, /Ignorados \(sem "Atividade" nem "Cluster" no nome\): Termos de Janeiro a Agosto\.xlsx\./);
    assert.match(aviso, /7 atividades de recursos sem setor/);
    assert.match(limpa(await page.textContent('[data-rodape]')), /Fonte: neg-pasta-/);
    semErros(page);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
    await page.context().close();
  }
});

test('arquivo inválido: mensagem clara, e a base que já estava na tela é mantida', async () => {
  const page = await abrir();
  await carregarPrint(page);
  await filtrarDiaDoPrint(page);
  await page.setInputFiles('input[data-entrada="arquivos"]', path.join(CASOS, 'sem_coluna_obrigatoria.xlsx'));
  await page.waitForSelector('[data-aviso="error"]');
  const aviso = limpa(await page.textContent('[data-aviso="error"]'));
  assert.match(aviso, /Nenhum arquivo de atividades foi carregado/);
  assert.match(aviso, /Faltam colunas obrigatórias.*Negociou O Débito\?/);
  assert.match(aviso, /A base anterior foi mantida/);
  assert.equal(await kpi(page, 'total'), '132', 'os números anteriores continuam na tela');
  semErros(page);
  await page.context().close();
});

test('celular (390 px): sem rolagem lateral e cartões legíveis', async () => {
  const page = await abrir({ w: 390, h: 844 });
  await carregarPrint(page);
  await filtrarDiaDoPrint(page);
  const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(sobra <= 0, 'rolagem lateral de ' + sobra + 'px');
  assert.equal(await kpi(page, 'total'), '132');
  semErros(page);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'celular.png'), fullPage: true });
  await page.context().close();
});

test('tela cheia: captura para conferência visual (opcional)', async () => {
  if (!SHOTS) return;
  const page = await abrir({ w: 1440, h: 1000 });
  await page.screenshot({ path: path.join(SHOTS, 'vazio.png'), fullPage: true });
  await carregarPrint(page);
  await filtrarDiaDoPrint(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 'desktop.png'), fullPage: true });
  await page.context().close();
});
