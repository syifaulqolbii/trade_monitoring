"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtMoney, fmtLots, monthLabel, fmtDateTime } from "@/lib/format";
import { usePrivacy } from "./PrivacyProvider";

export interface SnapshotAccountInfo {
  name: string;
  broker: string;
  login: string;
  server: string;
  cent: boolean;
}

export interface SnapshotMetrics {
  balance: number;
  equity: number;
  netProfit: number;
  growthPct: number | null;
  winRatePct: number | null;
  profitFactor: number | null;
  totalTrades: number;
  lots: number;
}

export interface SnapshotMonthlyRow {
  month: string;
  lots: number;
  trades: number;
  winRate: number | null;
  profit: number;
  balance: number;
}

export interface SnapshotGrowthPoint {
  t: number;
  growthPct: number;
  ddPct: number;
}

export interface SnapshotData {
  account: SnapshotAccountInfo;
  rangeLabel: string;
  metrics: SnapshotMetrics;
  monthly: SnapshotMonthlyRow[];
  growth: SnapshotGrowthPoint[];
  privacy: boolean;
}

// privacy tidak perlu diisi pemanggil — modal ambil dari usePrivacy()

type Variant = "summary" | "monthly" | "growth";

const VARIANTS: { key: Variant; label: string; icon: string; desc: string }[] = [
  { key: "summary", label: "Ringkasan", icon: "dashboard", desc: "Kartu metrik utama + growth" },
  { key: "monthly", label: "Statistik Bulanan", icon: "calendar_month", desc: "Tabel performa per bulan" },
  { key: "growth", label: "Growth Chart", icon: "show_chart", desc: "Kurva pertumbuhan penuh" },
];

// Palet sesuai tema web (light, Material-ish)
const C = {
  bg: "#ffffff",
  panel: "#f5f7fb",
  panelBorder: "#e4e7ef",
  border: "#e9ebf2",
  text: "#1a1c1e",
  muted: "#71787f",
  faint: "#9ba1a9",
  green: "#006c4a",
  greenBg: "#e4f3ea",
  red: "#ba1a1a",
  redBg: "#fbeaea",
  accentDark: "#004d34",
};

const W = 1200;
const H = 750;
const SCALE = 2; // render 2x supaya tajam

function rr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function font(weight: number, size: number) {
  return `${weight} ${size}px "Plus Jakarta Sans", "Inter", system-ui, -apple-system, sans-serif`;
}

function maskLogin(login: string, privacy: boolean): string {
  if (!privacy || login.length <= 2) return login;
  return `${"•".repeat(Math.max(3, login.length - 2))}${login.slice(-2)}`;
}

function drawHeader(
  ctx: CanvasRenderingContext2D,
  d: SnapshotData,
  variantLabel: string
) {
  // Brand
  ctx.fillStyle = C.green;
  rr(ctx, 60, 46, 34, 34, 10);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = font(800, 20);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("F", 77, 64);

  ctx.textAlign = "left";
  ctx.fillStyle = C.text;
  ctx.font = font(700, 22);
  ctx.fillText("KuFXBuku", 108, 58);
  ctx.fillStyle = C.muted;
  ctx.font = font(500, 14);
  ctx.fillText(variantLabel, 108, 80);

  // Tanggal kanan
  ctx.textAlign = "right";
  ctx.fillStyle = C.muted;
  ctx.font = font(500, 14);
  ctx.fillText(fmtDateTime(new Date()), W - 60, 58);
  ctx.fillStyle = C.faint;
  ctx.font = font(500, 12.5);
  ctx.fillText(`${d.account.server || "MT5"}`, W - 60, 80);

  // Info akun
  ctx.textAlign = "left";
  ctx.fillStyle = C.text;
  ctx.font = font(700, 26);
  ctx.fillText(d.account.name, 60, 128);
  ctx.fillStyle = C.muted;
  ctx.font = font(500, 15);
  ctx.fillText(
    `${d.account.broker}  ·  ${maskLogin(d.account.login, d.privacy)}  ·  ${
      d.account.server
    }`,
    60,
    154
  );

  // Badge range
  const label = d.rangeLabel.toUpperCase();
  ctx.font = font(700, 12.5);
  const bw = ctx.measureText(label).width + 28;
  ctx.fillStyle = C.greenBg;
  rr(ctx, W - 60 - bw, 118, bw, 30, 15);
  ctx.fill();
  ctx.fillStyle = C.green;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, W - 60 - bw / 2, 133.5);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawFooter(ctx: CanvasRenderingContext2D, d: SnapshotData) {
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, H - 66);
  ctx.lineTo(W - 60, H - 66);
  ctx.stroke();

  ctx.fillStyle = C.faint;
  ctx.font = font(500, 12.5);
  ctx.textAlign = "left";
  ctx.fillText("KuFXBuku · Trade Monitoring and Journal", 60, H - 40);
  if (d.privacy) {
    ctx.fillStyle = C.green;
    ctx.font = font(600, 12.5);
    ctx.textAlign = "right";
    ctx.fillText("Mode privasi aktif", W - 60, H - 40);
  }
}

function statCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  tone: "neutral" | "pos" | "neg",
  sub?: string
) {
  ctx.fillStyle = C.panel;
  rr(ctx, x, y, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = C.panelBorder;
  ctx.stroke();

  ctx.fillStyle = C.muted;
  ctx.font = font(600, 12.5);
  ctx.textAlign = "left";
  ctx.fillText(label.toUpperCase(), x + 20, y + 28);

  ctx.font = font(700, 27);
  ctx.fillStyle = tone === "pos" ? C.green : tone === "neg" ? C.red : C.text;
  ctx.fillText(value, x + 20, y + 62);

  if (sub) {
    ctx.fillStyle = C.faint;
    ctx.font = font(500, 12);
    ctx.fillText(sub, x + 20, y + h - 16);
  }
}

function drawGrowthArea(
  ctx: CanvasRenderingContext2D,
  growth: SnapshotGrowthPoint[],
  x: number,
  y: number,
  w: number,
  h: number
) {
  if (growth.length < 2) return false;

  // decimate ke maks 140 titik
  const step = Math.max(1, Math.floor(growth.length / 140));
  const pts: SnapshotGrowthPoint[] = [];
  for (let i = 0; i < growth.length; i += step) pts.push(growth[i]);
  if (pts[pts.length - 1] !== growth[growth.length - 1])
    pts.push(growth[growth.length - 1]);

  let min = Infinity;
  let max = -Infinity;
  for (const p of pts) {
    if (p.growthPct < min) min = p.growthPct;
    if (p.growthPct > max) max = p.growthPct;
  }
  const pad = Math.max(1, (max - min) * 0.15);
  min -= pad;
  max += pad;

  const sx = (i: number) => x + (i / (pts.length - 1)) * w;
  const sy = (v: number) => y + h - ((v - min) / (max - min)) * h;

  // grid baseline 0
  if (min < 0 && max > 0) {
    ctx.strokeStyle = C.panelBorder;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(x, sy(0));
    ctx.lineTo(x + w, sy(0));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // area gradient
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, "rgba(0,108,74,0.22)");
  grad.addColorStop(1, "rgba(0,108,74,0.02)");
  ctx.beginPath();
  ctx.moveTo(sx(0), sy(pts[0].growthPct));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(sx(i), sy(pts[i].growthPct));
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // garis
  ctx.beginPath();
  ctx.moveTo(sx(0), sy(pts[0].growthPct));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(sx(i), sy(pts[i].growthPct));
  ctx.strokeStyle = C.green;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.stroke();

  // titik terakhir
  const last = pts[pts.length - 1];
  ctx.beginPath();
  ctx.arc(sx(pts.length - 1), sy(last.growthPct), 4.5, 0, Math.PI * 2);
  ctx.fillStyle = C.green;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx(pts.length - 1), sy(last.growthPct), 8, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,108,74,0.18)";
  ctx.fill();

  // label min/max
  ctx.fillStyle = C.faint;
  ctx.font = font(500, 11.5);
  ctx.textAlign = "left";
  ctx.fillText(`${max.toFixed(1)}%`, x + 4, y + 14);
  ctx.fillText(`${min.toFixed(1)}%`, x + 4, y + h - 6);

  // label waktu awal/akhir
  const fmtT = (t: number) =>
    new Date(t).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
  ctx.textAlign = "left";
  ctx.fillText(fmtT(pts[0].t), x, y + h + 20);
  ctx.textAlign = "right";
  ctx.fillText(fmtT(pts[pts.length - 1].t), x + w, y + h + 20);

  return true;
}

