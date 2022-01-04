export enum ModalCallbackEvent{
    close,
    addChannel,
    addEvent,
    editEvent,
    removeEvent
}


export class ModalResources{
    // channel selection resources
    public static readonly controllers = 'controllers';
    public static readonly modules = 'modules';
    public static readonly channels = 'channels';

    // event resources
    public static readonly callbackType = 'callbackType';
    public static readonly scriptEvent = 'scriptEvent';
}