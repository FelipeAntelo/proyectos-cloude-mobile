/**
 * FIXTURES SIMULADOS — NO SON PRECIOS REALES.
 * Reproducen la FORMA de las respuestas documentadas de cada API para probar
 * el parseo y la lógica. Ningún valor de aquí se muestra al usuario.
 */
import type { Product } from "../src/worker/domain/types";

export const PIXEL: Product = {
  id: "pixel-11-pro-xl-256-obsidian-unlocked",
  name: "Google Pixel 11 Pro XL · 256 GB · Obsidian · Unlocked",
  spec: {
    brand: "google",
    modelPattern: "pixel\\s*11\\s*pro\\s*xl",
    modelLabel: "Pixel 11 Pro XL",
    storageGb: 256,
    color: "obsidian",
    colorAliases: ["obsidian"],
    condition: "new",
    unlocked: true,
    searchQuery: "Google Pixel 11 Pro XL 256GB Obsidian Unlocked",
    priceFloorCents: 30000,
    priceCeilCents: 200000,
  },
  msrpCents: 129900,
  msrpStatus: "provisional",
  targetCents: 79900,
  active: true,
};

export const BESTBUY_FIXTURE = {
  from: 1,
  to: 3,
  total: 3,
  products: [
    { sku: 1000001, name: "Google - Pixel 11 Pro XL 256GB (Unlocked) - Obsidian", salePrice: 1111.11, regularPrice: 1299.99, onlineAvailability: true, color: "Obsidian", condition: "New", manufacturer: "Google", freeShipping: true },
    { sku: 1000002, name: "Google - Pixel 11 Pro XL 256GB (Unlocked) - Olive", salePrice: 1111.11, regularPrice: 1299.99, onlineAvailability: true, color: "Olive", condition: "New", freeShipping: true },
    { sku: 1000003, name: "Google - Pixel 11 Pro XL 256GB (Verizon) - Obsidian", salePrice: 999.99, onlineAvailability: true, color: "Obsidian", condition: "New", freeShipping: true },
  ],
};

export const EBAY_FIXTURE = {
  total: 3,
  itemSummaries: [
    { itemId: "v1|111|0", title: "Google Pixel 11 Pro XL 256GB Obsidian Factory Unlocked - Brand New Sealed", price: { value: "1050.00", currency: "USD" }, conditionId: "1000", condition: "New", itemWebUrl: "https://www.ebay.com/itm/111", seller: { username: "goodseller", feedbackPercentage: "99.8", feedbackScore: 5400 }, shippingOptions: [{ shippingCostType: "FIXED", shippingCost: { value: "0.00", currency: "USD" } }] },
    { itemId: "v1|222|0", title: "Google Pixel 11 Pro XL 256GB Obsidian Unlocked NEW", price: { value: "700.00", currency: "USD" }, conditionId: "1000", condition: "New", itemWebUrl: "https://www.ebay.com/itm/222", seller: { username: "newbie", feedbackPercentage: "100.0", feedbackScore: 3 }, shippingOptions: [{ shippingCostType: "FIXED", shippingCost: { value: "15.00", currency: "USD" } }] },
    { itemId: "v1|333|0", title: "Case for Google Pixel 11 Pro XL Obsidian", price: { value: "19.99", currency: "USD" }, conditionId: "1000", itemWebUrl: "https://www.ebay.com/itm/333", seller: { username: "cases", feedbackPercentage: "99.9", feedbackScore: 90000 }, shippingOptions: [{ shippingCostType: "CALCULATED" }] },
  ],
};
