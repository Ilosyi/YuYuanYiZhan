/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // 扫描src下所有文件以应用样式
  ],
  theme: {
    extend: {}, // 可以在这里扩展自定义主题
  },
  plugins: [
    require('@tailwindcss/line-clamp'), // 用于实现多行文本截断
  ],
}