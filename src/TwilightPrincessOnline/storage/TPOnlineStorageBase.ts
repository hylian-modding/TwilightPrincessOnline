import { IInventoryFields, IQuestStatus, ISaveContext } from 'TwilightPrincess/API/TPAPI';
import * as API from 'TwilightPrincess/API/Imports';
import { TPOSaveData } from '@TwilightPrincessOnline/save/TPOnlineSaveData';

export class TPOnlineStorageBase {
  constructor() { }
  saveManager!: TPOSaveData;
  players: any = {};
  networkPlayerInstances: any = {};
  inventoryStorage: InventoryStorageBase = new InventoryStorageBase();
  questStorage: QuestStorageBase = new QuestStorageBase();
  eventFlags: Buffer = Buffer.alloc(0x100);
  regionFlags: Buffer = Buffer.alloc(0x400);
  liveFlags: Buffer = Buffer.alloc(0x20);
}
export class QuestStorageBase implements IQuestStatus {
  constructor() { }
  fusedShadow: Buffer = Buffer.alloc(0x1);
  mirrorShard: Buffer = Buffer.alloc(0x1);
  dominion_flag: number = 0;
  max_hp: number = 0;
  current_hp: number = 0;
  swordEquip: number = 0;
  shieldEquip: number = 0;
  clothing: number = 0;
  form: number = 0;
  rupees: number = 0;
  currentWallet: number = 0;
  hiddenSkills: number = 0;
  poeCount: number = 0;
  scent: number = 0;
  wooden_sword: number = 0;
  heroArmor: boolean = false;
  zoraArmor: boolean = false;
  magicArmor: boolean = false;
  goldenBugs: Buffer = Buffer.alloc(0x3);
}

export class InventoryStorageBase implements IInventoryFields {
  constructor() { }
  bottle1: API.InventoryItem = API.InventoryItem.NONE;
  bottle2: API.InventoryItem = API.InventoryItem.NONE;
  bottle3: API.InventoryItem = API.InventoryItem.NONE;
  bottle4: API.InventoryItem = API.InventoryItem.NONE;
  bombBag1: API.InventoryItem = API.InventoryItem.NONE;
  bombBag2: API.InventoryItem = API.InventoryItem.NONE;
  bombBag3: API.InventoryItem = API.InventoryItem.NONE;
  ooccoo: API.InventoryItem = API.InventoryItem.NONE;
  sketch_memo: API.InventoryItem = API.InventoryItem.NONE;
  skyBook: API.InventoryItem = API.InventoryItem.NONE;
  galeBoomerang: boolean = false;
  lantern: boolean = false;
  spinner: boolean = false;
  ironBoots: boolean = false;
  bow: boolean = false;
  hawkeye: boolean = false;
  ballAndChain: boolean = false;
  dominionRod: boolean = false;
  clawshot: API.InventoryItem = API.InventoryItem.NONE;
  slingshot: boolean = false;
  bottles: API.InventoryItem[] = [];
  bombBags: API.InventoryItem[] = [];
  fishingRod: API.InventoryItem = API.InventoryItem.NONE;
  horseCall: boolean = false;
  dekuSeeds: number = 0;
  arrows: number = 0;
  bombs1: number = 0;
  bombs2: number = 0;
  bombs3: number = 0;
  quiver: number = 0;
}