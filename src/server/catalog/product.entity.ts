/** Unique on (merchantId, externalId). search_document is generated in PostgreSQL. */
export type Product = {
  id: string;
  merchantId: string;
  externalId: string;
  name: string;
  description: string;
  priceMinor: number;
  currency: string;
  images: string[];
  inventory: number;
  productUrl: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};
