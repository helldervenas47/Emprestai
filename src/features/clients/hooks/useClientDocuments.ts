import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";

export const CLIENT_DOCUMENT_CATEGORIES = [
  "CNH",
  "RG / Identidade",
  "CPF",
  "Comprovante de residência",
  "Comprovante de renda",
  "Contratos assinados",
  "Procurações",
  "Outros documentos",
] as const;

export type ClientDocumentCategory = (typeof CLIENT_DOCUMENT_CATEGORIES)[number];

export interface ClientDocument {
  id: string;
  clientId: string;
  ownerId: string;
  category: ClientDocumentCategory | string;
  originalName: string;
  filePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedBy: string | null;
  uploadedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

const BUCKET = "client-documents";
const CLIENT_DOCUMENT_COLUMNS =
  "id, client_id, owner_id, category, original_name, file_path, mime_type, size_bytes, uploaded_by, uploaded_by_name, created_at, updated_at";
const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
const ALLOWED_EXT = ["pdf", "jpg", "jpeg", "png"];

function rowToDoc(r: any): ClientDocument {
  return {
    id: r.id,
    clientId: r.client_id,
    ownerId: r.owner_id,
    category: r.category,
    originalName: r.original_name,
    filePath: r.file_path,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    uploadedBy: r.uploaded_by,
    uploadedByName: r.uploaded_by_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function sanitizeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

function extOf(name: string) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(name);
  return m ? m[1].toLowerCase() : "";
}

export function useClientDocuments(clientId: string | null | undefined) {
  const { user, dataOwnerId } = useAuth();
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!clientId || !user) {
      setDocuments([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("client_documents" as any)
      .select(CLIENT_DOCUMENT_COLUMNS)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    setLoading(false);
    if (!error && data) setDocuments((data as any[]).map(rowToDoc));
  }, [clientId, user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const upload = useCallback(
    async (file: File, category: ClientDocumentCategory | string) => {
      if (!clientId) throw new Error("Cliente não selecionado.");
      if (!user || !dataOwnerId) throw new Error("Usuário não autenticado.");
      const ext = extOf(file.name);
      if (!ALLOWED_EXT.includes(ext) && !ALLOWED_MIME.includes(file.type)) {
        throw new Error("Formato não suportado. Use PDF, JPG, JPEG ou PNG.");
      }
      if (file.size > 20 * 1024 * 1024) {
        throw new Error("Arquivo muito grande (máx 20MB).");
      }
      setUploadProgress(1);
      const safe = sanitizeName(file.name);
      const path = `clientes/${dataOwnerId}/${clientId}/${Date.now()}_${safe}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
      if (upErr) {
        setUploadProgress(null);
        throw upErr;
      }
      setUploadProgress(90);
      const profileName =
        (user as any).user_metadata?.full_name ||
        (user as any).user_metadata?.name ||
        user.email ||
        null;
      const { error: insErr } = await supabase
        .from("client_documents" as any)
        .insert({
          owner_id: dataOwnerId,
          client_id: clientId,
          category,
          original_name: file.name,
          file_path: path,
          mime_type: file.type || null,
          size_bytes: file.size,
          uploaded_by: user.id,
          uploaded_by_name: profileName,
        });
      if (insErr) {
        await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
        setUploadProgress(null);
        throw insErr;
      }
      setUploadProgress(100);
      await refresh();
      setTimeout(() => setUploadProgress(null), 600);
    },
    [clientId, user, dataOwnerId, refresh],
  );

  const replace = useCallback(
    async (doc: ClientDocument, file: File) => {
      await upload(file, doc.category);
      await remove(doc);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [upload],
  );

  const remove = useCallback(
    async (doc: ClientDocument) => {
      await supabase.storage.from(BUCKET).remove([doc.filePath]).catch(() => {});
      const { error } = await supabase
        .from("client_documents" as any)
        .delete()
        .eq("id", doc.id);
      if (error) throw error;
      await refresh();
    },
    [refresh],
  );

  const getSignedUrl = useCallback(async (doc: ClientDocument, download = false) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.filePath, 300, download ? { download: doc.originalName } : undefined);
    if (error) throw error;
    return data.signedUrl;
  }, []);

  return {
    documents,
    loading,
    uploadProgress,
    upload,
    replace,
    remove,
    getSignedUrl,
    refresh,
  };
}
