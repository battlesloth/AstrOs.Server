import { SerialWorkerResponseType } from "./serial_message";

export interface ISerialWorkerResponse extends Record<string, any> {
    type: SerialWorkerResponseType
}