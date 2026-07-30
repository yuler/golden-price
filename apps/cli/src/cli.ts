import { JingjinjinChannel } from "@golden-price/core";
import { loadRepoEnv } from "@golden-price/node-env";

loadRepoEnv();

async function main(): Promise<void> {
  const channel = new JingjinjinChannel();
  const quote = await channel.fetchQuote();

  console.log(
    JSON.stringify(
      {
        channel: channel.id,
        cnyPerGram: quote.cnyPerGram,
        unit: "CNY/g",
        trade: quote.trade,
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
