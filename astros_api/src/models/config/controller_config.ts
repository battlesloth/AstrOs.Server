import { ControlModule } from "astros-common";
import { ServoConfig } from "./servo_config";

export class ControllerConfig{
    id: number;
    ip: string;
    servoChannels: Array<ServoConfig>;

    constructor(controller: ControlModule){
        this.id = controller.id;
        this.ip = controller.ipAddress;

        this.servoChannels = new Array<ServoConfig>();
    
        controller.servoModule.channels.forEach(ch =>{
            this.servoChannels.push(new ServoConfig(ch.id, ch.minPos, ch.maxPos, ch.enabled));
        })
    }
}