import { expect, describe, it } from "vitest";
import { MessageGenerator } from "./message_generator.js";
import { MessageHelper } from "./message_helper.js";
import { SerialMessageType } from "./serial_message.js";
import { ConfigSync } from "../models/config/config_sync.js";
import {
  ControlModule,
  ControllerLocation,
  GpioChannel,
  MaestroBoard,
  MaestroChannel,
  MaestroModule,
  ModuleSubType,
  UartModule,
} from "astros-common";
import { v4 as uuid } from "uuid";

const RS = MessageHelper.RS;
const GS = MessageHelper.GS;
const US = MessageHelper.US;

describe("Message Generator Tests", () => {
  it("generate Registraion sync", () => {
    const generator = new MessageGenerator();

    const message = generator.generateMessage(
      SerialMessageType.REGISTRATION_SYNC,
      "123",
      "payload",
    );

    expect(message.controllers.length).toBe(1);
    expect(message.controllers[0]).toBe("00:00:00:00:00:00");
    expect(message.msg).toBe(`1${RS}REGISTRATION_SYNC${RS}123\n`);
  });

  it("generate Deploy Config", () => {
    const generator = new MessageGenerator();

    const addr1 = "00:00:00:00:00:00";
    const ctrlName1 = "body";
    const idx1 = 4;

    const addr2 = "11:11:11:11:11:11";
    const ctrlName2 = "core";
    const idx2 = 9;

    const addr3 = "22:22:22:22:22:22";
    const ctrlName3 = "dome";
    const idx3 = 14;

    const locations = generateControllerLocations(
      addr1,
      ctrlName1,
      idx1,
      addr2,
      ctrlName2,
      idx2,
      addr3,
      ctrlName3,
      idx3,
    );

    const configSync = new ConfigSync(locations);

    const message = generator.generateMessage(
      SerialMessageType.DEPLOY_CONFIG,
      "123",
      configSync,
    );

    expect(message.msg).toBe(
      `5${RS}DEPLOY_CONFIG${RS}123${GS}` +
        `${addr1}${US}${ctrlName1}${US}5@1|0|1|0;1@${idx1}:1:9600@1:1:1:800:2000:1400:0|2:1:0:500:2500:1500:1` +
        RS +
        `${addr2}${US}${ctrlName2}${US}5@1|0|1|0;1@${idx2}:1:9600@1:1:1:800:2000:1400:0|2:1:0:500:2500:1500:1` +
        RS +
        `${addr3}${US}${ctrlName3}${US}5@1|0|1|0;1@${idx3}:1:9600@1:1:1:800:2000:1400:0|2:1:0:500:2500:1500:1\n`,
    );
  });
});

function generateControllerLocations(
  addr1: string,
  name1: string,
  idx1: number,
  addr2: string,
  name2: string,
  idx2: number,
  addr3: string,
  name3: string,
  idx3: number,
): ControllerLocation[] {
  const locations: ControllerLocation[] = [];

  locations.push(generateControllerLocation(name1, addr1, idx1));
  locations.push(generateControllerLocation(name2, addr2, idx2));
  locations.push(generateControllerLocation(name3, addr3, idx3));

  return locations;
}

function generateControllerLocation(
  name: string,
  address: string,
  maestroIdx: number,
): ControllerLocation {
  const location = new ControllerLocation(uuid(), name, "", "");

  location.controller = new ControlModule(uuid(), name, address);

  for (let i = 0; i < 4; i++) {
    location.gpioModule?.channels.push(
      new GpioChannel(uuid(), location.id, i, true, `GPIO ${i}`, i % 2 === 0),
    );
  }

  location.uartModules.push(generateMaestroModule(maestroIdx, name, address));

  return location;
}

function generateMaestroModule(
  idx: number,
  name: string,
  location: string,
): UartModule {
  const module = new UartModule(
    idx,
    uuid(),
    `Maestro ${idx}`,
    location,
    ModuleSubType.maestro,
    1,
    9600,
  );

  const subModule = new MaestroModule();
  subModule.boards.push(generateMaestroBoard(module.id));

  module.subModule = subModule;
  return module;
}

function generateMaestroBoard(parentId: string): MaestroBoard {
  const board = new MaestroBoard(uuid(), parentId, 0, "board", 24);

  board.channels.push(
    new MaestroChannel(
      uuid(),
      board.id,
      `channel 1`,
      true,
      1,
      true,
      800,
      2000,
      1400,
      false,
    ),
  );

  board.channels.push(
    new MaestroChannel(
      uuid(),
      board.id,
      `channel 2`,
      true,
      2,
      false,
      500,
      2500,
      1500,
      true,
    ),
  );

  return board;
}
