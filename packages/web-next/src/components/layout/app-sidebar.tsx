"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AppLogoIcon } from "@/components/brand/app-logo";
import { AccountMenu } from "@/components/layout/account-menu";
import { BrandNavHeader, BrandNavItems } from "@/components/layout/brand-nav";
import {
  CURRENT_PHASE,
  NAV_GROUPS,
  NAV_ITEMS,
  brandIdFromPath,
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
 *
 * **There are two navs in this rail, and the path picks one.** Under `/brands/:id` the column
 * becomes that brand's — the brand at the top, the way back to the gallery above it, and its own
 * screens below. Everywhere else it is the workspace's. `brandIdFromPath` is the whole switch;
 * see its note for why the mode is derived rather than stored.
 *
 * **The brand dropdown that stood in the header is gone.** It was a control that offered a brand
 * switch on eleven screens where nothing answered to it, and it made the brand profile reachable
 * only through a radio group — which reports *changes*, so re-picking the brand you were already
 * in did nothing at all. Choosing a brand is now a navigation to `/brands`, which means the URL
 * carries it, the back button undoes it, and a link opens the brand it names rather than whichever
 * one the reader last picked.
 */
export function AppSidebar() {
  const pathname = usePathname();
  const brandId = brandIdFromPath(pathname);

  return (
    <Sidebar>
      {/* Padding sits on each row rather than on the header, so the hairline between runs the
          full width instead of stopping short at the inset. */}
      <SidebarHeader className="gap-0 p-0">
        {brandId ? <BrandNavHeader brandId={brandId} /> : <WorkspaceHeader />}
      </SidebarHeader>

      <SidebarContent>
        {brandId ? (
          <BrandNavItems brandId={brandId} pathname={pathname} />
        ) : (
          <WorkspaceNav pathname={pathname} />
        )}
      </SidebarContent>

      {/* The account, under a hairline of its own, in both modes: signing out is not a thing you
          should have to leave a brand to do. It replaced the alpha warning that stood here —
          "authentication not yet wired. Every session runs as an administrator." — which stopped
          being true the moment `AuthBoundary` went in front of this shell. A stale warning is
          worse than none: it teaches the reader to disbelieve the next one. */}
      <SidebarFooter className="border-t border-border-subtle p-3">
        <AccountMenu />
      </SidebarFooter>
    </Sidebar>
  );
}

/**
 * The product's identity, and nothing else.
 *
 * **There were three rows here and now there is one.** The middle one was a workspace switcher,
 * gone by product decision in 1.34.0: a person here belongs to one workspace and cannot create,
 * join or leave another, so a control offering the choice advertised something the product does
 * not do. The resolved workspace name is still readable, once, in the account menu at the foot of
 * this rail. The third was the brand switcher — see {@link AppSidebar}.
 */
function WorkspaceHeader() {
  return (
    <div className="flex items-center gap-3 p-3">
      {/* The product mark — the Mission Systems umbrella on the accent tile, which is the same
          lockup the favicon draws (`app/icon.svg`), so the tab and the rail agree. One of the
          named accent roles (§4). */}
      <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-accent text-ink-inverse">
        <AppLogoIcon decorative className="size-5" />
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-ink">Marketing Hub</span>
        <span className="truncate text-xs text-ink-tertiary">Mission Systems</span>
      </div>
    </div>
  );
}

/** The workspace's areas — every table that spans all brands. */
function WorkspaceNav({ pathname }: { pathname: string }) {
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
    <>
      {sections.map((section, index) => (
        <SidebarGroup key={section.label ?? `section-${index}`}>
          {/* The first section (Dashboard, Brands) is where you start and where you go, not a
              labelled area, so it carries no eyebrow; the rest are the product's areas — the only
              uppercase text here (§7.3). */}
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
                    {/* A live item that is not finished — a mock façade, a fixture, or a page
                        deliberately still empty — carries a neutral marker so it does not read as
                        done. Beige, not a colour: a "not finished" marker is not a status. */}
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
                  {/* Navigable, but labelled. These pages explain what is coming and why they are
                      empty — which is more useful than hiding them and more honest than letting
                      them look finished. */}
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
    </>
  );
}
