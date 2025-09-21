/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./pages/**/*.{js,ts,jsx,tsx}", "./utils/**/*.{ts,tsx}", "./styles/**/*.{css}"],
  theme: {
    extend: {
      colors: {
        brand: {
          red: "#E31C24",
          black: "#111111",
          gray: "#F4F6F8",
          darkgray: "#1F2937",
        },
      },
      boxShadow: {
        soft: "0 2px 10px rgba(0,0,0,0.06)",
      },
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
      },
    },
  },
  plugins: [],
};
