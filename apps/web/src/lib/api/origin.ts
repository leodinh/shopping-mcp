export function apiUrl(path: string) {
  const origin = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://127.0.0.1:3001";
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}
