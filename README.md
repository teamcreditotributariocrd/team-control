# UST Apurador (TFS / Azure DevOps Server - NTLM)

Monorepo com:
- **apps/api**: Node.js + TypeScript + Fastify (integração TFS via NTLM, import do catálogo XLSX, apuração UST por período).
- **apps/web**: React + TypeScript + Vite (UI para importar catálogo, rodar apuração por período e exportar CSV).

## Campos (reference names) já confirmados no seu TFS
- Data Execução COTIN: `Custom.COTIN.DataExecucao`
- Atividade UST COTIN: `Custom.COTIN.AtividadeUST`
- Complexidade UST COTIN: `Custom.COTIN.ComplexidadeUST`

## Regras de cálculo
- Filtra tasks por período usando `Custom.COTIN.DataExecucao` (intervalo [start, endExclusive)).
- Para cada task, parseia `Custom.COTIN.AtividadeUST` (estrutura: `N - Grupo - Subgrupo - Atividade / ...`).
- Usa **Complexidade oficial**: `Custom.COTIN.ComplexidadeUST`.
- Faz lookup no catálogo por chave normalizada:
  - (Grupo, Subgrupo, Atividade, Complexidade) -> **Peso** (UST).

## Setup rápido (dev)
1) Instale Node 18+.
2) Na raiz:
   ```bash
   npm install
   ```
3) Configure variáveis do backend:
   - copie `apps/api/.env.example` para `apps/api/.env` e preencha.
4) Rode API e Web (2 terminais):
   ```bash
   npm run dev:api
   npm run dev:web
   ```

## Import do catálogo
- Acesse a UI e faça upload do XLSX.
- Alternativamente, via cURL:
  ```bash
  curl -F "file=@/caminho/Catalogo.xlsx" http://localhost:3001/api/catalog/import
  ```

## Observações NTLM
- O backend usa `axios-ntlm`. Em ambiente corporativo, pode exigir ajustes (proxy / certificados).
- Se seu TFS usa TLS interno, ajuste `NODE_TLS_REJECT_UNAUTHORIZED` **somente para dev** (não recomendado em produção).

