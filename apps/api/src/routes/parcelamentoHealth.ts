import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";

const DEFAULT_CONNECTION_STRING =
  "Data Source=S1326.MS;Initial Catalog=CRDDIA_PRODUCAO;Integrated Security=True;MultipleActiveResultSets=True;Application Name=TEAMCONTROL-PARCELAMENTO-HEALTH;TrustServerCertificate=True";
const SQL_JSON_COMMAND = String.raw`
$ErrorActionPreference = "Stop"
$queryFile = $env:TEAMCONTROL_SQL_QUERY_FILE
$connectionString = $env:TEAMCONTROL_SQL_CONNECTION_STRING
if ([string]::IsNullOrWhiteSpace($connectionString)) {
  throw "TEAMCONTROL_SQL_CONNECTION_STRING is required."
}
if ([string]::IsNullOrWhiteSpace($queryFile)) {
  throw "TEAMCONTROL_SQL_QUERY_FILE is required."
}

$query = [System.IO.File]::ReadAllText($queryFile, [System.Text.Encoding]::UTF8)
$connection = New-Object System.Data.SqlClient.SqlConnection $connectionString
$command = $connection.CreateCommand()
$command.CommandText = $query
$command.CommandTimeout = 60
$adapter = New-Object System.Data.SqlClient.SqlDataAdapter $command
$dataSet = New-Object System.Data.DataSet

try {
  [void]$adapter.Fill($dataSet)
  $tables = @()

  for ($i = 0; $i -lt $dataSet.Tables.Count; $i++) {
    $table = $dataSet.Tables[$i]
    $rows = @()

    foreach ($row in $table.Rows) {
      $item = [ordered]@{}

      foreach ($column in $table.Columns) {
        $value = $row[$column.ColumnName]
        if ($value -eq [System.DBNull]::Value) {
          $value = $null
        }

        $item[$column.ColumnName] = $value
      }

      $rows += [pscustomobject]$item
    }

    $tables += [pscustomobject]@{ name = $table.TableName; rows = $rows }
  }

  [pscustomobject]@{ ok = $true; tables = $tables } | ConvertTo-Json -Depth 8 -Compress
}
finally {
  if ($connection.State -ne [System.Data.ConnectionState]::Closed) {
    $connection.Close()
  }

  $connection.Dispose()
}
`;

type SqlJsonResult = {
  ok: boolean;
  tables: Array<{
    name: string;
    rows: Array<Record<string, any>>;
  }>;
};

