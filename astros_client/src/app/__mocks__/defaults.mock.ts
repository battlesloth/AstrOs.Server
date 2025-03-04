import {
    AstrOsConstants,
    AstrOsLocationCollection,
    ControllerLocation,
    GpioChannel,
    GpioModule,
    I2cModule,
    ModuleSubType,
    UartModule,
    KangarooX2,
    MaestroModule,
    MaestroBoard,
    MaestroChannel
} from "astros-common";

type MockId = typeof MockCoreIds | typeof MockDomeIds | typeof MockBodyIds;

const MockCoreIds = {

    ID: '05080195-3c18-41cf-ab24-b23c9134d135',

    GPIO_IDS: [
        'd2a7c107-b269-484c-95d7-29de534ff7591234',
        'b06173fe-b82f-4854-af28-f5cfa4b532761235',
        '3edd7856-0690-4bd8-af6f-0dc7f37900dd',
        '34691845-5b85-42d5-97c5-be644e7cea57',
    ],

    I2C_MODULE_IDS: [ 
        '14d7ed41-d450-4b1e-ba6d-fa7109a0aa1f',
        'c4fc4e1f-a007-407b-b468-6375bde4010e',
        'b364eac4-45fa-4a81-b2c1-880441052400'
    ],

    SERIAL_MODULE_ID: '4ec68355-92b7-41b3-9164-6c92e9a47135',

    KANGAROO_MODULE_ID: 'c2f093f2-bffd-4b1f-9b2b-91d0ba9f57c4',

    MAESTRO_MODULE_ID: '651eeb8e-97a0-4ab8-a66b-d138d9597350',

    MAESTRO_BOARD_ID: '155b5e8b-0bf2-4d83-b827-871022411a46',

    MAESTRO_CH_IDS: [
        '61b31bea-3f00-4cb0-9bf1-4666c7f954c5',
        '5d1232d6-6cb3-4981-a286-3d94f7aedf16',
        '2e56d224-3d91-498b-b27b-6f5bd682f694',
        '7ff0f487-4760-49b9-8250-5c53e7bee980',
        'dfaeaea2-8dbd-4967-904b-8851814f3262',
        '9f2bb4da-c262-4d18-aab5-1ea85ebc0b1c'
    ],



} as const;


const MockDomeIds = {

    ID: 'fba9503f-be52-4cbe-a871-9fe49c32e898',

    GPIO_IDS: [
        '2bd6038f-9d8a-4482-84da-2c6dc71719dd',
        'd421bc25-5355-488b-8e55-4120580e281d',
        '69f03966-42fe-492d-90c0-2a66be28647d',
        '155fe897-c34d-4459-9d49-18988cdb473b',
    ],
    
    I2C_MODULE_IDS: [
        '80e60d60-349a-4c02-b08f-8e452167d319',
        '4ff0e55a-76da-41e5-8b4a-a895024e2ac0',
        '81a38910-e19a-48fb-9497-431fb882036f'
    ],

    SERIAL_MODULE_ID: 'd121a677-9bf6-4ea7-bc23-00d674abe004',

    KANGAROO_MODULE_ID: '86ceff06-9eef-4afe-9f8f-73851c99d01a',

    MAESTRO_MODULE_ID: '98224bd1-444c-4b96-b280-9d6e7180510b',

    MAESTRO_BOARD_ID: '3d95f587-fa82-4ea5-bd5e-afa2f047c234',

    MAESTRO_CH_IDS: [
        '03cbe420-14be-458b-a668-37d91e3d3894',
        '23cbeb27-7bd2-4c24-b6b4-3ce14088325b',
        'f67192d2-8d8b-408d-aab3-b6cbee613542',
        '6ec25844-5bcf-4d1d-8033-76f6a8c86817',
        '9ef1dbc5-6c5c-4b06-8fc6-e2251da51422',
        'abc49956-821d-4cfa-93ec-8ea60a34742e'
    ],

}

const MockBodyIds = {

    ID: '15714c3d-6b57-407f-a57e-9e4c36e2ed3c',

    GPIO_IDS: [
        'fa2ffd6a-e174-4263-9ed8-3072067759b8',
        '221c1386-e79a-4966-95b1-ba8bf612c7b4',
        '97237ddb-8e5a-4df2-8450-e949ab92b912',
        'eab533f1-7e54-4099-94b5-03f300fcd8c3',
    ],
    
    I2C_MODULE_IDS: [
        'b554081e-3e25-4983-b058-0e9736809535',
        '04854b7d-bec4-4f66-96db-5248ab2a8335',
        '0d4c8fea-8e3a-4d01-8230-d2838675f69c'
    ],

    SERIAL_MODULE_ID: '5b0f46e5-fec2-4b46-b8fa-21f53442fc6f',

    KANGAROO_MODULE_ID: 'f692491c-7a90-45da-9371-f7516ff7be15',

    MAESTRO_MODULE_ID: '87c7e15c-6c75-4a4b-8f86-f504dc2cdbc2',

    MAESTRO_BOARD_ID: '489d3e26-ae0b-41dd-8999-6847eee8547a',

    MAESTRO_CH_IDS: [
        '8c9b8841-5ce9-446d-bffb-3349c0865939',
        'cf93a062-04c5-4658-bb19-02ce32b6a7b9',
        'f2699843-9f35-4210-a431-18899bd08c94',
        '985fa355-6db9-49b1-abce-2b23aaf87068',
        '65c45fa5-f8fe-4eec-822e-2dee57eb4287',
        '4e85135a-37e1-4ce7-bf39-cf42e7138a96'
    ],
}

