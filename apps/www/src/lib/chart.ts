import * as echarts from "echarts";
import type { DailyPriceFile } from "../lib/prices";
import { flattenDailyPrices } from "../lib/prices";

export function renderPriceChart(
  container: HTMLElement,
  file: DailyPriceFile,
): echarts.ECharts {
  const existing = echarts.getInstanceByDom(container);
  if (existing) existing.dispose();

  const chart = echarts.init(container);
  const points = flattenDailyPrices(file);
  const values = points.map((p) => p.value);
  const times = points.map((p) => p.time);

  chart.setOption({
    animation: false,
    grid: { left: 56, right: 24, top: 24, bottom: 48 },
    tooltip: {
      trigger: "axis",
      valueFormatter: (value: number | string) =>
        typeof value === "number" ? `${value.toFixed(2)} CNY/g` : "—",
    },
    xAxis: {
      type: "category",
      data: times,
      axisLabel: {
        interval: 17,
      },
    },
    yAxis: {
      type: "value",
      name: file.unit,
      scale: true,
      axisLabel: {
        formatter: (value: number) => value.toFixed(1),
      },
    },
    series: [
      {
        name: "Price",
        type: "line",
        connectNulls: false,
        showSymbol: false,
        smooth: false,
        data: values,
        lineStyle: { width: 2, color: "#c9a227" },
        itemStyle: { color: "#c9a227" },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(201, 162, 39, 0.25)" },
            { offset: 1, color: "rgba(201, 162, 39, 0.02)" },
          ]),
        },
      },
    ],
  });

  return chart;
}

export function bindChartResize(chart: echarts.ECharts): () => void {
  const onResize = () => chart.resize();
  window.addEventListener("resize", onResize);
  return () => window.removeEventListener("resize", onResize);
}
