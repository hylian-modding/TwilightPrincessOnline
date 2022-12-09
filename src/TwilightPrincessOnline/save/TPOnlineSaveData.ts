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
      "eventFlags",
      "charloDonation",
      "maloDonation",
      "mapFlags",
      "itemFlags",
      "faronTears",
      "eldinTears",
      "lanayruTears",
      "fusedShadowFlags",
      "twilightMirrorFlags",
      "letterFlags",
      "stage0_Ordon",
      "stage1_Sewers",
      "stage2_Faron",
      "stage3_Eldin",
      "stage4_Laynaru",
      "stage5_Unk1",
      "stage6_CastleField",
      "stage7_SacredGrove",
      "stage8_Snowpeak",
      "stage9_CastleTown",
      "stageA_Gerudo",
      "stageB_FishingHole",
      "stageC_Unk2",
      "stageD_Unk3",
      "stageE_Unk4",
      "stageF_Unk5",
      "stage10_ForestTemple",
      "stage11_GoronMines",
      "stage12_LakebedTemple",
      "stage13_ArbitersGrounds",
      "stage14_SnowpeakRuins",
      "stage15_TempleOfTime",
      "stage16_CitySky",
      "stage17_PalaceTwilight",
      "stage18_HyruleCastle",
      "stage19_Cave1",
      "stage1A_Cave2",
      "stage1B_Grottos",
      "stage1C_Unk6",
      "stage1D_Unk7",
      "stage1E_Unk8",
      "stage1F_Unk9",
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
      } else if (Buffer.isBuffer(obj1[key])) {
        let tempBuf = obj2[key];
        parseFlagChanges(obj1[key], tempBuf);
        obj2[key] = tempBuf;
        bus.emit(TPOEvents.SAVE_DATA_ITEM_SET, new TPOSaveDataItemSet(key, obj2[key]));
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
      } else if (Buffer.isBuffer(obj1[key])) {
        let tempBuf = obj1[key];
        parseFlagChanges(obj2[key], tempBuf);
        obj1[key] = tempBuf;
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
      this.processMixedLoop_OVERWRITE(obj.questStatus, storage.questStatus, []);

      storage.questStatus.goldenBugs = obj.questStatus.goldenBugs;
      storage.inventory.fishingRod = obj.inventory.fishingRod;
      storage.inventory.clawshot = obj.inventory.clawshot;
      storage.inventory.questItem = obj.inventory.questItem;
      storage.inventory.skyBook = obj.inventory.skyBook;
      storage.inventory.bottle1 = obj.inventory.bottle1;
      storage.inventory.bottle2 = obj.inventory.bottle2;
      storage.inventory.bottle3 = obj.inventory.bottle3;
      storage.inventory.bottle4 = obj.inventory.bottle4;

      storage.inventory.bombBag1 = obj.inventory.bombBag1;
      storage.inventory.bombBag2 = obj.inventory.bombBag2;
      storage.inventory.bombBag3 = obj.inventory.bombBag3;
      storage.inventory.ooccoo = obj.inventory.ooccoo;
      storage.inventory.skyBook = obj.inventory.skyBook;

      storage.charloDonation = obj.charloDonation;
      storage.maloDonation = obj.maloDonation;
      storage.faronTears = obj.faronTears;
      storage.eldinTears = obj.eldinTears;
      storage.lanayruTears = obj.lanayruTears;

      storage.eventFlags = obj.eventFlags;
      storage.mapFlags = obj.mapFlags;
      storage.itemFlags = obj.itemFlags;
      storage.letterFlags = obj.letterFlags;
      storage.fusedShadowFlags = obj.fusedShadowFlags;
      storage.twilightMirrorFlags = obj.twilightMirrorFlags;

      this.processMixedLoop_OVERWRITE(obj.stage0_Ordon, storage.stage0_Ordon, []);
      this.processMixedLoop_OVERWRITE(obj.stage1_Sewers, storage.stage1_Sewers, []);
      this.processMixedLoop_OVERWRITE(obj.stage2_Faron, storage.stage2_Faron, []);
      this.processMixedLoop_OVERWRITE(obj.stage3_Eldin, storage.stage3_Eldin, []);
      this.processMixedLoop_OVERWRITE(obj.stage4_Laynaru, storage.stage4_Laynaru, []);
      this.processMixedLoop_OVERWRITE(obj.stage5_Unk1, storage.stage5_Unk1, []);
      this.processMixedLoop_OVERWRITE(obj.stage6_CastleField, storage.stage6_CastleField, []);
      this.processMixedLoop_OVERWRITE(obj.stage7_SacredGrove, storage.stage7_SacredGrove, []);
      this.processMixedLoop_OVERWRITE(obj.stage8_Snowpeak, storage.stage8_Snowpeak, []);
      this.processMixedLoop_OVERWRITE(obj.stage9_CastleTown, storage.stage9_CastleTown, []);
      this.processMixedLoop_OVERWRITE(obj.stageA_Gerudo, storage.stageA_Gerudo, []);
      this.processMixedLoop_OVERWRITE(obj.stageB_FishingHole, storage.stageB_FishingHole, []);
      this.processMixedLoop_OVERWRITE(obj.stageC_Unk2, storage.stageC_Unk2, []);
      this.processMixedLoop_OVERWRITE(obj.stageD_Unk3, storage.stageD_Unk3, []);
      this.processMixedLoop_OVERWRITE(obj.stageE_Unk4, storage.stageE_Unk4, []);
      this.processMixedLoop_OVERWRITE(obj.stageF_Unk5, storage.stageF_Unk5, []);
      this.processMixedLoop_OVERWRITE(obj.stage10_ForestTemple, storage.stage10_ForestTemple, []);
      this.processMixedLoop_OVERWRITE(obj.stage11_GoronMines, storage.stage11_GoronMines, []);
      this.processMixedLoop_OVERWRITE(obj.stage12_LakebedTemple, storage.stage12_LakebedTemple, []);
      this.processMixedLoop_OVERWRITE(obj.stage13_ArbitersGrounds, storage.stage13_ArbitersGrounds, []);
      this.processMixedLoop_OVERWRITE(obj.stage14_SnowpeakRuins, storage.stage14_SnowpeakRuins, []);
      this.processMixedLoop_OVERWRITE(obj.stage15_TempleOfTime, storage.stage15_TempleOfTime, []);
      this.processMixedLoop_OVERWRITE(obj.stage16_CitySky, storage.stage16_CitySky, []);
      this.processMixedLoop_OVERWRITE(obj.stage17_PalaceTwilight, storage.stage17_PalaceTwilight, []);
      this.processMixedLoop_OVERWRITE(obj.stage18_HyruleCastle, storage.stage18_HyruleCastle, []);
      this.processMixedLoop_OVERWRITE(obj.stage19_Cave1, storage.stage19_Cave1, []);
      this.processMixedLoop_OVERWRITE(obj.stage1A_Cave2, storage.stage1A_Cave2, []);
      this.processMixedLoop_OVERWRITE(obj.stage1B_Grottos, storage.stage1B_Grottos, []);
      this.processMixedLoop_OVERWRITE(obj.stage1C_Unk6, storage.stage1C_Unk6, []);
      this.processMixedLoop_OVERWRITE(obj.stage1D_Unk7, storage.stage1D_Unk7, []);
      this.processMixedLoop_OVERWRITE(obj.stage1E_Unk8, storage.stage1E_Unk8, []);
      this.processMixedLoop_OVERWRITE(obj.stage1F_Unk9, storage.stage1F_Unk9, []);


    } catch (err: any) {
      console.log(err.stack);
    }
  }


  mergeSave(save: Buffer, storage: ITPOSyncSave, side: ProxySide): Promise<boolean> {
    return new Promise((accept, reject) => {
      WWSerialize.deserialize(save).then((obj: ITPOSyncSave) => {

        if (obj.questStatus.max_hp > storage.questStatus.max_hp && obj.questStatus.max_hp <= 100) {
          storage.questStatus.max_hp = obj.questStatus.max_hp;
          bus.emit(TPOEvents.GAINED_PIECE_OF_HEART, {});
        }
        if (storage.questStatus.max_hp > 100) storage.questStatus.max_hp = 100;


        this.processMixedLoop(obj.inventory, storage.inventory, ["addItemSlot", "getItem"]);
        this.processMixedLoop(obj.questStatus, storage.questStatus, []);

        if (storage.charloDonation < obj.charloDonation) storage.charloDonation = obj.charloDonation;
        if (storage.maloDonation < obj.maloDonation) storage.maloDonation = obj.maloDonation;
        if (storage.faronTears < obj.faronTears) storage.faronTears = obj.faronTears;
        if (storage.eldinTears < obj.eldinTears) storage.eldinTears = obj.eldinTears;
        if (storage.lanayruTears < obj.lanayruTears) storage.lanayruTears = obj.lanayruTears;

        storage.mapFlags = obj.mapFlags;
        storage.itemFlags = obj.itemFlags;
        storage.letterFlags = obj.letterFlags;
        storage.fusedShadowFlags = obj.fusedShadowFlags;
        storage.twilightMirrorFlags = obj.twilightMirrorFlags;

        let mapFlags = storage.mapFlags;
        let itemFlags = storage.itemFlags;
        let letterFlags = storage.letterFlags;
        let fusedShadowFlags = storage.fusedShadowFlags;
        let twilightMirrorFlags = storage.twilightMirrorFlags;
        let goldenBugs = storage.questStatus.goldenBugs;

        parseFlagChanges(obj.mapFlags, mapFlags);
        parseFlagChanges(obj.itemFlags, itemFlags);
        parseFlagChanges(obj.letterFlags, letterFlags);
        parseFlagChanges(obj.fusedShadowFlags, fusedShadowFlags);
        parseFlagChanges(obj.twilightMirrorFlags, twilightMirrorFlags);
        parseFlagChanges(obj.questStatus.goldenBugs, goldenBugs);

        storage.mapFlags = mapFlags;
        storage.itemFlags = itemFlags;
        storage.letterFlags = letterFlags;
        storage.fusedShadowFlags = fusedShadowFlags;
        storage.twilightMirrorFlags = twilightMirrorFlags;
        storage.questStatus.goldenBugs = goldenBugs;

        if (obj.inventory.fishingRod === InventoryItem.fishingRod || obj.inventory.fishingRod === InventoryItem.fishingRodEaring) {
          storage.inventory.fishingRod = obj.inventory.fishingRod;
        }

        if (storage.inventory.clawshot === InventoryItem.NONE && obj.inventory.clawshot === InventoryItem.clawshot) storage.inventory.clawshot = obj.inventory.clawshot;
        else if (storage.inventory.clawshot === InventoryItem.clawshot && obj.inventory.clawshot === InventoryItem.doubleClawshot) storage.inventory.clawshot = obj.inventory.clawshot;

        if (obj.inventory.ooccoo !== storage.inventory.ooccoo) storage.inventory.ooccoo = obj.inventory.ooccoo;
        if (obj.inventory.questItem !== storage.inventory.questItem) storage.inventory.questItem = obj.inventory.questItem;
        if (obj.inventory.skyBook !== storage.inventory.skyBook) storage.inventory.skyBook = obj.inventory.skyBook;
        if (obj.inventory.bottle1 !== storage.inventory.bottle1) storage.inventory.bottle1 = obj.inventory.bottle1;
        if (obj.inventory.bottle2 !== storage.inventory.bottle2) storage.inventory.bottle2 = obj.inventory.bottle2;
        if (obj.inventory.bottle3 !== storage.inventory.bottle3) storage.inventory.bottle3 = obj.inventory.bottle3;
        if (obj.inventory.bottle4 !== storage.inventory.bottle4) storage.inventory.bottle4 = obj.inventory.bottle4;

        if (storage.inventory.bombBag1 === InventoryItem.NONE && obj.inventory.bombBag1 !== InventoryItem.NONE) {
          storage.inventory.bombBag1 = InventoryItem.bombEmpty;
        }
        if (storage.inventory.bombBag2 === InventoryItem.NONE && obj.inventory.bombBag2 !== InventoryItem.NONE) {
          storage.inventory.bombBag2 = InventoryItem.bombEmpty;
        }
        if (storage.inventory.bombBag3 === InventoryItem.NONE && obj.inventory.bombBag3 !== InventoryItem.NONE) {
          storage.inventory.bombBag3 = InventoryItem.bombEmpty;
        }

        // Scene Flags

        this.processMixedLoop(obj.stage0_Ordon, storage.stage0_Ordon, []);
        this.processMixedLoop(obj.stage1_Sewers, storage.stage1_Sewers, []);
        this.processMixedLoop(obj.stage2_Faron, storage.stage2_Faron, []);
        this.processMixedLoop(obj.stage3_Eldin, storage.stage3_Eldin, []);
        this.processMixedLoop(obj.stage4_Laynaru, storage.stage4_Laynaru, []);
        this.processMixedLoop(obj.stage5_Unk1, storage.stage5_Unk1, []);
        this.processMixedLoop(obj.stage6_CastleField, storage.stage6_CastleField, []);
        this.processMixedLoop(obj.stage7_SacredGrove, storage.stage7_SacredGrove, []);
        this.processMixedLoop(obj.stage8_Snowpeak, storage.stage8_Snowpeak, []);
        this.processMixedLoop(obj.stage9_CastleTown, storage.stage9_CastleTown, []);
        this.processMixedLoop(obj.stageA_Gerudo, storage.stageA_Gerudo, []);
        this.processMixedLoop(obj.stageB_FishingHole, storage.stageB_FishingHole, []);
        this.processMixedLoop(obj.stageC_Unk2, storage.stageC_Unk2, []);
        this.processMixedLoop(obj.stageD_Unk3, storage.stageD_Unk3, []);
        this.processMixedLoop(obj.stageE_Unk4, storage.stageE_Unk4, []);
        this.processMixedLoop(obj.stageF_Unk5, storage.stageF_Unk5, []);
        this.processMixedLoop(obj.stage10_ForestTemple, storage.stage10_ForestTemple, []);
        this.processMixedLoop(obj.stage11_GoronMines, storage.stage11_GoronMines, []);
        this.processMixedLoop(obj.stage12_LakebedTemple, storage.stage12_LakebedTemple, []);
        this.processMixedLoop(obj.stage13_ArbitersGrounds, storage.stage13_ArbitersGrounds, []);
        this.processMixedLoop(obj.stage14_SnowpeakRuins, storage.stage14_SnowpeakRuins, []);
        this.processMixedLoop(obj.stage15_TempleOfTime, storage.stage15_TempleOfTime, []);
        this.processMixedLoop(obj.stage16_CitySky, storage.stage16_CitySky, []);
        this.processMixedLoop(obj.stage17_PalaceTwilight, storage.stage17_PalaceTwilight, []);
        this.processMixedLoop(obj.stage18_HyruleCastle, storage.stage18_HyruleCastle, []);
        this.processMixedLoop(obj.stage19_Cave1, storage.stage19_Cave1, []);
        this.processMixedLoop(obj.stage1A_Cave2, storage.stage1A_Cave2, []);
        this.processMixedLoop(obj.stage1B_Grottos, storage.stage1B_Grottos, []);
        this.processMixedLoop(obj.stage1C_Unk6, storage.stage1C_Unk6, []);
        this.processMixedLoop(obj.stage1D_Unk7, storage.stage1D_Unk7, []);
        this.processMixedLoop(obj.stage1E_Unk8, storage.stage1E_Unk8, []);
        this.processMixedLoop(obj.stage1F_Unk9, storage.stage1F_Unk9, []);

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