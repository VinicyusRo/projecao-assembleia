# Projeção Assembleia — contexto completo do projeto

Resumo de tudo o que foi pedido, decidido e construído, para continuar o desenvolvimento em conversas novas
sem perder o histórico. Atualizado em 15/10/2026 (versão 1.6.x).

---

## 1. Instruções para o Claude (colar em "Instruções do projeto")

> Você está ajudando a desenvolver o **Projeção Assembleia**, programa de projeção (estilo Holyrics) da
> Assembleia de Deus – Ministério Madureira, Campo do Jd. Comercial-SP. Responda sempre em **português do Brasil**,
> de forma simples e direta: o usuário (Vinicyus) não é programador e usa o GitHub pelo navegador.
>
> - O código-fonte completo está no repositório do GitHub da igreja (e no arquivo de conhecimento anexado).
>   Antes de mudar algo, leia o arquivo atual; nunca reescreva de memória.
> - Entregue cada versão como **ProjecaoAssembleia-vX.zip** (pasta `projecao/` inteira, sem `node_modules` e `dist`),
>   sem arquivos com nomes inválidos no Windows (`\ : * ? " < > |`). Se mudar o `instalador.yml`, entregue-o separado
>   e avise que precisa ser colado à mão em `.github/workflows/instalador.yml`.
> - Teste antes de entregar (Electron real com Xvfb + Playwright via CDP; simule o celular com viewport 390×844).
> - Mostre prévia (imagem) antes de mudanças grandes de visual quando o usuário pedir.
> - Explique as instruções de atualização no fim, em passos curtos.
> - Preferências do usuário: sem PIN no celular; telão só abre ao projetar; nada de botão "Logo"; faixa de
>   miniaturas só aparece projetando; Esc 1x sai do telão e 2x limpa o centro; não comprar certificado de código.

---

## 2. O que é

- Programa **Electron** (Windows) com: janela do operador, janela do telão (2ª tela em tela cheia),
  servidor HTTP local (porta 4210) que serve o app do celular (PWA), e atualizador próprio pelo GitHub Releases.
- Cores: verde `#1B4D3A`, verde claro `#2E7A58`, bege `#EFE6D2`/`#F4F1EA`, dourado `#E0B96A`, branco.
- Logo e ícone: logo da Assembleia de Deus (`assets/logo.png`, `assets/icone.ico`). Nome: **Projeção Assembleia**.
- Fonte do telão: Inter embutida (`assets/fontes/*.woff`, licença OFL) com o nome `'Projecao Inter'`.

## 3. Funções (todas implementadas)

**Letras** — importar .txt (nome do arquivo = título), criar/editar (F2), **Corretor** (tira pontuação final,
ajusta espaços, maiúsculas, remove cifras; mostra antes/depois; Desfazer), pesquisa de letras na internet
(LRCLIB sem chave; Vagalume com chave grátis opcional), formatação de slides (estrofes, 2/4/6 linhas).
Regra dos slides: **linha em branco = novo slide; quebra simples = mesmo slide**.

**Hinos** — hinário numerado (padrão "Harpa Cristã"), busca por número (15 + Enter), importar .txt com número
no nome, botão **⬇ Harpa** baixa os 640 hinos (JSON público de DanielLiberato no GitHub, com jsDelivr de reserva):
estrofe, coro, estrofe, coro; Corretor opcional; não substitui hinos existentes a não ser que marque "Substituir".

**Bíblia** — "+ Versão": baixar da **Bolls Bible** (`https://bolls.life/static/translations/<COD>.json`;
ARC09, ACF11, ARA, NAA, ALM21, NVIPT, NVT, NTLH, KJA, TB10, NBV07, VFL, OL, MENS) ou importar .json/.xml
(Zefania/OSIS). Texto limpo de HTML e números de Strong. **Campo inteligente**: "ge" → Gênesis; capítulo e
versículo só aceitam números que existem; auto-avança quando não cabe mais dígito; ":" `.` `,` espaço separam;
"-" faz trecho; Espaço escolhe o primeiro livro parecido; Enter projeta e libera o campo (setas passam).
Grade de capítulos e **versículos** (vermelho = no telão). Passar do último versículo vai ao 1º do próximo
capítulo (e livro); ↑ no primeiro volta ao anterior.

