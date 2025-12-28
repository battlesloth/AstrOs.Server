import { Assets } from "pixi.js";
import swapIcon from '@/pixiComponents/assets/swap.svg'
import deleteIcon from '@/pixiComponents/assets/trash.svg';
import playIcon from '@/pixiComponents/assets/play.svg';

export async function loadAssets() {
  Assets.addBundle('assets', [
    { alias: 'swapIcon', src: swapIcon },
    { alias: 'deleteIcon', src: deleteIcon },
    { alias: 'playIcon', src: playIcon },
  ]);

  await Assets.loadBundle('assets');
}