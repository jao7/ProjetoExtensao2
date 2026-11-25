const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { sign, auth, perm } = require('./auth');

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
const r = express.Router();

const PROP = 'Proprietário', GER = 'Gerente', EST = 'Estoquista', VEN = 'Vendedor';
const bad = (msg, status = 400) => { const e = new Error(msg); e.status = status; throw e; };
const h = (fn) => (req, res) => {
  try { fn(req, res); }
  catch (e) {
    if (e.status) return res.status(e.status).json({ erro: e.message });
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ erro: 'Registro duplicado ou inválido' });
    console.error(e);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};
const mov = (produto, tipo, qtd, usuario, motivo) =>
  db.prepare('INSERT INTO movimentacoes (produto_id, tipo, quantidade, usuario_id, motivo) VALUES (?,?,?,?,?)')
    .run(produto, tipo, qtd, usuario, motivo);

// ---------- Autenticação ----------
r.post('/auth/login', h((req, res) => {
  const { login, senha } = req.body || {};
  const u = db.prepare('SELECT * FROM usuarios WHERE login = ?').get(String(login || ''));
  if (!u || !bcrypt.compareSync(String(senha || ''), u.senha_hash)) bad('Usuário ou senha inválidos', 401);
  res.json({ token: sign(u), usuario: { nome: u.nome, perfil: u.perfil } });
}));

// ---------- Cadastros (RF01, RF02, RF03) ----------
const NUM = ['preco', 'estoque_minimo'];
function crud(tabela, campos, obrigatorios, escrita, busca) {
  const valores = (b) => campos.map((c) => {
    if (NUM.includes(c)) {
      const n = Number(String(b[c] ?? 0).replace(',', '.'));
      if (Number.isNaN(n) || n < 0) bad('Valor inválido em ' + c);
      return n;
    }
    return String(b[c] ?? '').trim();
  });
  const checa = (b) => obrigatorios.forEach((c) => { if (!String(b[c] ?? '').trim()) bad('Preencha o campo ' + c); });

  r.get('/' + tabela, auth, h((req, res) => {
    const q = '%' + (req.query.q || '') + '%';
    const where = busca.map((c) => c + ' LIKE ?').join(' OR ');
    res.json(db.prepare(`SELECT * FROM ${tabela} WHERE ${where} ORDER BY id`).all(...busca.map(() => q)));
  }));
  r.post('/' + tabela, auth, perm(...escrita), h((req, res) => {
    checa(req.body);
    const info = db.prepare(`INSERT INTO ${tabela} (${campos.join(',')}) VALUES (${campos.map(() => '?').join(',')})`).run(...valores(req.body));
    res.status(201).json({ id: info.lastInsertRowid });
  }));
  r.put('/' + tabela + '/:id', auth, perm(...escrita), h((req, res) => {
    checa(req.body);
    const info = db.prepare(`UPDATE ${tabela} SET ${campos.map((c) => c + '=?').join(',')} WHERE id=?`).run(...valores(req.body), req.params.id);
    if (!info.changes) bad('Registro não encontrado', 404);
    res.json({ ok: true });
  }));
}
// O estoque dos produtos NÃO é editável aqui: só muda por entrada ou venda (RN02)
crud('produtos', ['codigo', 'descricao', 'categoria', 'preco', 'estoque_minimo'], ['codigo', 'descricao'], [PROP, GER, EST], ['codigo', 'descricao', 'categoria']);
crud('clientes', ['nome', 'documento', 'telefone'], ['nome'], [PROP, GER, VEN], ['nome', 'documento', 'telefone']);
crud('fornecedores', ['nome', 'documento', 'contato'], ['nome'], [PROP, GER, EST], ['nome', 'documento', 'contato']);

