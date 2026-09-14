export const metadata = {
  title: "Privacy · Shopping with Agent",
};

export default function Privacy() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-5 pt-10 pb-16 sm:px-8">
      <h1 className="text-headline font-bold text-heading">What we store.</h1>
      <p className="mt-4 text-intro text-muted">
        After you connect a Shopify store, this app sets a session cookie so the seller dashboard
        can show that store. Catalog data is synced from Shopify. Do not put this app on the public
        internet until authentication and tenant isolation are in place.
      </p>
    </main>
  );
}
