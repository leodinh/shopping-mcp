export function apiUrl(path: string) {
  const origin = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:3001";
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}
