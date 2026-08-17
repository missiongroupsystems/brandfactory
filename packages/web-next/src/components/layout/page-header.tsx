import type { ReactNode } from "react";

/**
 * H1 at 24/500 with the action cluster on the right — styleguide §17. No divider under it:
 * the content below sits on the sunken canvas, and the card edges already draw the structure.
 * Prose caps at ~720px (§7.1) so a long description does not run the full width of a table.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 px-6 pt-6 pb-2 md:flex-row md:items-start md:justify-between md:gap-6 md:px-8 md:pt-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-ink">{title}</h1>
        {description ? (
          <p className="max-w-[72ch] text-helper text-ink-secondary">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
