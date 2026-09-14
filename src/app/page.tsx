const examples = [
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
        className="thread mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col gap-4 overflow-y-auto px-5 pt-8 pb-6 sm:px-8"
      >
        <p className="bubble-user">Find a backpack for commuting.</p>
        <div className="bubble-agent">
          <p>Three that fit a laptop and a rain commute.</p>
          <ul className="mt-4">
            {examples.map((item, index) => (
              <li
                key={item.name}
                className={`rounded-xl bg-paper px-3 py-3 shadow-[2px_6px_16px_rgb(0_0_0_/_0.45)] ${
                  index === 1 ? "relative -mt-2 rotate-1" : index === 2 ? "relative -mt-2 -rotate-1" : ""
                }`}
              >
                <p className="font-bold text-heading">{item.name}</p>
                <p className="mt-1 text-label text-muted">{item.detail}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-label text-muted">Example catalog — not live results.</p>
        </div>
        <p className="bubble-agent">Add Shopping MCP to your assistant and ask again against live stores.</p>
      </section>

      <aside className="sticky bottom-0 z-10 shrink-0 border-t border-line bg-paper px-4 py-4 sm:px-8 sm:py-5">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
          <a href="/mcp.json" download="shopping-mcp.json" className="btn-composer">
            Download MCP config
          </a>
          <p className="font-mono text-label tracking-tight text-muted">shopping-mcp.json</p>
          <ol className="list-decimal space-y-1 pl-5 text-label text-muted">
            <li>Download the file.</li>
            <li>Add it to your assistant as a custom MCP server.</li>
            <li>Ask it to search and compare products.</li>
          </ol>
        </div>
      </aside>
    </main>
  );
}
