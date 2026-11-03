"use client";

import { BrainIcon, ListChecksIcon, WrenchIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Streamdown } from "streamdown";
import { Spinner } from "@/components/ui/spinner";
import { formatUsd, getPlans, getProducts } from "@/lib/copper/catalog";
import {
  TOOL_LABELS,
  type Progress,
  type ToolStep,
} from "@/lib/copper/assistant/progress";
import { cn } from "@/lib/utils";

const TOOL_NAMES = Object.keys(TOOL_LABELS);

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj =>
  typeof value === "object" && value !== null;
const asList = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

// Plain-English names for the ids the model sends ("copper-home" -> "Copper Home").
const nameOf = (id: unknown) =>
  [...getProducts(), ...getPlans()].find((item) => item.id === id)?.name ??
  String(id);

function formatDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// The rail and its stations
// ---------------------------------------------------------------------------

function Station({
  icon,
  label,
  nodeClass,
  children,
}: {
  icon: ReactNode;
  label?: ReactNode;
  nodeClass: string;
  children?: ReactNode;
}) {
  return (
    <div className="relative pb-5 pl-10">
      <span
        className={cn(
          "ring-secondary absolute top-0 left-0 flex size-7 items-center justify-center rounded-full ring-4",
          nodeClass,
        )}
      >
        {icon}
      </span>
      {label && (
        <p className="text-muted-foreground pt-1 text-[11px] font-semibold tracking-widest uppercase">
          {label}
        </p>
      )}
      {children}
    </div>
  );
}

function ToolsStation({
  used,
  useTools,
}: {
  used: Set<string>;
  useTools: boolean;
}) {
  return (
    <Station
      nodeClass={useTools ? "bg-primary text-primary-foreground" : "bg-chart-3"}
      icon={<ListChecksIcon className="size-4" />}
      label={useTools ? "Tools Copper can use" : "Tools given to Copper: none"}
    >
      <div className="mt-2 flex flex-wrap gap-1.5">
        {TOOL_NAMES.map((name) => (
          <span
            key={name}
            className={cn(
              "rounded-full px-2 py-0.5 font-mono text-xs",
              !useTools && "text-muted-foreground bg-muted line-through",
              useTools && used.has(name)
                ? "bg-accent text-accent-foreground font-bold"
                : useTools && "bg-muted text-muted-foreground",
            )}
          >
            {name}
          </span>
        ))}
      </div>
      {!useTools && (
        <p className="text-muted-foreground mt-2 text-sm">
          Copper has to answer from memory alone.
        </p>
      )}
    </Station>
  );
}

function ThinkingStation({
  text,
  useTools,
}: {
  text: string;
  useTools: boolean;
}) {
  return (
    <Station
      nodeClass={useTools ? "bg-primary text-primary-foreground" : "bg-chart-3"}
      icon={<BrainIcon className="size-4" />}
      label="Copper is thinking"
    >
      <div
        data-testid="thinking"
        className="border-border text-muted-foreground mt-2 border-l-2 pl-3 text-sm italic"
      >
        <Streamdown>{text}</Streamdown>
      </div>
    </Station>
  );
}

function StatusStation({
  progress,
  useTools,
}: {
  progress: Progress;
  useTools: boolean;
}) {
  const text = progress.reply
    ? "Writing the answer…"
    : !useTools
      ? "Answering from memory…"
      : progress.steps.length
        ? "Deciding what to do next…"
        : "Reading your question…";
  return (
    <Station
      nodeClass="bg-secondary animate-pulse"
      icon={
        <span className="flex gap-0.5" aria-hidden="true">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              style={{ animationDelay: `${delay}ms` }}
              className="bg-foreground size-1 animate-bounce rounded-full"
            />
          ))}
        </span>
      }
    >
      <p className="text-muted-foreground pt-1 text-sm">{text}</p>
    </Station>
  );
}

