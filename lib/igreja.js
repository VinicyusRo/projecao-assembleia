// Aniversariantes da semana e visitantes do dia
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Igreja = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const curta = d => pad(d.getDate()) + ' ' + MESES[d.getMonth()];

  // Aniversários dos últimos 7 dias (hoje e os 6 dias anteriores), mais recentes primeiro
  function aniversariantesDaSemana(membros, hoje = new Date()) {
    const t = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const out = [];
    for (const m of membros) {
      for (const ano of [t.getFullYear(), t.getFullYear() - 1]) {
        let dia = m.dia;
        const bissexto = new Date(ano, 1, 29).getMonth() === 1;
        if (m.mes === 2 && dia === 29 && !bissexto) dia = 28;
        const d = new Date(ano, m.mes - 1, dia);
        const diff = Math.round((t - d) / 864e5);
        if (diff >= 0 && diff <= 6) { out.push({ m, diff, data: d }); break; }
      }
    }
    return out.sort((a, b) => a.diff - b.diff || a.m.nome.localeCompare(b.m.nome, 'pt-BR'));
  }
  const rotuloData = x => (x.diff === 0 ? 'Hoje' : DIAS[x.data.getDay()]) + ' • ' + curta(x.data);
  function periodo(hoje = new Date()) {
    const a = new Date(hoje); a.setDate(a.getDate() - 6);
    return curta(a) + ' — ' + curta(hoje);
  }
  const visitantesDoDia = (lista, hoje = new Date()) =>
    lista.filter(v => v.data === iso(hoje)).sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
  const iniciais = n => String(n).trim().split(/\s+/).filter(p => p.length > 2 || /^[A-ZÀ-Ú]/.test(p)).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';

  // Visitante: quantas pessoas e a linha de descrição (convidado por / outra igreja)
  const pessoas = v => Math.max(1, +v.qtd || 1);
  // "joao e maria" -> "Joao e Maria" (só mexe quando foi digitado todo minúsculo ou todo MAIÚSCULO)
  const MINUSC = ['e', 'da', 'de', 'do', 'das', 'dos', 'di', 'du', 'del', 'van', 'von'];
  function nomeBonito(t) {
    const s = String(t || '').trim().replace(/\s+/g, ' ');
    if (!s || (s !== s.toLowerCase() && s !== s.toUpperCase())) return s;
    return s.toLowerCase().split(' ').map((w, i) => i > 0 && MINUSC.includes(w) ? w : w.replace(/(^|[-'])(\S)/g, (m, a, b) => a + b.toUpperCase())).join(' ');
  }
  const nomeVisitante = v => (nomeBonito(v.nome) || 'Visitante');
  function descVisitante(v) {
    if (v.tipo === 'igreja' && v.igreja) return nomeBonito(v.igreja);
    if (v.quem) return 'Convidado(a) por ' + nomeBonito(v.quem);
    return v.origem || '';
  }
  const totalPessoas = lista => lista.reduce((s, v) => s + pessoas(v), 0);
  const rotuloCulto = (d = new Date()) => 'Culto de ' + DIAS[d.getDay()].toLowerCase().replace('segunda', 'segunda-feira').replace('terça', 'terça-feira').replace('quarta', 'quarta-feira').replace('quinta', 'quinta-feira').replace('sexta', 'sexta-feira') + ' • ' + d.getDate() + ' ' + MESES[d.getMonth()];

  return { nomeBonito, pessoas, nomeVisitante, descVisitante, totalPessoas, rotuloCulto, aniversariantesDaSemana, rotuloData, periodo, visitantesDoDia, iniciais, iso, curta, DIAS, MESES };
});
