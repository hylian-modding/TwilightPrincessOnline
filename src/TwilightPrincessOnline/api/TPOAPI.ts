import { IPacketHeader, INetworkPlayer } from 'modloader64_api/NetworkHandler';
import { bus } from 'modloader64_api/EventHandler';
import { Packet } from 'modloader64_api/ModLoaderDefaultImpls';
import { TPOnlineStorageClient } from '../storage/TPOnlineStorageClient';

export enum TPOEvents {
  SERVER_PLAYER_CHANGED_SCENES = 'TPOnline:onServerPlayerChangedScenes',
  SERVER_PLAYER_CHANGED_ROOMS = 'TPOnline:onServerPlayerChangedRooms',
  CLIENT_REMOTE_PLAYER_CHANGED_SCENES = 'TPOnline:onRemotePlayerChangedScenes',
  ON_INVENTORY_UPDATE = 'TPOnline:OnInventoryUpdate',
  SAVE_DATA_ITEM_SET = 'TPOnline:SAVE_DATA_ITEM_SET',
  PLAYER_PUPPET_PRESPAWN = 'TPOnline:onPlayerPuppetPreSpawned',
  PLAYER_PUPPET_SPAWNED = 'TPOnline:onPlayerPuppetSpawned',
  PLAYER_PUPPET_DESPAWNED = 'TPOnline:onPlayerPuppetDespawned',
  PLAYER_PUPPET_QUERY = "TPOnline:PlayerPuppetQuery",
  GAINED_HEART_CONTAINER = 'TPOnline:GainedHeartContainer',
  GAINED_PIECE_OF_HEART = 'TPOnline:GainedPieceOfHeart',
  MAGIC_METER_INCREASED = 'TPOnline:GainedMagicMeter',
  ON_REMOTE_PLAY_SOUND = "TPOnline:OnRemotePlaySound",
  ON_LOADING_ZONE = "TPOnline:OnLoadingZone"
}

export class TPOPlayerScene {
  player: INetworkPlayer;
  lobby: string;
  scene: string;

  constructor(player: INetworkPlayer, lobby: string, scene: string) {
    this.player = player;
    this.scene = scene;
    this.lobby = lobby;
  }
}

export class TPOPlayerRoom {
  player: INetworkPlayer;
  lobby: string;
  room: number;

  constructor(player: INetworkPlayer, lobby: string, room: number) {
    this.player = player;
    this.room = room;
    this.lobby = lobby;
  }
}

export class TPOSaveDataItemSet {
  key: string;
  value: boolean | number | Buffer;

  constructor(key: string, value: boolean | number | Buffer) {
    this.key = key;
    this.value = value;
  }
}

export interface ITPOnlineHelpers {
  sendPacketToPlayersInScene(packet: IPacketHeader): void;
  getClientStorage(): TPOnlineStorageClient | null;
}

export class RemoteSoundPlayRequest {

  player: INetworkPlayer;
  puppet: any;
  sound_id: number;
  isCanceled: boolean = false;

  constructor(player: INetworkPlayer, puppet: any, sound_id: number) {
    this.player = player;
    this.puppet = puppet;
    this.sound_id = sound_id;
  }

}

export const enum Command{
  COMMAND_TYPE_NONE,
  COMMAND_TYPE_PUPPET_SPAWN,
  COMMAND_TYPE_PUPPET_DESPAWN,
  COMMAND_TYPE_COUNT
}

export interface ICommandBuffer {
  runCommand(command: Command, data: Buffer, uuid?: number): number;
}
