const $ = id => document.getElementById(id);
// window.api vem do preload.js (já existe como variável global "api")
const T = window.Texto;
const B = window.Biblia;
const IG = window.Igreja;

let musicas = [];
let avisos = [];
let banners = [];
let fundos = [];
let biblias = [];
let biblia = null;          // { id, nome, livros }
let culto = { lista: [], anotacoes: '' };
let membros = [];
let visitantes = [];
let config = {};

let atual = null;           // item aberto no centro: { tipo, ref, titulo, sub, slides }
let sel = -1;               // slide selecionado no centro
let vivo = { chave: null, i: -1 };   // slide que está no telão
let estado = { modo: 'limpo', texto: '', ref: '', img: '', cartaz: null, painel: null, faixa: '' };
let modoAntesPreto = 'limpo';
let telaoAberto = false;

// ---------------- utilidades ----------------
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2600);
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ico = id => `<svg><use href="#${id}"/></svg>`;
const chaveItem = it => it ? it.tipo + ':' + it.ref : null;
const avatar = (p, extra = '') => p.foto
  ? `<span class="avatar foto ${extra}" style="background-image:url('${String(p.foto).replace(/'/g, '%27')}')"></span>`
  : `<span class="avatar ${extra}">${esc(IG.iniciais(p.nome))}</span>`;

function abas(navId) {
  const nav = $(navId), col = nav.parentElement;
  nav.addEventListener('click', e => {
    const b = e.target.closest('button[data-aba]'); if (!b) return;
    nav.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    col.querySelectorAll(':scope > .aba').forEach(a => a.classList.toggle('on', a.dataset.aba === b.dataset.aba));
  });
}
abas('abasEsq'); abas('abasDir');
const irParaAba = nome => document.querySelector(`#abasEsq button[data-aba="${nome}"]`).click();

// ---------------- telão ----------------
function enviar() {
  const s = Object.assign({}, estado, { config });
  // projetou algo (ou mostrou a faixa) com o telão fechado: abre o telão sozinho
  if (!telaoAberto && (!['limpo', 'preto'].includes(estado.modo) || estado.faixa)) { telaoAberto = true; api.abrirTelao(); }
  api.enviarEstado(s);
  renderPreview(s);
  $('btnPreto').classList.toggle('ativo', estado.modo === 'preto');
  $('btnAvisoOcultar').disabled = !estado.faixa;
  enviarRemoto();
  atualizarRodape();
}

function renderPreview(s) {
  const pv = $('preview'), c = s.config;
  const q = cl => pv.querySelector(cl);
  aplicarFundo(q('.pv-fundo'), c);
  q('.pv-fundo').style.opacity = s.modo === 'preto' || (s.modo === 'limpo' && !telaoAberto && !s.faixa) ? 0 : 1;
  const txt = q('.pv-texto'), ref = q('.pv-ref');
  const temRef = s.modo === 'texto' && s.ref;
  // o texto fica num <span> próprio: é ele que é medido para caber (o quadro tem sempre a altura toda)
  txt.innerHTML = '<span class="pv-t"></span>';
  const span = txt.firstElementChild; span.textContent = s.modo === 'texto' ? s.texto : '';
  txt.style.color = ref.style.color = c.corTexto;
  txt.style.textShadow = ref.style.textShadow = sombraTexto(c.corTexto);
  txt.style.textTransform = c.maiusculas ? 'uppercase' : 'none';
  txt.style.paddingBottom = temRef ? '9%' : '0';
  ref.textContent = temRef ? s.ref : '';
  ref.style.display = temRef ? 'block' : 'none';
  ajustarFonte(span, pv, Math.round(c.fonte * pv.clientWidth / 1920), temRef ? 0.72 : 0.88);
  q('.pv-logo').style.display = s.modo === 'logo' ? 'flex' : 'none';
  q('.pv-logo').innerHTML = `<img src="${esc(c.logoImg || LOGO_PADRAO)}">`;
  q('.pv-img').style.display = s.modo === 'imagem' ? 'block' : 'none';
  q('.pv-img').style.backgroundImage = s.modo === 'imagem' ? `url("${s.img}")` : 'none';
  q('.pv-cartaz').style.display = s.modo === 'cartaz' ? 'block' : 'none';
  q('.pv-cartaz').innerHTML = s.modo === 'cartaz' ? htmlAviso(s.cartaz) : '';
  q('.pv-painel').style.display = s.modo === 'painel' ? 'block' : 'none';
  q('.pv-painel').innerHTML = s.modo === 'painel' ? htmlPainel(s.painel, c.logoImg, s.aSeguir ? { nome: s.aSeguir.nome, segundos: s.aSeguir.trocaEm ? Math.max(0, Math.round((s.aSeguir.trocaEm - Date.now()) / 1000)) : null } : null) : '';
  q('.pv-aviso').textContent = s.faixa || '';
  q('.pv-aviso').style.display = s.faixa ? 'block' : 'none';
}

function aplicarSlide(s) {
  Object.assign(estado, { texto: '', ref: '', img: '', cartaz: null, painel: null, aSeguir: null });
  if (s.tipo === 'imagem') { estado.modo = 'imagem'; estado.img = s.src; }
  else if (s.tipo === 'cartaz') { estado.modo = 'cartaz'; estado.cartaz = s.aviso; }
  else if (s.tipo === 'painel') { estado.modo = 'painel'; estado.painel = s.painel; }
  else { estado.modo = 'texto'; estado.texto = s.texto; estado.ref = s.ref || ''; }
}
function projetar(i) {
  if (!atual || i < 0 || i >= atual.slides.length) return;
  if (rot.ativo) pararRotativo(true);
  sel = i;
  vivo = { chave: chaveItem(atual), i };
  aplicarSlide(atual.slides[i]);
  enviar();
  marcarSlides(true);
  // Bíblia: o campo de referência e a grade de capítulos/versículos acompanham o versículo no telão
  if (atual.tipo === 'biblia' && atual.li != null && document.activeElement !== $('buscaRef')) {
    Object.assign(REF, { fase: 'v1', txt: '', li: atual.li, cap: String(atual.cap), v1: String(atual.slides[i].v || ''), v2: '' });
    navLivro = atual.li; $('buscaRef').value = refTexto(); refMostrarDica(); renderNavBiblia();
  }
}
// Sair (Esc): tira tudo do telão e fecha a janela do telão (aparece a área de trabalho do computador)
function limpar() {
  // 2º Esc (já não tem nada no telão): limpa também o texto aberto no centro (letra, hino ou Bíblia)
  const jaSaiu = !rot.ativo && !telaoAberto && estado.modo === 'limpo' && !estado.faixa;
  if (jaSaiu) {
    if (atual || REF.li != null) { abrir(null); refZerar(); navLivro = null; renderNavBiblia(); toast('Tela limpa'); }
    return;
  }
  if (rot.ativo) pararRotativo(true);
  Object.assign(estado, { modo: 'limpo', texto: '', ref: '', img: '', cartaz: null, painel: null, faixa: '' });
  vivo = { chave: null, i: -1 }; marcarSlides(); enviar();
  if (telaoAberto) { telaoAberto = false; api.fecharTelao(); }
}
function alternarPreto() {
  if (estado.modo === 'preto') estado.modo = modoAntesPreto;
  else { modoAntesPreto = estado.modo; estado.modo = 'preto'; }
  enviar();
}

// ---------------- centro (slides) ----------------
function htmlSlide(s) {
  if (s.tipo === 'imagem') return `<img src="${esc(s.src)}" alt="">`;
  if (s.tipo === 'cartaz') return `<div class="aviso-grande">${htmlAviso(s.aviso)}</div>`;
  if (s.v) return `<span class="vnum">${s.v}</span>${esc(s.texto)}`;
  return esc(s.texto);
}
function abrir(item, selecionar) {
  atual = item || null;
  sel = -1;
  if (atual && vivo.chave === chaveItem(atual)) sel = vivo.i;
  if (selecionar != null) sel = selecionar;
  $('tituloCentro').textContent = atual ? atual.titulo : 'Nada selecionado';
  $('subCentro').textContent = atual ? [atual.sub, `${atual.slides.length} slide(s)`].filter(Boolean).join(' · ') : '';
  const box = $('slides');
  if (!atual) box.innerHTML = '<p class="vazio">Escolha uma letra, hino, versículo, aviso ou imagem à esquerda.<br>Clique num slide para projetar · setas ↑ ↓ ou passador de slides navegam.</p>';
  else if (!atual.slides.length) box.innerHTML = '<p class="vazio">Sem conteúdo para projetar.</p>';
  else box.innerHTML = atual.slides.map((s, i) =>
    `<div class="slide" data-i="${i}"><span class="num">${i + 1}</span>${htmlSlide(s)}</div>`).join('');
  box.scrollTop = 0;
  marcarSlides(true);
  atualizarFerramentas();
  renderListas();
  enviarRemoto();
  atualizarRodape();
}
function marcarSlides(rolar) {
  const ehVivo = atual && vivo.chave === chaveItem(atual);
  document.querySelectorAll('#slides .slide').forEach((el, j) => {
    el.classList.toggle('sel', j === sel);
    el.classList.toggle('ao-vivo', ehVivo && j === vivo.i);
  });
  if (rolar) {
    const el = document.querySelector('#slides .slide.ao-vivo') || document.querySelector('#slides .slide.sel');
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
function atualizarFerramentas() {
  const tem = !!(atual && atual.slides.length);
  const t = atual && atual.tipo;
  $('tbProjetar').disabled = $('tbProximo').disabled = !tem;
  $('tbAddLista').disabled = !atual;
  $('tbEditar').disabled = !(t === 'musica' || t === 'aviso' || t === 'imagem');
  $('tbDuplicar').disabled = t !== 'aviso';
  $('tbDuplicar').style.display = t === 'aviso' ? '' : 'none';
  $('tbExcluir').disabled = !(t === 'musica' || t === 'imagem' || t === 'aviso');
}
$('slides').addEventListener('click', e => { const s = e.target.closest('.slide'); if (s) projetar(+s.dataset.i); });
$('tbProjetar').onclick = () => projetar(sel >= 0 ? sel : 0);
$('tbProximo').onclick = proximo;
$('tbAddLista').onclick = () => adicionarAoCulto(atual);
$('tbEditar').onclick = () => {
  if (!atual) return;
  if (atual.tipo === 'musica') abrirEditor(musicas.find(m => m.id === atual.ref));
  if (atual.tipo === 'aviso') abrirEditorAviso(avisos.find(a => a.id === atual.ref));
  if (atual.tipo === 'imagem') abrirBanner(banners.find(b => b.nome === atual.ref));
};
$('tbDuplicar').onclick = async () => {
  const a = avisos.find(x => x.id === atual.ref); if (!a) return;
  const novo = await api.salvarAviso(Object.assign({}, a, { id: null, titulo: a.titulo + ' (cópia)' }));
  await carregarAvisos(); abrir(itemAviso(novo)); abrirEditorAviso(novo);
};
$('tbExcluir').onclick = async () => {
  if (!atual) return;
  if (atual.tipo === 'musica') {
    if (!confirm(`Excluir "${atual.titulo}"?`)) return;
    await api.excluir(atual.ref); abrir(null); await carregarMusicas(); toast('Excluído');
  } else if (atual.tipo === 'imagem') {
    if (!confirm('Excluir esta imagem do computador?')) return;
    await api.excluirImagem('banners', atual.ref); abrir(null); await carregarImagens(); toast('Imagem excluída');
  } else if (atual.tipo === 'aviso') {
    if (!confirm(`Excluir o aviso "${atual.titulo}"?`)) return;
    await api.excluirAviso(atual.ref); abrir(null); await carregarAvisos(); toast('Aviso excluído');
  }
};
function proximo() {
  if (rot.ativo) { rotPasso(1); return; }
  if (!atual || !atual.slides.length) return;
  const base = vivo.chave === chaveItem(atual) ? vivo.i : sel;
  if (base >= atual.slides.length - 1 && atual.tipo === 'biblia' && bibliaVizinho(1)) return;   // último versículo: vai para o próximo
  projetar(Math.min(base + 1, atual.slides.length - 1));
}
function anterior() {
  if (rot.ativo) { rotPasso(-1); return; }
  if (!atual) return;
  const base = vivo.chave === chaveItem(atual) ? vivo.i : sel;
  if (base <= 0 && atual.tipo === 'biblia' && bibliaVizinho(-1)) return;   // primeiro versículo: volta para o anterior
  if (base > 0) projetar(base - 1);
}
// Bíblia: passar do último versículo vai para o 1º do próximo capítulo (e volta para o último do anterior).
// Num trecho (Jo 3:16-18) continua no versículo seguinte do mesmo capítulo.
function bibliaVizinho(dir) {
  if (!biblia || atual.li == null || !atual.cap) return false;
  const li = atual.li, cap = atual.cap, completo = itemCapitulo(li, cap);
  if (!completo) return false;
  const vAtual = atual.slides[dir > 0 ? atual.slides.length - 1 : 0].v;
  const j = completo.slides.findIndex(s => s.v === vAtual + dir);
  if (j >= 0 && completo.slides.length !== atual.slides.length) { abrir(completo, j); projetar(j); return true; }
  // capítulo vizinho (passando de um livro para o outro se precisar)
  let l = li, c = cap + dir;
  while (l >= 0 && l < 66) {
    const n = (biblia.livros[l] || []).length;
    if (c >= 1 && c <= n) break;
    l += dir; c = dir > 0 ? 1 : (biblia.livros[l] || []).length;
  }
  if (l < 0 || l >= 66) return false;
  const item = itemCapitulo(l, c); if (!item || !item.slides.length) return false;
  const k = dir > 0 ? 0 : item.slides.length - 1;
  abrir(item, k); projetar(k);
  toast(`${item.titulo}`);
  return true;
}

// construtores de itens
function itemMusica(m) {
  const titulo = m.hinario && m.numero ? `${m.numero} · ${m.titulo}` : m.titulo;
  const sub = m.hinario ? m.hinario : m.artista;
  return { tipo: 'musica', ref: m.id, titulo, sub, slides: T.gerarSlides(m.letra).map(t => ({ tipo: 'texto', texto: t })) };
}
function itemAviso(a) {
  return { tipo: 'aviso', ref: a.id, titulo: (a.titulo || 'Aviso').replace(/\n/g, ' '), sub: 'Aviso', slides: [{ tipo: 'cartaz', aviso: a }] };
}
function itemImagem(b) {
  return { tipo: 'imagem', ref: b.nome, titulo: b.titulo || b.nome.replace(/\.[^.]+$/, ''), sub: b.descricao || 'Imagem', slides: [{ tipo: 'imagem', src: b.url }] };
}
function itemTexto(txt) {
  const slides = T.gerarSlides(txt).map(t => ({ tipo: 'texto', texto: t }));
  return { tipo: 'texto', ref: txt, titulo: slides[0] ? slides[0].texto.split('\n')[0] : 'Texto', sub: 'Texto livre', slides };
}
function itemCapitulo(li, cap) {
  if (!biblia) return null;
  const versos = (biblia.livros[li] || [])[cap - 1] || [];
  const livro = B.LIVROS[li];
  const slides = [];
  versos.forEach((t, k) => { if (t) slides.push({ tipo: 'texto', texto: t, ref: `${livro.nome} ${cap}:${k + 1}`, v: k + 1 }); });
  return { tipo: 'biblia', ref: `${li}|${cap}`, titulo: `${livro.nome} ${cap}`, sub: biblia.nome, slides, li, cap };
}

// ---------------- letras (músicas comuns) ----------------
async function carregarMusicas() {
  musicas = await api.listar();
  renderLetras(); renderHinos();
  if (atual && atual.tipo === 'musica') {
    const m = musicas.find(x => x.id === atual.ref);
    abrir(m ? itemMusica(m) : null);
  }
}
const ehHino = m => !!(m.hinario && m.hinario.trim());
function destacar(texto, campo) {
  const q = T.normalizarBusca($(campo).value.trim());
  const i = q ? T.normalizarBusca(texto).indexOf(q) : -1;
  if (i < 0) return esc(texto);
  return esc(texto.slice(0, i)) + '<mark>' + esc(texto.slice(i, i + q.length)) + '</mark>' + esc(texto.slice(i + q.length));
}
function buscarEm(lista, q) {
  q = T.normalizarBusca(q.trim());
  if (!q) return lista.map(m => ({ m }));
  const out = [];
  for (const m of lista) {
    if (T.normalizarBusca(m.titulo + ' ' + (m.artista || '')).includes(q)) { out.push({ m, t: 1 }); continue; }
    const linha = m.letra.split('\n').find(l => T.normalizarBusca(l).includes(q));
    if (linha) out.push({ m, trecho: linha.trim() });
  }
  return out.sort((a, b) => (b.t || 0) - (a.t || 0));
}
function renderLetras() {
  const base = musicas.filter(m => !ehHino(m)).sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
  const r = buscarEm(base, $('busca').value);
  $('contagem').textContent = $('busca').value.trim() ? `${r.length} resultado(s)` : `${base.length} música(s)`;
  const k = chaveItem(atual);
  $('lista').innerHTML = !base.length ? '<li class="vazio-lista">Nenhuma letra ainda.<br>Use “Importar .txt” ou “+ Nova”.</li>'
    : r.slice(0, 500).map(({ m, trecho }) =>
      `<li data-id="${m.id}" class="${k === 'musica:' + m.id ? 'sel' : ''}"><div class="txt"><b>${destacar(m.titulo, 'busca')}</b>` +
      (trecho ? `<span class="s">…${destacar(trecho, 'busca')}</span>` : m.artista ? `<span class="s">${esc(m.artista)}</span>` : '') + `</div><button class="lapis" title="Editar">${ico('i-edit')}</button></li>`).join('')
      || '<li class="vazio-lista">Nada encontrado.</li>';
}
function cliqueMusica(e) {
  const li = e.target.closest('li[data-id]'); if (!li) return;
  const m = musicas.find(x => x.id === li.dataset.id);
  abrir(itemMusica(m));
  if (e.target.closest('.lapis')) abrirEditor(m);
}
$('lista').addEventListener('click', cliqueMusica);
$('lista').addEventListener('dblclick', e => { if (e.target.closest('li[data-id]')) projetar(0); });
$('busca').addEventListener('input', renderLetras);
$('busca').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const li = $('lista').querySelector('li[data-id]'); if (li) { li.click(); $('busca').blur(); }
});
$('btnImportar').onclick = async () => {
  const r = await api.importar({ corrigir: $('corrigirImportar').checked });
  if (!r.importadas && !r.duplicadas) return;
  await carregarMusicas();
  toast(`${r.importadas} letra(s) importada(s)` + (r.duplicadas ? ` · ${r.duplicadas} já existiam` : ''));
};

