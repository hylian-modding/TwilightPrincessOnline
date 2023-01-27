import { Puppet } from './Puppet';
import { INetworkPlayer, NetworkHandler, ServerNetworkHandler } from 'modloader64_api/NetworkHandler';
import { IModLoaderAPI, ModLoaderEvents } from 'modloader64_api/IModLoaderAPI';
import fs from 'fs';
import { ModLoaderAPIInject } from 'modloader64_api/ModLoaderAPIInjector';
import { InjectCore } from 'modloader64_api/CoreInjection';
import { Postinit, onTick } from 'modloader64_api/PluginLifecycle';
import { bus, EventHandler, EventsClient } from 'modloader64_api/EventHandler';
import { ITPCore, TPEvents } from 'TwilightPrincess/API/TPAPI';
import { TPOnlineStorageClient } from '../storage/TPOnlineStorageClient';
import { ITPOnlineHelpers, RemoteSoundPlayRequest, TPOEvents } from '../api/TPOAPI';
import { TPO_PuppetPacket, TPO_PuppetWrapperPacket, TPO_ScenePacket, TPO_SceneRequestPacket } from '../network/TPOPackets';
import { ParentReference } from 'modloader64_api/SidedProxy/SidedProxy';
import Vector3 from 'modloader64_api/math/Vector3';
import { instance } from './CommandBuffer';

const emptyBuf = Buffer.alloc(0x18)

export class PuppetOverlord {
  private puppets: Map<string, Puppet> = new Map<string, Puppet>();
  private awaiting_spawn: Puppet[] = new Array<Puppet>();
  fakeClientPuppet!: Puppet;
  private amIAlone = true;
  private playersAwaitingPuppets: INetworkPlayer[] = new Array<INetworkPlayer>();
  spawnIndex: number = 1;

  @ParentReference()
  private parent!: ITPOnlineHelpers;
  private queuedSpawn: boolean = false;

  rom!: Buffer;

  @ModLoaderAPIInject()
  private ModLoader!: IModLoaderAPI;
  @InjectCore()
  private core!: ITPCore;
  clientStorage!: TPOnlineStorageClient;

  @Postinit()
  postinit(
  ) {
    this.fakeClientPuppet = new Puppet(
      this.ModLoader.me,
      this.core,
      // The pointer here points to blank space, so should be fine.
      0x0,
      this.ModLoader,
      this.parent
    );
  }

  get current_scene() {
    return this.fakeClientPuppet.scene;
  }

  localPlayerLoadingZone() {
    this.puppets.forEach(
      (value: Puppet, key: string, map: Map<string, Puppet>) => {
        value.despawn();
      }
    );
    this.awaiting_spawn.splice(0, this.awaiting_spawn.length);
  }

  localPlayerChangingScenes(entering_scene: string) {
    this.awaiting_spawn.splice(0, this.awaiting_spawn.length);
    this.fakeClientPuppet.scene = entering_scene;
  }

  registerPuppet(player: INetworkPlayer) {
    this.ModLoader.logger.info(
      'Player ' + player.nickname + ' awaiting puppet assignment.'
    );
    this.playersAwaitingPuppets.push(player);
  }

  unregisterPuppet(player: INetworkPlayer) {
    if (this.puppets.has(player.uuid)) {
      let puppet: Puppet = this.puppets.get(player.uuid)!;
      puppet.despawn();
      this.puppets.delete(player.uuid);
    }
    if (this.playersAwaitingPuppets.length > 0) {
      let index = -1;
      for (let i = 0; i < this.playersAwaitingPuppets.length; i++) {
        if (this.playersAwaitingPuppets[i].uuid === player.uuid) {
          index = i;
          break;
        }
      }
      if (index > -1) {
        this.playersAwaitingPuppets.splice(index, 1);
      }
    }
  }

  changePuppetScene(player: INetworkPlayer, entering_scene: string) {
    if (this.puppets.has(player.uuid)) {
      let puppet = this.puppets.get(player.uuid)!;

      puppet.scene = entering_scene;
      this.ModLoader.logger.info(
        'Puppet ' + puppet.id + ' moved to scene ' + puppet.scene
      );

      if (this.fakeClientPuppet.scene === puppet.scene) {
        this.ModLoader.logger.info(
          'Queueing puppet ' + puppet.id + ' for immediate spawning.'
        );
        this.awaiting_spawn.push(puppet);
      }
    }
    else {
      this.ModLoader.logger.info('No puppet found for player ' + player.nickname + '.');
    }
  }

