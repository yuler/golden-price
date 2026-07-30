import {
  formatDailyFile,
  validateDailyFile,
  type DailyPriceFile,
  type DailyPriceStore,
} from "@golden-price/core/worker";

const MANIFEST_KEY = "manifest.json";

export class R2DailyPriceStore implements DailyPriceStore {
  constructor(private readonly bucket: R2Bucket) {}

  objectKey(storageKey: string, date: string): string {
    return `${storageKey}/${date}.json`;
  }

  async load(
    storageKey: string,
    date: string,
  ): Promise<DailyPriceFile | null> {
    const object = await this.bucket.get(this.objectKey(storageKey, date));
    if (!object) return null;
    const parsed = JSON.parse(await object.text()) as DailyPriceFile;
    validateDailyFile(parsed, date);
    return parsed;
  }

  async save(storageKey: string, file: DailyPriceFile): Promise<string> {
    const key = this.objectKey(storageKey, file.date);
    await this.bucket.put(key, formatDailyFile(file), {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
    });
    return key;
  }

  async listDates(storageKey: string): Promise<string[]> {
    const prefix = `${storageKey}/`;
    const dates: string[] = [];
    let cursor: string | undefined;

    do {
      const listed = await this.bucket.list({ prefix, cursor });
      for (const object of listed.objects) {
        if (!object.key.endsWith(".json")) continue;
        const name = object.key.slice(prefix.length);
        if (name.includes("/")) continue;
        dates.push(name.replace(/\.json$/, ""));
      }
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);

    return dates.sort();
  }

  async listChannels(): Promise<string[]> {
    const channels = new Set<string>();
    let cursor: string | undefined;

    do {
      const listed = await this.bucket.list({ cursor });
      for (const object of listed.objects) {
        if (object.key === MANIFEST_KEY) continue;
        const slash = object.key.indexOf("/");
        if (slash <= 0) continue;
        if (!object.key.endsWith(".json")) continue;
        channels.add(object.key.slice(0, slash));
      }
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);

    return [...channels].sort();
  }

  async getRaw(key: string): Promise<string | null> {
    const object = await this.bucket.get(key);
    if (!object) return null;
    return object.text();
  }

  async putRaw(key: string, body: string): Promise<void> {
    await this.bucket.put(key, body, {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
    });
  }
}

export { MANIFEST_KEY };
