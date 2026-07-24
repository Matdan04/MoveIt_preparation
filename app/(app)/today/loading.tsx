import { Skeleton } from "@/components/ui/skeleton";

// Static skeleton matching the day view's shape: header, date strip, a run of
// session rows. No shimmer, per the motion spec.
export default function TodayLoading() {
  return (
    <div>
      <div className="space-y-2 pb-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="mb-4 flex gap-1">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
