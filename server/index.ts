import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import path from "path";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { applyLocalConfigToEnv } from "./local-config";

// Aplica todas as variÃ¡veis salvas na config local antes de qualquer coisa
applyLocalConfigToEnv();

declare module "express-session" {
  interface SessionData {
    authenticated?: boolean;
  }
}

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "60mb" }));

const isProduction = process.env.NODE_ENV === "production";
if (isProduction) {
  app.set("trust proxy", 1);
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("pt-BR", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      log(logLine);
    }
  });

  next();
});

async function buildSessionMiddleware() {
  const dbUrl = process.env.DATABASE_URL;
  const secret = process.env.SESSION_SECRET || "assistente-juridico-secret-2024";

  if (dbUrl) {
    try {
      const pg = await import("pg");
      const connectPg = (await import("connect-pg-simple")).default;
      const PgSession = connectPg(session);

      // Testa a conexÃ£o antes de usar como session store
      const testPool = new pg.default.Pool({ connectionString: dbUrl, connectionTimeoutMillis: 5000 });
      await testPool.connect().then(c => c.release());

      // Garante a tabela de sessÃ£o
      const client = await testPool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS "session" (
            "sid" varchar NOT NULL COLLATE "default",
            "sess" json NOT NULL,
            "expire" timestamp(6) NOT NULL,
            CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
          ) WITH (OIDS=FALSE);
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");`);
      } finally {
        client.release();
      }

      log("[session] Usando banco de dados PostgreSQL para sessÃµes");
      return session({
        store: new PgSession({ pool: testPool, tableName: "session" }),
        secret,
        resave: false,
        saveUninitialized: false,
        cookie: { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: "lax", secure: isProduction },
      });
    } catch (e) {
      console.warn("[session] Banco indisponÃ­vel, usando sessÃµes em memÃ³ria:", (e as Error).message);
    }
  } else {
    log("[session] DATABASE_URL nÃ£o definida â usando sessÃµes em memÃ³ria");
  }

  // Fallback: sessÃ£o em memÃ³ria (funciona sem banco)
  return session({
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: "lax", secure: isProduction },
  });
}

(async () => {
  try {
    // SessÃµes (com ou sem banco)
    const sessionMiddleware = await buildSessionMiddleware();
    app.use(sessionMiddleware);

    // MigraÃ§Ã£o (opcional, nunca quebra o app)
    if (process.env.DATABASE_URL) {
      try {
        const pg = await import("pg");
        const { drizzle } = await import("drizzle-orm/node-postgres");
        const { migrate } = await import("drizzle-orm/node-postgres/migrator");
        const migratePool = new pg.default.Pool({
          connectionString: process.env.DATABASE_URL,
          connectionTimeoutMillis: 5000,
        });
        const migrateDb = drizzle(migratePool);
        const migrationsFolder = isProduction
          ? path.join(process.cwd(), "migrations")
          : path.join(import.meta.dirname ?? __dirname, "..", "migrations");
        await migrate(migrateDb, { migrationsFolder });
        await migratePool.end();
        log("[migrate] MigraÃ§Ã£o concluÃ­da com sucesso");
      } catch (e) {
        console.warn("[migrate] Aviso (nÃ£o crÃ­tico):", (e as Error).message);
      }
    }

    // Storage (com fallback para memÃ³ria)
    const { checkDbAndInitStorage } = await import("./storage");
    await checkDbAndInitStorage();

    // Rotas
    await registerRoutes(httpServer, app);

    app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      console.error("Internal Server Error:", err);
      if (res.headersSent) return next(err);
      return res.status(status).json({ message });
    });

    if (isProduction) {
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }

    const port = parseInt(process.env.PORT || "5000", 10);
    httpServer.on("error", (err: any) => {
      if (err?.code === "EADDRINUSE" && port === 5000) {
        httpServer.listen(5001, "0.0.0.0", () => log("serving on port 5001"));
        return;
      }
      throw err;
    });
    httpServer.listen(port, "0.0.0.0", () => log(`serving on port ${port}`));
  } catch (fatalErr) {
    console.error("[FATAL] Server failed to start:", fatalErr);
    process.exit(1);
  }
})();