// ---------------- pesquisar letras na internet (estilo Holyrics) ----------------
let inResultados = [], inSel = null, inLetra = null, inBuscaN = 0;
function abrirInternet() {
  $('dlgInternet').showModal();
  if ($('busca').value.trim() && !$('inBusca').value) $('inBusca').value = $('busca').value.trim();
  $('inBusca').focus(); $('inBusca').select();
  api.temChaveVagalume().then(t => { $('inChave').textContent = t ? 'Vagalume ligado ✔' : 'Ligar Vagalume (mais letras gospel)'; });
}
$('btnInternet').onclick = abrirInternet;
$('inFechar').onclick = $('inCancelar').onclick = () => $('dlgInternet').close();
$('formInternet').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('inBusca').value.trim(); if (q.length < 2) return;
  const n = ++inBuscaN;
  inSel = null; inLetra = null; $('inCriar').disabled = true;
  $('inLista').innerHTML = '<li class="vazio-lista">Pesquisando…</li>'; $('inPrevia').textContent = '';
  let r;
  try { r = await api.buscarInternet(q, { titulo: $('inTitulo').checked, artista: $('inArtista').checked, letras: $('inLetras').checked }); }
  catch (err) { r = { resultados: [], avisos: ['Sem conexão com a internet'] }; }
  if (n !== inBuscaN) return;                       // chegou uma busca mais nova
  inResultados = r.resultados;
  $('inFontes').textContent = r.avisos.join(' · ');
  $('inLista').innerHTML = inResultados.map((x, i) =>
    `<li data-i="${i}"><b>${esc(x.titulo)}</b><span>${esc(x.artista)}</span><i>${x.fonte === 'vagalume' ? 'VAGALUME' : 'LRCLIB'}</i></li>`).join('')
    || `<li class="vazio-lista">Nada encontrado para “${esc(q)}”.${r.avisos.length ? '' : '<br>Tente outro nome ou um trecho da letra.'}</li>`;
  if (inResultados.length) mostrarLetraInternet(0);
});
async function mostrarLetraInternet(i) {
  inSel = inResultados[i]; inLetra = null; $('inCriar').disabled = true;
  document.querySelectorAll('#inLista li').forEach(li => li.classList.toggle('sel', +li.dataset.i === i));
  $('inPrevia').textContent = 'Carregando…';
  try { inLetra = await api.letraInternet(inSel); }
  catch (err) { $('inPrevia').textContent = 'Não foi possível abrir esta letra.'; return; }
  if (inSel !== inResultados[i]) return;
  desenharPreviaInternet();
  $('inCriar').disabled = false;
}
function desenharPreviaInternet() {
  if (!inLetra) return;
  const corpo = T.formatarLinhas(inLetra.letra, +$('inFormato').value);
  $('inPrevia').textContent = `${inLetra.titulo || inSel.titulo} (${inLetra.artista || inSel.artista})\n\n${corpo}`;
}
$('inLista').addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (li) mostrarLetraInternet(+li.dataset.i); });
$('inLista').addEventListener('dblclick', e => { if (e.target.closest('li[data-i]') && !$('inCriar').disabled) $('inCriar').click(); });
$('inFormato').onchange = desenharPreviaInternet;
$('inCriar').onclick = () => {
  if (!inLetra) return;
  $('dlgInternet').close();
  // abre o editor já preenchido: dá para usar o Corretor antes de salvar
  abrirEditor(null, { titulo: inLetra.titulo || inSel.titulo, artista: inLetra.artista || inSel.artista,
    letra: T.formatarLinhas(inLetra.letra, +$('inFormato').value) });
  toast('Confira a letra (e use o Corretor) antes de salvar');
};
$('inChave').onclick = async e => {
  e.preventDefault();
  const atual = await api.temChaveVagalume();
  const k = prompt('Chave da API do Vagalume (gratuita).\n\nComo conseguir: crie uma conta em vagalume.com.br, abra a área de desenvolvedores/API e gere uma chave. Cole aqui:' + (atual ? '\n\n(deixe vazio para desligar)' : ''), '');
  if (k === null) return;
  const ligado = await api.chaveVagalume(k);
  $('inChave').textContent = ligado ? 'Vagalume ligado ✔' : 'Ligar Vagalume (mais letras gospel)';
  toast(ligado ? 'Vagalume ligado: as buscas agora incluem o Vagalume' : 'Vagalume desligado');
};

// ---------------- hinos (Harpa Cristã etc.) ----------------
function renderHinos() {
  const base = musicas.filter(ehHino).sort((a, b) => (a.numero || 9999) - (b.numero || 9999) || a.titulo.localeCompare(b.titulo, 'pt-BR'));
  const q = $('buscaHino').value.trim();
  const r = /^\d+$/.test(q) ? base.filter(m => String(m.numero || '').startsWith(q)).map(m => ({ m })) : buscarEm(base, q);
  if (/^\d+$/.test(q)) r.sort((a, b) => (a.m.numero === +q ? -1 : 0) - (b.m.numero === +q ? -1 : 0));
  $('contagemHinos').textContent = q ? `${r.length} resultado(s)` : `${base.length} hino(s)`;
  const k = chaveItem(atual);
  $('listaHinos').innerHTML = !base.length ? '<li class="vazio-lista">Nenhum hino ainda.<br><button class="btn peq" data-harpa style="margin:10px 0">⬇ Baixar a Harpa Cristã (640 hinos)</button><br>ou importe os .txt com o número no nome<br>(ex.: “015 - Chuvas de Graça.txt”).</li>'
    : r.slice(0, 800).map(({ m, trecho }) =>
      `<li data-id="${m.id}" class="${k === 'musica:' + m.id ? 'sel' : ''}"><span class="num-hino">${m.numero || ''}</span><div class="txt"><b>${destacar(m.titulo, 'buscaHino')}</b>` +
      (trecho ? `<span class="s">…${destacar(trecho, 'buscaHino')}</span>` : `<span class="s">${esc(m.hinario)}</span>`) + `</div><button class="lapis" title="Editar hino">${ico('i-edit')}</button></li>`).join('')
      || '<li class="vazio-lista">Nada encontrado.</li>';
}
$('listaHinos').addEventListener('click', cliqueMusica);
$('listaHinos').addEventListener('dblclick', e => { if (e.target.closest('li[data-id]')) projetar(0); });
$('buscaHino').addEventListener('input', renderHinos);
$('buscaHino').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const li = $('listaHinos').querySelector('li[data-id]'); if (li) { li.click(); $('buscaHino').blur(); }
});
$('btnImportarHinos').onclick = async () => {
  const hinario = $('nomeHinario').value.trim() || 'Harpa Cristã';
  const r = await api.importar({ corrigir: $('corrigirImportar').checked, hinario });
  if (!r.importadas && !r.duplicadas) return;
  await carregarMusicas();
  toast(`${r.importadas} hino(s) importado(s)` + (r.duplicadas ? ` · ${r.duplicadas} já existiam` : ''));
};
$('btnNovoHino').onclick = () => abrirEditor(null, { hinario: $('nomeHinario').value.trim() || 'Harpa Cristã' });
// baixar a Harpa Cristã inteira
$('btnBaixarHarpa').onclick = () => { $('hpStatus').textContent = ''; $('hpBaixar').disabled = false; $('dlgHarpa').showModal(); };
$('hpCancelar').onclick = () => $('dlgHarpa').close();
$('listaHinos').addEventListener('click', e => { if (e.target.closest('[data-harpa]')) $('btnBaixarHarpa').click(); });
$('hpBaixar').onclick = async () => {
  $('hpBaixar').disabled = true; $('hpCancelar').disabled = true;
  $('hpStatus').textContent = 'Baixando os hinos… (alguns segundos)';
  const r = await api.baixarHarpa({ substituir: $('hpSubstituir').checked, corrigir: $('hpCorrigir').checked });
  $('hpCancelar').disabled = false;
  if (!r.ok) { $('hpStatus').textContent = r.erro; $('hpBaixar').disabled = false; return; }
  $('dlgHarpa').close();
  $('nomeHinario').value = 'Harpa Cristã';
  await carregarMusicas(); irParaAba('hinos');
  toast(`Harpa Cristã: ${r.adicionados} hino(s) adicionado(s)` + (r.substituidos ? ` · ${r.substituidos} substituído(s)` : '') + (r.mantidos ? ` · ${r.mantidos} já existiam (mantidos)` : ''));
};

// ---------------- Bíblia ----------------
let navLivro = null;   // livro aberto na navegação (null = lista de livros)

