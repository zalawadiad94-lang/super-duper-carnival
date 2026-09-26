import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import "@fontsource-variable/outfit";
import "@fontsource-variable/fraunces/opsz.css";
import "./apk.css";
import { installAndroidBridge, installDesktopLinks } from "./android-bridge";
import { getRouter } from "@/router";

installAndroidBridge();
installDesktopLinks();

const router = getRouter();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
