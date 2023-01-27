import { IModLoaderAPI, ModLoaderEvents } from 'modloader64_api/IModLoaderAPI';
import { bus, EventHandler } from 'modloader64_api/EventHandler';
import { IWWCore } from 'WindWaker/API/WWAPI';
import { TPOnlineStorageClient } from '../storage/TPOnlineStorageClient';
import { SmartBuffer } from 'smart-buffer';
import zlib from 'zlib';
import { ITPCore } from 'TwilightPrincess/API/TPAPI';

const actor = 0x0000
const anim_data = 0x0144

export class PuppetData {
  pointer: number;
  ModLoader: IModLoaderAPI;
  core: ITPCore;
  private readonly copyFields: string[] = new Array<string>();
  private storage: TPOnlineStorageClient;
  private matrixUpdateTicks: number = 0;
  matrixUpdateRate: number = 2;

  constructor(
    pointer: number,
    ModLoader: IModLoaderAPI,
    core: ITPCore,
    storage: TPOnlineStorageClient
  ) {
    this.storage = storage;
    this.pointer = pointer;
    this.ModLoader = ModLoader;
    this.core = core;
    this.copyFields.push('pos');
    this.copyFields.push('rot');
  }

  get pos(): Buffer {
    return this.core.link.pos;
  }

  set pos(pos: Buffer) {
    this.ModLoader.emulator.rdramWriteBuffer(this.pointer + 0x4A8, pos);
    this.ModLoader.emulator.rdramWriteBuffer(this.pointer + 0x4BC, pos);
    this.ModLoader.emulator.rdramWriteBuffer(this.pointer + 0x4D0, pos);
  }

  get rot(): Buffer {
    return this.core.link.rot;
  }

  set rot(rot: Buffer) {
    this.ModLoader.emulator.rdramWriteBuffer(this.pointer + 0x4A8 + 0xC, rot);
    this.ModLoader.emulator.rdramWriteBuffer(this.pointer + 0x4BC + 0xC, rot);
    this.ModLoader.emulator.rdramWriteBuffer(this.pointer + 0x4D0 + 0xC, rot);
  }

  toJSON() {
    const jsonObj: any = {};

    for (let i = 0; i < this.copyFields.length; i++) {
      jsonObj[this.copyFields[i]] = (this as any)[this.copyFields[i]];
    }
    return jsonObj;
  }
}