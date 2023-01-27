import { IPlugin, IModLoaderAPI, IPluginServerConfig, ModLoaderEvents } from 'modloader64_api/IModLoaderAPI';
import { bus, EventHandler } from 'modloader64_api/EventHandler';
import { InjectCore } from 'modloader64_api/CoreInjection';
import * as API from 'TwilightPrincess/API/Imports'
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
        const CommandBufferHook = Buffer.from([0x49, 0x5A, 0x6B, 0x2D]);
        const CommandBufferFunc = Buffer.from("9421FFB87C0802A69001004C93E100447C3F0B78907F003839200000913F001439200000913F001839200000913F001C39200000913F0010807F00384A8872753D2081803D40DEAD91490FFC39200000913F0008480002A0813F00081D4900283D208180392910007D2A4A1439290008913F001C813F001C81290000280900024182021C28090002418102542C09000041820240280900014082024439200000913F000C480000583D20818039491000813F000C1D2900287D2A4A1439290A0C812900002C09000040820028813F000C1D29002839490A003D208180392910007D2A4A1439290008913F00104800001C813F000C39290001913F000C813F000C2809003F4081FFA4813F000C2C090040418201C83D2080418129BF6C2C090000408200183D2081803D40BAD0614AF00D91490FFC480001A83D2081803D40DEAD614A000191490FFC3D2080418129BF6C392904D0913F0028815F00283D20818091490FFC3D2080426129D3E089290000552A063E392000003900000038E0000038C000007D455378809F0028386000004A81998D7C691B78913F00183D2081803D40DEAD614A000291490FFC4A821549907F002C3D2081803D40DEAD614A000391490FFC80FF001838C0000038A0000038800255807F002C4A823BBD907F00243D2081803D40DEAD614A000491490FFC813F00242C09000041820078813F00103940000091490008813F0010394000009149000C813F00103940000091490014813F0010815F002491490018813F001C81490004813F00109149001C813F00103940000091490020813F00103940FFFF91490024813F00103940000391490000813F001039400000914900044800006C813F00103940FFFF91490008813F00103D40DEAD614ADEAD9149000C813F00103940000091490014480000403D2081803D40DEAD614A000591490FFC813F001C812900087D234B784A8199C53D2081803D40DEAD614A000691490FFC48000010600000004800000860000000813F001C3940000091490000813F000839290001913F00083D2081803929100081290000815F00087C0A48404180FD503D20818039291000394000009149000039200000913F00084800016C813F00081D29002839490A003D208180392910007D2A4A1439290008913F0010813F00108129000028090003408201303D2081803D40DEAD614A000791490FFC813F00108129002039490001813F001091490020813F0010812900185529043E7D234B784A82075D7C691B78913F00243D2081803D40DEAD614A000891490FFC813F00242C090000408200B03D2081803D40DEAD614A000991490FFC813F0010392900187D244B783D208002386935904A8194217C691B78913F00143D2081803D40DEAD614A000A91490FFC813F00142C09000041820040813F00108149001C813F001091490004813F00103940000191490000813F0010815F001491490008813F00103D40BEEF614ABEEF9149000C480000483D2081803D40DEAD614A000B91490FFC813F00103D4000BA614ADBAD91490014480000243D2081803D40DEAD614A000C91490FFC813F00103D40DEAD614ABEEF9149001460000000813F000839290001913F0008813F00082809003F4081FE90813F00207D234B78397F0048800B00047C0803A683EBFFFC7D615B784E800020", 'hex');
        this.ModLoader.emulator.rdramWriteBuffer(0x802594d4, CommandBufferHook);
        this.ModLoader.emulator.rdramWriteBuffer(0x81800000, CommandBufferFunc);
    }

    getServerURL(): string {
        return "modloader64.com:9040";
    }

    @EventHandler(ModLoaderEvents.ON_ROM_PATCHED)
    onRomPatched(evt: any) {
        //Set up extended memory
        //Set up extended memory
        let iniPath: string = "./data/dolphin/Config/Dolphin.ini";
        if (!fs.existsSync(`./data/dolphin/Config/Dolphin.ini`)) {
            if (!fs.existsSync(`./data`)) fs.mkdirSync(`./data`);
            if (!fs.existsSync(`./data/dolphin`)) fs.mkdirSync(`./data/dolphin`);
            if (!fs.existsSync(`./data/dolphin/Config`)) fs.mkdirSync(`./data/dolphin/Config`);
            fs.writeFileSync(iniPath, Buffer.alloc(0));
        }
        let ini: string = fs.readFileSync(iniPath, "utf8");
        if (!ini.includes("[Core]")) {
            console.log("[Core] not found!")
            ini.concat("[Core]\nRAMOverrideEnable = True\nMEM1Size = 0x04000000");
        }
        if (ini.includes("RAMOverrideEnable = False")) {
            console.log(`RAMOverrideEnable = False -> RAMOverrideEnable = True`);
            let index = ini.indexOf(`RAMOverrideEnable = False`);
            ini = [ini.slice(0, index + 20), "True", ini.slice(index + 25)].join('');
        }
        else if (ini.includes("[Core]") && !ini.includes("RAMOverrideEnable = False")) {
            if (ini.includes("RAMOverrideEnable = True") == true) return;
            console.log("RAMOverrideEnable not found!")
            let index = ini.indexOf(`[Core]`);
            ini = [ini.slice(0, index + 6), "\nRAMOverrideEnable = True", ini.slice(index + 6)].join('');
        }
        if (ini.includes("MEM1Size = 0x01800000")) {
            console.log(`MEM1Size = 0x01800000 -> MEM1Size = 0x04000000`);
            let index = ini.indexOf(`0x01800000`);
            ini = [ini.slice(0, index), "0x04000000", ini.slice(index + 10)].join('');
        }
        else if (ini.includes("[Core]") && !ini.includes("MEM1Size")) {
            console.log("MEM1Size not found!")
            let index = ini.indexOf(`[Core]`);
            ini = [ini.slice(0, index + 6), "\nMEM1Size = 0x04000000", ini.slice(index + 6)].join('');
        }
        fs.writeFileSync(iniPath, ini);

        let rom: Buffer = evt.rom;
        rom.writeUInt32BE(0x03000000, 0x444);
        evt.rom = rom;
        console.log("Applied RAM patch...");
    }

}

module.exports = TwilightPrincessOnline;

export default TwilightPrincessOnline;