// Estado global de "somente leitura" (trial expirado sem assinatura paga).
// Atualizado pelo hook useReadOnlyMode e consumido por repositórios /
// utilidades que precisam barrar mutações fora do ciclo do React.

let readOnly = false;
const listeners = new Set<(v: boolean) => void>();

export function setReadOnly(v: boolean) {
  if (readOnly === v) return;
  readOnly = v;
  listeners.forEach((l) => l(v));
}

export function isReadOnly(): boolean {
  return readOnly;
}

export function subscribeReadOnly(fn: (v: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export class ReadOnlyError extends Error {
  constructor(message = "Plano de teste expirado. Faça upgrade para continuar.") {
    super(message);
    this.name = "ReadOnlyError";
  }
}

export function assertWritable(): void {
  if (readOnly) throw new ReadOnlyError();
}
