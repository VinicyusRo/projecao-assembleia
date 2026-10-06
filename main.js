const { app, BrowserWindow, ipcMain, dialog, screen, shell, nativeImage, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const Texto = require('./lib/texto');
const Biblia = require('./lib/biblia');
const IG = require('./lib/igreja');
const Nuvem = require('./lib/nuvem');
const LetrasOnline = require('./lib/letrasOnline');

let opWin = null;
let projWin = null;
let ultimoEstado = null;

// ---------- Armazenamento local (Documentos\ProjecaoADMadureira) ----------
const pasta = () => path.join(app.getPath('documents'), 'ProjecaoADMadureira');
const arq = nome => path.join(pasta(), nome);
const CONFIG_PADRAO = {
  fundoCor: '#0c241a', fundoCss: 'linear-gradient(135deg,#0f3d2c,#1b4d3a 55%,#0b2a1e)', fundoImg: null,
  corTexto: '#ffffff', fonte: 110, maiusculas: false, logoImg: null,
  pastaBanners: null, pinRemoto: null, biblia: null
};

function garantirPastas() {
  for (const p of ['imagens/banners', 'imagens/fundos', 'imagens/avisos', 'imagens/membros', 'biblias'])
    fs.mkdirSync(path.join(pasta(), p), { recursive: true });
}
function lerJSON(f, padrao) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return padrao; }
}
function gravarJSON(f, obj, semBackup) {
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, semBackup ? 0 : 2), 'utf8');
  if (!semBackup && fs.existsSync(f)) fs.copyFileSync(f, f.replace(/\.json$/, '.backup.json'));
  fs.renameSync(tmp, f);
}
const lerMusicas = () => lerJSON(arq('musicas.json'), []);
const gravarMusicas = l => gravarJSON(arq('musicas.json'), l);
const lerConfig = () => Object.assign({}, CONFIG_PADRAO, lerJSON(arq('config.json'), {}));
const gravarConfig = c => gravarJSON(arq('config.json'), c);

function decodificar(buf) {
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) buf = buf.subarray(3);
  if (buf[0] === 0xFF && buf[1] === 0xFE) return new TextDecoder('utf-16le').decode(buf.subarray(2));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch {
    try { return new TextDecoder('windows-1252').decode(buf); }
    catch { return buf.toString('latin1'); }
  }
}
const ehImagem = n => /\.(jpe?g|png|webp|gif|bmp)$/i.test(n);
const filtroImagens = [{ name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }];
function copiarPara(dir, orig) {
  let destino = path.join(dir, path.basename(orig));
  if (fs.existsSync(destino)) destino = path.join(dir, Date.now() + '-' + path.basename(orig));
  fs.copyFileSync(orig, destino);
  return destino;
}

// ---------- Janelas ----------
function enviarOp(canal, dado) { if (opWin && !opWin.isDestroyed()) opWin.webContents.send(canal, dado); }

