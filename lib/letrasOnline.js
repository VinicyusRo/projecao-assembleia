// Pesquisa de letras na internet: Letras.mus.br (o maior acervo gospel do Brasil, sem chave),
// LRCLIB (aberto, sem chave) e Vagalume (API oficial, chave gratuita)
const UA = 'ProjecaoAssembleia/1.0 (programa de projecao de igreja)';
const UA_NAV = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const BASE = {
  lrclib: process.env.LRCLIB_URL || 'https://lrclib.net',
  vagalume: process.env.VAGALUME_URL || 'https://api.vagalume.com.br',
  letrasBusca: process.env.LETRAS_BUSCA_URL || 'https://solr.sscdn.co/letras/m1/',
  letras: process.env.LETRAS_URL || 'https://www.letras.mus.br'
};
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const espera = ms => new Promise(r => setTimeout(r, ms));
// HTTP 429 = "muitas buscas seguidas": espera o tempo que o site pede (até 3 s) e tenta de novo uma vez
async function pegar(url, tentativa = 0, texto = false) {
  const r = await fetch(url, { headers: texto ? { 'User-Agent': UA_NAV, Accept: 'text/html,*/*', 'Accept-Language': 'pt-BR,pt;q=0.9' }
    : { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if ((r.status === 429 || r.status === 503) && tentativa < 1) {
    const s = parseInt(r.headers.get('retry-after'), 10);
    await espera(Math.min(3000, (s > 0 ? s : 1) * 1000));
    return pegar(url, tentativa + 1, texto);
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return texto ? r.text() : r.json();
}
// guarda as buscas por 10 minutos: repetir a mesma busca não gasta pedido no site
const cache = new Map();
async function pegarGuardado(url, texto = false) {
  const c = cache.get(url);
  if (c && Date.now() - c.t < 600000) return c.v;
  const v = await pegar(url, 0, texto);
  cache.set(url, { t: Date.now(), v });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return v;
}
const motivo = e => /fetch|timeout|abort|ENOTFOUND|ECONN/i.test(e.message) ? 'sem conexão'
  : /HTTP 429/.test(e.message) ? 'muitas buscas agora, tente de novo em 1 minuto' : e.message;

// ---------- Letras.mus.br ----------
// a busca do próprio site devolve JSONP: LetrasSug({"response":{"docs":[{"t":"2","dns":"artista","url":"musica","txt":"Título","art":"Artista"}]}})
async function buscarLetrasMus(q) {
  const txt = await pegarGuardado(`${BASE.letrasBusca}?q=${encodeURIComponent(q)}`, true);
  const m = /^[^(]*\(([\s\S]*)\)[;\s]*$/.exec(txt.trim());
  const j = JSON.parse(m ? m[1] : txt);
  const docs = j && j.response && Array.isArray(j.response.docs) ? j.response.docs : [];
  return docs.filter(d => String(d.t) === '2' && d.dns && d.url && d.txt)
    .map(d => ({ fonte: 'letras', id: `${d.dns}/${d.url}`, titulo: String(d.txt), artista: String(d.art || ''), letra: null }));
}
const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function textoDoHtml(h) {
  return h.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (t, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENTIDADES[e.toLowerCase()] || t))
    .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
// pega o conteúdo de <div class="..."> até o </div> que fecha ele (conta as divs de dentro)
function divComClasse(html, classe) {
  const ini = html.search(new RegExp(`<div[^>]*class="[^"]*\\b${classe}\\b[^"]*"[^>]*>`, 'i'));
  if (ini < 0) return null;
  const re = /<\/?div\b[^>]*>/gi; re.lastIndex = ini;
  let nivel = 0, m, comeco = -1;
  while ((m = re.exec(html))) {
    if (m[0][1] === '/') { if (--nivel === 0) return html.slice(comeco, m.index); }
    else { if (nivel++ === 0) comeco = m.index + m[0].length; }
  }
  return null;
}
async function letraLetrasMus(id) {
  const html = await pegar(`${BASE.letras}/${id.split('/').map(encodeURIComponent).join('/')}/`, 0, true);
  const bloco = divComClasse(html, 'lyric-original') || divComClasse(html, 'cnt-letra');
  // só os parágrafos (<p>) da letra: deixa de fora propaganda e botões que ficam dentro do mesmo bloco
  const ps = bloco ? bloco.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) : null;
  const letra = bloco ? textoDoHtml(ps ? ps.join('') : bloco) : '';
  if (!letra) throw new Error('Letra não encontrada no Letras.mus.br');
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html), h2 = /<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(html);
  return { titulo: h1 ? textoDoHtml(h1[1]) : '', artista: h2 ? textoDoHtml(h2[1]) : '', letra };
}

// ---------- LRCLIB ----------
async function buscarLrclib(q) {
  const lista = await pegarGuardado(`${BASE.lrclib}/api/search?q=${encodeURIComponent(q)}`);
  return (Array.isArray(lista) ? lista : [])
    .filter(x => !x.instrumental && (x.plainLyrics || '').trim())
    .map(x => ({ fonte: 'lrclib', id: String(x.id), titulo: x.trackName || '', artista: x.artistName || '', letra: x.plainLyrics }));
}

// ---------- Vagalume ----------
async function buscarVagalume(q, chave, { titulo = true, letras = true } = {}) {
  const ch = chave ? `&apikey=${encodeURIComponent(chave)}` : '';
  const pedidos = [];
  if (titulo) pedidos.push(pegarGuardado(`${BASE.vagalume}/search.artmus?q=${encodeURIComponent(q)}&limit=25${ch}`).catch(() => null));
  if (letras) pedidos.push(pegarGuardado(`${BASE.vagalume}/search.excerpt?q=${encodeURIComponent(q)}&limit=25${ch}`).catch(() => null));
  const res = await Promise.all(pedidos);
  const out = [];
  for (const r of res) {
    const docs = r && r.response && Array.isArray(r.response.docs) ? r.response.docs : [];
    for (const d of docs) if (d.title && d.id) out.push({ fonte: 'vagalume', id: String(d.id), titulo: d.title, artista: d.band || '', letra: null });
  }
  if (res.every(r => r === null)) throw new Error('Vagalume indisponível');
  return out;
}
async function letraVagalume(id, chave) {
  const j = await pegar(`${BASE.vagalume}/search.php?musid=${encodeURIComponent(id)}${chave ? '&apikey=' + encodeURIComponent(chave) : ''}`);
  const m = j && Array.isArray(j.mus) && j.mus[0];
  if (!m || !m.text) throw new Error('Letra não encontrada no Vagalume');
  return { titulo: m.name || '', artista: (j.art && j.art.name) || '', letra: m.text };
}

// Busca nas fontes ao mesmo tempo, junta e tira repetidos (mesmo título + artista)
async function buscar(q, { chaveVagalume, titulo = true, artista = true, letras = true } = {}) {
  q = String(q || '').trim();
  if (q.length < 2) return { resultados: [], avisos: [] };
  const avisos = [];
  const [lm, vg, lr] = await Promise.all([
    buscarLetrasMus(q).catch(e => { avisos.push('Letras.mus.br: ' + motivo(e)); return []; }),
    // sem chave o Vagalume costuma recusar: tenta mesmo assim, mas só avisa se nada mais der certo
    buscarVagalume(q, chaveVagalume, { titulo: titulo || artista, letras }).catch(e => {
      if (chaveVagalume) avisos.push('Vagalume: ' + motivo(e)); return [];
    }),
    buscarLrclib(q).catch(e => { avisos.push('LRCLIB: ' + motivo(e)); return []; })
  ]);
  // filtros do tipo Holyrics (Título / Artista / Letras): cada palavra da busca vale 1 ponto no campo marcado.
  // Os sites já procuram pela busca toda, então só sai da lista quem não tem nenhuma palavra (e a letra é conhecida).
  const palavras = norm(q).split(/[^a-z0-9]+/).filter(w => w.length > 1);
  const nq = norm(q);
  const pontos = x => {
    const campos = [titulo && x.titulo, artista && x.artista, letras && x.letra].filter(Boolean).map(norm).join(' ');
    return palavras.filter(w => campos.includes(w)).length + (norm(x.titulo) === nq ? 5 : norm(x.titulo).includes(nq) ? 3 : 0);
  };
  const vistos = new Set(), resultados = [];
  [...lm, ...vg, ...lr].forEach((x, ordem) => {
    const k = norm(x.titulo) + '|' + norm(x.artista);
    if (vistos.has(k)) return;
    const p = pontos(x);
    if (!p && x.letra) return;
    vistos.add(k); resultados.push({ x, p, ordem });
  });
  resultados.sort((a, b) => b.p - a.p || a.ordem - b.ordem);
  return { resultados: resultados.slice(0, 60).map(r => r.x), avisos: resultados.length ? [] : avisos };
}

async function letra(item, chaveVagalume) {
  if (item.fonte === 'lrclib') {
    if (item.letra) return item;
    const x = await pegar(`${BASE.lrclib}/api/get/${encodeURIComponent(item.id)}`);
    return { titulo: x.trackName, artista: x.artistName, letra: x.plainLyrics || '' };
  }
  if (item.fonte === 'letras') return letraLetrasMus(item.id);
  return letraVagalume(item.id, chaveVagalume);
}

module.exports = { buscar, letra };
