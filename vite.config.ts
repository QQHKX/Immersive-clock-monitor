import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite 配置文件
 * 用于配置开发服务器、构建选项和插件
 */
export default defineConfig(({ mode }) => {
    // 加载环境变量
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0', // 允许外部访问
      },
      plugins: [react()],
      define: {
        // 注入环境变量
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'), // 配置路径别名
        }
      }
    };
});
