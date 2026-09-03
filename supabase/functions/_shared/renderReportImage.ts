// Shared helpers to render report images and send via Telegram.
// Uses @resvg/resvg-wasm to convert SVG -> PNG inside the edge function.

import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.6.2";

const GATEWAY_URL = "https://api.telegram.org";

let _wasmReady: Promise<void> | null = null;
async function ensureWasm() {
  if (!_wasmReady) {
    _wasmReady = (async () => {
      const wasmUrl = "https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm";
      const buf = await fetch(wasmUrl).then((r) => r.arrayBuffer());
      await initWasm(buf);
    })();
  }
  return _wasmReady;
}

// Resvg-wasm has no built-in fonts; fetch Noto Sans (regular + bold) once per
// cold start so text is actually rendered in the PNG.
let _fontsReady: Promise<Uint8Array[]> | null = null;
async function ensureFonts(): Promise<Uint8Array[]> {
  if (!_fontsReady) {
    _fontsReady = (async () => {
      const urls = [
        "https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf",
        "https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Bold.ttf",
        "https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Italic.ttf",
      ];
      const buffers = await Promise.all(
        urls.map((u) =>
          fetch(u).then((r) => r.arrayBuffer()).then((b) => new Uint8Array(b))
        ),
      );
      return buffers;
    })();
  }
  return _fontsReady;
}

export function fmtBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function escXml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface MonthlySummaryData {
  monthLabel: string;        // e.g. "Abril / 2026"
  total: number;
  prevTotal: number;
  dailyAvg: number;
  daysElapsed: number;
  topCategories: Array<{ name: string; curr: number; prev: number }>;
  budgets: Array<{ name: string; spent: number; budget: number }>;
}

export interface BrandInfo {
  name: string;
  primaryHsl?: string | null; // e.g. "221 83% 53%"
}

function hsl(primary: string | null | undefined, fallback = "221 83% 53%"): string {
  return `hsl(${primary || fallback})`;
}

function variationLabel(curr: number, prev: number): { text: string; color: string } {
  if (prev === 0) return { text: curr === 0 ? "—" : "novo", color: "#64748b" };
  const pct = ((curr - prev) / prev) * 100;
  const sign = pct > 0 ? "+" : "";
  const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "■";
  const color = pct > 0 ? "#dc2626" : pct < 0 ? "#16a34a" : "#64748b";
  return { text: `${arrow} ${sign}${pct.toFixed(0)}%`, color };
}

