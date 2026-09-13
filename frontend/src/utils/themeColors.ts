/** Keep customer branding while making filled actions readable (WCAG AA). */
export function actionColors(value: string) {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : '#2563eb';
  const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  const channels = rgb.map(channel => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  const darkText = luminance > 0.179;
  const hover = rgb.map(channel => darkText ? Math.round(channel + (255 - channel) * 0.08) : Math.round(channel * 0.88));
  return {
    background: hex,
    foreground: darkText ? '#000000' : '#ffffff',
    hover: `#${hover.map(channel => channel.toString(16).padStart(2, '0')).join('')}`,
  };
}