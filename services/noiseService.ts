import { 
  getNoiseControlSettings, 
  subscribeSettingsEvent,
  saveNoiseControlSettings
} from "../utils/noiseControlSettings";
import { NoiseControlSettings } from "../types";
import { 
  NOISE_ANALYSIS_FRAME_MS, 
  NOISE_ANALYSIS_SLICE_SEC, 
  NOISE_SCORE_THRESHOLD_DBFS,
  NOISE_SCORE_SEGMENT_MERGE_GAP_MS,
  INVALID_DBFS_THRESHOLD
} from "../constants";
import { 
  NoiseFrameSample, 
  NoiseRealtimePoint, 
  NoiseSliceSummary, 
  NoiseStreamStatus,
  NoiseStreamSnapshot,
  NoiseScoreBreakdown
} from "../types";
import { 
  computeAvgDbfsFromDbfsArray, 
  computeDbfsFromRms, 
  computeDisplayDbFromRms, 
  computeQuantileFromDbfsArray, 
  computeRmsAndPeak 
} from "./noiseMath";
import { computeNoiseSliceScore } from "../utils/noiseScoreEngine";
import { v4 as uuidv4 } from 'uuid'; // UUID 生成库

// 如果 UUID 包包不可用，使用简单的 ID 生成器
const generateId = () => Math.random().toString(36).substring(2, 15);

/**
 * 噪音数据监听器类型
 * 用于订阅噪音流更新事件
 */
type NoiseListener = (snapshot: NoiseStreamSnapshot) => void;

/**
 * 噪音监测服务（单例模式）
 * 
 * 负责处理 Web Audio API 音频采集、数据聚合、切片统计和评分计算
 * 
 * 核心功能：
 * - 麦克风音频采集与滤波处理
 * - 实时 RMS/dBFS 计算（50ms 采样率）
 * - 30 秒切片聚合与统计
 * - 三维度噪音评分计算
 * - 历史数据存储与管理
 * - 订阅/发布模式的数据流管理
 */
class NoiseService {
  // ==================== Web Audio API 相关 ====================
  
  /** 音频上下文，用于创建音频处理节点 */
  private audioContext: AudioContext | null = null;
  
  /** 分析器节点，用于获取音频时域数据 */
  private analyser: AnalyserNode | null = null;
  
  /** 媒体流，来自麦克风的音频输入 */
  private stream: MediaStream | null = null;
  
  /** 媒体流源节点，将 MediaStream 连接到音频处理链 */
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  
  // ==================== 服务状态管理 ====================
  
  /** 当前服务状态 */
  private status: NoiseStreamStatus = "initializing";
  
  /** 数据监听器集合，用于订阅/发布模式 */
  private listeners: Set<NoiseListener> = new Set();
  
  /** 动画帧 ID，用于 requestAnimationFrame */
  private animationFrameId: number | null = null;
  
  /** 上一帧处理时间戳，用于控制帧间隔 */
  private lastFrameTime = 0;
  
  // ==================== 校准配置 ====================
  
  /** 显示基准分贝，用于校准显示分贝值 */
  private baselineDb = 40; 
  
  /** 基准 RMS 值，对应 baselineDb 的 RMS 值 */
  // 假设 -50dBFS 大约对应标准校准麦克风场景下的 60dBSPL，此处简化处理
  private baselineRms = Math.pow(10, (-60) / 20); 

  // ==================== 校准状态 ====================
  
  /** 最新的 RMS 读数，用于校准 */
  private lastRms = 0;
  
  /** 校准缓冲区，存储校准期间的 RMS 数据 */
  private calibrationBuffer: number[] = [];
  
  /** 是否正在进行校准 */
  private isCalibrating = false;
  
  /** 校准目标分贝值 */
  private calibrationTargetDb = 0;
  
  /** 校准完成回调函数 */
  private calibrationCallback: ((success: boolean, msg: string) => void) | null = null;

  // ==================== 设置订阅 ====================
  
  /** 设置事件取消订阅函数 */
  private settingsUnsubscribe: (() => void) | null = null;
  
