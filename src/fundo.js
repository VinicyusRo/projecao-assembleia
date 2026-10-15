// Funções compartilhadas entre o telão, a prévia e as miniaturas
window.LOGO_PADRAO = '../assets/logo.png';

window.TEMAS = [
  { nome: 'Verde', css: 'linear-gradient(135deg,#0f3d2c,#1b4d3a 55%,#0b2a1e)', cor: '#0c241a', texto: '#ffffff' },
  { nome: 'Verde luz', css: 'radial-gradient(circle at 30% 20%,#2e7a58,#0f3123 70%)', cor: '#0f3123', texto: '#ffffff' },
  { nome: 'Dourado', css: 'radial-gradient(circle at 50% 115%,rgba(224,185,106,.55),transparent 60%),linear-gradient(#123828,#0c241a)', cor: '#0c241a', texto: '#ffffff' },
  { nome: 'Bege', css: 'linear-gradient(135deg,#f4f1ea,#e6d8b8)', cor: '#efe6d2', texto: '#1b4d3a' },
  { nome: 'Branco', css: 'linear-gradient(#ffffff,#f1ede3)', cor: '#ffffff', texto: '#14231b' },
  { nome: 'Noite', css: 'linear-gradient(160deg,#0b1630,#1d2f5a)', cor: '#0b1630', texto: '#ffffff' },
  { nome: 'Preto', css: null, cor: '#000000', texto: '#ffffff' }
];

const escH = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

window.aplicarFundo = function (el, c) {
  el.style.backgroundColor = c.fundoCor || '#000';
  if (c.fundoImg) el.style.backgroundImage = `url("${c.fundoImg}")`;
  else if (c.fundoCss) el.style.backgroundImage = c.fundoCss;
  else el.style.backgroundImage = 'none';
};

// Reduz a fonte até cada linha caber inteira; se ficar pequena demais, permite quebrar
window.ajustarFonte = function (el, caixa, max, fator = 0.88) {
  if (!caixa.clientWidth || !caixa.clientHeight) return;   // escondido: mede depois, quando aparecer
  const cabe = () => el.scrollHeight <= caixa.clientHeight * fator && el.scrollWidth <= el.clientWidth + 1;
  el.style.whiteSpace = 'pre';
  let tam = max; el.style.fontSize = tam + 'px';
  while (tam > max * 0.55 && !cabe()) { tam -= 1; el.style.fontSize = tam + 'px'; }
  if (cabe()) return;
  el.style.whiteSpace = 'pre-line';
  tam = max; el.style.fontSize = tam + 'px';
  while (tam > 5 && !cabe()) { tam -= 1; el.style.fontSize = tam + 'px'; }
};

// Sombra só quando o texto é claro (em fundos claros a sombra escura borra a letra)
window.sombraTexto = function (cor) {
  const m = /^#?([0-9a-f]{6})$/i.exec(cor || '#ffffff');
  const n = m ? parseInt(m[1], 16) : 0xffffff;
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.5 ? '0 .04em .14em rgba(0,0,0,.9), 0 0 .3em rgba(0,0,0,.5)' : '0 0 .25em rgba(255,255,255,.6)';
};

// ---------- Aviso (cartaz) com fundo e estilo próprios ----------
window.AVISO_PADRAO = {
  titulo: 'Novo aviso', texto: '', fundoTipo: 'tema', fundoTema: 0, fundoCor: '#1b4d3a', fundoImg: null,
  escurecer: 0, corTitulo: '#ffffff', corTexto: '#f4f1ea', tamanho: 100, posicao: 'centro', destaque: true
};
window.fundoDoAviso = function (a) {
  if (a.fundoTipo === 'img' && a.fundoImg) return `#000 url('${String(a.fundoImg).replace(/'/g, '%27')}') center / cover no-repeat`;
  if (a.fundoTipo === 'cor') return a.fundoCor || '#000';
  const t = TEMAS[a.fundoTema || 0] || TEMAS[0];
  return t.css ? `${t.css}, ${t.cor}` : t.cor;
};
window.htmlAviso = function (aviso) {
  const a = Object.assign({}, AVISO_PADRAO, aviso);
  const k = (a.tamanho || 100) / 100;
  const pos = {
    centro: 'justify-content:center;align-items:center;text-align:center',
    baixo: 'justify-content:flex-end;align-items:center;text-align:center',
    topo: 'justify-content:flex-start;align-items:center;text-align:center',
    esquerda: 'justify-content:center;align-items:flex-start;text-align:left'
  }[a.posicao] || '';
  const sombra = a.fundoTipo === 'img' ? 'text-shadow:0 .08em .3em rgba(0,0,0,.6);' : '';
  const linha = a.destaque ? `<div style="width:9cqw;height:.55cqw;background:#E0B96A;border-radius:1cqw;margin:1.6cqw 0"></div>` : '<div style="height:1.4cqw"></div>';
  return `<div style="position:absolute;inset:0;container-type:size;overflow:hidden;font-family:'Segoe UI',system-ui,Arial,sans-serif">
    <div style="position:absolute;inset:0;background:${fundoDoAviso(a)}"></div>
    <div style="position:absolute;inset:0;background:rgba(0,0,0,${(a.escurecer || 0) / 100})"></div>
    <div style="position:absolute;inset:7cqh 7cqw;display:flex;flex-direction:column;${pos};${sombra}">
      <div style="font-weight:800;font-size:${(7 * k).toFixed(2)}cqw;line-height:1.05;color:${a.corTitulo};white-space:pre-line">${escH(a.titulo)}</div>
      ${a.texto ? linha + `<div style="font-weight:500;font-size:${(3.6 * k).toFixed(2)}cqw;line-height:1.3;color:${a.corTexto};white-space:pre-line;max-width:80cqw">${escH(a.texto)}</div>` : ''}
    </div></div>`;
};

