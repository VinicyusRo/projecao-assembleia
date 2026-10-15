const $ = id => document.getElementById(id);
let ultimo = null;

function render(s) {
  const anterior = ultimo;
  ultimo = s;
  const c = s.config || {};
  const escala = window.innerWidth / 1920;

  aplicarFundo($('fundo'), c);
  $('fundo').style.opacity = s.modo === 'preto' ? 0 : 1;

  // Texto (letras, hinos, Bíblia)
  const texto = $('texto'), ref = $('ref');
  const novoTexto = s.modo === 'texto' ? (s.texto || '') : '';
  const novaRef = s.modo === 'texto' ? (s.ref || '') : '';
  const aplicar = () => {
    texto.textContent = novoTexto;
    texto.style.color = c.corTexto || '#fff';
    texto.style.textShadow = sombraTexto(c.corTexto);
    texto.style.textTransform = c.maiusculas ? 'uppercase' : 'none';
    ref.textContent = novaRef;
    ref.style.color = c.corTexto || '#fff';
    ref.style.textShadow = sombraTexto(c.corTexto);
    $('palco').style.paddingBottom = novaRef ? '9vh' : '0';
    ajustarFonte(texto, $('palco'), Math.round((c.fonte || 110) * escala), novaRef ? 0.72 : 0.88);
    texto.style.opacity = ref.style.opacity = 1;
  };
  if (anterior && anterior.modo === 'texto' && (anterior.texto !== novoTexto) && texto.textContent) {
    texto.style.opacity = ref.style.opacity = 0;
    setTimeout(aplicar, 120);
  } else aplicar();

  // Imagem / banner
  const img = $('imagem');
  if (s.modo === 'imagem' && s.img) img.style.backgroundImage = `url("${s.img}")`;
  img.style.opacity = s.modo === 'imagem' ? 1 : 0;

  // Aviso com fundo próprio
  const cartaz = $('cartaz');
  if (s.modo === 'cartaz' && s.cartaz) cartaz.innerHTML = htmlAviso(s.cartaz);
  cartaz.style.opacity = s.modo === 'cartaz' ? 1 : 0;

  // Painéis (aniversariantes / visitantes)
  const painel = $('painel');
  if (s.modo === 'painel' && s.painel) painel.innerHTML = htmlPainel(s.painel, c.logoImg, aSeguir(s));
  painel.style.opacity = s.modo === 'painel' ? 1 : 0;

  // Logo
  const logo = $('logo');
  const src = c.logoImg || LOGO_PADRAO;
  if (logo.dataset.src !== src) { logo.innerHTML = `<img src="${src}" alt="">`; logo.dataset.src = src; }
  logo.style.opacity = s.modo === 'logo' ? 1 : 0;

  // Faixa de aviso rápido
  const faixa = $('aviso');
  faixa.textContent = s.faixa || '';
  faixa.style.display = s.faixa ? 'block' : 'none';
  document.body.classList.toggle('com-faixa', !!s.faixa);
}

// "A seguir • em 06s" do rotativo
function aSeguir(s) {
  if (!s.aSeguir) return null;
  const seg = s.aSeguir.trocaEm ? Math.max(0, Math.ceil((s.aSeguir.trocaEm - Date.now()) / 1000)) : null;
  return { nome: s.aSeguir.nome, segundos: seg };
}
setInterval(() => {
  if (!ultimo || ultimo.modo !== 'painel') return;
  const a = aSeguir(ultimo), el = document.querySelector('#painel [data-contagem]');
  if (a && el) el.textContent = a.segundos != null ? 'A SEGUIR • EM ' + String(a.segundos).padStart(2, '0') + 'S' : 'A SEGUIR';
}, 250);

window.api.onEstado(render);
// modo apresentação (segunda tela): esconde o cursor do mouse
if (window.api.onApresentacao) window.api.onApresentacao(sim => { document.documentElement.style.cursor = sim ? 'none' : ''; document.body.style.cursor = sim ? 'none' : ''; });
// teclas apertadas com a janela do telão em foco vão para o programa (Esc, Espaço, setas, B…)
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') { window.api.sairTelao(); return; }
  if ([' ', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'PageDown', 'PageUp', 'b', 'B', '.'].includes(e.key)) { e.preventDefault(); window.api.teclaTelao(e.key); }
});
window.api.obterEstado().then(s => s && render(s));
window.addEventListener('resize', () => ultimo && render(ultimo));
