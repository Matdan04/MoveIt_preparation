import { Users } from "lucide-react";
import { requireActor } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default async function ClientsPage() {
  await requireActor();
  return (
    <>
      <PageHeader
        title="Clients"
        description="Scoped by role — a coach sees only their assigned clients."
      />
      <EmptyState
        icon={Users}
        title="The client list arrives in step 10d"
        description="This screen will list clients with their coach, credit rail and next session."
      />
    </>
  );
}