function renderSummary(ctx: CanvasRenderingContext2D, d: SnapshotData) {
  drawHeader(ctx, d, "Ringkasan Performa");

  const gw = (W - 120 - 24) / 2;
  const gh = 92;
  const y0 = 190;
  statCard(ctx, 60, y0, gw, gh, "Balance", fmtMoney(d.metrics.balance, { cent: d.account.cent }), "neutral");
  statCard(ctx, 60 + gw + 24, y0, gw, gh, "Equity", fmtMoney(d.metrics.equity, { cent: d.account.cent }), "neutral");

  const y1 = y0 + gh + 18;
  statCard(
    ctx,
    60,
    y1,
    gw,
    gh,
    "Net Profit",
    fmtMoney(d.metrics.netProfit, { cent: d.account.cent }),
    d.metrics.netProfit >= 0 ? "pos" : "neg",
    "Realized, nett komisi & swap"
  );
  statCard(
    ctx,
    60 + gw + 24,
    y1,
    gw,
    gh,
    "Growth",
    d.metrics.growthPct != null ? `${d.metrics.growthPct >= 0 ? "+" : ""}${d.metrics.growthPct.toFixed(2)}%` : "-",
    (d.metrics.growthPct ?? 0) >= 0 ? "pos" : "neg"
  );

  // Strip metrik sekunder
  const y2 = y1 + gh + 22;
  const items = [
    { label: "Win Rate", value: d.metrics.winRatePct != null ? `${d.metrics.winRatePct.toFixed(1)}%` : "-" },
    {
      label: "Profit Factor",
      value:
        d.metrics.profitFactor == null
          ? "-"
          : d.metrics.profitFactor === Infinity
            ? "∞"
            : d.metrics.profitFactor.toFixed(2),
    },
    { label: "Trade Tertutup", value: String(d.metrics.totalTrades) },
    { label: "Total Lots", value: fmtLots(d.metrics.lots, { cent: d.account.cent }) },
  ];
  const iw = (W - 120) / 4;
  items.forEach((it, i) => {
    const x = 60 + i * iw;
    ctx.fillStyle = C.muted;
    ctx.font = font(600, 12.5);
    ctx.textAlign = "left";
    ctx.fillText(it.label.toUpperCase(), x, y2);
    ctx.fillStyle = C.text;
    ctx.font = font(700, 22);
    ctx.fillText(it.value, x, y2 + 32);
    if (i > 0) {
      ctx.strokeStyle = C.border;
      ctx.beginPath();
      ctx.moveTo(x - 14, y2 - 12);
      ctx.lineTo(x - 14, y2 + 38);
      ctx.stroke();
    }
  });

  // Mini growth chart
  const y3 = y2 + 56;
  ctx.fillStyle = C.muted;
  ctx.font = font(600, 12.5);
  ctx.fillText("PERTUMBUHAN EKUITAS", 60, y3);
  const drew = drawGrowthArea(ctx, d.growth, 60, y3 + 12, W - 120, 130);
  if (!drew) {
    ctx.fillStyle = C.faint;
    ctx.font = font(500, 14);
    ctx.fillText("Belum ada data kurva.", 60, y3 + 60);
  }

  drawFooter(ctx, d);
}