async function carregarBiblias(selecionarId) {
  biblias = await api.listarBiblias();
  const id = selecionarId || config.biblia || (biblias[0] && biblias[0].id);
  $('versao').innerHTML = biblias.map(b => `<option value="${b.id}">${esc(b.nome)}</option>`).join('') || '<option value="">Nenhuma versão</option>';
  if (id && biblias.some(b => b.id === id)) { $('versao').value = id; await usarBiblia(id); }
  else { biblia = null; renderNavBiblia(); }
}
async function usarBiblia(id) {
  const dados = await api.carregarBiblia(id);
  const info = biblias.find(b => b.id === id);
  biblia = dados ? { id, nome: info ? info.nome : dados.nome, livros: dados.livros } : null;
  if (config.biblia !== id) { config.biblia = id; api.salvarConfig(config); }
  refZerar();
  renderNavBiblia();
  if (atual && atual.tipo === 'biblia' && atual.li != null) abrir(itemCapitulo(atual.li, atual.cap), sel);
}
function renderNavBiblia() {
  const nav = $('navBiblia');
  $('btnExcluirBiblia').style.display = biblia ? '' : 'none';
  $('btnBibliaVoltar').hidden = navLivro == null;
  if (!biblia) {
    nav.innerHTML = `<div class="sem-biblia">Nenhuma versão da Bíblia instalada.<br>Clique em <b>+ Versão</b> para baixar da internet<br>(ARC, ACF, NVI…) ou importar um arquivo.</div>`;
    return;
  }
  if (navLivro == null) {
    const botao = l => `<button data-l="${l.i}" class="${l.i >= 39 ? 'nt' : ''}" title="${esc(l.nome)}">${esc(l.abrev)}</button>`;
    nav.innerHTML = `<h4>Antigo Testamento</h4><div class="livros">${B.LIVROS.slice(0, 39).map(botao).join('')}</div>` +
      `<h4>Novo Testamento</h4><div class="livros">${B.LIVROS.slice(39).map(botao).join('')}</div>`;
  } else {
    const caps = (biblia.livros[navLivro] || []).length;
    const capAtual = atual && atual.tipo === 'biblia' && atual.li === navLivro ? atual.cap : 0;
    // capítulo mostrado nos versículos: o que está sendo digitado, ou o aberto no centro
    const capVer = REF.li === navLivro && REF.cap && REF.fase !== 'cap' ? +REF.cap : capAtual;
    const nv = capVer ? (biblia.livros[navLivro][capVer - 1] || []).length : 0;
    const vVivo = atual && atual.tipo === 'biblia' && atual.li === navLivro && atual.cap === capVer && vivo.chave === chaveItem(atual) && atual.slides[vivo.i] ? atual.slides[vivo.i].v : 0;
    nav.innerHTML = `<div class="titulo-livro">${esc(B.LIVROS[navLivro].nome)} · ${caps} capítulo(s)</div>` +
      `<div class="caps">${Array.from({ length: caps }, (_, c) => `<button data-c="${c + 1}" class="${capVer === c + 1 ? 'on' : ''}">${c + 1}</button>`).join('')}</div>` +
      (caps ? '' : '<p class="sub">Este livro não existe nesta versão.</p>') +
      (nv ? `<div class="titulo-livro vers-tit">Capítulo ${capVer} · ${nv} versículo(s)</div><div class="caps vers">${Array.from({ length: nv }, (_, v) => `<button data-v="${v + 1}" data-vc="${capVer}" class="${vVivo === v + 1 ? 'vivo' : ''}">${v + 1}</button>`).join('')}</div>` : '');
  }
}
$('navBiblia').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.l != null) { navLivro = +b.dataset.l; renderNavBiblia(); }
  else if (b.dataset.c != null) { abrir(itemCapitulo(navLivro, +b.dataset.c)); renderNavBiblia(); }
  else if (b.dataset.v != null) {            // clicou num versículo: projeta
    const item = itemCapitulo(navLivro, +b.dataset.vc); if (!item) return;
    const i = Math.max(0, item.slides.findIndex(s => s.v === +b.dataset.v));
    abrir(item, i); projetar(i); renderNavBiblia();
  }
});
$('btnBibliaVoltar').onclick = () => { navLivro = null; renderNavBiblia(); };
$('versao').onchange = e => usarBiblia(e.target.value);
// ---------- referência inteligente: livro -> capítulo -> versículo -> Enter projeta ----------
// "ge" vira "Gênesis ", só aceita capítulo/versículo que existe nesta versão, e Enter projeta.
const REF = { fase: 'livro', txt: '', li: null, cap: '', v1: '', v2: '' };
const nCaps = li => biblia && biblia.livros[li] ? biblia.livros[li].length : 0;
const nVers = (li, c) => biblia && biblia.livros[li] && biblia.livros[li][c - 1] ? biblia.livros[li][c - 1].length : 0;
function candidatosLivro(q) {
  const k = B.norm(q); if (!k) return [];
  const lista = B.LIVROS.filter(l => nCaps(l.i) > 0 && (B.norm(l.nome).startsWith(k) || B.norm(l.abrev).startsWith(k) || l.apelidos.some(a => a.startsWith(k))));
  const melhor = B.acharLivro(q);   // abreviação exata (jo = João, sl = Salmos…) vem primeiro
  if (melhor && nCaps(melhor.i) > 0) { const i = lista.indexOf(melhor); if (i > 0) { lista.splice(i, 1); lista.unshift(melhor); } else if (i < 0) lista.unshift(melhor); }
  return lista;
}
function refTexto() {
  if (REF.li == null) return REF.txt;
  let t = B.LIVROS[REF.li].nome + ' ' + REF.cap;
  if (REF.fase === 'v1' || REF.fase === 'v2') t += ':' + REF.v1;
  if (REF.fase === 'v2') t += '-' + REF.v2;
  return t;
}
function refZerar() { Object.assign(REF, { fase: 'livro', txt: '', li: null, cap: '', v1: '', v2: '' }); refMostrar(); }
function refMostrar() {
  const inp = $('buscaRef'); inp.value = refTexto();
  try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (_) {}
  refMostrarDica();
  if (navLivro === REF.li && REF.li != null) renderNavBiblia();   // mostra os versículos do capítulo digitado
}
function refMostrarDica() {
  const d = $('refDica');
  if (!biblia) { d.innerHTML = ''; return; }
  if (REF.fase === 'livro') {
    const c = candidatosLivro(REF.txt);
    d.innerHTML = !REF.txt ? 'Digite o livro: <b>gn</b>, <b>jo</b>, <b>sl</b>, <b>1co</b>…'
      : c.length ? c.slice(0, 6).map((l, i) => `<span class="sug ${i === 0 ? 'on' : ''}" data-li="${l.i}">${esc(l.nome)}</span>`).join('') + (c.length > 1 ? ' <span>Espaço escolhe o primeiro</span>' : '')
      : 'Nenhum livro com esse nome';
  } else if (REF.fase === 'cap') {
    d.innerHTML = `<b>${esc(B.LIVROS[REF.li].nome)}</b> · capítulo de 1 a ${nCaps(REF.li)}` + (REF.cap ? ' · <span class="pronto">Enter projeta o capítulo</span> · digite <b>:</b> para escolher o versículo' : '');
  } else {
    const nv = nVers(REF.li, +REF.cap);
    d.innerHTML = REF.fase === 'v1'
      ? `<b>${esc(B.LIVROS[REF.li].nome)} ${REF.cap}</b> · versículo de 1 a ${nv}` + (REF.v1 ? ' · <span class="pronto">Enter projeta</span> · <b>-</b> para um trecho (ex.: 16-18)' : '')
      : `<b>${esc(B.LIVROS[REF.li].nome)} ${REF.cap}:${REF.v1}</b> · até o versículo (${+REF.v1 + 1} a ${nv})` + (REF.v2 ? ' · <span class="pronto">Enter projeta</span>' : '');
  }
}
function refRecusa() { const i = $('buscaRef'); i.classList.remove('recusa'); void i.offsetWidth; i.classList.add('recusa'); clearTimeout(refRecusa.t); refRecusa.t = setTimeout(() => i.classList.remove('recusa'), 400); }
function refEscolherLivro(l) {
  if (!l) return false;
  Object.assign(REF, { li: l.i, fase: 'cap', cap: '', v1: '', v2: '' });
  if (nCaps(l.i) === 1) Object.assign(REF, { cap: '1', fase: 'v1' });   // Judas, Obadias, Filemom…: só tem 1 capítulo
  navLivro = l.i; renderNavBiblia();
  return true;
}
// digita um número validando o limite; auto-avança quando não cabe mais nenhum dígito
function refDigito(campo, d, max, min = 1) {
  const novo = REF[campo] + d, n = +novo;
  if (novo.startsWith('0') || n < 1 || n > max) return false;
  REF[campo] = novo;
  return true;
}
function refProjetar() {
  if (REF.li == null || !REF.cap) return;
  let t = `${B.LIVROS[REF.li].nome} ${REF.cap}`;
  if (REF.v1) t += ':' + REF.v1 + (REF.v2 && +REF.v2 > +REF.v1 ? '-' + REF.v2 : '');
  if (abrirReferencia(t)) {
    projetar(Math.max(0, sel));
    $('buscaRef').blur();   // sai do campo: setas, Espaço e passador já passam os versículos
  }
}
$('buscaRef').addEventListener('keydown', e => {
  if (!biblia || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key, ehDig = /^\d$/.test(k), ehLetra = /^\p{L}$/u.test(k);
  // texto todo selecionado (ao entrar no campo) + letra/número = começar uma referência nova
  const inp = $('buscaRef');
  if ((ehDig || ehLetra) && inp.value && inp.selectionStart === 0 && inp.selectionEnd === inp.value.length) Object.assign(REF, { fase: 'livro', txt: '', li: null, cap: '', v1: '', v2: '' });
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Escape', 'F2'].includes(k) || (k.length > 1 && !['Enter', 'Backspace', 'Tab', 'Delete'].includes(k))) return;
  e.preventDefault();
  if (k === 'Delete') { refZerar(); return; }
  if (REF.fase === 'livro') {
    if (k === 'Backspace') { REF.txt = REF.txt.slice(0, -1); }
    else if (ehLetra) {
      const c = candidatosLivro(REF.txt + k);
      if (!c.length) { refRecusa(); return; }
      REF.txt += k;
      const unico = c.length === 1 || (B.norm(REF.txt).length >= 2 && c.filter(l => B.norm(l.nome).startsWith(B.norm(REF.txt))).length === 1 && B.norm(c[0].nome).startsWith(B.norm(REF.txt)));
      if (c.length === 1) refEscolherLivro(c[0]);
      else if (unico && B.norm(REF.txt).length >= 3) refEscolherLivro(c[0]);
    } else if (ehDig) {
      if (!REF.txt) { if ('123'.includes(k)) REF.txt = k; else refRecusa(); }
      else if (/^\d$/.test(REF.txt)) refRecusa();
      else { const c = candidatosLivro(REF.txt); if (!refEscolherLivro(c[0])) { refRecusa(); return; } if (REF.fase === 'v1') { if (k !== '1') refRecusa(); } else if (!refDigito('cap', k, nCaps(REF.li))) refRecusa(); else if (+REF.cap * 10 > nCaps(REF.li)) REF.fase = 'v1'; }
    } else if (k === ' ' || k === 'Tab' || k === 'Enter') {
      if (/^\d?$/.test(REF.txt)) { if (k === 'Tab') $('buscaRef').blur(); refMostrar(); return; }
      if (!refEscolherLivro(candidatosLivro(REF.txt)[0])) refRecusa();
    } else refRecusa();
    refMostrar(); return;
  }
  if (REF.fase === 'cap') {
    if (k === 'Backspace') { if (REF.cap) REF.cap = REF.cap.slice(0, -1); else { REF.fase = 'livro'; REF.li = null; REF.txt = ''; navLivro = null; renderNavBiblia(); } }
    else if (ehDig) { if (!refDigito('cap', k, nCaps(REF.li))) refRecusa(); else if (+REF.cap * 10 > nCaps(REF.li)) REF.fase = 'v1'; }
    else if ([':', '.', ',', ' '].includes(k)) { if (REF.cap) REF.fase = 'v1'; else refRecusa(); }
    else if (k === 'Enter') { if (REF.cap) refProjetar(); else refRecusa(); }
    else refRecusa();
    refMostrar(); return;
  }
  if (REF.fase === 'v1') {
    const nv = nVers(REF.li, +REF.cap);
    if (k === 'Backspace') { if (REF.v1) REF.v1 = REF.v1.slice(0, -1); else { REF.fase = 'cap'; if (+REF.cap * 10 > nCaps(REF.li)) REF.cap = REF.cap.slice(0, -1); } }
    else if (ehDig) { if (!refDigito('v1', k, nv)) refRecusa(); }
    else if (k === '-') { if (REF.v1 && +REF.v1 < nv) REF.fase = 'v2'; else refRecusa(); }
    else if (k === 'Enter') refProjetar();
    else refRecusa();
    refMostrar(); return;
  }
  if (REF.fase === 'v2') {
    const nv = nVers(REF.li, +REF.cap);
    if (k === 'Backspace') { if (REF.v2) REF.v2 = REF.v2.slice(0, -1); else REF.fase = 'v1'; }
    else if (ehDig) { if (!refDigito('v2', k, nv)) refRecusa(); }
    else if (k === 'Enter') { if (!REF.v2 || +REF.v2 > +REF.v1) refProjetar(); else refRecusa(); }
    else refRecusa();
    refMostrar();
  }
});
// colar uma referência inteira ("Jo 3:16") também funciona
$('buscaRef').addEventListener('paste', e => {
  if (!biblia) return;
  e.preventDefault();
  const r = B.interpretarReferencia((e.clipboardData || window.clipboardData).getData('text'));
  if (!r || !nCaps(r.livro)) { refRecusa(); return; }
  refEscolherLivro(B.LIVROS[r.livro]);
  if (r.cap && r.cap <= nCaps(r.livro)) {
    REF.cap = String(r.cap); REF.fase = 'v1';
    if (r.v1 && r.v1 <= nVers(r.livro, r.cap)) { REF.v1 = String(r.v1); if (r.v2 && r.v2 > r.v1 && r.v2 <= nVers(r.livro, r.cap)) { REF.v2 = String(r.v2); REF.fase = 'v2'; } }
  }
  refMostrar();
});
$('buscaRef').addEventListener('input', () => { if ($('buscaRef').value !== refTexto()) { refZerar(); } });
$('buscaRef').addEventListener('focus', () => { refMostrar(); setTimeout(() => $('buscaRef').select(), 0); });
$('refDica').addEventListener('mousedown', e => {
  const s = e.target.closest('.sug[data-li]'); if (!s) return;
  e.preventDefault(); refEscolherLivro(B.LIVROS[+s.dataset.li]); refMostrar(); $('buscaRef').focus();
});
// abre uma referência (Jo 3:16, Sl 23, 1Co 13:4-7). Devolve true se abriu slides.
function abrirReferencia(txt) {
  if (!biblia) { toast('Instale uma versão da Bíblia primeiro'); return false; }
  const r = B.interpretarReferencia(txt);
  if (!r) { toast('Referência não reconhecida. Ex.: Jo 3:16'); return false; }
  navLivro = r.livro;
  if (!r.cap) { renderNavBiblia(); return false; }
  const item = itemCapitulo(r.livro, r.cap);
  if (!item || !item.slides.length) { toast('Capítulo não encontrado nesta versão'); renderNavBiblia(); return false; }
  let i = r.v1 ? item.slides.findIndex(s => s.v === r.v1) : 0;
  if (r.v1 && r.v2 && r.v2 > r.v1) {
    // intervalo: mostra só os versículos pedidos
    item.slides = item.slides.filter(s => s.v >= r.v1 && s.v <= r.v2);
    item.titulo = `${B.LIVROS[r.livro].nome} ${r.cap}:${r.v1}-${r.v2}`;
    item.ref += `|${r.v1}-${r.v2}`;
    i = 0;
  }
  abrir(item, Math.max(0, i));
  renderNavBiblia();
  return true;
}
// ---------- adicionar versão: baixar da internet ou importar arquivo ----------
let baixandoBiblia = null;
async function renderVersoesOnline() {
  let lista = [];
  try { lista = await api.bibliasOnline(); } catch (_) {}
  $('listaVersoes').innerHTML = lista.map(v => `<div class="versao-it ${v.instalada ? 'ok' : ''}" data-cod="${esc(v.cod)}"><span class="sig">${esc(v.sigla)}</span>` +
    `<span class="nm">${esc(v.nome)}<br><span class="prog" data-prog>${v.instalada ? 'Instalada neste computador' : ''}</span></span>` +
    `<button class="btn ${v.instalada ? 'ghost' : ''} peq" data-baixar="${esc(v.cod)}" ${baixandoBiblia ? 'disabled' : ''}>${v.instalada ? 'Baixar de novo' : 'Baixar'}</button></div>`).join('');
}
$('btnImportarBiblia').onclick = async () => { await renderVersoesOnline(); $('dlgBiblias').showModal(); };
$('bbFechar').onclick = () => $('dlgBiblias').close();
api.onBibliaProgresso(p => {
  const it = document.querySelector(`.versao-it[data-cod="${p.cod}"] [data-prog]`); if (!it) return;
  it.textContent = p.fase === 'baixando' ? `Baixando… ${p.pct != null ? p.pct + '%' : (p.mb || 0).toFixed(1) + ' MB'}` : p.fase === 'convertendo' ? 'Preparando os versículos…' : p.fase === 'pronto' ? 'Instalada!' : '';
});
$('listaVersoes').addEventListener('click', async e => {
  const b = e.target.closest('[data-baixar]'); if (!b || baixandoBiblia) return;
  baixandoBiblia = b.dataset.baixar;
  document.querySelectorAll('[data-baixar]').forEach(x => x.disabled = true);
  b.textContent = 'Baixando…';
  const r = await api.baixarBiblia(baixandoBiblia);
  baixandoBiblia = null;
  if (!r.ok) { alert(r.erro); await renderVersoesOnline(); return; }
  await carregarBiblias(r.id); await renderVersoesOnline();
  toast(`Bíblia ${r.nome} instalada: ${r.total.toLocaleString('pt-BR')} versículos`);
});
$('bbImportar').onclick = async () => {
  $('dlgBiblias').close();
  const r = await api.importarBiblia();
  if (!r.ok) { if (r.erro) alert('Não consegui ler este arquivo:\n' + r.erro); return; }
  const nome = prompt('Nome desta versão (ex.: ARC, ACF, NVI):', r.nome);
  if (nome && nome.trim() && nome.trim() !== r.nome) await api.renomearBiblia(r.id, nome.trim());
  await carregarBiblias(r.id);
  toast(`Bíblia instalada: ${r.total.toLocaleString('pt-BR')} versículos`);
};
$('btnExcluirBiblia').onclick = async () => {
  if (!biblia || !confirm(`Remover a versão "${biblia.nome}" deste computador?`)) return;
  await api.excluirBiblia(biblia.id); config.biblia = null; navLivro = null;
  if (atual && atual.tipo === 'biblia') abrir(null);
  await carregarBiblias();
};

// ---------------- avisos editáveis ----------------
async function carregarAvisos() {
  avisos = await api.listarAvisos();
  renderAvisos();
  if (atual && atual.tipo === 'aviso') {
    const a = avisos.find(x => x.id === atual.ref);
    abrir(a ? itemAviso(a) : null);
  }
}
// botões rápidos: aparece nos avisos automáticos (telão) e para quem lê os avisos (leitura)
function botoesVis(tipo, chave, item) {
  const telao = item.rotativo !== false, ler = item.leitura !== false;
  return `<span class="vis-bts" data-tipo="${tipo}" data-chave="${esc(chave)}">` +
    `<button data-vis="telao" class="${telao ? 'on' : ''}" title="${telao ? 'Aparece nos avisos automáticos do telão (clique para tirar)' : 'NÃO aparece nos avisos automáticos (clique para colocar)'}">${ico('i-screen')}</button>` +
    `<button data-vis="leitura" class="${ler ? 'on' : ''}" title="${ler ? 'Aparece na Leitura do celular (clique para tirar)' : 'NÃO aparece na Leitura (clique para colocar)'}">${ico('i-ler')}</button></span>`;
}
let silenciarDados = 0;
async function cliqueVis(e) {
  const b = e.target.closest('.vis-bts button'); if (!b) return false;
  e.stopPropagation();
  const box = b.parentElement, campo = b.dataset.vis, valor = !b.classList.contains('on');
  b.classList.toggle('on', valor); b.disabled = true;
  silenciarDados = Date.now() + 3000;
  try {
    await api.definirVisibilidade(box.dataset.tipo, box.dataset.chave, campo, valor);
    toast((campo === 'telao' ? (valor ? 'Vai aparecer nos avisos automáticos' : 'Fora dos avisos automáticos') : (valor ? 'Vai aparecer na Leitura' : 'Fora da Leitura')));
  } catch (err) { b.classList.toggle('on', !valor); toast('Não consegui mudar: ' + (err.message || err)); }
  if (box.dataset.tipo === 'aviso') await carregarAvisos(); else await carregarImagens();
  return true;
}
function renderAvisos() {
  const k = chaveItem(atual);
  $('listaAvisos').innerHTML = avisos.slice().sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0)).map(a =>
    `<li data-id="${a.id}" class="${k === 'aviso:' + a.id ? 'sel' : ''}"><div class="mini-aviso">${htmlAviso(a)}</div>` +
    `<div class="txt"><b>${esc((a.titulo || 'Aviso').replace(/\n/g, ' '))}</b><span class="s">${esc(a.texto)}</span></div>${botoesVis('aviso', a.id, a)}</li>`).join('')
    || '<li class="vazio-lista">Nenhum aviso.<br>Crie avisos com fundo, cores e tamanho do seu jeito.</li>';
}
$('listaAvisos').addEventListener('click', async e => {
  if (e.target.closest('.vis-bts')) { await cliqueVis(e); return; }
  const li = e.target.closest('li[data-id]'); if (!li) return;
  abrir(itemAviso(avisos.find(a => a.id === li.dataset.id)));
});
$('listaAvisos').addEventListener('dblclick', e => { if (e.target.closest('li[data-id]')) projetar(0); });
$('btnNovoAviso').onclick = () => abrirEditorAviso(null);

