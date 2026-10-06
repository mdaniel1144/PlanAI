import type { Item } from "@habitat/domain";
import type { FormEvent } from "react";
export type StepProps = {
  item: Item;
  perform: (
    a: () => Promise<Item>,
    success?: string,
    keepUnsaved?: boolean,
  ) => Promise<void>;
  issues?: { field: string; message: string }[];
  busy: boolean;
};

export const values = (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  return new FormData(e.currentTarget);
};
export const text = (d: FormData, k: string) => String(d.get(k) ?? "");
export function decimal(minor: number, currency: string) {
  const digits =
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 0;
  return (minor / 10 ** digits).toFixed(digits);
}
