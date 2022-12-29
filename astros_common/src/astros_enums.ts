export enum ControllerType {
    none = 0,
    core = 1,
    dome = 2,
    body = 3,
    audio = 4
}

export enum ChannelType {
    none = 0,
    uart = 1,
    i2c = 2,
    servo = 3,
    audio = 4
}

export enum ChannelSubType {
    none = 0,
    genericSerial = 1,
    kangaroo = 2
}

export enum UartType{
    none,
    genericSerial,
    kangaroo
}

export enum UploadStatus {
    notUploaded,
    uploading,
    uploaded,
}