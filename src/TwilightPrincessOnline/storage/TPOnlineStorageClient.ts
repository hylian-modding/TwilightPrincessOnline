import { TPOnlineStorageBase } from './TPOnlineStorageBase';
import * as API from 'TwilightPrincess/API/TPAPI'
export class TPOnlineStorageClient extends TPOnlineStorageBase {
  world: number = 0;
  first_time_sync = false;
  lastPushHash = "!";
  localization: any = {};
  localization_island: any = {};
  scene_keys: any = {};
  room_keys: any = {};
  flagHash: string = "";
  autoSaveHash!: string;
}
