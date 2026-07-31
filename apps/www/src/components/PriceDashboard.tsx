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
  shareCardUpdatedLabel,
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
  light: "#ffffff",
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
  // Keep SSR and the first client render aligned; sync real preference after mount.
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(readTheme());
  }, []);

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
  const change = useMemo(
    () => (state === "ready" ? calculateDailyChange(observations) : null),
    [observations, state],
  );
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
  const [shareOpen, setShareOpen] = useState(false);
  const [shellFlash, setShellFlash] = useState(false);
  const [shareStatus, setShareStatus] = useState<ShareStatus>("idle");
  const [shareMessage, setShareMessage] = useState("");
  const [canShare, setCanShare] = useState(false);
  const [shareCard, setShareCard] = useState<Blob | null>(null);
  const shareCardRequest = useRef<Promise<Blob> | null>(null);
  const shareCardGeneration = useRef(0);

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
      updatedLabel: shareCardUpdatedLabel(file.date, latest.label),
      date: file.date,
      source,
      observations,
    });
  }, [change, file.date, latest, observations, source]);

  useEffect(() => {
    shareCardGeneration.current += 1;
    shareCardRequest.current = null;
    setShareCard(null);
  }, [exportCard]);

  const ensureShareCard = useCallback(async (): Promise<Blob> => {
    if (shareCard) return shareCard;
    if (shareCardRequest.current) return shareCardRequest.current;
    const generation = shareCardGeneration.current;
    const request = exportCard()
      .then((blob) => {
        if (generation === shareCardGeneration.current) {
          setShareCard(blob);
        }
        return blob;
      })
      .finally(() => {
        if (shareCardRequest.current === request) {
          shareCardRequest.current = null;
        }
      });
    shareCardRequest.current = request;
    return request;
  }, [exportCard, shareCard]);

  const warmShareCard = useCallback(() => {
    if (shareCard || shareStatus === "busy") return;
    void ensureShareCard().catch(() => {
      // the real error surfaces when the modal opens.
    });
  }, [ensureShareCard, shareCard, shareStatus]);

  const openShare = useCallback(() => {
    setShareMessage("");
    setShellFlash(true);
    setShareOpen(true);
  }, []);

  useEffect(() => {
    if (!shareOpen || shareCard) return;
    void ensureShareCard().catch((error) => {
      setShareMessage(error instanceof Error ? error.message : "分享卡片生成失败");
    });
  }, [ensureShareCard, shareCard, shareOpen]);

  useEffect(() => {
    if (!shellFlash) return;
    const id = window.setTimeout(() => setShellFlash(false), 400);
    return () => window.clearTimeout(id);
  }, [shellFlash]);

  const closeShare = useCallback(() => {
    setShareOpen(false);
    setShareMessage("");
  }, []);

  const handleDownload = useCallback(async () => {
    if (!latest || shareStatus === "busy") return;
    setShareStatus("busy");
    setShareMessage("");
    try {
      const blob = await ensureShareCard();
      downloadBlob(blob, shareCardFilename(file.date));
      setShareStatus("idle");
    } catch (error) {
      console.error(error);
      setShareStatus("error");
      setShareMessage(error instanceof Error ? error.message : "下载失败");
    }
  }, [ensureShareCard, file.date, latest, shareStatus]);

  const handleModalShare = useCallback(async () => {
    if (!latest || !shareCard || shareStatus === "busy") return;
    setShareStatus("busy");
    setShareMessage("");
    try {
      const cardFile = new File([shareCard], shareCardFilename(file.date), {
        type: "image/png",
      });
      const shareText = `今日金价 ${latest.value.toFixed(2)} 元/克`;
      const result = await shareCardFile(cardFile, "今日金价", shareText);
      if (result === "unsupported" || result === "failed") {
        setShareStatus("error");
        setShareMessage(
          result === "unsupported"
            ? "当前浏览器不支持直接分享，请使用下载"
            : "分享失败，请改用下载",
        );
        return;
      }
      setShareStatus("idle");
    } catch (error) {
      console.error(error);
      setShareStatus("error");
      setShareMessage(error instanceof Error ? error.message : "分享失败");
    }
  }, [file.date, latest, shareCard, shareStatus]);

  const handleModalDownload = useCallback(() => {
    if (!shareCard) return;
    downloadBlob(shareCard, shareCardFilename(file.date));
  }, [file.date, shareCard]);

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
              className="icon-button"
              onClick={() => void handleDownload()}
              disabled={shareStatus === "busy"}
              aria-label="下载分享卡片"
              title="下载分享卡片"
            >
              <DownloadIcon />
            </button>
            <button
              type="button"
              className="icon-button"
              onPointerDown={warmShareCard}
              onClick={openShare}
              disabled={shareStatus === "busy"}
              aria-label="分享"
              title="分享"
            >
              <ShareIcon />
            </button>
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

      {shellFlash ? (
        <div className="shell-flash" aria-hidden="true" />
      ) : null}

      {shareOpen ? (
        <ShareModal
          blob={shareCard}
          canShare={canShare}
          busy={shareStatus === "busy"}
          message={shareMessage}
          tone={shareStatus === "error" ? "error" : "info"}
          onClose={closeShare}
          onDownload={handleModalDownload}
          onShare={() => void handleModalShare()}
        />
      ) : null}
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
      <span className="market-header__source">{source}</span>
      <button
        type="button"
        className="icon-button market-header__theme"
        onClick={onToggleTheme}
        aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
        title={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
      >
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </button>
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

function ShareModal({
  blob,
  canShare,
  busy,
  message,
  tone,
  onClose,
  onDownload,
  onShare,
}: {
  blob: Blob | null;
  canShare: boolean;
  busy: boolean;
  message: string;
  tone: "error" | "info";
  onClose: () => void;
  onDownload: () => void;
  onShare: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="share-modal-backdrop" onClick={onClose}>
      <div
        className="share-modal"
        role="dialog"
        aria-modal="true"
        aria-label="分享今日金价"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="icon-button share-modal__close"
          onClick={onClose}
          aria-label="关闭"
          title="关闭"
        >
          <CloseIcon />
        </button>
        {previewUrl ? (
          <img
            className="share-modal__preview"
            src={previewUrl}
            alt="今日金价分享卡片"
          />
        ) : (
          <p className="share-modal__loading">正在生成分享卡片…</p>
        )}
        <div className="share-modal__actions">
          {canShare ? (
            <button
              type="button"
              className="icon-button"
              onClick={onShare}
              disabled={busy}
              aria-label="分享到系统"
              title="分享"
            >
              <ShareIcon />
            </button>
          ) : null}
          <button
            type="button"
            className="icon-button"
            onClick={onDownload}
            disabled={busy || !blob}
            aria-label="下载卡片"
            title="下载"
          >
            <DownloadIcon />
          </button>
        </div>
        {message ? (
          <p
            className="share-feedback share-modal__message"
            role="status"
            data-tone={tone}
          >
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

export default PriceDashboard;
