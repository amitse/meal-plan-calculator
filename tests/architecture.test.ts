import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(fullPath);
    }

    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

function repoPath(filePath: string) {
  return relative(repoRoot, filePath).replaceAll("\\", "/");
}

function readRepoFile(filePath: string) {
  return readFileSync(filePath, "utf8");
}

describe("architecture boundaries", () => {
  it("keeps core planner modules independent from the site app", () => {
    for (const filePath of sourceFiles(join(repoRoot, "src"))) {
      expect(readRepoFile(filePath), `${repoPath(filePath)} should not import site code`).not.toMatch(/from\s+["'].*site\/src/);
    }
  });

  it("keeps React UI files behind the editable planner adapter", () => {
    const allowedCoreConsumers = new Set([
      "site/src/editable-planner.ts",
      "site/src/export-plan.ts",
    ]);

    for (const filePath of sourceFiles(join(repoRoot, "site", "src"))) {
      const path = repoPath(filePath);
      const importsCore = /from\s+["']\.\.\/\.\.\/src\//.test(readRepoFile(filePath));

      expect(
        importsCore ? allowedCoreConsumers.has(path) : true,
        `${path} should import core only through editable-planner/export service boundaries`,
      ).toBe(true);
    }
  });
});
