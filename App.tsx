import React, { useEffect, useState, useCallback } from 'react';
import { noiseService } from './services/noiseService';
import { RealtimeMonitor } from './components/RealtimeMonitor';
import { HistoryList } from './components/HistoryList';
import { NoiseRealtimePoint, NoiseSliceSummary, NoiseStreamStatus, NoiseScoreBreakdown } from './types';
import { Play, Square, Mic, ShieldAlert, FileBarChart2, Sliders } from 'lucide-react';

/**
 * 主应用组件
 * 
 * 功能：
 * - 管理噪音监测服务的生命周期
 * - 显示实时噪音数据和评分
 * - 显示历史噪音记录
 * - 提供校准功能
 * - 处理麦克风权限错误
 */
function App() {
  // ==================== 状态管理 ====================

  /** 当前噪音流状态 */
  const [status, setStatus] = useState<NoiseStreamStatus>("paused");

  /** 当前显示分贝值（已校准） */
  const [currentDisplayDb, setCurrentDisplayDb] = useState(20);

  /** 当前原始 dBFS 值 */
  const [currentDbfs, setCurrentDbfs] = useState(-100);

  /** 当前实时评分 */
  const [currentScore, setCurrentScore] = useState<number | undefined>(undefined);

  /** 当前评分详情 */
  const [currentScoreDetail, setCurrentScoreDetail] = useState<NoiseScoreBreakdown | undefined>(undefined);

  /** 实时环形缓冲区数据 */
  const [ringBuffer, setRingBuffer] = useState<NoiseRealtimePoint[]>([]);

  /** 历史切片记录 */
  const [history, setHistory] = useState<NoiseSliceSummary[]>([]);

  /** 最后一个完成的切片，用于显示即时反馈 */
  const [lastSlice, setLastSlice] = useState<NoiseSliceSummary | null>(null);

  // ==================== 服务订阅 ====================

  /**
   * 与噪音服务同步
   * 
   * 订阅噪音服务的更新事件，实时更新 UI 状态
   */
  useEffect(() => {
    // 初始加载历史记录
    setHistory(noiseService.getHistory());

    // 订阅更新
    const unsubscribe = noiseService.subscribe((snapshot) => {
      setStatus(snapshot.status);
      setCurrentDisplayDb(snapshot.currentDisplayDb);
      setCurrentDbfs(snapshot.currentDbfs);
      setRingBuffer(snapshot.ringBuffer);
      setCurrentScore(snapshot.currentScore);
      setCurrentScoreDetail(snapshot.currentScoreDetail);

      // 当有新切片完成时，更新历史记录
      if (snapshot.lastSlice && snapshot.lastSlice !== lastSlice) {
        setLastSlice(snapshot.lastSlice);
        setHistory(noiseService.getHistory()); // 刷新历史记录
      }
    });

    return unsubscribe;
  }, [lastSlice]);

  // ==================== 事件处理 ====================

  /**
   * 切换录音状态
   * 
   * 如果当前是活跃状态，则停止监测；否则开始监测
   */
  const toggleRecording = useCallback(async () => {
    if (status === "active" || status === "initializing") {
      noiseService.stop();
    } else {
      await noiseService.start();
    }
  }, [status]);

  /**
   * 清空所有历史记录
   * 
   * 需要用户确认后执行
   */
  const clearHistory = useCallback(() => {
    if (confirm("确定删除所有历史记录吗？")) {
      noiseService.clearHistory();
      setHistory([]);
    }
  }, []);

  /**
   * 触发噪音校准流程
   * 
   * 引导用户输入当前环境分贝值，并调用 Service 进行校准
   * 校准过程会收集约 3 秒的 RMS 数据，计算平均值作为基准 RMS
   */
  const calibrate = useCallback(() => {
    if (status !== "active") {
      alert("请先点击'开始监测'，待数值稳定后再进行校准。");
      return;
    }

    const target = prompt("请输入当前环境的分贝值 (dB)，用于校准基准RMS。\n例如：安静房间为 40dB，标准白噪音为 60dB", "40");
    if (target) {
      const db = parseInt(target, 10);
      if (!isNaN(db) && db > 0) {
        // 显示加载状态或提示
        alert(`开始校准... 请保持环境安静，持续约3秒`);
        noiseService.calibrate(db, (success, msg) => {
          alert(msg);
        });
      } else {
        alert("请输入有效的数字");
      }
    }
  }, [status]);

  // ==================== 渲染 ====================

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 selection:bg-emerald-500/30">

      {/* ==================== 头部 ==================== */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo 和标题 */}
          <div className="flex items-center gap-2 text-emerald-400">
            <div className="w-8 h-8 rounded bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
              <Mic className="w-5 h-5" />
            </div>
            <span className="font-bold tracking-tight text-lg text-white">沉浸式<span className="text-zinc-500 font-light">噪音监测</span></span>
          </div>
          {/* 右侧操作按钮 */}
          <div className="flex items-center gap-4">
            {/* 校准按钮 */}
            <button
              onClick={calibrate}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors border border-zinc-700"
              title="校准噪音基准"
            >
              <Sliders className="w-3 h-3" />
              校准
            </button>
            {/* 监测状态指示器 */}
            {status === "active" && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium animate-pulse">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                正在监测
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* ==================== 权限错误提示 ==================== */}
        {status === "permission-denied" && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl flex items-center gap-3">
            <ShieldAlert className="w-6 h-6 shrink-0" />
            <div>
              <p className="font-semibold">无法访问麦克风</p>
              <p className="text-sm text-rose-300/80">请在浏览器设置中允许访问麦克风以使用本监测器。</p>
            </div>
          </div>
        )}

        {/* ==================== 实时仪表盘 ==================== */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <ActivityIcon /> 实时指标
            </h2>
            {/* 开始/停止按钮 */}
            <button
              onClick={toggleRecording}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold transition-all shadow-lg ${status === "active"
                ? "bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20"
                : "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20"
                }`}
            >
              {status === "active" ? (
                <><Square className="w-4 h-4 fill-current" /> 停止监测</>
              ) : (
                <><Play className="w-4 h-4 fill-current" /> 开始监测</>
              )}
            </button>
          </div>

          {/* 实时监控组件 */}
          <RealtimeMonitor
            data={ringBuffer}
            currentDisplayDb={currentDisplayDb}
            currentDbfs={currentDbfs}
            isRecording={status === "active"}
            currentScore={currentScore}
            currentScoreDetail={currentScoreDetail}
          />
        </section>

        {/* ==================== 信息/说明卡片 ==================== */}
        <section className="grid md:grid-cols-3 gap-4">
          <InfoCard
            title="持续噪音"
            desc="中位噪音水平超过阈值 (-50dBFS) 6dB 以上会受到评分惩罚。"
            color="border-l-4 border-l-blue-500"
          />
          <InfoCard
            title="时长占比"
            desc="若噪音时间超过会话时长的 30%，评分将下降。"
            color="border-l-4 border-l-purple-500"
          />
          <InfoCard
            title="中断频率"
            desc="突发噪音峰值（>6次/分钟）将导致严重扣分。"
            color="border-l-4 border-l-orange-500"
          />
        </section>

        {/* ==================== 历史记录部分 ==================== */}
        <section>
          <HistoryList slices={history} onClear={clearHistory} />
        </section>

      </main>
    </div>
  );
}

// ==================== 辅助组件 ====================

/**
 * 活动图标组件
 * 用于标题栏的图标
 */
function ActivityIcon() {
  return <FileBarChart2 className="w-5 h-5 text-zinc-500" />;
}

/**
 * 信息卡片组件
 * 
 * 用于显示评分规则的说明卡片
 * 
 * @param title 卡片标题
 * @param desc 卡片描述
 * @param color 颜色样式类名
 */
const InfoCard = ({ title, desc, color }: { title: string, desc: string, color: string }) => (
  <div className={`bg-zinc-900 p-4 rounded-lg border border-zinc-800 ${color}`}>
    <h3 className="text-zinc-300 font-medium mb-1">{title}</h3>
    <p className="text-zinc-500 text-sm leading-relaxed">{desc}</p>
  </div>
);

export default App;