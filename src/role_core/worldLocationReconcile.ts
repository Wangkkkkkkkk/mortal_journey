/**
 * 地点归并与扁平化工具（纯函数）。
 *
 * 修复"回到旧地点生成新地点"问题：AI 每次返回的地点字符串存在微调（"外门" vs "外门区域"），
 * 叠加 worldMapStore 用精确字符串 key，导致重复分支。
 *
 * 策略：
 *   1. 归一化（trim + 压缩内部空白）
 *   2. 逐级匹配：先精确，后包含（同一父级下，AI 输出与既有项互为子/超串则复用既有 key）
 */

import type { WorldLocation } from "./types/worldLocation";
import type { LocationTree } from "./worldMapStore";

/** 归一化单个字符串字段：trim + 压缩连续空白。 */
function normalizeField(s: string | undefined | null): string {
  return String(s ?? "").trim().replace(/\s+/g, "");
}

/** 归一化整个 WorldLocation（返回新对象）。 */
export function normalizeLocation(loc: WorldLocation | null | undefined): WorldLocation {
  return {
    region: normalizeField(loc?.region),
    country: normalizeField(loc?.country),
    area: normalizeField(loc?.area),
    detail: normalizeField(loc?.detail),
  };
}

/**
 * 把 locationTree 扁平化为 `region-country-area-detail` 字符串列表。
 * 供状态 AI 上下文注入，让其逐字复用既有字符串。可选按 region/country 过滤以控制体积。
 */
export function flattenLocationTree(
  tree: LocationTree | null | undefined,
  options?: { onlyRegion?: string; onlyCountry?: string },
): string[] {
  if (!tree || typeof tree !== "object") return [];
  const out: string[] = [];
  const regions = options?.onlyRegion ? [options.onlyRegion] : Object.keys(tree);
  for (const region of regions) {
    if (!tree[region]) continue;
    const countries = options?.onlyCountry ? [options.onlyCountry] : Object.keys(tree[region]);
    for (const country of countries) {
      const areas = tree[region]?.[country];
      if (!areas) continue;
      for (const area of Object.keys(areas)) {
        const details = areas[area];
        if (Array.isArray(details) && details.length > 0) {
          for (const detail of details) {
            out.push([region, country, area, detail].join("-"));
          }
        } else {
          out.push([region, country, area, ""].join("-"));
        }
      }
    }
  }
  return out;
}

/**
 * 在同级候选集合里找一个与 input 匹配的既有项。
 * 匹配优先级：精确 > 包含（互为子/超串）。返回既有项或 undefined。
 */
function matchTier(input: string, candidates: string[]): string | undefined {
  if (!input) return undefined;
  // 1. 精确（归一化后输入已在调用方完成；候选项假定也已归一化）
  if (candidates.includes(input)) return input;
  // 2. 包含匹配：input 包含候选，或候选包含 input。
  //    取最长匹配项以减少误并（如同时命中"外门"和"外门别院"时优先更具体的）。
  let best: string | undefined;
  for (const c of candidates) {
    if (!c) continue;
    if (input.includes(c) || c.includes(input)) {
      if (!best || c.length > best.length) best = c;
    }
  }
  return best;
}

/**
 * 把 AI 输出的地点归并到已注册地点树上：逐级匹配，命中则复用既有规范 key。
 * 未命中的层级保留归一化后的输入值（视为新地点）。
 *
 * @param loc AI 输出的地点（会先归一化）。
 * @param tree 当前已注册地点树。
 * @returns 归并后的 WorldLocation（尽量复用既有 key，避免重复分支）。
 */
export function reconcileLocation(
  loc: WorldLocation | null | undefined,
  tree: LocationTree | null | undefined,
): WorldLocation {
  const n = normalizeLocation(loc);
  if (!n.region) return n;
  const t = tree && typeof tree === "object" ? tree : {};

  // region 级
  const regions = Object.keys(t);
  const matchedRegion = matchTier(n.region, regions);
  const region = matchedRegion ?? n.region;

  // country 级（在匹配到的 region 下）
  const countries = matchedRegion && t[region] ? Object.keys(t[region]) : [];
  const matchedCountry = matchTier(n.country, countries);
  const country = matchedCountry ?? n.country;

  // area 级（在匹配到的 region/country 下）
  const areas = matchedCountry && t[region]?.[country] ? Object.keys(t[region][country]) : [];
  const matchedArea = matchTier(n.area, areas);
  const area = matchedArea ?? n.area;

  // detail 级（在匹配到的 region/country/area 下）
  const details =
    matchedArea && t[region]?.[country]?.[area] ? t[region][country][area] : [];
  const matchedDetail = matchTier(n.detail, details.filter(Boolean));
  const detail = matchedDetail ?? n.detail;

  return { region, country, area, detail };
}
