// Lógica de texto compartilhada (Node e navegador)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Texto = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const ACORDE = /^[A-G](#|b)?(m|maj7?|min|dim|aug|sus[24]?|add\d+|°|\+)?\d*(\/[A-G](#|b)?)?$/;
  const NOMES = /(^|[^\p{L}])(espírito santo|espirito santo|deus|jesus|cristo|senhor|jeová|emanuel)(?![\p{L}])/giu;

  function normalizarQuebras(t) {
    return String(t || '').replace(/\r\n?/g, '\n').replace(/ /g, ' ').replace(/\t/g, ' ');
  }

  // Linha em branco = novo slide; quebra simples = mesma tela
  function gerarSlides(t) {
    return normalizarQuebras(t)
      .split(/\n\s*\n/)
      .map(b => b.split('\n').map(l => l.trim()).filter(Boolean).join('\n'))
      .filter(Boolean);
  }

  function linhaDeCifra(l) {
    const toks = l.trim().split(/\s+/);
    return toks.length > 0 && toks[0] !== '' && toks.every(t => ACORDE.test(t));
  }

  function capitalizarNomes(l) {
    return l.replace(NOMES, (m, antes, nome) =>
      antes + nome.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' '));
  }

  function corrigir(t, opcoes) {
    const op = Object.assign({ cifras: true, nomes: true }, opcoes || {});
    const out = [];
    for (let l of normalizarQuebras(t).split('\n')) {
      l = l.replace(/\s+/g, ' ').trim();
      if (op.cifras && l && linhaDeCifra(l)) continue;
      l = l.replace(/[\s,.;:]+$/, '');                 // pontuação no fim (mantém ? e !)
      if (op.nomes) l = capitalizarNomes(l);
      l = l.replace(/^([^\p{L}\p{N}]*)(\p{L})/u, (m, a, b) => a + b.toUpperCase());
      if (!l) { if (out.length && out[out.length - 1] !== '') out.push(''); continue; }
      out.push(l);
    }
    while (out.length && out[out.length - 1] === '') out.pop();
    return out.join('\n');
  }

  function normalizarBusca(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  // ---- busca por título ou trecho da letra (tolera pontuação, quebra de linha e erro de 1 letra) ----
  function palavrasBusca(s) {
    return normalizarBusca(s).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  }
  function distancia(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let ant = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let menor = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < menor) menor = cur[j];
      }
      if (menor > max) return max + 1;
      ant = cur;
    }
    return ant[b.length];
  }
  // 3 = igual, 2 = começo da palavra, 1 = parecida (1 letra errada; 2 em palavras longas), 0 = não
  function parecida(q, w) {
    if (w === q) return 3;
    if (w.startsWith(q)) return 2;
    if (q.length >= 4) {
      const max = q.length >= 7 ? 2 : 1;
      if (distancia(q, w, max) <= max) return 1;
      if (w.length > q.length && distancia(q, w.slice(0, q.length), 1) <= 1) return 1;   // começo parecido
    }
    return 0;
  }
  // nota de um trecho (lista de palavras) para as palavras buscadas; 0 = não serve
  function notaTrecho(qs, ws, nota) {
    let soma = 0;
    for (const q of qs) {
      let melhor = 0;
      for (const w of ws) { const n = nota(q, w); if (n > melhor) { melhor = n; if (n === 3) break; } }
      if (!melhor) return 0;
      soma += melhor;
    }
    let frase = 0;                                   // palavras na mesma ordem, uma atrás da outra
    for (let i = 0; i + qs.length <= ws.length && !frase; i++) {
      let ok = true;
      for (let j = 0; j < qs.length && ok; j++) ok = nota(qs[j], ws[i + j]) > 0;
      if (ok) frase = 1;
    }
    return soma / (3 * qs.length) * 10 + frase * 10;
  }
  const cacheLetra = new Map();
  function linhasDaLetra(letra) {
    let r = cacheLetra.get(letra);
    if (!r) {
      const ls = normalizarQuebras(letra).split('\n').map(l => l.trim()).filter(Boolean);
      r = ls.map(l => ({ l, ws: palavrasBusca(l) }));
      if (cacheLetra.size > 5000) cacheLetra.clear();
      cacheLetra.set(letra, r);
    }
    return r;
  }
  // devolve [{ m, t (achou no título), trecho }] do melhor para o pior
  function buscarMusicas(lista, texto) {
    const qs = palavrasBusca(texto);
    if (!qs.length) return lista.map(m => ({ m }));
    const memo = new Map();
    const nota = (q, w) => { const k = q + '|' + w; let n = memo.get(k); if (n === undefined) { n = parecida(q, w); memo.set(k, n); } return n; };
    const out = [];
    lista.forEach((m, ordem) => {
      const nt = notaTrecho(qs, palavrasBusca(m.titulo + ' ' + (m.artista || '')), nota);
      if (nt) { out.push({ m, t: 1, nota: 100 + nt, ordem }); return; }
      const ls = linhasDaLetra(m.letra);
      let melhor = 0, trecho = '';
      for (let i = 0; i < ls.length; i++) {
        for (let n = 1; n <= 2 && i + n <= ls.length; n++) {      // uma linha ou duas seguidas
          const ws = n === 1 ? ls[i].ws : ls[i].ws.concat(ls[i + 1].ws);
          const v = notaTrecho(qs, ws, nota) - (n - 1) * 0.5;
          if (v > melhor) { melhor = v; trecho = n === 1 ? ls[i].l : ls[i].l + ' / ' + ls[i + 1].l; }
        }
      }
      if (melhor > 0) out.push({ m, trecho, nota: melhor, ordem });
    });
    return out.sort((a, b) => b.nota - a.nota || a.ordem - b.ordem);
  }
  // marca as palavras do texto que batem com a busca; devolve pedaços [{ txt, marca }]
  function pedacosDestaque(texto, busca) {
    const qs = palavrasBusca(busca);
    return String(texto || '').split(/([\p{L}\p{N}]+)/u).filter(p => p !== '').map(p => {
      const w = palavrasBusca(p)[0];
      return { txt: p, marca: !!(w && /[\p{L}\p{N}]/u.test(p[0]) && qs.some(q => q.length < 3 ? q === w : parecida(q, w))) };
    });
  }

  // Reorganiza a letra: 0 = estrofes como vieram; N = no máximo N linhas por slide
  function formatarLinhas(t, n) {
    const estrofes = normalizarQuebras(t).split(/\n\s*\n/).map(b => b.split('\n').map(l => l.trim()).filter(Boolean)).filter(b => b.length);
    if (!n) return estrofes.map(b => b.join('\n')).join('\n\n');
    const out = [];
    for (const b of estrofes) for (let i = 0; i < b.length; i += n) out.push(b.slice(i, i + n).join('\n'));
    return out.join('\n\n');
  }

  // Formatação automática (letras da internet): mantém as estrofes; estrofe com mais de 4 linhas
  // é dividida em partes iguais de até 4 linhas (ex.: 6 → 3+3, 8 → 4+4, 10 → 4+3+3)
  function formatarAuto(t) {
    const estrofes = normalizarQuebras(t).split(/\n\s*\n/).map(b => b.split('\n').map(l => l.trim()).filter(Boolean)).filter(b => b.length);
    const out = [];
    for (const b of estrofes) {
      const partes = Math.ceil(b.length / 4);
      for (let p = 0, i = 0; p < partes; p++) {
        const n = Math.ceil((b.length - i) / (partes - p));
        out.push(b.slice(i, i + n).join('\n')); i += n;
      }
    }
    return out.join('\n\n');
  }

  return { gerarSlides, corrigir, normalizarBusca, buscarMusicas, pedacosDestaque, normalizarQuebras, formatarLinhas, formatarAuto };
});
