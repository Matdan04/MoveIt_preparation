import { FileInput } from "lucide-react";
import { requireActor } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default async function ImportPage() {
  await requireActor();
  return (
    <>
      <PageHeader
        title="Import"
        description="Review the reconciliation report and commit approved matches."
      />
      <EmptyState
        icon={FileInput}
        title="The import review queue arrives in step 10d"
        description="This screen will walk the reconciliation report one decision at a time before commit."
      />
    </>
  );
}
