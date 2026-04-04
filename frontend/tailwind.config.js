/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        panel: '0 24px 80px rgba(15, 23, 42, 0.12)',
      },
    },
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: [
      {
        agilerr: {
          primary: '#0f766e',
          secondary: '#2563eb',
          accent: '#ea580c',
          neutral: '#1f2937',
          'base-100': '#f7f4ec',
          'base-200': '#efe7d5',
          'base-300': '#e2d4ba',
          info: '#2563eb',
          success: '#15803d',
          warning: '#ca8a04',
          error: '#b91c1c',
        },
      },
    ],
  },
}
