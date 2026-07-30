import {
  collectJingjinjin,
  getDefaultStore,
  JINGJINJIN_STORAGE_KEY,
} from "@golden-price/core";
import { loadRepoEnv } from "@golden-price/node-env";

loadRepoEnv();

async function main(): Promise<void> {
  const result = await collectJingjinjin(getDefaultStore());
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
