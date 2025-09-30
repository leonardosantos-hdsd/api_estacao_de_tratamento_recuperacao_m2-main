// index.js
const express = require("express");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");
const path = require("path");

const app = express();

// ====== ENV ======
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const FILE_PATH = process.env.FILE_PATH || path.resolve("./estacoes.json");
const EXPECTED_EMAIL = process.env.LOGIN_EMAIL || "lab365@gmail.com";
const EXPECTED_SENHA = process.env.LOGIN_SENHA || "lab365123";
const FIXED_TOKEN = process.env.API_TOKEN || "lab365-token-2025";

// ====== CORS ======
// (opcional) log rápido de preflight para diagnóstico
app.use((req, _res, next) => {
  if (req.method === "OPTIONS") {
    try {
      console.log(
        "[CORS preflight]",
        "origin=",
        req.headers.origin,
        "method=",
        req.headers["access-control-request-method"],
        "headers=",
        req.headers["access-control-request-headers"]
      );
    } catch {}
  }
  next();
});

const corsOptions = {
  origin: (origin, cb) => {
    // permitir requisições sem origin (curl, healthcheck)
    if (!origin) return cb(null, true);

    // permitir se estiver explicitamente na env CORS_ORIGIN
    if (CORS_ORIGIN.length === 0 || CORS_ORIGIN.includes(origin)) {
      return cb(null, true);
    }

    // permitir qualquer subdomínio vercel.app (útil para previews)
    try {
      const { hostname } = new URL(origin);
      if (hostname.endsWith(".vercel.app")) return cb(null, true);
    } catch {}

    return cb(new Error("Not allowed by CORS"), false);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-access-token"],
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// ====== BODY PARSER ======
app.use(express.json());

// ====== FS helpers ======
function ensureFile() {
  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, "[]", "utf-8");
  }
}
function readData() {
  ensureFile();
  const raw = fs.readFileSync(FILE_PATH, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
function writeData(data) {
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), "utf-8");
}

// ====== HEALTH ======
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ====== LOGIN ======
app.post("/login", (req, res) => {
  const { email, senha } = req.body || {};
  if (email === EXPECTED_EMAIL && senha === EXPECTED_SENHA) {
    return res.json({ token: FIXED_TOKEN });
  }
  return res.status(401).json({ error: "Credenciais inválidas" });
});

// ====== AUTH MIDDLEWARE ======
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || "";
  const [, token] = auth.split(" ");
  if (token === FIXED_TOKEN) return next();
  return res.status(401).json({ error: "Token inválido" });
}

// ====== CRUD ESTAÇÕES (PROTEGIDO) ======
app.get("/estacoes", authMiddleware, (req, res) => {
  const data = readData();
  res.json(data);
});

app.post("/estacoes", authMiddleware, (req, res) => {
  const estacoes = readData();
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
  } = req.body || {};

  const nova = {
    id: uuidv4(),
    nome: nome || "Sem nome",
    descricao: descricao || "",
    urlImagem: urlImagem || "",
    cep: cep || "",
    logradouro: logradouro || "",
    estado: estado || "",
    cidade: cidade || "",
    bairro: bairro || "",
    numero: numero || "",
    complemento: complemento || "",
    capacidadeToneladas:
      typeof capacidadeToneladas === "number" ? capacidadeToneladas : 0,
    tipoTratamento: tipoTratamento || "",
    dataInicioOperacao: dataInicioOperacao || "",
    criadoEm: new Date().toISOString(),
  };

  estacoes.push(nova);
  writeData(estacoes);
  res.status(201).json(nova);
});

app.put("/estacoes/:id", authMiddleware, (req, res) => {
  const estacoes = readData();
  const idx = estacoes.findIndex((e) => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Não encontrado" });

  estacoes[idx] = { ...estacoes[idx], ...req.body, id: estacoes[idx].id };
  writeData(estacoes);
  res.json(estacoes[idx]);
});

app.delete("/estacoes/:id", authMiddleware, (req, res) => {
  const estacoes = readData();
  const idx = estacoes.findIndex((e) => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Não encontrado" });

  const [removida] = estacoes.splice(idx, 1);
  writeData(estacoes);
  res.json(removida);
});

// ====== START ======
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(
    "CORS_ORIGIN:",
    CORS_ORIGIN.length
      ? CORS_ORIGIN
      : "(vazio: liberado por callback .vercel.app)"
  );
});
