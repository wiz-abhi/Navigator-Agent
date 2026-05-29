/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        github: "#8B5CF6",
        gmail: "#EF4444",
        calendar: "#3B82F6",
        todoist: "#F97316",
        hn: "#F59E0B",
        devto: "#14B8A6",
        weather: "#0EA5E9"
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