export function getDefaultMockLocations(): AstrOsLocationCollection {
    const locations = new AstrOsLocationCollection(
        new ControllerLocation(MockCoreIds.ID, AstrOsConstants.CORE, 'Core Location', 'fingerprint'),
        new ControllerLocation(MockDomeIds.ID, AstrOsConstants.DOME, 'Dome Location', 'fingerprint'),
        new ControllerLocation(MockBodyIds.ID, AstrOsConstants.BODY, 'Body Location', 'fingerprint'),
    );

    locations.bodyModule!.gpioModule = generateGpioModule(MockBodyIds);
    locations.domeModule!.gpioModule = generateGpioModule(MockDomeIds);
    locations.coreModule!.gpioModule = generateGpioModule(MockCoreIds);

    locations.bodyModule!.i2cModules = generateI2cModule(MockBodyIds);
    locations.domeModule!.i2cModules = generateI2cModule(MockDomeIds);
    locations.coreModule!.i2cModules = generateI2cModule(MockCoreIds);

    locations.bodyModule!.uartModules.push(generateSerialModule(MockBodyIds));
    locations.domeModule!.uartModules.push(generateSerialModule(MockDomeIds));
    locations.coreModule!.uartModules.push(generateSerialModule(MockCoreIds));

    locations.bodyModule!.uartModules.push(generateKangarooModule(MockBodyIds));
    locations.domeModule!.uartModules.push(generateKangarooModule(MockDomeIds));
    locations.coreModule!.uartModules.push(generateKangarooModule(MockCoreIds));

    locations.bodyModule!.uartModules.push(generateMaestroModule(MockBodyIds));
    locations.domeModule!.uartModules.push(generateMaestroModule(MockDomeIds));
    locations.coreModule!.uartModules.push(generateMaestroModule(MockCoreIds));

    return locations;

}


function generateGpioModule(ids: MockId) {

    const module = new GpioModule(ids.ID);

    for (let i = 0; i < ids.GPIO_IDS.length; i++) {
        module.channels.push(
            new GpioChannel(
                ids.GPIO_IDS[i], 
                module.id, i, 
                i % 2 === 0, 
                `GPIO CH ${i}`, 
                false
            )
        );
    }
    return module;
}

function generateI2cModule(ids: MockId) {

    const result: I2cModule[] = [];
    
    for (let i = 0; i < ids.I2C_MODULE_IDS.length; i++) {
        const module = new I2cModule(
            ids.I2C_MODULE_IDS[i], 
            `I2C CH ${i}`, 
            ids.ID,
            i,
            ModuleSubType.genericI2C);

            result.push(module);
    }
    
    return result;
}

function generateSerialModule(ids: MockId) {
    const module = new UartModule(
        ids.SERIAL_MODULE_ID,
        'Serial Channel',
        ids.ID,
        ModuleSubType.genericSerial,
        2,
        9600
    );

    return module;
}

function generateKangarooModule(ids: MockId) {
    const module = new UartModule(
        ids.KANGAROO_MODULE_ID,
        'Kangaroo Channel',
        ids.ID,
        ModuleSubType.kangaroo,
        2,
        9600
    );

    module.subModule = new KangarooX2(
        ids.KANGAROO_MODULE_ID,
        'Channel 1',
        'Channel 2'
    );

    return module;
}


function generateMaestroModule(ids: MockId) {
    const module = new UartModule(
        ids.MAESTRO_MODULE_ID,
        'Maestro Channel',
        ids.ID,
        ModuleSubType.maestro,
        2,
        9600
    );

    const board = new MaestroBoard(
        ids.MAESTRO_BOARD_ID,
        ids.MAESTRO_MODULE_ID,
        0,
        'Maestro Board',
        6 
    );

    for (let i = 0; i < ids.MAESTRO_CH_IDS.length; i++) {
        board.channels.push(
            new MaestroChannel(
                ids.MAESTRO_CH_IDS[i],
                ids.MAESTRO_BOARD_ID,
                `Maestro CH ${i}`,
                true,
                i,
                i % 2 === 0,
                500,
                2500,
                1250,
                i % 3 === 0,
            )
        );
    }

    const subModule = new MaestroModule();

    subModule.boards.push(board);

    module.subModule = subModule;

    return module;
}
