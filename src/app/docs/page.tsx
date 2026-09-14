import Link from "next/link";

export const metadata = {
  title: "Docs · Shopping with Agent",
};

export default function Docs() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-5 pt-10 pb-16 sm:px-8">
      <h1 className="text-headline font-bold text-heading">Add Shopping MCP to your assistant.</h1>
      <p className="mt-4 text-intro text-muted">
        Download the config, add it as a custom MCP server, then ask your assistant to search and
        compare products across connected stores.
      </p>
      <ol className="mt-8 list-decimal space-y-3 pl-5 text-base text-heading">
        <li>Download <span className="font-mono text-label">shopping-mcp.json</span>.</li>
        <li>Add it to your assistant as a custom MCP server.</li>
        <li>Ask for products — for example, a backpack for commuting.</li>
      </ol>
      <a href="/mcp.json" download="shopping-mcp.json" className="btn-composer mt-8">
        Download MCP config
      </a>
      <p className="mt-6 font-mono text-label text-muted">shopping-mcp.json</p>
      <p className="mt-8 text-base text-muted">
        Store owners:{" "}
        <Link href="/seller" className="font-bold text-heading underline decoration-primary underline-offset-4">
          connect your Shopify store
        </Link>{" "}
        so assistants can find your products.
      </p>
    </main>
  );
}
