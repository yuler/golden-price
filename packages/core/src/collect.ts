import { JingjinjinChannel } from "./channels/index.js";
import type { PriceQuote } from "./channels/types.js";
import {
  shanghaiParts,
  writeSlot,
  type PriceCell,
} from "./storage/daily-grid.js";
import type { DailyPriceStore } from "./storage/types.js";

/** Directory name under data/ for this channel. */
export const JINGJINJIN_STORAGE_KEY = "jingjinjin.cn";

export function recordedValue(
  quote: Pick<PriceQuote, "trade" | "cnyPerGram">,
): PriceCell {
  return quote.trade ? quote.cnyPerGram : null;
}

export async function collectJingjinjin(
  store: DailyPriceStore,
  now: Date = new Date(),
): Promise<{
  path: string;
  date: string;
  hour: number;
  slot: number;
  value: PriceCell;
  trade: boolean;
  cnyPerGram: number;
}> {
  const channel = new JingjinjinChannel();
  const quote = await channel.fetchQuote();
  const { date, hour, slot } = shanghaiParts(now);

  const value = recordedValue(quote);

  const filePath = await writeSlot(
    store,
    JINGJINJIN_STORAGE_KEY,
    date,
    hour,
    slot,
    value,
  );

  return {
    path: filePath,
    date,
    hour,
    slot,
    value,
    trade: quote.trade,
    cnyPerGram: quote.cnyPerGram,
  };
}
