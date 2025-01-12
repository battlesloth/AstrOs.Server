import { MaestroBoard } from "./maestro_board";

export class MaestroModule {
  boards: MaestroBoard[];

  constructor() {
    this.boards = new Array<MaestroBoard>();
  }
}
