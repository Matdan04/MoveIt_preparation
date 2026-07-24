"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// Thin wrapper so the root layout stays a Server Component; only this leaf
// carries the "use client" boundary the theme context needs.
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
