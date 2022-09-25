import { ITPOSyncSave } from "../types/TPAliases";
import { IKeyRing } from "./IKeyRing";
import { TPOEvents, TPOSaveDataItemSet } from "../api/TPOAPI";
import { bus } from "modloader64_api/EventHandler";
import { IModLoaderAPI } from "modloader64_api/IModLoaderAPI";
import { ProxySide } from "modloader64_api/SidedProxy/SidedProxy";
import { ISaveSyncData } from "./ISaveSyncData";
import { InventoryItem, ITPCore, Shield, Sword } from 'TwilightPrincess/API/TPAPI'
import WWSerialize from "../storage/TPSerialize";
import fs from 'fs';
import { parseFlagChanges } from "./parseFlagChanges";

export class TPOSaveData implements ISaveSyncData {

  private core: ITPCore;
  private ModLoader: IModLoaderAPI;
  hash: string = "";

  constructor(core: ITPCore, ModLoader: IModLoaderAPI) {
    this.core = core;
    this.ModLoader = ModLoader;
  }

  private generateWrapper(): ITPOSyncSave {
    let obj: any = {};
    let keys = [
      "inventory",
      "questStatus",
      "swords",
      "shields",
    ];

    obj = JSON.parse(JSON.stringify(this.core.save));
    let obj2: any = {};
    for (let i = 0; i < keys.length; i++) {
      obj2[keys[i]] = obj[keys[i]];
    }
    return obj2 as ITPOSyncSave;
  }

  createSave(): Buffer {
    let obj = this.generateWrapper();
    let buf = WWSerialize.serializeSync(obj);
    this.hash = this.ModLoader.utils.hashBuffer(buf);
    return buf;
  }

  private processBoolLoop(obj1: any, obj2: any) {
    Object.keys(obj1).forEach((key: string) => {
      if (typeof (obj1[key]) === 'boolean') {
        if (obj1[key] === true && obj2[key] === false) {
          obj2[key] = true;
          bus.emit(TPOEvents.SAVE_DATA_ITEM_SET, new TPOSaveDataItemSet(key, obj2[key]));
        }
      }
    });
  }

  private processMixedLoop(obj1: any, obj2: any, blacklist: Array<string>) {
    Object.keys(obj1).forEach((key: string) => {
      if (blacklist.indexOf(key) > -1) return;
      if (typeof (obj1[key]) === 'boolean') {
        if (obj1[key] === true && obj2[key] === false) {
          obj2[key] = obj1[key];
          bus.emit(TPOEvents.SAVE_DATA_ITEM_SET, new TPOSaveDataItemSet(key, obj2[key]));
        }
      } else if (typeof (obj1[key]) === 'number') {
        if (obj1[key] > obj2[key]) {
          obj2[key] = obj1[key];
          bus.emit(TPOEvents.SAVE_DATA_ITEM_SET, new TPOSaveDataItemSet(key, obj2[key]));
        }
      }
    });
  }

  private processBoolLoop_OVERWRITE(obj1: any, obj2: any) {
    Object.keys(obj1).forEach((key: string) => {
      if (typeof (obj1[key]) === 'boolean') {
        obj2[key] = obj1[key];
      }
    });
  }

  private processMixedLoop_OVERWRITE(obj1: any, obj2: any, blacklist: Array<string>) {
    Object.keys(obj1).forEach((key: string) => {
      if (blacklist.indexOf(key) > -1) return;
      if (typeof (obj1[key]) === 'boolean') {
        obj2[key] = obj1[key];
      } else if (typeof (obj1[key]) === 'number') {
        obj2[key] = obj1[key];
      }
    });
  }

  private isGreaterThan(obj1: number, obj2: number) {
    if (obj1 === 255) obj1 = 0;
    if (obj2 === 255) obj2 = 0;
    return (obj1 > obj2);
  }

  private isNotEqual(obj1: number, obj2: number) {
    if (obj1 === 255) obj1 = 0;
    if (obj2 === 255) obj2 = 0;
    return (obj1 !== obj2);
  }

  forceOverrideSave(save: Buffer, storage: ITPOSyncSave, side: ProxySide) {
    try {
      let obj: ITPOSyncSave = WWSerialize.deserializeSync(save);

      this.processMixedLoop_OVERWRITE(obj.inventory, storage.inventory, ["addItemSlot", "getItem"]);
      this.processMixedLoop_OVERWRITE(obj.questStatus, storage.questStatus, [])
      this.processMixedLoop_OVERWRITE(obj.swords, storage.swords, []);
      this.processMixedLoop_OVERWRITE(obj.shields, storage.shields, []);

      storage.questStatus.goldenBugs = obj.questStatus.goldenBugs;
      storage.inventory.fishingRod = obj.inventory.fishingRod;
      storage.inventory.clawshot = obj.inventory.clawshot;
      storage.inventory.ooccoo = obj.inventory.ooccoo;
      storage.inventory.sketch_memo = obj.inventory.sketch_memo;
      storage.inventory.skyBook = obj.inventory.skyBook;
      storage.inventory.bottle1 = obj.inventory.bottle1;
      storage.inventory.bottle2 = obj.inventory.bottle2;
      storage.inventory.bottle3 = obj.inventory.bottle3;
      storage.inventory.bottle4 = obj.inventory.bottle4;

      storage.inventory.bombBag1 = obj.inventory.bombBag1;
      storage.inventory.bombBag2 = obj.inventory.bombBag2;
      storage.inventory.bombBag3 = obj.inventory.bombBag3;
      storage.inventory.ooccoo = obj.inventory.ooccoo;
      storage.inventory.ooccoo = obj.inventory.sketch_memo;
      storage.inventory.skyBook = obj.inventory.skyBook;

      //storage.eventFlags = obj.eventFlags;
      //storage.regionFlags = obj.regionFlags;

    } catch (err: any) {
      console.log(err.stack);
    }
  }


