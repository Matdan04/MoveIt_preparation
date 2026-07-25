import { Skeleton } from "@/components/ui/skeleton";

// Static skeleton matching the day view's shape: header, the month grid, then
// the selected day's summary figures and timeline. No shimmer, per the motion
// spec.
export default function TodayLoading() {
  return (
    <div>
      <div className="space-y-2 pb-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-64" />
      </div>

      <div className="rounded-lg border">
        <div className="flex items-center justify-between border-b p-3">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-8 w-16" />
        </div>
        <div className="grid grid-cols-7 gap-px p-3">
          {Array.from({ length: 42 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-md sm:h-20" />
          ))}
        </div>
      </div>

      <div className="mt-6 mb-4 flex items-baseline justify-between">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-4 w-44" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="mt-3 h-4 w-9" />
            <Skeleton className="h-16 flex-1 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
