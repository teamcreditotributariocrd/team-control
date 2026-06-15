import { execFile } from "node:child_process";
import { Buffer } from "node:buffer";
import type { FastifyInstance } from "fastify";

const DEFAULT_CONNECTION_STRING =
  "Data Source=S1326.MS;Initial Catalog=CRDDIA_PRODUCAO;Integrated Security=True;MultipleActiveResultSets=True;Application Name=TEAMCONTROL-PARCELAMENTO-HEALTH;TrustServerCertificate=True";

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
  COUNT_BIG(CASE WHEN DataHomologacao IS NOT NULL THEN 1 END) AS homologados,
  COUNT_BIG(CASE WHEN DataHomologacao IS NULL THEN 1 END) AS semHomologacao,
  COUNT_BIG(CASE WHEN DebitoAutomaticoAutorizado = 'S' THEN 1 END) AS debitoAutomatico,
  AVG(CAST(QuantidadeParcelas AS decimal(18,2))) AS mediaParcelas,
  SUM(CAST(ISNULL(ValorTributoUAM, 0) AS decimal(18,2))) AS valorTributoUam,
  MAX(DataProtocolizacao) AS ultimaProtocolizacao
FROM CREDTRIB.Parcelamento WITH (NOLOCK)
WHERE DataProtocolizacao >= @From
  AND DataProtocolizacao < @ToExclusive;

SELECT
  CONVERT(varchar(10), CAST(DataProtocolizacao AS date), 23) AS dia,
  COUNT_BIG(1) AS total,
  COUNT_BIG(CASE WHEN DataHomologacao IS NOT NULL THEN 1 END) AS homologados,
  COUNT_BIG(CASE WHEN DataHomologacao IS NULL THEN 1 END) AS semHomologacao,
  COUNT_BIG(CASE WHEN DebitoAutomaticoAutorizado = 'S' THEN 1 END) AS debitoAutomatico,
  AVG(CAST(QuantidadeParcelas AS decimal(18,2))) AS mediaParcelas,
  SUM(CAST(ISNULL(ValorTributoUAM, 0) AS decimal(18,2))) AS valorTributoUam
FROM CREDTRIB.Parcelamento WITH (NOLOCK)
WHERE DataProtocolizacao >= @From
  AND DataProtocolizacao < @ToExclusive
GROUP BY CAST(DataProtocolizacao AS date)
ORDER BY dia DESC;

SELECT TOP 20
  ParcelamentoID,
  NumeroPPD,
  DominioIDSituacao,
  CONVERT(varchar(19), DataProtocolizacao, 120) AS DataProtocolizacao,
  NumeroSPI,
  CONVERT(varchar(19), DataHomologacao, 120) AS DataHomologacao,
  QuantidadeParcelas,
  LocalPPD,
  DebitoAutomaticoAutorizado,
  CAST(ValorTributoUAM AS decimal(18,2)) AS ValorTributoUAM
FROM CREDTRIB.Parcelamento WITH (NOLOCK)
WHERE DataProtocolizacao >= @From
  AND DataProtocolizacao < @ToExclusive
ORDER BY DataProtocolizacao DESC;
`;

    try {
      const result = await runSqlJson(query);
      const summary = result.tables[0]?.rows[0] ?? {};
      const daily = result.tables[1]?.rows ?? [];
      const latest = result.tables[2]?.rows ?? [];

      return reply.send({
        from,
        to: toIsoDate(endDate),
        days,
        summary: normalizeSummary(summary),
        daily: daily.map(normalizeDailyRow),
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
  const encodedScript = Buffer.from(`
$ErrorActionPreference = "Stop"
$connectionString = $env:TEAMCONTROL_SQL_CONNECTION_STRING
$query = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($env:TEAMCONTROL_SQL_QUERY_B64))
$connection = New-Object System.Data.SqlClient.SqlConnection $connectionString
$command = $connection.CreateCommand()
$command.CommandText = $query
$command.CommandTimeout = 60
$adapter = New-Object System.Data.SqlClient.SqlDataAdapter $command
$dataSet = New-Object System.Data.DataSet
[void]$adapter.Fill($dataSet)
$tables = @()
for ($i = 0; $i -lt $dataSet.Tables.Count; $i++) {
  $table = $dataSet.Tables[$i]
  $rows = @()
  foreach ($row in $table.Rows) {
    $item = [ordered]@{}
    foreach ($column in $table.Columns) {
      $value = $row[$column.ColumnName]
      if ($value -eq [System.DBNull]::Value) { $value = $null }
      $item[$column.ColumnName] = $value
    }
    $rows += [pscustomobject]$item
  }
  $tables += [pscustomobject]@{ name = $table.TableName; rows = $rows }
}
[pscustomobject]@{ ok = $true; tables = $tables } | ConvertTo-Json -Depth 8 -Compress
`, "utf16le").toString("base64");

  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedScript],
      {
        timeout: 90_000,
        maxBuffer: 1024 * 1024 * 8,
        env: {
          ...process.env,
          TEAMCONTROL_SQL_CONNECTION_STRING: connectionString,
          TEAMCONTROL_SQL_QUERY_B64: Buffer.from(query, "utf8").toString("base64"),
        },
      },
      (error, stdout, stderr) => {
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
}

function normalizeSummary(row: Record<string, any>) {
  return {
    total: Number(row.total ?? 0),
    homologados: Number(row.homologados ?? 0),
    semHomologacao: Number(row.semHomologacao ?? 0),
    debitoAutomatico: Number(row.debitoAutomatico ?? 0),
    mediaParcelas: Number(row.mediaParcelas ?? 0),
    valorTributoUam: Number(row.valorTributoUam ?? 0),
    ultimaProtocolizacao: row.ultimaProtocolizacao ? String(row.ultimaProtocolizacao) : null,
  };
}

function normalizeDailyRow(row: Record<string, any>) {
  return {
    dia: String(row.dia),
    total: Number(row.total ?? 0),
    homologados: Number(row.homologados ?? 0),
    semHomologacao: Number(row.semHomologacao ?? 0),
    debitoAutomatico: Number(row.debitoAutomatico ?? 0),
    mediaParcelas: Number(row.mediaParcelas ?? 0),
    valorTributoUam: Number(row.valorTributoUam ?? 0),
  };
}

function normalizeLatestRow(row: Record<string, any>) {
  return {
    parcelamentoId: Number(row.ParcelamentoID ?? 0),
    numeroPpd: Number(row.NumeroPPD ?? 0),
    dominioIdSituacao: Number(row.DominioIDSituacao ?? 0),
    dataProtocolizacao: row.DataProtocolizacao ? String(row.DataProtocolizacao) : null,
    numeroSpi: row.NumeroSPI ? String(row.NumeroSPI) : null,
    dataHomologacao: row.DataHomologacao ? String(row.DataHomologacao) : null,
    quantidadeParcelas: Number(row.QuantidadeParcelas ?? 0),
    localPpd: row.LocalPPD ? String(row.LocalPPD) : null,
    debitoAutomaticoAutorizado: row.DebitoAutomaticoAutorizado ? String(row.DebitoAutomaticoAutorizado) : null,
    valorTributoUam: Number(row.ValorTributoUAM ?? 0),
  };
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