export async function parcelamentoHealthRoutes(app: FastifyInstance) {
  app.get("/api/parcelamentos/health", async (req, reply) => {
    const days = clampNumber(Number((req.query as any)?.days ?? 30), 7, 180);
    const endDate = parseDate((req.query as any)?.endDate) ?? new Date();
    const startDate = addDays(endDate, -days + 1);
    const from = toIsoDate(startDate);
    const toExclusive = toIsoDate(addDays(endDate, 1));

    const query = `
SET NOCOUNT ON;

DECLARE @From date = '${from}';
DECLARE @ToExclusive date = '${toExclusive}';

SELECT
  COUNT_BIG(1) AS total,
  SUM(CAST(ISNULL(AutoParcelamento, 0) AS int)) AS autoParcelamento,
  SUM(CAST(ISNULL(AssinaturaDigital, 0) AS int)) AS assinaturaDigital,
  COUNT_BIG(CASE WHEN BeneficioID IS NOT NULL AND BeneficioID > 0 THEN 1 END) AS beneficioFiscal,
  AVG(CAST(QuantidadeParcelas AS decimal(18,2))) AS mediaParcelas,
  SUM(CAST(ISNULL(ValorTributoUAM, 0) AS decimal(18,2))) AS valorTributoUam,
  MAX(DataProtocolizacao) AS ultimaProtocolizacao
FROM CREDTRIB.Parcelamento WITH (NOLOCK)
WHERE DataProtocolizacao >= @From
  AND DataProtocolizacao < @ToExclusive;

SELECT
  CONVERT(varchar(10), CAST(DataProtocolizacao AS date), 23) AS dia,
  COUNT_BIG(1) AS total,
  SUM(CAST(ISNULL(AutoParcelamento, 0) AS int)) AS autoParcelamento,
  SUM(CAST(ISNULL(AssinaturaDigital, 0) AS int)) AS assinaturaDigital,
  COUNT_BIG(CASE WHEN BeneficioID IS NOT NULL AND BeneficioID > 0 THEN 1 END) AS beneficioFiscal,
  AVG(CAST(QuantidadeParcelas AS decimal(18,2))) AS mediaParcelas,
  SUM(CAST(ISNULL(ValorTributoUAM, 0) AS decimal(18,2))) AS valorTributoUam
FROM CREDTRIB.Parcelamento WITH (NOLOCK)
WHERE DataProtocolizacao >= @From
  AND DataProtocolizacao < @ToExclusive
GROUP BY CAST(DataProtocolizacao AS date)
ORDER BY dia DESC;

SELECT
  p.BeneficioID,
  b.Descricao,
  COUNT_BIG(1) AS total
FROM CREDTRIB.Parcelamento p WITH (NOLOCK)
LEFT JOIN CREDTRIB.Beneficio b WITH (NOLOCK)
  ON b.BeneficioID = p.BeneficioID
WHERE p.DataProtocolizacao >= @From
  AND p.DataProtocolizacao < @ToExclusive
  AND p.BeneficioID IS NOT NULL
  AND p.BeneficioID > 0
GROUP BY p.BeneficioID, b.Descricao
ORDER BY total DESC, b.Descricao ASC;

WITH SituacoesPrioritarias AS (
  SELECT DominioIDSituacao
  FROM (VALUES (125), (126), (3222), (3237), (3238), (4)) v(DominioIDSituacao)
),
SituacoesAgregadas AS (
  SELECT
    DominioIDSituacao,
    COUNT_BIG(1) AS total,
    SUM(CAST(ISNULL(ValorTributoUAM, 0) AS decimal(18,2))) AS valorTributoUam
  FROM CREDTRIB.Parcelamento WITH (NOLOCK)
  WHERE DataProtocolizacao >= @From
    AND DataProtocolizacao < @ToExclusive
  GROUP BY DominioIDSituacao
),
SituacoesJanela AS (
  SELECT DominioIDSituacao FROM SituacoesAgregadas
  UNION
  SELECT DominioIDSituacao FROM SituacoesPrioritarias
)
SELECT
  sj.DominioIDSituacao,
  (SELECT d.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER) AS SituacaoDominioJson,
  ISNULL(sa.total, 0) AS total,
  ISNULL(sa.valorTributoUam, 0) AS valorTributoUam
FROM SituacoesJanela sj
LEFT JOIN SituacoesAgregadas sa
  ON sa.DominioIDSituacao = sj.DominioIDSituacao
LEFT JOIN CREDTRIB.Dominio d WITH (NOLOCK)
  ON d.DominioID = sj.DominioIDSituacao
ORDER BY total DESC, sj.DominioIDSituacao ASC;

SELECT TOP 20
  p.ParcelamentoID,
  p.NumeroPPD,
  p.DominioIDSituacao,
  (SELECT d.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER) AS SituacaoDominioJson,
  CONVERT(varchar(19), p.DataProtocolizacao, 120) AS DataProtocolizacao,
  p.NumeroSPI,
  p.QuantidadeParcelas,
  p.LocalPPD,
  p.AutoParcelamento,
  p.AssinaturaDigital,
  p.BeneficioID,
  b.Descricao AS BeneficioDescricao,
  CAST(p.ValorTributoUAM AS decimal(18,2)) AS ValorTributoUAM
FROM CREDTRIB.Parcelamento p WITH (NOLOCK)
LEFT JOIN CREDTRIB.Beneficio b WITH (NOLOCK)
  ON b.BeneficioID = p.BeneficioID
LEFT JOIN CREDTRIB.Dominio d WITH (NOLOCK)
  ON d.DominioID = p.DominioIDSituacao
WHERE p.DataProtocolizacao >= @From
  AND p.DataProtocolizacao < @ToExclusive
ORDER BY p.DataProtocolizacao DESC;
`;

    try {
      const result = await runSqlJson(query);
      const summary = result.tables[0]?.rows[0] ?? {};
      const daily = result.tables[1]?.rows ?? [];
      const benefits = result.tables[2]?.rows ?? [];
      const situations = result.tables[3]?.rows ?? [];
      const latest = result.tables[4]?.rows ?? [];

      return reply.send({
        from,
        to: toIsoDate(endDate),
        days,
        summary: normalizeSummary(summary),
        daily: daily.map(normalizeDailyRow),
        benefits: benefits.map(normalizeBenefitRow),
        situations: situations.map(normalizeSituationRow).sort(sortSituations),
        latest: latest.map(normalizeLatestRow),
      });
    } catch (error: any) {
      return reply.code(502).send({
        error: "PARCELAMENTO_SQL_ERROR",
        message: String(error?.message ?? error),
      });
    }
  });
}