let avEdit = null;
const CORES_TEXTO = ['#ffffff', '#f4f1ea', '#E0B96A', '#1b4d3a', '#14231b'];
function abrirEditorAviso(a) {
  avEdit = Object.assign({}, AVISO_PADRAO, { rotativo: true, inicio: '', fim: '' }, a || {});
  $('avisoTituloDlg').textContent = a ? 'Editar aviso' : 'Novo aviso';
  $('avTitulo').value = String(avEdit.titulo).replace(/\n/g, ' ');
  $('avTexto').value = avEdit.texto;
  $('avCorFundo').value = avEdit.fundoCor;
  $('avDestaque').checked = !!avEdit.destaque;
  $('avRotativo').checked = avEdit.rotativo !== false;
  $('avInicio').value = avEdit.inicio || '';
  $('avFim').value = avEdit.fim || '';
  sincronizarEditorAviso();
  $('dlgAviso').showModal();
  $('avTitulo').focus(); $('avTitulo').select();
}
function sincronizarEditorAviso() {
  document.querySelectorAll('#avFundoTipo button').forEach(b => b.classList.toggle('on', b.dataset.v === avEdit.fundoTipo));
  document.querySelectorAll('.av-op').forEach(o => o.classList.toggle('on', o.dataset.op === avEdit.fundoTipo));
  document.querySelectorAll('#avPosicao button').forEach(b => b.classList.toggle('on', b.dataset.v === avEdit.posicao));
  $('avTemas').innerHTML = TEMAS.map((t, i) =>
    `<div data-t="${i}" title="${t.nome}" class="${avEdit.fundoTema === i ? 'on' : ''}" style="background:${t.css ? t.css + ',' + t.cor : t.cor}"></div>`).join('');
  $('avImgMini').style.backgroundImage = avEdit.fundoImg ? `url('${String(avEdit.fundoImg).replace(/'/g, '%27')}')` : 'none';
  $('avImg').textContent = avEdit.fundoImg ? 'Trocar imagem…' : 'Escolher imagem…';
  $('avEscurecer').value = avEdit.escurecer; $('avEscVal').textContent = avEdit.escurecer + '%';
  $('avTamanho').value = avEdit.tamanho; $('avTamVal').textContent = avEdit.tamanho + '%';
  $('avCorTitulo').value = avEdit.corTitulo; $('avCorTexto').value = avEdit.corTexto;
  document.querySelectorAll('.cores').forEach(box => {
    box.innerHTML = CORES_TEXTO.map(c => `<button type="button" data-c="${c}" style="background:${c}" class="${String(avEdit[box.dataset.alvo]).toLowerCase() === c.toLowerCase() ? 'on' : ''}"></button>`).join('');
  });
  previaAviso();
}
function previaAviso() { $('avPrevia').innerHTML = htmlAviso(avEdit); }
$('avFundoTipo').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  avEdit.fundoTipo = b.dataset.v;
  if (b.dataset.v === 'img' && !avEdit.fundoImg) { await escolherImagemAviso(); return; }
  sincronizarEditorAviso();
});
async function escolherImagemAviso() {
  const u = await api.escolherImagem('avisos');
  if (u) {
    Object.assign(avEdit, { fundoTipo: 'img', fundoImg: u, corTitulo: '#ffffff', corTexto: '#ffffff' });
    if (!avEdit.escurecer) avEdit.escurecer = 35;
  } else if (!avEdit.fundoImg) avEdit.fundoTipo = 'tema';
  sincronizarEditorAviso();
}
$('avImg').onclick = escolherImagemAviso;
$('avTemas').addEventListener('click', e => {
  const d = e.target.closest('div[data-t]'); if (!d) return;
  const t = TEMAS[+d.dataset.t];
  const claro = t.texto !== '#ffffff';
  Object.assign(avEdit, { fundoTipo: 'tema', fundoTema: +d.dataset.t,
    corTitulo: claro ? '#1b4d3a' : '#ffffff', corTexto: claro ? '#14231b' : '#f4f1ea' });
  sincronizarEditorAviso();
});
$('avPosicao').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { avEdit.posicao = b.dataset.v; sincronizarEditorAviso(); } });
document.querySelectorAll('.cores').forEach(box => box.addEventListener('click', e => {
  const b = e.target.closest('button[data-c]'); if (b) { avEdit[box.dataset.alvo] = b.dataset.c; sincronizarEditorAviso(); }
}));
const ligarAv = (id, campo, conv = v => v, depois) => $(id).addEventListener('input', e => {
  avEdit[campo] = conv(e.target.type === 'checkbox' ? e.target.checked : e.target.value);
  if (depois) depois(); else previaAviso();
});
ligarAv('avTitulo', 'titulo'); ligarAv('avTexto', 'texto');
ligarAv('avCorFundo', 'fundoCor', v => v, () => { avEdit.fundoTipo = 'cor'; sincronizarEditorAviso(); });
ligarAv('avEscurecer', 'escurecer', Number, () => { $('avEscVal').textContent = avEdit.escurecer + '%'; previaAviso(); });
ligarAv('avTamanho', 'tamanho', Number, () => { $('avTamVal').textContent = avEdit.tamanho + '%'; previaAviso(); });
ligarAv('avCorTitulo', 'corTitulo', v => v, sincronizarEditorAviso);
ligarAv('avCorTexto', 'corTexto', v => v, sincronizarEditorAviso);
ligarAv('avDestaque', 'destaque');
ligarAv('avRotativo', 'rotativo', v => v, () => {});
ligarAv('avInicio', 'inicio', v => v, () => {});
ligarAv('avFim', 'fim', v => v, () => {});
$('avCancelar').onclick = () => $('dlgAviso').close();
$('formAviso').addEventListener('submit', async e => {
  e.preventDefault();
  if (!String(avEdit.titulo).trim()) { $('avTitulo').focus(); return; }
  const salvo = await api.salvarAviso(avEdit);
  $('dlgAviso').close();
  await carregarAvisos();
  abrir(itemAviso(salvo));
  if (vivo.chave === 'aviso:' + salvo.id) projetar(0);   // se está no telão, atualiza na hora
  toast('Aviso salvo');
});
const bannerNoTelao = b => b.rotativo !== false && (!b.inicio || b.inicio <= IG.iso(new Date())) && (!b.fim || b.fim >= IG.iso(new Date()));
let bnEdit = null;
// ----- novo banner: arrastar ou escolher a imagem -----
let bnNovo = null;   // { dataURL, nome } quando a janela está no modo "Novo banner"
const ehArqImagem = f => f && /^image\/(png|jpe?g|webp|gif)$/i.test(f.type);
const lerDataURL = f => new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => erro(r.error); r.readAsDataURL(f); });
const tituloDoArquivo = n => String(n || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
function abrirBannerNovo(arquivo) {
  bnEdit = null; bnNovo = { dataURL: null, nome: '' };
  $('bnTituloDlg').textContent = 'Novo banner';
  const pv = $('bnPrevia'); pv.style.backgroundImage = ''; pv.classList.add('novo', 'vazio');
  $('bnTitulo').value = ''; $('bnDesc').value = ''; $('bnIni').value = ''; $('bnFim').value = ''; $('bnTelao').checked = true;
  $('dlgBanner').showModal();
  if (arquivo) usarArquivoBanner(arquivo);
}
async function usarArquivoBanner(f) {
  if (!bnNovo) return;
  if (!ehArqImagem(f)) { toast('Use uma imagem JPG, PNG ou WEBP'); return; }
  bnNovo.dataURL = await lerDataURL(f); bnNovo.nome = f.name || 'banner';
  const pv = $('bnPrevia'); pv.classList.remove('vazio'); pv.style.backgroundImage = `url('${bnNovo.dataURL}')`;
  if (!$('bnTitulo').value.trim()) $('bnTitulo').value = tituloDoArquivo(f.name);
  $('bnTitulo').focus(); $('bnTitulo').select();
}
$('bnPrevia').addEventListener('click', () => { if (bnNovo) $('bnArquivo').click(); });
$('bnArquivo').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) usarArquivoBanner(f); });
$('bnPrevia').addEventListener('dragover', e => { if (!bnNovo) return; e.preventDefault(); $('bnPrevia').classList.add('arrastando'); });
$('bnPrevia').addEventListener('dragleave', () => $('bnPrevia').classList.remove('arrastando'));
$('bnPrevia').addEventListener('drop', e => {
  $('bnPrevia').classList.remove('arrastando');
  if (!bnNovo) return; e.preventDefault();
  const f = [...e.dataTransfer.files].find(ehArqImagem); if (f) usarArquivoBanner(f); else toast('Arraste um arquivo de imagem');
});
// arrastar imagens para a aba Imagens: 1 imagem abre "Novo banner"; várias são adicionadas direto
(() => {
  const aba = document.querySelector('.aba[data-aba="imagens"]'); let cont = 0;
  const temArquivos = e => [...(e.dataTransfer && e.dataTransfer.types || [])].includes('Files');
  aba.addEventListener('dragenter', e => { if (!temArquivos(e)) return; e.preventDefault(); cont++; $('soltarImagens').hidden = false; });
  aba.addEventListener('dragover', e => { if (temArquivos(e)) e.preventDefault(); });
  aba.addEventListener('dragleave', () => { if (--cont <= 0) { cont = 0; $('soltarImagens').hidden = true; } });
  aba.addEventListener('drop', async e => {
    cont = 0; $('soltarImagens').hidden = true;
    if (!temArquivos(e)) return; e.preventDefault();
    const fs = [...e.dataTransfer.files].filter(ehArqImagem);
    if (!fs.length) { toast('Arraste arquivos de imagem (JPG, PNG ou WEBP)'); return; }
    if (fs.length === 1) { abrirBannerNovo(fs[0]); return; }
    toast(`Adicionando ${fs.length} imagens…`); silenciarDados = Date.now() + 8000;
    for (const f of fs) await api.novoBanner(await lerDataURL(f), f.name, { titulo: tituloDoArquivo(f.name), rotativo: true });
    await carregarImagens(); toast(`${fs.length} banners adicionados. Use o lápis para pôr descrição e datas.`);
  });
})();
// soltar uma imagem fora das áreas certas não deve abrir a imagem no lugar do programa
const soArquivos = e => [...(e.dataTransfer && e.dataTransfer.types || [])].includes('Files');
window.addEventListener('dragover', e => { if (soArquivos(e)) e.preventDefault(); });
window.addEventListener('drop', e => { if (soArquivos(e)) e.preventDefault(); });

