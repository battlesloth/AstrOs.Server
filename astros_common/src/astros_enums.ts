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

export enum ControllerStatus {
    up,
    needsSynced,
    down,
}

export enum TransmissionType{
    script,
    sync,
    status,
    run,
    panic,
    directCommand
}

export enum TransmissionStatus{
    unknown,
    sending,
    success,
    failed
}

export enum DirectCommnandType{
    servo,
    i2c,
    uart
}