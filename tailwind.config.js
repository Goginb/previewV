/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        themeText: {
          100: 'var(--theme-text-100)',
          200: 'var(--theme-text-200)',
          300: 'var(--theme-text-300)',
          400: 'var(--theme-text-400)',
          500: 'var(--theme-text-500)',
        },
        themeBg: {
          hover: 'var(--theme-bg-hover)',
          active: 'var(--theme-bg-active)',
        }
      }
    },
  },
  plugins: [],
}
