// Pesquisa de letras na internet: LRCLIB (aberto, sem chave) e Vagalume (API oficial, chave gratuita)
const UA = 'ProjecaoAssembleia/1.0 (programa de projecao de igreja)';
const BASE = {
  lrclib: process.env.LRCLIB_URL || 'https://lrclib.net',
  vagalume: process.env.VAGALUME_URL || 'https://api.vagalume.com.br'
};
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const espera = ms => new Promise(r => setTimeout(r, ms));
// HTTP 429 = "muitas buscas seguidas": espera o tempo que o site pede (até 5 s) e tenta de novo, no máximo 2 vezes
async function pegar(url, tentativa = 0) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if ((r.status === 429 || r.status === 503) && tentativa < 2) {
    const s = parseInt(r.headers.get('retry-after'), 10);
    await espera(Math.min(5000, (s > 0 ? s : 1 + tentativa * 2) * 1000));
    return pegar(url, tentativa + 1);
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
// guarda as buscas por 10 minutos: repetir a mesma busca não gasta pedido no site
const cache = new Map();
async function pegarGuardado(url) {
  const c = cache.get(url);
  if (c && Date.now() - c.t < 600000) return c.v;
  const v = await pegar(url);
  cache.set(url, { t: Date.now(), v });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return v;
}
const motivo = e => /fetch|timeout|abort|ENOTFOUND|ECONN/i.test(e.message) ? 'sem conexão'
  : /HTTP 429/.test(e.message) ? 'muitas buscas agora, tente de novo em 1 minuto' : e.message;

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

// Busca nas duas fontes, junta e tira repetidos (mesmo título + artista)
async function buscar(q, { chaveVagalume, titulo = true, artista = true, letras = true } = {}) {
  q = String(q || '').trim();
  if (q.length < 2) return { resultados: [], avisos: [] };
  const avisos = [];
  // o Vagalume entra sempre (tem muitas letras gospel); a chave grátis só deixa mais estável
  const [lr, vg] = await Promise.all([
    buscarLrclib(q).catch(e => { avisos.push('LRCLIB: ' + motivo(e)); return []; }),
    buscarVagalume(q, chaveVagalume, { titulo: titulo || artista, letras }).catch(e => {
      avisos.push('Vagalume: ' + (chaveVagalume ? motivo(e) : 'indisponível sem chave (use “Ligar Vagalume” abaixo)')); return [];
    })
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
