import { NoiseControlSettings } from "../types";
import {
  NOISE_ANALYSIS_SLICE_SEC,
  NOISE_ANALYSIS_FRAME_MS,
  NOISE_SCORE_THRESHOLD_DBFS,
  NOISE_SCORE_SEGMENT_MERGE_GAP_MS,
  NOISE_SCORE_MAX_SEGMENTS_PER_MIN,
  DEFAULT_DISPLAY_BASELINE_DB,
} from "../constants";

/**
 * 默认噪音控制设置
 * 
 * 包含所有可配置参数的默认值
 * 部分参数（如 sliceSec、frameMs 等）被固定为常量，以确保评分口径稳定
 */
const DEFAULT_SETTINGS: NoiseControlSettings = {
  maxLevelDb: 55,                          // UI 最大分贝，超过此值显示为嘈杂
  baselineDb: DEFAULT_DISPLAY_BASELINE_DB,    // UI 基准分贝，用于校准显示分贝
  showRealtimeDb: true,                      // 是否显示实时分贝值
  avgWindowSec: 1,                          // 平均窗口时长（秒）
  sliceSec: NOISE_ANALYSIS_SLICE_SEC,        // 切片时长（秒），固定为 30 秒
  frameMs: NOISE_ANALYSIS_FRAME_MS,          // 帧间隔（毫秒），固定为 50ms
  scoreThresholdDbfs: NOISE_SCORE_THRESHOLD_DBFS, // 评分阈值（dBFS），固定为 -50 dBFS
  segmentMergeGapMs: NOISE_SCORE_SEGMENT_MERGE_GAP_MS, // 噪音事件合并间隔（毫秒），固定为 500ms
  maxSegmentsPerMin: NOISE_SCORE_MAX_SEGMENTS_PER_MIN, // 每分钟最大噪音事件数，固定为 6
  alertSoundEnabled: false,                  // 启用警报音，超过阈值时播放提示音
};

/** LocalStorage 存储键 */
const STORAGE_KEY = "noise-control-settings";

/** 设置更新事件名称 */
export const SETTINGS_UPDATED_EVENT = "NoiseControlSettingsUpdated";

/**
 * 获取噪音控制设置
 * 
 * 从 LocalStorage 读取用户保存的设置，如果不存在则返回默认设置
 * 
 * @returns 噪音控制设置对象
 */
export function getNoiseControlSettings(): NoiseControlSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      // 合并默认设置和用户保存的设置
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.warn("Failed to load settings", e);
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * 保存噪音控制设置
 * 
 * 保存设置到 LocalStorage，并触发设置更新事件
 * 
 * 重要：为确保评分口径稳定，以下参数会被强制固定为程序内常量：
 * - sliceSec（切片时长）
 * - frameMs（帧间隔）
 * - scoreThresholdDbfs（评分阈值）
 * - segmentMergeGapMs（事件段合并间隔）
 * - maxSegmentsPerMin（每分钟最大事件段数）
 * 
 * 这样可以防止用户通过调整参数"刷分"
 * 
 * @param settings 部分设置对象，只需要提供要更新的字段
 */
export function saveNoiseControlSettings(settings: Partial<NoiseControlSettings>): void {
  const current = getNoiseControlSettings();
  const next = { ...current, ...settings };
  
  // 强制固定参数以保持一致性（依据技术文档 9.2.1 章节）
  // 这些参数固定为常量，确保评分口径稳定，防止用户通过调整参数"刷分"
  next.sliceSec = NOISE_ANALYSIS_SLICE_SEC;
  next.frameMs = NOISE_ANALYSIS_FRAME_MS;
  next.scoreThresholdDbfs = NOISE_SCORE_THRESHOLD_DBFS;
  next.segmentMergeGapMs = NOISE_SCORE_SEGMENT_MERGE_GAP_MS;
  next.maxSegmentsPerMin = NOISE_SCORE_MAX_SEGMENTS_PER_MIN;

  // 保存到 LocalStorage
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  
  // 触发设置更新事件，通知所有订阅者
  window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT, { detail: next }));
}

/**
 * 重置噪音控制设置为默认值
 * 
 * 从 LocalStorage 删除用户保存的设置，并触发设置更新事件
 * 所有参数将恢复为默认值
 */
export function resetNoiseControlSettings(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT, { detail: DEFAULT_SETTINGS }));
}

/**
 * 订阅设置变更事件
 * 
 * 使用观察者模式，当设置发生变化时自动通知订阅者
 * 
 * @param handler 事件处理函数，接收包含新设置的自定义事件
 * @returns 取消订阅的函数，调用后停止接收事件
 */
export function subscribeSettingsEvent(
  handler: (evt: CustomEvent<NoiseControlSettings>) => void
): () => void {
  const wrapper = (e: Event) => handler(e as CustomEvent<NoiseControlSettings>);
  window.addEventListener(SETTINGS_UPDATED_EVENT, wrapper);
  return () => window.removeEventListener(SETTINGS_UPDATED_EVENT, wrapper);
}
