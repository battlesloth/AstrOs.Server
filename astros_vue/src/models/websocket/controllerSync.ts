import type { BaseWsMessage } from "./baseWsMessage";
import type { ControllerModule } from "../controllers/modules/controlModule";

export interface ControllerSync extends BaseWsMessage {
  controllers: Array<ControllerModule>;
}