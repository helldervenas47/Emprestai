export interface WhatsappProviderConfig {
  provider: string;
  baseUrl: string;
  instanceId: string;
  apiKey: string;
}

export async function sendWhatsappText(config: WhatsappProviderConfig, phone: string, message: string) {
  const base = config.baseUrl.replace(/\/+$/, "");
  if (config.provider === "wppconnect") {
    const response = await fetch(`${base}/api/${encodeURIComponent(config.instanceId)}/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ phone, message }),
    });
    return { ok: response.ok, status: response.status, body: await response.text() };
  }
  const response = await fetch(`${base}/message/sendText/${encodeURIComponent(config.instanceId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: config.apiKey },
    body: JSON.stringify({ number: phone, text: message, textMessage: { text: message } }),
  });
  return { ok: response.ok, status: response.status, body: await response.text() };
}