function runSqlJson(query: string): Promise<SqlJsonResult> {
  const connectionString = process.env.CRD_SQL_CONNECTION_STRING || DEFAULT_CONNECTION_STRING;

  return new Promise((resolve, reject) => {
    fs.mkdtemp(path.join(os.tmpdir(), "team-control-sql-"), (tempError, tempDir) => {
      if (tempError) {
        reject(tempError);
        return;
      }

      const queryFile = path.join(tempDir, "parcelamento-health.sql");

      fs.writeFile(queryFile, query, "utf8", (writeError) => {
        if (writeError) {
          cleanupTempDir(tempDir);
          reject(writeError);
          return;
        }

        execFile(
          "powershell.exe",
          ["-NoProfile", "-NonInteractive", "-Command", SQL_JSON_COMMAND],
          {
            timeout: 90_000,
            maxBuffer: 1024 * 1024 * 8,
            windowsHide: true,
            env: {
              ...process.env,
              TEAMCONTROL_SQL_CONNECTION_STRING: connectionString,
              TEAMCONTROL_SQL_QUERY_FILE: queryFile,
            },
          },
      (error, stdout, stderr) => {
            cleanupTempDir(tempDir);

        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }

        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error(stdout.trim() || "Invalid SQL JSON response"));
        }
      }
    );
      });
    });
  });
}

function cleanupTempDir(tempDir: string) {
  fs.rm(tempDir, { recursive: true, force: true }, () => {});
}

function normalizeSummary(row: Record<string, any>) {
  return {
    total: Number(row.total ?? 0),
    autoParcelamento: Number(row.autoParcelamento ?? 0),
    assinaturaDigital: Number(row.assinaturaDigital ?? 0),
    beneficioFiscal: Number(row.beneficioFiscal ?? 0),
    mediaParcelas: Number(row.mediaParcelas ?? 0),
    valorTributoUam: Number(row.valorTributoUam ?? 0),
    ultimaProtocolizacao: row.ultimaProtocolizacao ? String(row.ultimaProtocolizacao) : null,
  };
}

function normalizeDailyRow(row: Record<string, any>) {
  return {
    dia: String(row.dia),
    total: Number(row.total ?? 0),
    autoParcelamento: Number(row.autoParcelamento ?? 0),
    assinaturaDigital: Number(row.assinaturaDigital ?? 0),
    beneficioFiscal: Number(row.beneficioFiscal ?? 0),
    mediaParcelas: Number(row.mediaParcelas ?? 0),
    valorTributoUam: Number(row.valorTributoUam ?? 0),
  };
}

