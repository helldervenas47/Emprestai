export type WarrantyStatus =
  | "aberta"
  | "em_analise"
  | "aguardando_produto"
  | "produto_recebido"
  | "produto_substituido"
  | "concluida"
  | "cancelada";

export const WARRANTY_STATUS_LABEL: Record<WarrantyStatus, string> = {
  aberta: "Aberta",
  em_analise: "Em análise",
  aguardando_produto: "Aguardando produto",
  produto_recebido: "Produto recebido",
  produto_substituido: "Produto substituído",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export const WARRANTY_STATUS_TONE: Record<WarrantyStatus, "default" | "warning" | "success" | "destructive" | "secondary"> = {
  aberta: "default",
  em_analise: "default",
  aguardando_produto: "warning",
  produto_recebido: "secondary",
  produto_substituido: "secondary",
  concluida: "success",
  cancelada: "destructive",
};

export interface WarrantyItem {
  id: string;
  warrantyCaseId: string;
  productId: string | null;
  productName: string;
  quantity: number;
  createdAt: string;
}

export interface WarrantyMovement {
  id: string;
  warrantyCaseId: string;
  warrantyItemId: string | null;
  performedBy: string | null;
  direction: "in" | "out";
  productId: string | null;
  quantity: number;
  notes: string | null;
  createdAt: string;
}

export interface WarrantyAttachment {
  id: string;
  warrantyCaseId: string;
  uploadedBy: string | null;
  filePath: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

export interface WarrantyHistoryEntry {
  id: string;
  warrantyCaseId: string;
  actorId: string | null;
  event: string;
  fromValue: string | null;
  toValue: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface WarrantyCase {
  id: string;
  saleId: string;
  openedBy: string | null;
  status: WarrantyStatus;
  reason: string | null;
  notes: string | null;
  openedAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items?: WarrantyItem[];
}
