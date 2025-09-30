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
// use let para podermos trocar o caminho se o FS for somente leitura
let FILE_PATH = process.env.FILE_PATH || path.resolve("./estacoes.json");
const EXPECTED_EMAIL = process.env.LOGIN_EMAIL || "lab365@gmail.com";
const EXPECTED_SENHA = process.env.LOGIN_SENHA || "lab365123";
const FIXED_TOKEN = process.env.API_TOKEN || "lab365-token-2025";

// ====== CORS ======
app.use((req, _res, next) => {
  if (req.method === "OPTIONS") {
    console.log(
      "[CORS preflight]",
      "origin=",
      req.headers.origin,
      "method=",
      req.headers["access-control-request-method"],
      "headers=",
      req.headers["access-control-request-headers"]
    );
  }
  next();
});

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // curl/healthcheck
    if (CORS_ORIGIN.length === 0 || CORS_ORIGIN.includes(origin))
      return cb(null, true);
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
function ensureDirFor(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function switchToTmpIfNeeded(err) {
  const code = err && err.code;
  if (code === "EROFS" || code === "EACCES" || code === "EPERM") {
    const fallback = "/tmp/estacoes.json";
    if (FILE_PATH !== fallback) {
      console.warn(
        `[FS] ${code} em "${FILE_PATH}". Alternando para "${fallback}".`
      );
      FILE_PATH = fallback;
      try {
        ensureDirFor(FILE_PATH);
        if (!fs.existsSync(FILE_PATH))
          fs.writeFileSync(FILE_PATH, "[]", "utf-8");
        return true;
      } catch (e) {
        console.error("[FS] Falha ao inicializar fallback /tmp:", e);
      }
    }
  }
  return false;
}

function ensureFile() {
  try {
    ensureDirFor(FILE_PATH);
    if (!fs.existsSync(FILE_PATH)) {
      fs.writeFileSync(FILE_PATH, "[]", "utf-8");
    }
  } catch (err) {
    if (switchToTmpIfNeeded(err)) return ensureFile();
    throw err;
  }
}

function readData() {
  try {
    ensureFile();
    const raw = fs.readFileSync(FILE_PATH, "utf-8");
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.warn("[FS] JSON inválido, retornando lista vazia:", e.message);
      return [];
    }
  } catch (err) {
    if (switchToTmpIfNeeded(err)) return readData();
    console.error("[FS] Erro ao ler dados:", err);
    throw err;
  }
}

function writeData(data) {
  try {
    ensureFile();
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    if (switchToTmpIfNeeded(err)) return writeData(data);
    console.error("[FS] Erro ao escrever dados:", err);
    throw err;
  }
}

// ====== HEALTH ======
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    filePath: FILE_PATH,
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
app.get("/estacoes", authMiddleware, (req, res, next) => {
  try {
    const data = readData();
    res.json(data);
  } catch (e) {
    next(e);
  }
});

app.post("/estacoes", authMiddleware, (req, res, next) => {
  try {
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
        typeof capacidadeToneladas === "number"
          ? capacidadeToneladas
          : parseFloat(capacidadeToneladas) || 0,
      tipoTratamento: tipoTratamento || "",
      dataInicioOperacao: dataInicioOperacao || "",
      criadoEm: new Date().toISOString(),
    };

    estacoes.push(nova);
    writeData(estacoes);
    res.status(201).json(nova);
  } catch (e) {
    next(e);
  }
});

app.put("/estacoes/:id", authMiddleware, (req, res, next) => {
  try {
    const estacoes = readData();
    const idx = estacoes.findIndex((e) => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Não encontrado" });
    estacoes[idx] = { ...estacoes[idx], ...req.body, id: estacoes[idx].id };
    writeData(estacoes);
    res.json(estacoes[idx]);
  } catch (e) {
    next(e);
  }
});

app.delete("/estacoes/:id", authMiddleware, (req, res, next) => {
  try {
    const estacoes = readData();
    const idx = estacoes.findIndex((e) => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Não encontrado" });
    const [removida] = estacoes.splice(idx, 1);
    writeData(estacoes);
    res.json(removida);
  } catch (e) {
    next(e);
  }
});

// ====== ERROR HANDLER ======
app.use((err, req, res, _next) => {
  console.error("[UNHANDLED]", err);
  res.status(500).json({
    error: "Internal Server Error",
    detail: err?.message,
    filePath: FILE_PATH,
  });
});

// ====== START ======
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(
    "CORS_ORIGIN:",
    CORS_ORIGIN.length ? CORS_ORIGIN : "(vazio → permitido *.vercel.app)"
  );
  console.log("FILE_PATH:", FILE_PATH);
});

// // index.js
// const express = require("express");
// const fs = require("fs");
// const { v4: uuidv4 } = require("uuid");
// const cors = require("cors");
// const path = require("path");

// const app = express();

// // ====== ENV ======
// const PORT = process.env.PORT || 3000;
// const CORS_ORIGIN = (process.env.CORS_ORIGIN || "")
//   .split(",")
//   .map((s) => s.trim())
//   .filter(Boolean);
// const FILE_PATH = process.env.FILE_PATH || path.resolve("./estacoes.json");
// const EXPECTED_EMAIL = process.env.LOGIN_EMAIL || "lab365@gmail.com";
// const EXPECTED_SENHA = process.env.LOGIN_SENHA || "lab365123";
// const FIXED_TOKEN = process.env.API_TOKEN || "lab365-token-2025";

