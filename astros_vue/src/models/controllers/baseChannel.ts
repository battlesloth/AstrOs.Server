import type { ModuleSubType, ModuleType } from "../enums";

export interface BaseChannel {
    id: string;
    parentId: string;
    channelName: string;
    enabled: boolean;

    moduleType: ModuleType;
    moduleSubType: ModuleSubType;
}