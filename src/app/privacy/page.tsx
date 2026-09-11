export const metadata = {
  title: "Privacy · Shopping with Agent",
};

export default function Privacy() {
  return (
    <main className="mx-auto w-full max-w-140 px-5 pt-12 pb-16 sm:px-12 sm:pt-20 sm:pb-24">
      <p className="kicker text-muted">Privacy</p>
      <h1 className="mt-4 text-headline font-semibold text-heading">A local demo.</h1>
      <p className="mt-5 text-intro text-muted sm:text-intro-lg">
        This app is a local demonstration. The only browser data it stores is an optional demo-store
        cookie so a connected store stays selected. It is not a public service and should not be
        used with real customer data.
      </p>
    </main>
  );
}
