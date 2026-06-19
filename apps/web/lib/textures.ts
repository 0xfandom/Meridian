import * as THREE from "three";

/* ------------------------------------------------------------------ *
 * Ribbon surface — perforated metal panels.
 * Large rectangular tiles, dense dot-matrix perforations, panel seams,
 * a width-wise metallic gradient (bright near the glossy dark spine).
 * Tileable along the length (S/x). Returns { map, bump }.
 * ------------------------------------------------------------------ */
function buildRibbonCanvas(mode: "color" | "bump") {
  const W = 2048;
  const H = 512;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;

  if (mode === "color") {
    // metallic width gradient — bright steel near the spine edge (y=0)
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0.0, "#f6f8fd");
    g.addColorStop(0.1, "#e9eef8");
    g.addColorStop(0.32, "#d6dff1");
    g.addColorStop(0.62, "#c0cde8");
    g.addColorStop(0.85, "#cfd9ef");
    g.addColorStop(1.0, "#b3c0db");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // glossy highlight line just inside the spine
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect(0, 0, W, H * 0.045);
  } else {
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, W, H);
  }

  const xs = [0, W / 3, (2 * W) / 3]; // 3 panels per tile (seam also at x=0)
  const ys = [0, H * 0.34, H * 0.67, H];
  const colEdges = [0, W / 3, (2 * W) / 3, W];

  const sp = 17;
  const m = 16;
  const dotR = 1.7;

  // perforation dot-matrix, inset within each panel cell
  ctx.fillStyle = mode === "color" ? "rgba(40,54,90,0.5)" : "rgba(36,36,36,0.92)";
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 3; r++) {
      const x0 = colEdges[c] + m;
      const x1 = colEdges[c + 1] - m;
      const y0 = ys[r] + m;
      const y1 = ys[r + 1] - m;
      for (let x = x0; x <= x1; x += sp) {
        for (let y = y0; y <= y1; y += sp) {
          ctx.beginPath();
          ctx.arc(x, y, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // panel seams (grooves) + bevel highlight
  const seam = mode === "color" ? "rgba(24,36,70,0.55)" : "rgba(18,18,18,0.85)";
  const hi = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 2.5;
  const vline = (x: number) => {
    if (mode === "color") {
      ctx.strokeStyle = hi;
      ctx.beginPath();
      ctx.moveTo(x + 2, 0);
      ctx.lineTo(x + 2, H);
      ctx.stroke();
    }
    ctx.strokeStyle = seam;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  };
  const hline = (y: number) => {
    if (mode === "color") {
      ctx.strokeStyle = hi;
      ctx.beginPath();
      ctx.moveTo(0, y + 2);
      ctx.lineTo(W, y + 2);
      ctx.stroke();
    }
    ctx.strokeStyle = seam;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  };
  for (const x of xs) vline(x);
  hline(ys[1]);
  hline(ys[2]);

  // a few diagonal seams for the architectural variation
  ctx.strokeStyle = seam;
  ctx.lineWidth = 2;
  const diag = (x0: number, y0: number, x1: number, y1: number) => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  };
  diag(xs[1] * 0.45, ys[1], xs[1], ys[0]);
  diag(xs[2], ys[3], xs[2] + W * 0.12, ys[2]);

  return cv;
}

export function makeRibbonTextures() {
  const map = new THREE.CanvasTexture(buildRibbonCanvas("color"));
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.anisotropy = 16;
  map.colorSpace = THREE.SRGBColorSpace;

  const bump = new THREE.CanvasTexture(buildRibbonCanvas("bump"));
  bump.wrapS = THREE.RepeatWrapping;
  bump.wrapT = THREE.ClampToEdgeWrapping;
  bump.anisotropy = 16;

  return { map, bump };
}

/* ------------------------------------------------------------------ *
 * Coin textures — colored face (radial metallic sheen + embossed
 * symbol in the same colour family) plus a grayscale bump for relief.
 * ------------------------------------------------------------------ */
export type CoinSymbol = "dollar" | "btc" | "eth" | "euro" | "star";

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
function rgbStr(r: number, g: number, b: number) {
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}
/** Mix hex a toward hex b by t (0..1). */
export function mixHex(a: string, b: string, t: number) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbStr(A.r + (B.r - A.r) * t, A.g + (B.g - A.g) * t, A.b + (B.b - A.b) * t);
}

function symbolPath(ctx: CanvasRenderingContext2D, symbol: CoinSymbol, S: number) {
  const r = S * 0.27;
  if (symbol === "dollar" || symbol === "euro" || symbol === "btc") {
    ctx.font = `900 ${S * (symbol === "btc" ? 0.56 : 0.62)}px Inter, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const ch = symbol === "dollar" ? "$" : symbol === "euro" ? "€" : "B";
    ctx.fillText(ch, 0, S * 0.02);
    if (symbol === "btc") {
      const barW = S * 0.045;
      const barH = S * 0.52;
      ctx.fillRect(-S * 0.058, -barH / 2 - S * 0.05, barW, barH);
      ctx.fillRect(S * 0.045, -barH / 2 - S * 0.05, barW, barH);
    }
    return;
  }
  if (symbol === "eth") {
    const w = r * 0.9;
    const top = -r * 1.1;
    const mid = -r * 0.06;
    const bot = r * 1.1;
    ctx.beginPath();
    ctx.moveTo(0, top);
    ctx.lineTo(w, mid);
    ctx.lineTo(0, r * 0.26);
    ctx.lineTo(-w, mid);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, r * 0.42);
    ctx.lineTo(w * 0.92, mid + r * 0.18);
    ctx.lineTo(0, bot);
    ctx.lineTo(-w * 0.92, mid + r * 0.18);
    ctx.closePath();
    ctx.fill();
    return;
  }
  // star
  const R = r * 1.2;
  const k = R * 0.16;
  ctx.beginPath();
  ctx.moveTo(0, -R);
  ctx.quadraticCurveTo(k, -k, R, 0);
  ctx.quadraticCurveTo(k, k, 0, R);
  ctx.quadraticCurveTo(-k, k, -R, 0);
  ctx.quadraticCurveTo(-k, -k, 0, -R);
  ctx.closePath();
  ctx.fill();
}

export function makeCoinTextures(symbol: CoinSymbol, base: string) {
  const S = 512;
  const light = mixHex(base, "#ffffff", 0.42);
  const sheenEdge = mixHex(base, "#0b1020", 0.13);
  const symbolShadow = mixHex(base, "#0b1020", 0.42);
  const symbolMain = mixHex(base, "#ffffff", 0.92);

  // ---- color map ----
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);

  // radial sheen — bright specular pool upper-left, vivid base, soft edge
  const g = ctx.createRadialGradient(S * 0.38, S * 0.34, S * 0.03, S * 0.5, S * 0.5, S * 0.54);
  g.addColorStop(0, light);
  g.addColorStop(0.45, base);
  g.addColorStop(1, sheenEdge);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.lineJoin = "round";
  const o = S * 0.0075;
  // soft engraved shadow (down-right)
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = symbolShadow;
  ctx.translate(o, o);
  symbolPath(ctx, symbol, S);
  // crisp near-white symbol on top — reads like a real token mark
  ctx.translate(-o, -o);
  ctx.globalAlpha = 1;
  ctx.fillStyle = symbolMain;
  symbolPath(ctx, symbol, S);
  ctx.restore();

  const map = new THREE.CanvasTexture(cv);
  map.anisotropy = 8;
  map.colorSpace = THREE.SRGBColorSpace;

  // ---- bump map ----
  const bcv = document.createElement("canvas");
  bcv.width = bcv.height = S;
  const bx = bcv.getContext("2d")!;
  bx.fillStyle = "#7d7d7d";
  bx.fillRect(0, 0, S, S);
  bx.save();
  bx.translate(S / 2, S / 2);
  bx.fillStyle = "#ffffff";
  symbolPath(bx, symbol, S);
  bx.restore();
  const bump = new THREE.CanvasTexture(bcv);

  return { map, bump };
}
