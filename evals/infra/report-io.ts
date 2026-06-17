import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function readJsonReport<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as T;
}

export async function writeJsonReport(path: string, report: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
}
