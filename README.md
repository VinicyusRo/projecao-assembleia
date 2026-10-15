# Projeção Assembleia

Programa de projeção da **Assembleia de Deus – Ministério Madureira (Campo do Jd. Comercial-SP)**.
Projeta letras, hinos da Harpa Cristã, Bíblia, avisos, banners, aniversariantes e visitantes no telão,
com app no celular para Recepção, Leitura, Mídia e Controle.

## Baixar e instalar

1. À direita desta página, em **Releases**, abra a versão mais nova e baixe o arquivo **.exe**.
2. Instale. Na primeira vez o Windows mostra "O Windows protegeu o computador":
   clique em **Mais informações → Executar assim mesmo** (o programa não tem certificado pago).
3. Depois disso o programa se atualiza sozinho: quando sair versão nova aparece o botão dourado **Atualizar** no topo.

Os dados ficam no computador, em `Documentos\ProjecaoADMadureira` (backup automático diário em
`Documentos\ProjecaoADMadureira-Backups`).

## Como publicar uma versão nova

1. Envie o arquivo `ProjecaoAssembleia-vX.zip` para este repositório (**Add file → Upload files → Commit changes**), sem descompactar.
2. O GitHub Actions ("Gerar instalador") faz o resto, sozinho:
   - usa o .zip enviado por último e numera a versão (1.6.N);
   - monta o instalador e publica em **Releases** (os computadores recebem pelo botão Atualizar);
   - descompacta o código aqui no repositório, organizado em pastas, e apaga o .zip.
3. Acompanhe em **Actions** (fica verde quando termina).

A pasta `.github/workflows` só muda à mão: quando vier um `instalador.yml` novo, abra
`.github/workflows/instalador.yml`, clique no lápis, cole o texto novo e salve.

O repositório precisa ser **público** para a atualização automática funcionar (não há senhas no código).

## Estrutura

| Pasta / arquivo | O que é |
| --- | --- |
| `main.js` | Processo principal (Electron): dados, janelas, servidor do celular (porta 4210), mídia online, Bíblia/Harpa online, atualizador |
| `preload.js` | Ponte segura entre as janelas e o processo principal |
| `src/index.html`, `renderer.js`, `style.css` | Tela do operador |
| `src/projetor.html`, `projetor.js` | Janela do telão |
| `src/fundo.js` | Fundos, avisos e painéis de aniversariantes e visitantes |
| `src/movel.html` | App do celular (Recepção, Leitura, Mídia, Controle) |
| `lib/` | Slides e Corretor (`texto.js`), Bíblia (`biblia.js`), igreja (`igreja.js`), letras online, nuvem (Supabase), atualizador, QR code |
| `assets/` | Logo, ícones e a fonte Inter (licença OFL) |
| `web/`, `nuvem/instalar.sql` | Página da mídia online e criação do banco no Supabase |
| `ferramentas/preparar-versao.js` | Usado pelo GitHub para numerar a versão |
| `docs/CONTEXTO-PROJETO.md` | Resumo completo do projeto (para continuar o desenvolvimento com o Claude) |
| `LEIA-ME.txt` | Manual de uso |

## Rodar sem instalar (para quem programa)

Com o Node.js instalado: `npm install` e depois `npm start` (ou dois cliques em `INICIAR.bat`).