export function buildMonthlySummarySVG(data: MonthlySummaryData, brand: BrandInfo): string {
  const W = 1080;
  const PAD = 56;
  const primary = hsl(brand.primaryHsl);
  const primarySoft = `hsl(${brand.primaryHsl || "221 83% 53%"} / 0.10)`;

  const totalVar = variationLabel(data.total, data.prevTotal);

  // ===== Top categories block =====
  const cats = (data.topCategories || []).slice(0, 6);
  const maxCat = cats.reduce((m, c) => Math.max(m, c.curr), 0) || 1;
  const catRowH = 56;
  const catsHeight = cats.length > 0 ? 56 + cats.length * catRowH : 0;

  // ===== Budgets block =====
  const budgets = data.budgets || [];
  const budgetRowH = 52;
  const budgetsHeight = budgets.length > 0 ? 56 + budgets.length * budgetRowH : 0;

  // Header (180) + Total card (190) + section gap + cats + budgets + bottom pad
  const HEADER_H = 170;
  const TOTAL_H = 200;
  const GAP = 28;
  const H =
    HEADER_H + TOTAL_H + GAP +
    (catsHeight ? catsHeight + GAP : 0) +
    (budgetsHeight ? budgetsHeight + GAP : 0) +
    40;

  let y = 0;

  // ---- Header ----
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Noto Sans, sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#f8fafc"/>
    </linearGradient>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${primary}"/>
      <stop offset="100%" stop-color="${primary}" stop-opacity="0.75"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${W}" height="8" fill="url(#brand)"/>
`;

  y = 60;
  svg += `<text x="${PAD}" y="${y}" font-size="22" font-weight="600" fill="${primary}" letter-spacing="2">${escXml(brand.name.toUpperCase())} · RESUMO MENSAL</text>`;
  y += 60;
  svg += `<text x="${PAD}" y="${y}" font-size="56" font-weight="700" fill="#0f172a">${escXml(data.monthLabel)}</text>`;

  // ---- Total card ----
  y = HEADER_H + 20;
  svg += `<rect x="${PAD}" y="${y}" width="${W - PAD * 2}" height="${TOTAL_H - 20}" rx="20" fill="${primarySoft}"/>`;
  svg += `<text x="${PAD + 32}" y="${y + 44}" font-size="20" fill="#475569" font-weight="500">Total do mês</text>`;
  svg += `<text x="${PAD + 32}" y="${y + 110}" font-size="64" font-weight="700" fill="#0f172a">${escXml(fmtBRL(data.total))}</text>`;
  // variation bubble
  const varX = PAD + 32;
  svg += `<text x="${varX}" y="${y + 154}" font-size="22" font-weight="600" fill="${totalVar.color}">${escXml(totalVar.text)} vs ${escXml(fmtBRL(data.prevTotal))} no mês anterior</text>`;
  // daily avg right side
  const rightX = W - PAD - 32;
  svg += `<text x="${rightX}" y="${y + 44}" font-size="18" fill="#475569" text-anchor="end">Média diária</text>`;
  svg += `<text x="${rightX}" y="${y + 90}" font-size="36" font-weight="700" fill="#0f172a" text-anchor="end">${escXml(fmtBRL(data.dailyAvg))}</text>`;
  svg += `<text x="${rightX}" y="${y + 118}" font-size="16" fill="#64748b" text-anchor="end">${data.daysElapsed} ${data.daysElapsed === 1 ? "dia" : "dias"}</text>`;

  y += TOTAL_H;

  // ---- Top categories ----
  if (cats.length > 0) {
    svg += `<text x="${PAD}" y="${y + 28}" font-size="22" font-weight="700" fill="#0f172a">Top categorias</text>`;
    let ry = y + 56;
    const barX = PAD + 280;
    const barMaxW = W - PAD - 220 - barX;
    for (const c of cats) {
      const w = Math.max(4, (c.curr / maxCat) * barMaxW);
      const v = variationLabel(c.curr, c.prev);
      svg += `<text x="${PAD}" y="${ry + 24}" font-size="20" font-weight="600" fill="#0f172a">${escXml(c.name)}</text>`;
      svg += `<rect x="${barX}" y="${ry + 12}" width="${barMaxW}" height="18" rx="9" fill="#e2e8f0"/>`;
      svg += `<rect x="${barX}" y="${ry + 12}" width="${w}" height="18" rx="9" fill="${primary}"/>`;
      svg += `<text x="${W - PAD}" y="${ry + 24}" font-size="20" font-weight="600" fill="#0f172a" text-anchor="end">${escXml(fmtBRL(c.curr))}</text>`;
      svg += `<text x="${W - PAD}" y="${ry + 46}" font-size="14" font-weight="500" fill="${v.color}" text-anchor="end">${escXml(v.text)}</text>`;
      ry += catRowH;
    }
    y += catsHeight + GAP;
  }

  // ---- Budgets ----
  if (budgets.length > 0) {
    svg += `<text x="${PAD}" y="${y + 28}" font-size="22" font-weight="700" fill="#0f172a">Orçamentos</text>`;
    let ry = y + 56;
    const barX = PAD + 280;
    const barMaxW = W - PAD - 260 - barX;
    for (const b of budgets) {
      const pct = b.budget > 0 ? (b.spent / b.budget) * 100 : 0;
      const w = Math.min(barMaxW, (Math.min(pct, 100) / 100) * barMaxW);
      const color = pct > 100 ? "#dc2626" : pct >= 80 ? "#eab308" : "#16a34a";
      const left = b.budget - b.spent;
      const leftLabel = left < 0 ? `${escXml(fmtBRL(Math.abs(left)))} acima` : `${escXml(fmtBRL(left))} restante`;
      svg += `<text x="${PAD}" y="${ry + 22}" font-size="20" font-weight="600" fill="#0f172a">${escXml(b.name)}</text>`;
      svg += `<rect x="${barX}" y="${ry + 10}" width="${barMaxW}" height="16" rx="8" fill="#e2e8f0"/>`;
      svg += `<rect x="${barX}" y="${ry + 10}" width="${w}" height="16" rx="8" fill="${color}"/>`;
      svg += `<text x="${W - PAD}" y="${ry + 22}" font-size="18" font-weight="600" fill="${color}" text-anchor="end">${Math.round(pct)}%</text>`;
      svg += `<text x="${W - PAD}" y="${ry + 42}" font-size="13" fill="#64748b" text-anchor="end">${leftLabel}</text>`;
      ry += budgetRowH;
    }
    y += budgetsHeight + GAP;
  }

  svg += `</svg>`;
  return svg;
}

export async function svgToPng(svg: string): Promise<Uint8Array> {
  await ensureWasm();
  const fonts = await ensureFonts();
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1080 },
    background: "#ffffff",
    font: {
      fontBuffers: fonts,
      defaultFontFamily: "Noto Sans",
      loadSystemFonts: false,
    },
  });
  const rendered = resvg.render();
  return rendered.asPng();
}

// =====================================================================
// Generic text-report SVG renderer
// Converts a list of markdown-flavoured lines (the same shape used by
// every Telegram report function) into a styled card image.
// Supports: *bold*, _italic_, leading spaces for indent, blank line gap.
// =====================================================================

interface InlineSeg { text: string; bold?: boolean; italic?: boolean }

// Strips emoji glyphs that the embedded Noto Sans font cannot render.
// Emojis remain in the Telegram caption (which renders them natively).
const EMOJI_RE = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2500}-\u{25FF}\u{1F000}-\u{1F2FF}\u{FE0F}\u{200D}]/gu;
function stripEmojis(s: string): string {
  return s.replace(EMOJI_RE, "").replace(/\s{2,}/g, " ").trimEnd();
}

function parseInline(line: string): InlineSeg[] {
  const out: InlineSeg[] = [];
  let buf = "";
  let bold = false;
  let italic = false;
  const flush = () => { if (buf) { out.push({ text: buf, bold, italic }); buf = ""; } };
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "*") { flush(); bold = !bold; continue; }
    if (ch === "_") {
      // treat as italic toggle only if it's not part of a word/number boundary char like "_id_"
      flush(); italic = !italic; continue;
    }
    if (ch === "\\" && i + 1 < line.length) { buf += line[i + 1]; i++; continue; }
    buf += ch;
  }
  flush();
  return out;
}

function wrapSegments(segs: InlineSeg[], maxChars: number): InlineSeg[][] {
  // Greedy word wrap that preserves segment formatting.
  const lines: InlineSeg[][] = [];
  let current: InlineSeg[] = [];
  let used = 0;
  const pushCurrent = () => { if (current.length) { lines.push(current); current = []; used = 0; } };

  for (const seg of segs) {
    const words = seg.text.split(/(\s+)/); // keep separators
    for (const w of words) {
      if (!w) continue;
      if (used + w.length > maxChars && current.length) {
        pushCurrent();
        if (/^\s+$/.test(w)) continue;
      }
      current.push({ text: w, bold: seg.bold, italic: seg.italic });
      used += w.length;
    }
  }
  pushCurrent();
  return lines.length ? lines : [[]];
}

export interface TextReportOpts {
  /** Title shown at the top (defaults to first line of the lines array if it looks like one). */
  title?: string;
  /** Optional subtitle line below title. */
  subtitle?: string;
  /** Width in pixels (default 1080). */
  width?: number;
}

export function buildTextReportSVG(
  rawLines: string[],
  brand: BrandInfo,
  opts: TextReportOpts = {},
): string {
  const W = opts.width ?? 1080;
  const PAD = 56;
  const primary = hsl(brand.primaryHsl);
  const primarySoft = `hsl(${brand.primaryHsl || "221 83% 53%"} / 0.08)`;

  // Strip a leading title line if user provided no explicit title.
  let title = opts.title;
  let subtitle = opts.subtitle;
  let lines = [...rawLines];
  if (!title) {
    // first non-empty line becomes title
    const idx = lines.findIndex((l) => l.trim().length > 0);
    if (idx >= 0) {
      title = stripEmojis(lines[idx].replace(/^[\s•▸━—-]+/, "").replace(/\*/g, "")).trim();
      lines.splice(idx, 1);
      // also drop a separator/empty line directly after
      if (lines[idx]?.trim() === "" || /^[—━-]+$/.test(lines[idx]?.trim() ?? "")) lines.splice(idx, 1);
    }
  }

  // Pre-compute body line layout
  const FONT = 22;
  const LINE_H = 32;
  const EMPTY_H = 14;
  const MAX_CHARS = 70; // wrap threshold for body
  const bodyHeights: number[] = [];
  const bodyWrapped: InlineSeg[][][] = [];
  for (const raw of lines) {
    if (raw.trim() === "") {
      bodyHeights.push(EMPTY_H);
      bodyWrapped.push([[]]);
      continue;
    }
    // Drop pure separator lines like "━━━━" or "—"
    if (/^[—━\-]{2,}$/.test(raw.trim()) || raw.trim() === "—") {
      bodyHeights.push(EMPTY_H);
      bodyWrapped.push([[]]);
      continue;
    }
    const indent = raw.match(/^[\s]*/)?.[0].length ?? 0;
    const cleaned = stripEmojis(raw.replace(/^[\s]+/, ""));
    if (!cleaned.trim()) {
      bodyHeights.push(EMPTY_H);
      bodyWrapped.push([[]]);
      continue;
    }
    const segs = parseInline(cleaned);
    const wrapped = wrapSegments(segs, MAX_CHARS - Math.floor(indent / 2));
    if (indent > 0) wrapped[0] = [{ text: " ".repeat(indent) }, ...wrapped[0]];
    bodyWrapped.push(wrapped);
    bodyHeights.push(wrapped.length * LINE_H);
  }

  const HEADER_H = subtitle ? 150 : 120;
  const BODY_TOP = HEADER_H + 30;
  const bodyTotal = bodyHeights.reduce((s, h) => s + h, 0);
  const H = BODY_TOP + bodyTotal + PAD;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Noto Sans, sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#f8fafc"/>
    </linearGradient>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${primary}"/>
      <stop offset="100%" stop-color="${primary}" stop-opacity="0.7"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${W}" height="8" fill="url(#brand)"/>
  <rect x="${PAD - 8}" y="${HEADER_H - 8}" width="${W - PAD * 2 + 16}" height="1" fill="${primarySoft}"/>
`;

  // Header
  svg += `<text x="${PAD}" y="60" font-size="20" font-weight="600" fill="${primary}" letter-spacing="2">${escXml(brand.name.toUpperCase())}</text>`;
  if (title) {
    svg += `<text x="${PAD}" y="100" font-size="34" font-weight="700" fill="#0f172a">${escXml(title)}</text>`;
  }
  if (subtitle) {
    svg += `<text x="${PAD}" y="132" font-size="18" font-weight="500" fill="#475569">${escXml(subtitle)}</text>`;
  }

  // Body
  let cy = BODY_TOP + FONT;
  for (let i = 0; i < bodyWrapped.length; i++) {
    const wrapped = bodyWrapped[i];
    if (bodyHeights[i] === EMPTY_H) {
      cy += EMPTY_H;
      continue;
    }
    for (const subline of wrapped) {
      let tspans = "";
      for (const seg of subline) {
        const weight = seg.bold ? "700" : "400";
        const style = seg.italic ? "italic" : "normal";
        // Preserve leading spaces for indent
        const t = escXml(seg.text).replace(/ /g, "\u00A0");
        tspans += `<tspan font-weight="${weight}" font-style="${style}">${t}</tspan>`;
      }
      svg += `<text x="${PAD}" y="${cy}" font-size="${FONT}" fill="#0f172a" xml:space="preserve">${tspans}</text>`;
      cy += LINE_H;
    }
  }

  svg += `</svg>`;
  return svg;
}

/**
 * Builds a short Telegram caption from the same lines used to render the image.
 * Returns ≤900 chars (Telegram caption limit is 1024). Keeps the title + key
 * "highlight" lines (those starting with currency emojis or ▸ • markers).
 */
export function buildCaptionFromLines(lines: string[], brand: BrandInfo, max = 900): string {
  const out: string[] = [];
  const isHighlight = (s: string) => /[💸💰📅📊📆🚨⏰▸•💵📈]/.test(s);
  let titleAdded = false;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    if (/^[—━\-]{3,}$/.test(raw.trim())) continue;
    if (!titleAdded) { out.push(raw.trim()); titleAdded = true; continue; }
    if (isHighlight(raw)) out.push(raw.trim());
    if (out.join("\n").length > max - 80) break;
  }
  let text = out.join("\n").trim();
  if (text.length > max) text = text.slice(0, max - 1) + "…";
  if (!text) text = `📊 ${brand.name}`;
  return text;
}

export async function tgSendPhoto(
  chatId: number,
  pngBytes: Uint8Array,
  caption: string,
  telegramKey: string,
): Promise<void> {
  const cleanCaption = caption.trim();
  const fd = new FormData();
  fd.append("chat_id", String(chatId));
  if (cleanCaption) {
    fd.append("caption", cleanCaption);
    fd.append("parse_mode", "Markdown");
  }
  fd.append("photo", new Blob([pngBytes], { type: "image/png" }), "report.png");

  const r = await fetch(`${GATEWAY_URL}/bot${telegramKey}/sendPhoto`, {
    method: "POST",
    headers: {
    },
    body: fd,
  });
  if (!r.ok) {
    const text = await r.text();
    console.error("sendPhoto failed", r.status, text);
    throw new Error(`sendPhoto failed: ${r.status} ${text}`);
  }
}
