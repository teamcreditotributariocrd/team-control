// apps/api/scripts/testCreateMultipleTfsTasks_AssinaturaGovBr.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import axios from "axios";
import { NtlmClient } from "axios-ntlm";

// carrega .env do apps/api/.env mesmo se você rodar de outra pasta
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../.env");
dotenv.config({ path: envPath });

const COLLECTION_URL = process.env.TFS_COLLECTION_URL;
const PROJECT = process.env.TFS_PROJECT;
const DOMAIN = process.env.NTLM_DOMAIN;
const USERNAME = process.env.NTLM_USERNAME;
const PASSWORD = process.env.NTLM_PASSWORD;
const WORKSTATION = process.env.NTLM_WORKSTATION;

if (!COLLECTION_URL || !PROJECT || !DOMAIN || !USERNAME || !PASSWORD || !WORKSTATION) {
    console.error("Missing TFS/NTLM env vars (loaded from: " + envPath + ")");
    process.exit(1);
}

const client = NtlmClient(
    {
        username: USERNAME,
        password: PASSWORD,
        domain: DOMAIN,
        workstation: WORKSTATION,
    },
    axios
);

const PBI_ID = 1333955;
const url = `${COLLECTION_URL}/${PROJECT}/_apis/wit/workitems/$Task?api-version=1.0`;

const tarefas = [
    {
        dataExecucao: "2026-04-27",
        complemento: "teste do fluxo"
    },
    {
        dataExecucao: "2026-04-28",
        complemento: "criação do PPD"
    },
    {
        dataExecucao: "2026-04-29",
        complemento: "preparação dos dados"
    }
];

function formatDateBr(isoDate) {
    const [year, month, day] = isoDate.split("-");
    return `${day}/${month}/${year}`;
}

function buildPayload(dataExecucao, complemento) {
    const dataBr = formatDateBr(dataExecucao);
    const title = `Criação de fluxo de assinatura digital com gov.br para vídeo de credenciais de Produção ${dataBr} - ${complemento}`;
    const description = `Criação de fluxo de assinatura digital com gov.br para vídeo de credenciais de Produção - ${complemento}`;

    return [
        { op: "add", path: "/fields/System.Title", value: title },
        {
            op: "add",
            path: "/fields/System.Description",
            value: description
        },
        { op: "add", path: "/fields/System.AssignedTo", value: "Jorge Barbosa de Souza Neto" },
        { op: "add", path: "/fields/System.State", value: "To Do" },
        { op: "add", path: "/fields/System.AreaPath", value: "CSIS-G07\\CRD" },
        { op: "add", path: "/fields/System.IterationPath", value: "CSIS-G07" },

        {
            op: "add",
            path: "/fields/Custom.COTIN.AtividadeUST",
            value: "41 - Análise e Projeto - Cerimônias/Reuniões - Reunião Tecnica / Super Complexa / Acima de 3 horas até 4,5 horas de duração. Por profissional envolvido. Limitada a quantidade de frações de tempo dos dias úteis do mês."
        },
        {
            op: "add",
            path: "/fields/Custom.COTIN.Empresa",
            value: "MIL TEC TECNOLOGIA - 055/2021 - 8"
        },
        {
            op: "add",
            path: "/fields/Custom.COTIN.ComplexidadeUST",
            value: "Super Complexa"
        },
        {
            op: "add",
            path: "/fields/Custom.COTIN.Faturado",
            value: "Não"
        },
        {
            op: "add",
            path: "/fields/Custom.COTIN.DataExecucao",
            value: `${dataExecucao}T12:00:00Z`
        },

        {
            op: "add",
            path: "/relations/-",
            value: {
                rel: "System.LinkTypes.Hierarchy-Reverse",
                url: `${COLLECTION_URL}/_apis/wit/workItems/${PBI_ID}`
            }
        }
    ];
}

const created = [];
const failed = [];

for (const tarefa of tarefas) {
    const payload = buildPayload(tarefa.dataExecucao, tarefa.complemento);

    try {
        const response = await client.patch(url, payload, {
            headers: {
                "Content-Type": "application/json-patch+json"
            }
        });

        created.push({
            dataExecucao: tarefa.dataExecucao,
            complemento: tarefa.complemento,
            id: response.data.id,
            title: response.data.fields?.["System.Title"]
        });

        console.log(`OK: ${tarefa.dataExecucao} (${tarefa.complemento}) -> Task ${response.data.id}`);
    } catch (error) {
        failed.push({
            dataExecucao: tarefa.dataExecucao,
            complemento: tarefa.complemento,
            error: error?.response?.data || error.message
        });

        console.error(`ERRO: ${tarefa.dataExecucao} (${tarefa.complemento})`);
        console.error(error?.response?.data || error.message);
    }
}

console.log("\nResumo final");
console.log("Tasks criadas:", created.length);
console.log("Falhas:", failed.length);

if (created.length) {
    console.log("\nCriadas:");
    for (const item of created) {
        console.log(`- ${item.dataExecucao} | ${item.complemento} | ${item.id} | ${item.title}`);
    }
}

if (failed.length) {
    console.log("\nFalhas:");
    for (const item of failed) {
        console.log(`- ${item.dataExecucao} | ${item.complemento} | ${JSON.stringify(item.error)}`);
    }
}
