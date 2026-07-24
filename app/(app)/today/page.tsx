import { CalendarDays } from "lucide-react";
import { requireActor } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default async function TodayPage() {
  await requireActor();
  return (
    <>
      <PageHeader
        title="Today"
        description="The coach day view: sessions in order, attendance in two taps."
      />
      <EmptyState
        icon={CalendarDays}
        title="The day view arrives in step 10d"
        description="This screen will list the signed-in coach's sessions and let them mark attendance and no-shows."
      />
    </>
  );
}
