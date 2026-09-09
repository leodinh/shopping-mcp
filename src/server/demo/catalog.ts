import { demoStores } from "@/shared/demo-stores";

const inventory: Record<string, Array<[string, string, string, number, number]>> = {
  northline: [
    ["backpack", "Transit Backpack", "Minimalist black backpack with a padded laptop sleeve. 22 liters.", 8900, 18],
    ["jacket", "Rain Shell", "Lightweight black waterproof jacket for the daily commute.", 12900, 7],
    ["bottle", "Trail Bottle", "Insulated stainless steel water bottle in forest green. 750 ml.", 3200, 42],
    ["tote", "Everyday Tote", "Durable natural canvas tote with reinforced handles.", 2400, 0],
  ],
  fieldwork: [
    ["backpack", "Daypack 18", "Compact black minimalist backpack made from recycled nylon. 18 liters.", 6900, 24],
    ["jacket", "Chore Jacket", "Olive cotton workwear jacket with generous front pockets.", 14500, 8],
    ["bottle", "Camp Flask", "Black insulated steel water bottle. 500 ml.", 2800, 31],
    ["pouch", "Utility Pouch", "Small navy organizer for cables and travel essentials.", 1900, 15],
  ],
  stillroom: [
    ["backpack", "Form Backpack", "Structured sand-colored minimalist backpack for work. 20 liters.", 15900, 6],
    ["mug", "Studio Mug", "Hand-finished cream ceramic coffee mug. 350 ml.", 2600, 12],
    ["notebook", "Daily Notebook", "Dotted paper notebook with a black linen cover.", 1800, 35],
    ["tote", "Market Tote", "Roomy black organic cotton tote for everyday errands.", 3800, 20],
  ],
};

export function demoCatalog(slug: string) {
  const store = demoStores.find((candidate) => candidate.slug === slug);
  if (!store) return null;
  return {
    complete: true,
    products: inventory[slug].map(([sku, title, details, price, stock]) => ({
      sku, title, details, price_cents: price, currency_code: "USD",
      image_urls: [], stock, url: `${store.websiteUrl}/products/${sku}`,
    })),
  };
}
