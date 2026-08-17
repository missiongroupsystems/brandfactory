"use client";

import { Palette } from "@/features/spaces/components/palette";
import { PlanCanvas } from "@/features/spaces/components/plan-canvas";
import { Inspector } from "@/features/spaces/components/inspector";

export function PlanEditor() {
  return (
    <div className="flex h-full">
      <div className="max-lg:hidden">
        <Palette />
      </div>
      <div className="min-w-0 flex-1">
        <PlanCanvas />
      </div>
      <div className="max-md:hidden">
        <Inspector />
      </div>
    </div>
  );
}
