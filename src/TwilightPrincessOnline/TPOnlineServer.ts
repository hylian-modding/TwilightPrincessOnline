import { TPO_PRIVATE_EVENTS } from "./api/InternalAPI";
import { TPOEvents, TPOPlayerScene } from "./api/TPOAPI";
import { InjectCore } from "modloader64_api/CoreInjection";
import { EventHandler, EventsServer, EventServerJoined, EventServerLeft, bus } from "modloader64_api/EventHandler";
import { IModLoaderAPI, IPlugin } from "modloader64_api/IModLoaderAPI";
import { ModLoaderAPIInject } from "modloader64_api/ModLoaderAPIInjector";
import { IPacketHeader, LobbyData, ServerNetworkHandler } from "modloader64_api/NetworkHandler";
import { Preinit } from "modloader64_api/PluginLifecycle";
import { ParentReference, SidedProxy, ProxySide } from "modloader64_api/SidedProxy/SidedProxy";
import { TPO_ScenePacket, TPO_DownloadRequestPacket, TPO_DownloadResponsePacket, TPO_UpdateSaveDataPacket, TPO_ErrorPacket, TPO_RoomPacket, TPO_BottleUpdatePacket, TPO_RupeePacket, TPO_EventFlagUpdate, TPO_ClientSceneContextUpdate } from "./network/TPOPackets";
import { TPOSaveData } from "./save/TPOnlineSaveData";
import { TPOnlineStorage, TPOnlineSave_Server } from "./storage/TPOnlineStorage";
import TPSerialize from "./storage/TPSerialize";
import { InventoryItem, ITPCore } from "TwilightPrincess/API/TPAPI";
import { parseFlagChanges } from "./save/parseFlagChanges";
import bitwise from 'bitwise';
import { PuppetOverlord } from "./puppet/PuppetOverlord";

export default class TPOnlineServer {

    @InjectCore()
    core!: ITPCore;
    @ModLoaderAPIInject()
    ModLoader!: IModLoaderAPI;
    @ParentReference()
    parent!: IPlugin;
    //@SidedProxy(ProxySide.SERVER, PuppetOverlord)
    //puppets!: PuppetOverlord;

    sendPacketToPlayersInScene(packet: IPacketHeader) {
        try {
            let storage: TPOnlineStorage = this.ModLoader.lobbyManager.getLobbyStorage(
                packet.lobby,
                this.parent
            ) as TPOnlineStorage;
            if (storage === null) {
                return;
            }
            Object.keys(storage.players).forEach((key: string) => {
                if (storage.players[key] === storage.players[packet.player.uuid]) {
                    if (storage.networkPlayerInstances[key].uuid !== packet.player.uuid) {
                        this.ModLoader.serverSide.sendPacketToSpecificPlayer(
                            packet,
                            storage.networkPlayerInstances[key]
                        );
                    }
                }
            });
        } catch (err: any) { }
    }

    @EventHandler(EventsServer.ON_LOBBY_CREATE)
    onLobbyCreated(lobby: string) {
        try {
            this.ModLoader.lobbyManager.createLobbyStorage(lobby, this.parent, new TPOnlineStorage());
            let storage: TPOnlineStorage = this.ModLoader.lobbyManager.getLobbyStorage(
                lobby,
                this.parent
            ) as TPOnlineStorage;
            if (storage === null) {
                return;
            }
            storage.saveManager = new TPOSaveData(this.core, this.ModLoader);
        }
        catch (err: any) {
            this.ModLoader.logger.error(err);
        }
    }

    @Preinit()
    preinit() {

    }

    @EventHandler(EventsServer.ON_LOBBY_DATA)
    onLobbyData(ld: LobbyData) {
    }

    @EventHandler(EventsServer.ON_LOBBY_JOIN)
    onPlayerJoin_server(evt: EventServerJoined) {
        let storage: TPOnlineStorage = this.ModLoader.lobbyManager.getLobbyStorage(
            evt.lobby,
            this.parent
        ) as TPOnlineStorage;
        if (storage === null) {
            return;
        }
        storage.players[evt.player.uuid] = -1;
        storage.networkPlayerInstances[evt.player.uuid] = evt.player;
    }

    @EventHandler(EventsServer.ON_LOBBY_LEAVE)
    onPlayerLeft_server(evt: EventServerLeft) {
        let storage: TPOnlineStorage = this.ModLoader.lobbyManager.getLobbyStorage(
            evt.lobby,
            this.parent
        ) as TPOnlineStorage;
        if (storage === null) {
            return;
        }
        delete storage.players[evt.player.uuid];
        delete storage.networkPlayerInstances[evt.player.uuid];
    }

    @ServerNetworkHandler('TPO_ScenePacket')
    onSceneChange_server(packet: TPO_ScenePacket) {
        try {
            let storage: TPOnlineStorage = this.ModLoader.lobbyManager.getLobbyStorage(
                packet.lobby,
                this.parent
            ) as TPOnlineStorage;
            if (storage === null) {
                return;
            }
            storage.players[packet.player.uuid] = packet.scene;
            this.ModLoader.logger.info(
                'Server: Player ' +
                packet.player.nickname +
                ' moved to scene ' +
                packet.scene +
                '.'
            );
            bus.emit(TPOEvents.SERVER_PLAYER_CHANGED_SCENES, new TPO_ScenePacket(packet.lobby, packet.scene));
        } catch (err: any) {
        }
    }

