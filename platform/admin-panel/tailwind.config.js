/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Status colors - higher contrast
        'status-pass': '#059669',      // Darker green for better visibility
        'status-fail': '#DC2626',      // Darker red
        'status-in-progress': '#D97706', // Darker amber
        'status-error': '#4B5563',      // Darker gray
        // Primary brand colors
        'primary': {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },
        // Framework badge colors
        'framework': {
          hipaa: '#2563EB',
          soc2: '#7C3AED',
          iso27001: '#059669',
          cis: '#DC2626',
          nist: '#D97706',
          'pci-dss': '#EA580C',
          gdpr: '#0284C7',
          fedramp: '#1E40AF',
        },
      },
    },
  },
  plugins: [],
}

