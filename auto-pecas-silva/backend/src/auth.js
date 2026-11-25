const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'troque-este-segredo-em-producao';

const sign = (u) => jwt.sign({ id: u.id, nome: u.nome, perfil: u.perfil }, SECRET, { expiresIn: '8h' });

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    res.status(401).json({ erro: 'Não autenticado' });
  }
}

// RF11: controle de acesso por perfil
const perm = (...perfis) => (req, res, next) =>
  perfis.includes(req.user.perfil) ? next() : res.status(403).json({ erro: 'Sem permissão para esta ação' });

module.exports = { sign, auth, perm };
