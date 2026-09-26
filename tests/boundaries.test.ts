import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile, stat, realpath } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repo = fileURLToPath(new URL("..", import.meta.url));
const forbiddenPackages = [
  "@shopping-mcp/commerce",
  "@shopping-mcp/config",
  "@shopping-mcp/database",
  "@shopping-mcp/api",
  "@shopping-mcp/worker",
];
const forbiddenModules = ["pg", "next/headers", "next/cache"];

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(path) ? [path] : [];
    }),
  );
  return files.flat();
}

async function resolveImport(importer: string, specifier: string) {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return null;
  const base = specifier.startsWith("@/")
    ? resolve(repo, "apps/web/src", specifier.slice(2))
    : resolve(dirname(importer), specifier);
  for (const suffix of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    try {
      if ((await stat(base + suffix)).isFile()) return await realpath(base + suffix);
    } catch {}
  }
  throw new Error(`Unresolved import ${specifier} in ${importer}`);
}

async function checkGraph(
  path: string,
  root: string,
  allow: (location: string, specifier: string) => void,
  visited = new Set<string>(),
) {
  if (visited.has(path)) return;
  visited.add(path);
  const source = await readFile(path, "utf8");
  const location = relative(root, path);
  for (const entry of ts.preProcessFile(source).importedFiles) {
    const specifier = entry.fileName;
    allow(location, specifier);
    const next = await resolveImport(path, specifier);
    if (next) {
      allow(location, relative(repo, next));
      await checkGraph(next, root, allow, visited);
    }
  }
}

test("contracts cannot import backend packages or server-only modules", async () => {
  const root = join(repo, "packages/contracts/src");
  for (const path of await sourceFiles(root)) {
    await checkGraph(path, root, (_location, specifier) => {
      assert.ok(
        !forbiddenPackages.some((name) => specifier === name || specifier.startsWith(`${name}/`)),
        `contracts import ${specifier}`,
      );
      assert.ok(
        !/^(packages\/(commerce|database|config)|apps\/(api|worker))\//.test(specifier),
        `backend source import ${specifier}`,
      );
      assert.ok(
        !specifier.startsWith("node:") && !forbiddenModules.includes(specifier),
        `contracts import ${specifier}`,
      );
    });
  }
});

test("web cannot import backend packages, including through aliases or subpaths", async () => {
  const root = join(repo, "apps/web/src");
  for (const path of await sourceFiles(root)) {
    await checkGraph(path, root, (_location, specifier) => {
      assert.ok(
        !forbiddenPackages.some((name) => specifier === name || specifier.startsWith(`${name}/`)),
        `client import ${specifier}`,
      );
      assert.ok(
        !/^(packages\/(commerce|database|config)|apps\/(api|worker))\//.test(specifier),
        `backend source import ${specifier}`,
      );
      assert.ok(
        !specifier.startsWith("node:") && !forbiddenModules.includes(specifier),
        `client import ${specifier}`,
      );
    });
  }
});

test("shared packages cannot depend on apps and commerce cannot depend on transport frameworks", async () => {
  for (const name of ["commerce", "config", "contracts", "database"]) {
    const root = join(repo, "packages", name, "src");
    for (const path of await sourceFiles(root)) {
      await checkGraph(path, root, (_location, specifier) => {
        assert.ok(
          !/^(@shopping-mcp\/(api|web|worker)(\/|$)|apps\/)/.test(specifier),
          `${name} imports app ${specifier}`,
        );
        if (name === "commerce") {
          assert.ok(
            !/^(@nestjs\/|@modelcontextprotocol\/|mcp-handler($|\/)|express($|\/)|next($|\/))/.test(
              specifier,
            ),
            `commerce imports transport ${specifier}`,
          );
        }
      });
    }
  }
});
