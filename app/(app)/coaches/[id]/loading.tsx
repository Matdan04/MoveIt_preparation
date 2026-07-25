import { Skeleton } from "@/components/ui/skeleton";

export default function CoachDetailLoading() {
  return (
    <div>
      <div className="space-y-2 pb-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <Skeleton className="h-56 w-full rounded-lg" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
