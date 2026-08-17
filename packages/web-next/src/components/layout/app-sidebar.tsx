"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AppLogoIcon } from "@/components/brand/app-logo";
import { AccountMenu } from "@/components/layout/account-menu";
import { BrandSwitcher } from "@/components/layout/brand-switcher";
import {
  CURRENT_PHASE,
  NAV_GROUPS,
  NAV_ITEMS,
  isActivePath,
  type NavItem,
} from "@/components/layout/nav";
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
 * uppercase text in the product (§7.3), and the accent appears exactly once: on the product
 * mark and on nothing else in this component. The active item is carried by a
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
      {/* Two rows — product identity, brand — and the padding sits on each of them rather than
          on the header, so the hairline between runs the full width instead of stopping short at
          the inset.

          **There were three.** The middle one was a workspace switcher, and it is gone by
          product decision: a person here belongs to one workspace and cannot create, join or
          leave another, so a control offering the choice advertised something the product does
          not do. The shell still *resolves* a workspace — every brand route is
          `/workspaces/:workspaceId/brands` and none of them can be called without one — and the
          resolved name is readable, once, in the account menu at the foot of this rail. A fact
          you may need to check is not the same thing as a control you may need to use. */}
      <SidebarHeader className="gap-0 p-0">
        <div className="flex items-center gap-3 p-3">
          {/* The product mark — the Mission Systems umbrella on the accent tile, which is the
              same lockup the favicon draws (`app/icon.svg`), so the tab and the rail agree. One
              of the named accent roles (§4). The brand mark on the row below is a different
              thing: the customer's hue, not the product's accent, so the two do not compete for
              the same budget. */}
          <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-accent text-ink-inverse">
            <AppLogoIcon decorative className="size-5" />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-ink">Marketing Hub</span>
            <span className="truncate text-xs text-ink-tertiary">Mission Systems</span>
          </div>
        </div>

        {/* The brand you are inside. A row of its own rather than a third line in the block
            above: the product identity is fixed and this is a control, and stacking a
            clickable name under two static ones makes neither read as what it is. */}
        <div className="border-t border-border-subtle p-3">
          <BrandSwitcher />
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
                      isActive={isActivePath(pathname, item.href)}
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
                    isActive={isActivePath(pathname, item.href)}
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

      {/* The account, under a hairline of its own. It replaced the alpha warning that stood
          here — "authentication not yet wired. Every session runs as an administrator." — which
          stopped being true the moment `AuthBoundary` went in front of this shell. A stale
          warning is worse than none: it teaches the reader to disbelieve the next one. */}
      <SidebarFooter className="border-t border-border-subtle p-3">
        <AccountMenu />
      </SidebarFooter>
    </Sidebar>
  );
}
