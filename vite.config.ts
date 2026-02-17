import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite 配置文件
 * 用于配置开发服务器、构建选项和插件
 */
export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0', // 允许外部访问
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'), // 配置路径别名
        }
      }
    };
});
