/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { navy: { DEFAULT: 'rgb(var(--bar) / <alpha-value>)', dark: 'rgb(var(--bar-dark) / <alpha-value>)', light: '#2a5d8f' } },
      fontFamily: { sans: ['var(--font)'] },
    },
  },
  plugins: [],
};
