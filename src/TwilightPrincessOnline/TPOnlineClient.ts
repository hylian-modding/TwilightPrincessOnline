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
import { TPO_UpdateSaveDataPacket, TPO_DownloadRequestPacket, TPO_ScenePacket, TPO_SceneRequestPacket, TPO_DownloadResponsePacket, TPO_BottleUpdatePacket, TPO_ErrorPacket, TPO_RoomPacket, TPO_RupeePacket, TPO_EventFlagUpdate, TPO_ClientSceneContextUpdate } from "./network/TPOPackets";
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

    //Event Flags
    updateFlags() {
        if (this.core.helper.isTitleScreen() || !this.core.helper.isSceneNameValid() || this.core.helper.isPaused() || !this.clientStorage.first_time_sync || this.core.global.current_scene_frame < 60) return;
        if (!this.clientStorage.eventFlags.equals(this.core.save.eventFlags)) {
            for (let i = 0; i < this.clientStorage.eventFlags.byteLength; i++) {
                let byteStorage = this.clientStorage.eventFlags.readUInt8(i);
                let byteIncoming = this.core.save.eventFlags.readUInt8(i);
                if (byteStorage !== byteIncoming && byteIncoming !== 0x0) {
                    console.log(`Client: Parsing flag: 0x${i.toString(16)}, byteStorage: 0x${byteStorage.toString(16)}, byteIncoming: 0x${byteIncoming.toString(16)}`);
                }
            }
            this.clientStorage.eventFlags = this.core.save.eventFlags;
            this.ModLoader.clientSide.sendPacket(new TPO_EventFlagUpdate(this.clientStorage.eventFlags, this.ModLoader.clientLobby));
        }
    }

    autosaveSceneData() {
        if (!this.core.helper.isLoadingZone() && this.core.global.current_scene_frame > 20 && this.clientStorage.first_time_sync) {

            let live_scene_chests: Buffer = this.core.save.stage_Live.chests;
            let live_scene_switches: Buffer = this.core.save.stage_Live.switches;
            let live_scene_collect: Buffer = this.core.save.stage_Live.items;
            let save_scene_data: Buffer = this.core.global.getSaveDataForCurrentScene();
            let save: Buffer = Buffer.alloc(0x20);

            live_scene_chests.copy(save, 0x0); // Chests
            live_scene_switches.copy(save, 0x8); // Switches
            live_scene_collect.copy(save, 0x18); // Collectables
            save[0x1C] = this.core.save.stage_Live.keys; // Key Count

            let save_hash_2: string = this.ModLoader.utils.hashBuffer(save);
            if (save_hash_2 !== this.clientStorage.autoSaveHash) {
                this.ModLoader.logger.info('autosaveSceneData()');
                save_scene_data.copy(save, 0x1D, 0x1D);
                for (let i = 0; i < save_scene_data.byteLength; i++) {
                    save_scene_data[i] |= save[i];
                }
                this.clientStorage.autoSaveHash = save_hash_2;
            }
            else {
                return;
            }
            this.core.global.writeSaveDataForCurrentScene(save_scene_data);
            this.ModLoader.clientSide.sendPacket(new TPO_ClientSceneContextUpdate(live_scene_chests, live_scene_switches, live_scene_collect, this.ModLoader.clientLobby, this.core.global.current_stage_id, this.clientStorage.world));
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
            }, 100);
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

    @NetworkHandler('TPO_EventFlagUpdate')
    onFlagUpdate(packet: TPO_EventFlagUpdate) {
        if (
            this.core.helper.isTitleScreen() ||
            !this.core.helper.isSceneNameValid() ||
            this.core.helper.isLoadingZone()
        ) {
            return;
        }
        console.log("onFlagUpdate Client");

        for (let i = 0; i < packet.eventFlags.byteLength; i++) {
            if (packet.eventFlags[i] !== this.clientStorage.eventFlags[i]) {
                console.log(`Writing flag: 0x${i.toString(16)}, storage: 0x${this.clientStorage.eventFlags[i].toString(16)}, incoming: 0x${packet.eventFlags[i].toString(16)} `);
            }
        }
        let eventFlags = this.clientStorage.eventFlags;
        parseFlagChanges(packet.eventFlags, eventFlags);
        this.clientStorage.eventFlags = eventFlags;
        this.core.save.eventFlags = this.clientStorage.eventFlags;
    }

    @NetworkHandler('TPO_ClientSceneContextUpdate')
    onSceneContextSync_client(packet: TPO_ClientSceneContextUpdate) {
        if (
            this.core.helper.isTitleScreen() ||
            !this.core.helper.isSceneNameValid() ||
            this.core.helper.isLoadingZone()
        ) {
            return;
        }
        if (this.core.global.current_stage_id !== packet.stage) {
            return;
        }
        if (packet.world !== this.clientStorage.world) return;
        let buf1: Buffer = this.core.save.stage_Live.chests;
        if (Object.keys(parseFlagChanges(packet.chests, buf1) > 0)) {
            this.core.save.stage_Live.chests = buf1;
        }

        let buf2: Buffer = this.core.save.stage_Live.switches;
        if (Object.keys(parseFlagChanges(packet.switches, buf2) > 0)) {
            this.core.save.stage_Live.switches = buf2;
        }

        let buf3: Buffer = this.core.save.stage_Live.items;
        if (Object.keys(parseFlagChanges(packet.collect, buf3) > 0)) {
            this.core.save.stage_Live.items = buf3;
        }

        // Update hash.
        this.clientStorage.saveManager.createSave();
        this.clientStorage.lastPushHash = this.clientStorage.saveManager.hash;
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
                    this.autosaveSceneData();
                    this.syncTimer++;
                }
            }
        }
    }

    inventoryUpdateTick() {
        this.updateInventory();
        this.updateFlags();
    }
}