function abrirBanner(b) {
  if (!b) return;
  bnEdit = b; bnNovo = null;
  $('bnTituloDlg').textContent = 'Dados do banner';
  $('bnPrevia').classList.remove('novo', 'vazio');
  $('bnPrevia').style.backgroundImage = `url('${String(b.url).replace(/'/g, '%27')}')`;
  $('bnTitulo').value = b.titulo || ''; $('bnDesc').value = b.descricao || '';
  $('bnIni').value = b.inicio || ''; $('bnFim').value = b.fim || ''; $('bnTelao').checked = b.rotativo !== false;
  $('dlgBanner').showModal(); $('bnTitulo').focus();
}
$('bnCancelar').onclick = () => $('dlgBanner').close();
$('formBanner').addEventListener('submit', async e => {
  e.preventDefault();
  if (bnNovo) {
    if (!bnNovo.dataURL) { toast('Arraste ou escolha a imagem do banner'); $('bnPrevia').classList.add('arrastando'); setTimeout(() => $('bnPrevia').classList.remove('arrastando'), 900); return; }
    let nome;
    silenciarDados = Date.now() + 4000;
    try { nome = await api.novoBanner(bnNovo.dataURL, bnNovo.nome, { titulo: $('bnTitulo').value.trim(), descricao: $('bnDesc').value.trim(), inicio: $('bnIni').value, fim: $('bnFim').value, rotativo: $('bnTelao').checked }); }
    catch (err) { toast('Não consegui adicionar: ' + (err.message || err)); return; }
    bnNovo = null; $('dlgBanner').close(); await carregarImagens();
    const b = banners.find(x => x.nome === nome); if (b) abrir(itemImagem(b));
    toast('Banner adicionado'); return;
  }
  await api.salvarMetaBanner(bnEdit.nome, { titulo: $('bnTitulo').value.trim(), descricao: $('bnDesc').value.trim(), inicio: $('bnIni').value, fim: $('bnFim').value, rotativo: $('bnTelao').checked });
  $('dlgBanner').close(); await carregarImagens();
  const b = banners.find(x => x.nome === bnEdit.nome); if (b && atual && atual.tipo === 'imagem' && atual.ref === b.nome) abrir(itemImagem(b));
  toast('Dados do banner salvos');
});
const avisoVigente = a => a.rotativo !== false && (!a.inicio || a.inicio <= IG.iso(new Date())) && (!a.fim || a.fim >= IG.iso(new Date()));

