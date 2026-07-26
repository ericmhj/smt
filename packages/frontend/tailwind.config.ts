import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        kanban: {
          validado: '#22c55e',
          rechazado: '#ef4444',
          pendiente: '#eab308',
          'en-revision': '#3b82f6',
          finalizado: '#6b7280',
        },
      },
    },
  },
  plugins: [typography],
};

export default config;
