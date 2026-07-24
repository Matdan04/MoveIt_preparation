import { Skeleton } from "@/components/ui/skeleton";

export default function AssignmentsLoading() {
  return (
    <div>
      <div className="space-y-2 pb-4">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,20rem)_1fr]">
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