**Avisos** — avisos montados pelo programa (título, texto, tema ou imagem de fundo, escurecer, cores, tamanho,
posição, destaque, datas de/até, "Anunciar no telão"), "Texto rápido".

**Imagens (banners)** — artes prontas (Canva 16:9). "+ Adicionar imagens" abre **Novo banner** (arrastar e
soltar ou escolher; título automático pelo nome do arquivo; descrição e datas). Arrastar 1 imagem para a aba
abre a janela; várias são adicionadas direto. Pasta pode ser OneDrive/Drive.

**Botões rápidos Telão / Leitura** — em cada aviso e banner (PC e celular/Mídia): liga/desliga nos avisos
automáticos (`rotativo`) e na Leitura (`leitura-oculta.json`).

**Igreja** — membros (nome ou casal, data dd/mm com barra automática e validação, casamento, foto), importar
lista (.csv/.txt "Nome; 15/03; casamento"); aniversariantes da semana; visitantes (aparecem só no dia).

**Projetar avisos (rotativo)** — a cada 8 s (ajustável): aniversariantes (cartões do mesmo tamanho, até 4 por
tela, foto ou inicial em fundo bege, "É HOJE!", "CASAMENTO"), visitantes (até 6, etiquetas "1ª VISITA" e
"N PESSOAS"), avisos e banners. Pílula "A SEGUIR • EM 06S" no rodapé. **Espaço pausa/continua**.
Painéis num quadro 16:9 centralizado (não deformam em tela larga). Nomes em minúsculo viram "Joao e Maria"
só na exibição (`nomeBonito`).

**Telão** — abre sozinho ao projetar (▶, Enter, clique no slide); 2ª tela: tela cheia, sem bordas, sem cursor,
por cima de tudo, sem deixar a tela apagar; muda de tela sozinho se o projetor for ligado depois.
**Esc 1x** = sai e fecha o telão; **Esc 2x** = limpa o centro (e a Bíblia). Tela preta (B). Sem botão Logo
(a logo fica no papel de parede do computador). Aviso rápido (faixa) no rodapé. Indicador "Telão no ar / fechado".

**Faixa de miniaturas** (estilo Holyrics) embaixo — só aparece enquanto algo é projetado.

**Lista do culto** e anotações; temas de fundo; configurações de exibição.

**App no celular** (navegador, mesmo Wi-Fi; endereço + **QR code** no botão "App celular"; sem PIN, PIN opcional):
- **Recepção**: registrar/editar/apagar visitantes (nome ou família, quantas pessoas, convidado por alguém com
  sugestão de membros ou de outra igreja, 1ª visita; tudo opcional → "Visitante").
- **Leitura**: só texto (título/descrição de banners e avisos do dia, aniversariantes, visitantes).
- **Mídia**: criar/editar/excluir avisos e banners (foto do celular), datas, botões Telão/Leitura.
- **Controle**: "No telão" (lista de slides, próximo/anterior, tela preta, sair, pausar/parar avisos automáticos)
  e "Projetar" (avisos automáticos, Culto, Hinos por número, Letras, **Bíblia com o mesmo campo inteligente**
  ou livro → capítulo → versículo, Avisos, Imagens).

**Mídia online** (opcional) — Supabase (tabelas `avisos`, `banners`, bucket `midia`; `nuvem/instalar.sql`),
página `web/` (GitHub Pages) para a equipe publicar de casa; o PC sincroniza a cada minuto e guarda cópia local.

**Backup** — automático diário (10 últimos) em `Documentos\ProjecaoADMadureira-Backups`; manual (pendrive/nuvem);
restaurar. Mostra também a versão e "Procurar atualização".

## 4. Dados (`Documentos\ProjecaoADMadureira`)