// ---------------------------------------------------------------------------
// The tool card
// ---------------------------------------------------------------------------

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="space-y-0.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SentInput({ name, input }: { name: string; input: unknown }) {
  if (name === "get_prices")
    return <p className="text-sm">Nothing, it just asked for the price list</p>;
  if (name === "get_products")
    return <p className="text-sm">Nothing, it just asked what Copper sells</p>;
  if (!isObj(input))
    return (
      <p className="text-muted-foreground text-sm">filling in the details…</p>
    );
  if (name === "calculate_cost")
    return (
      <Rows
        rows={[
          [
            "Products",
            asList(input.products).length
              ? asList(input.products).map(nameOf).join(", ")
              : "None",
          ],
          ["Plan", nameOf(input.plan)],
          ["Billing", String(input.billing)],
          ["Years", String(input.years)],
        ]}
      />
    );
  return (
    <Rows
      rows={[
        ["Product", nameOf(input.product)],
        ["Color", input.color ? String(input.color) : "All colors"],
      ]}
    />
  );
}

const STOCK_PILL = {
  in_stock: {
    label: "In stock",
    className: "bg-accent text-accent-foreground",
  },
  low_stock: {
    label: "Low stock",
    className: "bg-chart-4 text-primary-foreground",
  },
  backordered: {
    label: "Back-ordered",
    className: "bg-chart-3 text-primary-foreground",
  },
} as const;

function Pill({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-semibold",
        className,
      )}
    >
      {children}
    </span>
  );
}

function CameBack({ step }: { step: ToolStep }) {
  const { name, output, state } = step;
  if (state === "calling")
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Spinner className="size-4" /> the app is running the code…
      </p>
    );
  if (state === "error" || !isObj(output))
    return (
      <p className="text-sm">{String(output ?? "Something went wrong.")}</p>
    );

  if (name === "calculate_cost")
    return (
      <div className="space-y-1 text-sm">
        {asList(output.lines).map((line, i) =>
          isObj(line) ? (
            <div key={i} className="flex justify-between gap-3">
              <span>{String(line.item)}</span>
              <span>{formatUsd(Number(line.usd))}</span>
            </div>
          ) : null,
        )}
        <div className="border-border flex items-baseline justify-between border-t pt-1">
          <span className="font-semibold">Total</span>
          <span className="text-primary font-heading text-2xl font-bold">
            {formatUsd(Number(output.totalUsd))}
          </span>
        </div>
      </div>
    );

  if (name === "get_products")
    return (
      <div className="space-y-2 text-sm">
        {asList(output.products).map((product, i) =>
          isObj(product) ? (
            <div key={i}>
              <p className="flex justify-between font-semibold">
                <span>{String(product.name)}</span>
                <span>{formatUsd(Number(product.priceUsd))}</span>
              </p>
              <p className="text-muted-foreground text-xs">
                {String(product.type)}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {asList(product.colors).map((color) => (
                  <Pill
                    key={String(color)}
                    className="bg-accent text-accent-foreground"
                  >
                    {String(color)}
                  </Pill>
                ))}
              </div>
            </div>
          ) : null,
        )}
      </div>
    );

  if (name === "get_prices")
    return (
      <div className="space-y-1 text-sm">
        {asList(output.products).map((product, i) =>
          isObj(product) ? (
            <p key={i} className="flex justify-between">
              <span>{String(product.name)}</span>
              <span>{formatUsd(Number(product.priceUsd))}</span>
            </p>
          ) : null,
        )}
        {asList(output.plans).map((plan, i) =>
          isObj(plan) && Number(plan.monthlyUsd) > 0 ? (
            <p key={i} className="flex justify-between">
              <span>{String(plan.name)}</span>
              <span>
                {formatUsd(Number(plan.monthlyUsd))}/mo ·{" "}
                {formatUsd(Number(plan.annualUsd))}/yr
              </span>
            </p>
          ) : null,
        )}
      </div>
    );

  if (name === "estimate_shipping" && output.status === "ok")
    return (
      <div className="space-y-1 text-sm">
        {asList(output.colors).map((entry, i) => {
          if (!isObj(entry)) return null;
          const days = Number(entry.daysUntil);
          return (
            <div key={i} className="flex justify-between gap-3">
              <span>{String(entry.color)}</span>
              <span>
                {formatDate(String(entry.nextShipment))} ·{" "}
                {days > 0 ? `in ${days} ${days === 1 ? "day" : "days"}` : "due now"}
              </span>
            </div>
          );
        })}
      </div>
    );

  // check_availability
  if (output.status === "ok")
    return (
      <div className="space-y-1 text-sm">
        {asList(output.colors).map((entry, i) => {
          if (!isObj(entry)) return null;
          const pill = STOCK_PILL[entry.stock as keyof typeof STOCK_PILL];
          return (
            <div key={i} className="flex items-center justify-between gap-3">
              <span>{String(entry.color)}</span>
              {pill && (
                <Pill className={pill.className}>
                  {pill.label}
                  {typeof entry.restockDate === "string" &&
                    ` until ${formatDate(entry.restockDate)}`}
                </Pill>
              )}
            </div>
          );
        })}
      </div>
    );
  if (output.status === "not_a_color")
    return (
      <p className="text-sm">
        {String(output.product)} doesn&apos;t come in {String(output.color)}. It
        comes in {asList(output.colors).map(String).join(", ")}.
      </p>
    );
  return (
    <p className="text-sm">
      {String(output.message ?? "Stock can't be checked.")}
    </p>
  );
}

