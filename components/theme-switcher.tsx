"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const options: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
  { value: "dark", label: "Dark", icon: Moon },
];

// Three-way Light / System / Dark segmented control for the sidebar footer.
// Full segmented row when expanded; a vertical stack of icon buttons when the
// sidebar is collapsed to its icon rail.
export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  // The resolved theme is unknown on the server, so reflecting the active
  // option before mount would mismatch hydration. Highlight only after mount.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "flex gap-1 rounded-md border bg-card p-1",
        collapsed ? "flex-col" : "flex-row",
      )}
    >
      {options.map(({ value, label, icon: Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-sm py-1 text-xs transition-colors outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" strokeWidth={1.75} />
            {!collapsed ? <span>{label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
