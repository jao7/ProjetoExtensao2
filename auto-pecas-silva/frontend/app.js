const API = (window.CONFIG && CONFIG.API_URL) || 'http://localhost:3000/api';
const $ = (s) => document.querySelector(s);
const R = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fd = (d) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const ALL = ['painel', 'produtos', 'clientes', 'fornecedores', 'estoque', 'venda', 'relatorios'];
// O menu só esconde opções. Quem realmente bloqueia o acesso é o backend (HTTP 403).
const PERF = { 'Proprietário': ALL, 'Gerente': ALL, 'Estoquista': ['painel', 'produtos', 'fornecedores', 'estoque'], 'Vendedor': ['painel', 'produtos', 'clientes', 'venda'] };
const NOME = { painel: 'Painel', produtos: 'Produtos', clientes: 'Clientes', fornecedores: 'Fornecedores', estoque: 'Entrada de estoque', venda: 'Vendas', relatorios: 'Relatórios' };
const CF = {
  produtos: { t: 'Produtos', f: [['codigo', 'Código'], ['descricao', 'Descrição'], ['categoria', 'Categoria'], ['preco', 'Preço (R$)', 'n'], ['estoque_minimo', 'Estoque mínimo', 'n']], s: ['codigo', 'descricao', 'categoria', 'preco', 'estoque', 'estoque_minimo'] },
  clientes: { t: 'Clientes', f: [['nome', 'Nome'], ['documento', 'CPF/CNPJ'], ['telefone', 'Telefone']], s: ['nome', 'documento', 'telefone'] },
  fornecedores: { t: 'Fornecedores', f: [['nome', 'Razão social'], ['documento', 'CNPJ'], ['contato', 'Contato']], s: ['nome', 'documento', 'contato'] }
};

let TOKEN = sessionStorage.getItem('tk');
let U = JSON.parse(sessionStorage.getItem('us') || 'null');
let UI = {}, MSG = '';
function newV() { return { c: '', i: [], g: 'Pix', o: 0 }; }
function newE() { return { f: '', i: [] }; }
let V = newV(), E = newE();

async function api(path, opt = {}) {
  const r = await fetch(API + path, {
    method: opt.method || 'GET',
    headers: Object.assign({ 'Content-Type': 'application/json' }, TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}),
    body: opt.body ? JSON.stringify(opt.body) : undefined
  });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  if (r.status === 401 && TOKEN) { logout('Sessão expirada. Entre novamente.'); throw new Error('Sessão expirada'); }
  if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status);
  return j;
}
function logout(msg) {
  TOKEN = null; U = null; sessionStorage.clear(); MSG = msg || ''; location.hash = ''; render();
}

const opt = (a, n, s) => a.map((x) => `<option value="${x.id}" ${String(x.id) === String(s) ? 'selected' : ''}>${esc(x[n])}</option>`).join('');
const tot = (a) => a.reduce((s, x) => s + x.q * x.p, 0);
const lab = (C, c) => (c === 'estoque' ? 'Estoque' : C.f.find((a) => a[0] === c)[1]);
const sync = () => { const a = $('#v_c'); if (a) V.c = a.value; const g = $('#v_g'); if (g) V.g = g.value; };

function login() {
  return `<div class="lg"><div class="c"><h1>Auto Peças Silva</h1><p class="m">Sistema de Gestão de Estoque e Vendas</p>
  <label>Usuário<input id="l_u" placeholder="proprietario, gerente, estoquista ou vendedor" autocomplete="username"></label>
  <label>Senha<input id="l_s" type="password" placeholder="Senha de demonstração: 1234" autocomplete="current-password"></label>
  <button data-a="lg">Entrar</button></div></div>`;
}

