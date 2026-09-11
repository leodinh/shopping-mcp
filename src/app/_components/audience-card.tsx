import type { ReactNode } from "react";
import Link from "next/link";

type AudienceCardProps = {
  label: string;
  title: string;
  children: ReactNode;
  href: string;
  action: string;
  variant?: "primary" | "secondary";
  download?: string;
  note?: string;
};

export function AudienceCard({
  label,
  title,
  children,
  href,
  action,
  variant = "primary",
  download,
  note,
}: AudienceCardProps) {
  const className = variant === "secondary" ? "btn-audience-secondary" : "btn-audience";
  return (
    <article className="flex flex-col bg-card p-8 border border-line max-w-100">
      <p className="kicker text-muted">{label}</p>
      <h2 className="mt-4 text-card-heading font-semibold text-heading sm:text-card-heading-lg">
        {title}
      </h2>
      <p className="mt-3 flex-1 text-base text-muted">{children}</p>
      <div className="mt-8">
        {download ? (
          <a href={href} download={download} className={className}>
            {action}
          </a>
        ) : (
          <Link href={href} className={className}>
            {action}
          </Link>
        )}
        <p
          className={`mt-3 text-center text-label ${note ? "text-muted" : "invisible hidden md:block"}`}
          aria-hidden={!note}
        >
          {note ?? "Powered by MCP"}
        </p>
      </div>
    </article>
  );
}
