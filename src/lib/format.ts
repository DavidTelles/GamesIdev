const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

export const compactNumber = (value: number) => compact.format(value);
export const formatDate = (value: string) => date.format(new Date(value));

export function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours >= 1) return minutes % 60 ? `${compact.format(hours)}h ${minutes % 60}min` : `${compact.format(hours)}h`;
  return minutes >= 1 ? `${minutes}min` : `${Math.floor(totalSeconds)}s`;
}

export function popularityLabel(score: number): string | null {
  if (score >= 5000) return "On fire";
  if (score >= 500) return "Hot";
  if (score >= 50) return "Rising";
  return null;
}
