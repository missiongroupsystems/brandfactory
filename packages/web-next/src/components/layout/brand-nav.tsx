"use client";

import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { BrandMark } from "@/components/brand/brand-mark";
import {
  BRAND_NAV_ITEMS,
  BRANDS_ROOT,
  brandNavHref,
  isActiveBrandNav,
} from "@/components/layout/nav";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useActiveBrand } from "@/features/brands/active-brand";

/**
 * The sidebar you get when the route names a brand — the second half of the shell's nav.
 *
 * **It replaces the workspace nav rather than nesting under it.** A brand is a place you are
 * *in*, not a branch you have expanded, and a column showing eleven workspace rows plus two brand
 * rows would make the two look like peers. The way out is one link at the top, in the position
 * the workspace nav's product mark occupies, so the column never loses its first row.
 *
 * The two halves are exported separately because the shell's header and its scrolling body are
 * different slots: {@link BrandNavHeader} goes in `SidebarHeader`, {@link BrandNavItems} in
 * `SidebarContent`. Keeping them one component would have meant a header that scrolls away.
 */

/**
 * The brand you are inside, and the way out.
 *
 * **Back is a link, not a button with a router push.** It is a destination — `/brands`, the
 * gallery — so it should be middle-clickable, previewable on hover and `Cmd`-openable in a tab
 * like every other row here. `router.back()` would also be wrong on a pasted link, where there is
 * nothing behind this page to go back to.
 *
 * **The brand name may not have arrived.** `useActiveBrand` resolves it from the workspace's brand
 * list, which the gallery has almost always already fetched under the same SWR key — but a pasted
 * link is a cold load, so the row holds its height with a skeleton rather than flashing the id or
 * the word "Brand". A cached index that has not arrived is a pending request, never a missing
 * fact; only a *settled* list that does not hold the id is the stale-link case, and that says so.
 */
export function BrandNavHeader({ brandId }: { brandId: string }) {
  const { brands, isLoading, select } = useActiveBrand();
  const brand = brands.find((b) => b.id === brandId);
  const pending = isLoading && !brand;

  /**
   * Opening a brand records it as the selection.
   *
   * The route is what decides the page — nothing under this header reads the preference — but
   * `active-brand.ts` still answers "which brand" for surfaces that carry no id in their path.
   * Writing it here keeps the route and the preference from disagreeing. It is an effect rather
   * than a render-time call because a preference store written during render is the exact pattern
   * that store exists to avoid.
   *
   * Guarded on `brand`, not on `brandId`: a stale link naming a brand this workspace does not hold
   * must not overwrite a good selection with a dead id.
   */
  React.useEffect(() => {
    if (brand) select(brand.id);
  }, [brand, select]);

  return (
    <>
      {/* Same two padded rows and same hairline as the workspace header, so the divider under the
          header sits on one line across a mode change and switching does not nudge the column. */}
      <Link
        href={BRANDS_ROOT}
        className="flex items-center gap-3 p-3 transition-colors duration-[120ms] hover:bg-surface-hover"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-border-subtle text-ink-secondary">
          <ArrowLeftIcon aria-hidden className="size-4" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-ink">All brands</span>
          <span className="truncate text-xs text-ink-tertiary">Marketing Hub</span>
        </span>
      </Link>

      {/* The brand, on the row the workspace nav gives its switcher. The mark is the one place the
          customer's hue is allowed on this surface (§4) — which is why the back row above is
          drawn in neutral ink and not in it. */}
      <div className="flex items-center gap-2.5 border-t border-border-subtle p-3">
        {pending ? (
          <>
            <Skeleton className="size-8 shrink-0 rounded-md" />
            <Skeleton className="h-4 w-28" />
          </>
        ) : brand ? (
          <>
            <BrandMark name={brand.name} seed={brand.id} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
              {brand.name}
            </span>
          </>
        ) : (
          // A settled list that does not hold this id: a deleted brand, or a link from another
          // workspace. The pages below say the same thing at more length; the rail should not
          // claim a name it does not have.
          <span className="min-w-0 flex-1 truncate px-1 text-sm text-ink-tertiary">
            Brand not found
          </span>
        )}
      </div>
    </>
  );
}

/**
 * The brand's screens.
 *
 * One unlabelled group: an eyebrow over two rows in a column whose header already names the brand
 * would be a section heading for the only section there is.
 */
export function BrandNavItems({ brandId, pathname }: { brandId: string; pathname: string }) {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {BRAND_NAV_ITEMS.map((item) => {
            const href = brandNavHref(brandId, item.segment);
            return (
              <SidebarMenuItem key={item.segment || "root"}>
                {/* `render`, not `asChild`: this shadcn build sits on Base UI, whose composition
                    prop takes the element to render as. */}
                <SidebarMenuButton
                  render={<Link href={href} />}
                  isActive={isActiveBrandNav(pathname, href, item.segment)}
                  tooltip={item.description}
                >
                  <item.icon />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
