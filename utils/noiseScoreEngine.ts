import { 
  NOISE_SCORE_THRESHOLD_DBFS, 
  NOISE_SCORE_MAX_SEGMENTS_PER_MIN,
  NOISE_SCORE_SEGMENT_MERGE_GAP_MS
} from "../constants";
import { NoiseSliceRawStats, NoiseScoreBreakdown } from "../types";
import { clamp01 } from "../services/noiseMath";

/**
 * 计算噪音评分（0-100 分）
 * 
 * 根据技术规格计算噪音评分，采用三维度加权扣分制
 * 
 * 惩罚模型 (Penalty Model):
 * 1. 持续噪音 (Sustained Noise - p50): 权重 40%
 *    - 如果中位数值 (p50) 超过阈值 6dB，则该项扣满分
 *    - 反映环境的底噪水平，持续的风扇声或交谈声会拉低分数
 * 2. 超过阈值时长比例 (Time Penalty): 权重 30%
 *    - 如果超过 30% 的时间高于阈值，则该项扣满分
 *    - 反映环境的"纯净度"，即使是 0.1 秒的尖叫也会被精确计入
 * 3. 干扰频率 (Interruption Frequency - Segments): 权重 30%
 *    - 如果每分钟超过 6 次干扰事件，则该项扣满分
 *    - 反映环境的干扰频率，频繁的打断比连续的噪音更易打断心流
 * 
 * 最终得分公式：Score = 100 × (1 - TotalPenalty)
 * 其中 TotalPenalty = 0.4 × P_sustained + 0.3 × P_time + 0.3 × P_segment
 * 
 * @param raw 原始统计数据（基于 dBFS）
 * @param durationMs 切片持续时间（毫秒）
 * @returns 包含总分和详细得分情况的对象
 */
export function computeNoiseSliceScore(
  raw: NoiseSliceRawStats,
  durationMs: number
): { score: number; scoreDetail: NoiseScoreBreakdown } {
  
  // ==================== 1. 持续噪音惩罚 (40%) ====================
  // 
  // 计算中位数与阈值的差值，如果超过 6dB 则该项扣满分
  // 中位数反映环境的底噪水平，剔除突发噪音的影响
  // 
  // 公式：P_sustained = clamp01((p50Dbfs - threshold) / 6)
  const sustainedDiff = Math.max(0, raw.p50Dbfs - NOISE_SCORE_THRESHOLD_DBFS);
  const sustainedPenalty = clamp01(sustainedDiff / 6);

  // ==================== 2. 时长占比惩罚 (30%) ====================
  // 
  // 计算超过阈值的时间比例，如果超过 30% 则该项扣满分
  // 反映环境的"纯净度"，即使是 0.1 秒的尖叫也会被精确计入
  // 
  // 公式：P_time = clamp01(overRatioDbfs / 0.3)
  const timePenalty = clamp01(raw.overRatioDbfs / 0.3);

  // ==================== 3. 干扰频率惩罚 (30%) ====================
  // 
  // 计算每分钟的噪音事件数，如果超过 6 次/分钟则该项扣满分
  // 反映环境的干扰频率，频繁的打断比连续的噪音更易打断心流
  // 
  // 公式：P_segment = clamp01((segmentsPerMin) / maxSegmentsPerMin)
  const effectiveDurationMs = raw.sampledDurationMs && raw.sampledDurationMs > 0 
    ? raw.sampledDurationMs 
    : durationMs;
    
  const minutes = Math.max(1e-6, effectiveDurationMs / 60000);
  const segmentsPerMin = raw.segmentCount / minutes;
  const segmentPenalty = clamp01(segmentsPerMin / Math.max(1e-6, NOISE_SCORE_MAX_SEGMENTS_PER_MIN));

  // ==================== 加权总和 ====================
  // 
  // 将三个维度的惩罚系数按权重相加
  // TotalPenalty = 0.4 × P_sustained + 0.3 × P_time + 0.3 × P_segment
  const totalPenalty = (0.4 * sustainedPenalty) + (0.3 * timePenalty) + (0.3 * segmentPenalty);
  
  // ==================== 最终得分 ====================
  // 
  // 从满分 100 分中扣除总惩罚
  // Score = 100 × (1 - TotalPenalty)
  const scoreRaw = 100 * (1 - totalPenalty);
  const score = Math.max(0, Math.min(100, Math.round(scoreRaw * 10) / 10));

  // ==================== 返回结果 ====================
  return {
    score,
    scoreDetail: {
      sustainedPenalty,      // 持续噪音惩罚系数 (0-1)
      timePenalty,           // 时长占比惩罚系数 (0-1)
      segmentPenalty,        // 干扰频率惩罚系数 (0-1)
      thresholdsUsed: {
        scoreThresholdDbfs: NOISE_SCORE_THRESHOLD_DBFS,      // 使用的评分阈值
        segmentMergeGapMs: NOISE_SCORE_SEGMENT_MERGE_GAP_MS, // 使用的合并间隔
        maxSegmentsPerMin: NOISE_SCORE_MAX_SEGMENTS_PER_MIN, // 使用的最大事件段数
      },
      sustainedLevelDbfs: raw.p50Dbfs,    // 持续电平（中位数）
      overRatioDbfs: raw.overRatioDbfs,   // 超阈值比例
      segmentCount: raw.segmentCount,       // 事件段数量
      minutes,                             // 时长（分钟）
      durationMs,                          // 物理时长（毫秒）
      sampledDurationMs: raw.sampledDurationMs, // 采样时长（毫秒）
      coverageRatio: raw.sampledDurationMs ? (raw.sampledDurationMs / durationMs) : 1 // 覆盖率
    }
  };
}
