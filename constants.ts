// 第8部分：配置参数

// ==================== 分析常量 ====================

/**
 * 每个切片的时长（秒）
 * 切片是噪音统计的基本时间单位，每个切片会计算一次完整的统计指标和评分
 */
export const NOISE_ANALYSIS_SLICE_SEC = 30;

/**
 * 每帧的间隔时间（毫秒）
 * 约 20fps 的采样率，用于实时音频数据处理
 * 较高的采样率可以更准确地捕捉突发噪音，但会增加 CPU 负载
 */
export const NOISE_ANALYSIS_FRAME_MS = 50;

/**
 * 评分阈值（dBFS）
 * 用于判断噪音是否超过阈值的基准值
 * 超过此值的帧会被计入"超阈时长"统计
 * 注意：此值仅用于评分，与显示分贝阈值（maxLevelDb）是不同的概念
 */
export const NOISE_SCORE_THRESHOLD_DBFS = -50;

/**
 * 噪音事件合并间隔（毫秒）
 * 用于智能合并相邻的噪音事件
 * 如果两次超阈值事件间隔小于此值，会被合并为同一个噪音事件段
 * 例如：拉椅子的一连串声音会被合并为一次打断
 */
export const NOISE_SCORE_SEGMENT_MERGE_GAP_MS = 500;

/**
 * 每分钟最大噪音事件数
 * 打断频次惩罚的饱和上限
 * 当每分钟噪音事件数达到此值时，该项惩罚达到满分（1.0）
 */
export const NOISE_SCORE_MAX_SEGMENTS_PER_MIN = 6;

// ==================== 物理/极限值 ====================

/**
 * dBFS 的最小可能值
 * 数字音频的物理最小值，表示完全静音
 */
export const DBFS_MIN_POSSIBLE = -100;

/**
 * dBFS 的最大可能值
 * 数字音频的物理最大值，表示满刻度
 */
export const DBFS_MAX_POSSIBLE = 0;

/**
 * 静音底噪阈值（dBFS）
 * 低于此值的帧被视为静音/无效信号，不参与统计
 * 用于过滤设备底噪和无效数据
 */
export const INVALID_DBFS_THRESHOLD = -90;

// ==================== 显示默认值 ====================

/**
 * 默认显示基准分贝（dB）
 * 用于校准显示分贝的基准值
 * 通常设置为安静房间的分贝值（如 40dB）
 */
export const DEFAULT_DISPLAY_BASELINE_DB = 40;

/**
 * 默认显示最大分贝（dB）
 * 显示分贝的上限，用于 UI 展示
 */
export const DEFAULT_DISPLAY_MAX_DB = 100;

// ==================== 存储 ====================

/**
 * 噪音切片数据的存储键
 * 用于在 localStorage 中存储历史噪音数据
 */
export const STORAGE_KEY = "noise-slices-v2";
