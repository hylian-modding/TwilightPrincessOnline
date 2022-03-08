import { ProxySide } from "modloader64_api/SidedProxy/SidedProxy";
import { ITPOSyncSave } from "../types/TPAliases";

export interface ISaveSyncData {
    hash: string;
    createSave(): Buffer;
    forceOverrideSave(save: Buffer, storage: ITPOSyncSave, side: ProxySide): void;
    mergeSave(save: Buffer, storage: ITPOSyncSave, side: ProxySide): Promise<boolean>;
    applySave(save: Buffer): void;
}
