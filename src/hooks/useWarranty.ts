import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { assertWritable } from "@/lib/readOnlyState";
import type {
  WarrantyAttachment,
  WarrantyCase,
  WarrantyHistoryEntry,
  WarrantyItem,
  WarrantyMovement,
  WarrantyStatus,
} from "@/types/warranty";

const BUCKET = "warranty-attachments";

const WARRANTY_CASE_COLUMNS =
  "id, sale_id, opened_by, status, reason, notes, opened_at, closed_at, created_at, updated_at";
const WARRANTY_ITEM_COLUMNS =
  "id, warranty_case_id, product_id, product_name, quantity, created_at";
const WARRANTY_MOVEMENT_COLUMNS =
  "id, warranty_case_id, warranty_item_id, performed_by, direction, product_id, quantity, notes, created_at";
const WARRANTY_ATTACHMENT_COLUMNS =
  "id, warranty_case_id, uploaded_by, file_path, file_name, mime_type, size_bytes, created_at";
const WARRANTY_HISTORY_COLUMNS =
  "id, warranty_case_id, actor_id, event, from_value, to_value, payload, created_at";

// ---------- mappers ----------
const mapCase = (r: any): WarrantyCase => ({
  id: r.id,
  saleId: r.sale_id,
  openedBy: r.opened_by ?? null,
  status: r.status as WarrantyStatus,
  reason: r.reason ?? null,
  notes: r.notes ?? null,
  openedAt: r.opened_at,
  closedAt: r.closed_at ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const mapItem = (r: any): WarrantyItem => ({
  id: r.id,
  warrantyCaseId: r.warranty_case_id,
  productId: r.product_id ?? null,
  productName: r.product_name,
  quantity: Number(r.quantity),
  createdAt: r.created_at,
});
const mapMovement = (r: any): WarrantyMovement => ({
  id: r.id,
  warrantyCaseId: r.warranty_case_id,
  warrantyItemId: r.warranty_item_id ?? null,
  performedBy: r.performed_by ?? null,
  direction: r.direction,
  productId: r.product_id ?? null,
  quantity: Number(r.quantity),
  notes: r.notes ?? null,
  createdAt: r.created_at,
});
const mapAttachment = (r: any): WarrantyAttachment => ({
  id: r.id,
  warrantyCaseId: r.warranty_case_id,
  uploadedBy: r.uploaded_by ?? null,
  filePath: r.file_path,
  fileName: r.file_name,
  mimeType: r.mime_type ?? null,
  sizeBytes: r.size_bytes ?? null,
  createdAt: r.created_at,
});
const mapHistory = (r: any): WarrantyHistoryEntry => ({
  id: r.id,
  warrantyCaseId: r.warranty_case_id,
  actorId: r.actor_id ?? null,
  event: r.event,
  fromValue: r.from_value ?? null,
  toValue: r.to_value ?? null,
  payload: r.payload ?? null,
  createdAt: r.created_at,
});

export function useWarranty(saleId: string | undefined) {
  const { user, dataOwnerId } = useAuth();
  const [cases, setCases] = useState<WarrantyCase[]>([]);
  const [items, setItems] = useState<WarrantyItem[]>([]);
  const [movements, setMovements] = useState<WarrantyMovement[]>([]);
  const [attachments, setAttachments] = useState<WarrantyAttachment[]>([]);
  const [history, setHistory] = useState<WarrantyHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!saleId || !user || !dataOwnerId) return;
    setLoading(true);
    const { data: caseRows } = await supabase
      .from("warranty_cases" as any)
      .select(WARRANTY_CASE_COLUMNS)
      .eq("sale_id", saleId)
      .order("created_at", { ascending: false });
    const list = ((caseRows as any[]) || []).map(mapCase);
    setCases(list);
    const ids = list.map((c) => c.id);
    if (ids.length === 0) {
      setItems([]); setMovements([]); setAttachments([]); setHistory([]);
      setLoading(false);
      return;
    }
    const [itemsRes, movRes, attRes, histRes] = await Promise.all([
      supabase.from("warranty_items" as any).select(WARRANTY_ITEM_COLUMNS).in("warranty_case_id", ids),
      supabase.from("warranty_movements" as any).select(WARRANTY_MOVEMENT_COLUMNS).in("warranty_case_id", ids).order("created_at", { ascending: false }),
      supabase.from("warranty_attachments" as any).select(WARRANTY_ATTACHMENT_COLUMNS).in("warranty_case_id", ids).order("created_at", { ascending: false }),
      supabase.from("warranty_history" as any).select(WARRANTY_HISTORY_COLUMNS).in("warranty_case_id", ids).order("created_at", { ascending: false }),
    ]);
    setItems(((itemsRes.data as any[]) || []).map(mapItem));
    setMovements(((movRes.data as any[]) || []).map(mapMovement));
    setAttachments(((attRes.data as any[]) || []).map(mapAttachment));
    setHistory(((histRes.data as any[]) || []).map(mapHistory));
    setLoading(false);
  }, [saleId, user, dataOwnerId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const logHistory = useCallback(async (
    caseId: string,
    event: string,
    extra: { from?: string | null; to?: string | null; payload?: Record<string, unknown> | null } = {},
  ) => {
    assertWritable();
    if (!user || !dataOwnerId) return;
    await supabase.from("warranty_history" as any).insert({
      warranty_case_id: caseId,
      user_id: dataOwnerId,
      actor_id: user.id,
      event,
      from_value: extra.from ?? null,
      to_value: extra.to ?? null,
      payload: extra.payload ?? null,
    } as any);
  }, [user, dataOwnerId]);

  // ---------- cases ----------
  const createCase = useCallback(async (input: {
    reason?: string | null;
    notes?: string | null;
    items: { productId: string | null; productName: string; quantity: number }[];
  }) => {
    assertWritable();
    if (!saleId || !user || !dataOwnerId) throw new Error("Sessão não carregada");
    const { data, error } = await supabase.from("warranty_cases" as any).insert({
      user_id: dataOwnerId,
      sale_id: saleId,
      opened_by: user.id,
      status: "aberta",
      reason: input.reason ?? null,
      notes: input.notes ?? null,
    } as any).select(WARRANTY_CASE_COLUMNS).single();
    if (error || !data) throw new Error(error?.message || "Falha ao abrir garantia");
    const created = mapCase(data);
    if (input.items.length > 0) {
      const payload = input.items.map((it) => ({
        warranty_case_id: created.id,
        user_id: dataOwnerId,
        product_id: it.productId,
        product_name: it.productName,
        quantity: it.quantity,
      }));
      const { data: itemRows } = await supabase.from("warranty_items" as any).insert(payload as any).select(WARRANTY_ITEM_COLUMNS);
      if (itemRows) setItems((prev) => [...prev, ...(itemRows as any[]).map(mapItem)]);
    }
    setCases((prev) => [created, ...prev]);
    await logHistory(created.id, "created", { to: "aberta", payload: { reason: input.reason ?? null, items: input.items.length } });
    return created;
  }, [saleId, user, dataOwnerId, logHistory]);

  const updateStatus = useCallback(async (caseId: string, next: WarrantyStatus) => {
    assertWritable();
    const current = cases.find((c) => c.id === caseId);
    const patch: any = { status: next };
    if (next === "concluida" || next === "cancelada") patch.closed_at = new Date().toISOString();
    else patch.closed_at = null;
    const { error } = await supabase.from("warranty_cases" as any).update(patch).eq("id", caseId);
    if (error) throw new Error(error.message);
    setCases((prev) => prev.map((c) => c.id === caseId ? { ...c, status: next, closedAt: patch.closed_at ?? null } : c));
    await logHistory(caseId, "status_changed", { from: current?.status ?? null, to: next });
  }, [cases, logHistory]);

  const updateNotes = useCallback(async (caseId: string, notes: string) => {
    assertWritable();
    const { error } = await supabase.from("warranty_cases" as any).update({ notes }).eq("id", caseId);
    if (error) throw new Error(error.message);
    setCases((prev) => prev.map((c) => c.id === caseId ? { ...c, notes } : c));
    await logHistory(caseId, "note_added", { payload: { length: notes.length } });
  }, [logHistory]);

  const deleteCase = useCallback(async (caseId: string) => {
    assertWritable();
    const { error } = await supabase.from("warranty_cases" as any).delete().eq("id", caseId);
    if (error) throw new Error(error.message);
    setCases((prev) => prev.filter((c) => c.id !== caseId));
    setItems((prev) => prev.filter((i) => i.warrantyCaseId !== caseId));
    setMovements((prev) => prev.filter((m) => m.warrantyCaseId !== caseId));
    setAttachments((prev) => prev.filter((a) => a.warrantyCaseId !== caseId));
    setHistory((prev) => prev.filter((h) => h.warrantyCaseId !== caseId));
  }, []);

  // ---------- movements (with stock sync) ----------
  const recordMovement = useCallback(async (input: {
    caseId: string;
    itemId: string | null;
    productId: string | null;
    direction: "in" | "out";
    quantity: number;
    notes?: string | null;
  }) => {
    assertWritable();
    if (!user || !dataOwnerId) throw new Error("Sessão não carregada");
    if (!input.productId) throw new Error("Selecione um produto cadastrado para movimentar estoque");
    if (input.quantity <= 0) throw new Error("Quantidade inválida");

    // Read current stock
    const { data: prodRow, error: prodErr } = await supabase
      .from("products").select("id, name, stock").eq("id", input.productId).maybeSingle();
    if (prodErr || !prodRow) throw new Error("Produto não encontrado");
    const currentStock = Number((prodRow as any).stock || 0);
    if (input.direction === "out" && currentStock < input.quantity) {
      throw new Error(`Estoque insuficiente (disponível: ${currentStock})`);
    }
    const newStock = input.direction === "in"
      ? currentStock + input.quantity
      : currentStock - input.quantity;

    // 1) Update product stock
    const { error: updErr } = await supabase.from("products").update({ stock: newStock }).eq("id", input.productId);
    if (updErr) throw new Error(updErr.message);

    // 2) Insert warranty_movements
    const { data: movRow, error: movErr } = await supabase.from("warranty_movements" as any).insert({
      warranty_case_id: input.caseId,
      warranty_item_id: input.itemId,
      user_id: dataOwnerId,
      performed_by: user.id,
      direction: input.direction,
      product_id: input.productId,
      quantity: input.quantity,
      notes: input.notes ?? null,
    } as any).select(WARRANTY_MOVEMENT_COLUMNS).single();
    if (movErr || !movRow) throw new Error(movErr?.message || "Falha ao registrar movimentação");

    // 3) Mirror to stock_movements for unified history
    await supabase.from("stock_movements" as any).insert({
      owner_id: dataOwnerId,
      user_id: user.id,
      product_id: input.productId,
      product_name: (prodRow as any).name,
      movement_type: input.direction === "in" ? "entrada_manual" : "ajuste",
      quantity: input.direction === "in" ? input.quantity : -input.quantity,
      notes: `Garantia (${input.direction === "in" ? "retorno" : "substituição"}) — caso ${input.caseId.slice(0, 8)}${input.notes ? ` · ${input.notes}` : ""}`,
    } as any);

    const mapped = mapMovement(movRow);
    setMovements((prev) => [mapped, ...prev]);
    await logHistory(input.caseId, "movement_added", {
      to: input.direction,
      payload: { quantity: input.quantity, productId: input.productId },
    });
    return mapped;
  }, [user, dataOwnerId, logHistory]);

  // ---------- attachments ----------
  const uploadAttachment = useCallback(async (caseId: string, file: File) => {
    assertWritable();
    if (!user || !dataOwnerId) throw new Error("Sessão não carregada");
    const safe = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${dataOwnerId}/${caseId}/${Date.now()}-${safe}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (upErr) throw new Error(upErr.message);
    const { data: row, error: insErr } = await supabase.from("warranty_attachments" as any).insert({
      warranty_case_id: caseId,
      user_id: dataOwnerId,
      uploaded_by: user.id,
      file_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
    } as any).select(WARRANTY_ATTACHMENT_COLUMNS).single();
    if (insErr || !row) throw new Error(insErr?.message || "Falha ao registrar anexo");
    const mapped = mapAttachment(row);
    setAttachments((prev) => [mapped, ...prev]);
    await logHistory(caseId, "attachment_added", { payload: { name: file.name, size: file.size } });
    return mapped;
  }, [user, dataOwnerId, logHistory]);

  const downloadAttachment = useCallback(async (att: WarrantyAttachment) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(att.filePath, 60);
    if (error || !data) throw new Error(error?.message || "Falha ao gerar link");
    return data.signedUrl;
  }, []);

  const deleteAttachment = useCallback(async (att: WarrantyAttachment) => {
    assertWritable();
    await supabase.storage.from(BUCKET).remove([att.filePath]);
    await supabase.from("warranty_attachments" as any).delete().eq("id", att.id);
    setAttachments((prev) => prev.filter((a) => a.id !== att.id));
    await logHistory(att.warrantyCaseId, "attachment_deleted", { payload: { name: att.fileName } });
  }, [logHistory]);

  return {
    loading,
    cases,
    items,
    movements,
    attachments,
    history,
    refresh: fetchAll,
    createCase,
    updateStatus,
    updateNotes,
    deleteCase,
    recordMovement,
    uploadAttachment,
    downloadAttachment,
    deleteAttachment,
  };
}
