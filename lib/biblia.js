// Bíblia: nomes dos livros, leitura de arquivos (JSON / XML Zefania / OSIS) e busca por referência
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Biblia = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // [nome, abreviação, apelidos extras..., código OSIS]
  const LIVROS = [
    ['Gênesis', 'Gn', ['gen'], 'Gen'], ['Êxodo', 'Êx', ['ex', 'exo'], 'Exod'], ['Levítico', 'Lv', ['lev'], 'Lev'],
    ['Números', 'Nm', ['num'], 'Num'], ['Deuteronômio', 'Dt', ['deut'], 'Deut'], ['Josué', 'Js', ['jos'], 'Josh'],
    ['Juízes', 'Jz', ['jui'], 'Judg'], ['Rute', 'Rt', [], 'Ruth'], ['1 Samuel', '1Sm', ['1sam'], '1Sam'],
    ['2 Samuel', '2Sm', ['2sam'], '2Sam'], ['1 Reis', '1Rs', [], '1Kgs'], ['2 Reis', '2Rs', [], '2Kgs'],
    ['1 Crônicas', '1Cr', ['1cro'], '1Chr'], ['2 Crônicas', '2Cr', ['2cro'], '2Chr'], ['Esdras', 'Ed', ['esd'], 'Ezra'],
    ['Neemias', 'Ne', ['nee'], 'Neh'], ['Ester', 'Et', ['est'], 'Esth'], ['Jó', 'Jó', ['job'], 'Job'],
    ['Salmos', 'Sl', ['sal', 'salmo'], 'Ps'], ['Provérbios', 'Pv', ['prov', 'pro'], 'Prov'], ['Eclesiastes', 'Ec', ['ecl'], 'Eccl'],
    ['Cânticos', 'Ct', ['cantares', 'cant', 'cnt'], 'Song'], ['Isaías', 'Is', ['isa'], 'Isa'], ['Jeremias', 'Jr', ['jer'], 'Jer'],
    ['Lamentações', 'Lm', ['lam'], 'Lam'], ['Ezequiel', 'Ez', ['eze'], 'Ezek'], ['Daniel', 'Dn', ['dan'], 'Dan'],
    ['Oséias', 'Os', ['ose'], 'Hos'], ['Joel', 'Jl', [], 'Joel'], ['Amós', 'Am', [], 'Amos'], ['Obadias', 'Ob', ['oba'], 'Obad'],
    ['Jonas', 'Jn', ['jon'], 'Jonah'], ['Miquéias', 'Mq', ['miq'], 'Mic'], ['Naum', 'Na', [], 'Nah'],
    ['Habacuque', 'Hc', ['hab'], 'Hab'], ['Sofonias', 'Sf', ['sof'], 'Zeph'], ['Ageu', 'Ag', [], 'Hag'],
    ['Zacarias', 'Zc', ['zac'], 'Zech'], ['Malaquias', 'Ml', ['mal'], 'Mal'], ['Mateus', 'Mt', ['mat'], 'Matt'],
    ['Marcos', 'Mc', ['mar'], 'Mark'], ['Lucas', 'Lc', ['luc'], 'Luke'], ['João', 'Jo', ['joa'], 'John'],
    ['Atos', 'At', [], 'Acts'], ['Romanos', 'Rm', ['rom'], 'Rom'], ['1 Coríntios', '1Co', ['1cor'], '1Cor'],
    ['2 Coríntios', '2Co', ['2cor'], '2Cor'], ['Gálatas', 'Gl', ['gal'], 'Gal'], ['Efésios', 'Ef', ['efe'], 'Eph'],
    ['Filipenses', 'Fp', ['fl', 'fil'], 'Phil'], ['Colossenses', 'Cl', ['col'], 'Col'], ['1 Tessalonicenses', '1Ts', ['1tes'], '1Thess'],
    ['2 Tessalonicenses', '2Ts', ['2tes'], '2Thess'], ['1 Timóteo', '1Tm', ['1tim'], '1Tim'], ['2 Timóteo', '2Tm', ['2tim'], '2Tim'],
    ['Tito', 'Tt', ['tit'], 'Titus'], ['Filemom', 'Fm', ['flm', 'filem'], 'Phlm'], ['Hebreus', 'Hb', ['heb'], 'Heb'],
    ['Tiago', 'Tg', ['tia'], 'Jas'], ['1 Pedro', '1Pe', ['1ped'], '1Pet'], ['2 Pedro', '2Pe', ['2ped'], '2Pet'],
    ['1 João', '1Jo', ['1joa'], '1John'], ['2 João', '2Jo', ['2joa'], '2John'], ['3 João', '3Jo', ['3joa'], '3John'],
    ['Judas', 'Jd', ['jud'], 'Jude'], ['Apocalipse', 'Ap', ['apo', 'apoc'], 'Rev']
  ].map(([nome, abrev, apelidos, osis], i) => ({ i, nome, abrev, apelidos, osis }));

  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s.]/g, '');

  function acharLivro(token) {
    const bruto = String(token).toLowerCase().replace(/[\s.]/g, '');
    if (bruto === 'jó') return LIVROS[17];
    const k = norm(token);
    if (!k) return null;
    for (const l of LIVROS) {
      if (l.i === 17) continue;                        // Jó só pelo acento ou "job"
      if (norm(l.abrev) === k || l.apelidos.includes(k) || norm(l.nome) === k) return l;
    }
    if (k === 'job') return LIVROS[17];
    return LIVROS.find(l => norm(l.nome).startsWith(k) && k.length >= 2) || null;
  }

  // "Jo 3:16", "joão 3 16-18", "1co13", "sl 23.1"
  function interpretarReferencia(txt) {
    const m = /^\s*([1-3]?\s*\p{L}+)\.?\s*(.*)$/u.exec(String(txt || ''));
    if (!m) return null;
    const livro = acharLivro(m[1]);
    if (!livro) return null;
    const resto = m[2].trim();
    if (!resto) return { livro: livro.i };
    const n = /^(\d+)(?:\s*[:.,\s]\s*(\d+)(?:\s*-\s*(\d+))?)?$/.exec(resto);
    if (!n) return null;
    return { livro: livro.i, cap: +n[1], v1: n[2] ? +n[2] : null, v2: n[3] ? +n[3] : null };
  }

  // ---------- leitura de arquivos ----------
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const limparXML = s => s.replace(/<[^>]+>/g, '').replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e] ?? m)
  ).replace(/\s+/g, ' ').trim();

  function vazia() { return LIVROS.map(() => []); }
  function por(livros, li, c, v, texto) {
    if (li < 0 || li > 65 || c < 1 || v < 1 || !texto) return;
    const caps = livros[li];
    while (caps.length < c) caps.push([]);
    caps[c - 1][v - 1] = texto;
  }

  function lerJSON(txt) {
    const d = JSON.parse(txt.replace(/^﻿/, ''));
    const livros = vazia();
    // Formato 1: [ { abbrev, chapters: [ [v1, v2...], ... ] }, ... ] (66 livros em ordem)
    const lista = Array.isArray(d) ? d : Array.isArray(d.books) ? d.books : null;
    if (lista && lista.length && lista[0].chapters) {
      lista.forEach((b, i) => {
        const li = typeof b.book === 'number' ? b.book - 1 : i;
        b.chapters.forEach((cap, c) => (Array.isArray(cap) ? cap : (cap.verses || [])).forEach((v, k) =>
          por(livros, li, c + 1, k + 1, typeof v === 'string' ? v : (v.text || ''))));
      });
      return livros;
    }
    // Formato 2: { verses: [ { book, chapter, verse, text } ] }
    const versos = Array.isArray(d.verses) ? d.verses : Array.isArray(d) ? d : null;
    if (versos && versos.length && versos[0].chapter != null) {
      for (const v of versos) {
        const li = typeof v.book === 'number' ? v.book - 1 : (acharLivro(v.book_name || v.book) || { i: -1 }).i;
        por(livros, li, +v.chapter, +v.verse, String(v.text || '').trim());
      }
      return livros;
    }
    throw new Error('Formato JSON não reconhecido');
  }

  function lerXML(txt) {
    const livros = vazia();
    if (/<BIBLEBOOK/i.test(txt)) {                       // Zefania
      for (const b of txt.matchAll(/<BIBLEBOOK\b([^>]*)>([\s\S]*?)<\/BIBLEBOOK>/gi)) {
        const li = +(/bnumber="(\d+)"/i.exec(b[1]) || [])[1] - 1;
        for (const c of b[2].matchAll(/<CHAPTER\b([^>]*)>([\s\S]*?)<\/CHAPTER>/gi)) {
          const cn = +(/cnumber="(\d+)"/i.exec(c[1]) || [])[1];
          for (const v of c[2].matchAll(/<VERS\b([^>]*)>([\s\S]*?)<\/VERS>/gi))
            por(livros, li, cn, +(/vnumber="(\d+)"/i.exec(v[1]) || [])[1], limparXML(v[2]));
        }
      }
      return livros;
    }
    if (/<verse\b[^>]*osisID=/i.test(txt)) {             // OSIS (versículos com conteúdo)
      const mapa = Object.fromEntries(LIVROS.map(l => [l.osis.toLowerCase(), l.i]));
      for (const v of txt.matchAll(/<verse\b[^>]*osisID="([^".]+)\.(\d+)\.(\d+)[^"]*"[^>]*>([\s\S]*?)<\/verse>/gi)) {
        const li = mapa[v[1].toLowerCase()];
        if (li != null) por(livros, li, +v[2], +v[3], limparXML(v[4]));
      }
      return livros;
    }
    throw new Error('Formato XML não reconhecido');
  }

  function lerArquivo(nomeArquivo, txt) {
    const livros = /\.json$/i.test(nomeArquivo) ? lerJSON(txt) : lerXML(txt);
    const total = livros.reduce((s, caps) => s + caps.reduce((t, c) => t + c.filter(Boolean).length, 0), 0);
    if (!total) throw new Error('Nenhum versículo encontrado no arquivo');
    return { livros, total };
  }

  return { LIVROS, acharLivro, interpretarReferencia, lerArquivo, norm };
});
