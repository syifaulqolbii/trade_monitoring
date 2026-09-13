/** Skeleton dashboard — tampil instan saat navigasi (ganti range/halaman). */
export default function Loading() {
  const pulse = "animate-pulse rounded-lg bg-surface-container-low";
  return (
    <div className="w-full px-4 sm:px-6">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col">
        {/* sub-header */}
        <div className="flex flex-col justify-between gap-3 pb-4 md:flex-row md:items-center">
          <div className="flex flex-col gap-2">
            <div className={`h-8 w-56 ${pulse}`} />
            <div className={`h-4 w-80 ${pulse}`} />
          </div>
          <div className={`h-9 w-72 ${pulse}`} />
        </div>

        {/* grid 8 kartu */}
        <div className="mb-6 grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4 lg:mb-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-4 shadow-[0_1px_2px_0_rgba(15,23,42,0.04)] sm:p-5"
            >
              <div className={`h-3 w-16 ${pulse}`} />
              <div className={`my-3 h-8 w-24 ${pulse}`} />
              <div className={`h-3 w-full ${pulse}`} />
            </div>
          ))}
        </div>

        {/* chart + panel */}
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
          <div className={`h-[380px] rounded-xl xl:col-span-8 ${pulse}`} />
          <div className={`h-[380px] rounded-xl xl:col-span-4 ${pulse}`} />
        </div>
      </div>
    </div>
  );
}
