import { JingjinjinChannel } from "./channels/index.js";
import {
  findNearestPreviousPrice,
  shanghaiParts,
  writeSlot,
  type PriceCell,
} from "./storage/daily-grid.js";

/** Directory name under data/ for this channel. */
export const JINGJINJIN_STORAGE_KEY = "jingjinjin.cn";

export async function collectJingjinjin(
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

  let value: PriceCell;
  if (quote.trade) {
    value = quote.cnyPerGram;
  } else {
    value = await findNearestPreviousPrice(
      JINGJINJIN_STORAGE_KEY,
      date,
      hour,
      slot,
    );
  }

  const filePath = await writeSlot(
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

async function main(): Promise<void> {
  const result = await collectJingjinjin();
  console.log(
    JSON.stringify(
      {
        channel: "jingjinjin.cn",
        storageKey: JINGJINJIN_STORAGE_KEY,
        date: result.date,
        hour: result.hour,
        slot: result.slot,
        value: result.value,
        trade: result.trade,
        cnyPerGram: result.cnyPerGram,
        path: result.path,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
