import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/shell";

/**
 * Root route for the Android build. The web root (`src/routes/__root.tsx`)
 * renders the whole `<html>` document for server rendering; in the APK the
 * page is a static `index.html`, so the root only mounts the app shell.
 */
export const Route = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
