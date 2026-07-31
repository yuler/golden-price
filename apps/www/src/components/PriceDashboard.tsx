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
import {
  canShareFiles,
  changeTone,
  downloadBlob,
  formatSigned,
  renderShareCardBlob,
  shareCardFile,
  shareCardFilename,
} from "../lib/share-card";
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

type Theme = "light" | "dark";
type ShareStatus = "idle" | "busy" | "error";

const THEME_STORAGE_KEY = "gp-theme";
const THEME_COLORS = {
  dark: "#101116",
  light: "#f6f3ea",
} as const;

const POLL_INTERVAL_MS = 5 * 60 * 1000;

function sourceName(channelId: string): string {
  return channelId === "jingjinjin.cn" ? "京金金" : channelId;
}

function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  const attr = document.documentElement.dataset.theme;
  if (attr === "light" || attr === "dark") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const meta = document.getElementById("theme-color-meta");
  if (meta) meta.setAttribute("content", THEME_COLORS[theme]);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore quota / private-mode failures.
  }
}

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(readTheme);

  const toggle = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }, [theme]);

  return [theme, toggle];
}

export function PriceDashboard({ dataBase }: PriceDashboardProps) {
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [theme, toggleTheme] = useTheme();
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
        <MarketHeader
          source="数据加载中"
          theme={theme}
          onToggleTheme={toggleTheme}
        />
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
        <MarketHeader
          source="数据源：京金金"
          theme={theme}
          onToggleTheme={toggleTheme}
        />
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
        <MarketHeader
          source="数据源：京金金"
          theme={theme}
          onToggleTheme={toggleTheme}
        />
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
      theme={theme}
      onToggleTheme={toggleTheme}
    />
  );
}

function LoadedDashboard({
  channelId,
  file,
  theme,
  onToggleTheme,
}: {
  channelId: string;
  file: DailyPriceFile;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const observations = useMemo(() => validPriceObservations(file), [file]);
  const state = classifyPriceData(file, shanghaiDate());
  const latest = observations.at(-1);
  const change = state === "ready" ? calculateDailyChange(observations) : null;
  const tone = change ? changeTone(change.absolute) : "flat";
  const source = `数据源：${sourceName(channelId)}`;
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
  const [shareStatus, setShareStatus] = useState<ShareStatus>("idle");
  const [shareMessage, setShareMessage] = useState("");
  const [canShare, setCanShare] = useState(false);
  const shareCardBlob = useRef<Blob | null>(null);

  useEffect(() => {
    const probe = new File([new Uint8Array([137, 80, 78, 71])], "probe.png", {
      type: "image/png",
    });
    setCanShare(canShareFiles(probe));
  }, []);

  const exportCard = useCallback(async () => {
    if (!latest) throw new Error("暂无报价可分享");
    return renderShareCardBlob({
      price: latest.value,
      change,
      updatedLabel: updated,
      date: file.date,
      source,
      observations,
    });
  }, [change, file.date, latest, observations, source, updated]);

  useEffect(() => {
    shareCardBlob.current = null;
  }, [exportCard]);

  const handleDownload = useCallback(async () => {
    if (!latest || shareStatus === "busy") return;
    setShareStatus("busy");
    setShareMessage("");
    try {
      const blob = await exportCard();
      downloadBlob(blob, shareCardFilename(file.date));
      setShareStatus("idle");
    } catch (error) {
      console.error(error);
      setShareStatus("error");
      setShareMessage(error instanceof Error ? error.message : "下载失败");
    }
  }, [exportCard, file.date, latest, shareStatus]);

  const handleShare = useCallback(async () => {
    if (!latest || shareStatus === "busy") return;
    setShareStatus("busy");
    setShareMessage("");
    try {
      const blob = shareCardBlob.current ?? (await exportCard());
      const fileName = shareCardFilename(file.date);
      const cardFile = new File([blob], fileName, { type: "image/png" });
      const shareText = `今日金价 ${latest.value.toFixed(2)} 元/克`;
      const result = await shareCardFile(cardFile, "今日金价", shareText);
      if (result === "unsupported") {
        downloadBlob(blob, fileName);
        setShareMessage("当前浏览器不支持直接分享，已改为下载");
      } else if (result === "failed") {
        setShareStatus("error");
        setShareMessage("分享失败，请改用下载");
        return;
      }
      setShareStatus("idle");
    } catch (error) {
      console.error(error);
      setShareStatus("error");
      setShareMessage(error instanceof Error ? error.message : "分享失败");
    }
  }, [exportCard, file.date, latest, shareStatus]);

  const warmShareCard = useCallback(() => {
    if (shareCardBlob.current || shareStatus === "busy") return;
    void exportCard()
      .then((blob) => {
        shareCardBlob.current = blob;
      })
      .catch(() => {
        // handleShare surfaces the real error.
      });
  }, [exportCard, shareStatus]);

  return (
    <main className="market-page" aria-live="polite">
      <MarketHeader
        source={source}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

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
          <div className="share-actions">
            <button
              type="button"
              className="share-action"
              onClick={() => void handleDownload()}
              disabled={shareStatus === "busy"}
            >
              {shareStatus === "busy" ? "生成中…" : "下载卡片"}
            </button>
            {canShare ? (
              <button
                type="button"
                className="share-action"
                onPointerDown={warmShareCard}
                onClick={() => void handleShare()}
                disabled={shareStatus === "busy"}
              >
                分享
              </button>
            ) : null}
          </div>
          {shareMessage ? (
            <p
              className="share-feedback"
              role="status"
              data-tone={shareStatus === "error" ? "error" : "info"}
            >
              {shareMessage}
            </p>
          ) : null}
        </section>
      ) : null}

      {state === "ready" && latest ? (
        <PriceChart
          observations={observations}
          latestValue={latest.value}
          summary={summary}
          theme={theme}
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

function MarketHeader({
  source,
  theme,
  onToggleTheme,
}: {
  source: string;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  return (
    <header className="market-header">
      <p>黄金 · CNY</p>
      <div className="market-header__meta">
        <span>{source}</span>
        <button
          type="button"
          className="theme-toggle"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
          title={theme === "dark" ? "浅色" : "深色"}
        >
          {theme === "dark" ? "浅色" : "深色"}
        </button>
      </div>
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