function criarOperador() {
  opWin = new BrowserWindow({
    width: 1440, height: 880, minWidth: 1200, minHeight: 700,
    title: 'Projeção Assembleia', backgroundColor: '#F4F1EA', autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icone.ico' : 'icone.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  opWin.loadFile(path.join(__dirname, 'src', 'index.html'));
  opWin.on('closed', () => { opWin = null; app.quit(); });
}

function abrirProjetor() {
  if (projWin && !projWin.isDestroyed()) { projWin.focus(); return; }
  const prim = screen.getPrimaryDisplay();
  const ext = screen.getAllDisplays().find(d => d.id !== prim.id);
  const opts = {
    backgroundColor: '#000000', show: false, autoHideMenuBar: true, title: 'Telão',
    icon: path.join(__dirname, 'assets', 'icone.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  };
  if (ext) Object.assign(opts, { x: ext.bounds.x, y: ext.bounds.y, width: ext.bounds.width, height: ext.bounds.height, frame: false });
  else Object.assign(opts, { width: 960, height: 540 });

  projWin = new BrowserWindow(opts);
  projWin.loadFile(path.join(__dirname, 'src', 'projetor.html'));
  projWin.once('ready-to-show', () => {
    projWin.show();
    if (ext) projWin.setFullScreen(true);
    if (opWin) opWin.focus();
  });
  projWin.on('closed', () => { projWin = null; avisarStatus(); });
  avisarStatus();
}
function avisarStatus() {
  enviarOp('projetor:status', { aberto: !!projWin, telas: screen.getAllDisplays().length });
}

// ---------- Músicas e hinos ----------
ipcMain.handle('musicas:listar', () => lerMusicas());

ipcMain.handle('musicas:salvar', (e, m) => {
  const lista = lerMusicas();
  const reg = {
    id: m.id || crypto.randomUUID(),
    titulo: String(m.titulo || 'Sem título').trim(),
    artista: String(m.artista || '').trim(),
    hinario: String(m.hinario || '').trim(),
    numero: m.numero ? +m.numero : null,
    letra: Texto.normalizarQuebras(m.letra).trim(),
    atualizadoEm: Date.now()
  };
  const i = lista.findIndex(x => x.id === reg.id);
  if (i >= 0) lista[i] = reg; else lista.push(reg);
  gravarMusicas(lista);
  return reg;
});

ipcMain.handle('musicas:excluir', (e, id) => {
  gravarMusicas(lerMusicas().filter(m => m.id !== id));
  return true;
});

// Para hinos, o nome do arquivo pode ser "015 - Chuvas de Graça.txt"
ipcMain.handle('musicas:importar', async (e, { corrigir, hinario }) => {
  const r = await dialog.showOpenDialog(opWin, {
    title: hinario ? `Importar hinos (${hinario})` : 'Importar letras',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Letras (.txt)', extensions: ['txt'] }]
  });
  if (r.canceled) return { importadas: 0, duplicadas: 0 };
  const lista = lerMusicas();
  const chave = (h, n, t) => h ? `${h}#${n || Texto.normalizarBusca(t)}` : Texto.normalizarBusca(t);
  const existentes = new Set(lista.map(m => chave(m.hinario, m.numero, m.titulo)));
  let importadas = 0, duplicadas = 0;
  for (const f of r.filePaths) {
    let titulo = path.basename(f, path.extname(f)).trim();
    let numero = null;
    if (hinario) {
      const n = /^(\d{1,4})\s*[-–._)]?\s*(.*)$/.exec(titulo);
      if (n) { numero = +n[1]; titulo = n[2].trim() || titulo; }
    }
    let letra = Texto.normalizarQuebras(decodificar(fs.readFileSync(f)));
    const linhas = letra.split('\n');
    const pri = linhas.findIndex(l => l.trim());
    if (pri >= 0) {
      const p = Texto.normalizarBusca(linhas[pri].replace(/^\s*\d+\s*[-–._)]?\s*/, '').trim());
      if (p === Texto.normalizarBusca(titulo)) { linhas.splice(pri, 1); letra = linhas.join('\n'); }
    }
    letra = corrigir ? Texto.corrigir(letra) : letra.trim();
    const k = chave(hinario, numero, titulo);
    if (existentes.has(k)) { duplicadas++; continue; }
    existentes.add(k);
    lista.push({ id: crypto.randomUUID(), titulo, artista: '', hinario: hinario || '', numero, letra, atualizadoEm: Date.now() });
    importadas++;
  }
  gravarMusicas(lista);
  return { importadas, duplicadas };
});

// ---------- Letras na internet (LRCLIB e Vagalume) ----------
ipcMain.handle('internet:buscar', (e, q, filtros) => LetrasOnline.buscar(q, Object.assign({ chaveVagalume: lerConfig().vagalumeKey }, filtros || {})));
ipcMain.handle('internet:letra', (e, item) => LetrasOnline.letra(item, lerConfig().vagalumeKey));
ipcMain.handle('internet:chave', (e, chave) => { const c = lerConfig(); c.vagalumeKey = String(chave || '').trim(); gravarConfig(c); return !!c.vagalumeKey; });
ipcMain.handle('internet:temChave', () => !!lerConfig().vagalumeKey);
ipcMain.handle('internet:abrirLink', (e, url) => { if (/^https:\/\/(auth\.)?vagalume\.com\.br\//.test(url) || /^https:\/\/lrclib\.net\//.test(url)) shell.openExternal(url); return true; });

// ---------- Bíblias ----------
const indiceBiblias = () => lerJSON(arq('biblias/indice.json'), []);
ipcMain.handle('biblias:listar', () => indiceBiblias());
ipcMain.handle('biblias:importar', async () => {
  const r = await dialog.showOpenDialog(opWin, {
    title: 'Importar versão da Bíblia', properties: ['openFile'],
    filters: [{ name: 'Bíblia (.json, .xml)', extensions: ['json', 'xml'] }]
  });
  if (r.canceled) return { ok: false };
  const f = r.filePaths[0];
  try {
    const { livros, total } = Biblia.lerArquivo(f, decodificar(fs.readFileSync(f)));
    const id = crypto.randomUUID();
    const nome = path.basename(f, path.extname(f));
    gravarJSON(arq(`biblias/${id}.json`), { nome, livros }, true);
    const idx = indiceBiblias(); idx.push({ id, nome, total }); gravarJSON(arq('biblias/indice.json'), idx);
    return { ok: true, id, nome, total };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
});
ipcMain.handle('biblias:carregar', (e, id) => lerJSON(arq(`biblias/${path.basename(id)}.json`), null));
ipcMain.handle('biblias:renomear', (e, id, nome) => {
  const idx = indiceBiblias(); const b = idx.find(x => x.id === id); if (b) b.nome = nome;
  gravarJSON(arq('biblias/indice.json'), idx); return true;
});
ipcMain.handle('biblias:excluir', (e, id) => {
  gravarJSON(arq('biblias/indice.json'), indiceBiblias().filter(x => x.id !== id));
  const f = arq(`biblias/${path.basename(id)}.json`); if (fs.existsSync(f)) fs.unlinkSync(f);
  return true;
});

// ---------- Avisos (editáveis, com fundo próprio) ----------
ipcMain.handle('avisos:listar', () => listarAvisos());
ipcMain.handle('avisos:salvar', async (e, a) => {
  if (modoNuvem()) return nuvemSalvarAviso(a);
  const lista = lerJSON(arq('avisos.json'), []);
  const reg = Object.assign({}, a, { id: a.id || crypto.randomUUID(), atualizadoEm: Date.now() });
  const i = lista.findIndex(x => x.id === reg.id);
  if (i >= 0) lista[i] = reg; else lista.push(reg);
  gravarJSON(arq('avisos.json'), lista);
  return reg;
});
ipcMain.handle('avisos:excluir', async (e, id) => {
  if (modoNuvem()) return nuvemExcluirAviso(id);
  gravarJSON(arq('avisos.json'), lerJSON(arq('avisos.json'), []).filter(x => x.id !== id));
  return true;
});


// ---------- Membros (aniversários) e visitantes ----------
function crud(nomeArq, prefixo) {
  ipcMain.handle(prefixo + ':listar', () => lerJSON(arq(nomeArq), []));
  ipcMain.handle(prefixo + ':salvar', (e, item) => {
    const lista = lerJSON(arq(nomeArq), []);
    const reg = Object.assign({}, item, { id: item.id || crypto.randomUUID() });
    const i = lista.findIndex(x => x.id === reg.id);
    if (i >= 0) lista[i] = reg; else lista.push(reg);
    gravarJSON(arq(nomeArq), lista);
    return reg;
  });
  ipcMain.handle(prefixo + ':excluir', (e, id) => {
    gravarJSON(arq(nomeArq), lerJSON(arq(nomeArq), []).filter(x => x.id !== id));
    return true;
  });
}
crud('membros.json', 'membros');
crud('visitantes.json', 'visitantes');

// Lista de membros: uma pessoa por linha -> "Nome; 15/03"  (ou separado por vírgula / tab).
// Se a linha tiver a palavra "casamento" ou "casal", vira aniversário de casamento.
ipcMain.handle('membros:importar', async () => {
  const r = await dialog.showOpenDialog(opWin, {
    title: 'Importar membros', properties: ['openFile'],
    filters: [{ name: 'Lista (.csv, .txt)', extensions: ['csv', 'txt'] }]
  });
  if (r.canceled) return { importados: 0, ignorados: 0 };
  const linhas = decodificar(fs.readFileSync(r.filePaths[0])).split(/\r?\n/);
  const lista = lerJSON(arq('membros.json'), []);
  const chave = m => Texto.normalizarBusca(m.nome) + '|' + m.dia + '/' + m.mes;
  const existentes = new Set(lista.map(chave));
  let importados = 0, ignorados = 0;
  for (const l of linhas) {
    if (!l.trim()) continue;
    const col = l.split(/[;,\t]/).map(c => c.trim().replace(/^"|"$/g, ''));
    const d = /(\d{1,2})\s*\/\s*(\d{1,2})/.exec(col.slice(1).join(' '));
    if (!col[0] || !d || +d[1] < 1 || +d[1] > 31 || +d[2] < 1 || +d[2] > 12) { ignorados++; continue; }
    const m = { nome: col[0], dia: +d[1], mes: +d[2], casal: /casa(l|mento)/i.test(col.slice(1).join(' ')) };
    if (existentes.has(chave(m))) { ignorados++; continue; }
    existentes.add(chave(m));
    lista.push(Object.assign({ id: crypto.randomUUID() }, m));
    importados++;
  }
  gravarJSON(arq('membros.json'), lista);
  return { importados, ignorados };
});

// Foto do membro / casal: reduzida para no máximo 700 px e salva em JPG
ipcMain.handle('membros:foto', async () => {
  const r = await dialog.showOpenDialog(opWin, { title: 'Foto do membro', properties: ['openFile'], filters: filtroImagens });
  if (r.canceled) return null;
  const dest = path.join(pasta(), 'imagens', 'membros', Date.now() + '.jpg');
  try {
    let img = nativeImage.createFromPath(r.filePaths[0]);
    if (img.isEmpty()) throw new Error('vazia');
    const { width, height } = img.getSize();
    if (Math.max(width, height) > 700) img = img.resize(width >= height ? { width: 700 } : { height: 700, quality: 'best' });
    fs.writeFileSync(dest, img.toJPEG(85));
  } catch {
    fs.copyFileSync(r.filePaths[0], dest.replace(/\.jpg$/, path.extname(r.filePaths[0]).toLowerCase()));
    return pathToFileURL(dest.replace(/\.jpg$/, path.extname(r.filePaths[0]).toLowerCase())).href;
  }
  return pathToFileURL(dest).href;
});

// ---------- Backup ----------
const pastaBackups = () => path.join(app.getPath('documents'), 'ProjecaoADMadureira-Backups');
const carimbo = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}h${p(d.getMinutes())}`; };
function fazerBackup(destino, rotulo) {
  const alvo = path.join(destino, `Backup Projecao AD ${carimbo()}${rotulo ? ' ' + rotulo : ''}`);
  fs.cpSync(pasta(), alvo, { recursive: true, filter: f => !f.endsWith('.tmp') });
  fs.writeFileSync(path.join(alvo, 'backup-info.json'), JSON.stringify({ pastaOriginal: pathToFileURL(pasta()).href, criadoEm: new Date().toISOString() }, null, 2));
  return alvo;
}
function backupAutomatico() {
  try {
    const dir = pastaBackups(); fs.mkdirSync(dir, { recursive: true });
    const hoje = carimbo().slice(0, 10);
    const existentes = fs.readdirSync(dir).filter(n => n.startsWith('Backup Projecao AD ')).sort();
    if (!existentes.some(n => n.includes(hoje))) fazerBackup(dir);
    const todos = fs.readdirSync(dir).filter(n => n.startsWith('Backup Projecao AD ') && !n.includes('antes de restaurar')).sort();
    for (const n of todos.slice(0, Math.max(0, todos.length - 10))) fs.rmSync(path.join(dir, n), { recursive: true, force: true });
  } catch (e) { console.error('backup automático:', e.message); }
}
function ultimoBackup() {
  try {
    const n = fs.readdirSync(pastaBackups()).filter(x => x.startsWith('Backup Projecao AD ')).sort().pop();
    return n ? n.replace('Backup Projecao AD ', '') : null;
  } catch { return null; }
}
ipcMain.handle('backup:info', () => ({ ultimo: ultimoBackup(), pasta: pastaBackups() }));
ipcMain.handle('backup:abrirPasta', () => { fs.mkdirSync(pastaBackups(), { recursive: true }); return shell.openPath(pastaBackups()); });
ipcMain.handle('backup:fazer', async () => {
  const r = await dialog.showOpenDialog(opWin, { title: 'Onde salvar o backup? (ex.: pendrive)', properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled) return { ok: false };
  try { return { ok: true, pasta: fazerBackup(r.filePaths[0]) }; }
  catch (e) { return { ok: false, erro: e.message }; }
});
ipcMain.handle('backup:restaurar', async () => {
  const r = await dialog.showOpenDialog(opWin, { title: 'Escolha a pasta do backup (Backup Projecao AD …)', properties: ['openDirectory'] });
  if (r.canceled) return { ok: false };
  const origem = r.filePaths[0];
  const valido = ['musicas.json', 'config.json', 'backup-info.json', 'membros.json'].some(f => fs.existsSync(path.join(origem, f)));
  if (!valido) return { ok: false, erro: 'Esta pasta não parece ser um backup do programa.' };
  if (path.resolve(origem) === path.resolve(pasta())) return { ok: false, erro: 'Esta é a pasta atual de dados.' };
  const c = await dialog.showMessageBox(opWin, {
    type: 'warning', buttons: ['Restaurar', 'Cancelar'], defaultId: 1, cancelId: 1,
    title: 'Restaurar backup', message: 'Restaurar este backup?',
    detail: 'Os dados atuais serão substituídos. Antes disso, uma cópia de segurança dos dados atuais é guardada na pasta de backups.'
  });
  if (c.response !== 0) return { ok: false };
  try {
    fs.mkdirSync(pastaBackups(), { recursive: true });
    fazerBackup(pastaBackups(), 'antes de restaurar');
    fs.cpSync(origem, pasta(), { recursive: true, force: true, filter: f => !f.endsWith('backup-info.json') });
    // Ajusta o caminho das imagens se o backup veio de outro computador / usuário
    const info = lerJSON(path.join(origem, 'backup-info.json'), null);
    const novo = pathToFileURL(pasta()).href;
    if (info && info.pastaOriginal && info.pastaOriginal !== novo) {
      for (const f of fs.readdirSync(pasta()).filter(n => n.endsWith('.json'))) {
        const t = fs.readFileSync(path.join(pasta(), f), 'utf8');
        if (t.includes(info.pastaOriginal)) fs.writeFileSync(path.join(pasta(), f), t.split(info.pastaOriginal).join(novo));
      }
    }
    setTimeout(() => opWin && opWin.reload(), 300);
    return { ok: true };
  } catch (e) { return { ok: false, erro: e.message }; }
});

// ---------- Imagens ----------
function dirImagens(tipo) {
  if (tipo === 'banners') {
    const p = lerConfig().pastaBanners;
    if (p && fs.existsSync(p)) return p;
  }
  return path.join(pasta(), 'imagens', tipo);
}
ipcMain.handle('imagens:listar', (e, tipo) => {
  if (tipo === 'banners') return listarBanners();
  const dir = dirImagens(tipo);
  try {
    return fs.readdirSync(dir).filter(ehImagem)
      .map(n => ({ nome: n, url: pathToFileURL(path.join(dir, n)).href, t: fs.statSync(path.join(dir, n)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
  } catch { return []; }
});
ipcMain.handle('imagens:adicionar', async (e, tipo) => {
  const r = await dialog.showOpenDialog(opWin, {
    title: tipo === 'fundos' ? 'Adicionar fundos' : 'Adicionar imagens',
    properties: ['openFile', 'multiSelections'], filters: filtroImagens
  });
  if (r.canceled) return [];
  if (tipo === 'banners' && modoNuvem()) {
    const nomes = [];
    for (const f of r.filePaths) nomes.push(await nuvemNovoBanner(fs.readFileSync(f), path.extname(f), { titulo: path.basename(f, path.extname(f)) }));
    return nomes;
  }
  const dir = dirImagens(tipo);
  return r.filePaths.map(f => path.basename(copiarPara(dir, f)));
});
ipcMain.handle('imagens:excluir', async (e, tipo, nome) => {
  if (tipo === 'banners' && modoNuvem()) return nuvemExcluirBanner(nome);
  const f = path.join(dirImagens(tipo), path.basename(nome));
  if (fs.existsSync(f)) fs.unlinkSync(f);
  if (tipo === 'banners') { const m = lerMetaBanners(); delete m[path.basename(nome)]; gravarJSON(arq('banners.json'), m); }
  return true;
});
ipcMain.handle('imagem:escolher', async (e, tipo) => {
  const r = await dialog.showOpenDialog(opWin, { title: 'Escolher imagem', properties: ['openFile'], filters: filtroImagens });
  if (r.canceled) return null;
  return pathToFileURL(copiarPara(path.join(pasta(), 'imagens', tipo || 'avisos'), r.filePaths[0])).href;
});

// Pasta de banners (pode ser uma pasta do OneDrive / Google Drive para receber banners de casa)
let observador = null;
function observarBanners() {
  if (observador) { observador.close(); observador = null; }
  const dir = dirImagens('banners');
  let t;
  try {
    observador = fs.watch(dir, () => { clearTimeout(t); t = setTimeout(() => enviarOp('banners:mudou'), 800); });
  } catch { /* pasta indisponível */ }
}
ipcMain.handle('banners:pasta', () => ({ atual: dirImagens('banners'), personalizada: !!lerConfig().pastaBanners }));
ipcMain.handle('banners:escolherPasta', async () => {
  const r = await dialog.showOpenDialog(opWin, { title: 'Pasta de banners', properties: ['openDirectory'] });
  if (r.canceled) return null;
  const c = lerConfig(); c.pastaBanners = r.filePaths[0]; gravarConfig(c);
  observarBanners();
  return r.filePaths[0];
});
ipcMain.handle('banners:pastaPadrao', () => {
  const c = lerConfig(); c.pastaBanners = null; gravarConfig(c); observarBanners(); return true;
});

// ---------- Configuração, culto ----------
ipcMain.handle('config:obter', () => lerConfig());
ipcMain.handle('config:salvar', (e, c) => {
  const atual = lerConfig();
  gravarConfig(Object.assign({}, c, { pastaBanners: atual.pastaBanners, pinRemoto: atual.pinRemoto, acessos: atual.acessos, exigirPin: atual.exigirPin, vagalumeKey: atual.vagalumeKey, nuvem: atual.nuvem }));
  return true;
});
ipcMain.handle('culto:obter', () => lerJSON(arq('culto.json'), { lista: [], anotacoes: '' }));
ipcMain.handle('culto:salvar', (e, c) => { gravarJSON(arq('culto.json'), c); return true; });

// ---------- Telão ----------
ipcMain.on('estado:enviar', (e, estado) => {
  ultimoEstado = estado;
  if (projWin) projWin.webContents.send('estado', estado);
});
ipcMain.handle('estado:obter', () => ultimoEstado);
ipcMain.handle('projetor:alternar', () => { if (projWin) projWin.close(); else abrirProjetor(); return true; });
ipcMain.handle('pasta:abrir', () => shell.openPath(pasta()));

// ---------- App de celular (Android / iPhone) pela rede Wi-Fi da igreja ----------
// Perfis: controle (passar slides), recepcao (visitantes), leitura (avisos para ler), midia (avisos e banners)
const PERFIS = ['controle', 'recepcao', 'leitura', 'midia'];
const PODE = {                       // o que cada perfil acessa
  estado: ['controle'], cmd: ['controle'],
  visitantes: ['recepcao', 'midia'], leitura: ['leitura', 'midia', 'recepcao'], midia: ['midia']
};
let remoto = { titulo: '', slides: [], vivo: -1, modo: 'logo' };
let infoRede = { urls: [], porta: 0 };
ipcMain.on('remoto:estado', (e, s) => { remoto = s; });

function acessos() {
  const c = lerConfig(); let mudou = false;
  c.acessos = c.acessos || {};
  if (c.pinRemoto && !c.acessos.controle) { c.acessos.controle = c.pinRemoto; mudou = true; }
  for (const p of PERFIS) if (!c.acessos[p]) { c.acessos[p] = novoPin(c.acessos); mudou = true; }
  if (mudou) gravarConfig(c);
  return c.acessos;
}
function novoPin(usados) {
  let pin; do { pin = String(crypto.randomInt(1000, 10000)); } while (Object.values(usados).includes(pin));
  return pin;
}
ipcMain.handle('remoto:info', () => ({ urls: infoRede.urls, pin: acessos().controle }));
ipcMain.handle('acessos:obter', () => ({ urls: infoRede.urls, acessos: acessos(), exigirPin: !!lerConfig().exigirPin }));
ipcMain.handle('acessos:exigirPin', (e, sim) => { const c = lerConfig(); c.exigirPin = !!sim; gravarConfig(c); return !!sim; });
ipcMain.handle('acessos:novoPin', (e, perfil) => {
  const c = lerConfig(); c.acessos = acessos();
  c.acessos[perfil] = novoPin(c.acessos); if (perfil === 'controle') c.pinRemoto = c.acessos.controle;
  gravarConfig(c); return c.acessos;
});

// Banners: título, descrição, datas e "anunciar no telão"
const lerMetaBanners = () => lerJSON(arq('banners.json'), {});
ipcMain.handle('banners:salvarMeta', async (e, nome, meta) => {
  if (modoNuvem()) return nuvemMetaBanner(nome, meta);
  const m = lerMetaBanners(); m[path.basename(nome)] = meta; gravarJSON(arq('banners.json'), m); return true;
});

const hojeISO = () => IG.iso(new Date());
const dentroDoPeriodo = x => (!x.inicio || x.inicio <= hojeISO()) && (!x.fim || x.fim >= hojeISO());
const baseHref = () => pathToFileURL(pasta()).href + '/';
function paraWeb(u) {
  if (!u) return null;
  if (u.startsWith(baseHref())) return '/img/' + u.slice(baseHref().length);
  const bd = pathToFileURL(dirImagens('banners')).href + '/';
  if (u.startsWith(bd)) return '/banner/' + u.slice(bd.length);
  return null;
}
function listarBanners() {
  if (modoNuvem()) return nuvemBanners();
  const meta = lerMetaBanners(), dir = dirImagens('banners');
  try {
    return fs.readdirSync(dir).filter(ehImagem).map(n => Object.assign(
      { nome: n, url: pathToFileURL(path.join(dir, n)).href, t: fs.statSync(path.join(dir, n)).mtimeMs, titulo: '', descricao: '', inicio: '', fim: '', rotativo: true },
      meta[n] || {})).sort((a, b) => b.t - a.t);
  } catch { return []; }
}
function salvarDataURL(dataURL, dir, nomeBase) {
  const m = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/i.exec(dataURL || '');
  if (!m) throw new Error('Imagem inválida');
  const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
  let nome = (String(nomeBase || 'imagem').replace(/\.[^.]+$/, '').replace(/[^\w\- À-ú]/g, '').trim() || 'imagem') + '.' + ext;
  if (fs.existsSync(path.join(dir, nome))) nome = Date.now() + '-' + nome;
  fs.writeFileSync(path.join(dir, nome), Buffer.from(m[2], 'base64'));
  return nome;
}
const AVISO_NOVO = { fundoTipo: 'tema', fundoTema: 0, fundoCor: '#1b4d3a', fundoImg: null, escurecer: 0,
  corTitulo: '#ffffff', corTexto: '#f4f1ea', tamanho: 100, posicao: 'centro', destaque: true, rotativo: true, inicio: '', fim: '' };

// ---------- Mídia online (Supabase): avisos e banners na nuvem, com cópia neste computador ----------
// Com a nuvem ligada, a equipe de mídia publica de casa e este computador baixa tudo a cada minuto.
// As imagens ficam guardadas aqui também: se a internet cair no culto, o telão continua funcionando.
const modoNuvem = () => { const n = lerConfig().nuvem; return !!(n && n.ativo); };
const dirNuvem = () => path.join(pasta(), 'imagens', 'nuvem');
const lerCache = () => lerJSON(arq('nuvem-cache.json'), { avisos: [], banners: [] });
let nuvem = null, statusNuvem = { ok: false, quando: null, erro: null };

function cifrar(txt) {
  if (safeStorage && safeStorage.isEncryptionAvailable()) return { c: true, v: safeStorage.encryptString(txt).toString('base64') };
  return { c: false, v: Buffer.from(txt, 'utf8').toString('base64') };
}
function decifrar(o) {
  if (!o) return '';
  const b = Buffer.from(o.v, 'base64');
  return o.c ? safeStorage.decryptString(b) : b.toString('utf8');
}
function conexaoNuvem() {
  const n = lerConfig().nuvem;
  if (!n || !n.url) return null;
  if (!nuvem || nuvem.url !== n.url.replace(/\/+$/, '') || nuvem.email !== n.email)
    nuvem = new Nuvem({ url: n.url, chave: n.chave, email: n.email, senha: decifrar(n.senha) });
  return nuvem;
}
const nomeLocal = u => { const c = nuvem && nuvem.caminhoDaUrl(u); return c ? c.replace(/[\/\\]/g, '-') : null; };
const arquivoLocal = u => { const n = nomeLocal(u); return n ? path.join(dirNuvem(), n) : null; };
const localDe = u => { const f = arquivoLocal(u); return f && fs.existsSync(f) ? pathToFileURL(f).href : (u || null); };

function avisoDaLinha(r) {
  const est = r.estilo || {};
  return Object.assign({}, AVISO_NOVO, est, {
    id: r.id, titulo: r.titulo || '', texto: r.texto || '', inicio: r.inicio || '', fim: r.fim || '',
    rotativo: r.rotativo !== false, atualizadoEm: Date.parse(r.atualizado_em) || 0,
    fundoImgNuvem: est.fundoImg || null, fundoImg: est.fundoImg ? localDe(est.fundoImg) : null, nuvem: true
  });
}
function bannerDaLinha(r) {
  return { id: r.id, nome: nomeLocal(r.imagem_url) || r.id, url: localDe(r.imagem_url), titulo: r.titulo || '', descricao: r.descricao || '',
    inicio: r.inicio || '', fim: r.fim || '', rotativo: r.rotativo !== false, t: Date.parse(r.atualizado_em) || 0, nuvem: true };
}
function listarAvisos() {
  if (!modoNuvem()) return lerJSON(arq('avisos.json'), []);
  conexaoNuvem();
  return lerCache().avisos.map(avisoDaLinha);
}
function nuvemBanners() { conexaoNuvem(); return lerCache().banners.map(bannerDaLinha).sort((a, b) => b.t - a.t); }

async function sincronizarNuvem() {
  if (!modoNuvem()) return statusNuvem;
  const n = conexaoNuvem();
  try {
    const [avisos, banners] = await Promise.all([n.listar('avisos'), n.listar('banners')]);
    fs.mkdirSync(dirNuvem(), { recursive: true });
    const urls = new Set();
    avisos.forEach(a => a.estilo && a.estilo.fundoImg && urls.add(a.estilo.fundoImg));
    banners.forEach(b => b.imagem_url && urls.add(b.imagem_url));
    for (const u of urls) {                       // baixa as imagens novas
      const f = arquivoLocal(u);
      if (f && !fs.existsSync(f)) {
        const r = await fetch(u, { signal: AbortSignal.timeout(120000) });
        if (r.ok) fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
      }
    }
    const usados = new Set([...urls].map(nomeLocal).filter(Boolean));
    for (const f of fs.readdirSync(dirNuvem())) if (!usados.has(f)) fs.rmSync(path.join(dirNuvem(), f), { force: true });
    const antes = lerCache();
    gravarJSON(arq('nuvem-cache.json'), { avisos, banners, sincronizadoEm: Date.now() }, true);
    if (JSON.stringify(antes.avisos) !== JSON.stringify(avisos)) enviarOp('dados:mudou', 'avisos');
    if (JSON.stringify(antes.banners) !== JSON.stringify(banners)) enviarOp('dados:mudou', 'banners');
    statusNuvem = { ok: true, quando: Date.now(), erro: null };
  } catch (e) {
    const semInternet = /fetch failed|timeout|ENOTFOUND|ECONNREFUSED|aborted/i.test(String(e.message || e));
    statusNuvem = { ok: false, quando: lerCache().sincronizadoEm || null, erro: semInternet ? 'Sem internet: usando a última cópia salva neste computador' : e.message };
  }
  enviarOp('nuvem:status', statusNuvem);
  return statusNuvem;
}

function dataURLParaBuffer(dataURL) {
  const m = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/i.exec(dataURL || '');
  if (!m) throw new Error('Imagem inválida');
  return { dados: Buffer.from(m[2], 'base64'), ext: '.' + (m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase()) };
}
const TIPOS = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp' };
const caminhoNovo = (pastaNuvem, ext) => `${pastaNuvem}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}${(ext || '.jpg').toLowerCase()}`;

async function nuvemSalvarAviso(a, imagemDataURL) {
  const n = conexaoNuvem();
  const estilo = {};
  for (const k of ['fundoTipo', 'fundoTema', 'fundoCor', 'escurecer', 'corTitulo', 'corTexto', 'tamanho', 'posicao', 'destaque']) if (a[k] !== undefined) estilo[k] = a[k];
  if (imagemDataURL) {
    const b = dataURLParaBuffer(imagemDataURL);
    estilo.fundoImg = await n.enviarArquivo(caminhoNovo('avisos', b.ext), b.dados, TIPOS[b.ext]);
  } else if (a.fundoImg) {
    if (a.fundoImgNuvem && (a.fundoImg === a.fundoImgNuvem || a.fundoImg === localDe(a.fundoImgNuvem))) estilo.fundoImg = a.fundoImgNuvem;
    else if (String(a.fundoImg).startsWith('file:')) {
      const f = new URL(a.fundoImg); const local = require('url').fileURLToPath(f);
      estilo.fundoImg = await n.enviarArquivo(caminhoNovo('avisos', path.extname(local)), fs.readFileSync(local), TIPOS[path.extname(local).toLowerCase()] || 'image/jpeg');
    } else estilo.fundoImg = a.fundoImg;
  }
  const linha = { titulo: String(a.titulo || '').trim(), texto: String(a.texto || '').trim(), inicio: a.inicio || null, fim: a.fim || null,
    rotativo: a.rotativo !== false, estilo, atualizado_em: new Date().toISOString() };
  const existe = a.id && lerCache().avisos.some(r => r.id === a.id);
  const salvo = existe ? await n.atualizar('avisos', a.id, linha) : await n.inserir('avisos', linha);
  await sincronizarNuvem();
  return avisoDaLinha(salvo);
}
async function nuvemExcluirAviso(id) {
  const n = conexaoNuvem();
  const r = lerCache().avisos.find(x => x.id === id);
  await n.apagar('avisos', id);
  const c = r && r.estilo && n.caminhoDaUrl(r.estilo.fundoImg); if (c) await n.apagarArquivo(c);
  await sincronizarNuvem();
  return true;
}
async function nuvemNovoBanner(dados, ext, meta) {
  const n = conexaoNuvem();
  ext = (ext || '.jpg').toLowerCase();
  const url = await n.enviarArquivo(caminhoNovo('banners', ext), dados, TIPOS[ext] || 'image/jpeg');
  await n.inserir('banners', { titulo: meta.titulo || '', descricao: meta.descricao || '', inicio: meta.inicio || null, fim: meta.fim || null,
    rotativo: meta.rotativo !== false, imagem_url: url, atualizado_em: new Date().toISOString() });
  await sincronizarNuvem();
  return nomeLocal(url);
}
const linhaDoBanner = nome => lerCache().banners.find(b => nomeLocal(b.imagem_url) === nome || b.id === nome);
async function nuvemMetaBanner(nome, meta) {
  conexaoNuvem(); const r = linhaDoBanner(nome);
  if (!r) throw new Error('Banner não encontrado na nuvem');
  await nuvem.atualizar('banners', r.id, { titulo: meta.titulo || '', descricao: meta.descricao || '', inicio: meta.inicio || null, fim: meta.fim || null,
    rotativo: meta.rotativo !== false, atualizado_em: new Date().toISOString() });
  await sincronizarNuvem();
  return true;
}
async function nuvemExcluirBanner(nome) {
  conexaoNuvem(); const r = linhaDoBanner(nome);
  if (!r) return true;
  await nuvem.apagar('banners', r.id);
  const c = nuvem.caminhoDaUrl(r.imagem_url); if (c) await nuvem.apagarArquivo(c);
  await sincronizarNuvem();
  return true;
}

// Configuração da nuvem (janela "Mídia online" no computador)
ipcMain.handle('nuvem:obter', () => {
  const n = lerConfig().nuvem || {};
  return { url: n.url || '', chave: n.chave || '', email: n.email || '', ativo: !!n.ativo, status: statusNuvem };
});
ipcMain.handle('nuvem:conectar', async (e, d) => {
  const teste = new Nuvem({ url: d.url, chave: d.chave, email: d.email, senha: d.senha });
  try {
    if (!/^https:\/\/.+/i.test(String(d.url || '').trim()) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(String(d.url || '').trim())) throw new Error('O endereço deve começar com https://');
    await teste.entrar();
    await teste.listar('avisos'); await teste.listar('banners');
  } catch (err) {
    const m = String(err.message || err);
    return { ok: false, erro: /404|relation|does not exist|schema cache/i.test(m) ? 'Conectou, mas as tabelas não existem. Rode o arquivo nuvem/instalar.sql no Supabase.' : m };
  }
  const c = lerConfig();
  c.nuvem = { url: d.url.trim().replace(/\/+$/, ''), chave: d.chave.trim(), email: d.email.trim(), senha: cifrar(d.senha), ativo: true };
  gravarConfig(c); nuvem = null;
  const st = await sincronizarNuvem();
  enviarOp('dados:mudou', 'avisos'); enviarOp('dados:mudou', 'banners');
  return Object.assign({ ok: true }, st);
});
ipcMain.handle('nuvem:desligar', () => {
  const c = lerConfig(); if (c.nuvem) c.nuvem.ativo = false; gravarConfig(c);
  enviarOp('dados:mudou', 'avisos'); enviarOp('dados:mudou', 'banners');
  return true;
});
ipcMain.handle('nuvem:sincronizar', () => sincronizarNuvem());
// Envia para a nuvem os avisos e banners que já existiam neste computador
ipcMain.handle('nuvem:enviarLocais', async () => {
  if (!modoNuvem()) return { ok: false, erro: 'Ligue a nuvem primeiro' };
  let avisos = 0, banners = 0;
  try {
    for (const a of lerJSON(arq('avisos.json'), [])) { const c = Object.assign({}, a); delete c.id; await nuvemSalvarAviso(c); avisos++; }
    const meta = lerMetaBanners(), dir = (() => { const p = lerConfig().pastaBanners; return p && fs.existsSync(p) ? p : path.join(pasta(), 'imagens', 'banners'); })();
    for (const nome of fs.readdirSync(dir).filter(ehImagem)) {
      await nuvemNovoBanner(fs.readFileSync(path.join(dir, nome)), path.extname(nome), Object.assign({ titulo: nome.replace(/\.[^.]+$/, '') }, meta[nome] || {}));
      banners++;
    }
    return { ok: true, avisos, banners };
  } catch (e) { return { ok: false, erro: e.message, avisos, banners }; }
});

const MIME = { '.js': 'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp' };

function iniciarServidor(porta = 4210, tentativas = 5) {
  const bloqueio = new Map();     // ip -> { erros, ate }
  const json = (res, cod, obj) => { res.writeHead(cod, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  const arquivo = (res, f) => {
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'max-age=300' });
    fs.createReadStream(f).pipe(res);
  };
  const corpo = req => new Promise((ok, erro) => {
    let t = 0; const partes = [];
    req.on('data', d => { t += d.length; if (t > 25e6) { erro(new Error('Arquivo grande demais')); req.destroy(); } else partes.push(d); });
    req.on('end', () => { try { ok(partes.length ? JSON.parse(Buffer.concat(partes).toString('utf8')) : {}); } catch (e) { erro(e); } });
  });
  const perfilDoPin = pin => Object.entries(acessos()).find(([, v]) => v && v === String(pin || ''))?.[0] || null;

  const srv = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://x');
      const r = u.pathname;
      // páginas e arquivos públicos
      if (r === '/' || r === '/index.html') return arquivo(res, path.join(__dirname, 'src', 'movel.html'));
      if (r === '/manifest.json') return json(res, 200, { name: 'Projeção Assembleia', short_name: 'Projeção Assembleia', start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait', background_color: '#F4F1EA', theme_color: '#1B4D3A', icons: [{ src: '/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: '/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: '/icone-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] });
      if (/^\/(icone(-192|-512|-maskable-512)?|apple-touch-icon)\.png$/.test(r)) return arquivo(res, path.join(__dirname, 'assets', r.slice(1)));
      if (r === '/logo.png') return arquivo(res, path.join(__dirname, 'assets', 'logo.png'));
      if (r === '/fundo.js') { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }); return res.end(fs.readFileSync(path.join(__dirname, 'src', 'fundo.js'))); }

      // PIN é opcional (desligado por padrão): sem PIN, o celular só informa a versão escolhida
      const exigirPin = !!lerConfig().exigirPin;
      if (r === '/api/inicio') return json(res, 200, { exigirPin });
      const ip = req.socket.remoteAddress;
      const b = bloqueio.get(ip);
      if (exigirPin && b && b.ate > Date.now()) return json(res, 429, { erro: 'Muitas tentativas. Aguarde 1 minuto.' });
      const pedido = String(req.headers['x-perfil'] || u.searchParams.get('perfil') || '');
      const perfil = exigirPin ? perfilDoPin(req.headers['x-pin'] || u.searchParams.get('pin'))
        : (PERFIS.includes(pedido) ? pedido : null);
      if (!perfil && !exigirPin) return json(res, 403, { erro: 'Escolha a versão do app', escolher: true });
      if (!perfil) {
        const n = (b ? b.erros : 0) + 1;
        bloqueio.set(ip, { erros: n, ate: n >= 8 ? Date.now() + 60000 : 0 });
        return json(res, 403, { erro: 'PIN incorreto' });
      }
      bloqueio.delete(ip);
      const pode = chave => PODE[chave].includes(perfil);
      const proibido = () => json(res, 403, { erro: 'Este perfil não tem acesso a esta parte' });

      if (r === '/api/entrar') return json(res, 200, { perfil, exigirPin });

      // imagens (com ?pin=)
      if (r.startsWith('/img/')) {
        const f = path.resolve(pasta(), decodeURIComponent(r.slice(5)));
        if (!f.startsWith(path.resolve(pasta()) + path.sep)) { res.writeHead(403); return res.end(); }
        return arquivo(res, f);
      }
      if (r.startsWith('/banner/')) return arquivo(res, path.join(dirImagens('banners'), path.basename(decodeURIComponent(r.slice(8)))));

      // controle de slides
      if (r === '/api/estado') return pode('estado') ? json(res, 200, remoto) : proibido();
      if (r === '/api/cmd' && req.method === 'POST') {
        if (!pode('cmd')) return proibido();
        const cmd = await corpo(req);
        enviarOp('remoto:cmd', { acao: String(cmd.acao), i: +cmd.i || 0 });
        res.writeHead(204); return res.end();
      }

      // recepção: visitantes de hoje (só aparecem no dia em que foram registrados)
      if (r === '/api/membros/nomes') {
        if (!pode('visitantes')) return proibido();
        return json(res, 200, lerJSON(arq('membros.json'), []).map(m => m.nome).sort((a, b) => a.localeCompare(b, 'pt-BR')));
      }
      if (r === '/api/visitantes') {
        if (!pode('visitantes')) return proibido();
        const lista = lerJSON(arq('visitantes.json'), []);
        const campos = v => {
          const t = (x, n = 120) => String(x || '').trim().slice(0, n);
          const tipo = v.tipo === 'igreja' ? 'igreja' : 'convidado';
          return { nome: t(v.nome) || 'Visitante', qtd: Math.min(99, Math.max(1, parseInt(v.qtd, 10) || 1)), tipo,
            quem: tipo === 'convidado' ? t(v.quem) : '', igreja: tipo === 'igreja' ? t(v.igreja) : '',
            origem: tipo === 'igreja' ? t(v.igreja) : '', primeira: !!v.primeira };
        };
        if (req.method === 'GET') return json(res, 200, IG.visitantesDoDia(lista));
        if (req.method === 'POST') {
          const agora = new Date();
          const reg = Object.assign({ id: crypto.randomUUID() }, campos(await corpo(req)), { data: hojeISO(), hora: agora.toTimeString().slice(0, 5), via: 'recepção' });
          lista.push(reg); gravarJSON(arq('visitantes.json'), lista); enviarOp('dados:mudou', 'visitantes');
          return json(res, 200, reg);
        }
        if (req.method === 'PUT') {
          const v = await corpo(req);
          const i = lista.findIndex(x => x.id === v.id && x.data === hojeISO());
          if (i < 0) return json(res, 404, { erro: 'Visitante não encontrado (só dá para editar os de hoje)' });
          lista[i] = Object.assign({}, lista[i], campos(v));
          gravarJSON(arq('visitantes.json'), lista); enviarOp('dados:mudou', 'visitantes');
          return json(res, 200, lista[i]);
        }
        if (req.method === 'DELETE') {
          const id = u.searchParams.get('id');
          gravarJSON(arq('visitantes.json'), lista.filter(x => !(x.id === id && x.data === hojeISO())));
          enviarOp('dados:mudou', 'visitantes'); res.writeHead(204); return res.end();
        }
      }

      // leitura: tudo o que deve ser anunciado
      if (r === '/api/leitura') {
        if (!pode('leitura')) return proibido();
        const membros = lerJSON(arq('membros.json'), []);
        return json(res, 200, {
          avisos: listarAvisos().filter(dentroDoPeriodo)
            .map(a => ({ tipo: 'Aviso', titulo: a.titulo, texto: a.texto, inicio: a.inicio, fim: a.fim, telao: a.rotativo !== false })),
          banners: listarBanners().filter(dentroDoPeriodo)
            .map(x => ({ tipo: 'Banner', titulo: x.titulo || x.nome.replace(/\.[^.]+$/, ''), descricao: x.descricao, inicio: x.inicio, fim: x.fim, telao: x.rotativo !== false })),
          aniversariantes: IG.aniversariantesDaSemana(membros)
            .map(x => ({ nome: x.m.nome, rotulo: IG.rotuloData(x), hoje: x.diff === 0, casal: !!x.m.casal, foto: paraWeb(x.m.foto) })),
          visitantes: IG.visitantesDoDia(lerJSON(arq('visitantes.json'), [])).map(v => ({ nome: IG.nomeVisitante(v), qtd: IG.pessoas(v), desc: IG.descVisitante(v), primeira: !!v.primeira }))
        });
      }

      // mídia: avisos e banners
      if (r === '/api/midia') {
        if (!pode('midia')) return proibido();
        return json(res, 200, {
          avisos: listarAvisos().sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0))
            .map(a => Object.assign({}, a, { imgWeb: a.fundoTipo === 'img' ? paraWeb(a.fundoImg) : null })),
          banners: listarBanners().map(x => Object.assign({}, x, { url: undefined, imgWeb: paraWeb(x.url) }))
        });
      }
      if (r === '/api/avisos') {
        if (!pode('midia')) return proibido();
        if (modoNuvem()) {
          if (req.method === 'POST') {
            const a = await corpo(req);
            if (!String(a.titulo || '').trim()) return json(res, 400, { erro: 'Informe o título' });
            const antigo = listarAvisos().find(x => x.id === a.id);
            const reg = Object.assign({}, AVISO_NOVO, antigo || {}, { titulo: String(a.titulo).trim(), texto: String(a.texto || '').trim(),
              inicio: a.inicio || '', fim: a.fim || '', rotativo: a.rotativo !== false });
            if (a.fundoTema != null && a.fundoTipo === 'tema') Object.assign(reg, { fundoTipo: 'tema', fundoTema: +a.fundoTema });
            if (a.imagem) Object.assign(reg, { fundoTipo: 'img', corTitulo: '#ffffff', corTexto: '#ffffff', escurecer: reg.escurecer || 35 });
            return json(res, 200, await nuvemSalvarAviso(reg, a.imagem));
          }
          if (req.method === 'DELETE') { await nuvemExcluirAviso(u.searchParams.get('id')); res.writeHead(204); return res.end(); }
        }
        const lista = lerJSON(arq('avisos.json'), []);
        if (req.method === 'POST') {
          const a = await corpo(req);
          if (!String(a.titulo || '').trim()) return json(res, 400, { erro: 'Informe o título' });
          const antigo = lista.find(x => x.id === a.id);
          const reg = Object.assign({}, AVISO_NOVO, antigo || {}, {
            id: antigo ? antigo.id : crypto.randomUUID(), titulo: String(a.titulo).trim(), texto: String(a.texto || '').trim(),
            inicio: a.inicio || '', fim: a.fim || '', rotativo: a.rotativo !== false, atualizadoEm: Date.now()
          });
          if (a.fundoTema != null && a.fundoTipo === 'tema') Object.assign(reg, { fundoTipo: 'tema', fundoTema: +a.fundoTema });
          if (a.imagem) {
            const nome = salvarDataURL(a.imagem, path.join(pasta(), 'imagens', 'avisos'), 'aviso-' + Date.now());
            Object.assign(reg, { fundoTipo: 'img', fundoImg: pathToFileURL(path.join(pasta(), 'imagens', 'avisos', nome)).href,
              corTitulo: '#ffffff', corTexto: '#ffffff', escurecer: reg.escurecer || 35 });
          }
          const i = lista.findIndex(x => x.id === reg.id);
          if (i >= 0) lista[i] = reg; else lista.push(reg);
          gravarJSON(arq('avisos.json'), lista); enviarOp('dados:mudou', 'avisos');
          return json(res, 200, reg);
        }
        if (req.method === 'DELETE') {
          gravarJSON(arq('avisos.json'), lista.filter(x => x.id !== u.searchParams.get('id')));
          enviarOp('dados:mudou', 'avisos'); res.writeHead(204); return res.end();
        }
      }
      if (r === '/api/banners') {
        if (!pode('midia')) return proibido();
        const meta = lerMetaBanners();
        const limpar = m => ({ titulo: String(m.titulo || '').trim(), descricao: String(m.descricao || '').trim(), inicio: m.inicio || '', fim: m.fim || '', rotativo: m.rotativo !== false });
        if (modoNuvem()) {
          if (req.method === 'POST') { const d = await corpo(req); const b = dataURLParaBuffer(d.imagem); return json(res, 200, { nome: await nuvemNovoBanner(b.dados, b.ext, limpar(d)) }); }
          if (req.method === 'PUT') { const d = await corpo(req); await nuvemMetaBanner(path.basename(String(d.nome || '')), limpar(d)); return json(res, 200, { nome: d.nome }); }
          if (req.method === 'DELETE') { await nuvemExcluirBanner(path.basename(u.searchParams.get('nome') || '')); res.writeHead(204); return res.end(); }
        }
        if (req.method === 'POST') {             // novo banner (imagem enviada pelo celular)
          const d = await corpo(req);
          const nome = salvarDataURL(d.imagem, dirImagens('banners'), d.titulo || d.nomeArquivo || 'banner');
          meta[nome] = limpar(d); gravarJSON(arq('banners.json'), meta); enviarOp('dados:mudou', 'banners');
          return json(res, 200, { nome });
        }
        if (req.method === 'PUT') {
          const d = await corpo(req); const nome = path.basename(String(d.nome || ''));
          if (!fs.existsSync(path.join(dirImagens('banners'), nome))) return json(res, 404, { erro: 'Banner não encontrado' });
          meta[nome] = limpar(d); gravarJSON(arq('banners.json'), meta); enviarOp('dados:mudou', 'banners');
          return json(res, 200, { nome });
        }
        if (req.method === 'DELETE') {
          const nome = path.basename(u.searchParams.get('nome') || '');
          const f = path.join(dirImagens('banners'), nome);
          if (nome && fs.existsSync(f)) fs.unlinkSync(f);
          delete meta[nome]; gravarJSON(arq('banners.json'), meta); enviarOp('dados:mudou', 'banners');
          res.writeHead(204); return res.end();
        }
      }
      json(res, 404, { erro: 'Não encontrado' });
    } catch (e) {
      const semNet = /fetch failed|timeout|ENOTFOUND|ECONNREFUSED/i.test(String(e.message));
      try { json(res, 500, { erro: semNet ? 'Sem internet: não foi possível salvar na mídia online' : e.message }); } catch { /* resposta já enviada */ }
    }
  });
  srv.on('error', () => { if (tentativas > 0) iniciarServidor(porta + 1, tentativas - 1); });
  srv.listen(porta, '0.0.0.0', () => {
    infoRede = { urls: ipsLocais().map(ip => `http://${ip}:${porta}`), porta };
    acessos();
    enviarOp('remoto:info', { urls: infoRede.urls, pin: acessos().controle });
  });
}
function ipsLocais() {
  return Object.values(os.networkInterfaces()).flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
}

// ---------- Início ----------
app.setName('Projeção Assembleia');
if (process.platform === 'win32') app.setAppUserModelId('br.org.assembleia.projecao');
app.whenReady().then(() => {
  garantirPastas();
  backupAutomatico();
  criarOperador();
  opWin.webContents.once('did-finish-load', () => {
    if (screen.getAllDisplays().length > 1) abrirProjetor(); else avisarStatus();
    enviarOp('remoto:info', { urls: infoRede.urls, pin: acessos().controle });
  });
  observarBanners();
  iniciarServidor();
  // mídia online: sincroniza ao abrir e a cada minuto
  setTimeout(sincronizarNuvem, 1500);
  setInterval(sincronizarNuvem, 60 * 1000);
  screen.on('display-added', avisarStatus);
  screen.on('display-removed', avisarStatus);
});
app.on('window-all-closed', () => app.quit());
