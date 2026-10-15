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

  return { gerarSlides, corrigir, normalizarBusca, normalizarQuebras, formatarLinhas, formatarAuto };
});
