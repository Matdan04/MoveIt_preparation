import { ScrollText } from "lucide-react";
import { requireActor } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default async function AuditPage() {
  await requireActor();
  return (
    <>
      <PageHeader
        title="Audit"
        description="Every mutation, who made it, and what changed."
      />
      <EmptyState
        icon={ScrollText}
        title="The audit log arrives in step 10d"
        description="This screen will show a filterable log with an expandable before/after diff."
      />
    </>
  );
}
