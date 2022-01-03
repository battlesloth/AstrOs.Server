export enum ModalCallbackEvent{
    close,
    addChannel,
    addI2cEvent,
    addPwmEvent,
    addUartEvent,
    addAudioEvent
}


export class ModalResources{
        
    public static readonly controllers = 'controllers';
    public static readonly modules = 'modules';
    public static readonly channels = 'channels'

}