function ToolCard({ step, number }: { step: ToolStep; number: number }) {
  return (
    <div
      data-testid="tool-call"
      data-tool={step.name}
      className="border-border mt-2 overflow-hidden rounded-lg border"
    >
      <div className="bg-accent text-accent-foreground flex items-center gap-2 px-3 py-1.5">
        <span className="font-mono text-sm font-bold">{step.name}()</span>
        <span className="bg-background/30 rounded-full px-1.5 text-[11px] font-semibold">
          tool {number}
        </span>
        <span className="ml-auto text-xs">{TOOL_LABELS[step.name]}</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-muted-foreground mb-1 text-[11px] font-semibold tracking-widest uppercase">
          <span aria-hidden="true">→ </span>What Copper sent
        </p>
        <SentInput name={step.name} input={step.input} />
      </div>
      <div className="bg-accent/10 border-border border-t px-3 py-2">
        <p className="text-muted-foreground mb-1 text-[11px] font-semibold tracking-widest uppercase">
          <span aria-hidden="true">← </span>What came back
        </p>
        <CameBack step={step} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One whole answer
// ---------------------------------------------------------------------------

export function Answer({
  progress,
  useTools,
}: {
  progress: Progress;
  useTools: boolean;
}) {
  const working = progress.status === "working";
  const used = new Set(
    progress.steps.flatMap((step) => (step.type === "tool" ? [step.name] : [])),
  );
  let toolNumber = 0;

  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-3 bottom-3 left-[13px] w-0.5 rounded-full",
          useTools
            ? "from-primary via-accent to-accent bg-linear-to-b"
            : "bg-chart-3",
        )}
      />
      <ToolsStation used={used} useTools={useTools} />
      {progress.steps.map((step, i) =>
        step.type === "thinking" ? (
          <ThinkingStation key={i} text={step.text} useTools={useTools} />
        ) : (
          <Station
            key={step.id}
            nodeClass="bg-accent text-accent-foreground"
            icon={<WrenchIcon className="size-4" />}
            label={
              step.state === "calling"
                ? "Copper is calling a tool"
                : "Copper called a tool"
            }
          >
            <ToolCard step={step} number={++toolNumber} />
          </Station>
        ),
      )}
      {working && <StatusStation progress={progress} useTools={useTools} />}
      {(progress.reply || !working) && (
        <div className="ml-10 flex gap-2">
          <div className="bg-background border-border w-full rounded-2xl rounded-tl-sm border px-3 py-2 text-sm">
            <p className="text-primary text-xs font-semibold">Copper</p>
            {!useTools && (
              <div className="border-chart-3 mt-1 mb-2 rounded-md border p-2 text-xs">
                <p className="font-semibold">
                  ⚠ Answered without tools: may be made up
                </p>
                <p className="text-muted-foreground mt-0.5">
                  With tools off, Copper can&apos;t see today&apos;s prices or
                  stock. The AI only has what it learned in training, so it
                  fills the gaps with guesses that sound right. That&apos;s a
                  hallucination.
                </p>
              </div>
            )}
            <p className="whitespace-pre-wrap">
              {progress.reply}
              {working && (
                <span className="bg-foreground ml-0.5 inline-block h-4 w-0.5 animate-pulse align-middle" />
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
