import { IPlugin, IModLoaderAPI, IPluginServerConfig } from 'modloader64_api/IModLoaderAPI';
import { InjectCore } from 'modloader64_api/CoreInjection';
import * as API from 'TwilightPrincess/API/Imports'
import { bus } from 'modloader64_api/EventHandler';
import fs from 'fs';
import path from 'path';
import { ProxySide, SidedProxy } from 'modloader64_api/SidedProxy/SidedProxy';
import TPOnlineClient from './TPOnlineClient';
import TPOnlineServer from './TPOnlineServer';
import { IPacketHeader } from 'modloader64_api/NetworkHandler';
import { TPOnlineStorageClient } from './storage/TPOnlineStorageClient';
import { ITPOnlineHelpers } from './api/TPOAPI';

export interface ITPOnlineLobbyConfig {
    data_syncing: boolean;
}

export class TPOnlineConfigCategory {
    itemCountSync: boolean = false;
    enablePuppets: boolean = true;
    syncBottleContents: boolean = true;
}

class TwilightPrincessOnline implements IPlugin, ITPOnlineHelpers, IPluginServerConfig {

    ModLoader!: IModLoaderAPI;
    pluginName?: string | undefined;
    @InjectCore()
    core!: API.ITPCore;
    @SidedProxy(ProxySide.CLIENT, TPOnlineClient)
    client!: TPOnlineClient;
    @SidedProxy(ProxySide.SERVER, TPOnlineServer)
    server!: TPOnlineServer;

    // Storage
    LobbyConfig: ITPOnlineLobbyConfig = {} as ITPOnlineLobbyConfig;
    clientStorage: TPOnlineStorageClient = new TPOnlineStorageClient();

    sendPacketToPlayersInScene(packet: IPacketHeader): void {
        if (this.ModLoader.isServer) {
            this.server.sendPacketToPlayersInScene(packet);
        }
    }

    getClientStorage(): TPOnlineStorageClient | null {
        return this.client !== undefined ? this.client.clientStorage : null;
    }

    canWriteDataSafely(): boolean {
        return !(!this.core.helper.isLinkControllable() || !this.core.helper.isLinkExists() ||
            this.core.helper.isTitleScreen() || !this.core.helper.isSceneNameValid() ||
            this.core.helper.isPaused());
    }

    preinit(): void {
        if (this.client !== undefined) this.client.clientStorage = this.clientStorage;
    }
    init(): void {
    }
    postinit(): void {

    }
    onTick(frame?: number | undefined): void {

        if (!this.canWriteDataSafely()) return;
    }

    getServerURL(): string {
        return "modloader64.com:9020";
    }
}

module.exports = TwilightPrincessOnline;

export default TwilightPrincessOnline;