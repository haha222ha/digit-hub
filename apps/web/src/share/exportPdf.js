/**
 * Multi-page ink-paper PDF via canvas → JPEG → minimal PDF (no CDN, CJK-safe).
 */

const PAGE_W = 595; // A4-ish pt at 72dpi logical; we use pixel canvas 1240×1754 (~A4 @150dpi)
const PAGE_H = 842;
const CANVAS_W = 1240;
const CANVAS_H = 1754;

function wrapText(ctx, text, maxWidth) {
  const chars = String(text || "").split("");
  const lines = [];
  let line = "";
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function drawPage(meta, pageIndex, pageCount) {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  const ink = "#1c2430";
  const muted = "rgba(28,36,48,0.55)";
  const seal = "#1F6B5C";
  const paper0 = "#F7F1E7";
  const paper1 = "#EFE6D8";

  const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  g.addColorStop(0, paper0);
  g.addColorStop(1, paper1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.strokeStyle = "rgba(28,36,48,0.14)";
  ctx.lineWidth = 3;
  ctx.strokeRect(48, 48, CANVAS_W - 96, CANVAS_H - 96);

  ctx.fillStyle = seal;
  ctx.font = "600 28px 'Songti SC','Noto Serif SC',serif";
  ctx.fillText("心象测 · 完整报告", 88, 120);

  ctx.fillStyle = muted;
  ctx.font = "22px sans-serif";
  ctx.fillText(`${meta.styleLabel || ""} · ${pageIndex + 1}/${pageCount}`, 88, 158);

  let y = 220;
  const maxW = CANVAS_W - 176;

  const block = (title, body, size = 28) => {
    ctx.fillStyle = seal;
    ctx.font = "700 30px 'Songti SC','Noto Serif SC',serif";
    ctx.fillText(title, 88, y);
    y += 48;
    ctx.fillStyle = ink;
    ctx.font = `${size}px sans-serif`;
    for (const line of wrapText(ctx, body, maxW)) {
      if (y > CANVAS_H - 120) return false;
      ctx.fillText(line, 88, y);
      y += size + 12;
    }
    y += 28;
    return true;
  };

  if (pageIndex === 0) {
    block("结果", meta.type || "");
    if (meta.hook) block("钩子", meta.hook, 26);
    if (meta.quote) block("金句", meta.quote, 26);
    if (meta.demoLine) block("背景", meta.demoLine, 24);
    if (meta.chips?.length) {
      block(
        "证据",
        meta.chips.map((c) => `${c.k} ${c.v}`).join(" · "),
        24
      );
    }
  } else if (pageIndex === 1) {
    const scenes = meta.scenes || [];
    if (!scenes.length) block("场景", "解锁完整报告后可阅读场景长文与本周动作。");
    scenes.forEach((s, i) => {
      block(s.h || `场景 ${i + 1}`, `${s.p || ""}${s.act ? "｜本周动作：" + s.act : ""}`, 24);
    });
  } else {
    const plan = meta.weekPlan || [];
    if (plan.length) {
      plan.forEach((a) => block(a.day || "日", a.text || "", 24));
    } else {
      block("微实验", "完整报告含 7 日可勾选动作。");
    }
    if (meta.shareLine) block("分享句", meta.shareLine, 24);
    block("声明", meta.disclaimer || "娱乐向自我探索，不构成临床诊断或职业承诺。", 22);
  }

  ctx.fillStyle = muted;
  ctx.font = "20px sans-serif";
  ctx.fillText("INK PAPER LAB", 88, CANVAS_H - 72);
  return canvas;
}

function canvasToJpegBytes(canvas, quality = 0.82) {
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  const b64 = dataUrl.split(",")[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function buildPdfFromJpegs(images, pageW = PAGE_W, pageH = PAGE_H) {
  const encoder = new TextEncoder();
  const objs = [];
  const offsets = [];

  const add = (str) => {
    offsets.push(encoder.length);
    encoder.writeString(str);
  };

  // We'll assemble manually with object numbers
  const parts = [];
  const push = (s) => parts.push(s);

  push("%PDF-1.4\n");
  const objStarts = [];

  const writeObj = (n, body) => {
    objStarts[n] = parts.reduce((a, p) => a + (typeof p === "string" ? p.length : p.length), 0);
    push(`${n} 0 obj\n`);
    push(body);
    push("\nendobj\n");
  };

  const pageCount = images.length;
  const kids = [];
  let nextId = 3; // 1=catalog 2=pages

  // Pre-assign ids: for each page: pageObj, contentObj, imageObj
  const pageIds = [];
  for (let i = 0; i < pageCount; i++) {
    pageIds.push({ page: nextId++, content: nextId++, image: nextId++ });
  }

  writeObj(1, `<< /Type /Catalog /Pages 2 0 R >>`);
  writeObj(
    2,
    `<< /Type /Pages /Kids [${pageIds.map((p) => `${p.page} 0 R`).join(" ")}] /Count ${pageCount} >>`
  );

  for (let i = 0; i < pageCount; i++) {
    const ids = pageIds[i];
    const img = images[i];
    const content = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im${i} Do\nQ\n`;
    writeObj(
      ids.page,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${ids.content} 0 R /Resources << /XObject << /Im${i} ${ids.image} 0 R >> >> >>`
    );
    writeObj(ids.content, `<< /Length ${content.length} >>\nstream\n${content}endstream`);
    writeObj(
      ids.image,
      `<< /Type /XObject /Subtype /Image /Width ${CANVAS_W} /Height ${CANVAS_H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`
    );
    parts.push(img);
    push("\nendstream");
  }

  // Flatten and build xref with correct byte offsets
  const chunks = [];
  const pushBin = (x) => {
    if (typeof x === "string") chunks.push(new TextEncoder().encode(x));
    else chunks.push(x);
  };

  // Rebuild properly with measured offsets
  const out = [];
  const enc = new TextEncoder();
  let offset = 0;
  const starts = [0];

  const w = (data) => {
    const bytes = typeof data === "string" ? enc.encode(data) : data;
    out.push(bytes);
    offset += bytes.length;
  };

  w("%PDF-1.4\n");
  const xref = [];

  const obj = (n, header, streamBytes = null) => {
    xref[n] = offset;
    w(`${n} 0 obj\n`);
    w(header);
    if (streamBytes) {
      w("\nstream\n");
      w(streamBytes);
      w("\nendstream");
    }
    w("\nendobj\n");
  };

  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(
    2,
    `<< /Type /Pages /Kids [${pageIds.map((p) => `${p.page} 0 R`).join(" ")}] /Count ${pageCount} >>`
  );

  for (let i = 0; i < pageCount; i++) {
    const ids = pageIds[i];
    const content = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im${i} Do\nQ\n`;
    obj(
      ids.page,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${ids.content} 0 R /Resources << /XObject << /Im${i} ${ids.image} 0 R >> >> >>`
    );
    obj(ids.content, `<< /Length ${content.length} >>`, enc.encode(content));
    obj(
      ids.image,
      `<< /Type /XObject /Subtype /Image /Width ${CANVAS_W} /Height ${CANVAS_H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${images[i].length} >>`,
      images[i]
    );
  }

  const xrefStart = offset;
  const maxObj = nextId - 1;
  w(`xref\n0 ${maxObj + 1}\n`);
  w("0000000000 65535 f \n");
  for (let i = 1; i <= maxObj; i++) {
    w(`${String(xref[i]).padStart(10, "0")} 00000 n \n`);
  }
  w(`trailer\n<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  const total = out.reduce((n, b) => n + b.length, 0);
  const pdf = new Uint8Array(total);
  let p = 0;
  for (const b of out) {
    pdf.set(b, p);
    p += b.length;
  }
  return pdf;
}

export async function downloadReportPdf(meta = {}) {
  const pageCount = 3;
  const images = [];
  for (let i = 0; i < pageCount; i++) {
    const canvas = drawPage(meta, i, pageCount);
    images.push(canvasToJpegBytes(canvas));
  }
  const pdf = buildPdfFromJpegs(images);
  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = meta.filename || `心象测-${meta.type || "报告"}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
  return "downloaded";
}
