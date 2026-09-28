import { PageHeader } from "@/components/layout/page-header";
import { CalendarScreen } from "@/features/calendar/components/calendar-screen";

export const metadata = { title: "Content calendar — Marketing Hub" };

/**
 * Every brand's posts, shoots and events on one grid.
 *
 * **Workspace-level, not inside a brand**, and that is the ask rather than a
 * layout preference: the marketing team plans seven brands in one view and has
 * been doing it in a spreadsheet precisely because no screen here would show
 * them together. A per-brand calendar would be the tool they already refused.
 *
 * No `<Suspense>`: the month and the brand filter are component state, not
 * `useSearchParams`. Which month you are looking at is a reading posture that
 * a pair of arrows already controls — the line `lib/table-density.ts` draws
 * for row height.
 */
export default function CalendarPage() {
  return (
    <>
      <PageHeader
        title="Content calendar"
        description="Every brand's posts, shoots and events on one grid, from idea to posted. Events arrive from Mission Events and are read-only here. Scheduling stays in Brandwatch and design stays in Canva."
      />
      <div className="px-8 pb-8">
        <CalendarScreen />
      </div>
    </>
  );
}
