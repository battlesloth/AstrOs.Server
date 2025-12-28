import { CanvasTextMetrics, TextStyle } from 'pixi.js';

export function truncateText(text: string, style: TextStyle, maxWidth: number) {
  let metrics = CanvasTextMetrics.measureText(text, style);

  if (metrics.width <= maxWidth) return text;

  let currentText = text;
  while (currentText.length > 0 && CanvasTextMetrics.measureText(currentText + '...', style).width > maxWidth) {
    currentText = currentText.substring(0, currentText.length - 1);
  }

  return currentText + '...';
}