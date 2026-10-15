// Gerador de QR Code (modo byte, correção de erro M, versões 1 a 10) sem dependências.
// Uso: QR.svg('http://192.168.0.10:4210') -> string <svg>
(function (raiz) {
  const ECC = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];   // códigos de correção por bloco (nível M)
  const BLOCOS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];

  function modulosBrutos(v) {
    let r = (16 * v + 128) * v + 64;
    if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
    return r;
  }
  const palavrasDados = v => Math.floor(modulosBrutos(v) / 8) - ECC[v] * BLOCOS[v];

  function mul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
    return z & 0xFF;
  }
  function divisor(grau) {
    const r = new Array(grau).fill(0); r[grau - 1] = 1; let raizG = 1;
    for (let i = 0; i < grau; i++) {
      for (let j = 0; j < r.length; j++) { r[j] = mul(r[j], raizG); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
      raizG = mul(raizG, 0x02);
    }
    return r;
  }
  function resto(dados, div) {
    const r = new Array(div.length).fill(0);
    for (const b of dados) {
      const f = b ^ r.shift(); r.push(0);
      div.forEach((c, i) => { r[i] ^= mul(c, f); });
    }
    return r;
  }
  function posAlinhamento(v) {
    if (v === 1) return [];
    const n = Math.floor(v / 7) + 2;
    const passo = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2;
    const r = [6];
    for (let p = v * 4 + 10; r.length < n; p -= passo) r.splice(1, 0, p);
    return r;
  }

  function gerar(texto) {
    const bytes = Array.from(new TextEncoder().encode(texto));
    let v = 1;
    while (v <= 10 && 4 + (v < 10 ? 8 : 16) + bytes.length * 8 > palavrasDados(v) * 8) v++;
    if (v > 10) throw new Error('Texto longo demais para o QR');
    const cap = palavrasDados(v) * 8;
    // bits de dados
    const bits = [];
    const por = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    por(4, 4); por(bytes.length, v < 10 ? 8 : 16); bytes.forEach(b => por(b, 8));
    por(0, Math.min(4, cap - bits.length));
    por(0, (8 - bits.length % 8) % 8);
    for (let p = 0xEC; bits.length < cap; p ^= 0xEC ^ 0x11) por(p, 8);
    const dados = [];
    for (let i = 0; i < bits.length; i += 8) dados.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    // correção de erro e intercalação
    const nb = BLOCOS[v], ne = ECC[v], brutos = Math.floor(modulosBrutos(v) / 8);
    const curtos = nb - brutos % nb, tamCurto = Math.floor(brutos / nb), div = divisor(ne);
    const blocos = [];
    for (let i = 0, k = 0; i < nb; i++) {
      const d = dados.slice(k, k + tamCurto - ne + (i < curtos ? 0 : 1)); k += d.length;
      const e = resto(d, div); if (i < curtos) d.push(0);
      blocos.push(d.concat(e));
    }
    const final = [];
    for (let i = 0; i < blocos[0].length; i++)
      for (let j = 0; j < blocos.length; j++)
        if (i !== tamCurto - ne || j >= curtos) final.push(blocos[j][i]);

    // matriz
    const N = v * 4 + 17;
    const mod = Array.from({ length: N }, () => new Array(N).fill(false));
    const fun = Array.from({ length: N }, () => new Array(N).fill(false));
    const set = (x, y, c) => { mod[y][x] = c; fun[y][x] = true; };
    for (let i = 0; i < N; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    for (const [cx, cy] of [[3, 3], [N - 4, 3], [3, N - 4]])
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < N && y >= 0 && y < N) set(x, y, d !== 2 && d !== 4);
      }
    const al = posAlinhamento(v), na = al.length;
    for (let i = 0; i < na; i++) for (let j = 0; j < na; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    const formato = mascara => {
      const d = (0 << 3) | mascara;   // nível M = 00
      let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const b = ((d << 10) | r) ^ 0x5412, bit = i => ((b >>> i) & 1) === 1;
      for (let i = 0; i <= 5; i++) set(8, i, bit(i));
      set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) set(N - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) set(8, N - 15 + i, bit(i));
      set(8, N - 8, true);
    };
    formato(0);
    if (v >= 7) {
      let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
      const b = (v << 12) | r;
      for (let i = 0; i < 18; i++) { const c = ((b >>> i) & 1) === 1, a = N - 11 + i % 3, bb = Math.floor(i / 3); set(a, bb, c); set(bb, a, c); }
    }
    // posiciona os dados em zigue-zague
    let i = 0;
    for (let dir = N - 1; dir >= 1; dir -= 2) {
      if (dir === 6) dir = 5;
      for (let vert = 0; vert < N; vert++) for (let j = 0; j < 2; j++) {
        const x = dir - j, sobe = ((dir + 1) & 2) === 0, y = sobe ? N - 1 - vert : vert;
        if (!fun[y][x] && i < final.length * 8) { mod[y][x] = ((final[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
      }
    }
    // escolhe a melhor máscara
    const M = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0,
      (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
    const aplicar = m => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!fun[y][x] && M[m](x, y)) mod[y][x] = !mod[y][x]; };
    const penalidade = () => {
      let p = 0, escuros = 0;
      for (let a = 0; a < N; a++) {
        let cl = 1, cc = 1;
        for (let b = 1; b < N; b++) {
          if (mod[a][b] === mod[a][b - 1]) { cl++; if (cl === 5) p += 3; else if (cl > 5) p++; } else cl = 1;
          if (mod[b][a] === mod[b - 1][a]) { cc++; if (cc === 5) p += 3; else if (cc > 5) p++; } else cc = 1;
        }
      }
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (mod[y][x]) escuros++;
        if (x < N - 1 && y < N - 1) { const c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3; }
      }
      return p + Math.floor(Math.abs(escuros * 20 - N * N * 10) / (N * N)) * 10;
    };
    let melhor = 0, menor = Infinity;
    for (let m = 0; m < 8; m++) {
      aplicar(m); formato(m);
      const p = penalidade(); if (p < menor) { menor = p; melhor = m; }
      aplicar(m);
    }
    aplicar(melhor); formato(melhor);
    return mod;
  }

  function svg(texto, cor = '#14231B') {
    const m = gerar(texto), N = m.length, q = 4, T = N + q * 2;
    let d = '';
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (m[y][x]) d += `M${x + q} ${y + q}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${T} ${T}" shape-rendering="crispEdges"><rect width="${T}" height="${T}" fill="#fff"/><path d="${d}" fill="${cor}"/></svg>`;
  }

  const QR = { gerar, svg };
  if (typeof module !== 'undefined' && module.exports) module.exports = QR;
  else raiz.QR = QR;
})(typeof window !== 'undefined' ? window : globalThis);
