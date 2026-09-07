"use client";

import { useState } from "react";
import SnapshotModal, { type SnapshotData } from "./SnapshotModal";

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
        title="Buat gambar snapshot performa untuk dibagikan"
        className="inline-flex items-center gap-2 rounded-lg bg-surface-container px-3 py-[7px] font-label-caps text-label-caps font-semibold text-on-surface transition-colors hover:bg-surface-container-low"
      >
        <span className="material-symbols-rounded text-[18px]">photo_camera</span>
        Snapshot
      </button>
      <SnapshotModal
        open={open}
        onClose={() => setOpen(false)}
        data={snapshot}
      />
    </>
  );
}
