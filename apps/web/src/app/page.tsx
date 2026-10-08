import { apiUrl } from "@/lib/api/origin";

const examples: { name: string; detail: string; image?: string }[] = [
  { name: "Harbor Daypack", detail: "19 L · laptop sleeve · $89" },
  { name: "Ridge Commuter", detail: "22 L · rain flap · $120" },
  { name: "Line Haul Rolltop", detail: "20 L · hidden straps · $96" },
];

export const metadata = {
  title: "Shopping with Agent",
  description: "Add Shopping MCP to your AI assistant, then ask it to search and compare products.",
};

export default function Home() {
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <section
        aria-label="Example conversation"
        className="thread mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-6 overflow-y-auto px-5 pt-8 pb-8 sm:px-8"
      >
        <p className="bubble-user">Find a backpack for commuting.</p>
        <div className="w-full">
          <p className="bubble-agent">Three that fit a laptop and a rain commute.</p>
          <ul className="mt-6 grid grid-cols-1 border border-ink sm:grid-cols-3">
            {examples.map((item) => (
              <li
                key={item.name}
                className="border-b border-ink p-4 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
              >
                {item.image ? (
                  // Merchant image hosts are not known ahead of time.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image} alt="" className="product-image mb-3" />
                ) : null}
                <p className="caps font-semibold text-heading">{item.name}</p>
                <p className="mt-1 text-label text-muted">{item.detail}</p>
              </li>
            ))}
          </ul>
          <p className="caps mt-3 text-label text-muted">Example catalog — not live results.</p>
        </div>
        <p className="bubble-agent">
          Add Shopping MCP to your assistant and ask again against live stores.
        </p>
      </section>

      <aside className="sticky bottom-0 z-10 shrink-0 border-t border-ink bg-paper px-5 py-4 sm:px-8 sm:py-5">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:flex-row sm:items-baseline sm:gap-8">
          <a href={apiUrl("/mcp.json")} download="shopping-mcp.json" className="btn shrink-0">
            Download MCP config
          </a>
          <p className="text-label text-muted">
            <span className="font-mono">shopping-mcp.json</span>
            {
              " — Download the file. Add it as a custom MCP server. Ask it to search and compare products."
            }
          </p>
        </div>
      </aside>
    </main>
  );
}
