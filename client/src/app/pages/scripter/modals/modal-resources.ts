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
    public static readonly channelId = 'channelId';
    public static readonly eventId = 'eventId';
    public static readonly time = 'time';
    public static readonly payload = 'payload'; 
}