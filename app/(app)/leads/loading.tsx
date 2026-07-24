import { Skeleton } from "@/components/ui/skeleton";

export default function LeadsLoading() {
  return (
    <div>
      <div className="flex items-start justify-between pb-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="mb-4 flex gap-4 border-b pb-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-20" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
