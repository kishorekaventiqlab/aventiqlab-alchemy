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
};
