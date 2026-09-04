/** Shared rs2b0t Load-URL ABI types for standalone TypeScript scripts. */

export {};

declare global {
    interface SettingsApi {
        bool(key: string, fallback?: boolean): boolean;
        str(key: string, fallback?: string): string;
        num?(key: string, fallback?: number): number;
        tile?(key: string, fallback?: TileLike): TileLike;
    }

    interface BotEvent {
        name?: string;
        text?: string;
        previous?: number;
        level?: number;
        [key: string]: unknown;
    }

    class LoopingBot {
        log(message: string): void;
        settings: SettingsApi;
        on(event: string, handler: (e: BotEvent) => void): void;
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
        static from(tile: TileLike | null | undefined): Tile;
        distanceTo(other: TileLike | null | undefined): number;
    }

    interface WalkOpts {
        radius?: number;
        attempts?: number;
        timeoutMs?: number;
        useTeleports?: boolean;
        log?: (message: string) => void;
    }

    interface TraversalApi {
        preload(): void;
        walkResilient(dest: TileLike, opts?: any): Promise<void>;
        walkTo(dest: TileLike, opts?: any): Promise<void>;
        [key: string]: any;
    }

    interface DirectNavigatorApi {
        walkTo?: (tile: TileLike, radius?: number, timeoutMs?: number) => Promise<void>;
    }

    /** Loc/NPC wrappers expose name/tile/actions as a property or a method. */
    interface GameEntity {
        name?: any;
        tile?: any;
        actions?: any;
        distance?: any;
        interact: (op: string) => Promise<boolean | void> | boolean | void;
        [key: string]: any;
    }

    type Loc = GameEntity;
    type Npc = GameEntity;
    type GroundItem = GameEntity;
    type Player = GameEntity;

    interface AreaBox {
        minX: number;
        maxX: number;
        minZ: number;
        maxZ: number;
    }

    interface EntityQuery<T> {
        where(pred: (entity: T) => any): EntityQuery<T>;
        name(...names: string[]): EntityQuery<T>;
        action(op: string): EntityQuery<T>;
        within(tiles: number): EntityQuery<T>;
        inside?(box: AreaBox): EntityQuery<T>;
        nearest(): T | null | undefined;
        results?: () => T[] | null | undefined;
    }

    interface LocsApi {
        query: () => EntityQuery<Loc>;
    }

    interface NpcsApi {
        query: () => EntityQuery<Npc>;
    }

    interface GroundItemsApi {
        query: () => EntityQuery<GroundItem>;
    }

    interface PlayersApi {
        query: () => EntityQuery<Player>;
    }

    interface GameApi {
        ingame(): boolean;
        tile(): TileLike | null;
        animating(): boolean;
        [key: string]: any;
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
        useOn?: (target: any) => Promise<boolean | void> | boolean | void;
        [key: string]: any;
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
        used(): number;
        free(): number;
        count(name: string): number;
        isFull(): boolean;
        first(name: string): InvItem | null | undefined;
        [key: string]: any;
    }

    interface EquipmentApi {
        items(): EquipItem[];
        contains(name: string): boolean;
        equip(name: string): Promise<void> | void;
        unequip(name: string): Promise<boolean | void> | boolean | void;
        [key: string]: any;
    }

    interface BankApi {
        isOpen(): boolean;
        close(): Promise<void> | void;
        items(): BankItem[];
        loaded(): boolean;
        count(name: string): number;
        noteMode?: () => boolean;
        depositInventory?: () => Promise<void> | void;
        snapshotGeneration?: () => number;
        waitSnapshotAfter?: (gen: number, timeoutMs: number) => Promise<void>;
        setNoteMode?: (noted: boolean) => Promise<void> | void;
        withdraw?: (name: string, op?: string) => Promise<boolean> | boolean;
        withdrawById?: (id: number, op: string) => Promise<boolean> | boolean;
        withdrawX?: (name: string, amount: number) => Promise<boolean> | boolean;
        withdrawXById?: (id: number, amount: number) => Promise<boolean> | boolean;
        depositAllMatching?: (pred: (name: string, id: number) => boolean) => Promise<void> | void;
        openBooth?: (
            stand: TileLike,
            name: string,
            op: string,
            log?: (message: string) => void
        ) => Promise<boolean> | boolean;
    }

    interface BankingApi {
        preload?: () => void;
        open(opts?: Record<string, any>): Promise<boolean>;
        bankNearest?: (...args: any[]) => any;
        [key: string]: any;
    }

    interface ShopApi {
        isOpen(): boolean;
        close(): Promise<void> | void;
        open(npcName: string): Promise<boolean>;
        buy(name: string, amount: number): Promise<any>;
        sell(name: string, amount: number): Promise<any>;
        [key: string]: any;
    }

    interface TradeOfferItem {
        name?: string;
        id?: number;
        count?: number;
        noted?: boolean;
    }

    interface TradeApi {
        request(name: string): Promise<void> | void;
        active(): boolean;
        onOfferScreen(): boolean;
        onConfirmScreen(): boolean;
        accept(): Promise<void> | void;
        decline(): Promise<void> | void;
        myOffer(): TradeOfferItem[];
        partner(): string | null | undefined;
        offerAll?: (...args: any[]) => Promise<boolean> | boolean;
        [key: string]: any;
    }

    interface SkillsApi {
        xp(skill: string): number;
        level(skill: string): number;
        effective(skill: string): number;
    }

    interface ChatDialogApi {
        canContinue(): boolean;
        continue(): Promise<void> | void;
        isMakeMenu?: () => boolean;
        isOpen?: () => boolean;
        makeProducts?: () => any;
        makeX?: (...args: any[]) => any;
        make?: (...args: any[]) => any;
        options?: () => any;
        chooseOption?: (...args: any[]) => any;
        [key: string]: any;
    }

    interface AxeDef {
        name: string;
        level?: number;
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
        Locs: LocsApi;
        Npcs: NpcsApi;
        GroundItems: GroundItemsApi;
        Players: PlayersApi;
        Shop: ShopApi;
        Trade: TradeApi;
        Loadouts?: { all?: () => any[] };
        SettingsStore?: { displayString?: (a: string, b: string, opts?: unknown) => string };
        Traversal: TraversalApi;
        DirectNavigator: DirectNavigatorApi;
        Tile: typeof Tile;
        AXES: AxeDef[];
        bestAxe: (level: number, pred: (name: string) => boolean) => string | null | undefined;
        canWieldTool: (name: string, attackLevel: number) => boolean;
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