// ---------------- igreja: aniversariantes e visitantes ----------------
async function carregarIgreja() {
  membros = await api.listarMembros();
  visitantes = await api.listarVisitantes();
  renderIgreja();
}
function renderIgreja() {
  const aniv = IG.aniversariantesDaSemana(membros);
  $('periodoAniv').textContent = IG.periodo();
  $('listaAniv').innerHTML = aniv.map(x =>
    `<li class="${x.diff === 0 ? 'hoje' : ''}" data-id="${x.m.id}">${avatar(x.m, x.m.casal ? 'casal' : '')}` +
    `<div class="txt"><b>${esc(x.m.nome)}${x.diff === 0 ? '<span class="selo hoje">HOJE</span>' : ''}</b><span class="s">${esc(IG.rotuloData(x))}${x.m.casal ? ' · casamento' : ''}</span></div>` +
    `<button class="lapis" title="Editar membro / foto">${ico('i-edit')}</button></li>`).join('')
    || `<li class="vazio-lista">${membros.length ? 'Nenhum aniversário nos últimos 7 dias.' : 'Cadastre ou importe os membros em “Membros…”.'}</li>`;
  const vis = IG.visitantesDoDia(visitantes);
  $('qtdVisit').textContent = vis.length ? `${IG.totalPessoas(vis)} pessoa(s)` : '';
  $('listaVisit').innerHTML = vis.map(v =>
    `<li data-id="${v.id}">${avatar({ nome: IG.nomeVisitante(v) })}<div class="txt"><b>${esc(IG.nomeVisitante(v))}${IG.pessoas(v) > 1 ? ' · ' + IG.pessoas(v) : ''}${v.primeira ? '<span class="selo ag">1ª VISITA</span>' : ''}</b>` +
    `<span class="s">${esc([IG.descVisitante(v), v.hora].filter(Boolean).join(' · '))}</span></div>` +
    `<span class="acoes-item"><button data-e="1" title="Editar">${ico('i-edit')}</button><button data-x="1" title="Excluir">${ico('i-x')}</button></span></li>`).join('')
    || '<li class="vazio-lista">Nenhum visitante registrado hoje.</li>';
}
// visitantes
let visEdit = null, vsTipo = 'convidado';
function definirVsTipo(t) {
  vsTipo = t;
  document.querySelectorAll('#vsTipo button').forEach(b => b.classList.toggle('on', b.dataset.v === t));
  $('vsBlocoQuem').hidden = t !== 'convidado'; $('vsBlocoIgreja').hidden = t !== 'igreja';
}
document.querySelectorAll('.fv-qtd button').forEach(b => b.onclick = () => { $('vsQtd').value = Math.min(99, Math.max(1, (+$('vsQtd').value || 1) + +b.dataset.q)); });
$('vsTipo').addEventListener('click', e => { const b = e.target.closest('button'); if (b) definirVsTipo(b.dataset.v); });
function abrirVisitante(v) {
  visEdit = v || null;
  $('nomesMembros').innerHTML = membros.map(m => `<option value="${esc(m.nome)}">`).join('');
  $('tituloVisit').textContent = v ? 'Editar visitante' : 'Registrar visitante';
  $('vsNome').value = v && v.nome !== 'Visitante' ? v.nome : ''; $('vsQtd').value = v ? IG.pessoas(v) : 1;
  definirVsTipo(v && v.tipo === 'igreja' ? 'igreja' : 'convidado');
  $('vsQuem').value = v ? v.quem || '' : ''; $('vsIgreja').value = v ? v.igreja || v.origem || '' : '';
  $('vsPrimeira').checked = v ? !!v.primeira : true;
  $('dlgVisit').showModal(); $('vsNome').focus();
}
$('btnNovoVisit').onclick = () => abrirVisitante(null);
$('vsCancelar').onclick = () => $('dlgVisit').close();
$('formVisit').addEventListener('submit', async e => {
  e.preventDefault();
  const nome = $('vsNome').value.trim() || 'Visitante';
  const agora = new Date();
  const igreja = vsTipo === 'igreja' ? $('vsIgreja').value.trim() : '';
  await api.salvarVisitante(Object.assign({}, visEdit || { data: IG.iso(agora), hora: agora.toTimeString().slice(0, 5) },
    { nome, qtd: Math.max(1, +$('vsQtd').value || 1), tipo: vsTipo, quem: vsTipo === 'convidado' ? $('vsQuem').value.trim() : '', igreja, origem: igreja, primeira: $('vsPrimeira').checked }));
  $('dlgVisit').close();
  await carregarIgreja();
  toast(visEdit ? 'Visitante atualizado' : 'Visitante registrado');
  if (!visEdit) abrirVisitante(null);   // já deixa pronto para o próximo
});
$('listaVisit').addEventListener('click', async e => {
  const li = e.target.closest('li[data-id]'); if (!li) return;
  const v = visitantes.find(x => x.id === li.dataset.id);
  if (e.target.closest('button[data-x]')) { if (confirm(`Excluir o visitante "${v.nome}"?`)) { await api.excluirVisitante(v.id); carregarIgreja(); } }
  else if (e.target.closest('button[data-e]')) abrirVisitante(v);
});
// membros
// data do membro: só os números, a barra entra sozinha ("1503" -> "15/03"); dia e mês inválidos são recusados
const DIAS_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function mascaraData(bruto) {
  let d = String(bruto).replace(/\D/g, ''), out = '';
  for (const c of d) {
    const tent = out + c;
    if (tent.length === 1 && +c > 3) out = '0' + c;                         // 5 -> 05
    else if (tent.length === 2 && (+tent < 1 || +tent > 31)) continue;      // dia 00 ou 32+
    else if (tent.length === 3 && +c > 1) { const m = +('0' + c); if (+out <= DIAS_MES[m - 1]) out = out + '0' + c; }   // 15 + 3 -> 15/03
    else if (tent.length === 4) { const m = +tent.slice(2); if (m >= 1 && m <= 12 && +out.slice(0, 2) <= DIAS_MES[m - 1]) out = tent; }
    else if (tent.length <= 3) out = tent;
    if (out.length >= 4) break;
  }
  return out.length >= 2 ? out.slice(0, 2) + '/' + out.slice(2, 4) : out;
}
$('mbData').setAttribute('inputmode', 'numeric'); $('mbData').maxLength = 5;
$('mbData').addEventListener('keydown', e => {
  if (e.key === 'Backspace' && /\/$/.test(e.target.value) && e.target.selectionStart === e.target.value.length) { e.preventDefault(); e.target.value = e.target.value.slice(0, 1); }
});
$('mbData').addEventListener('input', e => { const v = mascaraData(e.target.value); if (v !== e.target.value) e.target.value = v; });
let mbEdit = null;
function renderMembros() {
  const q = T.normalizarBusca($('buscaMembro').value.trim());
  const lista = membros.filter(m => !q || T.normalizarBusca(m.nome).includes(q)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const dd = n => String(n).padStart(2, '0');
  $('listaMembros').innerHTML = lista.map(m =>
    `<li data-id="${m.id}">${avatar(m, m.casal ? 'casal' : '')}<div class="txt"><b>${esc(m.nome)}</b><span class="s">${dd(m.dia)}/${dd(m.mes)}${m.casal ? ' · casamento' : ''}</span></div>` +
    `<span class="acoes-item"><button data-e="1" title="Editar">${ico('i-edit')}</button><button data-x="1" title="Excluir">${ico('i-x')}</button></span></li>`).join('')
    || '<li class="vazio-lista">Nenhum membro cadastrado.</li>';
  $('contMembros').textContent = `${membros.length} cadastrado(s)`;
}
let mbFoto = null;
function mostrarFotoMembro() {
  const f = $('mbFoto');
  f.style.backgroundImage = mbFoto ? `url('${String(mbFoto).replace(/'/g, '%27')}')` : 'none';
  f.textContent = mbFoto ? '' : ($('mbNome').value.trim().charAt(0).toUpperCase() || '+');
  $('mbTirarFoto').hidden = !mbFoto;
  $('mbEscolherFoto').textContent = mbFoto ? 'Trocar foto…' : 'Escolher foto…';
}
function limparFormMembro() {
  mbEdit = null; mbFoto = null; $('mbNome').value = ''; $('mbData').value = ''; $('mbCasal').checked = false;
  $('tituloFormMembro').textContent = 'Adicionar membro'; $('mbCancelar').hidden = true;
  mostrarFotoMembro();
}
function editarMembro(m) {
  mbEdit = m; mbFoto = m.foto || null; $('mbNome').value = m.nome; $('mbData').value = `${String(m.dia).padStart(2, '0')}/${String(m.mes).padStart(2, '0')}`; $('mbCasal').checked = !!m.casal;
  $('tituloFormMembro').textContent = 'Editar membro'; $('mbCancelar').hidden = false; mostrarFotoMembro(); $('mbNome').focus();
}
const escolherFotoMembro = async () => { const u = await api.fotoMembro(); if (u) { mbFoto = u; mostrarFotoMembro(); } };
$('mbEscolherFoto').onclick = escolherFotoMembro;
$('mbFoto').onclick = escolherFotoMembro;
$('mbTirarFoto').onclick = () => { mbFoto = null; mostrarFotoMembro(); };
$('mbNome').addEventListener('input', () => { if (!mbFoto) mostrarFotoMembro(); });
$('listaAniv').addEventListener('click', e => {
  const li = e.target.closest('li[data-id]'); if (!li) return;
  const m = membros.find(x => x.id === li.dataset.id); if (!m) return;
  renderMembros(); $('dlgMembros').showModal(); editarMembro(m);
});
$('btnMembros').onclick = () => { limparFormMembro(); renderMembros(); $('dlgMembros').showModal(); };
$('membrosFechar').onclick = () => { $('dlgMembros').close(); renderIgreja(); };
$('buscaMembro').addEventListener('input', renderMembros);
$('mbCancelar').onclick = limparFormMembro;
$('formMembro').addEventListener('submit', async e => {
  e.preventDefault();
  const nome = $('mbNome').value.trim();
  const d = /^(\d{1,2})\s*\/\s*(\d{1,2})/.exec($('mbData').value.trim());
  if (!nome || !d || +d[1] < 1 || +d[1] > 31 || +d[2] < 1 || +d[2] > 12) { toast('Informe o nome e a data no formato dia/mês (ex.: 15/03)'); return; }
  await api.salvarMembro(Object.assign({}, mbEdit || {}, { nome, dia: +d[1], mes: +d[2], casal: $('mbCasal').checked, foto: mbFoto }));
  toast(mbEdit ? 'Membro atualizado' : 'Membro adicionado');
  membros = await api.listarMembros(); limparFormMembro(); renderMembros(); renderIgreja(); $('mbNome').focus();
});
$('listaMembros').addEventListener('click', async e => {
  const li = e.target.closest('li[data-id]'); if (!li) return;
  const m = membros.find(x => x.id === li.dataset.id);
  if (e.target.closest('button[data-x]')) {
    if (!confirm(`Excluir "${m.nome}"?`)) return;
    await api.excluirMembro(m.id); membros = await api.listarMembros(); renderMembros(); renderIgreja();
  } else editarMembro(m);
});
$('btnImportarMembros').onclick = async () => {
  const r = await api.importarMembros();
  if (!r.importados && !r.ignorados) return;
  membros = await api.listarMembros(); renderMembros(); renderIgreja();
  toast(`${r.importados} membro(s) importado(s)` + (r.ignorados ? ` · ${r.ignorados} linha(s) ignorada(s)` : ''));
};

// ---------------- rotativo: "Projetar avisos" ----------------
const rot = { ativo: false, pausado: false, slides: [], i: 0, restante: 0, timer: null };
function montarRotativo() {
  const S = [];
  if ($('rotAniv').checked) {
    const a = IG.aniversariantesDaSemana(membros);
    for (let i = 0; i < a.length; i += 4)
      S.push({ tipo: 'painel', nome: 'Aniversariantes da semana', painel: { tipo: 'aniv', itens: a.slice(i, i + 4).map(x => ({ m: x.m, diff: x.diff, data: IG.iso(x.data) })), pagina: i / 4 + 1, total: Math.ceil(a.length / 4) } });
  }
  if ($('rotVisit').checked) {
    const v = IG.visitantesDoDia(visitantes);
    for (let i = 0; i < v.length; i += 6)
      S.push({ tipo: 'painel', nome: 'Boas-vindas aos visitantes', painel: { tipo: 'visit', itens: v.slice(i, i + 6), pagina: i / 6 + 1, total: Math.ceil(v.length / 6), quantos: IG.totalPessoas(v) } });
  }
  if ($('rotAvisos').checked) avisos.filter(avisoVigente).forEach(a => S.push({ tipo: 'cartaz', nome: 'Aviso: ' + String(a.titulo).replace(/\n/g, ' '), aviso: a }));
  if ($('rotBanners').checked) banners.filter(bannerNoTelao).forEach(b => S.push({ tipo: 'imagem', nome: 'Banner: ' + (b.titulo || b.nome.replace(/\.[^.]+$/, '')), src: b.url }));
  return S;
}
function rotMostrar() {
  const s = rot.slides[rot.i];
  aplicarSlide(s);
  rot.restante = Math.max(3, +$('rotSeg').value || 8);
  definirASeguir();
  enviar();
}
function rotPasso(d) {
  if (!rot.slides.length) return;
  rot.i += d;
  if (rot.i >= rot.slides.length || rot.i < 0) {          // volta ao início e atualiza a lista (novos visitantes etc.)
    rot.slides = montarRotativo();
    if (!rot.slides.length) { pararRotativo(); return; }
    rot.i = d > 0 ? 0 : rot.slides.length - 1;
  }
  rotMostrar();
}
function iniciarRotativo() {
  rot.slides = montarRotativo();
  if (!rot.slides.length) { toast('Nada para mostrar: cadastre avisos, banners, membros ou visitantes'); return; }
  vivo = { chave: null, i: -1 }; marcarSlides();
  Object.assign(rot, { ativo: true, pausado: false, i: 0 });
  rotMostrar();
  clearInterval(rot.timer);
  rot.timer = setInterval(() => {
    if (!rot.ativo || rot.pausado || estado.modo === 'preto') { atualizarRodape(); return; }
    if (--rot.restante <= 0) rotPasso(1); else atualizarRodape();
  }, 1000);
  atualizarBotaoRot();
}
function pararRotativo(semLogo) {
  rot.ativo = false; clearInterval(rot.timer);
  if (!semLogo) { Object.assign(estado, { modo: 'limpo', painel: null, cartaz: null, img: '' }); enviar(); }
  atualizarBotaoRot(); atualizarRodape();
}
function atualizarBotaoRot() {
  $('btnRotativo').classList.toggle('parar', rot.ativo);
  $('btnRotativo').querySelector('span').textContent = rot.ativo ? 'Parar' : 'Projetar avisos';
  $('btnRotativo').querySelector('use').setAttribute('href', rot.ativo ? '#i-stop' : '#i-play');
  $('btnRotPausar').hidden = !rot.ativo;
  $('btnRotPausar').querySelector('use').setAttribute('href', rot.pausado ? '#i-play' : '#i-pause');
  $('btnRotPausar').title = rot.pausado ? 'Continuar' : 'Pausar';
  $('cartaoRot').classList.toggle('ativo', rot.ativo);
  if (!rot.ativo) $('rotInfo').textContent = 'Aniversariantes, visitantes, avisos e banners passando sozinhos.';
}
$('btnRotativo').onclick = () => rot.ativo ? pararRotativo() : iniciarRotativo();
function definirASeguir() {
  const n = rot.slides.length;
  estado.aSeguir = n > 1 ? { nome: resumo(rot.slides[(rot.i + 1) % n]), trocaEm: rot.pausado ? null : Date.now() + rot.restante * 1000 } : null;
}
$('btnRotPausar').onclick = () => pausarRotativo();
$('rotSeg').onchange = () => { config.rotSeg = Math.max(3, +$('rotSeg').value || 8); api.salvarConfig(config); };

// ---------------- faixa de miniaturas embaixo (estilo Holyrics) ----------------
function resumo(s) {
  if (!s) return '—';
  if (s.nome) return s.nome;
  if (s.tipo === 'imagem') return '[imagem]';
  if (s.tipo === 'cartaz') return 'Aviso: ' + String(s.aviso.titulo || '').replace(/\n/g, ' ');
  if (s.tipo === 'painel') return s.painel.tipo === 'aniv' ? 'Aniversariantes da semana' : 'Boas-vindas aos visitantes';
  return (s.v ? s.v + '  ' : '') + s.texto;
}
const slidesDaTira = () => rot.ativo ? rot.slides : (atual ? atual.slides : []);
function htmlMini(s, i) {
  let corpo;
  if (s.tipo === 'imagem') corpo = `<div class="mi" style="background-image:url('${String(s.src).replace(/'/g, '%27')}')"></div>`;
  else if (s.tipo === 'cartaz') corpo = htmlAviso(s.aviso);
  else if (s.tipo === 'painel') corpo = htmlPainel(s.painel, config.logoImg);
  else corpo = `<div class="mf"></div><div class="mt" style="color:${config.corTexto};text-shadow:${sombraTexto(config.corTexto)};text-transform:${config.maiusculas ? 'uppercase' : 'none'}"><span>${esc(s.texto)}</span></div>`;
  return `<div class="mini" data-i="${i}" title="${esc(resumo(s))}">${corpo}<span class="nr">${i + 1}</span></div>`;
}
let tiraChave = null;
function renderTira() {
  const lista = slidesDaTira(), box = $('tiraSlides');
  tiraChave = rot.ativo ? 'rot:' + rot.slides.length : chaveItem(atual);
  if (!lista.length) { box.innerHTML = '<span class="tira-vazia">Os slides aparecem aqui. Clique para projetar.</span>'; marcarTira(); return; }
  box.innerHTML = lista.map(htmlMini).join('');
  box.querySelectorAll('.mini').forEach(m => {
    const f = m.querySelector('.mf'); if (f) aplicarFundo(f, config);
    const t = m.querySelector('.mt'); if (t) ajustarFonte(t.firstElementChild, m, Math.max(6, Math.round(config.fonte * m.clientWidth / 1920)), 0.86);
  });
  marcarTira();
}
function marcarTira() {
  let vivoI = -1, selI = -1;
  if (rot.ativo) vivoI = rot.i;
  else if (atual) { if (vivo.chave === chaveItem(atual)) vivoI = vivo.i; selI = sel; }
  document.querySelectorAll('#tiraSlides .mini').forEach((m, j) => { m.classList.toggle('vivo', j === vivoI); m.classList.toggle('sel', j === selI && j !== vivoI); });
  const alvo = document.querySelector('#tiraSlides .mini.vivo') || document.querySelector('#tiraSlides .mini.sel');
  if (alvo) { const box = $('tiraSlides'); const x = alvo.offsetLeft - box.clientWidth / 2 + alvo.clientWidth / 2; box.scrollTo({ left: Math.max(0, x) }); }
}
$('tiraSlides').addEventListener('click', e => {
  const m = e.target.closest('.mini'); if (!m) return;
  const i = +m.dataset.i;
  if (rot.ativo) { rot.i = i; rotMostrar(); } else projetar(i);
});
function atualizarRodape() {
  const cont = document.querySelector('#preview [data-contagem]');
  if (cont && rot.ativo && estado.aSeguir) cont.textContent = rot.pausado ? 'A SEGUIR' : 'A SEGUIR • EM ' + String(rot.restante).padStart(2, '0') + 'S';
  const chaveAgora = rot.ativo ? 'rot:' + rot.slides.length : chaveItem(atual);
  if (chaveAgora !== tiraChave) renderTira(); else marcarTira();
  let rotulo = 'No telão', txt = '—';
  const lista = slidesDaTira();
  const modos = { preto: 'Tela preta', logo: 'Logo da igreja', limpo: telaoAberto ? 'Só o fundo' : 'Telão fechado' };
  if (rot.ativo) {
    rotulo = rot.pausado ? 'Avisos · pausado' : `Avisos · ${rot.i + 1}/${rot.slides.length} · ${rot.restante}s`;
    txt = resumo(rot.slides[rot.i]);
    $('rotInfo').textContent = rot.pausado ? 'Pausado. Use Próximo/Anterior ou continue.' : `Mostrando ${rot.i + 1} de ${rot.slides.length} · próximo em ${rot.restante}s`;
  } else if (modos[estado.modo]) txt = modos[estado.modo];
  else if (atual && vivo.chave === chaveItem(atual)) { rotulo = `No telão · ${vivo.i + 1}/${atual.slides.length}`; txt = resumo(atual.slides[vivo.i]); }
  else if (estado.modo === 'texto') txt = estado.texto;
  $('navVivoRot').textContent = rotulo; $('navVivoTxt').textContent = txt;
  const base = rot.ativo ? rot.i : (atual && vivo.chave === chaveItem(atual) ? vivo.i : sel);
  $('navAnt').disabled = !lista.length || (!rot.ativo && base <= 0);
  $('navProx').disabled = !lista.length || (!rot.ativo && base >= lista.length - 1);
  // a faixa de slides embaixo só aparece enquanto algo está sendo projetado
  const projetando = rot.ativo || ['texto', 'imagem', 'cartaz', 'painel', 'preto'].includes(estado.modo);
  const tira = document.querySelector('footer.tira');
  if (tira.hidden === projetando) {
    tira.hidden = !projetando; window.dispatchEvent(new Event('resize'));
    if (projetando) requestAnimationFrame(() => renderTira());   // mede as miniaturas só com a faixa visível
  }
}
$('navAnt').onclick = anterior;
$('navProx').onclick = proximo;

// ---------------- imagens (banners) ----------------
async function carregarImagens() {
  banners = await api.listarImagens('banners');
  const p = await api.pastaBanners();
  if (infoNuvem.ativo) { $('pastaBanners').textContent = 'Banners da mídia online (internet) · cópia neste computador'; $('btnPastaBanners').hidden = true; }
  else { $('pastaBanners').textContent = p.personalizada ? `Pasta: ${p.atual} ·` : 'Pasta padrão do programa ·'; $('btnPastaBanners').hidden = false; }
  $('btnPastaBanners').textContent = p.personalizada ? 'usar pasta padrão' : 'usar outra pasta (OneDrive/Drive)';
  $('btnPastaBanners').dataset.p = p.personalizada ? '1' : '';
  const k = chaveItem(atual);
  $('gradeImagens').innerHTML = banners.map(b =>
    `<div class="im ${k === 'imagem:' + b.nome ? 'sel' : ''}" data-nome="${esc(b.nome)}" title="${esc(b.titulo || b.nome)}" style="background-image:url('${esc(b.url)}')">` +
    `${botoesVis('banner', b.nome, b)}<span class="tit">${esc(b.titulo || b.nome.replace(/\.[^.]+$/, ''))}</span><button data-e="1" class="ed" title="Título, descrição, datas e telão">${ico('i-edit')}</button><button data-x="1" title="Excluir">${ico('i-x')}</button></div>`).join('')
    || '<p class="sub" style="grid-column:1/-1">Nenhuma imagem. Clique em “+ Adicionar imagens”.</p>';
}
$('gradeImagens').addEventListener('click', async e => {
  const d = e.target.closest('.im'); if (!d) return;
  if (e.target.closest('.vis-bts')) { await cliqueVis(e); return; }
  if (e.target.closest('button[data-x]')) {
    if (!confirm('Excluir esta imagem do computador?')) return;
    await api.excluirImagem('banners', d.dataset.nome); await carregarImagens(); return;
  }
  if (e.target.closest('button[data-e]')) { const b = banners.find(x => x.nome === d.dataset.nome); abrir(itemImagem(b)); abrirBanner(b); return; }
  abrir(itemImagem(banners.find(b => b.nome === d.dataset.nome)));
});
$('gradeImagens').addEventListener('dblclick', e => { if (e.target.closest('.im')) projetar(0); });
$('btnAddImg').onclick = () => abrirBannerNovo();   // janela "Novo banner": arrastar ou escolher a imagem
$('btnPastaBanners').onclick = async e => {
  e.preventDefault();
  if (e.target.dataset.p) await api.pastaBannersPadrao();
  else if (!(await api.escolherPastaBanners())) return;
  await carregarImagens();
};
api.onBannersMudou(() => { carregarImagens(); if (Date.now() > silenciarDados) toast('Pasta de banners atualizada'); });

// ---------------- texto livre ----------------
$('btnTextoRapido').onclick = () => { $('dlgTexto').showModal(); $('textoLivre').focus(); };
$('txtCancelar').onclick = () => $('dlgTexto').close();
$('btnTextoLivre').onclick = () => {
  const t = $('textoLivre').value.trim();
  if (!t) { $('textoLivre').focus(); return; }
  $('dlgTexto').close();
  abrir(itemTexto(t));
};

// ---------------- lista do culto ----------------
function resolverItem(it) {
  if (it.tipo === 'musica') { const m = musicas.find(x => x.id === it.ref); return m ? itemMusica(m) : null; }
  if (it.tipo === 'aviso') { const a = avisos.find(x => x.id === it.ref); return a ? itemAviso(a) : null; }
  if (it.tipo === 'imagem') { const b = banners.find(x => x.nome === it.ref); return b ? itemImagem(b) : null; }
  if (it.tipo === 'texto') return itemTexto(it.ref);
  if (it.tipo === 'biblia') {
    if (!biblia) return null;
    const [li, cap, faixa] = it.ref.split('|');
    const item = itemCapitulo(+li, +cap);
    if (item && faixa) {
      const [a, b] = faixa.split('-').map(Number);
      item.slides = item.slides.filter(s => s.v >= a && s.v <= b);
      item.titulo = it.titulo;
    }
    if (item) item.ref = it.ref;   // mantém a mesma chave mesmo trocando de versão
    return item;
  }
  return null;
}
function adicionarAoCulto(item) {
  if (!item) return;
  culto.lista.push({ tipo: item.tipo, ref: item.ref, titulo: item.titulo });
  salvarCulto(); renderCulto(); toast('Adicionado à lista do culto');
}
function salvarCulto() { clearTimeout(salvarCulto.h); salvarCulto.h = setTimeout(() => api.salvarCulto(culto), 300); }
function renderCulto() {
  const icones = { musica: 'i-music', aviso: 'i-bell', imagem: 'i-img', texto: 'i-text', biblia: 'i-book' };
  const k = chaveItem(atual);
  $('listaCulto').innerHTML = culto.lista.map((it, i) => {
    const ok = !!resolverItem(it);
    return `<li data-i="${i}" class="${k === it.tipo + ':' + it.ref ? 'sel' : ''}" style="${ok ? '' : 'opacity:.5'}">` +
      `<span class="ico">${ico(icones[it.tipo] || 'i-text')}</span><div class="txt"><b>${esc(it.titulo)}</b>${ok ? '' : '<span class="s">não encontrado</span>'}</div>` +
      `<span class="acoes-item"><button data-m="-1" title="Subir">${ico('i-up')}</button><button data-m="1" title="Descer">${ico('i-down')}</button><button data-r="1" title="Remover">${ico('i-x')}</button></span></li>`;
  }).join('') || '<li class="vazio-lista">Monte a ordem do culto:<br>abra uma letra, hino, capítulo ou aviso e clique no ícone ' + ico('i-add') + ' acima dos slides.</li>';
}
$('listaCulto').addEventListener('click', e => {
  const li = e.target.closest('li[data-i]'); if (!li) return;
  const i = +li.dataset.i, b = e.target.closest('button');
  if (b && b.dataset.r) { culto.lista.splice(i, 1); salvarCulto(); renderCulto(); return; }
  if (b && b.dataset.m) {
    const j = i + +b.dataset.m; if (j < 0 || j >= culto.lista.length) return;
    [culto.lista[i], culto.lista[j]] = [culto.lista[j], culto.lista[i]]; salvarCulto(); renderCulto(); return;
  }
  const item = resolverItem(culto.lista[i]);
  if (item) abrir(item); else toast('Item não encontrado (foi excluído?)');
});
$('btnCultoLimpar').onclick = () => { if (culto.lista.length && confirm('Limpar a lista do culto?')) { culto.lista = []; salvarCulto(); renderCulto(); } };
$('anotacoes').addEventListener('input', e => { culto.anotacoes = e.target.value; salvarCulto(); });

function renderListas() { renderLetras(); renderHinos(); renderAvisos(); renderCulto(); marcarImagens(); }
function marcarImagens() {
  const k = chaveItem(atual);
  document.querySelectorAll('#gradeImagens .im').forEach(d => d.classList.toggle('sel', k === 'imagem:' + d.dataset.nome));
}

// ---------------- editor de letras + corretor ----------------
let editandoId = null, pilhaDesfazer = [], pendente = null;
function abrirEditor(m, padrao) {
  editandoId = m ? m.id : null;
  const d = m || padrao || {};
  $('editorTitulo').textContent = m ? 'Editar' : d.hinario ? 'Novo hino' : 'Nova letra';
  $('edTitulo').value = d.titulo || '';
  $('edArtista').value = d.artista || '';
  $('edHinario').value = d.hinario || '';
  $('edNumero').value = d.numero || '';
  $('edLetra').value = d.letra || '';
  pilhaDesfazer = []; $('btnDesfazer').disabled = true;
  atualizarPrevia();
  $('editor').showModal();
  (m ? $('edLetra') : $('edTitulo')).focus();
}
function atualizarPrevia() {
  const s = T.gerarSlides($('edLetra').value);
  $('edContagem').textContent = `(${s.length})`;
  $('edPrevia').innerHTML = s.map((x, i) => `<div class="slide"><span class="num">${i + 1}</span>${esc(x)}</div>`).join('')
    || '<p class="sub" style="padding:12px">Os slides aparecem aqui conforme você digita.</p>';
}
$('edLetra').addEventListener('input', atualizarPrevia);
$('btnNova').onclick = () => abrirEditor(null);
$('btnCancelar').onclick = () => $('editor').close();
$('formEditor').addEventListener('submit', async e => {
  e.preventDefault();
  if (!$('edTitulo').value.trim()) { $('edTitulo').focus(); return; }
  const salvo = await api.salvar({
    id: editandoId, titulo: $('edTitulo').value, artista: $('edArtista').value,
    hinario: $('edHinario').value, numero: $('edNumero').value, letra: $('edLetra').value
  });
  $('editor').close();
  await carregarMusicas();
  abrir(itemMusica(musicas.find(m => m.id === salvo.id)));
  toast('Salvo');
});
$('btnCorretor').onclick = () => {
  const antes = $('edLetra').value;
  const depois = T.corrigir(antes, { cifras: $('opCifras').checked, nomes: $('opNomes').checked });
  if (antes.trim() === depois) { toast('Nada a corrigir'); return; }
  pendente = depois;
  const linhasDepois = new Set(depois.split('\n'));
  const linhasAntes = new Set(T.normalizarQuebras(antes).split('\n'));
  let alteradas = 0;
  $('compAntes').innerHTML = T.normalizarQuebras(antes).split('\n').map(l => {
    const mudou = !linhasDepois.has(l) && l.trim(); if (mudou) alteradas++;
    return `<div class="${mudou ? 'rem' : ''}">${esc(l) || '&nbsp;'}</div>`;
  }).join('');
  $('compDepois').innerHTML = depois.split('\n').map(l =>
    `<div class="${!linhasAntes.has(l) && l ? 'mud' : ''}">${esc(l) || '&nbsp;'}</div>`).join('');
  $('compResumo').textContent = `${alteradas} linha(s) serão corrigidas ou removidas. O original pode ser recuperado com “Desfazer”.`;
  $('comparar').showModal();
};
$('btnCompCancelar').onclick = () => $('comparar').close();
$('btnCompAplicar').onclick = () => {
  pilhaDesfazer.push($('edLetra').value);
  $('edLetra').value = pendente;
  $('btnDesfazer').disabled = false;
  atualizarPrevia();
  $('comparar').close();
  toast('Correções aplicadas');
};
$('btnDesfazer').onclick = () => {
  if (!pilhaDesfazer.length) return;
  $('edLetra').value = pilhaDesfazer.pop();
  $('btnDesfazer').disabled = !pilhaDesfazer.length;
  atualizarPrevia();
};

// ---------------- controles do telão ----------------
$('btnPreto').onclick = alternarPreto;
$('btnLimpar').onclick = limpar;
$('bkPasta').onclick = () => api.abrirPasta();
$('btnBackup').onclick = async () => {
  const i = await api.infoBackup();
  $('bkUltimo').textContent = i.ultimo || 'ainda nenhum';
  $('dlgBackup').showModal();
};
$('bkFechar').onclick = () => $('dlgBackup').close();
$('bkAbrir').onclick = () => api.abrirPastaBackups();
$('bkFazer').onclick = async () => {
  const r = await api.fazerBackup();
  if (r.ok) toast('Backup salvo em: ' + r.pasta); else if (r.erro) alert('Não foi possível fazer o backup:\n' + r.erro);
};
$('bkRestaurar').onclick = async () => {
  const r = await api.restaurarBackup();
  if (r.ok) toast('Backup restaurado. Recarregando…'); else if (r.erro) alert(r.erro);
};
$('btnAvisoMostrar').onclick = () => {
  const t = $('avisoTexto').value.trim();
  if (!t) { $('avisoTexto').focus(); return; }
  estado.faixa = t; enviar();
};
$('btnAvisoOcultar').onclick = () => { estado.faixa = ''; enviar(); };
$('avisoTexto').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('btnAvisoMostrar').click(); }
});
document.querySelectorAll('.chip').forEach(c => c.onclick = () => {
  const ta = $('avisoTexto'); ta.value = c.dataset.modelo; ta.focus();
  const i = ta.value.indexOf('____'); if (i >= 0) ta.setSelectionRange(i, i + 4);
});
api.onProjetorStatus(s => {
  telaoAberto = s.aberto;
  renderPreview(Object.assign({}, estado, { config })); atualizarRodape();
  // o telão abre sozinho ao projetar (play, Enter, clique no slide) e fecha no Sair/Esc
  $('statusTelas').innerHTML = `<span class="ponto-telao${s.aberto ? ' no-ar' : ''}"></span>${s.aberto ? 'Telão no ar' : 'Telão fechado'} · ${s.telas > 1 ? s.telas + ' telas' : '1 tela'}`;
});

