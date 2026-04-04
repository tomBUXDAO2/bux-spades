/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Plus Jakarta Sans"',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
      },
      colors: {
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
      },
      backgroundImage: {
        'lobby-mesh':
          'radial-gradient(ellipse 100% 70% at 50% -25%, rgba(34, 211, 238, 0.14), transparent 55%), radial-gradient(ellipse 55% 45% at 100% 100%, rgba(139, 92, 246, 0.12), transparent 50%), linear-gradient(165deg, #070b14 0%, #0c1224 45%, #0f172a 100%)',
      },
      boxShadow: {
        lobby:
          '0 0 0 1px rgba(255,255,255,0.06), 0 18px 50px -15px rgba(0,0,0,0.55)',
        'lobby-sm': '0 0 0 1px rgba(255,255,255,0.05), 0 8px 24px -8px rgba(0,0,0,0.45)',
      },
    },
  },
  plugins: [],
} 