  processNewPlayers() {
    if (this.playersAwaitingPuppets.length > 0) {
      let player: INetworkPlayer = this.playersAwaitingPuppets.splice(0, 1)[0];
      this.puppets.set(
        player.uuid,
        new Puppet(
          player,
          this.core,
          0x0,
          this.ModLoader,
          this.parent
        )
      );
      this.ModLoader.logger.info(
        'Player ' +
        player.nickname +
        ' assigned new puppet ' +
        this.puppets.get(player.uuid)!.id +
        '.'
      );
      this.ModLoader.clientSide.sendPacket(
        new TPO_SceneRequestPacket(this.ModLoader.clientLobby)
      );
    }
  }

  processAwaitingSpawns() {
    if (this.awaiting_spawn.length > 0 && !this.queuedSpawn) {
      let puppet: Puppet = this.awaiting_spawn.shift() as Puppet;
      if (puppet.scene == this.core.global.current_scene_name && this.core.helper.isLinkExists() && this.core.helper.isLinkControllable()) {
        console.log("Spawning puppet")
        this.spawnIndex++;
        puppet.uniqueID = this.spawnIndex;
        puppet.spawn(this.spawnIndex);
      }
    }
  }

  lookForMissingOrStrandedPuppets() {
    let check = false;

    this.puppets.forEach((puppet: Puppet, key: string, map: Map<string, Puppet>) => {
      let scene = this.core.global.current_scene_name;
      if (scene === this.fakeClientPuppet.scene) {
        if (!puppet.isSpawned && this.awaiting_spawn.indexOf(puppet) === -1) {
          this.awaiting_spawn.push(puppet);
        }
        check = true;
      }

      if (scene !== this.fakeClientPuppet.scene && puppet.isSpawned && !puppet.isShoveled) {
        console.log("shoveling puppet");
        puppet.shovel();
      }
    });
    if (check) this.amIAlone = false;
    else this.amIAlone = true;
  }

  sendPuppetPacket() {
/*     let distances: number[] = [];
    this.clientStorage.scaledDistances.forEach((value: number) => {
      distances.push(value);
    });
    distances = distances.sort(); */
    if (!this.amIAlone && this.core.helper.isLinkControllable()) {
      //this.fakeClientPuppet.data.matrixUpdateRate = distances[0];
      let packet = new TPO_PuppetPacket(this.fakeClientPuppet.data, this.ModLoader.clientLobby);
      let _packet = new TPO_PuppetWrapperPacket(packet, this.ModLoader.clientLobby);
      this.ModLoader.clientSide.sendPacket(_packet);
    }
  }

  private Vec3FromBuffer(b: Buffer) {
    return new Vector3(b.readFloatBE(0), b.readFloatBE(4), b.readFloatBE(8));
  }

  processPuppetPacket(packet: TPO_PuppetWrapperPacket) {
    if (this.puppets.has(packet.player.uuid)) {
      let puppet: Puppet = this.puppets.get(packet.player.uuid)!;
      let actualPacket = JSON.parse(packet.data) as TPO_PuppetPacket;

      if (puppet.data.pointer === 0) return;

      let e = new RemoteSoundPlayRequest(packet.player, actualPacket.data, 0);
      bus.emit(TPOEvents.ON_REMOTE_PLAY_SOUND, e);
      puppet.processIncomingPuppetData(actualPacket.data, e);
    }
  }

  generateCrashDump() {
    let _puppets: any = {};
    this.puppets.forEach(
      (value: Puppet, key: string, map: Map<string, Puppet>) => {
        _puppets[key] = {
          isSpawned: value.isSpawned,
          isSpawning: value.isSpawning,
          isShoveled: value.isShoveled,
          pointer: value.data.pointer,
          player: value.player,
        };
      }
    );
    fs.writeFileSync(
      './PuppetOverlord_crashdump.json',
      JSON.stringify(_puppets, null, 2)
    );
  }

