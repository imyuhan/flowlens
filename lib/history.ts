/**
 * 本地历史记录存储
 *
 * 全部数据仅存于浏览器 localStorage，不上传服务端（spec N9）。
 * 所有操作**都不抛出**：隐私模式禁用存储、配额写满、已存数据损坏
 * 都退化为「历史不可用」，不影响分析功能本身（spec N11）。
 */

import type { AnalysisOutcome, HistoryEntry } from "./types";

const STORAGE_KEY = "flowlens:history";

/** 历史记录条数上限，超出淘汰最旧（spec F11） */
export const HISTORY_LIMIT = 50;

/** 生成条目 id；crypto.randomUUID 不可用时回退到时间戳 + 随机串 */
function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 取得 localStorage；不可用（SSR / 隐私模式 / 被禁用）时返回 null */
function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    // 某些浏览器在禁用存储时，读取该属性本身就会抛出
    return null;
  }
}

/** 判断一条已存记录的结构是否可用 */
function isValidEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<HistoryEntry>;
  if (typeof entry.id !== "string" || typeof entry.input !== "string") return false;
  if (typeof entry.createdAt !== "number") return false;

  const outcome = entry.outcome as Partial<AnalysisOutcome> | undefined;
  if (typeof outcome !== "object" || outcome === null) return false;
  if (outcome.source !== "llm" && outcome.source !== "rules") return false;

  const result = outcome.result;
  return typeof result === "object" && result !== null && Array.isArray(result.tasks);
}

/** 写回列表；失败返回 false */
function persist(storage: Storage, entries: HistoryEntry[]): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(entries));
    return true;
  } catch {
    // 配额写满或被拒绝
    return false;
  }
}

/** 历史功能当前是否可用 */
export function isAvailable(): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    const probe = "__flowlens_probe__";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/** 读取全部历史，按时间倒序；数据损坏时丢弃重建并返回空数组 */
export function load(): HistoryEntry[] {
  const storage = getStorage();
  if (!storage) return [];

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      storage.removeItem(STORAGE_KEY);
      return [];
    }

    const entries = parsed.filter(isValidEntry);
    // 有条目被判为损坏时，顺手把清理后的版本写回
    if (entries.length !== parsed.length) {
      persist(storage, entries);
    }
    return entries;
  } catch {
    // JSON 解析失败：丢弃损坏数据，避免之后每次读取都失败
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      /* 移除也失败时无能为力，忽略 */
    }
    return [];
  }
}

/** 保存一条记录，返回更新后的列表（时间倒序） */
export function save(input: string, outcome: AnalysisOutcome): HistoryEntry[] {
  const storage = getStorage();
  if (!storage) return [];

  const entry: HistoryEntry = {
    id: createId(),
    createdAt: Date.now(),
    input,
    outcome,
  };

  // 最新在前；超出上限时从尾部淘汰最旧
  const next = [entry, ...load()].slice(0, HISTORY_LIMIT);
  return persist(storage, next) ? next : load();
}

/** 删除单条，返回更新后的列表 */
export function remove(id: string): HistoryEntry[] {
  const storage = getStorage();
  if (!storage) return [];

  const next = load().filter((entry) => entry.id !== id);
  return persist(storage, next) ? next : load();
}

/** 清空全部历史 */
export function clear(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* 清理失败时静默忽略 */
  }
}
