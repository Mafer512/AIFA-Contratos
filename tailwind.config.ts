import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './index.html',
    './App.{ts,tsx,js,jsx}',
    './index.{ts,tsx,js,jsx}',
    './components/**/*.{ts,tsx,js,jsx}',
    './services/**/*.{ts,tsx,js,jsx}',
    './supabase/**/*.{ts,tsx,js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0F4C3A',
        secondary: '#B38E5D',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'soft-card': '0 10px 25px -15px rgba(15, 23, 42, 0.35)',
      },
    },
  },
  plugins: [],
};

export default config;
