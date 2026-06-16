export const COLORS = {
  bg: '#0e1116',
  surface: '#1a1f29',
  surfaceAlt: '#222937',
  accent: '#4f8cff',
  text: '#e8ecf3',
  textDim: '#8b93a3',
  danger: '#ff6b6b',
  good: '#5dd97c',
  warn: '#f5c451',
};

export function statusColor(status: string): string {
  switch (status) {
    case 'running':
      return COLORS.warn;
    case 'done':
      return COLORS.good;
    case 'failed':
      return COLORS.danger;
    default:
      return COLORS.textDim;
  }
}

export function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
