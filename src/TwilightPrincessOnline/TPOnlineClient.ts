import { TPOEvents, TPOPlayerRoom, TPOPlayerScene, } from "./api/TPOAPI";
import path from "path";
import { InjectCore } from "modloader64_api/CoreInjection";
import { DiscordStatus } from "modloader64_api/Discord";
import { EventHandler, PrivateEventHandler, EventsClient, bus } from "modloader64_api/EventHandler";
import { IModLoaderAPI, IPlugin, ModLoaderEvents } from "modloader64_api/IModLoaderAPI";
import { ModLoaderAPIInject } from "modloader64_api/ModLoaderAPIInjector";
import { INetworkPlayer, LobbyData, NetworkHandler } from "modloader64_api/NetworkHandler";
import { Preinit, Init, Postinit, onTick } from "modloader64_api/PluginLifecycle";
import { ParentReference, SidedProxy, ProxySide } from "modloader64_api/SidedProxy/SidedProxy";
import { TPO_UpdateSaveDataPacket, TPO_DownloadRequestPacket, TPO_ScenePacket, TPO_SceneRequestPacket, TPO_DownloadResponsePacket, TPO_BottleUpdatePacket, TPO_ErrorPacket, TPO_RoomPacket, TPO_RupeePacket, TPO_EventFlagUpdate, TPO_RegionFlagUpdate, TPO_LiveFlagUpdate } from "./network/TPOPackets";
import { ITPOnlineLobbyConfig, TPOnlineConfigCategory } from "./TPOnline";
import { TPOSaveData } from "./save/TPOnlineSaveData";
import { TPOnlineStorage } from "./storage/TPOnlineStorage";
import { TPOnlineStorageClient } from "./storage/TPOnlineStorageClient";
import fs from 'fs';
import { TPO_PRIVATE_EVENTS } from "./api/InternalAPI";
import WWSerialize from "./storage/TPSerialize";
import { InventoryItem, ITPCore, TPEvents } from "TwilightPrincess/API/TPAPI";
import { parseFlagChanges } from "./save/parseFlagChanges";
import * as API from "TwilightPrincess/API/TPAPI";
import bitwise from 'bitwise';

export default class TPOnlineClient {
    @InjectCore()
    core!: ITPCore;

    @ModLoaderAPIInject()
    ModLoader!: IModLoaderAPI;

    @ParentReference()
    parent!: IPlugin;

    LobbyConfig: ITPOnlineLobbyConfig = {} as ITPOnlineLobbyConfig;
    clientStorage: TPOnlineStorageClient = new TPOnlineStorageClient();
    config!: TPOnlineConfigCategory;

    syncContext: number = -1;
    syncTimer: number = 0;
    synctimerMax: number = 60 * 20;
    syncPending: boolean = false;


    @EventHandler(EventsClient.ON_PLAYER_JOIN)
    onPlayerJoined(player: INetworkPlayer) {
        this.clientStorage.players[player.uuid] = "-1";
        this.clientStorage.networkPlayerInstances[player.uuid] = player;
    }

    @EventHandler(EventsClient.ON_PLAYER_LEAVE)
    onPlayerLeave(player: INetworkPlayer) {
        delete this.clientStorage.players[player.uuid];
        delete this.clientStorage.networkPlayerInstances[player.uuid];
    }

    @Preinit()
    preinit() {
        this.config = this.ModLoader.config.registerConfigCategory("TPOnline") as TPOnlineConfigCategory;
    }

    @Init()
    init(): void {
    }

    @Postinit()
    postinit() {
        let status: DiscordStatus = new DiscordStatus('Playing TPOnline', 'On the title screen');
        status.smallImageKey = 'TPO';
        status.partyId = this.ModLoader.clientLobby;
        status.partyMax = 30;
        status.partySize = 1;
        this.ModLoader.gui.setDiscordStatus(status);
        this.clientStorage.saveManager = new TPOSaveData(this.core, this.ModLoader);
        this.ModLoader.utils.setIntervalFrames(() => {
            this.inventoryUpdateTick();
        }, 20);
    }

    updateInventory() {
        if (this.core.helper.isTitleScreen() || !this.core.helper.isSceneNameValid() || this.core.helper.isPaused() || !this.clientStorage.first_time_sync) return;
        if (this.syncTimer > this.synctimerMax) {
            this.clientStorage.lastPushHash = this.ModLoader.utils.hashBuffer(Buffer.from("RESET"));
        }
        let save = this.clientStorage.saveManager.createSave();
        if (this.clientStorage.lastPushHash !== this.clientStorage.saveManager.hash) {
            this.ModLoader.privateBus.emit(TPO_PRIVATE_EVENTS.DOING_SYNC_CHECK, {});
            this.ModLoader.clientSide.sendPacket(new TPO_UpdateSaveDataPacket(this.ModLoader.clientLobby, save, this.clientStorage.world));
            this.clientStorage.lastPushHash = this.clientStorage.saveManager.hash;
            this.syncTimer = 0;
        }
    }

