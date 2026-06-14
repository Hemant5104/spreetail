/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#093C5D',
        secondary: '#3B7597',
        accent1: '#6FD1D7',
        accent2: '#5DF8D8',
      },
      backgroundImage: {
        'glass-gradient': 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0))',
      }
    },
  },
  plugins: [],
}