function renderMonthly(ctx: CanvasRenderingContext2D, d: SnapshotData) {
  drawHeader(ctx, d, "Statistik Bulanan");

  const rows = d.monthly.slice(0, 10);
  const cols = ["Bulan", "Lots", "Trade", "Win Rate", "Profit", "Balance Akhir"];
  const xRight = W - 60;
  const colX = [60, xRight - 480, xRight - 350, xRight - 260, xRight - 160, xRight];

  // Header tabel
  const ty = 200;
  ctx.fillStyle = C.panel;
  rr(ctx, 48, ty - 34, W - 96, 44, 10);
  ctx.fill();
  ctx.fillStyle = C.muted;
  ctx.font = font(700, 13);
  cols.forEach((c, i) => {
    ctx.textAlign = i === 0 ? "left" : "right";
    ctx.fillText(c.toUpperCase(), colX[i], ty - 6);
  });

  ctx.font = font(500, 16);
  const rowH = 42;
  rows.forEach((r, ri) => {
    const y = ty + 22 + ri * rowH;
    if (ri % 2 === 1) {
      ctx.fillStyle = "rgba(245,247,251,0.6)";
      ctx.fillRect(48, y - rowH / 2 + 6, W - 96, rowH);
    }
    ctx.fillStyle = C.text;
    ctx.font = font(600, 15.5);
    ctx.textAlign = "left";
    ctx.fillText(monthLabel(r.month), colX[0], y);

    ctx.font = font(500, 15);
    ctx.textAlign = "right";
    ctx.fillStyle = C.text;
    ctx.fillText(fmtLots(r.lots, { cent: d.account.cent }), colX[1], y);
    ctx.fillText(String(r.trades), colX[2], y);
    ctx.fillStyle = C.muted;
    ctx.fillText(r.winRate != null ? `${r.winRate.toFixed(1)}%` : "-", colX[3], y);
    ctx.fillStyle = r.profit >= 0 ? C.green : C.red;
    ctx.font = font(600, 15);
    ctx.fillText(fmtMoney(r.profit, { cent: d.account.cent }), colX[4], y);
    ctx.fillStyle = C.text;
    ctx.font = font(500, 15);
    ctx.fillText(fmtMoney(r.balance, { cent: d.account.cent }), colX[5], y);
  });

  if (rows.length === 0) {
    ctx.fillStyle = C.faint;
    ctx.font = font(500, 15);
    ctx.textAlign = "center";
    ctx.fillText("Belum ada trade tertutup.", W / 2, ty + 40);
  }

  drawFooter(ctx, d);
}

function renderGrowth(ctx: CanvasRenderingContext2D, d: SnapshotData) {
  drawHeader(ctx, d, "Growth & Drawdown");

  const last = d.growth[d.growth.length - 1];
  const minDD = d.growth.reduce((m, p) => Math.min(m, p.ddPct), 0);

  // Angka besar
  ctx.fillStyle = C.muted;
  ctx.font = font(600, 13);
  ctx.textAlign = "left";
  ctx.fillText("TOTAL GROWTH", 60, 206);
  ctx.font = font(800, 52);
  ctx.fillStyle = (last?.growthPct ?? 0) >= 0 ? C.green : C.red;
  ctx.fillText(
    `${(last?.growthPct ?? 0) >= 0 ? "+" : ""}${(last?.growthPct ?? 0).toFixed(2)}%`,
    60,
    258
  );

  ctx.fillStyle = C.muted;
  ctx.font = font(600, 13);
  ctx.textAlign = "right";
  ctx.fillText("MAX DRAWDOWN", W - 60, 206);
  ctx.font = font(800, 52);
  ctx.fillStyle = C.red;
  ctx.fillText(`${Math.abs(minDD).toFixed(2)}%`, W - 60, 258);

  // Chart besar
  ctx.fillStyle = C.muted;
  ctx.font = font(600, 12.5);
  ctx.textAlign = "left";
  ctx.fillText("KURVA PERTUMBUHAN EKUITAS (%)", 60, 316);
  const drew = drawGrowthArea(ctx, d.growth, 60, 330, W - 120, 270);

  if (!drew) {
    ctx.fillStyle = C.faint;
    ctx.font = font(500, 15);
    ctx.textAlign = "center";
    ctx.fillText("Belum ada data kurva equity.", W / 2, 470);
  }

  drawFooter(ctx, d);
}

