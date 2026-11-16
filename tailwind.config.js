/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { navy: { DEFAULT: '#1c4973', dark: '#153a5c', light: '#2a5d8f' } },
      fontFamily: { sans: ['Arial', 'Helvetica', 'sans-serif'] },
    },
  },
  plugins: [],
};
