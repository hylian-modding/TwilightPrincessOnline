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

export default class TPOnlineServer {

    @InjectCore()
    core!: ITPCore;
    @ModLoaderAPIInject()
    ModLoader!: IModLoaderAPI;
    @ParentReference()
    parent!: IPlugin;

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

        const indexBlacklist = [0x0, 0x1, 0x2, 0x3, 0x4, 0x5, 0x7, 0x8, 0x9, 0xE, 0xF, 0x24, 0x25, 0x2D, 0x2E, 0x34, 0x9D];

        for (let i = 0; i < storage.eventFlags.byteLength; i++) {
            let byteStorage = storage.eventFlags.readUInt8(i);
            let bitsStorage = bitwise.byte.read(byteStorage as any);
            let byteIncoming = packet.eventFlags.readUInt8(i);
            let bitsIncoming = bitwise.byte.read(byteIncoming as any);

            if (!indexBlacklist.includes(i) && byteStorage !== byteIncoming) {
                //console.log(`Server: Parsing flag: 0x${i.toString(16)}, byteIncoming: 0x${byteIncoming.toString(16)}, bitsIncoming: 0x${bitsIncoming} `);
                byteStorage = byteStorage |= byteIncoming;
                storage.eventFlags.writeUInt8(byteStorage, i); //write new byte into the event flag at index i
                console.log(`Server: Parsing flag: 0x${i.toString(16)}, byteStorage: 0x${byteStorage.toString(16)}, byteIncoming: 0x${byteIncoming.toString(16)} `);

            }
            else if (indexBlacklist.includes(i) && byteStorage !== byteIncoming) {
                //console.log(`Server: indexBlacklist: 0x${i.toString(16)}`);
                for (let j = 0; j <= 7; j++) {
                    switch (i) {
                        case 0x5: //Ilia & Collin kidnapped
                            if (j !== 0) bitsStorage[j] = bitsIncoming[j];
                            else console.log(`Blacklisted event: 0x${i.toString(16)}, bit: ${j}`)
                            break;
                        case 0x15: //Goats Day 2 Finished
                            if (j !== 0) bitsStorage[j] = bitsIncoming[j];
                            else console.log(`Blacklisted event: 0x${i.toString(16)}, bit: ${j}`)
                            break;
                        case 0x42: //Goats Day 3 Finished
                            if (j !== 1) bitsStorage[j] = bitsIncoming[j];
                            else console.log(`Blacklisted event: 0x${i.toString(16)}, bit: ${j}`)
                            break;
                    }
                }
                let newByteStorage = bitwise.byte.write(bitsStorage); //write our updated bits into a byte
                //console.log(`Server: Parsing flag: 0x${i.toString(16)}, byteStorage: 0x${byteStorage.toString(16)}, newByteStorage: 0x${newByteStorage.toString(16)} `);
                if (newByteStorage !== byteStorage) {  //make sure the updated byte is different than the original
                    byteStorage = newByteStorage;
                    storage.eventFlags.writeUInt8(byteStorage, i); //write new byte into the event flag at index i
                    //console.log(`Server: Parsing flag: 0x${i.toString(16)}, byteStorage: 0x${byteStorage.toString(16)}, newByteStorage: 0x${newByteStorage.toString(16)} `);
                }
            }
        }

        this.ModLoader.serverSide.sendPacket(new TPO_EventFlagUpdate(storage.eventFlags, packet.lobby));
    }


    @ServerNetworkHandler('TPO_ClientSceneContextUpdate')
    onSceneContextSync_server(packet: TPO_ClientSceneContextUpdate) {
        this.sendPacketToPlayersInScene(packet);
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