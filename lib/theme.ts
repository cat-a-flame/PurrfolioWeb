import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';

const config = defineConfig({
  theme: {
    tokens: {
      fonts: {
        body:    { value: "var(--font-figtree), sans-serif" },
        heading: { value: "var(--font-lora), serif" },
      },
    },
    semanticTokens: {
      colors: {
        // ── Accent palette (orange in light, magenta in dark) ──────────────
        accent: {
          solid:      { value: { base: '#f26e4d', _dark: '#d946a8' } },
          contrast:   { value: '#ffffff' },
          fg:         { value: { base: '#f26e4d', _dark: '#d946a8' } },
          muted:      { value: { base: '#fde8e2', _dark: '#3b1040' } },
          emphasized: { value: { base: '#fbc5b5', _dark: '#5a1842' } },
          focusRing:  { value: { base: '#f26e4d', _dark: '#d946a8' } },
        },

        // ── Danger palette ─────────────────────────────────────────────────
        danger: {
          solid:      { value: { base: '#dc2626', _dark: '#f43f5e' } },
          contrast:   { value: '#ffffff' },
          fg:         { value: { base: '#dc2626', _dark: '#f43f5e' } },
          muted:      { value: { base: '#fee2e2', _dark: '#3d0a1a' } },
          emphasized: { value: { base: '#fecaca', _dark: '#5e1225' } },
          focusRing:  { value: { base: '#dc2626', _dark: '#f43f5e' } },
        },

        // ── Gray-ish neutral for outline/ghost borders ─────────────────────
        neutral: {
          solid:      { value: { base: '#6b6760', _dark: '#a586c8' } },
          contrast:   { value: { base: '#1c1a17', _dark: '#f0e6ff' } },
          fg:         { value: { base: '#6b6760', _dark: '#a586c8' } },
          muted:      { value: { base: '#f0ede7', _dark: '#231540' } },
          emphasized: { value: { base: '#e8e4dc', _dark: '#2d1c52' } },
          focusRing:  { value: { base: '#d9d5ce', _dark: '#3a2060' } },
        },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);
