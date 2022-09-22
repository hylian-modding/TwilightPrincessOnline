import { ITPOSyncSave } from '../types/TPAliases';
import { TPOnlineStorageBase } from './TPOnlineStorageBase';
import * as API from 'TwilightPrincess/API/imports';
import { IInventory, IQuestStatus, IShields, ISwords } from 'TwilightPrincess/API/imports';

export class TPOnlineStorage extends TPOnlineStorageBase {
  networkPlayerInstances: any = {};
  players: any = {};
  worlds: Array<TPOnlineSave_Server> = [];
  saveGameSetup = false;
}

export interface ITPOSyncSaveServer extends ITPOSyncSave {
}

class TPOSyncSaveServer implements ITPOSyncSaveServer {
  inventory!: IInventory;
  questStatus!: IQuestStatus;
  swords!: ISwords;
  shields!: IShields;
  eventFlags: Buffer = Buffer.alloc(0x100);
  regionFlags: Buffer = Buffer.alloc(0x400);
  liveFlags: Buffer = Buffer.alloc(0x20);
}

export class TPOnlineSave_Server {
  saveGameSetup = false;
  save: ITPOSyncSaveServer = new TPOSyncSaveServer();
}