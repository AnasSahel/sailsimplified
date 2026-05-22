"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

const DEBOUNCE_MS = 250;

/**
 * Debounced free-text search for the Accounts tab on a source detail
 * page. Mirrors `<SourceSearchBox>` — pushes `accq` into the URL after
 * 250ms idle via `router.replace` (no back-button entry per keystroke).
 * Clearing `accq` resets to page 1.
 */
export function AccountsSearchBox({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = React.useState(initial);
  const [previousInitial, setPreviousInitial] = React.useState(initial);

  if (initial !== previousInitial) {
    setPreviousInitial(initial);
    setValue(initial);
  }

  React.useEffect(() => {
    if (value === initial) return;
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("accpage");
      if (value.trim()) params.set("accq", value.trim());
      else params.delete("accq");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [value, initial, pathname, router, searchParams]);

  return (
    <div className="relative min-w-[16rem] flex-1">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search by account name or native identity…"
        className="h-9 w-full rounded-md border border-input bg-card pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label="Search accounts"
      />
    </div>
  );
}
