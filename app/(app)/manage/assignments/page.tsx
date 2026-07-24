import { Dumbbell } from "lucide-react";
import { requireActor } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default async function AssignmentsPage() {
  await requireActor();
  return (
    <>
      <PageHeader
        title="Coaches"
        description="Assignments and capacity across the coaching team."
      />
      <EmptyState
        icon={Dumbbell}
        title="The assignments board arrives in step 10d"
        description="This screen will pair coaches with clients and show each coach's capacity."
      />
    </>
  );
}
