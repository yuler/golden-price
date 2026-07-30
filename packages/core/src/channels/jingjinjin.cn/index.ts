import type { PriceChannel, PriceQuote } from "../types.js";
import {
  decodeJingjinjinBody,
  deepMerge,
  extractOriginHuangjin,
} from "./decode.js";

const DEFAULT_URL = "wss://api.jingjinjin.cn/market/websocket";
const DEFAULT_TOPIC = "/price/all";
const DEFAULT_TIMEOUT_MS = 20_000;

export interface JingjinjinChannelOptions {
  url?: string;
  topic?: string;
  login?: string;
  passcode?: string;
  /** Max time to wait for a usable originhuangjin quote. */
  timeoutMs?: number;
  /** Override WebSocket construction (tests / special runtimes). */
  openSocket?: (url: string) => WebSocket;
}

/**
 * jingjinjin.cn UF Socket (STOMP over WebSocket) channel.
 * Quote: originhuangjin.prices.originhuangjin.huigou (already CNY/g).
 * Uses the runtime global WebSocket (Node 22+, Cloudflare Workers, browsers).
 */
export class JingjinjinChannel implements PriceChannel {
  readonly id = "jingjinjin.cn";

  private readonly url: string;
  private readonly topic: string;
  private readonly login: string;
  private readonly passcode: string;
  private readonly timeoutMs: number;
  private readonly openSocket: (url: string) => WebSocket;

  constructor(options: JingjinjinChannelOptions = {}) {
    this.url = options.url ?? DEFAULT_URL;
    this.topic = options.topic ?? DEFAULT_TOPIC;
    this.login = options.login ?? "username";
    this.passcode = options.passcode ?? "password";
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.openSocket = options.openSocket ?? defaultOpenSocket;
  }

  fetchQuote(signal?: AbortSignal): Promise<PriceQuote> {
    if (signal?.aborted) {
      return Promise.reject(signal.reason ?? new Error("Aborted"));
    }

    return new Promise<PriceQuote>((resolve, reject) => {
      let settled = false;
      let state: Record<string, unknown> = {};
      const ws = this.openSocket(this.url);

      const cleanup = () => {
        signal?.removeEventListener("abort", onAbort);
        clearTimeout(timer);
        if (
          ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING
        ) {
          ws.close();
        }
      };

      const finishOk = (quote: PriceQuote) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(quote);
      };

      const finishErr = (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      const onAbort = () => {
        finishErr(signal?.reason ?? new Error("Aborted"));
      };

      signal?.addEventListener("abort", onAbort, { once: true });

      const timer = setTimeout(() => {
        finishErr(
          new Error(
            `Timed out after ${this.timeoutMs}ms waiting for originhuangjin quote`,
          ),
        );
      }, this.timeoutMs);

      ws.addEventListener("open", () => {
        ws.send(
          [
            "CONNECT",
            `login:${this.login}`,
            `passcode:${this.passcode}`,
            "accept-version:1.1,1.0",
            "host:api.jingjinjin.cn",
            "",
            "\0",
          ].join("\n"),
        );
      });

      ws.addEventListener("message", (event) => {
        const text = messageToText(event.data);

        if (text.startsWith("CONNECTED")) {
          ws.send(
            [
              "SUBSCRIBE",
              "id:sub-0",
              `destination:${this.topic}`,
              "",
              "\0",
            ].join("\n"),
          );
          return;
        }

        if (text.startsWith("ERROR")) {
          finishErr(new Error(`STOMP ERROR: ${text.slice(0, 200)}`));
          return;
        }

        if (!text.startsWith("MESSAGE")) return;

        const body = extractStompBody(text);
        if (!body) return;

        let payload: unknown;
        try {
          payload = decodeJingjinjinBody(body);
        } catch (error) {
          finishErr(error);
          return;
        }

        if (
          typeof payload !== "object" ||
          payload === null ||
          Array.isArray(payload)
        ) {
          return;
        }

        state = deepMerge(state, payload as Record<string, unknown>);
        const extracted = extractOriginHuangjin(state);
        if (!extracted) return;

        finishOk({
          cnyPerGram: extracted.cnyPerGram,
          trade: extracted.trade,
          raw: state,
        });
      });

      ws.addEventListener("error", () => {
        finishErr(new Error("WebSocket error"));
      });

      ws.addEventListener("close", () => {
        if (!settled) {
          finishErr(new Error("WebSocket closed before a quote was received"));
        }
      });
    });
  }
}

function defaultOpenSocket(url: string): WebSocket {
  if (typeof WebSocket === "undefined") {
    throw new Error(
      "Global WebSocket is unavailable; pass JingjinjinChannelOptions.openSocket",
    );
  }
  return new WebSocket(url);
}

function messageToText(data: unknown): string {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }
  if (ArrayBuffer.isView(data)) {
    const bytes = new Uint8Array(
      data.buffer,
      data.byteOffset,
      data.byteLength,
    );
    return new TextDecoder().decode(bytes);
  }
  return String(data);
}

function extractStompBody(frame: string): string | null {
  const nul = frame.indexOf("\0");
  const sliced = nul >= 0 ? frame.slice(0, nul) : frame;
  const sep = sliced.indexOf("\n\n");
  if (sep < 0) return null;
  return sliced.slice(sep + 2).trim();
}
