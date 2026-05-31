/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          400: '#818cf8',
          600: '#2b3180',
          700: '#1e2260',
          900: '#111440',
        },
        coral: {
          400: '#fb923c',
          500: '#f97316',
        },
      },
    },
  },
  plugins: [],
}
