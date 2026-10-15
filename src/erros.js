// Mostra na tela qualquer erro inesperado (ajuda a descobrir problemas no computador da igreja)
function mostrarErro(msg) {
  let b = document.getElementById('faixaErro');
  if (!b) { b = document.createElement('div'); b.id = 'faixaErro'; b.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:9999;background:#B4442F;color:#fff;font:13px Segoe UI,Arial;padding:8px 14px;white-space:pre-wrap;max-height:40vh;overflow:auto;cursor:pointer'; b.title = 'Clique para fechar'; b.onclick = () => b.remove(); document.body.appendChild(b); }
  b.textContent = (b.textContent ? b.textContent + '\n' : 'Erro no programa (mande um print disto): ') + msg;
}
window.addEventListener('error', e => mostrarErro((e.message || '') + (e.filename ? ' @ ' + e.filename.split('/').pop() + ':' + e.lineno : '')));
window.addEventListener('unhandledrejection', e => { const m = String((e.reason && e.reason.message) || e.reason || ''); if (!/salvar/i.test(m)) mostrarErro('Promessa: ' + m); });
if (!window.api) mostrarErro('A ligação com o programa (preload) não carregou: window.api não existe.');
