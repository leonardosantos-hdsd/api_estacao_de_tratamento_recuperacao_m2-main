const express = require("express");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = 3000;
const FILE_PATH = "./estacoes.json";
const EXPECTED_EMAIL = "lab365@gmail.com";
const EXPECTED_SENHA = "lab365123";
// token fixo que será retornado no login e exigido nas demais rotas
const FIXED_TOKEN = "lab365-token-2025";

app.use(express.json());

// middleware de autenticação para proteger rotas /estacoes
function authMiddleware(req, res, next) {
  // aceita: Authorization: Bearer <token> ou x-access-token: <token>
  const authHeader = req.headers["authorization"];
  const xToken = req.headers["x-access-token"];
  let token = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else if (authHeader) {
    token = authHeader;
  } else if (xToken) {
    token = xToken;
  }

  if (!token || token !== FIXED_TOKEN) {
    return res.status(401).json({ message: "Não autorizado. Token inválido ou ausente." });
  }

  next();
}

// Função auxiliar para ler o arquivo JSON
function readData() {
  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, JSON.stringify([]));
  }
  const data = fs.readFileSync(FILE_PATH);
  return JSON.parse(data);
}

// Função auxiliar para salvar no arquivo JSON
function writeData(data) {
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
}

// Rota: Login (pública)
app.post("/login", (req, res) => {
  const { email, senha } = req.body;

  if (email === EXPECTED_EMAIL && senha === EXPECTED_SENHA) {
    return res.json({
      message: "Login realizado com sucesso!",
      token: FIXED_TOKEN
    });
  }

  return res.status(401).json({ message: "Credenciais inválidas" });
});

// aplicar middleware a todas as rotas que começam com /estacoes
app.use("/estacoes", authMiddleware);

// Rota: Listar todas as estações
app.get("/estacoes", (req, res) => {
  const estacoes = readData();
  res.json(estacoes);
});

// Rota: Buscar uma estação pelo ID (findOne)
app.get("/estacoes/:id", (req, res) => {
  const { id } = req.params;
  const estacoes = readData();
  const estacao = estacoes.find((e) => e.id === id);

  if (!estacao) {
    return res.status(404).json({ message: "Estação não encontrada" });
  }

  res.json(estacao);
});

// Rota: Cadastrar nova estação
app.post("/estacoes", (req, res) => {
  const {
    nome,
    descricao,
    urlImagem,
    cep,
    logradouro,
    estado,
    cidade,
    bairro,
    numero,
    complemento,
    capacidadeToneladas,
    tipoTratamento,
    dataInicioOperacao,
  } = req.body;

  const estacoes = readData();

  const novaEstacao = {
    id: uuidv4(),
    nome,
    descricao,
    urlImagem,
    cep,
    logradouro,
    estado,
    cidade,
    bairro,
    numero,
    complemento,
    capacidadeToneladas,
    tipoTratamento,
    dataInicioOperacao,
  };

  estacoes.push(novaEstacao);
  writeData(estacoes);

  res.status(201).json(novaEstacao);
});

// Rota: Editar estação
app.put("/estacoes/:id", (req, res) => {
  const { id } = req.params;
  const estacoes = readData();
  const index = estacoes.findIndex((e) => e.id === id);

  if (index === -1) {
    return res.status(404).json({ message: "Estação não encontrada" });
  }

  estacoes[index] = { ...estacoes[index], ...req.body };
  writeData(estacoes);

  res.json(estacoes[index]);
});

// Rota: Deletar estação
app.delete("/estacoes/:id", (req, res) => {
  const { id } = req.params;
  let estacoes = readData();
  const novaLista = estacoes.filter((e) => e.id !== id);

  if (estacoes.length === novaLista.length) {
    return res.status(404).json({ message: "Estação não encontrada" });
  }

  writeData(novaLista);
  res.json({ message: "Estação deletada com sucesso" });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