const VIEWS = {
  async painel() {
    const d = await api('/painel'), ok = PERF[U.perfil];
    return `<h1>Painel</h1><div class="g"><div class="c"><span class="m">Vendas hoje</span><div class="k">${d.vendas_hoje}</div></div><div class="c"><span class="m">Orçamentos abertos</span><div class="k">${d.orcamentos_abertos}</div></div><div class="c"><span class="m">Itens no estoque mínimo</span><div class="k ${d.alertas.length ? 'w' : ''}">${d.alertas.length}</div></div><div class="c"><span class="m">Faturamento do mês</span><div class="k">${R(d.faturamento_mes)}</div></div></div>
    <div class="r np" style="margin-bottom:12px">${ok.includes('venda') ? '<button data-a="go" data-to="venda">Nova venda</button>' : ''}${ok.includes('estoque') ? '<button class="s" data-a="go" data-to="estoque">Entrada de estoque</button>' : ''}</div>
    <div class="c tw"><b>Alertas de estoque mínimo</b><table><tr><th>Produto</th><th>Estoque</th><th>Mínimo</th></tr>${d.alertas.map((p) => `<tr><td>${esc(p.descricao)}</td><td class="w">${p.estoque}</td><td>${p.estoque_minimo}</td></tr>`).join('') || '<tr><td colspan="3" class="m">Nenhum item abaixo do mínimo.</td></tr>'}</table></div>`;
  },
  async venda() {
    const [cl, pr, ab] = await Promise.all([api('/clientes'), api('/produtos'), api('/orcamentos')]);
    return `<h1>Vendas</h1><div class="g2"><div><div class="c"><label>Cliente<select id="v_c">${opt(cl, 'nome', V.c)}</select></label>
    <div class="r" style="align-items:end"><label style="flex:2;margin:0;min-width:160px">Produto<select id="v_p">${pr.map((p) => `<option value="${p.id}" data-p="${p.preco}" data-d="${esc(p.descricao)}">${esc(p.descricao)} (${p.estoque} un.)</option>`).join('')}</select></label><label style="flex:1;margin:0;min-width:80px">Qtd<input id="v_q" value="1" inputmode="numeric"></label><button data-a="va">Adicionar</button></div></div>
    <div class="c tw"><table><tr><th>Produto</th><th>Qtd</th><th>Unitário</th><th>Subtotal</th><th></th></tr>${V.i.map((x, j) => `<tr><td>${esc(x.d)}</td><td>${x.q}</td><td>${R(x.p)}</td><td>${R(x.q * x.p)}</td><td><button class="s l" data-a="vr" data-j="${j}">Remover</button></td></tr>`).join('') || '<tr><td class="m" colspan="5">Adicione produtos para começar a venda.</td></tr>'}</table></div>
    <div class="c tw"><b>Orçamentos em aberto (validade de 7 dias)</b><table>${ab.map((o) => `<tr><td>${esc(o.cliente)}</td><td>${R(o.total)}</td><td>vence em ${new Date(o.validade).toLocaleDateString('pt-BR')}</td><td><button class="s l" data-a="oa" data-id="${o.id}">Abrir</button></td></tr>`).join('') || '<tr><td class="m">Nenhum orçamento em aberto.</td></tr>'}</table></div></div>
    <div class="c"><b>Resumo</b><div class="k">${R(tot(V.i))}</div><br><label>Forma de pagamento<select id="v_g">${['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito'].map((g) => `<option ${g === V.g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
    <div class="r"><button data-a="vc">Confirmar venda</button><button class="s" data-a="vo">Salvar como orçamento</button></div></div></div>`;
  },
  async estoque() {
    const [fo, pr, mv] = await Promise.all([api('/fornecedores'), api('/produtos'), api('/movimentacoes?limit=8')]);
    return `<h1>Entrada de estoque</h1><div class="c"><div class="r" style="align-items:end"><label style="flex:2;margin:0;min-width:160px">Fornecedor<select id="e_f">${opt(fo, 'nome', E.f)}</select></label><label style="flex:2;margin:0;min-width:160px">Produto<select id="e_p">${pr.map((p) => `<option value="${p.id}" data-d="${esc(p.descricao)}">${esc(p.descricao)}</option>`).join('')}</select></label><label style="flex:1;margin:0;min-width:80px">Quantidade<input id="e_q" value="1" inputmode="numeric"></label><label style="flex:1;margin:0;min-width:100px">Custo unitário<input id="e_c" inputmode="decimal" placeholder="0,00"></label><button data-a="ea">Adicionar</button></div></div>
    <div class="c tw"><table><tr><th>Produto</th><th>Qtd recebida</th><th>Custo unitário</th><th></th></tr>${E.i.map((x, j) => `<tr><td>${esc(x.d)}</td><td>${x.q}</td><td>${R(x.c)}</td><td><button class="s l" data-a="er" data-j="${j}">Remover</button></td></tr>`).join('') || '<tr><td class="m" colspan="4">Nenhum item na entrada.</td></tr>'}</table><br><button data-a="ec">Confirmar entrada</button></div>
    <div class="c tw"><b>Últimas movimentações</b><table><tr><th>Data</th><th>Produto</th><th>Tipo</th><th>Qtd</th><th>Usuário</th><th>Motivo</th></tr>${mv.map((m) => `<tr><td>${fd(m.data)}</td><td>${esc(m.produto)}</td><td>${m.tipo === 'ENTRADA' ? 'Entrada' : 'Saída'}</td><td>${m.quantidade}</td><td>${esc(m.usuario)}</td><td>${esc(m.motivo)}</td></tr>`).join('') || '<tr><td class="m" colspan="6">Sem movimentações ainda.</td></tr>'}</table></div>`;
  },
  async relatorios() {
    const dias = UI.d || 30, d = await api('/relatorios?dias=' + dias);
    const top = d.mais_vendidos, mx = top.length ? top[0].quantidade : 1, ms = Math.max(...d.faturamento_semanas, 1);
    return `<div class="r np" style="justify-content:space-between;margin-bottom:16px"><h1 style="margin:0">Relatórios gerenciais</h1><div class="r"><select id="r_d" style="width:auto"><option value="7" ${dias == 7 ? 'selected' : ''}>Últimos 7 dias</option><option value="30" ${dias == 30 ? 'selected' : ''}>Últimos 30 dias</option><option value="90" ${dias == 90 ? 'selected' : ''}>Últimos 90 dias</option></select><button class="s" data-a="pr">Imprimir ou salvar em PDF</button></div></div>
    <div class="g2" style="grid-template-columns:1fr 1fr"><div class="c"><b>Itens mais vendidos</b><br><br>${top.map((x) => `<div class="m">${esc(x.descricao)} · ${x.quantidade} un.</div><div class="bar" style="width:${x.quantidade / mx * 100}%;margin-bottom:8px"></div>`).join('') || '<span class="m">Sem vendas no período.</span>'}</div>
    <div class="c tw"><b>Giro de estoque</b> <span class="m">(vendido no período ÷ estoque atual)</span><table><tr><th>Produto</th><th>Giro</th></tr>${top.map((x) => `<tr><td>${esc(x.descricao)}</td><td>${x.giro.toFixed(1).replace('.', ',')}</td></tr>`).join('') || '<tr><td class="m" colspan="2">Sem dados.</td></tr>'}</table></div></div>
    <div class="c"><b>Faturamento por semana</b><br><br>${d.faturamento_semanas.map((v, i) => `<div class="m">${i ? i + ' semana(s) atrás' : 'Esta semana'} · ${R(v)}</div><div class="bar" style="width:${v / ms * 100}%;margin-bottom:8px"></div>`).join('')}</div>
    <div class="c tw"><b>Histórico de vendas</b><table><tr><th>Data</th><th>Cliente</th><th>Pagamento</th><th>Total</th></tr>${d.historico.map((v) => `<tr><td>${fd(v.data)}</td><td>${esc(v.cliente)}</td><td>${esc(v.forma_pagamento)}</td><td>${R(v.total)}</td></tr>`).join('') || '<tr><td class="m" colspan="4">Nenhuma venda registrada.</td></tr>'}</table></div>`;
  }
};

async function crud(k) {
  const C = CF[k], L = await api('/' + k + '?q=' + encodeURIComponent(UI.q || '')), ed = L.find((x) => x.id === UI.ed) || {};
  return `<h1>${C.t}</h1><div class="g2"><div class="c"><label>Buscar<input id="q" value="${esc(UI.q)}" placeholder="Digite para filtrar"></label><div class="tw"><table><tr>${C.s.map((c) => `<th>${lab(C, c)}</th>`).join('')}<th></th></tr>${L.map((x) => `<tr>${C.s.map((c) => `<td class="${c === 'estoque' && x.estoque <= x.estoque_minimo ? 'w' : ''}">${c === 'preco' ? R(x[c]) : esc(x[c])}</td>`).join('')}<td><button class="s l" data-a="ed" data-id="${x.id}">Editar</button></td></tr>`).join('') || `<tr><td class="m" colspan="${C.s.length + 1}">Nada encontrado.</td></tr>`}</table></div></div>
  <div class="c"><b>${ed.id ? 'Editar cadastro' : 'Novo cadastro'}</b><br><br>${C.f.map(([c, l, t]) => `<label>${l}<input id="f_${c}" ${t === 'n' ? 'inputmode="decimal"' : ''} value="${esc(ed[c])}"></label>`).join('')}<div class="r"><button data-a="sv" data-k="${k}">Salvar</button>${ed.id ? '<button class="s" data-a="nw">Cancelar</button>' : ''}</div></div></div>`;
}

async function render() {
  let v = location.hash.slice(1) || 'painel', h;
  if (v === 'sair') { return logout(); }
  if (!TOKEN) { h = login(); }
  else {
    if (!PERF[U.perfil].includes(v)) v = 'painel';
    let body = '';
    try { body = CF[v] ? await crud(v) : await VIEWS[v](); } catch (e) { if (TOKEN) MSG = e.message; }
    if (!TOKEN) return;
    h = `<aside><b>Auto Peças Silva</b><small>${esc(U.nome)}</small>${PERF[U.perfil].map((n) => `<a href="#${n}" class="${n === v ? 'on' : ''}">${NOME[n]}</a>`).join('')}<a href="#sair" class="out">Sair</a></aside><main>${MSG ? `<div class="msg" role="status">${esc(MSG)}</div>` : ''}${body}</main>`;
  }
  MSG = '';
  $('#app').innerHTML = h;
}

const A = {
  async lg() {
    const j = await api('/auth/login', { method: 'POST', body: { login: $('#l_u').value.trim(), senha: $('#l_s').value } });
    TOKEN = j.token; U = j.usuario;
    sessionStorage.setItem('tk', TOKEN); sessionStorage.setItem('us', JSON.stringify(U));
    V = newV(); E = newE(); location.hash = '#painel'; render();
  },
  go(d) { location.hash = d.to; },
  ed(d) { UI.ed = +d.id; render(); },
  nw() { UI.ed = null; render(); },
  async sv(d) {
    const body = {};
    CF[d.k].f.forEach(([c]) => { body[c] = $('#f_' + c).value.trim(); });
    await api('/' + d.k + (UI.ed ? '/' + UI.ed : ''), { method: UI.ed ? 'PUT' : 'POST', body });
    UI.ed = null; MSG = 'Cadastro salvo.'; render();
  },
  va() {
    sync();
    const o = $('#v_p').selectedOptions[0], q = parseInt($('#v_q').value) || 0;
    if (!o || q < 1) return;
    const id = +o.value, ex = V.i.find((x) => x.id === id);
    if (ex) ex.q += q; else V.i.push({ id, d: o.dataset.d, q, p: +o.dataset.p });
    render();
  },
  vr(d) { sync(); V.i.splice(+d.j, 1); render(); },
  async vc() {
    sync();
    await api('/vendas', { method: 'POST', body: { cliente_id: V.c || null, forma_pagamento: V.g, orcamento_id: V.o || null, itens: V.i.map((x) => ({ produto_id: x.id, quantidade: x.q })) } });
    V = newV(); MSG = 'Venda registrada e estoque atualizado.'; render();
  },
  async vo() {
    sync();
    await api('/orcamentos', { method: 'POST', body: { cliente_id: V.c || null, itens: V.i.map((x) => ({ produto_id: x.id, quantidade: x.q })) } });
    V = newV(); MSG = 'Orçamento salvo, válido por 7 dias.'; render();
  },
  async oa(d) {
    const o = await api('/orcamentos/' + d.id);
    V = { c: o.cliente_id || '', i: o.itens.map((x) => ({ id: x.produto_id, d: x.descricao, q: x.quantidade, p: x.preco_unitario })), g: 'Pix', o: o.id };
    render();
  },
  ea() {
    E.f = $('#e_f').value;
    const o = $('#e_p').selectedOptions[0], q = parseInt($('#e_q').value) || 0, c = parseFloat(($('#e_c').value || '0').replace(',', '.')) || 0;
    if (!o || q < 1) return;
    E.i.push({ id: +o.value, d: o.dataset.d, q, c }); render();
  },
  er(d) { E.f = $('#e_f').value; E.i.splice(+d.j, 1); render(); },
  async ec() {
    E.f = $('#e_f').value;
    await api('/entradas', { method: 'POST', body: { fornecedor_id: E.f, itens: E.i.map((x) => ({ produto_id: x.id, quantidade: x.q, custo: x.c })) } });
    E = newE(); MSG = 'Entrada registrada e estoque atualizado.'; render();
  },
  pr() { window.print(); }
};

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-a]');
  if (b && A[b.dataset.a]) Promise.resolve(A[b.dataset.a](b.dataset)).catch((err) => { MSG = err.message; render(); });
});
document.addEventListener('input', async (e) => {
  if (e.target.id === 'q') { UI.q = e.target.value; await render(); const q = $('#q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
});
document.addEventListener('change', (e) => { if (e.target.id === 'r_d') { UI.d = +e.target.value; render(); } });
window.addEventListener('hashchange', () => { UI.ed = null; UI.q = ''; render(); });
render();
