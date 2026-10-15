// Atualização automática pelo GitHub Releases (sem dependências extras).
// O instalador gerado pelo GitHub Actions publica um "Release" com o .exe;
// o programa consulta a última versão, baixa em segundo plano e, quando o
// usuário clicar em "Atualizar", roda o instalador em modo silencioso e reabre.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const API = process.env.ATUALIZACAO_API || 'https://api.github.com';

// "1.4.12" > "1.4.9"
function maior(a, b) {
  const pa = String(a).replace(/^v/i, '').split(/[.-]/).map(n => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/i, '').split(/[.-]/).map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

class Atualizador {
  constructor({ repo, versao, pastaTemp, aviso }) {
    this.repo = repo;                 // "dono/repositorio"
    this.versao = versao;             // versão instalada
    this.pastaTemp = pastaTemp;
    this.aviso = aviso || (() => {});
    this.estado = { fase: repo ? 'parado' : 'sem-repo', versaoAtual: versao };
    this.ocupado = false;
  }
  mudar(d) { this.estado = Object.assign({ versaoAtual: this.versao }, d); this.aviso(this.estado); }

  async verificar() {
    if (!this.repo) { this.mudar({ fase: 'sem-repo' }); return this.estado; }
    if (this.ocupado) return this.estado;
    if (this.estado.fase === 'pronto') return this.estado;
    this.ocupado = true;
    try {
      this.mudar({ fase: 'verificando' });
      const r = await fetch(`${API}/repos/${this.repo}/releases/latest`, { headers: { 'User-Agent': 'Projecao-Assembleia', Accept: 'application/vnd.github+json' } });
      if (r.status === 404) { this.mudar({ fase: 'erro', erro: 'Nenhuma versão publicada ainda (ou o repositório do GitHub está privado).' }); return this.estado; }
      if (!r.ok) throw new Error('GitHub respondeu ' + r.status);
      const rel = await r.json();
      const versao = String(rel.tag_name || rel.name || '').replace(/^v/i, '');
      const exe = (rel.assets || []).find(a => /\.exe$/i.test(a.name));
      if (!versao || !exe || !maior(versao, this.versao)) {
        this.mudar({ fase: 'atualizado', quando: Date.now() });
        return this.estado;
      }
      const destino = path.join(this.pastaTemp, `Projecao-Assembleia-Atualizacao-${versao}.exe`);
      if (!(fs.existsSync(destino) && fs.statSync(destino).size === exe.size)) {
        this.mudar({ fase: 'baixando', versaoNova: versao, progresso: 0 });
        const d = await fetch(exe.browser_download_url, { headers: { 'User-Agent': 'Projecao-Assembleia' } });
        if (!d.ok || !d.body) throw new Error('download falhou (' + d.status + ')');
        const total = +d.headers.get('content-length') || exe.size || 0;
        let baixado = 0, ultimo = 0;
        const tmp = destino + '.parcial';
        const fonte = Readable.fromWeb(d.body);
        fonte.on('data', c => {
          baixado += c.length;
          const pct = total ? Math.floor(baixado * 100 / total) : 0;
          if (pct >= ultimo + 5) { ultimo = pct; this.mudar({ fase: 'baixando', versaoNova: versao, progresso: pct }); }
        });
        await pipeline(fonte, fs.createWriteStream(tmp));
        fs.renameSync(tmp, destino);
      }
      this.mudar({ fase: 'pronto', versaoNova: versao, arquivo: destino, notas: String(rel.body || '').slice(0, 600) });
    } catch (e) {
      this.mudar({ fase: 'erro', erro: 'Sem conexão com o GitHub ou falha no download: ' + e.message });
    } finally { this.ocupado = false; }
    return this.estado;
  }

  // Instala com segurança: um ajudante (PowerShell) espera o programa FECHAR de verdade, roda o
  // instalador em silêncio NA MESMA PASTA (e no mesmo modo: só para mim / todos os usuários),
  // registra o resultado num log e abre o programa de novo.
  instalar(sair, { exe, pid, log, marcador } = {}) {
    if (this.estado.fase !== 'pronto' || !fs.existsSync(this.estado.arquivo)) return false;
    const inst = this.estado.arquivo;
    exe = exe || process.execPath; pid = pid || process.pid;
    const P = process.platform === 'win32' ? path.win32 : path;
    const pastaApp = P.dirname(exe);
    const local = (process.env.LOCALAPPDATA || '').toLowerCase();
    const porMaquina = !(local && pastaApp.toLowerCase().startsWith(local));   // instalado em Arquivos de Programas?
    const args = ['/S', '--updated', porMaquina ? '/allusers' : '/currentuser', '/D=' + pastaApp];   // /D tem que ser o último
    if (marcador) { try { fs.writeFileSync(marcador, JSON.stringify({ de: this.versao, para: this.estado.versaoNova, arquivo: inst, quando: Date.now() })); } catch (_) {} }
    const anotar = t => { try { if (log) fs.appendFileSync(log, `[${new Date().toISOString().slice(0, 19)}] ${t}\r\n`); } catch (_) {} };
    try {
      let filho;
      if (process.platform === 'win32') {
        const q = t => "'" + String(t).replace(/'/g, "''") + "'";
        const nomeInst = P.basename(inst, '.exe');
        const script = [
          "$ErrorActionPreference = 'SilentlyContinue'",
          `$log = ${q(log || P.join(this.pastaTemp, 'projecao-atualizacao.log'))}`,
          "function Anota($t) { Add-Content -LiteralPath $log -Value ('[' + (Get-Date -Format s) + '] ' + $t) -Encoding UTF8 }",
          "Anota 'Ajudante de atualizacao comecou'",
          `Wait-Process -Id ${pid} -Timeout 90`,
          `Get-Process | Where-Object { $_.Path -eq ${q(exe)} } | Stop-Process -Force`,
          "Start-Sleep -Milliseconds 1500",
          "Anota 'Programa fechado; rodando o instalador'",
          `$p = Start-Process -FilePath ${q(inst)} -ArgumentList ${args.map(x => q(x)).join(',')} -Wait -PassThru`,
          "Anota ('Instalador terminou com codigo ' + $p.ExitCode)",
          // instalação "para todos": o instalador reabre com permissão de administrador; espera ele acabar
          `$t = 0; while ((Get-Process -Name ${q(nomeInst)} -ErrorAction SilentlyContinue) -and $t -lt 300) { Start-Sleep -Seconds 1; $t++ }`,
          `$v = (Get-Item -LiteralPath ${q(exe)}).VersionInfo.ProductVersion`,
          "Anota ('Versao instalada agora: ' + $v)",
          "Start-Sleep -Milliseconds 800",
          `Start-Process -FilePath ${q(exe)}`
        ].join('\r\n');
        // vai num arquivo .ps1 (UTF-8 com BOM, por causa do "ç" do nome) — o antivírus costuma barrar comando escondido/codificado
        const ps1 = P.join(P.dirname(log || P.join(this.pastaTemp, 'x')), 'atualizar-programa.ps1');
        fs.writeFileSync(ps1, '﻿' + script, 'utf8');
        anotar(`Programa: iniciando o ajudante (${ps1}) para instalar ${this.estado.versaoNova} em ${pastaApp}${porMaquina ? ' (todos os usuarios)' : ''}`);
        filho = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], { detached: true, stdio: 'ignore', windowsHide: true });
      } else {
        filho = spawn(inst, args, { detached: true, stdio: 'ignore' });
      }
      filho.on('error', e => anotar('Programa: o ajudante nao abriu: ' + e.message));
      filho.on('error', e => this.mudar({ fase: 'pronto', versaoNova: this.estado.versaoNova, arquivo: inst, erro: 'Não consegui iniciar a atualização: ' + e.message }));
      filho.once('spawn', () => setTimeout(sair, 300));   // fecha o programa; o ajudante espera e instala
      filho.unref();
    } catch (e) { this.mudar({ fase: 'erro', erro: 'Não consegui iniciar a atualização: ' + e.message }); return false; }
    return true;
  }
}

module.exports = { Atualizador, maior };