  @onTick()
  onTick(frame: number) {
    if (this.core.helper.isTitleScreen() ||
      this.core.helper.isPaused() ||
      !this.core.helper.isLinkExists() ||
      !this.core.helper.isSceneNameValid() ||
      !this.core.helper.isLinkControllable()
    ) {
      return;
    }


    for (let i: number = 0; i < 64; i++) {
      let offset = (instance + 0xA08) + (i * 0x28)
      let returnUUID = this.ModLoader.emulator.rdramRead32(offset + 0x4)

      this.puppets.forEach((puppet: Puppet, key: string, map: Map<string, Puppet>) => {
        if (puppet.isSpawning) {
          //if (frame % 7 === 0) console.log("puppet " + puppet.player.uuid + " is spawning" + " (uniqueID is " + puppet.uniqueID + ")")
          if (puppet.uniqueID === 0) console.log("HEY IDIOT! Why does a puppet have a uuid (spawn index) of 0?!")

          if (returnUUID === puppet.uniqueID && returnUUID !== 0 && puppet.uniqueID !== 0) {
            let pointer = this.ModLoader.emulator.rdramRead32(offset + 0x8)
            let debug = this.ModLoader.emulator.rdramRead32(offset + 0xC)
            let result = this.ModLoader.emulator.rdramRead32(offset + 0x10)
            console.log("returnUUID is " + returnUUID.toString(16) + " puppet.uniqueID is " + puppet.uniqueID.toString(16) + " is addr of this returnCommand is " + offset.toString(16) + " pointer is " + pointer.toString(16) + " debug is " + debug.toString(16) + " result is " + result + " instance is " + instance.toString(16))

            if (pointer === 0xFFFFFFFF && debug === 0xDEADDEAD) {
              console.log("Puppet failed to spawn!");
            }
            else if (pointer) {
              console.log("WE GOT THE POINTER!!");
              puppet.data.pointer = pointer;

              puppet.doNotDespawnMe(puppet.data.pointer);
              puppet.void = this.ModLoader.math.rdramReadV3(puppet.data.pointer + 0x1F8);
              puppet.isSpawned = true;
              puppet.isSpawning = false;
              bus.emit(TPOEvents.PLAYER_PUPPET_SPAWNED, puppet);
            }

            // if we handled this return object, wipe it
            this.ModLoader.emulator.rdramWriteBuffer(offset, emptyBuf)
          }
        }
      });
    }

    this.processNewPlayers();
    this.processAwaitingSpawns();
    this.lookForMissingOrStrandedPuppets();
    this.sendPuppetPacket();
  }

  @EventHandler(EventsClient.ON_PLAYER_JOIN)
  onPlayerJoin(player: INetworkPlayer) {
    this.registerPuppet(player);
  }

  @EventHandler(EventsClient.ON_PLAYER_LEAVE)
  onPlayerLeft(player: INetworkPlayer) {
    this.unregisterPuppet(player);
  }

  @EventHandler(TPOEvents.ON_LOADING_ZONE)
  onLoadingZone(evt: any) {
    this.localPlayerLoadingZone();
  }

  @EventHandler(TPEvents.ON_SCENE_CHANGE)
  onSceneChange(scene: string) {
    this.localPlayerLoadingZone();
    this.localPlayerChangingScenes(scene);
  }

  @NetworkHandler('TPO_ScenePacket')
  onSceneChange_client(packet: TPO_ScenePacket) {
    //console.log(packet);
    this.changePuppetScene(packet.player, packet.scene);
  }

  @ServerNetworkHandler('TPO_PuppetPacket')
  onPuppetData_server(packet: TPO_PuppetWrapperPacket) {
    this.parent.sendPacketToPlayersInScene(packet);
  }

  @NetworkHandler('TPO_PuppetPacket')
  onPuppetData_client(packet: TPO_PuppetWrapperPacket) {
    this.processPuppetPacket(packet);
  }

  @EventHandler(ModLoaderEvents.ON_CRASH)
  onEmuCrash(evt: any) {
    this.generateCrashDump();
  }

  @EventHandler(ModLoaderEvents.ON_SOFT_RESET_PRE)
  onReset(evt: any) {
    this.localPlayerLoadingZone();
  }

  @EventHandler(TPOEvents.PLAYER_PUPPET_SPAWNED)
  onSpawn(puppet: Puppet) {
    this.ModLoader.logger.debug("Unlocking puppet spawner.")
    this.queuedSpawn = false;
  }

  @EventHandler(TPOEvents.PLAYER_PUPPET_PRESPAWN)
  onPreSpawn(puppet: Puppet) {
    this.ModLoader.logger.debug("Locking puppet spawner.")
    this.queuedSpawn = true;
  }
}