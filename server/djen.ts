/**
 * RobÃ´ JurÃ­dico DJEN â LÃ³gica de consulta e processamento
 * Consulta a API do DJEN/CNJ, extrai datas e associa clientes
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { eq, desc } from "drizzle-orm";
import pg from "pg";
import { djenClientes, djenPublicacoes, djenExecucoes, appSettings } from "@shared/schema";
import { randomUUID } from "crypto";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

// ââ ConfiguraÃ§Ã£o âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export interface DjenConfig {
  djenToken: string;
  pdpjPemKey: string;
  advogadoCpf: string;
  advogadoNome: string;
  jwtIssuer: string;
  jwtAudience: string;
  emailLogin: string;
  emailSenha: string;
  imapServer: string;
  salvarDrive: boolean;
  pastaDriveId: string;
  maxPaginas: number;
}

const CONFIG_KEY = "djen_config";

export async function getDjenConfig(): Promise<DjenConfig> {
  try {
    const row = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, CONFIG_KEY))
      .limit(1);
    if (row[0]) {
      return JSON.parse(row[0].value) as DjenConfig;
    }
  } catch {}
  return {
    djenToken: "",
    pdpjPemKey: "",
    advogadoCpf: "",
    advogadoNome: "",
    jwtIssuer: "pdpj-br",
    jwtAudience: "https://comunicaapi.pje.jus.br",
    emailLogin: "",
    emailSenha: "",
    imapServer: "imap.gmail.com",
    salvarDrive: false,
    pastaDriveId: "",
    maxPaginas: 5,
  };
}

export async function saveDjenConfig(config: DjenConfig): Promise<void> {
  const value = JSON.stringify(config);
  const existing = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, CONFIG_KEY))
    .limit(1);
  if (existing[0]) {
    await db
      .update(appSettings)
      .set({ value, updatedAt: new Date() })
      .where(eq(appSettings.key, CONFIG_KEY));
  } else {
    await db.insert(appSettings).values({ key: CONFIG_KEY, value });
  }
}

// ââ JWT RS256 âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

async function gerarTokenJwt(config: DjenConfig): Promise<string> {
  try {
    const jwt = await import("jsonwebtoken");
    // Garante quebras de linha corretas na chave PEM
    const pemFormatado = config.pdpjPemKey.replace(/\\n/g, "\n").trim();
    const cpfLimpo = config.advogadoCpf.replace(/\D/g, "");
    if (cpfLimpo.length !== 11) throw new Error("CPF invÃ¡lido â deve ter 11 dÃ­gitos");

    const issuer   = config.jwtIssuer   || "pdpj-br";
    const audience = config.jwtAudience || "https://comunicaapi.pje.jus.br";
    const agora = Math.floor(Date.now() / 1000);

    const payload: Record<string, any> = {
      sub: cpfLimpo,
      iss: issuer,
      aud: audience,
      iat: agora,
      exp: agora + 3600,
      jti: `djen-${agora}`,
    };
    // Inclui nome do advogado se configurado (exigido por alguns endpoints)
    if (config.advogadoNome) payload.name = config.advogadoNome;

    const token = jwt.default.sign(payload, pemFormatado, { algorithm: "RS256" });
    return typeof token === "string" ? token : (token as any).toString();
  } catch (e: any) {
    throw new Error(`Erro ao gerar JWT: ${e.message}`);
  }
}

async function obterToken(config: DjenConfig): Promise<string> {
  if (config.djenToken) return config.djenToken;
  if (config.pdpjPemKey && config.advogadoCpf) {
    return gerarTokenJwt(config);
  }
  return "";
}

// ââ API DJEN ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

const DJEN_URL = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";

async function buscarPublicacoesDJEN(token: string, maxPaginas: number): Promise<any[]> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };

  const todas: any[] = [];

  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const url = `${DJEN_URL}?pagina=${pagina}&itensPorPagina=20`;
    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });

    if (resp.status === 401) throw new Error("Token invÃ¡lido ou expirado (401)");
    if (resp.status === 403) throw new Error("IP bloqueado ou chave nÃ£o registrada no PDPJ (403)");
    if (!resp.ok) throw new Error(`Erro HTTP ${resp.status}`);

    const dados = await resp.json();
    const itens = dados.comunicacoes || dados.data || dados;
    const lista = Array.isArray(itens) ? itens : Object.values(itens as object);

    if (!lista.length) break;
    todas.push(...lista);

    const total = parseInt(dados.total || dados.totalItens || "0");
    if (total && todas.length >= total) break;
  }

  return todas;
}

// ââ Regex para extraÃ§Ã£o de datas ââââââââââââââââââââââââââââââââââââââââââââââ

const DATA_RE = /(\d{2}\/\d{2}\/\d{4})/;
const CONECTIVOS = /(?:e|a|atÃ©|ao|com\s+tÃ©rmino\s+em|com\s+tÃ©rmino)/i;

const PADROES = [
  new RegExp(`entre\\s+os\\s+dias\\s+${DATA_RE.source}\\s+${CONECTIVOS.source}\\s+${DATA_RE.source}`, "i"),
  new RegExp(`per[Ã­i]odo\\s+de\\s+${DATA_RE.source}\\s+${CONECTIVOS.source}\\s+${DATA_RE.source}`, "i"),
  new RegExp(`julgamento\\s+(?:virtual\\s+)?de\\s+${DATA_RE.source}\\s+${CONECTIVOS.source}\\s+${DATA_RE.source}`, "i"),
  new RegExp(`de\\s+${DATA_RE.source}\\s+${CONECTIVOS.source}\\s+${DATA_RE.source}`, "i"),
];

function parseData(texto: string): Date | null {
  const [dia, mes, ano] = texto.split("/").map(Number);
  const d = new Date(ano, mes - 1, dia);
  return isNaN(d.getTime()) ? null : d;
}

function formatData(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function extrairDadosSessao(texto: string): { inicio: string; fim: string; prazoOral: string } | null {
  for (const padrao of PADROES) {
    const m = padrao.exec(texto);
    if (m) {
      const dtInicio = parseData(m[1]);
      const dtFim = parseData(m[2]);
      if (!dtInicio || !dtFim) continue;
      const dtPrazo = new Date(dtInicio.getTime() - 48 * 60 * 60 * 1000);
      return {
        inicio: formatData(dtInicio),
        fim: formatData(dtFim),
        prazoOral: `${formatData(dtPrazo)} Ã s 23:59`,
      };
    }
  }
  return null;
}

// ââ NormalizaÃ§Ã£o de nÃºmero de processo âââââââââââââââââââââââââââââââââââââââ

function normalizarProcesso(n: string): string {
  return n.replace(/\s+/g, "").trim();
}

// ââ ExecuÃ§Ã£o principal ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export async function executarRobo(): Promise<{
  execucaoId: string;
  sucesso: boolean;
  mensagem: string;
  estatisticas: { total: number; processadas: number; comErro: number; ignoradas: number };
  log: string[];
}> {
  const execId = randomUUID();
  const logs: string[] = [];
  const stats = { total: 0, processadas: 0, comErro: 0, ignoradas: 0 };

  await db.insert(djenExecucoes).values({
    id: execId,
    status: "executando",
    log: "",
  });

  const addLog = (msg: string) => {
    logs.push(`[${new Date().toLocaleTimeString("pt-BR")}] ${msg}`);
  };

  try {
    const config = await getDjenConfig();
    addLog("ConfiguraÃ§Ã£o carregada");

    const token = await obterToken(config);

    let publicacoes: any[] = [];

    if (!token) {
      addLog("â ï¸  Sem token â usando dados de demonstraÃ§Ã£o");
      publicacoes = dadosSimulados();
    } else {
      addLog("ð Token obtido, consultando DJEN...");
      publicacoes = await buscarPublicacoesDJEN(token, config.maxPaginas || 5);
      addLog(`ð¦ ${publicacoes.length} publicaÃ§Ã£o(Ãµes) encontrada(s)`);
    }

    stats.total = publicacoes.length;

    const clientes = await db.select().from(djenClientes);
    const clienteMap = new Map<string, typeof clientes[0]>();
    for (const c of clientes) {
      clienteMap.set(normalizarProcesso(c.numeroProcesso), c);
    }
    addLog(`ð¥ ${clientes.length} cliente(s) cadastrado(s)`);

    for (const pub of publicacoes) {
      const numProc = pub.numeroProcesso || pub.numero_processo || "";
      const texto = pub.texto || pub.conteudo || "";
      const linkDoc = pub.linkDocumento || pub.link || "";

      addLog(`ð Processando: ${numProc}`);

      const dadosSessao = extrairDadosSessao(texto);

      if (!dadosSessao) {
        addLog(`   â¹ï¸  Sem sessÃ£o identificada â ignorado`);
        stats.ignoradas++;
        continue;
      }

      addLog(`   ð SessÃ£o: ${dadosSessao.inicio} â ${dadosSessao.fim}`);

      const cliente = clienteMap.get(normalizarProcesso(numProc));

      await db.insert(djenPublicacoes).values({
        id: randomUUID(),
        execucaoId: execId,
        numeroProcesso: numProc,
        texto: texto.substring(0, 2000),
        inicioSessao: dadosSessao.inicio,
        fimSessao: dadosSessao.fim,
        prazoOral: dadosSessao.prazoOral,
        linkDocumento: linkDoc,
        clienteId: cliente?.id || "",
        clienteNome: cliente?.nomeCompleto || "",
        emailStatus: "nao_enviado",
      });

      if (cliente) {
        addLog(`   ð¤ Cliente: ${cliente.nomeCompleto} (${cliente.email})`);
        stats.processadas++;
      } else {
        addLog(`   â ï¸  Cliente nÃ£o encontrado na lista`);
        stats.ignoradas++;
      }
    }

    const logFinal = logs.join("\n");
    await db
      .update(djenExecucoes)
      .set({
        status: "concluido",
        totalPublicacoes: String(stats.total),
        processadas: String(stats.processadas),
        comErro: String(stats.comErro),
        ignoradas: String(stats.ignoradas),
        log: logFinal,
      })
      .where(eq(djenExecucoes.id, execId));

    return {
      execucaoId: execId,
      sucesso: true,
      mensagem: `ConcluÃ­do: ${stats.processadas} processadas, ${stats.comErro} com erro, ${stats.ignoradas} ignoradas`,
      estatisticas: stats,
      log: logs,
    };
  } catch (e: any) {
    addLog(`â Erro: ${e.message}`);
    await db
      .update(djenExecucoes)
      .set({ status: "erro", log: logs.join("\n") })
      .where(eq(djenExecucoes.id, execId));
    return {
      execucaoId: execId,
      sucesso: false,
      mensagem: `Erro: ${e.message}`,
      estatisticas: stats,
      log: logs,
    };
  }
}

// ââ GeraÃ§Ã£o de token pÃºblica (para usar no Swagger) âââââââââââââââââââââââââââ

export async function gerarTokenPublico(config: DjenConfig): Promise<string> {
  return gerarTokenJwt(config);
}

// ââ FunÃ§Ãµes auxiliares para os endpoints âââââââââââââââââââââââââââââââââââââ

export async function listarClientes() {
  return db.select().from(djenClientes).orderBy(desc(djenClientes.createdAt));
}

export async function criarCliente(data: {
  nomeCompleto: string;
  email: string;
  tratamento: string;
  nomeCaso: string;
  numeroProcesso: string;
}) {
  const [criado] = await db.insert(djenClientes).values({
    nomeCompleto: data.nomeCompleto,
    email: data.email || "",
    tratamento: data.tratamento || `Prezado(a) ${data.nomeCompleto.split(" ")[0]}`,
    nomeCaso: data.nomeCaso || "",
    numeroProcesso: data.numeroProcesso,
  }).returning();
  return criado;
}

export async function deletarCliente(id: string) {
  await db.delete(djenClientes).where(eq(djenClientes.id, id));
}

export async function listarPublicacoes() {
  return db.select().from(djenPublicacoes).orderBy(desc(djenPublicacoes.createdAt)).limit(200);
}

export async function listarExecucoes() {
  return db.select().from(djenExecucoes).orderBy(desc(djenExecucoes.createdAt)).limit(50);
}

// ââ Dados simulados para demonstraÃ§Ã£o ââââââââââââââââââââââââââââââââââââââââ

function dadosSimulados(): any[] {
  return [
    {
      numeroProcesso: "6002755-35.2024.4.06.3819",
      texto:
        "JULGAMENTO VIRTUAL. Processo nÂº 6002755-35.2024.4.06.3819. O julgamento ocorrerÃ¡ de forma virtual entre os dias 26/11/2025 e 02/12/2025. Partes: Maikon da Rocha Caldeira. Assunto: Aposentadoria por Tempo de ContribuiÃ§Ã£o.",
      linkDocumento: "",
    },
    {
      numeroProcesso: "0001234-56.2023.8.21.0001",
      texto:
        "PAUTA VIRTUAL. Processo nÂº 0001234-56.2023.8.21.0001. SessÃ£o virtual de julgamento designada para o perÃ­odo de 10/12/2025 a 17/12/2025. Recurso de apelaÃ§Ã£o.",
      linkDocumento: "",
    },
  ];
}