// ---------------- controle pelo celular ----------------
function enviarRemoto() {
  if (rot.ativo) {
    api.enviarRemoto({ titulo: 'Avisos automáticos', slides: rot.slides.map(resumo), vivo: rot.i, modo: estado.modo, rot: { ativo: true, pausado: !!rot.pausado, restante: rot.restante } });
    return;
  }
  const ehVivo = atual && vivo.chave === chaveItem(atual);
  api.enviarRemoto({
    titulo: atual ? atual.titulo : '',
    slides: atual ? atual.slides.map(s => s.tipo === 'imagem' ? '[imagem]' : s.tipo === 'cartaz' ? '[aviso] ' + (s.aviso.titulo || '') : (s.v ? s.v + '  ' : '') + s.texto) : [],
    vivo: ehVivo ? vivo.i : -1,
    modo: estado.modo
  });
}
api.onRemotoCmd(c => {
  if (c.acao === 'proximo') proximo();
  else if (c.acao === 'anterior') anterior();
  else if (c.acao === 'ir') { if (rot.ativo) { rot.i = Math.min(c.i, rot.slides.length - 1); rotMostrar(); } else projetar(c.i); }
  else if (c.acao === 'limpar') limpar();
  else if (c.acao === 'preto') alternarPreto();
  else if (c.acao === 'sair' || c.acao === 'logo') limpar();
  else if (c.acao === 'rotIniciar') { if (!rot.ativo) iniciarRotativo(); }      // celular: avisos automáticos
  else if (c.acao === 'rotParar') { if (rot.ativo) pararRotativo(); }
  else if (c.acao === 'rotPausar') pausarRotativo();
  else if (c.acao === 'tecla') { if (!document.querySelector('dialog[open]')) teclaTelao(c.ref); }   // tecla apertada na janela do telão
  else if (c.acao === 'abrir') {          // celular escolheu um hino, letra, aviso, imagem ou capítulo
    const item = resolverItem({ tipo: c.tipo, ref: c.ref });
    if (item && item.slides.length) { abrir(item, 0); projetar(0); }
  }
  else if (c.acao === 'referencia') { if (abrirReferencia(c.ref)) projetar(Math.max(0, sel)); }
});
let infoRemoto = { urls: [], pin: '' };
// catálogo para o celular (Controle > Projetar): letras, hinos, Bíblia, avisos, imagens e a lista do culto
let ultimoCatalogo = '';
function publicarCatalogo() {
  const cat = {
    culto: culto.lista.map(it => ({ tipo: it.tipo, ref: it.ref, titulo: it.titulo })),
    musicas: musicas.filter(m => !ehHino(m)).sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR')).map(m => ({ ref: m.id, titulo: m.titulo, sub: m.artista || '' })),
    hinos: musicas.filter(ehHino).sort((a, b) => (a.numero || 9999) - (b.numero || 9999)).map(m => ({ ref: m.id, n: m.numero || null, titulo: m.titulo, sub: m.hinario })),
    avisos: avisos.map(a => ({ ref: a.id, titulo: (a.titulo || 'Aviso').replace(/\n/g, ' '), sub: (a.texto || '').split('\n')[0] })),
    imagens: banners.map(b => ({ ref: b.nome, titulo: b.titulo || b.nome.replace(/\.[^.]+$/, ''), sub: b.descricao || '' })),
    biblia: biblia ? { nome: biblia.nome, livros: B.LIVROS.map(l => ({ nome: l.nome, abrev: l.abrev, ap: l.apelidos, caps: (biblia.livros[l.i] || []).length, vers: (biblia.livros[l.i] || []).map(c => (c || []).length) })) } : null
  };
  const j = JSON.stringify(cat);
  if (j !== ultimoCatalogo) { ultimoCatalogo = j; api.enviarCatalogo(cat); }
}
setInterval(() => { try { publicarCatalogo(); } catch (_) {} }, 3000);
api.onRemotoInfo(i => { infoRemoto = i; });
function mostrarAcessos(a) {
  document.querySelectorAll('#dlgRemoto [data-pin]').forEach(td => { td.textContent = a.acessos[td.dataset.pin] || '----'; });
}
$('chkPin').onchange = async e => { await api.exigirPin(e.target.checked); $('tabelaPins').hidden = !e.target.checked; toast(e.target.checked ? 'Celular vai pedir PIN' : 'Celular sem PIN: é só escolher a função'); };
$('btnRemoto').onclick = async () => {
  const a = await api.obterAcessos();
  $('remotoUrls').innerHTML = a.urls.length ? a.urls.map((u, i) => `<div class="url-op${i === 0 ? ' on' : ''}" data-url="${esc(u)}">${esc(u)}</div>`).join('') : 'Sem rede detectada no computador';
  mostrarQR(a.urls[0]);
  mostrarAcessos(a);
  $('chkPin').checked = !!a.exigirPin; $('tabelaPins').hidden = !a.exigirPin;
  $('dlgRemoto').showModal();
};
function mostrarQR(url) {
  const caixa = $('qrRemoto');
  try { caixa.innerHTML = url ? QR.svg(url) : '<p class="sub">Sem rede</p>'; }
  catch (e) { caixa.innerHTML = '<p class="sub">Não consegui gerar o QR</p>'; }
}
$('dlgRemoto').addEventListener('click', async e => {
  const op = e.target.closest('.url-op');
  if (op) { document.querySelectorAll('#remotoUrls .url-op').forEach(x => x.classList.toggle('on', x === op)); mostrarQR(op.dataset.url); return; }
  const b = e.target.closest('[data-novo]'); if (!b) return;
  if (!confirm('Gerar um novo PIN? Quem usa o PIN atual vai precisar do novo.')) return;
  mostrarAcessos({ acessos: await api.novoPin(b.dataset.novo) });
});
// mudanças feitas pelo celular aparecem na hora
api.onDadosMudou(async tipo => {
  if (tipo === 'visitantes') { await carregarIgreja(); toast('Novo registro da recepção'); }
  const meu = Date.now() < silenciarDados;   // mudança feita aqui mesmo: sem aviso de "mídia"
  if (tipo === 'avisos') { await carregarAvisos(); if (!meu) toast('Avisos atualizados pela mídia'); }
  if (tipo === 'banners') { await carregarImagens(); if (!meu) toast('Banners atualizados pela mídia'); }
});
$('remotoFechar').onclick = () => $('dlgRemoto').close();