  mergeSave(save: Buffer, storage: ITPOSyncSave, side: ProxySide): Promise<boolean> {
    return new Promise((accept, reject) => {
      WWSerialize.deserialize(save).then((obj: ITPOSyncSave) => {
        //console.log(obj)

        if (obj.questStatus.max_hp > storage.questStatus.max_hp && obj.questStatus.max_hp <= 100) {
          storage.questStatus.max_hp = obj.questStatus.max_hp;
          bus.emit(TPOEvents.GAINED_PIECE_OF_HEART, {});
        }
        if (storage.questStatus.max_hp > 100) storage.questStatus.max_hp = 100;


        this.processMixedLoop(obj.inventory, storage.inventory, ["addItemSlot", "getItem"]);
        this.processMixedLoop(obj.questStatus, storage.questStatus, [])
        this.processMixedLoop(obj.swords, storage.swords, []);
        this.processMixedLoop(obj.shields, storage.shields, []);

        let goldenBugs = storage.questStatus.goldenBugs;

        parseFlagChanges(obj.questStatus.goldenBugs, goldenBugs);

        storage.questStatus.goldenBugs = goldenBugs;

        if (obj.inventory.fishingRod === InventoryItem.fishingRod || obj.inventory.fishingRod === InventoryItem.fishingRodEaring) {
          storage.inventory.fishingRod = obj.inventory.fishingRod;
        }
        if (obj.inventory.clawshot > storage.inventory.clawshot) storage.inventory.clawshot = obj.inventory.clawshot;
        if (obj.inventory.ooccoo !== storage.inventory.ooccoo) storage.inventory.ooccoo = obj.inventory.ooccoo;
        if (obj.inventory.sketch_memo !== storage.inventory.sketch_memo) storage.inventory.sketch_memo = obj.inventory.sketch_memo;
        if (obj.inventory.skyBook !== storage.inventory.skyBook) storage.inventory.skyBook = obj.inventory.skyBook;
        if (obj.inventory.bottle1 !== storage.inventory.bottle1) storage.inventory.bottle1 = obj.inventory.bottle1;
        if (obj.inventory.bottle2 !== storage.inventory.bottle2) storage.inventory.bottle2 = obj.inventory.bottle2;
        if (obj.inventory.bottle3 !== storage.inventory.bottle3) storage.inventory.bottle3 = obj.inventory.bottle3;
        if (obj.inventory.bottle4 !== storage.inventory.bottle4) storage.inventory.bottle4 = obj.inventory.bottle4;

        if (obj.inventory.bombBag1 !== storage.inventory.bombBag1) {
          if(obj.inventory.bombBag1 !== InventoryItem.bombEmpty) {
            storage.inventory.bombBag1 = obj.inventory.bombBag1;
          }
          else {
            this.ModLoader.utils.setTimeoutFrames( ()=> {
              storage.inventory.bombBag1 = obj.inventory.bombBag1
            }, 60);
          }
        }
        if (obj.inventory.bombBag2 !== storage.inventory.bombBag2) {
          if(obj.inventory.bombBag2 !== InventoryItem.bombEmpty) {
            storage.inventory.bombBag2 = obj.inventory.bombBag2;
          }
          else {
            this.ModLoader.utils.setTimeoutFrames( ()=> {
              storage.inventory.bombBag2 = obj.inventory.bombBag2
            }, 60);
          }
        }
        if (obj.inventory.bombBag3 !== storage.inventory.bombBag3) {
          if(obj.inventory.bombBag3 !== InventoryItem.bombEmpty) {
            storage.inventory.bombBag3 = obj.inventory.bombBag3;
          }
          else {
            this.ModLoader.utils.setTimeoutFrames( ()=> {
              storage.inventory.bombBag3 = obj.inventory.bombBag3
            }, 60);
          }
        }
        
        if (obj.inventory.ooccoo !== storage.inventory.ooccoo) storage.inventory.ooccoo = obj.inventory.ooccoo;
        if (obj.inventory.sketch_memo !== storage.inventory.sketch_memo) storage.inventory.ooccoo = obj.inventory.sketch_memo;
        if (obj.inventory.skyBook !== storage.inventory.skyBook) storage.inventory.skyBook = obj.inventory.skyBook;

        accept(true);
      }).catch((err: string) => {
        console.log(err);
        reject(false);
      });
    });
  }

  applySave(save: Buffer) {
    this.mergeSave(save, this.core.save as any, ProxySide.CLIENT).then((bool: boolean) => { }).catch((bool: boolean) => { });
  }

}