import { CallToolResult } from "@modelcontextprotocol/server";
export function textResult(text: string, isError = false): CallToolResult {
  return {
    content: [{ type: "text" as const, text }],
    ...(isError ? { isError: true as const } : {}),
  };
}

export function dataResult(data: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data,
    bi: true,
  };
}
