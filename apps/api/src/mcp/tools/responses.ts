import { CallToolResult } from "@modelcontextprotocol/server";
import { ZodError } from "zod";

export function textResult(text: string, isError = false): CallToolResult {
  return {
    content: [{ type: "text" as const, text }],
    ...(isError ? { isError: true as const } : {}),
  };
}

export function dataResult(data: unknown): CallToolResult {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data as Record<string, unknown>,
  };
}

export function catalogToolError(error: unknown): CallToolResult {
  if (error instanceof ZodError) {
    return textResult(JSON.stringify({ error: "Invalid parameters", issues: error.issues }), true);
  }
  return textResult("Catalog unavailable. Check database setup.", true);
}
