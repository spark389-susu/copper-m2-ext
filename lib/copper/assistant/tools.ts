// Module 2: the four tools Ask Copper can use. Products and prices come from
// lib/copper/catalog.ts and stock from lib/copper/inventory.ts, so the
// chatbot never has to make them up.
// The contract for each tool is in specs/module-2/spec.md.
import { tool } from "ai";
import { z } from "zod";
import { getPlans, getProducts } from "@/lib/copper/catalog";
import type { Plan, ProductId } from "@/lib/copper/catalog";
import { readInventory } from "@/lib/copper/inventory";

export type ProductList = {
  products: {
    id: ProductId;
    name: string;
    type: string;
    priceUsd: number;
    colors: string[];
  }[];
};

export type Prices = {
  products: { id: ProductId; name: string; priceUsd: number }[];
  plans: {
    id: Plan["id"];
    name: string;
    monthlyUsd: number;
    annualUsd: number;
  }[];
};

export type CalculateCostInput = {
  products: ProductId[];
  plan: Plan["id"];
  billing: "monthly" | "annual";
  years: number;
};

export type CostBreakdown = {
  lines: { item: string; usd: number }[];
  totalUsd: number;
};

export type CheckAvailabilityInput = { product: ProductId; color?: string };

export type Stock = "in_stock" | "low_stock" | "backordered";

export type Availability =
  | {
      status: "ok";
      product: string;
      colors: { color: string; stock: Stock; restockDate: string | null }[];
    }
  | { status: "not_a_color"; product: string; color: string; colors: string[] }
  | { status: "unavailable"; message: string };

export type EstimateShippingInput = CheckAvailabilityInput;

export type ShippingEstimate =
  | {
      status: "ok";
      product: string;
      colors: {
        color: string;
        inStockNow: boolean;
        nextShipment: string;
        daysUntil: number;
      }[];
    }
  | { status: "not_a_color"; product: string; color: string; colors: string[] }
  | { status: "unavailable"; message: string };

const productIds = ["copper-home", "copper-notes"] as const;

const toCents = (amount: number) => Math.round(amount * 100) / 100;

/** get_products: what Copper sells and which colors each one comes in. */
export function listProducts(): ProductList {
  return {
    products: getProducts().map(({ id, name, type, priceUsd, colors }) => ({
      id,
      name,
      type,
      priceUsd,
      colors,
    })),
  };
}

/** get_prices: every product and plan price, read from the catalog. */
export function getPrices(): Prices {
  return {
    products: getProducts().map(({ id, name, priceUsd }) => ({
      id,
      name,
      priceUsd,
    })),
    plans: getPlans().map(({ id, name, monthlyUsd, annualUsd }) => ({
      id,
      name,
      monthlyUsd,
      annualUsd,
    })),
  };
}

export const calculateCostInput: z.ZodType<CalculateCostInput> = z
  .object({
    products: z.array(z.enum(productIds)).max(5),
    plan: z.enum(["free", "copper-plus"]),
    billing: z.enum(["monthly", "annual"]),
    years: z.number().int().min(1).max(5),
  })
  .strict();

/** calculate_cost: the total cost of devices plus a plan over some years. */
export function calculateCost(input: CalculateCostInput): CostBreakdown {
  const { products, plan, billing, years } = calculateCostInput.parse(input);
  const catalog = getProducts();
  const lines: CostBreakdown["lines"] = products.map((id) => {
    const product = catalog.find((item) => item.id === id)!;
    return { item: product.name, usd: toCents(product.priceUsd) };
  });

  // Copper Plus covers the whole household, so it is counted once. The free
  // plan costs nothing, so it adds no line.
  if (plan !== "free") {
    const chosen = getPlans().find((item) => item.id === plan)!;
    const usd =
      billing === "monthly"
        ? chosen.monthlyUsd * 12 * years
        : chosen.annualUsd * years;
    lines.push({
      item: `${chosen.name} (${billing}, ${years} ${years === 1 ? "year" : "years"})`,
      usd: toCents(usd),
    });
  }

  const totalUsd = toCents(lines.reduce((sum, line) => sum + line.usd, 0));
  return { lines, totalUsd };
}

export const checkAvailabilityInput: z.ZodType<CheckAvailabilityInput> = z
  .object({
    product: z.enum(productIds),
    color: z.string().optional(),
  })
  .strict();

const stockFor = (units: number): Stock =>
  units === 0 ? "backordered" : units < 10 ? "low_stock" : "in_stock";

