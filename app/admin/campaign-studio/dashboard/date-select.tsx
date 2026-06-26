"use client";

import { useRouter } from "next/navigation";

/** Date picker for the daily-report history — navigates to ?report=<date>. */
export function DateSelect({
  dates,
  active,
  base,
}: {
  dates: string[];
  active: string;
  base: string;
}) {
  const router = useRouter();
  return (
    <select
      value={active}
      onChange={(e) => router.push(`${base}?report=${e.target.value}`, { scroll: false })}
      className="bg-white border border-anthracite rounded-full px-4 py-2.5 text-sm font-light text-anthracite outline-none"
    >
      {dates.map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </select>
  );
}
