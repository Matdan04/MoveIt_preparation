import { notFound } from "next/navigation";
import { Dumbbell } from "lucide-react";
import { requireActor } from "@/lib/auth/session";
import { canManageCoaches } from "@/lib/auth/authz";
import { getCoachesForManagement } from "@/lib/data/coaches";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { AddCoachDialog } from "./add-coach-dialog";
import { CoachRow } from "./coach-row";

export default async function CoachesPage() {
  const actor = await requireActor();
  // 404 for non-managers rather than reveal the screen; the data read's
  // ForbiddenError is the hard backstop underneath this.
  if (!canManageCoaches(actor)) notFound();

  const coaches = await getCoachesForManagement(actor);
  const activeCount = coaches.filter((c) => c.active).length;

  return (
    <>
      <PageHeader
        title="Coaches"
        description="The coaching roster. Add a coach, edit their profile, or take them off rotation."
        actions={<AddCoachDialog />}
      />

      {coaches.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="No coaches yet."
          description="Add your first coach to start assigning clients and booking sessions."
          action={<AddCoachDialog />}
        />
      ) : (
        <div className="space-y-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {activeCount} active · {coaches.length} total
          </p>
          <div className="space-y-2">
            {coaches.map((coach) => (
              <CoachRow key={coach.id} coach={coach} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
