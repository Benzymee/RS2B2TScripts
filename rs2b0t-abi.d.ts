/** Shared rs2b0t Load-URL ABI types for standalone TypeScript scripts. */

export {};

declare global {
    interface SettingsApi {
        bool(key: string, fallback?: boolean): boolean;
        str(key: string, fallback?: string): string;
        num?(key: string, fallback?: number): number;
    }

    class LoopingBot {
        log(message: string): void;
        settings: SettingsApi;
        onStart(): Promise<void> | void;
        onStop(): void;
        loop(): Promise<void>;
        onPaint(ctx: CanvasRenderingContext2D): void;
    }

    interface ExecutionApi {
        delay(ms: number): Promise<void>;
        delayTicks(n: number): Promise<void>;
        delayUntil(pred: () => boolean, timeout: number): Promise<boolean>;
    }

    interface TileLike {
        x: number;
        z: number;
        level?: number;
    }

    class Tile implements TileLike {
        x: number;
        z: number;
        level?: number;
        constructor(x: number, z: number, level?: number);
    }

    interface WalkOpts {
        radius?: number;
        attempts?: number;
        timeoutMs?: number;
        useTeleports?: boolean;
        log?: (message: string) => void;
    }

    interface TraversalApi {
        preload?: () => void;
        walkResilient?: (dest: TileLike, opts?: WalkOpts) => Promise<void>;
        walkTo?: (dest: TileLike, opts?: WalkOpts) => Promise<void>;
    }

    interface Loc {
        name?: string | (() => string | null | undefined);
        tile?: TileLike | (() => TileLike | null | undefined);
        actions?: string[] | (() => string[] | null | undefined);
        distance?: () => number;
        interact: (op: string) => Promise<boolean | void> | boolean | void;
    }

    interface LocQuery {
        where(pred: (loc: Loc) => boolean): LocQuery;
        nearest(): Loc | null | undefined;
        results?: () => Loc[] | null | undefined;
    }

    interface LocsApi {
        query?: () => LocQuery;
    }

    interface GameApi {
        ingame(): boolean;
        tile(): TileLike | null;
        animating?: () => boolean;
        myName?: () => string | null | undefined;
        castOnInv?: (spell: string, item: InvItem) => Promise<boolean> | boolean;
        castOnItem?: (spell: string, item: InvItem) => Promise<boolean> | boolean;
    }

    interface InvSnap {
        slot?: number;
        id?: number;
        comId?: number;
    }

    interface InvItem {
        id: number;
        name?: string;
        count: number;
        slot: number;
        snap?: InvSnap;
        interact?: (op: string) => Promise<boolean | void> | boolean | void;
    }

    interface BankItem {
        slot?: number;
        id: number;
        name?: string;
        count?: number;
        comId?: number;
        ops?: string[];
    }

    interface EquipItem {
        name?: string;
    }

    interface InventoryApi {
        items(): InvItem[];
        used?: () => number;
    }

    interface EquipmentApi {
        items?: () => EquipItem[];
        contains?: (name: string) => boolean;
        equip?: (name: string) => Promise<void> | void;
    }

    interface BankApi {
        isOpen(): boolean;
        close(): Promise<void> | void;
        items?: () => BankItem[] | null;
        loaded?: () => boolean;
        depositInventory?: () => Promise<void> | void;
        snapshotGeneration?: () => number;
        waitSnapshotAfter?: (gen: number, timeoutMs: number) => Promise<void>;
        setNoteMode?: (noted: boolean) => Promise<void> | void;
        withdraw?: (name: string, op: string) => Promise<boolean> | boolean;
        withdrawById?: (id: number, op: string) => Promise<boolean> | boolean;
        withdrawX?: (name: string, amount: number) => Promise<boolean> | boolean;
        withdrawXById?: (id: number, amount: number) => Promise<boolean> | boolean;
        depositAllMatching?: (pred: (name: string, id: number) => boolean) => Promise<void> | void;
    }

    interface BankingApi {
        preload?: () => void;
        open(opts?: { log?: (message: string) => void }): Promise<boolean>;
    }

    interface SkillsApi {
        xp(skill: string): number;
        level(skill: string): number;
    }

    interface ChatDialogApi {
        canContinue(): boolean;
        continue(): Promise<void> | void;
    }

    interface BotSpec {
        name: string;
        version?: string;
        category?: string;
        tags?: string[];
        description?: string;
        settingsSchema?: Record<string, unknown>;
        create: () => LoopingBot;
    }

    interface ObjTypeDef {
        name?: string;
        certtemplate?: number;
        certTemplate?: number;
        certlink?: number;
        certLink?: number;
        cost?: number;
        value?: number;
        costgp?: number;
        [key: string]: unknown;
    }

    interface ObjTypeTable {
        count?: number;
        list?: (id: number) => ObjTypeDef | null | undefined;
    }

    interface IfComponent {
        swapSlots?: (fromSlot: number, toSlot: number) => void;
    }

    interface IfTypeTable {
        list?: IfComponent[] | Record<number, IfComponent>;
    }

    interface PacketOut {
        p1Enc?: (opcode: number) => void;
        p2?: (value: number) => void;
        p1?: (value: number) => void;
    }

    interface GameClient {
        out?: PacketOut;
        ObjType?: ObjTypeTable;
    }

    interface CacheHolder {
        ObjType?: ObjTypeTable;
        IfType?: IfTypeTable;
    }

    interface ModalReader {
        modals?: () => { main: number };
        mainModalTexts?: () => string[];
        closeButtonComId?: (main: number) => number;
        buttonByText?: (root: number, label: string) => number;
        inventory?: () => InvSnap[];
        sideTabInterface?: (tab: number) => number;
        targetButtonByBase?: (root: number, name: string) => number;
        activeSideTab?: () => number;
        localPlayerName?: () => string | null | undefined;
    }

    interface ModalActions {
        closeModal?: () => boolean;
        ifButton?: (comId: number) => boolean;
        closeMainModal?: (main: number) => void;
        menuAction?: (op: number, a: number, b: number, c: number) => boolean;
        clickSideTab?: (tab: number) => void;
    }

    interface Rs2b0tHost {
        stopScript?: () => void;
        runner?: { stop?: () => void };
        reader?: ModalReader;
        actions?: ModalActions;
        client?: GameClient;
    }

    interface Rs2b0tAbi {
        apiVersion: number;
        defineBot: (spec: BotSpec) => unknown;
        Execution: ExecutionApi;
        Game: GameApi;
        LoopingBot: typeof LoopingBot;
        Bank: BankApi;
        Banking: BankingApi;
        ChatDialog: ChatDialogApi;
        Inventory: InventoryApi;
        Equipment: EquipmentApi;
        Skills: SkillsApi;
        Locs?: LocsApi;
        Traversal?: TraversalApi;
        Tile: typeof Tile;
        withdrawOp?: (ops: string[] | undefined, kind: string) => string | null;
        ObjType?: ObjTypeTable;
        IfType?: IfTypeTable;
    }

    var __rs2b0t: Rs2b0tAbi | undefined;
    var rs2b0t: Rs2b0tHost | undefined;
    var __client: GameClient | undefined;
    var ObjType: ObjTypeTable | undefined;
    var IfType: IfTypeTable | undefined;

    interface GlobalThis {
        __rs2b0t?: Rs2b0tAbi;
        rs2b0t?: Rs2b0tHost;
        __client?: GameClient;
        ObjType?: ObjTypeTable;
        IfType?: IfTypeTable;
    }
}
