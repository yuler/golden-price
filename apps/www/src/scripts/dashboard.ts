import * as echarts from "echarts";
import { bindChartResize, renderPriceChart } from "../lib/chart";
import {
  dataUrl,
  latestPrice,
  manifestUrl,
  type DataManifest,
  type DailyPriceFile,
} from "../lib/prices";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element #${id}`);
  }
  return element as T;
}

function requireSelect(id: string): HTMLSelectElement {
  return requireElement<HTMLSelectElement>(id);
}

export async function initDashboard(): Promise<void> {
  const base = import.meta.env.BASE_URL;
  const channelSelect = requireSelect("channel-select");
  const dateSelect = requireSelect("date-select");
  const latestValue = requireElement<HTMLElement>("latest-value");
  const latestMeta = requireElement<HTMLElement>("latest-meta");
  const statusEl = requireElement<HTMLElement>("status");
  const chartEl = requireElement<HTMLElement>("chart");

  let manifest: DataManifest | null = null;
  let chart: echarts.ECharts | null = null;
  let unbindResize: (() => void) | null = null;

  const setStatus = (message: string) => {
    statusEl.textContent = message;
  };

  const setLatest = (value: string, meta: string) => {
    latestValue.textContent = value;
    latestMeta.textContent = meta;
  };

  const fillSelect = (
    select: HTMLSelectElement,
    options: { value: string; label: string }[],
    selected: string,
  ) => {
    select.replaceChildren();
    for (const option of options) {
      const el = document.createElement("option");
      el.value = option.value;
      el.textContent = option.label;
      if (option.value === selected) el.selected = true;
      select.appendChild(el);
    }
    select.disabled = options.length === 0;
  };

  const loadDailyFile = async (
    channelId: string,
    date: string,
  ): Promise<DailyPriceFile> => {
    const response = await fetch(dataUrl(base, channelId, date));
    if (!response.ok) {
      throw new Error(
        `Failed to load ${channelId}/${date}.json (${response.status})`,
      );
    }
    return response.json() as Promise<DailyPriceFile>;
  };

  const renderForSelection = async () => {
    const channelId = channelSelect.value;
    const date = dateSelect.value;
    if (!channelId || !date) {
      setLatest("—", "No data available");
      setStatus("No price data for the selected channel.");
      if (chart) {
        chart.dispose();
        chart = null;
      }
      return;
    }

    setStatus(`Loading ${channelId} · ${date}…`);
    try {
      const file = await loadDailyFile(channelId, date);
      const latest = latestPrice(file);

      if (latest) {
        setLatest(
          `${latest.value.toFixed(2)}`,
          `${date} ${latest.time} (Asia/Shanghai)`,
        );
      } else {
        setLatest("—", `No recorded prices on ${date}`);
      }

      if (unbindResize) {
        unbindResize();
        unbindResize = null;
      }
      if (chart) {
        chart.dispose();
      }

      chart = renderPriceChart(chartEl, file);
      unbindResize = bindChartResize(chart);
      setStatus("");
    } catch (error) {
      setLatest("—", "Failed to load data");
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  try {
    const response = await fetch(manifestUrl(base));
    if (!response.ok) {
      throw new Error(`Failed to load manifest (${response.status})`);
    }
    manifest = (await response.json()) as DataManifest;

    const channels = manifest.channels ?? [];
    if (channels.length === 0) {
      fillSelect(channelSelect, [], "");
      fillSelect(dateSelect, [], "");
      setLatest("—", "No data yet");
      setStatus("Run the CLI (`pnpm cli:collect`) to populate data/.");
      return;
    }

    const defaultChannel =
      channels.find((c) => c.id === "jingjinjin.cn") ?? channels[0];

    fillSelect(
      channelSelect,
      channels.map((c) => ({ value: c.id, label: c.id })),
      defaultChannel.id,
    );

    const dates = defaultChannel.dates;
    const defaultDate = defaultChannel.latestDate ?? dates.at(-1) ?? "";
    fillSelect(
      dateSelect,
      dates.map((d) => ({ value: d, label: d })),
      defaultDate,
    );

    channelSelect.addEventListener("change", () => {
      if (!manifest) return;
      const channel = manifest.channels.find((c) => c.id === channelSelect.value);
      const nextDates = channel?.dates ?? [];
      const nextDate = channel?.latestDate ?? nextDates.at(-1) ?? "";
      fillSelect(
        dateSelect,
        nextDates.map((d) => ({ value: d, label: d })),
        nextDate,
      );
      void renderForSelection();
    });

    dateSelect.addEventListener("change", () => {
      void renderForSelection();
    });

    await renderForSelection();
  } catch (error) {
    setLatest("—", "Failed to load manifest");
    setStatus(error instanceof Error ? error.message : String(error));
  }
}
