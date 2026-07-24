/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Concord brand
        brand: {
          50: '#E6FAF4',
          100: '#CCF5E9',
          200: '#99EAD3',
          300: '#66DFBD',
          400: '#33D5A7',
          500: '#00D9A6', // primary brand
          600: '#00A982',
          700: '#00805F',
          800: '#005740',
          900: '#002E22',
        },
        accent: {
          400: '#FF8585',
          500: '#FF6B6B', // coral secondary
          600: '#E54848',
        },
        // Yüzey skala (tabandan tepe doğru) — CSS değişkenleriyle tema desteği
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        surface: {
          1: 'rgb(var(--c-surface-1) / <alpha-value>)',
          2: 'rgb(var(--c-surface-2) / <alpha-value>)',
          3: 'rgb(var(--c-surface-3) / <alpha-value>)',
        },
        line: 'rgb(var(--c-line) / <alpha-value>)',
        ink: {
          primary: 'rgb(var(--c-ink-primary) / <alpha-value>)',
          secondary: 'rgb(var(--c-ink-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--c-ink-tertiary) / <alpha-value>)',
          muted: 'rgb(var(--c-ink-muted) / <alpha-value>)',
        },
        // Status
        status: {
          online: '#10B981',
          idle: '#F59E0B',
          dnd: '#EF4444',
          offline: '#6B7280',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(0, 217, 166, 0.4), 0 0 12px rgba(0, 217, 166, 0.25)',
      },
      animation: {
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.6 },
        },
      },
    },
  },
  plugins: [],
};
