/**
 * Detecção de falhas de carregamento de módulo/chunk cobrindo variações de
 * Chrome, Safari/iOS e WebView Android — algumas delas NÃO incluem a URL.
 */
const MODULE_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Loading chunk [\w-]+ failed/i,
  /Loading CSS chunk [\w-]+ failed/i,
  /ChunkLoadError/i,
  /Unable to preload CSS/i,
  /'?text\/html'? is not a valid JavaScript MIME type/i,
  /expected a JavaScript(-or-Wasm)? module script/i,
  /Load failed/i,
];

export function isModuleLoadError(error: unknown): boolean {
  const err = error as { name?: string; message?: string; stack?: string } | null;
  if (!err) return false;
  if (err.name === "ChunkLoadError") return true;
  // Safari/iOS mascara erros cross-origin de script como "Script error."
  if (/^script error\.?$/i.test((err.message || "").trim())) return true;
  const text = `${err.name || ""}\n${err.message || ""}\n${err.stack || ""}`;
  return MODULE_ERROR_PATTERNS.some((re) => re.test(text));
}

/** Extrai a URL do chunk quando o navegador a fornece. */
export function extractChunkUrl(error: unknown): string | null {
  const err = error as { message?: string; stack?: string } | null;
  const text = `${err?.message || ""}\n${err?.stack || ""}`;
  const match = text.match(/https?:\/\/[^\s'")]+\.(?:js|mjs|css)/i);
  return match ? match[0] : null;
}
