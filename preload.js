const { contextBridge, ipcRenderer } = require('electron');
const inv = (canal, ...a) => ipcRenderer.invoke(canal, ...a);
const ouvir = canal => cb => ipcRenderer.on(canal, (e, d) => cb(d));

contextBridge.exposeInMainWorld('api', {
  // letras e hinos
  listar: () => inv('musicas:listar'),
  salvar: m => inv('musicas:salvar', m),
  excluir: id => inv('musicas:excluir', id),
  importar: o => inv('musicas:importar', o),
  baixarHarpa: o => inv('harpa:baixar', o),
  // letras na internet
  buscarInternet: (q, f) => inv('internet:buscar', q, f),
  letraInternet: item => inv('internet:letra', item),
  chaveVagalume: k => inv('internet:chave', k),
  temChaveVagalume: () => inv('internet:temChave'),
  abrirLink: u => inv('internet:abrirLink', u),
  // bíblia
  listarBiblias: () => inv('biblias:listar'),
  importarBiblia: () => inv('biblias:importar'),
  bibliasOnline: () => inv('biblias:online'),
  baixarBiblia: cod => inv('biblias:baixar', cod),
  onBibliaProgresso: ouvir('biblias:progresso'),
  carregarBiblia: id => inv('biblias:carregar', id),
  renomearBiblia: (id, nome) => inv('biblias:renomear', id, nome),
  excluirBiblia: id => inv('biblias:excluir', id),
  // avisos
  listarAvisos: () => inv('avisos:listar'),
  salvarAviso: a => inv('avisos:salvar', a),
  excluirAviso: id => inv('avisos:excluir', id),
  // membros e visitantes
  listarMembros: () => inv('membros:listar'),
  salvarMembro: m => inv('membros:salvar', m),
  excluirMembro: id => inv('membros:excluir', id),
  importarMembros: () => inv('membros:importar'),
  fotoMembro: () => inv('membros:foto'),
  // backup
  infoBackup: () => inv('backup:info'),
  fazerBackup: () => inv('backup:fazer'),
  restaurarBackup: () => inv('backup:restaurar'),
  abrirPastaBackups: () => inv('backup:abrirPasta'),
  listarVisitantes: () => inv('visitantes:listar'),
  salvarVisitante: v => inv('visitantes:salvar', v),
  excluirVisitante: id => inv('visitantes:excluir', id),
  // imagens
  listarImagens: tipo => inv('imagens:listar', tipo),
  adicionarImagens: tipo => inv('imagens:adicionar', tipo),
  excluirImagem: (tipo, nome) => inv('imagens:excluir', tipo, nome),
  escolherImagem: tipo => inv('imagem:escolher', tipo),
  pastaBanners: () => inv('banners:pasta'),
  escolherPastaBanners: () => inv('banners:escolherPasta'),
  pastaBannersPadrao: () => inv('banners:pastaPadrao'),
  salvarMetaBanner: (nome, meta) => inv('banners:salvarMeta', nome, meta),
  novoBanner: (dataURL, nomeArquivo, meta) => inv('banners:novo', dataURL, nomeArquivo, meta),
  definirVisibilidade: (tipo, chave, campo, valor) => inv('visibilidade:definir', tipo, chave, campo, valor),
  onBannersMudou: ouvir('banners:mudou'),
  // config e culto
  obterConfig: () => inv('config:obter'),
  salvarConfig: c => inv('config:salvar', c),
  obterCulto: () => inv('culto:obter'),
  salvarCulto: c => inv('culto:salvar', c),
  // telão
  enviarEstado: s => ipcRenderer.send('estado:enviar', s),
  obterEstado: () => inv('estado:obter'),
  alternarProjetor: () => inv('projetor:alternar'),
  abrirTelao: () => inv('projetor:abrir'),
  fecharTelao: () => inv('projetor:fechar'),
  sairTelao: () => inv('projetor:sair'),
  teclaTelao: k => inv('projetor:tecla', k),
  onApresentacao: ouvir('telao:apresentacao'),
  abrirPasta: () => inv('pasta:abrir'),
  onEstado: ouvir('estado'),
  onProjetorStatus: ouvir('projetor:status'),
  // controle pelo celular
  enviarRemoto: s => ipcRenderer.send('remoto:estado', s),
  enviarCatalogo: c => ipcRenderer.send('remoto:catalogo', c),
  infoRemoto: () => inv('remoto:info'),
  obterAcessos: () => inv('acessos:obter'),
  novoPin: perfil => inv('acessos:novoPin', perfil),
  exigirPin: sim => inv('acessos:exigirPin', sim),
  onDadosMudou: ouvir('dados:mudou'),
  // mídia online (nuvem)
  nuvemObter: () => inv('nuvem:obter'),
  nuvemConectar: d => inv('nuvem:conectar', d),
  nuvemDesligar: () => inv('nuvem:desligar'),
  nuvemSincronizar: () => inv('nuvem:sincronizar'),
  nuvemEnviarLocais: () => inv('nuvem:enviarLocais'),
  onNuvemStatus: ouvir('nuvem:status'),
  onRemotoInfo: ouvir('remoto:info'),
  onRemotoCmd: ouvir('remoto:cmd'),
  // atualização do programa
  estadoAtualizacao: () => inv('atualizar:estado'),
  verificarAtualizacao: () => inv('atualizar:verificar'),
  instalarAtualizacao: () => inv('atualizar:instalar'),
  instalarAtualizacaoManual: () => inv('atualizar:manual'),
  onAtualizacao: ouvir('atualizar:status'),
  onAtualizacaoFeita: ouvir('atualizar:feito')
});
