export interface WorldLocation {
  region: string;
  country: string;
  area: string;
  detail: string;
}

export function formatWorldLocation(loc: WorldLocation | null | undefined): string {
  if (!loc) return "";
  return [loc.region, loc.country, loc.area, loc.detail].filter(Boolean).join(" > ");
}

export function formatWorldLocationDash(loc: WorldLocation | null | undefined): string {
  if (!loc) return "";
  return [loc.region, loc.country, loc.area, loc.detail].filter(Boolean).join("-");
}

export function parseWorldLocationFromDash(raw: string): WorldLocation | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  // 逐段 trim（修复「段内含尾随空格导致精确比较失败」）。
  const parts = s.split("-").map((p) => p.trim());
  if (parts.length < 4) {
    const padded = [...parts];
    while (padded.length < 4) padded.push("");
    return {
      region: padded[0] ?? "",
      country: padded[1] ?? "",
      area: padded[2] ?? "",
      detail: padded[3] ?? "",
    };
  }
  return {
    region: parts[0] ?? "",
    country: parts[1] ?? "",
    area: parts[2] ?? "",
    detail: parts[3] ?? "",
  };
}

/** 逐字段归一化（trim + 去内部空白），用于宽容比较。 */
export function normalizeWorldLocationField(s: string): string {
  return (s ?? "").trim().replace(/\s+/g, "");
}

export function isWorldLocationEqual(
  a: WorldLocation | null | undefined,
  b: WorldLocation | null | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.region === b.region &&
    a.country === b.country &&
    a.area === b.area &&
    a.detail === b.detail
  );
}

/**
 * 归一化宽容比较（逐字段 trim + 去内部空白）。
 * 用于 NPC 地点查询 / 休眠唤醒 / 世界地图等成员判定，兼容历史存档与 AI 输出的微差。
 */
export function isWorldLocationEqualNormalized(
  a: WorldLocation | null | undefined,
  b: WorldLocation | null | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    normalizeWorldLocationField(a.region) === normalizeWorldLocationField(b.region) &&
    normalizeWorldLocationField(a.country) === normalizeWorldLocationField(b.country) &&
    normalizeWorldLocationField(a.area) === normalizeWorldLocationField(b.area) &&
    normalizeWorldLocationField(a.detail) === normalizeWorldLocationField(b.detail)
  );
}

export function isEmptyWorldLocation(loc: WorldLocation | null | undefined): boolean {
  if (!loc) return true;
  return !loc.region && !loc.country && !loc.area && !loc.detail;
}
