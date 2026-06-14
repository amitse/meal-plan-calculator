import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("PWA shell", () => {
  it("declares installable app metadata", async () => {
    const manifest = JSON.parse(await readFile("site/public/manifest.webmanifest", "utf8")) as {
      display?: string;
      icons?: { sizes?: string; purpose?: string }[];
      scope?: string;
      start_url?: string;
    };
    const html = await readFile("site/index.html", "utf8");

    expect(manifest.start_url).toBe("/meal-plan-calculator/");
    expect(manifest.scope).toBe("/meal-plan-calculator/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons?.some((icon) => icon.sizes === "192x192")).toBe(true);
    expect(manifest.icons?.some((icon) => icon.sizes === "512x512")).toBe(true);
    expect(manifest.icons?.some((icon) => icon.purpose === "maskable")).toBe(true);
    expect(html).toContain('rel="manifest" href="/meal-plan-calculator/manifest.webmanifest"');
    expect(html).toContain("apple-mobile-web-app-capable");
  });

  it("keeps a scoped service worker for offline reloads", async () => {
    const serviceWorker = await readFile("site/public/sw.js", "utf8");

    expect(serviceWorker).toContain('BASE_PATH = "/meal-plan-calculator/"');
    expect(serviceWorker).toContain("self.addEventListener(\"fetch\"");
    expect(serviceWorker).toContain("request.mode === \"navigate\"");
  });
});
