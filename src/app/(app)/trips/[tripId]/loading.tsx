import { Skeleton } from "@/components/ui/skeleton";

export default function TripDetailLoading() {
  return (
    <div role="status" aria-label="Loading trip" className="p-6 flex flex-col gap-4">
      <Skeleton className="h-[260px] w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
