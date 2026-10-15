// Usado pelo GitHub Actions: numera a versão (ex.: 1.5.12) e grava qual
// repositório o programa deve consultar para se atualizar sozinho.
const fs = require('fs');
const path = require('path');
const pasta = process.argv[2] || '.';
const arq = path.join(pasta, 'package.json');
const p = JSON.parse(fs.readFileSync(arq, 'utf8'));
const [maior, menor] = String(p.version || '1.0.0').split('.');
p.version = `${maior}.${menor}.${process.env.GITHUB_RUN_NUMBER || 0}`;
p.atualizacao = { repo: process.env.GITHUB_REPOSITORY || '' };
fs.writeFileSync(arq, JSON.stringify(p, null, 2));
console.log(`Versão ${p.version} · atualizações em github.com/${p.atualizacao.repo}`);
const saida = process.env.GITHUB_ENV;
if (saida) fs.appendFileSync(saida, `VERSAO=${p.version}\n`);
