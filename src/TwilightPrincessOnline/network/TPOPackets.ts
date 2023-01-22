import {
  Packet, UDPPacket
} from 'modloader64_api/ModLoaderDefaultImpls';
import { INetworkPlayer } from 'modloader64_api/NetworkHandler';
import { IStageInfo } from 'TwilightPrincess/API/TPAPI';
import { StageInfo } from 'TwilightPrincess/src/StageInfo';

export class PacketWithTimeStamp extends Packet{
  timestamp: number = Date.now();
}

export class TPO_BottleUpdatePacket extends Packet {
  slot: number;
  contents: number;

  constructor(slot: number, contents: number, lobby: string) {
    super('TPO_BottleUpdatePacket', 'TPOnline', lobby, true);
    this.slot = slot;
    this.contents = contents;
  }
}

export class TPO_RupeePacket extends PacketWithTimeStamp {
  delta: number;
  constructor(delta: number, lobby: string){
    super('TPO_RupeePacket', 'TPOnline', lobby, false);
    this.delta = delta;
  }
}

export class TPO_ScenePacket extends Packet {
  scene: string;

  constructor(lobby: string, scene: string) {
    super('TPO_ScenePacket', 'TPOnline', lobby, true);
    this.scene = scene;
  }
}

export class TPO_RoomPacket extends Packet {
  scene: string;
  room: number;

  constructor(lobby: string, scene: string, room: number) {
    super('TPO_RoomPacket', 'TPOnline', lobby, true);
    this.scene = scene;
    this.room = room;
  }
}

export class TPO_SceneRequestPacket extends Packet {
  constructor(lobby: string) {
    super('TPO_SceneRequestPacket', 'TPOnline', lobby, true);
  }
}

export class TPO_DownloadResponsePacket extends Packet {

  save?: Buffer;
  host: boolean;

  constructor(lobby: string, host: boolean) {
    super('TPO_DownloadResponsePacket', 'TPOnline', lobby, false);
    this.host = host;
  }
}

export class TPO_DownloadRequestPacket extends Packet {

  save: Buffer;

  constructor(lobby: string, save: Buffer) {
    super('TPO_DownloadRequestPacket', 'TPOnline', lobby, false);
    this.save = save;
  }
}

export class TPO_UpdateSaveDataPacket extends Packet {

  save: Buffer;
  world: number;

  constructor(lobby: string, save: Buffer, world: number) {
    super('TPO_UpdateSaveDataPacket', 'TPOnline', lobby, false);
    this.save = save;
    this.world = world;
  }
}

export class TPO_ErrorPacket extends Packet{

  message: string;

  constructor(msg: string, lobby: string){
    super('TPO_ErrorPacket', 'TPO', lobby, false);
    this.message = msg;
  }

}

export class TPO_EventFlagUpdate extends Packet {
  eventFlags: Buffer;

  constructor(
    eventFlags: Buffer,
    lobby: string
  ) {
    super('TPO_EventFlagUpdate', 'TPOnline', lobby, false);
    this.eventFlags = eventFlags;
  }
}

export class TPO_ClientSceneContextUpdate extends Packet {
  stage: IStageInfo;
  id: number;
  world: number;

  constructor(
    stage: IStageInfo,
    lobby: string,
    id: number,
    world: number
  ) {
    super('TPO_ClientSceneContextUpdate', 'TPOnline', lobby, false);
    this.stage = stage;
    this.id = id;
    this.world = world;
  }
}