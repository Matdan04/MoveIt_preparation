import { Skeleton } from "@/components/ui/skeleton";

export default function ClientsLoading() {
  return (
    <div>
      <div className="space-y-2 pb-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-56" />
      </div>
      <Skeleton className="h-72 w-full rounded-lg" />
    </div>
  );
}