    updateFlags() {
        if (this.core.helper.isTitleScreen() || !this.core.helper.isSceneNameValid() || this.core.helper.isPaused() || !this.clientStorage.first_time_sync) return;
        let dSv_info_c = 0x804061C0;
        let eventFlagsAddr = dSv_info_c + 0x7F0;
        let eventFlags = Buffer.alloc(0x100);
        let eventFlagByte = 0;
        let eventFlagStorage = this.clientStorage.eventFlags;
        //const indexBlacklist = [0x1, 0x2, 0x5, 0x7, 0x8, 0xE, 0xF, 0x24, 0x25, 0x2D, 0x2E, 0x34];

        for (let i = 0; i < eventFlags.byteLength; i++) {
            let eventFlagByteStorage = eventFlagStorage.readUInt8(i); //client storage bits
            let bitArray: number[] = [];
            for (let j = 0; j <= 7; j++) {
                eventFlagByte = this.ModLoader.emulator.rdramRead8(eventFlagsAddr); //in-game bits
                if (eventFlagByte !== eventFlagByteStorage) {
                    eventFlagByte = (eventFlagByte |= eventFlagByteStorage)
                    console.log(`Flag: 0x${i.toString(16)}, val: 0x${eventFlagByteStorage.toString(16)} -> 0x${eventFlagByte.toString(16)}`);
                }
                else if (eventFlagByte !== eventFlagByteStorage) //console.log(`indexBlacklist: 0x${i.toString(16)}`);
                    eventFlagByteStorage = eventFlagByte; //client storage bits
            }
            eventFlags.writeUInt8(eventFlagByte, i);
            eventFlagsAddr = eventFlagsAddr + 1;
        }
        if (!eventFlagStorage.equals(eventFlags)) {
            this.clientStorage.eventFlags = eventFlags;
            eventFlagStorage = eventFlags;
            this.ModLoader.clientSide.sendPacket(new TPO_EventFlagUpdate(this.clientStorage.eventFlags, this.ModLoader.clientLobby));
        }
    }

    //Regional Flags (dSv_memory_c)
    updateRegionFlags() {
        if (this.core.helper.isTitleScreen() || !this.core.helper.isSceneNameValid() || this.core.helper.isPaused() || !this.clientStorage.first_time_sync) return;
        let dSv_info_c = 0x804061C0;
        let regionFlagsAddr = dSv_info_c + 0x1F0;
        let regionFlags = Buffer.alloc(0x400);
        
        regionFlags = this.core.save.regionFlags;
        if(!regionFlags.equals(this.clientStorage.regionFlags)) {
            this.clientStorage.regionFlags = regionFlags;
            console.log("updateRegionFlags")
            this.ModLoader.clientSide.sendPacket(new TPO_RegionFlagUpdate(this.clientStorage.regionFlags, this.ModLoader.clientLobby))
        }
    }

    // dSv_memory_c dSv_memBit_c Flags?
    updateLiveFlags() {
        if (this.core.helper.isTitleScreen() || !this.core.helper.isSceneNameValid() || this.core.helper.isPaused() || !this.clientStorage.first_time_sync) return;
        let dSv_info_c = 0x804061C0;
        let liveFlagsAddr = dSv_info_c + 0x958;
        let liveFlags = Buffer.alloc(0x20);
        
        liveFlags = this.core.save.liveFlags;
        if(!liveFlags.equals(this.clientStorage.liveFlags)) {
            this.clientStorage.liveFlags = liveFlags;
            console.log("updateLiveFlags");
            this.ModLoader.clientSide.sendPacket(new TPO_LiveFlagUpdate(this.clientStorage.liveFlags, this.ModLoader.clientLobby))
        }
    }

    //------------------------------
    // Lobby Setup
    //------------------------------

    @EventHandler(EventsClient.ON_SERVER_CONNECTION)
    onConnect() {
        this.ModLoader.logger.debug("Connected to server.");
        this.clientStorage.first_time_sync = false;
    }

    @EventHandler(EventsClient.CONFIGURE_LOBBY)
    onLobbySetup(lobby: LobbyData): void {
        lobby.data['TPOnline:data_syncing'] = true;
    }

