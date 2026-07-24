import { UserPlus } from "lucide-react";
import { requireActor } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default async function LeadsPage() {
  await requireActor();
  return (
    <>
      <PageHeader
        title="Leads"
        description="The front-desk pipeline: capture, contact, convert."
      />
      <EmptyState
        icon={UserPlus}
        title="The lead pipeline arrives in step 10d"
        description="This screen will show leads by status and convert them into clients."
      />
    </>
  );
}
