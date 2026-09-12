import { AudienceCard } from "./_components/audience-card";

export const metadata = {
  title: "Shopping with Agent",
  description: "Connect your store to AI assistants, or connect your assistant to start shopping.",
};

export default function Home() {
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <section className="flex flex-col justify-center px-5 py-12 text-center sm:px-12">
        <h1 className="text-headline font-semibold text-heading sm:text-headline-lg">
          Shopping, meet AI.
        </h1>
        <p className="mx-auto mt-5 max-w-140 text-intro text-muted sm:mt-6 sm:text-intro-lg">
          Connect your store to AI assistants, or connect your assistant to start shopping.
        </p>
      </section>

      <section
        aria-label="Choose your path"
        className="flex flex-col md:flex-row justify-center gap-4"
      >
        <AudienceCard
          label="For store owners"
          title="Reach shoppers through AI."
          href="/seller"
          action="Connect Shopify →"
        >
          Help AI assistants discover your products and connect shoppers with your store.
        </AudienceCard>
        <AudienceCard
          label="For shoppers"
          title="Find your next favorite with AI."
          href="/mcp.json"
          action="Connect Your AI Assistant →"
          variant="secondary"
          download="shopping-mcp.json"
          note="Powered by MCP"
        >
          Discover and compare products through your AI assistant.
        </AudienceCard>
      </section>
    </main>
  );
}