// ---------- Estoque (RF04) ----------
r.post('/entradas', auth, perm(PROP, GER, EST), h((req, res) => {
  const { fornecedor_id, itens } = req.body || {};
  const f = db.prepare('SELECT * FROM fornecedores WHERE id = ?').get(fornecedor_id);
  if (!f) bad('Fornecedor não encontrado');
  if (!Array.isArray(itens) || !itens.length) bad('Informe ao menos um item');
  db.transaction(() => {
    for (const i of itens) {
      const q = parseInt(i.quantidade);
      if (!(q > 0)) bad('Quantidade inválida');
      const p = db.prepare('SELECT * FROM produtos WHERE id = ?').get(i.produto_id);
      if (!p) bad('Produto não encontrado');
      db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?').run(q, p.id);
      mov(p.id, 'ENTRADA', q, req.user.id, 'Compra de ' + f.nome);
    }
  })();
  res.status(201).json({ ok: true });
}));

r.get('/movimentacoes', auth, h((req, res) => {
  const limite = Math.min(parseInt(req.query.limit) || 8, 100);
  res.json(db.prepare(`SELECT m.id, m.data, p.descricao AS produto, m.tipo, m.quantidade, u.nome AS usuario, m.motivo
    FROM movimentacoes m JOIN produtos p ON p.id = m.produto_id JOIN usuarios u ON u.id = m.usuario_id
    ORDER BY m.id DESC LIMIT ?`).all(limite));
}));

// ---------- Vendas e orçamentos (RF05, RF06, RF07) ----------
function itensDe(itens) {
  if (!Array.isArray(itens) || !itens.length) bad('Adicione ao menos um produto');
  const soma = new Map();
  for (const i of itens) {
    const q = parseInt(i.quantidade);
    if (!(q > 0)) bad('Quantidade inválida');
    soma.set(Number(i.produto_id), (soma.get(Number(i.produto_id)) || 0) + q);
  }
  return [...soma].map(([id, q]) => {
    const p = db.prepare('SELECT * FROM produtos WHERE id = ?').get(id);
    if (!p) bad('Produto não encontrado');
    return { p, q }; // o preço vem SEMPRE do banco, no momento do registro (RN04)
  });
}
const total = (its) => its.reduce((s, { p, q }) => s + p.preco * q, 0);

r.post('/vendas', auth, perm(PROP, GER, VEN), h((req, res) => {
  const { cliente_id, forma_pagamento, itens, orcamento_id } = req.body || {};
  const its = itensDe(itens);
  const id = db.transaction(() => {
    for (const { p, q } of its) {
      if (p.estoque < q) bad(`Estoque insuficiente de ${p.descricao} (disponível: ${p.estoque} un.)`); // RN01
    }
    const v = db.prepare('INSERT INTO vendas (cliente_id, forma_pagamento, total, usuario_id) VALUES (?,?,?,?)')
      .run(cliente_id || null, forma_pagamento || 'Pix', total(its), req.user.id);
    for (const { p, q } of its) {
      db.prepare('INSERT INTO venda_itens (venda_id, produto_id, quantidade, preco_unitario) VALUES (?,?,?,?)').run(v.lastInsertRowid, p.id, q, p.preco);
      db.prepare('UPDATE produtos SET estoque = estoque - ? WHERE id = ?').run(q, p.id); // RF05
      mov(p.id, 'SAIDA', q, req.user.id, 'Venda #' + v.lastInsertRowid);
    }
    if (orcamento_id) {
      const o = db.prepare("UPDATE orcamentos SET status = 'CONVERTIDO' WHERE id = ? AND status = 'ABERTO' AND validade >= ?")
        .run(orcamento_id, new Date().toISOString());
      if (!o.changes) bad('Orçamento inválido ou vencido'); // RN03
    }
    return v.lastInsertRowid;
  })();
  res.status(201).json({ id });
}));

