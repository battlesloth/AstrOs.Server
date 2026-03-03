import { Generated, Insertable, Selectable, Updateable } from 'kysely';

export interface Database {
  settings: SettingsTable;
  users: UsersTable;
  remote_config: RemoteConfigTable;
  audio_files: AudioFilesTable;

  scripts: ScriptsTable;
  script_channels: ScriptChannelsTable;
  script_events: ScriptEventsTable;
  script_deployments: ScriptDeploymentsTable;

  controllers: ControllersTable;
  locations: LocationsTable;
  controller_locations: ControllerLocationsTable;

  gpio_channels: GpioChannelsTable;

  i2c_modules: I2CModulesTable;

  uart_modules: UartModulesTable;

  kangaroo_x2: KangarooX2Table;

  maestro_boards: MaestroBoardsTable;
  maestro_channels: MaestroChannelTable;
}

//#region Settings

export interface SettingsTable {
  id: Generated<number>;
  key: string;
  value: string;
}

export type Setting = Selectable<SettingsTable>;
export type NewSetting = Insertable<SettingsTable>;
export type SettingUpdate = Updateable<SettingsTable>;

//#endregion
//#region  Users

export interface UsersTable {
  id: Generated<number>;
  user: string;
  hash: string;
  salt: string;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;

//#endregion
//#region RemoteConfig

export interface RemoteConfigTable {
  id: Generated<number>;
  type: string;
  value: string;
}

export type RemoteConfig = Selectable<RemoteConfigTable>;
export type NewRemoteConfig = Insertable<RemoteConfigTable>;
export type RemoteConfigUpdate = Updateable<RemoteConfigTable>;

//#endregion
//#region AudioFiles

export interface AudioFilesTable {
  id: string;
  file_name: string;
  description: string;
  duration: number;
}

export type AudioFile = Selectable<AudioFilesTable>;
export type NewAudioFile = Insertable<AudioFilesTable>;
export type AudioFileUpdate = Updateable<AudioFilesTable>;

//#endregion
//#region Scripts

export interface ScriptsTable {
  id: string;
  name: string;
  description: string;
  last_modified: number;
  enabled: number;
}

export type Script = Selectable<ScriptsTable>;
export type NewScript = Insertable<ScriptsTable>;
export type ScriptUpdate = Updateable<ScriptsTable>;

//#endregion
//#region ScriptChannels

export interface ScriptChannelsTable {
  id: string;
  script_id: string;
  channel_type: number;
  parent_module_id: string;
  module_channel_id: string;
  module_channel_type: string;
}

export type ScriptChannel = Selectable<ScriptChannelsTable>;
export type NewScriptChannel = Insertable<ScriptChannelsTable>;
export type ScriptChannelUpdate = Updateable<ScriptChannelsTable>;

//#endregion
//#region ScriptEvents

export interface ScriptEventsTable {
  id: string;
  script_id: string;
  script_channel_id: string;
  module_type: number;
  module_sub_type: number;
  time: number;
  data: string;
}

export type ScriptEvent = Selectable<ScriptEventsTable>;
export type NewScriptEvent = Insertable<ScriptEventsTable>;
export type ScriptEventUpdate = Updateable<ScriptEventsTable>;

//#endregion
//#region ScriptDeployments

export interface ScriptDeploymentsTable {
  script_id: string;
  location_id: string;
  last_deployed: number;
}

export type ScriptDeployment = Selectable<ScriptDeploymentsTable>;
export type NewScriptDeployment = Insertable<ScriptDeploymentsTable>;
export type ScriptDeploymentUpdate = Updateable<ScriptDeploymentsTable>;

//#endregion
//#region Controllers

export interface ControllersTable {
  id: string;
  name: string;
  description: string;
  address: string;
}

export type Controller = Selectable<ControllersTable>;
export type NewController = Insertable<ControllersTable>;
export type ControllerUpdate = Updateable<ControllersTable>;

//#endregion
//#region Locations

export interface LocationsTable {
  id: string;
  name: string;
  description: string;
  config_fingerprint: string;
}

export type Location = Selectable<LocationsTable>;
export type NewLocation = Insertable<LocationsTable>;
export type LocationUpdate = Updateable<LocationsTable>;

//#endregion
//#region ControllerLocations

export interface ControllerLocationsTable {
  location_id: string;
  controller_id: string;
}

export type ControllerLocation = Selectable<ControllerLocationsTable>;
export type NewControllerLocation = Insertable<ControllerLocationsTable>;
export type ControllerLocationUpdate = Updateable<ControllerLocationsTable>;

//#endregion
//#region GpioChannels

export interface GpioChannelsTable {
  id: string;
  location_id: string;
  channel_number: number;
  name: string;
  default_high: number;
  enabled: number;
}

export type GpioChannel = Selectable<GpioChannelsTable>;
export type NewGpioChannel = Insertable<GpioChannelsTable>;
export type GpioChannelUpdate = Updateable<GpioChannelsTable>;

//#endregion
//#region I2C Modules

// idx is the primary key for modules,
// but why an index? Why not just use the id?
// We don't want to have to send UUIDs over the wire
// for every script event as that will blow up the message size
// so we use the index to reference the module in the script.
// Why not just use the index as the id?
// Becuase it's easier to catch errors in the web code if the id
// is a UUID since collisions are nearly impossible.

export interface I2CModulesTable {
  idx: Generated<number>;
  id: string;
  location_id: string;
  name: string;
  i2c_address: number;
  i2c_type: number;
}

export type I2CModule = Selectable<I2CModulesTable>;
export type NewI2CModule = Insertable<I2CModulesTable>;
export type I2CModuleUpdate = Updateable<I2CModulesTable>;

//#endregion
//#region UART Modules

export interface UartModulesTable {
  idx: Generated<number>;
  id: string;
  location_id: string;
  name: string;
  uart_type: number;
  uart_channel: number;
  baud_rate: number;
}

export type UartModule = Selectable<UartModulesTable>;
export type NewUartModule = Insertable<UartModulesTable>;
export type UartModuleUpdate = Updateable<UartModulesTable>;

//#endregion
//#region Kangaroo X2

export interface KangarooX2Table {
  id: string;
  parent_id: string;
  ch1_name: string;
  ch2_name: string;
}

export type KangarooX2 = Selectable<KangarooX2Table>;
export type NewKangarooX2 = Insertable<KangarooX2Table>;
export type UpdateKangarooX2 = Updateable<KangarooX2Table>;

//#endregion
//#region Maestro Boards

export interface MaestroBoardsTable {
  id: string;
  parent_id: string;
  board_id: number;
  name: string;
  channel_count: number;
}

export type MaestroBoard = Selectable<MaestroBoardsTable>;
export type NewMaestroBoard = Insertable<MaestroBoardsTable>;
export type UpdateMaestroBoard = Updateable<MaestroBoardsTable>;

//#endregion
//#region Maestro Channels

export interface MaestroChannelTable {
  id: string;
  board_id: string;
  channel_number: number;
  name: string;
  enabled: number;
  is_servo: number;
  min_pos: number;
  max_pos: number;
  home_pos: number;
  inverted: number;
}

export type MaestroChannel = Selectable<MaestroChannelTable>;
export type NewMaestroChannel = Insertable<MaestroChannelTable>;
export type UpdateMaestroChannel = Updateable<MaestroChannelTable>;

//#endregion
