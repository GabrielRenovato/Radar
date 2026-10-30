const v = (n) => `var(--rd-${n})`;
const label = (t) => ({ bg: `var(--lb-${t}-bg)`, fg: `var(--lb-${t}-fg)` });

export default {
  theme: {
    extend: {
      colors: {
        layer: v('layer'),
        card: { DEFAULT: v('card'), hover: v('card-hover') },
        subtle: v('subtle'),
        input: v('input'),
        fg: { DEFAULT: v('fg'), 2: v('fg2'), 3: v('fg3') },
        stroke: { DEFAULT: v('stroke'), 2: v('stroke2') },
        accent: { DEFAULT: v('accent'), hover: v('accent-hover'), tint: v('accent-tint'), text: v('accent-text'), on: v('on-accent') },
        danger: { DEFAULT: v('danger'), tint: v('danger-tint'), text: v('danger-text') },
        warn: { DEFAULT: v('warn'), tint: v('warn-tint'), text: v('warn-text') },
        info: v('info'),
        label: Object.fromEntries(['red', 'orange', 'blue', 'violet', 'teal', 'indigo', 'neutral', 'green'].map((t) => [t, label(t)])),
      },
      borderRadius: { control: '4px', card: '6px', flyout: '8px' },
      boxShadow: { flyout: v('shadow') },
      fontFamily: {
        sans: ['"Segoe UI Variable Text"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"Cascadia Mono"', 'Consolas', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        label: ['11px', { lineHeight: '16px', fontWeight: '500' }],
        meta: ['12px', { lineHeight: '16px' }],
        body: ['13px', { lineHeight: '18px' }],
        title: ['13px', { lineHeight: '18px', fontWeight: '600' }],
        header: ['14px', { lineHeight: '18px', fontWeight: '600' }],
        subtitle: ['15px', { lineHeight: '20px', fontWeight: '600' }],
      },
    },
  },
};
