import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  askCopperTools,
  copperTools,
  estimateShipping,
} from "@/lib/copper/assistant/tools";
import { readInventory } from "@/lib/copper/inventory";

vi.mock("@/lib/copper/inventory", () => ({ readInventory: vi.fn() }));

const row = (
  product: string,
  color: string,
  units: number,
  nextShipment: string,
) => ({
  sku: "X",
  product,
  color,
  units_in_stock: units,
  next_shipment: nextShipment,
});

// Midday on the 3rd, so the time of day can't change the day count.
const TODAY = new Date("2026-11-03T12:00:00Z");

beforeEach(() => {
  vi.mocked(readInventory).mockResolvedValue([
    row("Copper Notes", "Brushed Copper", 310, "2026-11-13"),
    row("Copper Notes", "Desert Sand", 92, "2026-11-13"),
    row("Copper Notes", "Night Sky", 0, "2026-11-14"),
    row("Copper Home", "Patina Teal", 6, "2026-11-06"),
  ]);
});

describe("estimate_shipping", () => {
  it("counts the days to the next shipment for one color", async () => {
    expect(
      await estimateShipping(
        { product: "copper-notes", color: "Night Sky" },
        TODAY,
      ),
    ).toEqual({
      status: "ok",
      product: "Copper Notes",
      colors: [
        {
          color: "Night Sky",
          inStockNow: false,
          nextShipment: "2026-11-14",
          daysUntil: 11,
        },
      ],
    });
  });

  it("lists every color the stock list has when no color is given", async () => {
    const result = await estimateShipping({ product: "copper-notes" }, TODAY);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.colors.map((c) => c.color)).toEqual([
      "Brushed Copper",
      "Desert Sand",
      "Night Sky",
    ]);
    expect(result.colors.map((c) => c.inStockNow)).toEqual([true, true, false]);
  });

  it("matches the color without caring about case or spaces", async () => {
    const result = await estimateShipping(
      { product: "copper-home", color: "  patina teal " },
      TODAY,
    );
    expect(result).toMatchObject({
      status: "ok",
      colors: [{ color: "Patina Teal", inStockNow: true, daysUntil: 3 }],
    });
  });

  it("ignores the time of day when counting days", async () => {
    const lateNight = new Date("2026-11-03T23:59:00Z");
    const result = await estimateShipping(
      { product: "copper-home", color: "Patina Teal" },
      lateNight,
    );
    expect(result).toMatchObject({ colors: [{ daysUntil: 3 }] });
  });

  it("gives zero or negative days once the date has arrived or passed", async () => {
    const result = await estimateShipping(
      { product: "copper-home", color: "Patina Teal" },
      new Date("2026-11-08T12:00:00Z"),
    );
    expect(result).toMatchObject({ colors: [{ daysUntil: -2 }] });
  });

  it("names the real colors for a color that doesn't exist", async () => {
    expect(
      await estimateShipping(
        { product: "copper-notes", color: "Patina Teal" },
        TODAY,
      ),
    ).toEqual({
      status: "not_a_color",
      product: "Copper Notes",
      color: "Patina Teal",
      colors: ["Brushed Copper", "Desert Sand", "Night Sky"],
    });
    expect(readInventory).not.toHaveBeenCalled();
  });

  it("says so, instead of guessing, when the stock list can't be read", async () => {
    vi.mocked(readInventory).mockResolvedValue(null);
    const result = await estimateShipping({ product: "copper-notes" }, TODAY);
    expect(result.status).toBe("unavailable");
  });

  it("rejects input outside its contract", async () => {
    await expect(
      estimateShipping({ product: "copper-tv" } as never, TODAY),
    ).rejects.toThrow();
  });
});

describe("the fifth tool in the tool lists", () => {
  it("is offered to the model but kept out of the four course tools", () => {
    expect(Object.keys(copperTools)).not.toContain("estimate_shipping");
    expect(Object.keys(askCopperTools).sort()).toEqual([
      "calculate_cost",
      "check_availability",
      "estimate_shipping",
      "get_prices",
      "get_products",
    ]);
  });

  it("has a description and can run", () => {
    const tool = askCopperTools.estimate_shipping;
    expect(tool.description).toMatch(/\w{4,}/);
    expect(typeof tool.execute).toBe("function");
  });
});
