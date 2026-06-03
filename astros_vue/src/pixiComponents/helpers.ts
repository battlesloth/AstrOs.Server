import { CanvasTextMetrics, TextStyle, Text } from 'pixi.js';

export function getText(text: string, color: number, size: number): Text {
  const style = new TextStyle({
    fontFamily: 'Arial',
    fontSize: size,
    fill: color,
  });

  const rowText = new Text({
    text: text,
    style: style,
  });
  return rowText;
}

export function getTruncatedText(
  text: string,
  color: number,
  maxWidth: number,
  size: number,
): Text {
  const style = new TextStyle({
    fontFamily: 'Arial',
    fontSize: size,
    fill: color,
  });

  const t = truncateText(text, style, maxWidth);

  return new Text({
    text: t,
    style: style,
  });
}

export function truncateText(text: string, style: TextStyle, maxWidth: number) {
  const metrics = CanvasTextMetrics.measureText(text, style);

  if (metrics.width <= maxWidth) return text;

  let currentText = text;
  while (
    currentText.length > 0 &&
    CanvasTextMetrics.measureText(currentText + '...', style).width > maxWidth
  ) {
    currentText = currentText.substring(0, currentText.length - 1);
  }

  return currentText + '...';
}
