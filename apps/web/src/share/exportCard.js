/** Native Canvas share card — designed for WeChat / Moments screenshot density. */

const TONE = {
  rigorous: {
    paper0: "#F7F1E7",
    paper1: "#F3EDE3",
    paper2: "#E8DFD0",
    seal: "#1F6B5C",
    sealWash: "rgba(31,107,92,0.22)",
    ember: "#C45C26",
    ink: "#1c2430",
    muted: "rgba(28,36,48,0.55)",
  },
  humor: {
    paper0: "#F8F2E8",
    paper1: "#F6F0E6",
    paper2: "#EBE3D4",
    seal: "#2a7a6a",
    sealWash: "rgba(42,122,106,0.2)",
    ember: "#d97706",
    ink: "#243044",
    muted: "rgba(36,48,68,0.55)",
  },
  funny: {
    paper0: "#FFF8EF",
    paper1: "#FFF3E6",
    paper2: "#F0E4D4",
    seal: "#0f766e",
    sealWash: "rgba(15,118,110,0.18)",
    ember: "#e11d48",
    ink: "#1a1a1a",
    muted: "rgba(26,26,26,0.5)",
  },
};

export function drawShareCard({
  title,
  type,
  quote,
  tags = [],
  hook = "",
  shareLine = "",
  chips = [],
  styleId = "rigorous",
  styleLabel = "",
} = {}) {
  const W = 720;
  const H = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const t = TONE[styleId] || TONE.rigorous;

  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, t.paper0);
  g.addColorStop(0.5, t.paper1);
  g.addColorStop(1, t.paper2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const rg = ctx.createRadialGradient(100, 120, 10, 140, 160, 320);
  rg.addColorStop(0, t.sealWash);
  rg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);

  const rg2 = ctx.createRadialGradient(W - 80, H - 120, 10, W - 40, H - 80, 260);
  rg2.addColorStop(0, "rgba(196,92,38,0.14)");
  rg2.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rg2;
  ctx.fillRect(0, 0, W, H);

  // frame
  ctx.strokeStyle = "rgba(28,36,48,0.16)";
  ctx.lineWidth = 2;
  ctx.strokeRect(32, 32, W - 64, H - 64);
  ctx.strokeStyle = "rgba(28,36,48,0.08)";
  ctx.strokeRect(44, 44, W - 88, H - 88);

  // brand
  ctx.fillStyle = t.ink;
  ctx.font = "650 30px Fraunces, 'Noto Serif SC', Georgia, serif";
  ctx.fillText("心象测", 72, 110);
  ctx.fillStyle = t.muted;
  ctx.font = "500 18px 'DM Sans', 'PingFang SC', sans-serif";
  ctx.fillText(`${title || "测评"}${styleLabel ? ` · ${styleLabel}` : ""}`, 72, 148);

  // hook band
  const hookText = hook || shareLine || quote || "";
  ctx.fillStyle = "rgba(255,250,243,0.72)";
  roundRect(ctx, 64, 180, W - 128, 150, 16);
  ctx.fill();
  ctx.fillStyle = t.seal;
  ctx.font = "600 28px 'DM Sans', 'PingFang SC', sans-serif";
  wrapText(ctx, hookText, 88, 230, W - 176, 38, 3);

  // type
  ctx.fillStyle = t.seal;
  ctx.font = "650 58px Fraunces, 'Noto Serif SC', Georgia, serif";
  wrapText(ctx, type || "", 72, 420, W - 144, 68, 2);

  // quote
  ctx.fillStyle = t.muted;
  ctx.font = "400 26px 'DM Sans', 'PingFang SC', sans-serif";
  wrapText(ctx, quote || "", 72, 560, W - 144, 38, 3);

  // evidence chips
  let cx = 72;
  let cy = 700;
  ctx.font = "600 20px 'DM Sans', 'PingFang SC', sans-serif";
  for (const c of (chips || []).slice(0, 4)) {
    const label = `${c.k} ${c.v}`;
    const tw = ctx.measureText(label).width + 28;
    if (cx + tw > W - 72) {
      cx = 72;
      cy += 52;
    }
    ctx.fillStyle = "rgba(31,107,92,0.1)";
    roundRect(ctx, cx, cy, tw, 40, 10);
    ctx.fill();
    ctx.fillStyle = t.seal;
    ctx.fillText(label, cx + 14, cy + 27);
    cx += tw + 10;
  }

  // tags
  let tx = 72;
  const ty = 820;
  ctx.font = "600 18px 'DM Sans', 'PingFang SC', sans-serif";
  for (const tag of (tags || []).slice(0, 4)) {
    const tw = ctx.measureText(tag).width + 24;
    if (tx + tw > W - 72) break;
    ctx.fillStyle = "rgba(196,92,38,0.12)";
    roundRect(ctx, tx, ty, tw, 36, 8);
    ctx.fill();
    ctx.fillStyle = t.ember;
    ctx.fillText(tag, tx + 12, ty + 24);
    tx += tw + 10;
  }

  // footer CTA strip
  ctx.fillStyle = t.seal;
  roundRect(ctx, 64, H - 170, W - 128, 72, 14);
  ctx.fill();
  ctx.fillStyle = "#F7F3EC";
  ctx.font = "650 24px 'DM Sans', 'PingFang SC', sans-serif";
  ctx.fillText("扫开 · 心象测 · 三分钟看见另一种自己", 88, H - 125);

  ctx.fillStyle = t.muted;
  ctx.font = "400 16px 'DM Sans', 'PingFang SC', sans-serif";
  ctx.fillText("自我探索 · 非临床诊断 · 非 MBTI® 官方", 72, H - 72);

  return canvas;
}

function wrapText(ctx, text, x, y, maxW, lineH, maxLines = 6) {
  const chars = [...String(text || "")];
  let line = "";
  let yy = y;
  let lines = 0;
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = ch;
      yy += lineH;
      lines += 1;
      if (lines >= maxLines - 1) {
        // rest on last line with ellipsis if needed
        let rest = line;
        for (let i = chars.indexOf(ch) + 1; i < chars.length; i++) rest += chars[i];
        while (ctx.measureText(rest + "…").width > maxW && rest.length > 1) rest = rest.slice(0, -1);
        ctx.fillText(rest.length < String(text).length - chars.indexOf(ch) ? rest + "…" : rest, x, yy);
        return;
      }
    } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function downloadSharePng(meta, filename = "心象测-分享卡.png") {
  const canvas = drawShareCard(meta);
  const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error("export_failed");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return url;
}

export async function shareOrDownload(meta) {
  const canvas = drawShareCard(meta);
  const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error("export_failed");
  const file = new File([blob], "心象测-分享卡.png", { type: "image/png" });
  const text = meta.shareLine || meta.hook || meta.type || "心象测";
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: "心象测", text });
    return "shared";
  }
  await downloadSharePng(meta);
  return "downloaded";
}