    // Client is logging in and wants to know how to proceed.
    @ServerNetworkHandler('TPO_DownloadRequestPacket')
    onDownloadPacket_server(packet: TPO_DownloadRequestPacket) {
        let storage: TPOnlineStorage = this.ModLoader.lobbyManager.getLobbyStorage(
            packet.lobby,
            this.parent
        ) as TPOnlineStorage;
        if (storage === null) {
            return;
        }
        if (typeof storage.worlds[packet.player.data.world] === 'undefined') {
            this.ModLoader.logger.info(`Creating world ${packet.player.data.world} for lobby ${packet.lobby}.`);
            storage.worlds[packet.player.data.world] = new TPOnlineSave_Server();
        }
        let world = storage.worlds[packet.player.data.world];
        if (world.saveGameSetup) {
            // Game is running, get data.
            let resp = new TPO_DownloadResponsePacket(packet.lobby, false);
            TPSerialize.serialize(world.save).then((buf: Buffer) => {
                resp.save = buf;
                this.ModLoader.serverSide.sendPacketToSpecificPlayer(resp, packet.player);
            }).catch((err: string) => { });
        } else {
            // Game is not running, give me your data.
            TPSerialize.deserialize(packet.save).then((data: any) => {
                Object.keys(data).forEach((key: string) => {
                    let obj = data[key];
                    world.save[key] = obj;
                });
                world.saveGameSetup = true;
                let resp = new TPO_DownloadResponsePacket(packet.lobby, true);
                this.ModLoader.serverSide.sendPacketToSpecificPlayer(resp, packet.player);
            });
        }
    }

    //------------------------------
    // Flag Syncing
    //------------------------------

    @ServerNetworkHandler('TPO_EventFlagUpdate')
    onFlagUpdate(packet: TPO_EventFlagUpdate) {
        let storage: TPOnlineStorage = this.ModLoader.lobbyManager.getLobbyStorage(
            packet.lobby,
            this.parent
        ) as TPOnlineStorage;
        if (storage === null) {
            return;
        }

        //console.log("onFlagUpdate Server")

        let eventFlags = storage.eventFlags;
        parseFlagChanges(packet.eventFlags, eventFlags);

        // Mask some bits out that are potential softlocks
        eventFlags[0x1] &= 0xEF;  //Talked to Fado before goats 1
        eventFlags[0x5] &= 0x77;  // Ilia & Collin kidnapped || Entered Ordon Shield house as wolf at night
        eventFlags[0xD] &= 0x7E;  // Midna text after Ordon shield obtained || Met Princess Zelda in sewers (Needed to spawn Fado in ranch)
        eventFlags[0x15] &= 0x3F; // Goats Day 2 Finished || Warping in Lanayru Province disabled
        eventFlags[0x1D] &= 0xFE; // Mini-map retracted (d-pad left or when there's no map)
        eventFlags[0x1F] &= 0x0F; // Fyrus Boss has fight state flags in here?..
        eventFlags[0x40] &= 0xFB; // Declined to help Rusl in N. Faron (OFF after saying yes)
        //eventFlags[0x42] &= 0xBF; // Goats Day 3 Finished
        //eventFlags[0x45] &= 0xEF; // Ordon Day 2 over (Set in Goats 2 intro cutscene)
        eventFlags[0x47] &= 0xF3; // Talked to Ilia before calling Epona - Ordon Day 1 || Talked to Ilia after calling Epona - Ordon Day 1
        eventFlags[0x49] &= 0xFE; // talked to Talo in cage day 2
        eventFlags[0x4A] &= 0xAF; // Ordon Day 1 finished (Set when leaving Ranch after Goats 1) || Saw Talo in cage cutscene - Ordon Day 2
        eventFlags[0x4C] &= 0xFE; // Rescued Talo and the Monkey - Ordon Day 2
        eventFlags[0x52] &= 0x00; // More Fyrus boss flags
        eventFlags[0x61] &= 0xBF; // Returned to Ordon from Sewers (Midna Z disabled if ON)
        eventFlags[0x5F] &= 0xF8; // Trill (Faron bird shopkeep) flags

        storage.eventFlags = eventFlags;
        this.ModLoader.serverSide.sendPacket(new TPO_EventFlagUpdate(storage.eventFlags, packet.lobby));
    }


    @ServerNetworkHandler('TPO_ClientSceneContextUpdate')
    onSceneContextSync_server(packet: TPO_ClientSceneContextUpdate) {
        this.ModLoader.serverSide.sendPacket(packet);
    }

    @ServerNetworkHandler('TPO_UpdateSaveDataPacket')
    onSceneFlagSync_server(packet: TPO_UpdateSaveDataPacket) {
        let storage: TPOnlineStorage = this.ModLoader.lobbyManager.getLobbyStorage(
            packet.lobby,
            this.parent
        ) as TPOnlineStorage;
        if (storage === null) {
            return;
        }
        if (typeof storage.worlds[packet.player.data.world] === 'undefined') {
            if (packet.player.data.world === undefined) {
                this.ModLoader.serverSide.sendPacket(new TPO_ErrorPacket("The server has encountered an error with your world. (world id is undefined)", packet.lobby));
                return;
            } else {
                storage.worlds[packet.player.data.world] = new TPOnlineSave_Server();
            }
        }
        let world = storage.worlds[packet.player.data.world];
        storage.saveManager.mergeSave(packet.save, world.save, ProxySide.SERVER).then((bool: boolean) => {
            if (bool) {
                TPSerialize.serialize(world.save).then((buf: Buffer) => {
                    this.ModLoader.serverSide.sendPacket(new TPO_UpdateSaveDataPacket(packet.lobby, buf, packet.player.data.world));
                }).catch((err: string) => { });
            }
        });
    }
}