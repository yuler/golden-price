import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  calculateDailyChange,
  classifyPriceData,
  dataUrl,
  manifestUrl,
  shanghaiDate,
  validPriceObservations,
  type DailyPriceFile,
  type DataManifest,
} from "../lib/prices";
import { PriceChart } from "./PriceChart";
import "./PriceDashboard.css";

interface PriceDashboardProps {
  /** Data API base (Worker URL or same-origin site base). */
  dataBase: string;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; channelId: string; file: DailyPriceFile };

function sourceName(channelId: string): string {
  return channelId === "jingjinjin.cn" ? "京金金" : channelId;
}

function formatSigned(value: number): string {
  if (value > 0) return `+${value.toFixed(2)}`;
  return value.toFixed(2);
}

function changeTone(value: number): "up" | "down" | "flat" {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}

const POLL_INTERVAL_MS = 5 * 60 * 1000;

export function PriceDashboard({ dataBase }: PriceDashboardProps) {
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const latestRequestId = useRef(0);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    const requestId = ++latestRequestId.current;
    if (!silent) {
      setLoadState({ kind: "loading" });
    }
    try {
      const manifestResponse = await fetch(manifestUrl(dataBase), {
        cache: "no-store",
      });
      if (!manifestResponse.ok) {
        throw new Error(`数据索引加载失败（${manifestResponse.status}）`);
      }

      const manifest = (await manifestResponse.json()) as DataManifest;
      const channel = manifest.channels[0];
      if (!channel?.latestDate) {
        if (!silent && requestId === latestRequestId.current) {
          setLoadState({ kind: "empty" });
        }
        return;
      }

      const dailyResponse = await fetch(
        dataUrl(dataBase, channel.id, channel.latestDate),
        { cache: "no-store" },
      );
      if (!dailyResponse.ok) {
        throw new Error(`今日报价加载失败（${dailyResponse.status}）`);
      }

      const file = (await dailyResponse.json()) as DailyPriceFile;
      try {
        validPriceObservations(file);
      } catch (error) {
        console.error("Invalid daily price file", error);
        throw new Error("报价数据格式无效");
      }
      if (requestId === latestRequestId.current) {
        setLoadState({
          kind: "loaded",
          channelId: channel.id,
          file,
        });
      }
    } catch (error) {
      if (requestId !== latestRequestId.current) return;
      setLoadState((prev) => {
        if (silent) return prev;
        return {
          kind: "error",
          message: error instanceof Error ? error.message : "报价加载失败",
        };
      });
    }
  }, [dataBase]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      void load({ silent: true });
    }, POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(id);
      latestRequestId.current += 1;
    };
  }, [load]);

  if (loadState.kind === "loading") {
    return (
      <main className="market-page" aria-busy="true" aria-live="polite">
        <MarketHeader source="数据加载中" />
        <section className="quote-block quote-block--loading">
          <span className="skeleton skeleton--price" />
          <span className="skeleton skeleton--change" />
        </section>
        <div className="chart-state">
          <p>正在加载今日金价…</p>
        </div>
        <MarketFooter left="正在更新" />
      </main>
    );
  }

  if (loadState.kind === "error") {
    return (
      <main className="market-page" aria-live="assertive">
        <MarketHeader source="数据源：京金金" />
        <div className="chart-state chart-state--error">
          <p>{loadState.message}</p>
          <button type="button" onClick={() => void load()}>
            重试
          </button>
        </div>
        <MarketFooter left="更新失败" />
      </main>
    );
  }

  if (loadState.kind === "empty") {
    return (
      <main className="market-page" aria-live="polite">
        <MarketHeader source="数据源：京金金" />
        <div className="chart-state">
          <p>今日暂无报价</p>
        </div>
        <MarketFooter left="等待首次采集" />
      </main>
    );
  }

  return (
    <LoadedDashboard
      channelId={loadState.channelId}
      file={loadState.file}
    />
  );
}

function LoadedDashboard({
  channelId,
  file,
}: {
  channelId: string;
  file: DailyPriceFile;
}) {
  const observations = useMemo(() => validPriceObservations(file), [file]);
  const state = classifyPriceData(file, shanghaiDate());
  const latest = observations.at(-1);
  const change = state === "ready" ? calculateDailyChange(observations) : null;
  const tone = change ? changeTone(change.absolute) : "flat";
  const updated = latest
    ? `${state === "stale" ? `${file.date} ` : ""}${latest.label} 更新`
    : "暂无更新时间";
  const changeSummary = change
    ? `，今日变化 ${formatSigned(change.absolute)} 元${
        change.percentage === null
          ? ""
          : `，${formatSigned(change.percentage)}%`
      }`
    : "";
  const summary = latest
    ? `黄金最新价格 ${latest.value.toFixed(2)} 元每克${changeSummary}，${updated}`
    : "今日暂无黄金报价";

  return (
    <main className="market-page" aria-live="polite">
      <MarketHeader source={`数据源：${sourceName(channelId)}`} />

      {latest ? (
        <section className="quote-block" aria-label={summary}>
          <p className="latest-price">
            {latest.value.toFixed(2)}
            <span>元 / 克</span>
          </p>
          {change ? (
            <p className="daily-change" data-tone={tone}>
              {tone === "up" ? "↑ " : tone === "down" ? "↓ " : ""}
              {formatSigned(change.absolute)}
              {change.percentage === null
                ? ""
                : ` · ${formatSigned(change.percentage)}%`}
              <span> 今日</span>
            </p>
          ) : (
            <p className="daily-change" data-tone="flat">
              {state === "stale"
                ? "数据已过期，暂不显示今日涨跌"
                : "今日涨跌需至少两个报价"}
            </p>
          )}
        </section>
      ) : null}

      {state === "ready" && latest ? (
        <PriceChart
          observations={observations}
          latestValue={latest.value}
          summary={summary}
        />
      ) : (
        <div className="chart-state">
          {state === "sparse" ? <span className="single-point" /> : null}
          <p>
            {state === "empty"
              ? "今日暂无报价"
              : state === "stale"
                ? `最后报价来自 ${file.date}，等待今日数据`
                : "正在积累今日走势"}
          </p>
          {state === "sparse" && latest ? (
            <small>首个报价记录于 {latest.label}</small>
          ) : null}
        </div>
      )}

      <MarketFooter left={updated} />
    </main>
  );
}

function MarketHeader({ source }: { source: string }) {
  return (
    <header className="market-header">
      <p>黄金 · CNY</p>
      <span>{source}</span>
    </header>
  );
}

function MarketFooter({ left }: { left: string }) {
  return (
    <footer className="market-footer">
      <span>{left}</span>
      <span>每 5 分钟采集 · 上海时间</span>
    </footer>
  );
}

export default PriceDashboard;
