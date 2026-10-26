import { defineConfig } from 'vite';

// base './' => đường dẫn tương đối, chạy đúng ở https://username.github.io/ten-repo/ mà không cần sửa tay.
// Nếu dùng tên miền riêng đặt ở gốc, vẫn chạy bình thường.
export default defineConfig({
  base: process.env.VITE_BASE || './',
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1200 },
});
