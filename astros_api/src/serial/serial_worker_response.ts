import { ControlModule } from 'src/models/index.js';

export enum SerialWorkerResponseType {
  UNKNOWN,
  TIMEOUT,
  POLL,
  REGISTRATION_SYNC,
  CONFIG_SYNC,
  SCRIPT_DEPLOY,
  SCRIPT_RUN,
  SEND_SERIAL_MESSAGE,
  UPDATE_CLIENTS,
}

export interface ISerialWorkerResponse extends Record<string, any> {
  type: SerialWorkerResponseType;
}

export interface PollRepsonse extends ISerialWorkerResponse {
  type: SerialWorkerResponseType;
  controller: ControlModule;
}

export interface RegistrationResponse extends ISerialWorkerResponse {
  type: SerialWorkerResponseType;
  success: boolean;
  registrations: Array<ControlModule>;
}

export interface ConfigSyncResponse extends ISerialWorkerResponse {
  type: SerialWorkerResponseType;
  success: boolean;
  controller: ControlModule;
}

export interface ScriptDeployResponse extends ISerialWorkerResponse {
  type: SerialWorkerResponseType;
  success: boolean;
  scriptId: string;
  controller: ControlModule;
}

export interface ScriptRunResponse extends ISerialWorkerResponse {
  type: SerialWorkerResponseType;
  success: boolean;
  scriptId: string;
  controller: ControlModule;
}
