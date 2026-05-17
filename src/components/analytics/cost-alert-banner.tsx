"use client";

const ALERT_THRESHOLD = 10;

interface CostAlertBannerProps {
  monthSpend: number;
}

export function CostAlertBanner({ monthSpend }: CostAlertBannerProps) {
  if (monthSpend <= ALERT_THRESHOLD) return null;

  return (
    <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
      ⚠ Monthly AI spend is ${monthSpend.toFixed(2)} — approaching your alert threshold.
    </div>
  );
}
