import Link from "next/link";

export const metadata = {
  title: "Docs · Shopping with Agent",
};

export default function Docs() {
  return (
    <main className="mx-auto w-full max-w-140 px-5 pt-12 pb-16 sm:px-12 sm:pt-20 sm:pb-24">
      <p className="kicker text-muted">Docs</p>
      <h1 className="mt-4 text-headline font-semibold text-heading">Connect an AI assistant.</h1>
      <p className="mt-5 text-intro text-muted sm:text-intro-lg">
        Shopping with Agent speaks MCP. Add the server to your assistant, then ask it to search and
        compare products across connected stores.
      </p>
      <ol className="mt-10 list-decimal space-y-4 pl-5 text-base text-heading">
        <li>Download the MCP config for this app.</li>
        <li>Add it to your assistant as a custom MCP server.</li>
        <li>Ask for products — for example, a backpack for commuting.</li>
      </ol>
      <a href="/mcp.json" download="shopping-mcp.json" className="btn-audience mt-10 max-w-sm">
        Download MCP config →
      </a>
      <p className="mt-8 text-base text-muted">
        Store owners:{" "}
        <Link href="/seller" className="text-primary underline underline-offset-4">
          connect your store
        </Link>{" "}
        so assistants can find your products.
      </p>
    </main>
  );
}
