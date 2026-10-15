// Pesquisa de letras na internet: LRCLIB (aberto, sem chave) e Vagalume (API oficial, chave gratuita)
const UA = 'ProjecaoAssembleia/1.0 (programa de projecao de igreja)';
const BASE = {
  lrclib: process.env.LRCLIB_URL || 'https://lrclib.net',
  vagalume: process.env.VAGALUME_URL || 'https://api.vagalume.com.br'
};
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

async function pegar(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ---------- LRCLIB ----------
async function buscarLrclib(q) {
  const lista = await pegar(`${BASE.lrclib}/api/search?q=${encodeURIComponent(q)}`);
  return (Array.isArray(lista) ? lista : [])
    .filter(x => !x.instrumental && (x.plainLyrics || '').trim())
    .map(x => ({ fonte: 'lrclib', id: String(x.id), titulo: x.trackName || '', artista: x.artistName || '', letra: x.plainLyrics }));
}

// ---------- Vagalume ----------
async function buscarVagalume(q, chave, { titulo = true, letras = true } = {}) {
  const ch = chave ? `&apikey=${encodeURIComponent(chave)}` : '';
  const pedidos = [];
  if (titulo) pedidos.push(pegar(`${BASE.vagalume}/search.artmus?q=${encodeURIComponent(q)}&limit=25${ch}`).catch(() => null));
  if (letras) pedidos.push(pegar(`${BASE.vagalume}/search.excerpt?q=${encodeURIComponent(q)}&limit=25${ch}`).catch(() => null));
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

// Busca nas duas fontes, junta e tira repetidos (mesmo título + artista)
async function buscar(q, { chaveVagalume, titulo = true, artista = true, letras = true } = {}) {
  q = String(q || '').trim();
  if (q.length < 2) return { resultados: [], avisos: [] };
  const avisos = [];
  const [lr, vg] = await Promise.all([
    buscarLrclib(q).catch(e => { avisos.push('LRCLIB: ' + (/fetch|timeout|ENOTFOUND/i.test(e.message) ? 'sem conexão' : e.message)); return []; }),
    chaveVagalume ? buscarVagalume(q, chaveVagalume, { titulo: titulo || artista, letras }).catch(e => { avisos.push('Vagalume: ' + (/fetch|timeout|ENOTFOUND/i.test(e.message) ? 'sem conexão' : e.message)); return []; }) : []
  ]);
  const vistos = new Set(), resultados = [];
  for (const x of [...vg, ...lr]) {
    const k = norm(x.titulo) + '|' + norm(x.artista);
    if (vistos.has(k)) continue;
    // filtros do tipo Holyrics: Título / Artista / Letras
    const nq = norm(q);
    const casa = (titulo && norm(x.titulo).includes(nq)) || (artista && norm(x.artista).includes(nq)) || (letras && (x.letra === null || norm(x.letra).includes(nq)));
    if (!casa && (titulo || artista || letras)) continue;
    vistos.add(k); resultados.push(x);
  }
  // títulos que batem com a busca primeiro
  const nq = norm(q);
  resultados.sort((a, b) => (norm(b.titulo).includes(nq) ? 1 : 0) - (norm(a.titulo).includes(nq) ? 1 : 0));
  return { resultados: resultados.slice(0, 60), avisos };
}

async function letra(item, chaveVagalume) {
  if (item.fonte === 'lrclib') {
    if (item.letra) return item;
    const x = await pegar(`${BASE.lrclib}/api/get/${encodeURIComponent(item.id)}`);
    return { titulo: x.trackName, artista: x.artistName, letra: x.plainLyrics || '' };
  }
  return letraVagalume(item.id, chaveVagalume);
}

module.exports = { buscar, letra };
