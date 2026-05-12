import { Skeleton } from "@/components/ui/skeleton";

export default function TripsLoading() {
  return (
    <div role="status" aria-label="Loading trips" className="p-6 flex flex-col gap-4">
      <Skeleton className="h-[220px] w-full" />
      <div className="flex gap-4">
        <Skeleton className="h-[180px] flex-1" />
        <Skeleton className="h-[180px] flex-1" />
        <Skeleton className="h-[180px] flex-1" />
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