  /** 预热帧剩余数量，丢弃麦克风启动后的不稳定数据 */
  private warmupFramesRemaining = 0;

  // ==================== 实时缓冲区 ====================
  
  /** 环形缓冲区，存储最近的实时数据点，用于图表展示 */
  private ringBuffer: NoiseRealtimePoint[] = [];
  
  /** 环形缓冲区容量，约 10 秒数据（50ms 采样率） */
  private readonly ringBufferCapacity = 200;

  // ==================== 切片聚合状态 ====================
  
  /** 当前切片开始时间戳 */
  private currentSliceStart = 0;
  
  /** 当前切片的 dBFS 值数组 */
  private sliceDbfsValues: number[] = [];
  
  /** 当前切片超过阈值的累计时长（毫秒） */
  private sliceAboveThresholdDuration = 0;
  
  /** 当前切片的总帧数 */
  private sliceFramesTotal = 0;
  
  /** 当前切片的有效采样时长（毫秒） */
  private sliceSampledDuration = 0;
  
  // ==================== 噪音段检测状态 ====================
  
  /** 当前是否超过阈值 */
  private isAboveThreshold = false;
  
  /** 当前切片的噪音段数量 */
  private segmentCount = 0;
  
  /** 上一个噪音段结束时间戳 */
  private lastSegmentEndTs = 0;

  // ==================== 数据缺失检测状态 ====================
  
  /** 上一次处理的帧时间戳 */
  private lastProcessedFrameTs: number | null = null;
  
  /** 当前切片的数据缺口数量 */
  private gapCount = 0;
  
  /** 当前切片的最大缺口时长（毫秒） */
  private maxGapMs = 0;

  // ==================== 实时评分状态 ====================
  
  /** 缓存的当前评分 */
  private cachedCurrentScore: number | undefined = undefined;
  
  /** 缓存的当前评分详情 */
  private cachedCurrentScoreDetail: NoiseScoreBreakdown | undefined = undefined;
  
  /** 上次计算评分的时间戳，用于节流 */
  private lastScoreCalcTime = 0;

  // ==================== 其他状态 ====================
  
  /** 最后完成的切片摘要 */
  private lastCompletedSlice: NoiseSliceSummary | null = null;

  /**
   * 构造函数
   * 初始化服务状态，加载设置，订阅设置变更事件
   */
  constructor() {
    this.status = "paused";
    const settings = getNoiseControlSettings();
    this.updateLocalSettings(settings);

    // 订阅设置变更事件，实时更新本地配置
    this.settingsUnsubscribe = subscribeSettingsEvent((evt) => {
      this.updateLocalSettings(evt.detail);
    });
  }

  /**
   * 更新本地噪音控制设置
   * 从设置对象中提取校准参数并更新本地状态
   * 
   * @param settings 最新的设置对象
   */
  private updateLocalSettings(settings: NoiseControlSettings) {
    this.baselineDb = settings.baselineDb;
    if (settings.baselineRms && settings.baselineRms > 0) {
      this.baselineRms = settings.baselineRms;
    }
  }

  /**
   * 开始校准当前噪音水平到目标分贝值
   * 
   * 校准过程会收集约 3 秒的 RMS 数据，计算平均值作为基准 RMS
   * 这样可以将任意设备的麦克风输出映射到用户熟悉的分贝值
   * 
   * @param targetDb 目标显示分贝（例如：安静房间 40dB）
   * @param callback 校准完成后的回调函数，接收成功标志和消息
   */
  public calibrate(targetDb: number, callback?: (success: boolean, msg: string) => void) {
    if (this.status !== "active") {
      callback?.(false, "请先启动监测");
      return;
    }

    this.isCalibrating = true;
    this.calibrationTargetDb = targetDb;
    this.calibrationBuffer = [];
    this.calibrationCallback = callback || null;
    
    console.log(`Starting calibration to ${targetDb}dB...`);
  }