// ---------- Painéis do rotativo: aniversariantes e visitantes ----------
// Cartões de tamanho fixo (sempre o mesmo, com 1 ou 4 pessoas), alinhados à esquerda.
const urlCss = u => `url('${String(u).replace(/'/g, '%27')}')`;
window.htmlPainel = function (p, logo, aSeguir) {
  const I = window.Igreja;
  const fonte = `'Projecao Inter','Inter','Segoe UI',system-ui,Arial,sans-serif`;
  // fundo ocupa a tela toda; o conteúdo fica num quadro 16:9 centralizado (não deforma em telas mais largas)
  const moldura = conteudo => `<div style="position:absolute;inset:0;container-type:size;overflow:hidden;font-family:${fonte};color:#fff;background:#0f2a20">
    <div style="position:absolute;left:-9cqw;top:-16cqw;width:30cqw;height:30cqw;border-radius:50%;background:#16382b"></div>
    <div style="position:absolute;right:-12cqw;bottom:-22cqw;width:36cqw;height:36cqw;border-radius:50%;background:#14352a"></div>
    <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(100cqw,177.78cqh);height:min(100cqh,56.25cqw)">
      <div style="position:absolute;inset:0;container-type:size">${conteudo}</div>
    </div></div>`;
  const topo = (olho, titulo, sub) => `
    <div style="flex:none;padding-right:12cqw">
      <div style="color:#E0B96A;font-weight:800;letter-spacing:.12em;font-size:1.9cqw;line-height:1.2;text-transform:uppercase">${escH(olho)}</div>
      <div style="font-weight:800;font-size:5.6cqw;line-height:1.08;margin-top:.4cqh;letter-spacing:-.025em">${escH(titulo)}</div>
      <div style="font-size:2.2cqw;line-height:1.3;font-weight:500;color:#d8e6dd;margin-top:.6cqh">${escH(sub)}</div>
    </div>`;
  const logoImg = `<img src="${escH(logo || LOGO_PADRAO)}" style="position:absolute;top:4.5cqh;right:4cqw;width:7cqw;height:7cqw;object-fit:contain;background:#fff;border-radius:50%;box-shadow:0 .4cqw 1.6cqw rgba(0,0,0,.3)">`;
  const pagina = p.total > 1 ? `<div style="position:absolute;left:4cqw;bottom:2.4cqh;height:6.4cqh;display:flex;align-items:center;font-size:1.6cqw;font-weight:700;color:#9fbfae;letter-spacing:.08em">${p.pagina} DE ${p.total}</div>` : '';
  // "A seguir" numa pílula de uma linha, no rodapé, sem cobrir os cartões
  const seguir = aSeguir ? `
    <div data-seguir style="position:absolute;right:4cqw;bottom:2.4cqh;height:6.4cqh;display:flex;align-items:center;gap:1cqw;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);border-radius:4cqh;padding:0 1.6cqw;max-width:52cqw">
      <span style="color:#E0B96A;font-weight:800;font-size:1.35cqw;letter-spacing:.1em;white-space:nowrap" data-contagem>${aSeguir.segundos != null ? 'A SEGUIR • EM ' + String(aSeguir.segundos).padStart(2, '0') + 'S' : 'A SEGUIR'}</span>
      <span style="font-weight:700;font-size:1.8cqw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escH(aSeguir.nome)}</span>
    </div>` : '';
  // cabeçalho em cima, cartões ocupando o espaço que sobra até o rodapé
  const pagina16x9 = (cab, cartoes) => moldura(`
    <div style="position:absolute;left:4cqw;right:4cqw;top:4.5cqh;bottom:11cqh;display:flex;flex-direction:column">
      ${cab}<div style="flex:1;min-height:0;margin-top:3.2cqh">${cartoes}</div>
    </div>${logoImg}${pagina}${seguir}`);
  const selo = txt => `<span style="position:absolute;top:1cqw;left:1cqw;background:#E0B96A;color:#14231B;font-weight:800;font-size:1.5cqw;letter-spacing:.04em;padding:.45cqw 1cqw;border-radius:2cqw;box-shadow:0 .2cqw .6cqw rgba(0,0,0,.2)">${txt}</span>`;

  if (p.tipo === 'aniv') {
    const itens = p.itens.map(x => Object.assign({}, x, { data: typeof x.data === 'string' ? new Date(x.data + 'T12:00:00') : new Date(x.data) }));
    const cartao = x => {
      const hoje = x.diff === 0, nome = I.nomeBonito ? I.nomeBonito(x.m.nome) : x.m.nome;
      const foto = x.m.foto
        ? `<div style="height:100%;background:#e9e2d0 ${urlCss(x.m.foto)} center / cover no-repeat"></div>`
        : `<div style="height:100%;background:linear-gradient(160deg,#f1eadb,#e2d5b6);display:flex;align-items:center;justify-content:center;color:#1B4D3A;font-size:8cqw;font-weight:800">${escH(String(nome).trim().charAt(0).toUpperCase())}</div>`;
      return `<div style="position:relative;box-sizing:border-box;width:21.8cqw;height:100%;flex:none;border-radius:1.2cqw;overflow:hidden;background:#173a2c;border:.18cqw solid ${hoje ? '#E0B96A' : 'rgba(255,255,255,.12)'};display:flex;flex-direction:column;box-shadow:0 .6cqw 2cqw rgba(0,0,0,.25)">
        <div style="position:relative;height:57%">${foto}${hoje ? selo('É HOJE!') : ''}${x.m.casal ? `<span style="position:absolute;top:1cqw;right:1cqw;background:#f4f1ea;color:#1B4D3A;font-weight:800;font-size:1.2cqw;letter-spacing:.03em;padding:.45cqw .9cqw;border-radius:2cqw">CASAMENTO</span>` : ''}</div>
        <div style="flex:1;padding:1.4cqw 1.6cqw 1.3cqw;display:flex;flex-direction:column;justify-content:space-between;min-height:0">
          <div style="font-weight:800;font-size:2.8cqw;line-height:1.1;letter-spacing:-.015em;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escH(nome)}</div>
          <div style="color:#E0B96A;font-weight:800;font-size:1.65cqw;letter-spacing:.03em;text-transform:uppercase;white-space:nowrap">${escH(I.rotuloData(x))}</div>
        </div></div>`;
    };
    return pagina16x9(topo('Celebramos juntos • ' + I.periodo(), 'Aniversariantes da Semana', 'Que este novo ciclo seja repleto da presença, da graça e do amor de Deus.'),
      `<div style="height:100%;display:flex;gap:1.6cqw">${itens.map(cartao).join('')}</div>`);
  }
  if (p.tipo === 'visit') {
    const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    const etq = (txt, lado, ouro) => `<span style="position:absolute;top:1.1cqw;${lado}:1.1cqw;background:${ouro ? '#E0B96A' : 'rgba(255,255,255,.14)'};color:${ouro ? '#14231B' : '#fff'};font-weight:800;font-size:1.3cqw;letter-spacing:.05em;padding:.38cqw .9cqw;border-radius:2cqw">${txt}</span>`;
    const cartao = v => `<div style="position:relative;box-sizing:border-box;min-width:0;min-height:0;border-radius:1.2cqw;background:#173a2c;border:.18cqw solid ${v.primeira ? '#E0B96A' : 'rgba(255,255,255,.12)'};padding:3.8cqw 2cqw 1.4cqw;display:flex;flex-direction:column;justify-content:center;box-shadow:0 .6cqw 2cqw rgba(0,0,0,.22)">
        ${v.primeira ? etq('1ª VISITA', 'left', true) : ''}${I.pessoas(v) > 1 ? etq(I.pessoas(v) + ' PESSOAS', 'right', false) : ''}
        <div style="font-weight:800;font-size:3.1cqw;line-height:1.1;letter-spacing:-.015em;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escH(I.nomeVisitante(v))}</div>
        <div style="font-size:1.85cqw;line-height:1.25;font-weight:500;color:#d8e6dd;margin-top:.6cqw;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escH(I.descVisitante(v) || 'Seja bem-vindo(a)!')}</div>
      </div>`;
    return pagina16x9(topo('Culto • ' + hoje, 'Sejam Bem-Vindos!', `Que alegria receber você. ${p.quantos} visitante${p.quantos > 1 ? 's' : ''} hoje.`),
      `<div style="height:100%;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:2.4cqh 1.6cqw">${p.itens.map(cartao).join('')}</div>`);
  }
  return '';
};
