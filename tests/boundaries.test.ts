import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile, access } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../src/", import.meta.url));

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(path) ? [path] : [];
  }));
  return files.flat();
}

async function resolveImport(importer: string, specifier: string) {
  const base = specifier.startsWith("@/") ? resolve(root, specifier.slice(2)) : resolve(dirname(importer), specifier);
  for (const suffix of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    try {
      await access(base + suffix);
      return base + suffix;
    } catch {}
  }
  throw new Error(`Unresolved import ${specifier} in ${importer}`);
}

async function checkGraph(path: string, shared: boolean, visited = new Set<string>()) {
  if (visited.has(path)) return;
  visited.add(path);
  const source = await readFile(path, "utf8");
  if (!shared && /^['"]use server['"];/.test(source.trimStart())) return;
  const location = relative(root, path);
  assert.ok(!location.startsWith("server/"), `Browser code imports ${location}`);
  if (shared) assert.ok(location.startsWith("shared/"), `Shared code imports ${location}`);
  for (const entry of ts.preProcessFile(source).importedFiles) {
    const specifier = entry.fileName;
    if (specifier.startsWith(".") || specifier.startsWith("@/")) {
      await checkGraph(await resolveImport(path, specifier), shared, visited);
    } else {
      assert.ok(!specifier.startsWith("node:") && !["pg", "next/headers", "next/cache"].includes(specifier), `Browser code imports ${specifier}`);
    }
  }
}

test("shared files and client components cannot import backend implementation", async () => {
  for (const path of await sourceFiles(root)) {
    const shared = relative(root, path).startsWith("shared/");
    const client = /^['"]use client['"];/.test((await readFile(path, "utf8")).trimStart());
    if (shared || client) await checkGraph(path, shared);
  }
});
