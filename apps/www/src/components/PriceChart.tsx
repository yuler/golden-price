import { useEffect, useMemo, useState } from "react";
import { Liveline } from "liveline";
import type { PriceObservation } from "../lib/prices";

interface PriceChartProps {
  observations: PriceObservation[];
  latestValue: number;
  summary: string;
  theme?: "light" | "dark";
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function PriceChart({
  observations,
  latestValue,
  summary,
  theme = "dark",
}: PriceChartProps) {
  const reducedMotion = useReducedMotion();
  const windowSeconds = useMemo(() => {
    const first = observations[0]?.time ?? Date.now() / 1000;
    return Math.max(60 * 60, Math.ceil(Date.now() / 1000 - first + 15 * 60));
  }, [observations]);
  const lineColor = theme === "light" ? "#9a7410" : "#edc652";

  return (
    <div className="price-chart" role="img" aria-label={summary}>
      <Liveline
        data={observations}
        value={latestValue}
        theme={theme}
        color={lineColor}
        window={windowSeconds}
        grid
        fill
        scrub
        exaggerate
        badge={false}
        momentum={false}
        pulse={false}
        paused
        degen={false}
        showValue={false}
        lerpSpeed={reducedMotion ? 1 : 0.08}
        formatValue={(value) => `${value.toFixed(2)} 元/克`}
        formatTime={(timestamp) =>
          timeFormatter.format(new Date(timestamp * 1000))
        }
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
