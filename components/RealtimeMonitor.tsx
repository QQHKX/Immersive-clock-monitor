import React, { useEffect, useRef } from 'react';
import { ResponsiveContainer, AreaChart, Area, YAxis } from 'recharts';
import { NoiseRealtimePoint, NoiseScoreBreakdown } from '../types';

/**
 * 实时监控组件属性接口
 */
interface RealtimeMonitorProps {
  data: NoiseRealtimePoint[];           // 实时数据点数组，用于波形图
  currentDisplayDb: number;              // 当前显示分贝值（已校准）
  currentDbfs: number;                  // 当前原始 dBFS 值
  isRecording: boolean;                  // 是否正在录音
  currentScore?: number;                 // 当前实时评分
  currentScoreDetail?: NoiseScoreBreakdown; // 当前评分详情
}

/**
 * 实时噪音监控组件
 * 
 * 显示三个主要区域：
 * 1. 仪表盘：显示当前分贝值，使用环形进度条可视化
 * 2. 实时评分：显示当前专注评分和扣分原因
 * 3. 实时波形：显示最近 10 秒的噪音变化趋势
 */
export const RealtimeMonitor: React.FC<RealtimeMonitorProps> = ({
  data,
  currentDisplayDb,
  currentDbfs,
  isRecording,
  currentScore = 100,
  currentScoreDetail
}) => {
  /**
   * 根据分贝值获取状态颜色
   * 
   * @param db 分贝值
   * @returns Tailwind CSS 颜色类名
   */
  const getStatusColor = (db: number) => {
    if (db < 50) return "text-emerald-400";  // 安静：绿色
    if (db < 70) return "text-yellow-400";  // 正常：黄色
    return "text-rose-500";                 // 嘈杂：红色
  };

  /**
   * 根据分贝值获取环形进度条颜色
   * 
   * @param db 分贝值
   * @returns 十六进制颜色值
   */
  const getRingColor = (db: number) => {
    if (db < 50) return "#34d399"; // emerald-400
    if (db < 70) return "#facc15"; // yellow-400
    return "#f43f5e"; // rose-500
  };

  /**
   * 根据评分获取颜色
   * 
   * @param score 评分值 (0-100)
   * @returns Tailwind CSS 颜色类名
   */
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-400";  // 优秀：绿色
    if (score >= 60) return "text-yellow-400";  // 良好：黄色
    return "text-rose-500";                 // 较差：红色
  };

  // 计算显示值
  const displayValue = isRecording ? Math.round(currentDisplayDb) : "--";
  const dbfsValue = isRecording ? currentDbfs.toFixed(1) : "--";
  const scoreValue = isRecording ? currentScore.toFixed(0) : "--";

  // 仪表盘计算
  const minDb = 20;  // 最小分贝值
  const maxDb = 100; // 最大分贝值
  const percentage = isRecording
    ? Math.min(100, Math.max(0, ((currentDisplayDb - minDb) / (maxDb - minDb)) * 100))
    : 0;

  // 环形进度条参数
  const radius = 100;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">

        {/* ==================== 仪表盘区域 (左) ==================== */}
        <div className="relative h-56 flex items-center justify-center shrink-0">
          <svg className="w-56 h-56 transform -rotate-90">
            {/* 背景圆环 */}
            <circle
              cx="50%"
              cy="50%"
              r={radius}
              stroke="currentColor"
              strokeWidth="10"
              fill="transparent"
              className="text-zinc-800"
            />
            {/* 活动圆环：根据分贝值动态显示 */}
            <circle
              cx="50%"
              cy="50%"
              r={radius}
              stroke={getRingColor(currentDisplayDb)}
              strokeWidth="10"
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-300 ease-out"
            />
          </svg>
          {/* 中心数值显示 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-5xl font-bold font-mono tracking-tighter ${getStatusColor(currentDisplayDb)}`}>
              {displayValue}
            </span>
            <span className="text-zinc-500 text-xs mt-2 font-medium uppercase tracking-wide">dB SPL</span>
            <span className="text-zinc-700 text-[10px] mt-1 font-mono">{dbfsValue} dBFS</span>
          </div>
        </div>

        {/* ==================== 实时评分区域 (中) ==================== */}
        <div className="flex flex-col items-center justify-center p-4 bg-zinc-950/30 rounded-xl border border-zinc-800/50 h-full">
          <span className="text-zinc-500 text-xs font-medium uppercase tracking-widest mb-2">实时专注评分</span>
          {/* 评分数值 */}
          <div className={`text-6xl font-bold font-mono ${isRecording ? getScoreColor(currentScore) : 'text-zinc-700'}`}>
            {scoreValue}
          </div>

          {/* 扣分指示器 */}
          {isRecording && currentScoreDetail && (
            <div className="flex gap-2 mt-4">
              {currentScoreDetail.sustainedPenalty > 0 && (
                <div className="w-2 h-2 rounded-full bg-rose-500" title="持续噪音过高"></div>
              )}
              {currentScoreDetail.timePenalty > 0 && (
                <div className="w-2 h-2 rounded-full bg-yellow-500" title="噪音时长过长"></div>
              )}
              {currentScoreDetail.segmentPenalty > 0 && (
                <div className="w-2 h-2 rounded-full bg-orange-500" title="噪音中断频繁"></div>
              )}
              {currentScore === 100 && (
                <div className="text-xs text-emerald-500 font-medium">环境极佳</div>
              )}
            </div>
          )}
          {/* 扣分原因提示 */}
          {isRecording && currentScore < 100 && (
            <div className="text-xs text-zinc-500 mt-2 text-center px-4">
              {currentScoreDetail?.sustainedPenalty ? '环境持续嘈杂 ' : ''}
              {currentScoreDetail?.segmentPenalty ? '突发噪音频繁 ' : ''}
            </div>
          )}
        </div>

        {/* ==================== 实时图表区域 (右) ==================== */}
        <div className="w-full h-48 md:h-56 bg-zinc-950/50 rounded-xl border border-zinc-800/50 p-2 relative flex flex-col">
          <div className="absolute top-2 left-3 text-[10px] text-zinc-500 font-medium uppercase tracking-wider">实时波形 (10s)</div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                {/* 渐变填充定义 */}
                <defs>
                  <linearGradient id="colorDb" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                {/* Y 轴：隐藏，固定范围 20-100 dB */}
                <YAxis
                  domain={[20, 100]}
                  hide
                />
                {/* 面积图：显示噪音变化趋势 */}
                <Area
                  isAnimationActive={false}
                  type="monotone"
                  dataKey="displayDb"
                  stroke="#34d399"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorDb)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};