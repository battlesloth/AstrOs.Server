import { CanvasTextMetrics, FillGradient, TextStyle, Text } from 'pixi.js';

export function getText(text: string, color: number, size: number): Text {
  const fill = new FillGradient(0, 0, 1, 1);
  fill.addColorStop(0, color);
  fill.addColorStop(1, color);

  const style = new TextStyle({
    fontFamily: 'Arial',
    fontSize: size,
    fill: fill,
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
  return getTruncatedGradientText(text, color, color, maxWidth, size);
}

export function getTruncatedGradientText(
  text: string,
  colorStart: number,
  colorEnd: number,
  maxWidth: number,
  size: number,
): Text {
  const fill = new FillGradient(0, 0, 1, 1);
  fill.addColorStop(0, colorStart);
  fill.addColorStop(1, colorEnd);

  const style = new TextStyle({
    fontFamily: 'Arial',
    fontSize: size,
    fill: fill,
  });

  const t = truncateText(text, style, maxWidth);

  const rowText = new Text({
    text: t,
    style: style,
  });
  return rowText;
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
