
import { saveNoiseControlSettings, getNoiseControlSettings, resetNoiseControlSettings } from './utils/noiseControlSettings';

// 测试 RMS 校准持久化
console.log("初始设置:", getNoiseControlSettings());

// 模拟校准
const mockRms = 0.005;
const targetDb = 50;

console.log(`正在校准至 ${targetDb}dB，RMS 为 ${mockRms}...`);
saveNoiseControlSettings({
  baselineDb: targetDb,
  baselineRms: mockRms
});

const updated = getNoiseControlSettings();
console.log("更新后的设置:", updated);

if (updated.baselineDb === targetDb && updated.baselineRms === mockRms) {
  console.log("✅ 校准设置保存成功。");
} else {
  console.error("❌ 校准设置保存失败。");
}

// 清理
resetNoiseControlSettings();
console.log("设置已重置。");
