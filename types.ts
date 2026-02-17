// 第9部分：类型定义

/**
 * 噪音帧采样数据
 * 表示单次音频采样的结果，包含时间戳和音频指标
 */
export interface NoiseFrameSample {
  t: number;        // 时间戳（毫秒）
  rms: number;      // 均方根值 (Root Mean Square)，衡量音频信号强度的标准方法
  dbfs: number;     // 满量程相对分贝 (-100 到 0)，数字音频的标准分贝单位
  peak?: number;    // 峰值振幅，用于检测突发噪音
}

/**
 * 噪音切片原始统计数据
 * 表示一个时间窗口（默认30秒）内的噪音统计指标，所有数据基于原始 dBFS 计算
 */
export interface NoiseSliceRawStats {
  avgDbfs: number;              // 能量平均 dBFS，在线性域（RMS）上做平均后转回 dBFS
  maxDbfs: number;              // 最大 dBFS，所有帧 dBFS 的最大值
  p50Dbfs: number;              // 中位数 dBFS，在线性域计算分位数后转回 dBFS，反映环境底噪水平
  p95Dbfs: number;              // 95% 分位数 dBFS，反映噪音峰值水平
  overRatioDbfs: number;        // 超过评分阈值的时间比例，范围 0-1
  segmentCount: number;         // 离散噪音事件数量，通过合并窗口（500ms）合并后的独立事件数
  sampledDurationMs?: number;   // 有效采样时长（毫秒），排除数据缺口后的实际采样时间
  gapCount?: number;            // 数据缺失次数，检测到的数据缺口数量
  maxGapMs?: number;            // 最大数据缺失时长（毫秒），最长的数据缺口时间
}

/**
 * 噪音切片显示统计数据
 * 用于用户界面展示的统计数据，已应用校准机制
 */
export interface NoiseSliceDisplayStats {
  avgDb: number;    // 显示平均分贝（已校准），范围 20-100 dB，用于 UI 展示
  p95Db: number;    // 显示 P95 分贝（已校准），反映噪音峰值水平
}

/**
 * 噪音评分明细
 * 包含评分的详细计算过程和各项惩罚系数
 */
export interface NoiseScoreBreakdown {
  sustainedPenalty: number;      // 持续噪音惩罚（基于 p50），权重 40%，范围 0-1
  timePenalty: number;           // 时长占比惩罚（超过阈值的时间），权重 30%，范围 0-1
  segmentPenalty: number;        // 频繁中断惩罚（噪音事件次数），权重 30%，范围 0-1
  thresholdsUsed: {
    scoreThresholdDbfs: number;      // 使用的评分阈值（dBFS），默认 -50 dBFS
    segmentMergeGapMs: number;       // 使用的合并间隔（毫秒），默认 500ms
    maxSegmentsPerMin: number;       // 使用的最大事件段数（每分钟），默认 6
  };
  sustainedLevelDbfs: number;    // 持续电平（p50Dbfs），用于计算持续噪音惩罚
  overRatioDbfs: number;         // 超阈值比例，用于计算时长占比惩罚
  segmentCount: number;          // 事件段数量，用于计算中断频率惩罚
  minutes: number;              // 时长（分钟），用于计算每分钟事件段数
  durationMs?: number;           // 物理时长（毫秒），切片的实际时间跨度
  sampledDurationMs?: number;    // 采样时长（毫秒），有效采样时间
  coverageRatio?: number;        // 覆盖率，有效采样时长占物理时长的比例
}

/**
 * 噪音切片摘要
 * 表示一个完整时间窗口的噪音监测结果，包含原始统计、显示统计和评分
 */
export interface NoiseSliceSummary {
  id: string;                         // UUID，用于 React 列表键，确保唯一性
  start: number;                      // 开始时间戳（毫秒）
  end: number;                        // 结束时间戳（毫秒）
  frames: number;                     // 总帧数，该切片内处理的音频帧总数
  raw: NoiseSliceRawStats;            // 原始统计数据，基于 dBFS 计算，用于评分
  display: NoiseSliceDisplayStats;    // UI 显示统计数据，已校准，用于展示
  score: number;                      // 最终评分（0-100），100 分为完美环境
  scoreDetail: NoiseScoreBreakdown;   // 评分详情，包含各项惩罚系数和计算过程
}

/**
 * 噪音实时数据点
 * 表示某一时刻的噪音数据，用于实时图表展示
 */
export interface NoiseRealtimePoint {
  t: number;        // 时间戳（毫秒）
  dbfs: number;     // 原始 dBFS 值，用于评分计算
  displayDb: number; // 显示分贝值（已校准），用于 UI 展示
}

/**
 * 噪音流状态枚举
 * 表示噪音监测服务的当前状态
 */
export type NoiseStreamStatus =
  | "initializing"      // 初始化中，正在启动音频采集
  | "active"            // 监测中，正在采集和处理音频数据
  | "paused"            // 已暂停，音频采集已停止
  | "permission-denied" // 权限被拒绝，无法访问麦克风
  | "error";            // 发生错误，音频采集出现异常

/**
 * 噪音流快照
 * 表示噪音监测服务在某一时刻的完整状态快照
 */
export interface NoiseStreamSnapshot {
  status: NoiseStreamStatus;              // 当前流状态
  currentDbfs: number;                    // 当前原始 dBFS 值
  currentDisplayDb: number;               // 当前显示分贝值（已校准）
  ringBuffer: NoiseRealtimePoint[];        // 环形缓冲区，包含最近约 10 秒的实时数据
  lastSlice: NoiseSliceSummary | null;    // 最新完成的切片摘要
  currentScore?: number;                  // 当前实时评分（0-100）
  currentScoreDetail?: NoiseScoreBreakdown; // 当前评分详情
}

/**
 * 噪音控制设置
 * 用户可配置的噪音监测参数
 */
export interface NoiseControlSettings {
  maxLevelDb: number;              // UI 最大分贝（默认 55），超过此值显示为嘈杂
  baselineDb: number;              // UI 基准分贝（默认 40），用于校准显示分贝
  showRealtimeDb: boolean;         // 是否显示实时分贝值
  avgWindowSec: number;            // 平均窗口时长（秒），用于计算平均分贝
  sliceSec: number;                // 切片时长（秒），固定为 30 秒
  frameMs: number;                 // 帧间隔（毫秒），固定为 50ms
  scoreThresholdDbfs: number;      // 评分阈值（dBFS），固定为 -50 dBFS
  segmentMergeGapMs: number;       // 噪音事件合并间隔（毫秒），固定为 500ms
  maxSegmentsPerMin: number;       // 每分钟最大噪音事件数，固定为 6
  alertSoundEnabled: boolean;      // 启用警报音，超过阈值时播放提示音
  baselineRms?: number;            // 对应基准分贝的校准 RMS 值，用于显示分贝映射
}