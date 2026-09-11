export function GET(request: Request) {
  const url = `${new URL(request.url).origin}/api/mcp`;
  return new Response(JSON.stringify({ mcpServers: { "shopping-mcp": { url } } }, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": 'attachment; filename="shopping-mcp.json"',
    },
  });
}
