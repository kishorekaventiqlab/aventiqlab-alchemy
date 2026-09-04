// A light, high-contrast theme: a soft blue-white canvas rather than a dark navy
// one, so the video reads clearly at 1080p and in compressed playback. The accent
// blue is kept punchy against the light ground; dark-on-dark elements (terminal)
// are the one deliberate exception, since a terminal is expected to look like a
// terminal.
export const theme = {
  bg: '#eef3fb',
  bgGradientStart: '#f7fafd',
  panelBg: '#ffffff',
  panelBorder: '#c7d6ec',
  text: '#101828',
  textDim: '#475467',
  accent: '#1d6fd6',
  accentStrong: '#0f4fa3',
  danger: '#d64545',
  success: '#1f9d63',
  warning: '#b8860b',
  captionBg: 'rgba(255, 255, 255, 0.96)',
  captionBorder: '#c7d6ec',
  terminalBg: '#0e1420',
  terminalBorder: '#2a3550',
  terminalText: '#d7e0f2',
  terminalDim: '#8b9bc0',
  fontFamily:
    "'Segoe UI', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  monoFontFamily: "'Cascadia Code', 'Consolas', 'SFMono-Regular', monospace",

  // Mobile-first visual design tokens (added after a real iPhone-15 review
  // found the rendered video hard to read: small text, low information
  // density awareness, empty space, and a caption bar reproducing entire
  // narration sentences at small size). These are 1080p-canvas starting
  // points, not absolutes — every component should read from these instead
  // of a private literal, so tuning readability is a token change, not a
  // per-component hunt. See docs/mobile-visual-qa.md for the acceptance bar.
  fontSize: {
    title: 60,
    kicker: 26,
    subtitle: 32,
    diagramLabel: 30,
    diagramSublabel: 22,
    cardHeading: 32,
    cardBody: 28,
    code: 30,
    onScreenText: 30,
    highlighted: 36,
    captionKeyIdea: 34,
  },
  spacing: {
    safeMarginX: 96,
    safeMarginY: 80,
    gap: { sm: 16, md: 28, lg: 44 },
  },
  density: {
    /** Max characters in one on-screen caption chunk before it must split. */
    maxCaptionChars: 90,
    /** Max characters in a card body/support line before a beat should split instead of shrinking. */
    maxCardBodyChars: 220,
    /** Soft ceiling on entities visible in one architecture/investigation frame. */
    maxEntitiesPerFrame: 6,
  },
};
