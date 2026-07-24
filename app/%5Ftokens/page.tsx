import { ThemeToggle } from "./theme-toggle";
import { TokenShowcase } from "./token-showcase";

// Throwaway. Exists only to eyeball the design system before pages are built on
// it. Deleted at the end of step 10 (see PROMPTS.md 10d).
export default function TokensPage() {
  return (
    <main className="mx-auto max-w-[1200px] space-y-8 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Chalk &amp; Ink</p>
          <h1 className="text-2xl font-medium">Design tokens</h1>
          <p className="text-sm text-muted-foreground">
            Palette, type scale, and every installed primitive. The two panels
            below are pinned light and dark; use the toggle for the page chrome
            and portalled overlays (dialog, popover, menu).
          </p>
        </div>
        <ThemeToggle />
      </header>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="light rounded-lg border bg-background p-5 text-foreground">
          <p className="eyebrow mb-4">Light</p>
          <TokenShowcase />
        </div>
        <div className="dark rounded-lg border bg-background p-5 text-foreground">
          <p className="eyebrow mb-4">Dark</p>
          <TokenShowcase />
        </div>
      </div>
    </main>
  );
}