`musicas.json`, `avisos.json`, `banners.json`, `membros.json`, `visitantes.json`, `culto.json`, `config.json`,
`leitura-oculta.json`, `nuvem-cache.json`, `biblias/` (+ `indice.json`), `imagens/` (banners, fundos, avisos,
membros), `erros.log`, `atualizacao.log`, `atualizacao-pendente.json`, `atualizar-programa.ps1`.

## 5. Código

| Arquivo | Papel |
| --- | --- |
| `main.js` | IPC (ipcMain.handle), dados JSON, janelas, servidor 4210 (rotas `/api/...` com perfil por cabeçalho `x-perfil`), catálogo para o celular, Bíblia/Harpa online, nuvem, modo apresentação, atualizador |
| `preload.js` | `window.api` via contextBridge (**não declarar `const api` no renderer**: quebra tudo no Electron) |
| `src/renderer.js` | Tela do operador (estado do telão, slides, rotativo, campo bíblico `REF`, teclado `teclaTelao`) |
| `src/projetor.js/.html` | Telão; teclas no telão são repassadas ao operador |
| `src/fundo.js` | `aplicarFundo`, `ajustarFonte` (mede um span; não mede escondido), `htmlAviso`, `htmlPainel` |
| `src/movel.html` | App do celular (campo bíblico `RC` lê o texto a cada `input`, por causa do teclado do celular) |
| `lib/texto.js` | `gerarSlides`, `corrigir`, normalização |
| `lib/biblia.js` | `LIVROS` (nome, abrev, apelidos, OSIS), `acharLivro`, `interpretarReferencia`, leitura de arquivos |
| `lib/igreja.js` | aniversariantes, visitantes, `nomeBonito`, `descVisitante` |
| `lib/atualizador.js` | GitHub Releases: verifica, baixa, e no Windows grava `atualizar-programa.ps1` (UTF-8 com BOM) que espera o programa fechar, roda o instalador `/S --updated /allusers|/currentuser /D=<pasta>`, anota no log e reabre |
| `lib/nuvem.js`, `lib/letrasOnline.js`, `lib/qr.js` | Supabase, letras online, QR code (gerador próprio) |

## 6. Instalador, GitHub e atualização

- Repositório da igreja (usuário **VinicyusRo**), **público**. Workflow `.github/workflows/instalador.yml`
  ("Gerar instalador", em push e manual): pega o `.zip` enviado por último (data do commit; empate → nome maior),
  valida os arquivos, cria ícone se faltar, numera a versão `major.minor.<run_number>`
  (`ferramentas/preparar-versao.js`, grava `atualizacao.repo`), `electron-builder --win --x64` (NSIS,
  `oneClick:false`, `perMachine:false`), publica Release `v<versão>` (softprops/action-gh-release),
  e copia o código para o repositório (robocopy /MIR sem `.github`) apagando os .zip, com commit `[skip ci]`.
- Programa: verifica ao abrir (20 s) e a cada 3 h; botão dourado "Atualizar para X"; ao reabrir confere a versão;
  se falhou, oferece abrir o instalador normal (plano B).
- Sem certificado de código (decisão do usuário): aviso do SmartScreen só na 1ª instalação.

## 7. Como testar (ambiente do Claude)

- Electron real baixado do GitHub (`electron-v33.x-linux-x64.zip`), rodando com `HOME=<pasta de teste>`,
  Xvfb e `--remote-debugging-port=9333`; Playwright conecta via CDP.
- Simulações: `BOLLS_URL`, `HARPA_URL`, `ATUALIZACAO_REPO`/`ATUALIZACAO_API` (servidores locais de teste);
  duas telas simuladas sobrescrevendo `screen.getAllDisplays` via `NODE_OPTIONS=-r`.
- Nunca deixar arquivos de teste dentro de `projecao/` (um arquivo com `C:\...` no nome quebrou o GitHub).

## 8. Pendências

- Confirmar no PC da igreja que a atualização pelo botão dourado instala e reabre (versão com o ajudante .ps1).
- Testar a tela cheia no projetor real (Windows+P → Estender).
- Baixar ARC e Harpa no PC da igreja e conferir os hinos mais cantados.