  /**
   * 处理每一帧的校准逻辑
   * 收集 RMS 数据直到满足时长要求（约 3 秒）
   * 
   * @param rms 当前帧的 RMS 值
   */
  private processCalibrationFrame(rms: number) {
    if (!this.isCalibrating) return;

    this.calibrationBuffer.push(rms);
    
    // 3 秒数据，50ms 间隔 = 60 帧
    const framesNeeded = 3000 / NOISE_ANALYSIS_FRAME_MS;

    if (this.calibrationBuffer.length >= framesNeeded) {
      // 完成校准：计算平均 RMS 并保存
      const sum = this.calibrationBuffer.reduce((a, b) => a + b, 0);
      const avgRms = sum / this.calibrationBuffer.length;
      
      this.isCalibrating = false;
      this.baselineRms = avgRms;
      this.baselineDb = this.calibrationTargetDb;

      // 保存校准结果到设置
      saveNoiseControlSettings({
        baselineDb: this.calibrationTargetDb,
        baselineRms: avgRms
      });

      console.log(`Calibration complete: RMS ${avgRms.toFixed(6)} -> ${this.calibrationTargetDb}dB`);
      this.calibrationCallback?.(true, `校准完成！平均RMS: ${avgRms.toFixed(6)}`);
      this.calibrationCallback = null;
    }
  }

  /**
   * 订阅噪音数据流更新
   * 
   * 使用观察者模式，多个组件可以同时订阅噪音数据更新
   * 当最后一个订阅者取消时，服务会自动停止采集
   * 
   * @param listener 数据监听回调，接收最新的快照数据
   * @returns 取消订阅的函数
   */
  public subscribe(listener: NoiseListener): () => void {
    this.listeners.add(listener);
    this.emit(); // 立即发送当前状态
    return () => this.listeners.delete(listener);
  }

  /**
   * 向所有订阅者广播最新的快照数据
   * 
   * 构建包含当前状态、实时数据、最新切片和评分的快照对象
   * 并通知所有订阅的监听器
   */
  private emit() {
    const lastPoint = this.ringBuffer.length > 0 ? this.ringBuffer[this.ringBuffer.length - 1] : null;
    const snapshot: NoiseStreamSnapshot = {
      status: this.status,
      currentDbfs: lastPoint?.dbfs ?? -100,
      currentDisplayDb: lastPoint?.displayDb ?? 20,
      ringBuffer: [...this.ringBuffer],
      lastSlice: this.lastCompletedSlice,
      currentScore: this.cachedCurrentScore,
      currentScoreDetail: this.cachedCurrentScoreDetail
    };
    this.listeners.forEach(l => l(snapshot));
  }

