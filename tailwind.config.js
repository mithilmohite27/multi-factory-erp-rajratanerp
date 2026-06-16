/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f2f8f6",
          100: "#dcece7",
          500: "#2f7564",
          600: "#245e51",
          700: "#1f4c43",
          800: "#1b3f38",
          900: "#173a32",
        },
        sand: {
          50: "#fcfaf5",
          100: "#f6f0e4",
          300: "#deca9f",
          500: "#b88b3d",
        },
      },
      boxShadow: {
        panel: "0 12px 35px -18px rgba(23, 58, 50, 0.25)",
      },
    },
  },
  plugins: [],
};
