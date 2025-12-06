import { Container, Graphics } from 'pixi.js';

/**
 * Creates a circular button with icon and hover effects
 */
export function createCircularButton(
  x: number,
  y: number,
  radius: number,
  drawIcon: (g: Graphics, radius: number) => void,
  onTap: () => void,
): Container {
  const button = new Container();
  button.x = x;
  button.y = y;
  button.eventMode = 'static';
  button.cursor = 'pointer';

  const circle = new Graphics().circle(radius, radius, radius).fill(0x4a90e2);

  button.addChild(circle);

  // Draw icon
  const icon = new Graphics();
  drawIcon(icon, radius);
  button.addChild(icon);

  // Hover effect
  button.on('pointerover', () => {
    circle.clear().circle(radius, radius, radius).fill(0x5aa0f2);
  });

  button.on('pointerout', () => {
    circle.clear().circle(radius, radius, radius).fill(0x4a90e2);
  });

  button.on('pointertap', onTap);

  return button;
}

/**
 * Draws a plus icon (+ symbol)
 */
export function drawPlusIcon(g: Graphics, radius: number) {
  g.rect(radius - 6, radius - 1.5, 12, 3)
    .fill(0xffffff)
    .rect(radius - 1.5, radius - 6, 3, 12)
    .fill(0xffffff);
}

/**
 * Draws a minus icon (- symbol)
 */
export function drawMinusIcon(g: Graphics, radius: number) {
  g.rect(radius - 6, radius - 1.5, 12, 3).fill(0xffffff);
}
