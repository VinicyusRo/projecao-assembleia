// Conexão com o banco online (Supabase) usando só a API web (sem bibliotecas extras)
class Nuvem {
  constructor({ url, chave, email, senha }) {
    this.url = String(url || '').replace(/\/+$/, '');
    this.chave = chave; this.email = email; this.senha = senha;
    this.token = null; this.refresh = null; this.expira = 0;
  }

  async entrar() {
    const r = await fetch(this.url + '/auth/v1/token?grant_type=password', {
      method: 'POST', headers: { apikey: this.chave, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.email, password: this.senha }), signal: AbortSignal.timeout(20000)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error(j.error_description || j.msg || 'E-mail ou senha da nuvem incorretos');
    this.guardar(j);
  }
  guardar(j) { this.token = j.access_token; this.refresh = j.refresh_token; this.expira = Date.now() + (j.expires_in || 3600) * 1000 - 60000; }
  async garantirToken() {
    if (this.token && Date.now() < this.expira) return;
    if (this.refresh) {
      const r = await fetch(this.url + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', headers: { apikey: this.chave, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: this.refresh }), signal: AbortSignal.timeout(20000)
      });
      if (r.ok) { this.guardar(await r.json()); return; }
    }
    await this.entrar();
  }

  async req(caminho, opcoes = {}, tentouDeNovo) {
    await this.garantirToken();
    const r = await fetch(this.url + caminho, Object.assign({}, opcoes, {
      headers: Object.assign({ apikey: this.chave, Authorization: 'Bearer ' + this.token }, opcoes.headers || {}),
      signal: AbortSignal.timeout(opcoes.tempo || 30000)
    }));
    if (r.status === 401 && !tentouDeNovo) { this.token = null; return this.req(caminho, opcoes, true); }
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      let msg = t; try { const j = JSON.parse(t); msg = j.message || j.error || j.msg || t; } catch { /* texto */ }
      throw new Error(`Nuvem (${r.status}): ${msg || r.statusText}`);
    }
    if (r.status === 204) return null;
    const tipo = r.headers.get('content-type') || '';
    return tipo.includes('json') ? r.json() : r.arrayBuffer();
  }

  // ----- tabelas -----
  listar(tabela) { return this.req(`/rest/v1/${tabela}?select=*&order=atualizado_em.desc`); }
  async inserir(tabela, linha) {
    const r = await this.req(`/rest/v1/${tabela}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(linha) });
    return r[0];
  }
  async atualizar(tabela, id, linha) {
    const r = await this.req(`/rest/v1/${tabela}?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(linha) });
    return r[0];
  }
  apagar(tabela, id) { return this.req(`/rest/v1/${tabela}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }); }

  // ----- arquivos (pasta "midia") -----
  async enviarArquivo(caminho, dados, tipo) {
    await this.req(`/storage/v1/object/midia/${caminho}`, { method: 'POST', headers: { 'Content-Type': tipo, 'x-upsert': 'true' }, body: dados, tempo: 120000 });
    return this.urlPublica(caminho);
  }
  apagarArquivo(caminho) { return this.req(`/storage/v1/object/midia/${caminho}`, { method: 'DELETE' }).catch(() => null); }
  urlPublica(caminho) { return `${this.url}/storage/v1/object/public/midia/${caminho}`; }
  caminhoDaUrl(u) { const p = `${this.url}/storage/v1/object/public/midia/`; return u && u.startsWith(p) ? u.slice(p.length) : null; }
}

module.exports = Nuvem;
