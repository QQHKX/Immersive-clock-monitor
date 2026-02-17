import React from 'react';
import { NoiseSliceSummary } from '../types';
import { Clock, Activity, AlertTriangle, Zap, CheckCircle2 } from 'lucide-react';

/**
 * 历史列表组件属性接口
 */
interface HistoryListProps {
  slices: NoiseSliceSummary[];  // 历史切片摘要数组
  onClear: () => void;         // 清除历史记录的回调函数
}

/**
 * 评分徽章组件
 * 
 * 根据分数的不同区间显示不同的颜色和样式
 * - 80-100 分：绿色（优秀）
 * - 60-79 分：黄色（良好）
 * - 0-59 分：红色（较差）
 * 
 * @param score 评分值 (0-100)
 */
const ScoreBadge: React.FC<{ score: number }> = ({ score }) => {
  let color = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (score < 80) color = "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
  if (score < 60) color = "bg-rose-500/10 text-rose-400 border-rose-500/20";

  return (
    <div className={`px-3 py-1 rounded-full border ${color} font-mono font-bold text-sm`}>
      {score.toFixed(1)}
    </div>
  );
};

/**
 * 历史会话列表组件
 * 
 * 展示过往的噪音监测记录和统计数据
 * 
 * 功能：
 * - 显示每条记录的时间、时长、评分等基本信息
 * - 显示关键指标：平均分贝、峰值分贝、中断次数
 * - 显示惩罚类型图标：持续噪音、中断频率、时长占比
 * - 支持清除所有历史记录
 */
export const HistoryList: React.FC<HistoryListProps> = ({ slices, onClear }) => {
  // 空状态：无历史记录时显示提示
  if (slices.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500 bg-zinc-900 rounded-xl border border-zinc-800">
        <Activity className="w-12 h-12 mx-auto mb-3 opacity-20" />
        <p>暂无历史记录。开始监测以生成报告。</p>
      </div>
    );
  }

  // 按时间倒序显示（最新的在最前）
  const sortedSlices = [...slices].reverse();

  return (
    <div className="space-y-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-zinc-200">会话历史</h2>
        <button
          onClick={onClear}
          className="text-xs text-rose-400 hover:text-rose-300 transition-colors"
        >
          清除历史
        </button>
      </div>

      {/* 历史记录列表 */}
      <div className="grid gap-4">
        {sortedSlices.map((slice) => {
          const duration = Math.round((slice.end - slice.start) / 1000);

          return (
            <div key={slice.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 transition-all hover:border-zinc-700">
              <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">

                {/* ==================== 时间信息 ==================== */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5 text-zinc-400" />
                  </div>
                  <div>
                    <div className="text-sm text-zinc-400">
                      {new Date(slice.start).toLocaleTimeString('zh-CN')}
                      <span className="mx-2 text-zinc-700">•</span>
                      {duration}秒
                    </div>
                    <div className="text-xs text-zinc-600 font-mono mt-0.5">
                      ID: {slice.id.slice(0, 8)}
                    </div>
                  </div>
                </div>

                {/* ==================== 关键指标 ==================== */}
                <div className="flex gap-6 text-sm text-zinc-300">
                  <div className="flex flex-col">
                    <span className="text-zinc-500 text-xs uppercase tracking-wider">平均</span>
                    <span className="font-mono">{Math.round(slice.display.avgDb)} dB</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-zinc-500 text-xs uppercase tracking-wider">峰值</span>
                    <span className="font-mono">{Math.round(slice.display.p95Db)} dB</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-zinc-500 text-xs uppercase tracking-wider">中断</span>
                    <span className="font-mono">{slice.raw.segmentCount}</span>
                  </div>
                </div>

                {/* ==================== 惩罚可视化 ==================== */}
                <div className="flex gap-1">
                  {/* 持续噪音惩罚图标 */}
                  {slice.scoreDetail.sustainedPenalty > 0 && (
                    <div className="p-1 rounded bg-rose-500/10 text-rose-500" title="持续噪音惩罚">
                      <Zap className="w-4 h-4" />
                    </div>
                  )}
                  {/* 中断频率惩罚图标 */}
                  {slice.scoreDetail.segmentPenalty > 0 && (
                    <div className="p-1 rounded bg-orange-500/10 text-orange-500" title="中断频率惩罚">
                      <Activity className="w-4 h-4" />
                    </div>
                  )}
                  {/* 时长占比惩罚图标 */}
                  {slice.scoreDetail.timePenalty > 0 && (
                    <div className="p-1 rounded bg-yellow-500/10 text-yellow-500" title="时长占比惩罚">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                  )}
                  {/* 完美评分图标 */}
                  {slice.score === 100 && (
                    <div className="p-1 rounded bg-emerald-500/10 text-emerald-500" title="完美评分">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  )}
                </div>

                {/* ==================== 评分徽章 ==================== */}
                <ScoreBadge score={slice.score} />

              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};