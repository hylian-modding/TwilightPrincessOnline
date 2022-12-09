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
  charloDonation!: number;
  maloDonation!: number;
  mapFlags: Buffer = Buffer.alloc(0x200);
  itemFlags: Buffer = Buffer.alloc(0x20);
  fusedShadowFlags: Buffer = Buffer.alloc(0x1);
  twilightMirrorFlags: Buffer = Buffer.alloc(0x1);
  letterFlags: Buffer = Buffer.alloc(0x50);
  faronTears!: number;
  eldinTears!: number;
  lanayruTears!: number;
  stage_Live!: API.IStageInfo;
  stage0_Ordon!: API.IStageInfo;
  stage1_Sewers!: API.IStageInfo;
  stage2_Faron!: API.IStageInfo;
  stage3_Eldin!: API.IStageInfo;
  stage4_Laynaru!: API.IStageInfo;
  stage5_Unk1!: API.IStageInfo;
  stage6_CastleField!: API.IStageInfo;
  stage7_SacredGrove!: API.IStageInfo;
  stage8_Snowpeak!: API.IStageInfo;
  stage9_CastleTown!: API.IStageInfo;
  stageA_Gerudo!: API.IStageInfo;
  stageB_FishingHole!: API.IStageInfo;
  stageC_Unk2!: API.IStageInfo;
  stageD_Unk3!: API.IStageInfo;
  stageE_Unk4!: API.IStageInfo;
  stageF_Unk5!: API.IStageInfo;
  stage10_ForestTemple!: API.IStageInfo;
  stage11_GoronMines!: API.IStageInfo;
  stage12_LakebedTemple!: API.IStageInfo;
  stage13_ArbitersGrounds!: API.IStageInfo;
  stage14_SnowpeakRuins!: API.IStageInfo;
  stage15_TempleOfTime!: API.IStageInfo;
  stage16_CitySky!: API.IStageInfo;
  stage17_PalaceTwilight!: API.IStageInfo;
  stage18_HyruleCastle!: API.IStageInfo;
  stage19_Cave1!: API.IStageInfo;
  stage1A_Cave2!: API.IStageInfo;
  stage1B_Grottos!: API.IStageInfo;
  stage1C_Unk6!: API.IStageInfo;
  stage1D_Unk7!: API.IStageInfo;
  stage1E_Unk8!: API.IStageInfo;
  stage1F_Unk9!: API.IStageInfo;
  inventory!: IInventory;
  questStatus!: IQuestStatus;
  swords!: ISwords;
  shields!: IShields;
  eventFlags: Buffer = Buffer.alloc(0xF0);
  regionFlags: Buffer = Buffer.alloc(0x400);
  liveFlags: Buffer = Buffer.alloc(0x20);
}

export class TPOnlineSave_Server {
  saveGameSetup = false;
  save: ITPOSyncSaveServer = new TPOSyncSaveServer();
}