/** check_availability: stock for one product (or one of its colors), read fresh each time. */
export async function checkAvailability(
  input: CheckAvailabilityInput,
): Promise<Availability> {
  const { product: id, color } = checkAvailabilityInput.parse(input);
  const product = getProducts().find((item) => item.id === id)!;

  // A color the product doesn't come in is "not_a_color", even when stock
  // can't be read, so check the catalog before touching the stock list.
  let wanted = product.colors;
  if (color !== undefined) {
    const match = product.colors.find(
      (name) => name.toLowerCase() === color.trim().toLowerCase(),
    );
    if (!match) {
      return {
        status: "not_a_color",
        product: product.name,
        color,
        colors: product.colors,
      };
    }
    wanted = [match];
  }

  const rows = await readInventory();
  if (rows === null) {
    return {
      status: "unavailable",
      message: "Stock can't be checked right now. Please try again shortly.",
    };
  }

  return {
    status: "ok",
    product: product.name,
    colors: wanted.flatMap((name) => {
      const row = rows.find(
        (item) => item.product === product.name && item.color === name,
      );
      if (!row) return [];
      const stock = stockFor(row.units_in_stock);
      return [
        {
          color: name,
          stock,
          restockDate: stock === "backordered" ? row.next_shipment : null,
        },
      ];
    }),
  };
}

export const estimateShippingInput: z.ZodType<EstimateShippingInput> =
  checkAvailabilityInput;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * estimate_shipping: when the next shipment of stock lands for a product (or
 * one of its colors), from the stock list's next_shipment dates. It is when
 * more stock arrives, not a delivery date to a customer.
 * `today` is a parameter so tests can pick the date.
 */
export async function estimateShipping(
  input: EstimateShippingInput,
  today: Date = new Date(),
): Promise<ShippingEstimate> {
  const { product: id, color } = estimateShippingInput.parse(input);
  const product = getProducts().find((item) => item.id === id)!;

  let wanted = product.colors;
  if (color !== undefined) {
    const match = product.colors.find(
      (name) => name.toLowerCase() === color.trim().toLowerCase(),
    );
    if (!match) {
      return {
        status: "not_a_color",
        product: product.name,
        color,
        colors: product.colors,
      };
    }
    wanted = [match];
  }

  const rows = await readInventory();
  if (rows === null) {
    return {
      status: "unavailable",
      message:
        "Shipping dates can't be checked right now. Please try again shortly.",
    };
  }

  // Compare whole days (UTC), so the time of day never shifts the count.
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  return {
    status: "ok",
    product: product.name,
    colors: wanted.flatMap((name) => {
      const row = rows.find(
        (item) => item.product === product.name && item.color === name,
      );
      if (!row) return [];
      return [
        {
          color: name,
          inStockNow: row.units_in_stock > 0,
          nextShipment: row.next_shipment,
          daysUntil: Math.round(
            (Date.parse(row.next_shipment) - todayUtc) / MS_PER_DAY,
          ),
        },
      ];
    }),
  };
}

export const copperTools = {
  get_products: tool({
    description:
      "List what Copper sells: each product's id, name, type, price and the colors it comes in (not whether they are in stock).",
    inputSchema: z.object({}),
    execute: async () => listProducts(),
  }),
  get_prices: tool({
    description:
      "Get the price of every Copper product and the monthly and annual price of every plan.",
    inputSchema: z.object({}),
    execute: async () => getPrices(),
  }),
  calculate_cost: tool({
    description:
      "Work out the total cost of 0 to 5 devices plus a plan, billed monthly or annually, over 1 to 5 years.",
    inputSchema: calculateCostInput,
    execute: async (input) => calculateCost(input),
  }),
  check_availability: tool({
    description:
      "Check today's stock for a product, or for one of its colors, from the live stock list.",
    inputSchema: checkAvailabilityInput,
    execute: async (input) => checkAvailability(input),
  }),
};

// An extension of the four course tools. It lives in its own list so
// `copperTools` stays exactly the four the course tests expect; the chat sends
// both lists to the model.
export const extraTools = {
  estimate_shipping: tool({
    description:
      "Estimate when the next shipment of a product, or of one of its colors, arrives, in days, from the live stock list. It is when more stock lands, not a delivery date to the customer. Negative days means the date has passed.",
    inputSchema: estimateShippingInput,
    execute: async (input) => estimateShipping(input),
  }),
};

/** Every tool Ask Copper can use: the four course tools plus the extras. */
export const askCopperTools = { ...copperTools, ...extraTools };