  /**
   * 启动噪音监测服务
   * 
   * 初始化 AudioContext，请求麦克风权限，构建音频处理链路
   * 音频处理链：麦克风 → 高通滤波器(80Hz) → 低通滤波器(8000Hz) → AnalyserNode
   * 
   * @throws 当麦克风权限被拒绝或浏览器不支持时抛出异常
   */
  public async start() {
    if (this.status === "active") return;

    try {
      this.status = "initializing";
      this.warmupFramesRemaining = 10; // 预热 10 帧，丢弃不稳定数据
      this.emit();

      // 创建音频上下文
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // 请求麦克风权限，禁用自动处理以获取原始音频数据
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,    // 禁用回声消除
          noiseSuppression: false,    // 禁用降噪
          autoGainControl: false,     // 禁用自动增益
        }
      });

      // 创建媒体流源节点
      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
      
      // 创建高通滤波器（80Hz），过滤低频噪音（如空调嗡嗡声）
      const highPass = this.audioContext.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = 80;

      // 创建低通滤波器（8000Hz），过滤高频噪音（如电子设备啸叫）
      const lowPass = this.audioContext.createBiquadFilter();
      lowPass.type = 'lowpass';
      lowPass.frequency.value = 8000;

      // 创建分析器节点，用于获取音频时域数据
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048; // FFT 窗口大小
      this.analyser.smoothingTimeConstant = 0; // 无平滑，实时响应

      // 构建音频处理链路
      this.sourceNode.connect(highPass);
      highPass.connect(lowPass);
      lowPass.connect(this.analyser);

      this.status = "active";
      this.resetSlice();
      this.loop(); // 启动主循环
    } catch (err) {
      console.error("Mic Error", err);
      this.status = "permission-denied";
      this.emit();
    }
  }

  /**
   * 停止噪音监测服务
   * 
   * 释放音频资源，停止采集，并保存当前切片（如果有数据）
   */
  public stop() {
    if (this.status === "paused") return;
    
    // 停止前完成当前切片统计（如果有数据）
    if (this.sliceDbfsValues.length > 0) {
      this.finalizeSlice();
    }

    this.status = "paused";
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    
    // 停止媒体流的所有轨道
    this.stream?.getTracks().forEach(t => t.stop());
    this.audioContext?.close();
    
    // 清理资源
    this.audioContext = null;
    this.analyser = null;
    this.stream = null;
    
    this.emit();
  }

  /**
   * 主循环函数
   * 
   * 使用 requestAnimationFrame 实现定时处理音频帧
   * 控制帧间隔为 50ms（约 20fps），以平衡性能和精度
   */
  private loop = () => {
    if (this.status !== "active" || !this.analyser) return;

    const now = performance.now();
    const dt = now - this.lastFrameTime;

    // 控制帧间隔为 50ms
    if (dt >= NOISE_ANALYSIS_FRAME_MS) {
      this.processFrame(now);
      this.lastFrameTime = now;
    }

    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  /**
   * 处理单帧音频数据
   * 
   * 核心处理流程：
   * 1. 从 AnalyserNode 获取时域数据
   * 2. 计算 RMS 和 dBFS
   * 3. 更新环形缓冲区
   * 4. 检测数据缺口
   * 5. 聚合切片数据
   * 6. 检测噪音事件段
   * 7. 更新实时评分
   * 8. 检查切片是否完成
   * 
   * @param nowTs 当前时间戳（毫秒）
   */
  private processFrame(nowTs: number) {
    if (!this.analyser) return;

    // 预热阶段：丢弃前几帧的不稳定数据
    if (this.warmupFramesRemaining > 0) {
      this.warmupFramesRemaining--;
      return;
    }

    // 获取音频时域数据
    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);
    const frameTs = Date.now();

    // 1. 计算 RMS 和 dBFS
    const { rms } = computeRmsAndPeak(data);
    this.lastRms = rms;
    
    // 检查校准是否激活
    if (this.isCalibrating) {
      this.processCalibrationFrame(rms);
    }

    const dbfs = computeDbfsFromRms(rms);
    const displayDb = computeDisplayDbFromRms({
      rms,
      baselineRms: this.baselineRms,
      baselineDb: this.baselineDb
    });

    // 2. 更新环形缓冲区（用于实时图表）
    this.ringBuffer.push({ t: frameTs, dbfs, displayDb });
    if (this.ringBuffer.length > this.ringBufferCapacity) {
      this.ringBuffer.shift();
    }

    // 3. 数据缺口检测与时长计算
    let frameDuration = NOISE_ANALYSIS_FRAME_MS;
    
    if (this.lastProcessedFrameTs !== null) {
       const dt = frameTs - this.lastProcessedFrameTs;
       // 间隙阈值：1000ms 或 5 帧
       const gapThresholdMs = Math.max(1000, NOISE_ANALYSIS_FRAME_MS * 5);
       
       if (dt > gapThresholdMs) {
         // 检测到数据缺口
         this.gapCount++;
         this.maxGapMs = Math.max(this.maxGapMs, dt);
         // 间隙后，将当前帧视为单帧
         frameDuration = NOISE_ANALYSIS_FRAME_MS; 
       } else {
         // 正常间隔，使用实际间隔时间
         frameDuration = dt;
       }
    }
    this.lastProcessedFrameTs = frameTs;

    // 4. 切片数据聚合（仅处理有效帧）
    if (dbfs >= INVALID_DBFS_THRESHOLD) {
      this.sliceDbfsValues.push(dbfs);
      this.sliceFramesTotal++;
      this.sliceSampledDuration += frameDuration;

      // 阈值检查：判断当前帧是否超过评分阈值
      const isCurrentlyAbove = dbfs > NOISE_SCORE_THRESHOLD_DBFS;
      
      if (isCurrentlyAbove) {
        this.sliceAboveThresholdDuration += frameDuration;
      }

      // 5. 噪音事件段检测（智能合并）
      if (isCurrentlyAbove) {
         if (!this.isAboveThreshold) {
           // 上升沿：检测到新的噪音开始
           const timeSinceLast = Date.now() - this.lastSegmentEndTs;
           // 如果距离上次噪音结束超过合并窗口，则计为新事件段
           if (this.lastSegmentEndTs === 0 || timeSinceLast > NOISE_SCORE_SEGMENT_MERGE_GAP_MS) {
             this.segmentCount++;
           }
           // 否则合并到上一个事件段
           this.isAboveThreshold = true;
         }
      } else {
        if (this.isAboveThreshold) {
          // 下降沿：噪音结束
          this.isAboveThreshold = false;
          this.lastSegmentEndTs = Date.now();
        }
      }
    }

    // 6. 更新实时评分（节流到约 250ms 以节省 CPU）
    if (nowTs - this.lastScoreCalcTime > 250) {
      this.updateInterimScore();
      this.lastScoreCalcTime = nowTs;
    }

    this.emit();

    // 7. 检查切片是否完成（30 秒）
    if (Date.now() - this.currentSliceStart >= NOISE_ANALYSIS_SLICE_SEC * 1000) {
      this.finalizeSlice();
    }
  }

  /**
   * 更新临时评分（用于实时反馈）
   * 
   * 进行轻量级计算，不保存切片
   * 用于在切片完成前提供实时的评分反馈
   */
  private updateInterimScore() {
    // 数据不足时返回默认满分
    if (this.sliceDbfsValues.length < 10) {
      this.cachedCurrentScore = 100; // 默认完美开局
      this.cachedCurrentScoreDetail = undefined;
      return;
    }

    // 轻量级计算用于临时显示
    const avgDbfs = computeAvgDbfsFromDbfsArray(this.sliceDbfsValues);
    const maxDbfs = Math.max(...this.sliceDbfsValues);
    const p50Dbfs = computeQuantileFromDbfsArray(this.sliceDbfsValues, 0.5);
    const p95Dbfs = computeQuantileFromDbfsArray(this.sliceDbfsValues, 0.95);
    const overRatioDbfs = this.sliceSampledDuration > 0 
      ? this.sliceAboveThresholdDuration / this.sliceSampledDuration 
      : 0;

    const rawStats = {
      avgDbfs,
      maxDbfs,
      p50Dbfs,
      p95Dbfs,
      overRatioDbfs,
      segmentCount: this.segmentCount,
      sampledDurationMs: this.sliceSampledDuration,
      gapCount: this.gapCount,
      maxGapMs: this.maxGapMs
    };

    const durationMs = Date.now() - this.currentSliceStart;
    const { score, scoreDetail } = computeNoiseSliceScore(rawStats, durationMs);
    
    this.cachedCurrentScore = score;
    this.cachedCurrentScoreDetail = scoreDetail;
  }

  /**
   * 重置当前切片状态
   * 
   * 准备开始新的统计周期，清空所有切片相关的状态变量
   */
  private resetSlice() {
    this.currentSliceStart = Date.now();
    this.sliceDbfsValues = [];
    this.sliceAboveThresholdDuration = 0;
    this.sliceFramesTotal = 0;
    this.sliceSampledDuration = 0;
    this.segmentCount = 0;
    this.isAboveThreshold = false;
    this.lastSegmentEndTs = 0;
    this.gapCount = 0;
    this.maxGapMs = 0;
    this.lastProcessedFrameTs = null;
    this.cachedCurrentScore = 100;
    this.cachedCurrentScoreDetail = undefined;
  }

  /**
   * 结束当前切片
   * 
   * 计算最终统计数据、评分，并保存到历史记录
   * 切片完成后会自动重置状态，开始新的切片
   */
  private finalizeSlice() {
    // 无数据时直接重置
    if (this.sliceDbfsValues.length === 0) {
      this.resetSlice();
      return;
    }

    // 计算原始统计数据（基于 dBFS）
    const avgDbfs = computeAvgDbfsFromDbfsArray(this.sliceDbfsValues);
    const maxDbfs = Math.max(...this.sliceDbfsValues);
    const p50Dbfs = computeQuantileFromDbfsArray(this.sliceDbfsValues, 0.5);
    const p95Dbfs = computeQuantileFromDbfsArray(this.sliceDbfsValues, 0.95);
    const overRatioDbfs = this.sliceSampledDuration > 0 
      ? this.sliceAboveThresholdDuration / this.sliceSampledDuration 
      : 0;

    // 计算显示统计数据（已校准）
    const displayAvgDb = computeDisplayDbFromRms({
       rms: Math.pow(10, avgDbfs / 20),
       baselineRms: this.baselineRms,
       baselineDb: this.baselineDb
    });
    const displayP95Db = computeDisplayDbFromRms({
      rms: Math.pow(10, p95Dbfs / 20),
      baselineRms: this.baselineRms,
      baselineDb: this.baselineDb
   });

    const rawStats = {
      avgDbfs,
      maxDbfs,
      p50Dbfs,
      p95Dbfs,
      overRatioDbfs,
      segmentCount: this.segmentCount,
      sampledDurationMs: this.sliceSampledDuration,
      gapCount: this.gapCount,
      maxGapMs: this.maxGapMs
    };

    const durationMs = Date.now() - this.currentSliceStart;

    // 计算评分
    const { score, scoreDetail } = computeNoiseSliceScore(rawStats, durationMs);

    // 构建切片摘要
    const sliceSummary: NoiseSliceSummary = {
      id: generateId(),
      start: this.currentSliceStart,
      end: Date.now(),
      frames: this.sliceFramesTotal,
      raw: rawStats,
      display: {
        avgDb: displayAvgDb,
        p95Db: displayP95Db
      },
      score,
      scoreDetail
    };

    this.lastCompletedSlice = sliceSummary;
    
    // 保存到 LocalStorage
    this.saveSlice(sliceSummary);

    // 重置状态，开始新的切片
    this.resetSlice();
  }

  /**
   * 保存切片到 LocalStorage
   * 
   * 执行自动清理策略：
   * - 保留最近 14 天的数据
   * - 限制最大切片数量为 1000
   * 
   * @param slice 要保存的切片摘要
   */
  private saveSlice(slice: NoiseSliceSummary) {
    try {
      const existing = localStorage.getItem("noise-slices-v2");
      const list: NoiseSliceSummary[] = existing ? JSON.parse(existing) : [];
      list.push(slice);
      
      // 清理旧数据（保留 14 天）
      const retentionMs = 14 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const filteredList = list.filter(s => now - s.end < retentionMs);
      
      // 安全限制（最多 1000 个切片）
      if (filteredList.length > 1000) filteredList.shift();
      
      localStorage.setItem("noise-slices-v2", JSON.stringify(filteredList));
    } catch (e) {
      console.warn("Storage Full", e);
    }
  }
  
  /**
   * 获取历史切片数据
   * 
   * 从 LocalStorage 读取所有历史切片数据
   * 
   * @returns 历史切片列表
   */
  public getHistory(): NoiseSliceSummary[] {
    try {
      const existing = localStorage.getItem("noise-slices-v2");
      return existing ? JSON.parse(existing) : [];
    } catch {
      return [];
    }
  }
  
  /**
   * 清除所有历史数据
   * 
   * 从 LocalStorage 删除所有历史切片数据
   */
  public clearHistory() {
    localStorage.removeItem("noise-slices-v2");
  }
}

/**
 * 噪音服务单例实例
 * 
 * 整个应用共享同一个 NoiseService 实例
 * 确保音频采集和状态管理的一致性
 */
export const noiseService = new NoiseService();