// ---------------- temas e exibição ----------------
async function salvarConfig() { await api.salvarConfig(config); enviar(); renderTemas(); renderTira(); }
async function renderTemas() {
  fundos = await api.listarImagens('fundos');
  $('temas').innerHTML = TEMAS.map((t, i) => {
    const on = !config.fundoImg && config.fundoCss === t.css && config.fundoCor === t.cor;
    return `<div class="tema ${on ? 'on' : ''}" data-t="${i}" title="${t.nome}" style="background:${t.css ? t.css + ',' + t.cor : t.cor};color:${t.texto}">Texto da<br>música</div>`;
  }).join('') + fundos.map(f =>
    `<div class="tema ${config.fundoImg === f.url ? 'on' : ''}" data-f="${esc(f.nome)}" title="${esc(f.nome)}" style="background-image:url('${esc(f.url)}');color:#fff">Texto da<br>música<button title="Remover">${ico('i-x')}</button></div>`).join('');
}
$('temas').addEventListener('click', async e => {
  const d = e.target.closest('.tema'); if (!d) return;
  if (d.dataset.t != null) {
    const t = TEMAS[+d.dataset.t];
    Object.assign(config, { fundoCss: t.css, fundoCor: t.cor, fundoImg: null, corTexto: t.texto });
  } else {
    const f = fundos.find(x => x.nome === d.dataset.f);
    if (e.target.closest('button')) {
      if (!confirm('Remover este fundo?')) return;
      if (config.fundoImg === f.url) config.fundoImg = null;
      await api.excluirImagem('fundos', f.nome);
    } else { config.fundoImg = f.url; config.corTexto = '#ffffff'; }
  }
  preencherConfig(); salvarConfig();
});
$('btnAddFundo').onclick = async () => { if ((await api.adicionarImagens('fundos')).length) renderTemas(); };

function preencherConfig() {
  $('cfgFundoCor').value = config.fundoCor;
  $('cfgCorTexto').value = config.corTexto;
  $('cfgFonte').value = config.fonte; $('cfgFonteVal').textContent = config.fonte;
  $('cfgMaiusculas').checked = !!config.maiusculas;
}
$('btnConfigExib').onclick = () => { preencherConfig(); $('dlgExib').showModal(); };
$('btnExibFechar').onclick = () => $('dlgExib').close();
$('cfgFundoCor').oninput = e => { config.fundoCor = e.target.value; config.fundoCss = null; config.fundoImg = null; enviar(); };
$('cfgFundoCor').onchange = salvarConfig;
$('cfgCorTexto').oninput = e => { config.corTexto = e.target.value; enviar(); };
$('cfgCorTexto').onchange = salvarConfig;
$('cfgFonte').oninput = e => { config.fonte = +e.target.value; $('cfgFonteVal').textContent = config.fonte; enviar(); };
$('cfgFonte').onchange = salvarConfig;
$('cfgMaiusculas').onchange = e => { config.maiusculas = e.target.checked; salvarConfig(); };
$('btnLogoImg').onclick = async () => { const u = await api.escolherImagem('geral'); if (u) { config.logoImg = u; salvarConfig(); } };
$('btnLogoPadrao').onclick = () => { config.logoImg = null; salvarConfig(); };

// ---------------- teclado (inclui passador de slides: PageUp/PageDown) ----------------
document.addEventListener('keydown', e => {
  const ctrl = e.ctrlKey || e.metaKey, k = e.key;
  if (ctrl && k.toLowerCase() === 'f') { e.preventDefault(); irParaAba('letras'); $('busca').focus(); $('busca').select(); return; }
  if (ctrl && k.toLowerCase() === 'b') { e.preventDefault(); irParaAba('biblia'); $('buscaRef').focus(); $('buscaRef').select(); return; }
  if (ctrl && k.toLowerCase() === 'i') { e.preventDefault(); abrirInternet(); return; }
  if (ctrl && k.toLowerCase() === 'h') { e.preventDefault(); irParaAba('hinos'); $('buscaHino').focus(); $('buscaHino').select(); return; }
  if (document.querySelector('dialog[open]')) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    if (k === 'Escape') document.activeElement.blur();
    // caixas de número/marcar não "comem" o Espaço durante os avisos automáticos
    const t = document.activeElement.type;
    if (!(k === ' ' && rot.ativo && (t === 'number' || t === 'checkbox'))) return;
  }
  if (k === ' ' && tag === 'BUTTON') document.activeElement.blur();   // evita o Espaço "clicar" no último botão
  if (k === 'Enter' && tag === 'BUTTON') return;                      // Enter num botão = clicar nele
  if (teclaTelao(k)) e.preventDefault();
});
// teclas de controle do telão (usadas aqui e também quando a janela do telão está em foco)
function teclaTelao(k) {
  // Espaço: pausa/continua os avisos automáticos; fora deles, avança o slide
  if (k === ' ' && rot.ativo) { pausarRotativo(); return true; }
  if (['ArrowDown', 'ArrowRight', 'PageDown', ' '].includes(k)) { proximo(); return true; }
  if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(k)) { anterior(); return true; }
  if (k === 'Enter') { projetar(sel >= 0 ? sel : 0); return true; }
  if (k === 'Escape') { limpar(); return true; }
  if (k === 'F2') { $('tbEditar').click(); return true; }
  if (k.toLowerCase() === 'b' || k === '.') { alternarPreto(); return true; }
  if (/^[1-9]$/.test(k)) { projetar(+k - 1); return true; }
  return false;
}
function pausarRotativo() {
  if (!rot.ativo) return;
  rot.pausado = !rot.pausado; definirASeguir(); enviar(); atualizarBotaoRot();
  toast(rot.pausado ? 'Avisos automáticos PAUSADOS · Espaço continua' : 'Avisos automáticos continuando');
}
window.addEventListener('resize', () => renderPreview(Object.assign({}, estado, { config })));

// ---------------- atualização do programa ----------------
let atu = { fase: 'parado' };
function mostrarAtualizacao(e) {
  atu = e || atu;
  const b = $('btnAtualizar');
  b.hidden = atu.fase !== 'pronto';
  if (atu.fase === 'pronto') b.querySelector('span').textContent = `Atualizar para ${atu.versaoNova}`;
  const txt = {
    'sem-repo': 'Atualização automática indisponível nesta cópia (instale pelo instalador do GitHub).',
    parado: 'Procura atualização sozinho ao abrir e a cada 3 horas.',
    verificando: 'Procurando atualização…',
    atualizado: 'Você está na versão mais nova.',
    baixando: `Baixando a versão ${atu.versaoNova}… ${atu.progresso || 0}%`,
    pronto: `Versão ${atu.versaoNova} baixada. Clique em “Atualizar” no topo.`,
    erro: atu.erro || 'Não foi possível verificar agora.'
  }[atu.fase] || '';
  $('atuInfo').textContent = `Instalada: ${atu.versaoAtual || '—'} · ${txt}`;
  $('atuVerificar').disabled = ['verificando', 'baixando'].includes(atu.fase) || atu.fase === 'sem-repo';
}
api.onAtualizacao(e => {
  const antes = atu.fase; mostrarAtualizacao(e);
  if (e.fase === 'pronto' && antes !== 'pronto') toast(`Nova versão ${e.versaoNova} pronta: clique em “Atualizar” quando puder`);
});
$('atuVerificar').onclick = async () => { mostrarAtualizacao(Object.assign({}, atu, { fase: 'verificando' })); mostrarAtualizacao(await api.verificarAtualizacao()); };
$('btnAtualizar').onclick = async () => {
  if (!confirm(`Atualizar para a versão ${atu.versaoNova}?\n\nO programa vai fechar, instalar a nova versão e abrir de novo sozinho (leva uns 30 segundos).\nSeus dados (letras, membros, avisos...) continuam.`)) return;
  if (!(await api.instalarAtualizacao())) toast('Não consegui iniciar a atualização. Tente “Procurar atualização” no Backup.');
};
api.onAtualizacaoFeita(r => {
  if (r.ok) toast(`Programa atualizado para a versão ${r.atual} ✓`);
  else if (confirm(`A atualização automática para a versão ${r.para} não foi instalada (continua na ${r.atual}).\n\n` +
    `Quer abrir o instalador agora? É só clicar em Avançar/Instalar; o programa fecha e os seus dados continuam.\n\n` +
    (r.log ? 'Detalhes (atualizacao.log em Documentos\\ProjecaoADMadureira):\n' + r.log : ''))) {
    api.instalarAtualizacaoManual().then(ok => { if (!ok) alert('Não encontrei o instalador baixado. Clique em Backup > Procurar atualização, ou baixe em Releases no GitHub.'); });
  }
});
api.estadoAtualizacao().then(e => { mostrarAtualizacao(e); if (e && e.versaoAtual) $('versaoApp').textContent = 'v' + e.versaoAtual; }).catch(() => {});

// ---------------- mídia online (nuvem) ----------------
let infoNuvem = { ativo: false, status: {} };
const horaCurta = t => t ? new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
function mostrarStatusNuvem() {
  const st = infoNuvem.status || {};
  $('pontoNuvem').className = 'ponto-nuvem' + (infoNuvem.ativo ? (st.ok ? ' ok' : ' erro') : '');
  $('btnNuvem').title = !infoNuvem.ativo ? 'Mídia online desligada' : st.ok ? 'Mídia online: sincronizado ' + horaCurta(st.quando) : (st.erro || 'Conectando…');
  const e = $('nuvemEstado');
  e.className = 'estado-nuvem' + (infoNuvem.ativo ? (st.ok ? ' ok' : ' erro') : '');
  e.textContent = !infoNuvem.ativo ? 'Desligada: avisos e banners ficam só neste computador.'
    : st.ok ? `Ligada · sincronizado em ${horaCurta(st.quando)} · atualiza a cada minuto` : (st.erro || 'Conectando…') + (st.quando ? ` (cópia de ${horaCurta(st.quando)})` : '');
  $('nvDesligar').hidden = $('nvSync').hidden = $('nvEnviar').hidden = !infoNuvem.ativo;
}
async function carregarNuvem() { infoNuvem = await api.nuvemObter(); mostrarStatusNuvem(); }
api.onNuvemStatus(st => { infoNuvem.status = st; mostrarStatusNuvem(); });
$('btnNuvem').onclick = async () => {
  await carregarNuvem();
  $('nvUrl').value = infoNuvem.url; $('nvChave').value = infoNuvem.chave; $('nvEmail').value = infoNuvem.email; $('nvSenha').value = '';
  $('nvErro').textContent = ''; $('dlgNuvem').showModal();
};
$('nvFechar').onclick = () => $('dlgNuvem').close();
$('formNuvem').addEventListener('submit', async e => {
  e.preventDefault();
  const d = { url: $('nvUrl').value.trim(), chave: $('nvChave').value.trim(), email: $('nvEmail').value.trim(), senha: $('nvSenha').value };
  if (!d.url || !d.chave || !d.email || !d.senha) { $('nvErro').textContent = 'Preencha os quatro campos (a senha é pedida de novo por segurança).'; return; }
  $('nvErro').textContent = 'Conectando…'; $('nvConectar').disabled = true;
  const r = await api.nuvemConectar(d);
  $('nvConectar').disabled = false;
  if (!r.ok) { $('nvErro').textContent = r.erro; return; }
  $('nvErro').textContent = ''; await carregarNuvem();
  await carregarAvisos(); await carregarImagens();
  toast('Mídia online ligada!');
});
$('nvSync').onclick = async () => { $('nvSync').disabled = true; infoNuvem.status = await api.nuvemSincronizar(); $('nvSync').disabled = false; mostrarStatusNuvem(); };
$('nvEnviar').onclick = async () => {
  if (!confirm('Enviar para a nuvem os avisos e banners que estão salvos neste computador?')) return;
  $('nvEnviar').disabled = true; toast('Enviando… pode levar alguns minutos.');
  const r = await api.nuvemEnviarLocais(); $('nvEnviar').disabled = false;
  if (r.ok) toast(`Enviados: ${r.avisos} aviso(s) e ${r.banners} banner(s)`); else alert('Parou no meio: ' + r.erro + `\nJá enviados: ${r.avisos} aviso(s) e ${r.banners} banner(s).`);
  await carregarAvisos(); await carregarImagens();
};
$('nvDesligar').onclick = async () => {
  if (!confirm('Desligar a mídia online? Os avisos e banners voltam a ser só os deste computador.')) return;
  await api.nuvemDesligar(); await carregarNuvem(); await carregarAvisos(); await carregarImagens(); toast('Mídia online desligada');
};
// erros de gravação (ex.: sem internet com a nuvem ligada) aparecem para o operador
window.addEventListener('unhandledrejection', e => {
  const m = String((e.reason && e.reason.message) || e.reason || '').replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  toast('Não foi possível salvar: ' + (/fetch failed|timeout|ENOTFOUND/i.test(m) ? 'sem internet' : m));
});

// ---------------- início ----------------
(async () => {
  const etapa = async (nome, f) => { try { await f(); } catch (e) { mostrarErro(nome + ': ' + (e && e.message || e)); } };
  await etapa('configuração', async () => { config = await api.obterConfig(); });
  await etapa('lista do culto', async () => { culto = await api.obterCulto(); $('anotacoes').value = culto.anotacoes || ''; });
  await etapa('letras', carregarMusicas);
  await etapa('avisos', carregarAvisos);
  await etapa('imagens', carregarImagens);
  await etapa('Bíblia', carregarBiblias);
  await etapa('igreja', carregarIgreja);
  await etapa('mídia online', carregarNuvem);
  await etapa('imagens (2)', carregarImagens);
  await etapa('tempo dos avisos', async () => { $('rotSeg').value = config.rotSeg || 8; });
  await etapa('fundos', renderTemas);
  await etapa('tela inicial', async () => { abrir(null); enviar(); });
})();
