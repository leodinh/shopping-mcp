export type PublicClient = {
  client_id: string;
  client_name?: string;
  logo_uri?: string;
};

function httpsUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * How the consent page presents an MCP client. Name and logo are self-declared metadata, so the
 * page leans on what is proven: a CIMD client's id is the HTTPS URL its metadata was fetched from,
 * so that host is verified. A dynamically registered client has only a random id: unverified.
 */
export function describeClient(client: PublicClient) {
  const documentUrl = httpsUrl(client.client_id);
  return {
    name: client.client_name?.trim() || client.client_id,
    logoUrl: httpsUrl(client.logo_uri)?.href ?? null,
    verifiedHost: documentUrl?.hostname ?? null,
  };
}
