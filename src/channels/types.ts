/** A normalized gold quote in CNY per gram. */
export interface PriceQuote {
  /** Price in CNY/g. */
  cnyPerGram: number;
  /** Whether the source reports the market as open. */
  trade: boolean;
  /** Optional raw payload for debugging. */
  raw?: unknown;
}

/**
 * Abstract price channel. Implementations hide transport details
 * (HTTP, WebSocket, STOMP, etc.) behind this interface.
 */
export interface PriceChannel {
  readonly id: string;
  /** Connect, obtain one usable quote, then clean up. */
  fetchQuote(signal?: AbortSignal): Promise<PriceQuote>;
}
