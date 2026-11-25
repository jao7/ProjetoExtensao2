# Auto Peças Silva – Sistema de Gestão de Estoque e Vendas

Aplicação web separada em **frontend** (HTML/CSS/JavaScript), **backend** (API REST em Node.js + Express) e **banco de dados** (SQLite).

```
auto-pecas-silva/
├── backend/
│   ├── package.json
│   ├── sql/schema.sql      # modelo de dados (tabelas)
│   └── src/
│       ├── db.js           # conexão, criação das tabelas e dados iniciais
│       ├── auth.js         # login (JWT) e permissões por perfil
│       └── server.js       # rotas da API
└── frontend/
    ├── index.html
    ├── style.css
    ├── config.js           # endereço da API
    └── app.js
```

## Como rodar

Requisito: Node.js 18 ou superior.

**1. Backend** (terminal 1)
```
cd backend
npm install
npm start
```
A API sobe em `http://localhost:3000/api`. Na primeira execução o arquivo `data.db` é criado com os dados iniciais.

**2. Frontend** (terminal 2)
```
cd frontend
npx serve -l 5500 .
```
(ou `python3 -m http.server 5500`). Abra `http://localhost:5500`.

**Usuários de demonstração** (senha `1234` para todos): `proprietario`, `gerente`, `estoquista`, `vendedor`.

Variáveis opcionais do backend: `PORT`, `JWT_SECRET`, `DB_FILE`, `CORS_ORIGIN`.

## Rotas da API (prefixo `/api`)

| Método e rota | Perfis | Requisito |
|---|---|---|
| `POST /auth/login` | todos | RF11 |
| `GET/POST /produtos`, `PUT /produtos/:id` | leitura: todos; escrita: Proprietário, Gerente, Estoquista | RF01 |
| `GET/POST /fornecedores`, `PUT /fornecedores/:id` | leitura: todos; escrita: Proprietário, Gerente, Estoquista | RF02 |
| `GET/POST /clientes`, `PUT /clientes/:id` | leitura: todos; escrita: Proprietário, Gerente, Vendedor | RF03 |
| `POST /entradas` | Proprietário, Gerente, Estoquista | RF04 |
| `GET /movimentacoes` | todos | RN02 |
| `POST /vendas` | Proprietário, Gerente, Vendedor | RF05, RF07 |
| `POST /orcamentos`, `GET /orcamentos`, `GET /orcamentos/:id` | Proprietário, Gerente, Vendedor | RF06 |
| `GET /painel` | todos | RF08 |
| `GET /relatorios?dias=30` | Proprietário, Gerente | RF09, RF10 |

## Regras de negócio no backend
- **RN01:** a venda é recusada se o estoque for insuficiente.
- **RN02:** toda entrada ou saída grava data, usuário e motivo em `movimentacoes`.
- **RN03:** o orçamento vale 7 dias e só é convertido em venda enquanto estiver aberto e válido.
- **RN04:** o preço usado na venda é sempre o do banco no momento do registro, nunca o enviado pelo navegador.
- Venda e entrada rodam em transação: ou grava tudo, ou nada.

## Antes de usar de verdade
- Troque a senha dos usuários e defina `JWT_SECRET`.
- Restrinja `CORS_ORIGIN` ao endereço do frontend.
- Use HTTPS e coloque limite de tentativas no login.
- Faça backup do arquivo `data.db` (RNF04). Para mais acessos simultâneos, migre para PostgreSQL ou MySQL.
