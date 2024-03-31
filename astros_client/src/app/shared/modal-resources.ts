export enum ModalCallbackEvent {
    close,
    addChannel,
    addEvent,
    editEvent,
    removeEvent,
    removeChannel,
    channelTest,
    delete,
    refresh,
    formatSD
}


export class ModalResources {
    // script test modal
    public static readonly scriptId = 'scriptId';
    public static readonly locations = 'locations';

    // channel test modal
    public static readonly channelType = 'channelType';
    public static readonly channelSubType = 'channelSubType';
    public static readonly controllerType = 'controllerType';
    public static readonly channelId = 'channelId';

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

    // Uart module types
    public static readonly genericSerial = 'genericSerial';
    public static readonly kangaroo = 'kangaroo';

    // Servo module types
    public static readonly servoId = 'servoId';

    // I2c module types
    public static readonly i2cId = 'i2cId';


}