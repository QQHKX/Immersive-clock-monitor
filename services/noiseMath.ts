import { DBFS_MAX_POSSIBLE, DBFS_MIN_POSSIBLE } from "../constants";

/**
 * 从 Float32Array 计算 RMS 和峰值
 * 
 * RMS（均方根）是衡量音频信号强度的标准方法，反映音频的平均能量水平
 * 峰值用于检测突发噪音，反映音频的最大振幅
 * 
 * @param data 音频时域数据 (Float32Array)，来自 AnalyserNode.getFloatTimeDomainData()
 * @returns 包含 rms 和 peak 的对象
 */
export function computeRmsAndPeak(data: Float32Array): { rms: number; peak: number } {
  let sum = 0;
  let peak = 0;
  
  // 遍历所有采样点，计算平方和和峰值
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    const av = Math.abs(v);
    if (av > peak) peak = av;  // 更新峰值
    sum += v * v;              // 累加平方值
  }
  
  // RMS = sqrt(平方和 / 采样点数)
  const rms = Math.sqrt(sum / Math.max(1, data.length));
  return { rms, peak };
}

/**
 * 将 RMS 转换为 dBFS（分贝满刻度）
 * 
 * dBFS 是数字音频的标准分贝单位，范围从 -100（静音）到 0（满刻度）
 * 转换公式：dBFS = 20 * log10(RMS)
 * 
 * @param rms 均方根值，范围通常在 0 到 1 之间
 * @returns dBFS 值，范围限制在 [-100, 0]
 */
export function computeDbfsFromRms(rms: number): number {
  // 防止 log10(0) 导致 -Infinity
  const safe = Math.max(1e-12, rms);
  const dbfs = 20 * Math.log10(safe);
  
  // 限制在物理可能的范围内
  return Math.max(DBFS_MIN_POSSIBLE, Math.min(DBFS_MAX_POSSIBLE, dbfs));
}

/**
 * 将 RMS 映射到显示分贝（已校准）
 * 
 * 此函数用于将原始 RMS 值转换为用户友好的显示分贝值
 * 通过校准机制，可以将任意 RMS 值映射到用户熟悉的分贝范围（如 20-100 dB）
 * 
 * 公式：displayDb = baselineDb + 20 * log10(rms / baselineRms)
 * 
 * @param params 计算参数对象
 * @param params.rms 当前 RMS 值
 * @param params.baselineRms 对应 baselineDb 的 RMS 值（校准基准）
 * @param params.baselineDb 基准分贝值（例如：安静房间为 40dB）
 * @returns 显示用的分贝值，范围限制在 [20, 100]
 */
export function computeDisplayDbFromRms(params: {
  rms: number;
  baselineRms: number; // 对应 baselineDb 的 RMS 值
  baselineDb: number;  // 例如：40dB
}): number {
  // 防止除零和 log10(0)
  const safeRms = Math.max(1e-12, params.rms);
  const safeBase = Math.max(1e-12, params.baselineRms);
  
  // 显示分贝 = 基准分贝 + 20 * log10(rms / 基准rms)
  // 这样当 rms == baselineRms 时，displayDb == baselineDb
  const displayDb = params.baselineDb + 20 * Math.log10(safeRms / safeBase);
  
  // 限制在用户友好的显示范围内
  return Math.max(20, Math.min(100, displayDb));
}

/**
 * 计算 dBFS 数组的能量平均值（线性域平均）
 * 
 * 此函数在功率域（线性域）上计算平均值，符合能量守恒定律
 * 先将 dBFS 转换为功率（10^(dB/10)），计算平均功率，再转换回 dBFS
 * 
 * 公式：avgDbfs = 10 * log10(mean(10^(dBFS_i / 10)))
 * 
 * @param dbfsArr dBFS 值数组
 * @returns 平均 dBFS 值，范围限制在 [-100, 0]
 */
export function computeAvgDbfsFromDbfsArray(dbfsArr: number[]): number {
  if (dbfsArr.length === 0) return DBFS_MIN_POSSIBLE;
  
  // 将每个 dBFS 转换为功率：10^(dB/10)，然后求和
  const sumPower = dbfsArr.reduce((s, db) => s + Math.pow(10, db / 10), 0);
  const meanPower = sumPower / dbfsArr.length; // 平均功率
  
  // 将平均功率转换回 dBFS：10 * log10(平均功率)
  // 注意：功率 P = RMS^2，所以 10*log10(P) = 20*log10(RMS)
  const avgDbfs = 10 * Math.log10(Math.max(meanPower, 1e-12));
  
  return Math.max(DBFS_MIN_POSSIBLE, Math.min(DBFS_MAX_POSSIBLE, avgDbfs));
}

/**
 * 计算 dBFS 数组的分位数（线性域计算）
 * 
 * 此函数在 RMS 域（线性域）上计算分位数，然后转换回 dBFS
 * 在线性域上计算分位数符合能量统计的严谨性
 * 
 * 公式：quantileDbfs = 20 * log10(quantileRMS(p))
 * 其中 quantileRMS(p) 是 RMS 域的分位数，使用线性插值计算
 * 
 * @param dbfsArr dBFS 值数组
 * @param p 分位数位置 (0-1)，例如 0.5 表示中位数，0.95 表示 95% 分位数
 * @returns 该分位数的 dBFS 值，范围限制在 [-100, 0]
 */
export function computeQuantileFromDbfsArray(dbfsArr: number[], p: number): number {
  if (dbfsArr.length === 0) return DBFS_MIN_POSSIBLE;
  
  // 将 dBFS 转换为 RMS：10^(dB/20)
  const rmsArr = dbfsArr.map(db => Math.pow(10, db / 20));
  rmsArr.sort((a, b) => a - b); // 排序
  
  // 计算分位数索引（使用线性插值）
  const idx = (rmsArr.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const w = idx - lo; // 插值权重
  
  // 线性插值计算分位数 RMS
  const quantileRms = lo === hi ? rmsArr[lo] : rmsArr[lo] * (1 - w) + rmsArr[hi] * w;
  
  // 将 RMS 转换回 dBFS
  return 20 * Math.log10(Math.max(quantileRms, 1e-12));
}

/**
 * 将数值限制在 [0, 1] 范围内
 * 
 * 此函数用于将任意数值归一化到 [0, 1] 区间
 * 常用于计算惩罚系数，确保惩罚值不会超出合理范围
 * 
 * @param val 输入数值
 * @returns 限制后的数值，范围 [0, 1]
 */
export function clamp01(val: number) {
  return Math.max(0, Math.min(1, val));
}