function normalizeBenefitRow(row: Record<string, any>) {
  return {
    beneficioId: Number(row.BeneficioID ?? 0),
    descricao: row.Descricao ? String(row.Descricao) : "Sem descricao",
    total: Number(row.total ?? 0),
  };
}

function normalizeSituationRow(row: Record<string, any>) {
  const situacaoId = Number(row.DominioIDSituacao ?? 0);
  const meta = situationMeta(situacaoId);
  const label = extractDominioLabel(row.SituacaoDominioJson, meta.label);
  return {
    situacaoId,
    label,
    importance: meta.importance,
    total: Number(row.total ?? 0),
    valorTributoUam: Number(row.valorTributoUam ?? 0),
  };
}

function situationMeta(situacaoId: number) {
  const labels: Record<number, { label: string; importance: number }> = {
    125: { label: "Em Dia", importance: 1 },
    126: { label: "Em Atraso", importance: 2 },
    3222: { label: "Rompido", importance: 3 },
    3237: { label: "Enviado para PGE", importance: 4 },
    3238: { label: "Inscrito em Divida Ativa", importance: 5 },
    3: { label: "Pendente", importance: 10 },
    4: { label: "Quitado", importance: 11 },
    6: { label: "Amortizado", importance: 12 },
    103: { label: "Excluido", importance: 13 },
    3236: { label: "Aguardando Envio para PGE", importance: 14 },
    3321: { label: "Extinto", importance: 15 },
    3322: { label: "Extinto/Enviado para PGE", importance: 16 },
  };
  return labels[situacaoId] ?? { label: `Situacao ${situacaoId}`, importance: 99 };
}

function sortSituations(a: ReturnType<typeof normalizeSituationRow>, b: ReturnType<typeof normalizeSituationRow>) {
  if (a.importance !== b.importance) return a.importance - b.importance;
  return b.total - a.total;
}

function normalizeLatestRow(row: Record<string, any>) {
  return {
    parcelamentoId: Number(row.ParcelamentoID ?? 0),
    numeroPpd: Number(row.NumeroPPD ?? 0),
    dominioIdSituacao: Number(row.DominioIDSituacao ?? 0),
    situacaoLabel: extractDominioLabel(row.SituacaoDominioJson, situationMeta(Number(row.DominioIDSituacao ?? 0)).label),
    dataProtocolizacao: row.DataProtocolizacao ? String(row.DataProtocolizacao) : null,
    numeroSpi: row.NumeroSPI ? String(row.NumeroSPI) : null,
    quantidadeParcelas: Number(row.QuantidadeParcelas ?? 0),
    localPpd: row.LocalPPD ? String(row.LocalPPD) : null,
    autoParcelamento: normalizeBit(row.AutoParcelamento),
    assinaturaDigital: normalizeBit(row.AssinaturaDigital),
    beneficioId: row.BeneficioID == null ? null : Number(row.BeneficioID),
    beneficioDescricao: row.BeneficioDescricao ? String(row.BeneficioDescricao) : null,
    valorTributoUam: Number(row.ValorTributoUAM ?? 0),
  };
}

function extractDominioLabel(rawJson: unknown, fallback: string) {
  const raw = String(rawJson ?? "").trim();
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const preferredKeys = [
      "DescricaoDominio",
      "DominioDescricao",
      "DescricaoSituacao",
      "NomeDominio",
      "Descricao",
      "Nome",
      "Valor",
      "Texto",
    ];

    for (const key of preferredKeys) {
      const value = parsed[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }

    for (const [key, value] of Object.entries(parsed)) {
      if (/descr|nome|valor|texto|situacao/i.test(key) && typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function normalizeBit(value: unknown) {
  if (typeof value === "boolean") return value;
  return Number(value ?? 0) === 1;
}

function parseDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}
