"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";

import { CURRENT_PHASE, NAV_GROUPS, NAV_ITEMS, type NavItem } from "@/components/layout/nav";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

/**
 * The app shell's side-nav — styleguide §7.2.
 *
 * Two things here are brand rules rather than taste. The group labels are the **only**
 * uppercase text in the product (§7.3), and the accent appears exactly twice: on the
 * workspace mark and on nothing else in this component. The active item is carried by a
 * `--surface-selected` fill, not by a green bar.
 */
export function AppSidebar() {
  const pathname = usePathname();

  const live = NAV_ITEMS.filter((item) => item.phase <= CURRENT_PHASE);
  const upcoming = NAV_ITEMS.filter((item) => item.phase > CURRENT_PHASE);

  // Group the live items by NAV_GROUPS (presentation over the same order). Any live item not
  // named in a group falls into a trailing unlabelled section rather than disappearing.
  const byHref = new Map(live.map((item) => [item.href, item]));
  const grouped = new Set(NAV_GROUPS.flatMap((group) => group.hrefs));
  const sections: { label: string | null; items: NavItem[] }[] = NAV_GROUPS.map((group) => ({
    label: group.label,
    items: group.hrefs.map((href) => byHref.get(href)).filter((item): item is NavItem => !!item),
  })).filter((section) => section.items.length > 0);
  const leftover = live.filter((item) => !grouped.has(item.href));
  if (leftover.length > 0) sections.push({ label: null, items: leftover });

  return (
    <Sidebar>
      <SidebarHeader className="p-3">
        <div className="flex items-center gap-3">
          {/* Workspace mark — accent-filled tile, one of the named accent roles (§4). */}
          <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-accent text-sm font-medium text-ink-inverse">
            B
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-ink">BrandFactory</span>
            <span className="truncate text-xs text-ink-tertiary">Mission Systems</span>
          </div>
          {/* Every screen in this shell is fixture-backed — see `lib/api/mock.ts`. One marker
              in the chrome, rather than a banner per page, because it is true of all of them.
              It comes off area by area as real screens replace these. */}
          <Badge className="ml-auto shrink-0">Mock</Badge>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {sections.map((section, index) => (
          <SidebarGroup key={section.label ?? `section-${index}`}>
            {/* The first section (Dashboard) is the home, not a labelled area, so it carries no
                eyebrow; the rest are the product's areas — the only uppercase text here (§7.3). */}
            {section.label ? <SidebarGroupLabel>{section.label}</SidebarGroupLabel> : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    {/* `render`, not `asChild`: this shadcn build sits on Base UI, whose
                        composition prop takes the element to render as. */}
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={pathname.startsWith(item.href)}
                      tooltip={item.description}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                      {/* A live item that is not finished (a mock façade) carries a neutral
                          marker so it does not read as done — the same honesty the phase
                          badge gives upcoming items. Beige, not a colour: a "not finished"
                          marker is not a status. */}
                      {item.tag ? <Badge className="ml-auto">{item.tag}</Badge> : null}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        {upcoming.length > 0 ? (
        <SidebarGroup>
          <SidebarGroupLabel>Not yet built</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {upcoming.map((item) => (
                <SidebarMenuItem key={item.href}>
                  {/* Navigable, but labelled. These pages explain what is coming and why
                      they are empty — which is more useful than hiding them and more
                      honest than letting them look finished. */}
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname.startsWith(item.href)}
                    tooltip={item.description}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                    {/* Neutral beige, not a colour: a phase marker is not a status. */}
                    <Badge className="ml-auto">Phase {item.phase}</Badge>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter className="p-3">
        {/* Not a nicety, and not decorative colour either. While the backend runs
            AUTH_MODE=stub every session is the alpha admin with sight of wifi passwords, so
            this is a genuine warning state and takes the warning tone plus an icon — never
            colour alone (§3.3). */}
        <div className="flex items-start gap-2 rounded-lg bg-warning-tint p-3 text-warning">
          <TriangleAlertIcon aria-hidden className="mt-px size-3.5 shrink-0" />
          <p className="text-xs leading-snug">
            Alpha — authentication not yet wired. Every session runs as an administrator.
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
