import { Assets } from 'pixi.js';
import swapIcon from '@/pixiComponents/assets/swap.svg';
import deleteIcon from '@/pixiComponents/assets/trash.svg';
import playIcon from '@/pixiComponents/assets/play.svg';
import arrowDown from '@/pixiComponents/assets/arrow_down.svg';
import arrowUp from '@/pixiComponents/assets/arrow_up.svg';
import home from '@/pixiComponents/assets/home.svg';
import i2c from '@/pixiComponents/assets/i2c.svg';
import start from '@/pixiComponents/assets/play_bordered.svg';
import serial from '@/pixiComponents/assets/serial.svg';
import dial from '@/pixiComponents/assets/dial.svg';
import pointer from '@/pixiComponents/assets/pointer.svg';
import none from '@/pixiComponents/assets/none.svg';
import servo from '@/pixiComponents/assets/servo.svg';
import servo_arm from '@/pixiComponents/assets/servo_arm.svg';

export async function loadAssets() {
  Assets.addBundle('assets', [
    { alias: 'swapIcon', src: swapIcon },
    { alias: 'deleteIcon', src: deleteIcon },
    { alias: 'playIcon', src: playIcon },
    { alias: 'arrowDown', src: arrowDown },
    { alias: 'arrowUp', src: arrowUp },
    { alias: 'home', src: home },
    { alias: 'i2c', src: i2c },
    { alias: 'start', src: start },
    { alias: 'serial', src: serial },
    { alias: 'dial', src: dial },
    { alias: 'pointer', src: pointer },
    { alias: 'none', src: none },
    { alias: 'servo', src: servo },
    { alias: 'servo_arm', src: servo_arm },
  ]);

  await Assets.loadBundle('assets');
}