export default function SnapshotModal({
  open,
  onClose,
  data,
}: {
  open: boolean;
  onClose: () => void;
  data: Omit<SnapshotData, "privacy"> | null;
}) {
  const [variant, setVariant] = useState<Variant>("summary");
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const { privacy } = usePrivacy();

  const render = useCallback(async () => {
    if (!data) return;
    // tunggu font web supaya teks canvas konsisten
    try {
      await document.fonts.ready;
    } catch {
      /* abaikan */
    }
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(SCALE, SCALE);

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    const d: SnapshotData = { ...data, privacy };
    if (variant === "summary") renderSummary(ctx, d);
    else if (variant === "monthly") renderMonthly(ctx, d);
    else renderGrowth(ctx, d);

    setDataUrl(canvas.toDataURL("image/png"));
  }, [data, variant, privacy]);

  useEffect(() => {
    if (open && data) void render();
  }, [open, data, render]);

  const fileName = useMemo(() => {
    const v = VARIANTS.find((x) => x.key === variant)?.label ?? "snapshot";
    const slug = v.toLowerCase().replace(/\s+/g, "-");
    return `freebuff-${slug}-${new Date().toISOString().slice(0, 10)}.png`;
  }, [variant]);

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = fileName;
    a.click();
    setCopied("PNG diunduh");
    setTimeout(() => setCopied(null), 2200);
  };

  const share = async () => {
    if (!dataUrl) return;
    setBusy(true);
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], fileName, { type: "image/png" });
      const nav = navigator as Navigator & {
        canShare?: (d: { files?: File[] }) => boolean;
      };
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "KuFXBuku | Trade Monitoring and Journal" });
        setCopied("Dibagikan");
      } else {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        setCopied("Disalin ke clipboard");
      }
    } catch {
      download();
    } finally {
      setBusy(false);
      setTimeout(() => setCopied(null), 2200);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-surface-container-lowest shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header modal */}
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary-container/50 text-on-secondary-container">
              <span className="material-symbols-rounded text-[20px]">photo_camera</span>
            </span>
            <div>
              <h2 className="font-body-lg text-body-lg font-bold text-on-surface">
                Snapshot Performa
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Gambar siap dibagikan — {privacy ? "nilai uang disembunyikan" : "nilai lengkap"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            <span className="material-symbols-rounded text-[20px]">close</span>
          </button>
        </div>

        {/* Pilihan varian */}
        <div className="flex flex-wrap gap-2 px-5 pt-4">
          {VARIANTS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setVariant(v.key)}
              className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 font-body-sm text-body-sm font-semibold transition-all ${
                variant === v.key
                  ? "border-secondary/40 bg-secondary-container/40 text-on-secondary-container"
                  : "border-outline-variant/30 bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low"
              }`}
            >
              <span className="material-symbols-rounded text-[18px]">{v.icon}</span>
              {v.label}
            </button>
          ))}
        </div>
        <p className="px-5 pt-1.5 font-label-caps text-label-caps text-on-surface-variant">
          {VARIANTS.find((v) => v.key === variant)?.desc}
          {privacy && (
            <span className="ml-2 inline-flex items-center gap-1 text-on-tertiary-container">
              <span className="material-symbols-rounded text-[14px]">visibility_off</span>
              nilai $ ----
            </span>
          )}
        </p>

        {/* Preview */}
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dataUrl}
              alt="Snapshot performa"
              className="w-full rounded-xl border border-outline-variant/30 shadow-sm"
            />
          ) : (
            <div className="flex h-64 items-center justify-center rounded-xl border border-outline-variant/30 bg-surface-container-low">
              <span className="animate-pulse font-body-sm text-body-sm text-on-surface-variant">
                Merender gambar…
              </span>
            </div>
          )}
        </div>

        {/* Aksi */}
        <div className="flex items-center justify-between gap-3 border-t border-outline-variant/30 px-5 py-4">
          <span className="min-w-0 truncate font-label-caps text-label-caps text-on-surface-variant">
            {copied ?? "PNG 1200×750 · siap di-share"}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={download}
              disabled={!dataUrl}
              className="inline-flex items-center gap-2 rounded-xl bg-surface-container-lowest px-4 py-2.5 font-body-sm text-body-sm font-semibold text-on-surface shadow-sm transition-all hover:bg-surface-container-low disabled:opacity-50"
            >
              <span className="material-symbols-rounded text-[18px]">download</span>
              Download
            </button>
            <button
              type="button"
              onClick={share}
              disabled={!dataUrl || busy}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-body-sm text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
            >
              <span className="material-symbols-rounded text-[18px]">share</span>
              Bagikan
            </button>
          </div>
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
