"use client";

import { useEffect } from "react";
import { captureAttribution } from "@/lib/attribution";

/**
 * Global first-touch UTM capture (GAL-460). Marketing traffic lands on
 * /galley/[id] (organic + paid), the /app redirect, and / — not just /landing —
 * so capture must run on every page, not only inside the landing ConsentBanner.
 * captureAttribution() is idempotent (first-touch wins), writes only our own
 * gb_attr cookie, and no-ops when there's no campaign signal.
 */
export function AttributionCapture() {
  useEffect(() => {
    captureAttribution();
  }, []);
  return null;
}
