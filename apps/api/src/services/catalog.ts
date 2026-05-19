// apps/api/src/services/catalog.ts
import type { AppStore } from "../store/store.js";

export async function importCatalogXlsx(store: AppStore, uploadedFilePath: string) {
  // O store novo já faz: ler XLSX -> gerar códigos -> indexar -> persistir
  return await store.importCatalogXlsx(uploadedFilePath);
}