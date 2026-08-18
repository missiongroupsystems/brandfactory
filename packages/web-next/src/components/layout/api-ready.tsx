"use client";

import { ActivityIcon, ArrowUpRightIcon, PlugZapIcon, WebhookIcon } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { PageState, QueryError } from "@/components/layout/query-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Placeholder for a **Phase 0** area: the API works, the screen is not built.
 *
 * Deliberately different from `NotBuiltYet`. There the backend does not exist; here it
 * does, and the page proves it by making a live request and reporting what came back. That
 * turns "the scaffold looks right" into "the scaffold is connected", which is the only
 * claim worth making at this stage.
 *
 * Every number here is measured rather than illustrative — the record count comes from the
 * live response, the other two from the lists below them. The accent appears once, on the
 * record count (§4): it is the only figure on the screen that can change while you look at it.
 */
export function ApiReady({
  title,
  description,
  endpoints,
  hooks,
  count,
  isLoading,
  error,
  planned,
}: {
  title: string;
  description: string;
  endpoints: string[];
  hooks: string[];
  count?: number;
  isLoading: boolean;
  error: unknown;
  planned: string[];
}) {
  const listPath = endpoints[0]?.split(/\s+/).slice(1).join(" ");
  const docsUrl = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/docs`;

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={<Badge variant="info">API ready · UI pending</Badge>}
      />

      {error ? (
        <PageState>
          <QueryError error={error} />
        </PageState>
      ) : null}

      <div className="flex flex-col gap-4 px-6 py-6 md:px-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard
            tone="accent"
            icon={ActivityIcon}
            label="Records returned"
            value={isLoading || error ? "—" : (count ?? 0)}
            caption={
              isLoading
                ? "Asking the API now"
                : error
                  ? "No response — see the panel above"
                  : `From ${listPath ?? "the list endpoint"}, just now`
            }
          />
          <StatCard
            icon={PlugZapIcon}
            label="Endpoints wired"
            value={endpoints.length}
            caption="Typed from the backend's own OpenAPI document"
          />
          <StatCard
            icon={WebhookIcon}
            label="Hooks available"
            value={hooks.length}
            caption="SWR wrappers a component can call today"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Endpoints</CardTitle>
            <CardDescription>
              Live on the backend and typed in this client. Paths are mono because they are
              identifiers, not prose.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28 pl-5">Method</TableHead>
                  <TableHead className="pr-5">Path</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {endpoints.map((endpoint) => {
                  const [method, ...rest] = endpoint.split(/\s+/);
                  return (
                    <TableRow key={endpoint}>
                      <TableCell className="pl-5">
                        <Badge variant={methodTone(method)}>{method}</Badge>
                      </TableCell>
                      <TableCell className="pr-5 font-mono text-helper text-ink-secondary">
                        {rest.join(" ")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
          {/* §12.3 — the trailing action sits bottom-right of the table card. FastAPI serves
              its own docs, so this is a real destination rather than a placeholder. */}
          <CardFooter className="justify-end border-0 bg-transparent pt-0">
            {/* `nativeButton={false}` because this renders an anchor: Base UI warns (rightly)
                that a non-<button> with button semantics breaks forms and assistive tech. */}
            <Button
              variant="secondary"
              size="sm"
              nativeButton={false}
              render={<a href={docsUrl} target="_blank" rel="noreferrer" />}
            >
              Open API docs
              <ArrowUpRightIcon data-icon="inline-end" />
            </Button>
          </CardFooter>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Hooks available</CardTitle>
              <CardDescription>
                The only place a component should reach for this data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2 font-mono text-helper text-ink-secondary">
                {hooks.map((hook) => (
                  <li key={hook}>{hook}</li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>This screen still needs</CardTitle>
              <CardDescription>
                Everything between a live endpoint and a usable page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2 text-ink-secondary">
                {planned.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span
                      aria-hidden
                      className="mt-[7px] size-1.5 shrink-0 rounded-4xl bg-ink-tertiary"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

/**
 * The fixed status mapping from §12.4 applied to HTTP verbs: additive is success, destructive
 * is error, notable-but-neutral is ochre, and a plain read is the neutral beige pill.
 */
function methodTone(method?: string) {
  switch (method) {
    case "POST":
      return "success" as const;
    case "PATCH":
    case "PUT":
      return "warning" as const;
    case "DELETE":
      return "error" as const;
    default:
      return "default" as const;
  }
}
