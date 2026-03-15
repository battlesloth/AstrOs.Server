import { MaestroBoard } from './maestro_board.js';

export class MaestroModule {
  boards: MaestroBoard[];

  constructor() {
    this.boards = new Array<MaestroBoard>();
  }
}
