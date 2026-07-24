"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

// Throwaway control for the tokens page — the real segmented control lives in
// the sidebar footer (step 10b).
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // The resolved theme is unknown on the server, so highlighting the active
  // option before mount would mismatch hydration. Reflect it only after mount.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const options = [
    { value: "light", label: "Light", icon: Sun },
    { value: "system", label: "System", icon: Monitor },
    { value: "dark", label: "Dark", icon: Moon },
  ] as const;

  return (
    <div className="inline-flex items-center gap-1 rounded-md border p-1">
      {options.map(({ value, label, icon: Icon }) => (
        <Button
          key={value}
          size="sm"
          variant={mounted && theme === value ? "secondary" : "ghost"}
          onClick={() => setTheme(value)}
        >
          <Icon /> {label}
        </Button>
      ))}
    </div>
  );
}