    @EventHandler(EventsClient.ON_LOBBY_JOIN)
    onJoinedLobby(lobby: LobbyData): void {
        this.clientStorage.first_time_sync = false;
        this.LobbyConfig.data_syncing = lobby.data['TPOnline:data_syncing'];
        this.ModLoader.logger.info('TPOnline settings inherited from lobby.');
    }

    //------------------------------
    // Scene handling
    //------------------------------

    @EventHandler(TPEvents.ON_SAVE_LOADED)
    onSaveLoad(Scene: number) {
        if (!this.clientStorage.first_time_sync && !this.syncPending) {

            this.ModLoader.utils.setTimeoutFrames(() => {
                if (this.LobbyConfig.data_syncing) {
                    this.ModLoader.me.data["world"] = this.clientStorage.world;
                    this.ModLoader.clientSide.sendPacket(new TPO_DownloadRequestPacket(this.ModLoader.clientLobby, new TPOSaveData(this.core, this.ModLoader).createSave()));
                }
            }, 50);
            this.syncPending = true;
        }
    }

    @EventHandler(TPEvents.ON_SCENE_CHANGE)
    onSceneChange(scene: string) {
        if (!this.clientStorage.first_time_sync && !this.syncPending) {
            this.ModLoader.utils.setTimeoutFrames(() => {
                if (this.LobbyConfig.data_syncing) {
                    this.ModLoader.me.data["world"] = this.clientStorage.world;
                    this.ModLoader.clientSide.sendPacket(new TPO_DownloadRequestPacket(this.ModLoader.clientLobby, new TPOSaveData(this.core, this.ModLoader).createSave()));
                }
            }, 300);
            this.syncPending = true;
        }
        this.ModLoader.clientSide.sendPacket(
            new TPO_ScenePacket(
                this.ModLoader.clientLobby,
                scene
            )
        );
        this.ModLoader.logger.info('client: I moved to scene ' + scene + '.');
        if (this.core.helper.isSceneNameValid()) {
            this.ModLoader.gui.setDiscordStatus(
                new DiscordStatus(
                    'Playing TPOnline',
                    'In ' +
                    scene
                )
            );
        }
    }

    @EventHandler(TPEvents.ON_ROOM_CHANGE)
    onRoomChange(scene: string, room: number) {
        //Log when the player changes to a different island
        if (scene === "sea") {
            if (room !== 0 && room !== 0xFF) {
                this.ModLoader.clientSide.sendPacket(
                    new TPO_RoomPacket(
                        this.ModLoader.clientLobby,
                        scene,
                        room
                    )
                );
                this.ModLoader.logger.info('client: I moved to ' + room + '.');
            }
        }
    }

    @NetworkHandler('TPO_ScenePacket')
    onSceneChange_client(packet: TPO_ScenePacket) {
        this.ModLoader.logger.info(
            'client receive: Player ' +
            packet.player.nickname +
            ' moved to scene ' +
            packet.scene
            +
            '.'
        );
        bus.emit(
            TPOEvents.CLIENT_REMOTE_PLAYER_CHANGED_SCENES,
            new TPOPlayerScene(packet.player, packet.lobby, packet.scene)
        );
    }

    // This packet is basically 'where the hell are you?' if a player has a puppet on file but doesn't know what scene its suppose to be in.
    @NetworkHandler('TPO_SceneRequestPacket')
    onSceneRequest_client(packet: TPO_SceneRequestPacket) {
        if (this.core.save !== undefined) {
            this.ModLoader.clientSide.sendPacketToSpecificPlayer(
                new TPO_ScenePacket(
                    this.ModLoader.clientLobby,
                    this.core.global.current_scene_name
                ),
                packet.player
            );
        }
    }

    healPlayer() {
        if (this.core.helper.isTitleScreen() || !this.core.helper.isSceneNameValid()) return;
        this.core.save.questStatus.current_hp = (0.8 * this.core.save.questStatus.max_hp) //Number of quarter hearts
    }

    @EventHandler(TPOEvents.GAINED_PIECE_OF_HEART)
    onNeedsHeal(evt: any) {
        this.healPlayer();
    }

    // The server is giving me data.
    @NetworkHandler('TPO_DownloadResponsePacket')
    onDownloadPacket_client(packet: TPO_DownloadResponsePacket) {
        this.syncPending = false;
        if (
            this.core.helper.isTitleScreen() ||
            !this.core.helper.isSceneNameValid()
        ) {
            return;
        }
        if (!packet.host) {
            if (packet.save) {
                this.clientStorage.saveManager.forceOverrideSave(packet.save!, this.core.save as any, ProxySide.CLIENT);
                //this.clientStorage.saveManager.processKeyRing_OVERWRITE(packet.keys!, this.clientStorage.saveManager.createKeyRing(), ProxySide.CLIENT);
                // Update hash.
                this.clientStorage.saveManager.createSave();
                this.clientStorage.lastPushHash = this.clientStorage.saveManager.hash;
            }
        } else {
            this.ModLoader.logger.info("The lobby is mine!");
        }
        this.ModLoader.utils.setTimeoutFrames(() => {
            this.clientStorage.first_time_sync = true;
        }, 20);
    }