r.post('/orcamentos', auth, perm(PROP, GER, VEN), h((req, res) => {
  const { cliente_id, itens } = req.body || {};
  const its = itensDe(itens);
  const validade = new Date(Date.now() + 7 * 864e5).toISOString();
  const id = db.transaction(() => {
    const o = db.prepare('INSERT INTO orcamentos (cliente_id, validade, total, usuario_id) VALUES (?,?,?,?)')
      .run(cliente_id || null, validade, total(its), req.user.id);
    for (const { p, q } of its) {
      db.prepare('INSERT INTO orcamento_itens (orcamento_id, produto_id, quantidade, preco_unitario) VALUES (?,?,?,?)').run(o.lastInsertRowid, p.id, q, p.preco);
    }
    return o.lastInsertRowid;
  })();
  res.status(201).json({ id, validade });
}));

r.get('/orcamentos', auth, perm(PROP, GER, VEN), h((req, res) => {
  res.json(db.prepare(`SELECT o.id, COALESCE(c.nome, '—') AS cliente, o.total, o.validade
    FROM orcamentos o LEFT JOIN clientes c ON c.id = o.cliente_id
    WHERE o.status = 'ABERTO' AND o.validade >= ? ORDER BY o.id DESC`).all(new Date().toISOString()));
}));

r.get('/orcamentos/:id', auth, perm(PROP, GER, VEN), h((req, res) => {
  const o = db.prepare("SELECT * FROM orcamentos WHERE id = ? AND status = 'ABERTO' AND validade >= ?").get(req.params.id, new Date().toISOString());
  if (!o) bad('Orçamento inválido ou vencido', 404);
  o.itens = db.prepare(`SELECT i.produto_id, p.descricao, i.quantidade, i.preco_unitario
    FROM orcamento_itens i JOIN produtos p ON p.id = i.produto_id WHERE i.orcamento_id = ?`).all(o.id);
  res.json(o);
}));

// ---------- Painel e relatórios (RF08, RF09, RF10) ----------
r.get('/painel', auth, h((req, res) => {
  res.json({
    vendas_hoje: db.prepare("SELECT COUNT(*) AS n FROM vendas WHERE date(data) = date('now')").get().n,
    faturamento_mes: db.prepare("SELECT COALESCE(SUM(total), 0) AS t FROM vendas WHERE strftime('%Y-%m', data) = strftime('%Y-%m', 'now')").get().t,
    orcamentos_abertos: db.prepare("SELECT COUNT(*) AS n FROM orcamentos WHERE status = 'ABERTO' AND validade >= ?").get(new Date().toISOString()).n,
    alertas: db.prepare('SELECT id, descricao, estoque, estoque_minimo FROM produtos WHERE estoque <= estoque_minimo ORDER BY estoque').all()
  });
}));

r.get('/relatorios', auth, perm(PROP, GER), h((req, res) => {
  const dias = Math.min(parseInt(req.query.dias) || 30, 365);
  const desde = new Date(Date.now() - dias * 864e5).toISOString();
  const mais_vendidos = db.prepare(`SELECT p.descricao, SUM(i.quantidade) AS quantidade, p.estoque
    FROM venda_itens i JOIN vendas v ON v.id = i.venda_id JOIN produtos p ON p.id = i.produto_id
    WHERE v.data >= ? GROUP BY p.id ORDER BY quantidade DESC LIMIT 5`).all(desde)
    .map((x) => ({ ...x, giro: x.quantidade / Math.max(x.estoque, 1) }));
  const faturamento_semanas = [0, 1, 2, 3].map((w) => {
    const fim = new Date(Date.now() - w * 7 * 864e5).toISOString();
    const ini = new Date(Date.now() - (w + 1) * 7 * 864e5).toISOString();
    return db.prepare('SELECT COALESCE(SUM(total), 0) AS t FROM vendas WHERE data >= ? AND data < ?').get(ini, fim).t;
  });
  const historico = db.prepare(`SELECT v.data, COALESCE(c.nome, '—') AS cliente, v.forma_pagamento, v.total
    FROM vendas v LEFT JOIN clientes c ON c.id = v.cliente_id ORDER BY v.id DESC LIMIT 10`).all();
  res.json({ mais_vendidos, faturamento_semanas, historico });
}));

app.use('/api', r);
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API rodando em http://localhost:${PORT}/api`));