// // ====== CORS ======
// // (opcional) log rápido de preflight para diagnóstico
// app.use((req, _res, next) => {
//   if (req.method === "OPTIONS") {
//     try {
//       console.log(
//         "[CORS preflight]",
//         "origin=",
//         req.headers.origin,
//         "method=",
//         req.headers["access-control-request-method"],
//         "headers=",
//         req.headers["access-control-request-headers"]
//       );
//     } catch {}
//   }
//   next();
// });

// const corsOptions = {
//   origin: (origin, cb) => {
//     // permitir requisições sem origin (curl, healthcheck)
//     if (!origin) return cb(null, true);

//     // permitir se estiver explicitamente na env CORS_ORIGIN
//     if (CORS_ORIGIN.length === 0 || CORS_ORIGIN.includes(origin)) {
//       return cb(null, true);
//     }

//     // permitir qualquer subdomínio vercel.app (útil para previews)
//     try {
//       const { hostname } = new URL(origin);
//       if (hostname.endsWith(".vercel.app")) return cb(null, true);
//     } catch {}

//     return cb(new Error("Not allowed by CORS"), false);
//   },
//   methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
//   allowedHeaders: ["Content-Type", "Authorization", "x-access-token"],
//   credentials: true,
//   optionsSuccessStatus: 204,
// };

// app.use(cors(corsOptions));
// app.options("*", cors(corsOptions));

// // ====== BODY PARSER ======
// app.use(express.json());

// // ====== FS helpers ======
// function ensureFile() {
//   if (!fs.existsSync(FILE_PATH)) {
//     fs.writeFileSync(FILE_PATH, "[]", "utf-8");
//   }
// }
// function readData() {
//   ensureFile();
//   const raw = fs.readFileSync(FILE_PATH, "utf-8");
//   try {
//     return JSON.parse(raw);
//   } catch {
//     return [];
//   }
// }
// function writeData(data) {
//   fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), "utf-8");
// }

// // ====== HEALTH ======
// app.get("/health", (req, res) => {
//   res.status(200).json({
//     status: "ok",
//     uptime: process.uptime(),
//     timestamp: new Date().toISOString(),
//   });
// });

// // ====== LOGIN ======
// app.post("/login", (req, res) => {
//   const { email, senha } = req.body || {};
//   if (email === EXPECTED_EMAIL && senha === EXPECTED_SENHA) {
//     return res.json({ token: FIXED_TOKEN });
//   }
//   return res.status(401).json({ error: "Credenciais inválidas" });
// });

// // ====== AUTH MIDDLEWARE ======
// function authMiddleware(req, res, next) {
//   const auth = req.headers.authorization || "";
//   const [, token] = auth.split(" ");
//   if (token === FIXED_TOKEN) return next();
//   return res.status(401).json({ error: "Token inválido" });
// }

// // ====== CRUD ESTAÇÕES (PROTEGIDO) ======
// app.get("/estacoes", authMiddleware, (req, res) => {
//   const data = readData();
//   res.json(data);
// });

// app.post("/estacoes", authMiddleware, (req, res) => {
//   const estacoes = readData();
//   const {
//     nome,
//     descricao,
//     urlImagem,
//     cep,
//     logradouro,
//     estado,
//     cidade,
//     bairro,
//     numero,
//     complemento,
//     capacidadeToneladas,
//     tipoTratamento,
//     dataInicioOperacao,
//   } = req.body || {};

//   const nova = {
//     id: uuidv4(),
//     nome: nome || "Sem nome",
//     descricao: descricao || "",
//     urlImagem: urlImagem || "",
//     cep: cep || "",
//     logradouro: logradouro || "",
//     estado: estado || "",
//     cidade: cidade || "",
//     bairro: bairro || "",
//     numero: numero || "",
//     complemento: complemento || "",
//     capacidadeToneladas:
//       typeof capacidadeToneladas === "number" ? capacidadeToneladas : 0,
//     tipoTratamento: tipoTratamento || "",
//     dataInicioOperacao: dataInicioOperacao || "",
//     criadoEm: new Date().toISOString(),
//   };

//   estacoes.push(nova);
//   writeData(estacoes);
//   res.status(201).json(nova);
// });

// app.put("/estacoes/:id", authMiddleware, (req, res) => {
//   const estacoes = readData();
//   const idx = estacoes.findIndex((e) => e.id === req.params.id);
//   if (idx === -1) return res.status(404).json({ error: "Não encontrado" });

//   estacoes[idx] = { ...estacoes[idx], ...req.body, id: estacoes[idx].id };
//   writeData(estacoes);
//   res.json(estacoes[idx]);
// });

// app.delete("/estacoes/:id", authMiddleware, (req, res) => {
//   const estacoes = readData();
//   const idx = estacoes.findIndex((e) => e.id === req.params.id);
//   if (idx === -1) return res.status(404).json({ error: "Não encontrado" });

//   const [removida] = estacoes.splice(idx, 1);
//   writeData(estacoes);
//   res.json(removida);
// });

// // ====== START ======
// app.listen(PORT, "0.0.0.0", () => {
//   console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
//   console.log(
//     "CORS_ORIGIN:",
//     CORS_ORIGIN.length
//       ? CORS_ORIGIN
//       : "(vazio: liberado por callback .vercel.app)"
//   );
// });