    @NetworkHandler('TPO_UpdateSaveDataPacket')
    onSaveUpdate(packet: TPO_UpdateSaveDataPacket) {
        if (
            this.core.helper.isTitleScreen() ||
            !this.core.helper.isSceneNameValid()
        ) {
            return;
        }
        if (packet.world !== this.clientStorage.world) {
            return;
        }

        this.clientStorage.saveManager.applySave(packet.save);
        // Update hash.
        this.clientStorage.saveManager.createSave();
        this.clientStorage.lastPushHash = this.clientStorage.saveManager.hash;
    }


    @NetworkHandler('TPO_ErrorPacket')
    onError(packet: TPO_ErrorPacket) {
        this.ModLoader.logger.error(packet.message);
    }

    @NetworkHandler('TPO_FlagUpdate')
    onFlagUpdate(packet: TPO_EventFlagUpdate) {
        if (this.core.helper.isTitleScreen() || !this.core.helper.isSceneNameValid()) return;
        console.log("onFlagUpdate Client");

        for (let i = 0; i < packet.eventFlags.byteLength; i++) {
            let tempByteIncoming = packet.eventFlags.readUInt8(i);
            let tempByte = this.clientStorage.eventFlags.readUInt8(i);
            //if (tempByteIncoming !== tempByte) console.log(`Writing flag: 0x${i.toString(16)}, tempByte: 0x${tempByte.toString(16)}, tempByteIncoming: 0x${tempByteIncoming.toString(16)} `);
        }

        parseFlagChanges(packet.eventFlags, this.clientStorage.eventFlags);
        this.core.save.eventFlags = this.clientStorage.eventFlags;
    }

    @NetworkHandler('TPO_RegionFlagUpdate')
    onRegionFlagUpdate(packet: TPO_RegionFlagUpdate) {
        if (this.core.helper.isTitleScreen() || !this.core.helper.isSceneNameValid()) return;
        console.log("onRegionFlagUpdate Client");

        for (let i = 0; i < packet.regionFlags.byteLength; i++) {
            let tempByteIncoming = packet.regionFlags.readUInt8(i);
            let tempByte = this.clientStorage.regionFlags.readUInt8(i);
            //if (tempByteIncoming !== tempByte) console.log(`Writing flag: 0x${i.toString(16)}, tempByte: 0x${tempByte.toString(16)}, tempByteIncoming: 0x${tempByteIncoming.toString(16)} `);
        }
        
        parseFlagChanges(packet.regionFlags, this.clientStorage.regionFlags);
        this.core.save.regionFlags = this.clientStorage.regionFlags;
    }

    @NetworkHandler('TPO_LiveFlagUpdate')
    onLiveFlagUpdate(packet: TPO_LiveFlagUpdate) {
        if (this.core.helper.isTitleScreen() || !this.core.helper.isSceneNameValid()) return;
        console.log("onLiveFlagUpdate Client");

        for (let i = 0; i < packet.liveFlags.byteLength; i++) {
            let tempByteIncoming = packet.liveFlags.readUInt8(i);
            let tempByte = this.clientStorage.liveFlags.readUInt8(i);
            //if (tempByteIncoming !== tempByte) console.log(`Writing flag: 0x${i.toString(16)}, tempByte: 0x${tempByte.toString(16)}, tempByteIncoming: 0x${tempByteIncoming.toString(16)} `);
        }
        
        parseFlagChanges(packet.liveFlags, this.clientStorage.liveFlags);
        this.core.save.liveFlags = this.clientStorage.liveFlags;
    }

    @onTick()
    onTick() {
        if (
            !this.core.helper.isTitleScreen() &&
            this.core.helper.isSceneNameValid()
        ) {
            if (!this.core.helper.isPaused()) {
                this.ModLoader.me.data["world"] = this.clientStorage.world;
                if (!this.clientStorage.first_time_sync) {
                    return;
                }
                if (this.LobbyConfig.data_syncing) {
                    this.syncTimer++;
                }
            }
        }
    }

    inventoryUpdateTick() {
        this.updateInventory();
        this.updateFlags();
        this.updateRegionFlags();
        this.updateLiveFlags();
    }
}
