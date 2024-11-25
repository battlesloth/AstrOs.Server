export const enum ChannelType {
    none = 0,
    uart = 1,
    i2c = 2,
    servo = 3,
    audio = 4,
    gpio = 5,
}

export const enum ChannelSubType {
    none = 0,
    genericSerial = 1,
    kangaroo = 2,
    humanCyborgRelations = 3
}

export const enum UartType {
    none = 0,
    genericSerial = 1,
    kangaroo = 2,
    humanCyborgRelations = 3
}

export const enum UploadStatus {
    notUploaded,
    uploading,
    uploaded,
}

export const enum ControllerStatus {
    up,
    needsSynced,
    down,
}

export const enum TransmissionType {
    script,
    sync,
    status,
    controllers,
    run,
    panic,
    directCommand,
    formatSD,
    servoTest
}

export const enum TransmissionStatus {
    unknown,
    sending,
    success,
    failed
}

export const enum DirectCommnandType {
    servo,
    i2c,
    uart
}

export const enum HumanCyborgRelationsCmd {
    mildHappy = 1,
    extremeHappy = 2,
    mildSad = 3,
    extremeSad = 4,
    mildAngry = 5,
    extremeAngry = 6,
    mildScared = 7,
    extremeScared = 8,
    overload = 9,
    enableMuse = 10,
    disableMuse = 11,
    toggleMuse = 12,
    triggerMusing = 13,
    minSecondsBetweenMusings = 14,
    maxSecondsBetweenMusings = 15,
    playWavOnA = 16,
    playWavOnB = 17,
    playSdRandomOnA = 18,
    playSdRandomOnB = 19,
    panicStop = 20,
    gracefulStop = 21,
    stopWavOnA = 22,
    stopWavOnB = 23,
    vocalizerVolume = 24,
    wavAVolume = 25,
    wavBVolume = 26,
    enableImprov = 27,
    enableCanonical = 28,
    enablePersonalityOverride = 29,
    disablePersonalityOverride = 30,
    zeroEmotions = 31,
    setHappyLevel = 32,
    setSadLevel = 33,
    setMadLevel = 34,
    setScaredLevel = 35
}

export const enum HcrCommandCategory {
    none,
    stimuli,
    muse,
    sdWav,
    stop,
    volume,
    override
}