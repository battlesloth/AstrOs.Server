export enum ModalCallbackEvent{
    close,
    addChannel,
    addEvent,
    editEvent,
    removeEvent,
    delete
}


export class ModalResources{
    // confirmationModal
    public static readonly action = 'action';
    public static readonly message = 'message';
    public static readonly confirmEvent = 'confirmEvent';
    public static readonly closeEvent = 'closeEvent';

    // channel selection resources
    public static readonly controllers = 'controllers';
    public static readonly modules = 'modules';
    public static readonly channels = 'channels';

    // event resources
    public static readonly callbackType = 'callbackType';
    public static readonly scriptEvent = 'scriptEvent';


}