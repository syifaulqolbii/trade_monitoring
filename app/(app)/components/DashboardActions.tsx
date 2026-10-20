"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { SnapshotData } from "./SnapshotModal";

// Canvas + template snapshot (±20KB) hanya diunduh saat tombol diklik.
const SnapshotModal = dynamic(() => import("./SnapshotModal"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <div className="animate-pulse rounded-xl bg-surface-container-lowest px-5 py-4 font-body-sm text-body-sm text-on-surface-variant">
        Memuat snapshot…
      </div>
    </div>
  ),
});

export type DashboardSnapshotData = Omit<SnapshotData, "privacy">;

export default function DashboardActions({
  snapshot,
}: {
  snapshot: DashboardSnapshotData;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        onPointerEnter={() => void import("./SnapshotModal")}
        title="Buat gambar snapshot performa untuk dibagikan"
        className="inline-flex items-center gap-2 rounded-lg bg-surface-container px-3 py-[7px] font-label-caps text-label-caps font-semibold text-on-surface transition-colors hover:bg-surface-container-low"
      >
        <span className="material-symbols-rounded text-[18px]">photo_camera</span>
        Snapshot
      </button>
      {open && (
        <SnapshotModal
          open={open}
          onClose={() => setOpen(false)}
          data={snapshot}
        />
      )}
    </>
  );
}
