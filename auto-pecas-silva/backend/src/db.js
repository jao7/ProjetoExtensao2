const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const db = new Database(process.env.DB_FILE || path.join(__dirname, '..', 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8'));

// Dados iniciais (apenas na primeira execução, com o banco vazio)
if (db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n === 0) {
  const hash = bcrypt.hashSync('1234', 10); // senha de DEMONSTRAÇÃO: troque antes de usar de verdade
  const u = db.prepare('INSERT INTO usuarios (nome, login, senha_hash, perfil) VALUES (?,?,?,?)');
  u.run('Proprietário', 'proprietario', hash, 'Proprietário');
  u.run('Gerente de Vendas', 'gerente', hash, 'Gerente');
  u.run('Estoquista', 'estoquista', hash, 'Estoquista');
  u.run('Vendedor', 'vendedor', hash, 'Vendedor');
  const p = db.prepare('INSERT INTO produtos (codigo, descricao, categoria, preco, estoque, estoque_minimo) VALUES (?,?,?,?,?,?)');
  p.run('1001', 'Filtro de óleo', 'Filtros', 32.9, 1, 10);
  p.run('1002', 'Pastilha de freio', 'Freios', 89, 2, 5);
  p.run('1003', 'Vela de ignição', 'Ignição', 24.5, 4, 12);
  p.run('1004', 'Correia dentada', 'Motor', 119, 18, 5);
  db.prepare("INSERT INTO clientes (nome) VALUES ('Cliente balcão')").run();
  db.prepare("INSERT INTO fornecedores (nome) VALUES ('Distribuidora Sul Peças')").run();
}

module.exports = db;
