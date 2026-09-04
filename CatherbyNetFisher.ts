/// <reference path="./dev/rs2b0t-abi.d.ts" />

/**
 * CatherbyNetFisher. Small-net fishes shrimp at Catherby.
 * Completely vibe coded by @.benzyme on Discord via Cursor AI
 * Self-contained ESM for rs2b0t Load local script / Load URL.
 */
const SUPPORTED_API_VERSION = 1;
const abi = globalThis.__rs2b0t;
if (!abi) {
    throw new Error('CatherbyNetFisher: globalThis.__rs2b0t missing — load inside rs2b0t bot.html');
}
if (abi.apiVersion !== SUPPORTED_API_VERSION) {
    throw new Error(
        `CatherbyNetFisher: ABI ${abi.apiVersion} != supported ${SUPPORTED_API_VERSION}`
    );
}

const {
    defineBot,
    Execution,
    Game,
    LoopingBot: LoopingBotBase,
    Npcs,
    Locs,
    GroundItems,
    Inventory,
    Equipment,
    Bank,
    Banking,
    Traversal,
    Tile,
    Skills,
    ChatDialog
} = abi;

const SCRIPT_NAME = 'CatherbyNetFisher';

/** Post-login welcome modal interface id (Close Window top-right). */
const WELCOME_SCREEN_ID = 5993;

function welcomeHost() {
    return globalThis.rs2b0t ?? null;
}

function isWelcomeModalOpen() {
    const host = welcomeHost();
    if (!host?.reader) {
        return false;
    }
    const { reader } = host;
    const main = typeof reader.modals === 'function' ? reader.modals?.().main ?? -1 : -1;
    if (main === -1) {
        return false;
    }
    if (main === WELCOME_SCREEN_ID) {
        return true;
    }
    if (typeof reader.mainModalTexts !== 'function') {
        return false;
    }
    const texts = reader.mainModalTexts();
    return texts.some(
        t =>
            /welcome to runescape/i.test(t) ||
            /unread messages?/i.test(t) ||
            /jagex staff will never email/i.test(t)
    );
}

/**
 * Always dismiss "Welcome to RuneScape" by clicking Close Window (top-right).
 * Retries until the modal is gone.
 * @returns {Promise<boolean>} true if we acted on / closed it
 */
async function dismissWelcomeScreen(): Promise<any> {
    if (!isWelcomeModalOpen()) {
        return false;
    }
    const host = welcomeHost();
    if (!host?.reader || !host?.actions) {
        return false;
    }
    const { reader, actions } = host;

    for (let attempt = 0; attempt < 8 && isWelcomeModalOpen(); attempt++) {
        const main = reader.modals?.().main ?? -1;
        if (main === -1) {
            break;
        }

        // Prefer real Close Window (top-right BUTTON_CLOSE).
        let clicked = typeof actions.closeModal === 'function' && actions.closeModal();

        if (!clicked && typeof reader.closeButtonComId === 'function' && typeof actions.ifButton === 'function') {
            const closeId = reader.closeButtonComId(main);
            if (closeId !== -1) {
                clicked = !!actions.ifButton(closeId);
            }
        }

        if (!clicked && typeof reader.buttonByText === 'function' && typeof actions.ifButton === 'function') {
            for (const label of ['Close Window', 'Close']) {
                const btn = reader.buttonByText(main, label);
                if (btn !== -1 && actions.ifButton(btn)) {
                    clicked = true;
                    break;
                }
            }
        }

        if (!clicked && typeof actions.closeMainModal === 'function') {
            actions.closeMainModal(main);
        }

        await Execution.delay(250);
    }

    return !isWelcomeModalOpen();
}

/**
 * Catherby Net+Bait hops (fishing_movement_catherby_enum):
 *   Harry sand  2836–2838,3431
 *   mid beach    2844–2846,3429
 *   east rocks   2853–2855,3423  (unreachable — I can't reach that)
 *   lobster cape 2859–2860,3426  (dead-end)
 * Scan Harry sand → mid → east sand (2845); never walk the east rocks or cape.
 */
const ANCHOR = new Tile(2838, 3431, 0);
const LEASH = 14;
const STAND_RADIUS = 6;
/** West sand by Harry — always pathable. Peel here before leaving the east peninsula. */
const WEST_BEACH = new Tile(2838, 3431, 0);
/** Mid sand — sees 2844–2846 hops without stepping onto the lobster rocks. */
const MID_BEACH = new Tile(2842, 3431, 0);
/** Furthest Net+Bait scan stand — still west of the lobster peninsula. */
const EAST_NET = new Tile(2845, 3431, 0);
const BEACH_SCAN = [WEST_BEACH, MID_BEACH, EAST_NET];
/** Walk these west-along-sand if we ever end up on the peninsula. */
const BEACH_WESTWARD = [EAST_NET, WEST_BEACH];
/** East of this X is the lobster peninsula (end-of-beach rocks / water hops). */
const EAST_PENINSULA_MIN_X = 2847;
/** Last reachable Net+Bait hop is 2846,3429. */
const SPOT_MIN_X = 2834;
const SPOT_MAX_X = 2846;
const SPOT_MIN_Z = 3428;
const SPOT_MAX_Z = 3435;
const UNREACHABLE_MS = 45_000;
const CANT_REACH_RE = /i can't reach that/i;

function onEastPeninsula(tile = Game.tile()) {
    return !!(tile && (tile.level ?? 0) === 0 && tile.x >= EAST_PENINSULA_MIN_X);
}

function pastEastWall(tile = Game.tile()) {
    return !!(tile && (tile.level ?? 0) === 0 && tile.x > SPOT_MAX_X);
}

function tileKey(tile: TileLike | null | undefined) {
    if (!tile) {
        return '';
    }
    return `${tile.x},${tile.z},${tile.level ?? 0}`;
}

function npcList(q: EntityQuery<Npc>) {
    if (q && typeof q.results === 'function') {
        return q.results();
    }
    const n = q && typeof q.nearest === 'function' ? q.nearest() : null;
    return n ? [n] : [];
}

/** Catherby bank. */
const BANK_STAND = new Tile(2809, 3441, 0);

/** Bank-house Range — between pier and bank. */
const RANGE_STAND = new Tile(2817, 3443, 0);
const RANGE_LOC = new Tile(2817, 3444, 0);
const RANGE_LEASH = 8;

const NET_NAME = 'Small fishing net';
const SPOT_NAME = 'Fishing spot';

function fmtXph(n: number) {
    if (n >= 100_000) {
        return `${(n / 1000).toFixed(0)}k`;
    }
    if (n >= 10_000) {
        return `${(n / 1000).toFixed(1)}k`;
    }
    return String(Math.round(n));
}

function fmtElapsed(ms: number) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) {
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
}

function prefStorageKey(key: string) {
    const box =
        typeof location !== 'undefined'
            ? new URLSearchParams(location.search).get('box')
            : null;
    const suffix = `set:${SCRIPT_NAME}:${key}`;
    return box ? `rs2b0t:${box}:${suffix}` : `rs2b0t:${suffix}`;
}

function readPrefRaw(key: string) {
    const k = prefStorageKey(key);
    try {
        if (typeof sessionStorage !== 'undefined') {
            const v = sessionStorage.getItem(k);
            if (v !== null) {
                return v;
            }
        }
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem(k);
        }
    } catch {
        /* private mode */
    }
    return null;
}

function readPrefBool(key: string, fallback: any) {
    const raw = readPrefRaw(key);
    if (raw === null) {
        return fallback;
    }
    const n = raw.trim().toLowerCase();
    return n === 'true' || n === '1' || n === 'yes';
}

function isPanelPaused() {
    return !!document.querySelector('.rs2b0t-value.rs2b0t-state-paused');
}

function unlockPausedPrefsUi() {
    if (!isPanelPaused()) {
        return;
    }
    for (const btn of document.querySelectorAll('button.rs2b0t-param-edit') as NodeListOf<HTMLButtonElement>) {
        if ((btn.textContent || '').includes('Edit parameters')) {
            btn.disabled = false;
            btn.title = 'Editable while paused — applies on the next loop / Resume';
        }
    }
    for (const backdrop of document.querySelectorAll('.rs2b0t-modal-backdrop') as NodeListOf<HTMLElement>) {
        if (backdrop.style.display !== 'flex') {
            continue;
        }
        for (const el of backdrop.querySelectorAll('input, select, textarea') as NodeListOf<HTMLInputElement>) {
            el.disabled = false;
        }
    }
}

const PAINT_FONT_ID = 'benzyme-catherby-font-v3';
const PAINT_FONT = '13px Exo, "Bebas Neue", "Bitcount Ink", sans-serif';

/** Load Exo (+ Bebas Neue / Bitcount Ink) from Google Fonts onto the bot page (once). */
function ensurePaintFont() {
    if (typeof document === 'undefined') {
        return;
    }
    if (document.getElementById(PAINT_FONT_ID)) {
        return;
    }
    const style = document.createElement('style');
    style.id = PAINT_FONT_ID;
    style.textContent =
        "@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Bitcount+Ink:wght@100..900&family=Exo:ital,wght@0,100..900;1,100..900&display=swap');";
    document.head.appendChild(style);
}

function isKeepTool(name: string | undefined) {
    if (!name) {
        return false;
    }
    return (name ?? '').toLowerCase().includes('fishing net');
}

function isRawShrimpFish(name: string | undefined) {
    if (!name) {
        return false;
    }
    const n = name.toLowerCase();
    if (!n.startsWith('raw ')) {
        return false;
    }
    return n.includes('shrimp') || n.includes('anchov');
}

function isCookedShrimpFish(name: string | undefined) {
    if (!name) {
        return false;
    }
    const n = name.toLowerCase().trim();
    if (n.startsWith('raw ') || n.startsWith('burnt ')) {
        return false;
    }
    return n === 'shrimps' || n === 'shrimp' || n === 'anchovies' || n === 'anchovy';
}

function isBurntFish(name: string | undefined) {
    if (!name) {
        return false;
    }
    const n = name.toLowerCase();
    return n.startsWith('burnt ') || n === 'burnt fish';
}

function isBankableFish(name: string | undefined) {
    return isRawShrimpFish(name) || isCookedShrimpFish(name) || isBurntFish(name);
}

/**
 * Cooking level to cook each raw (not fishing level).
 * Anchovies: Fishing 15 to catch, Cooking 1 to cook. Shrimp: Fishing 1 / Cooking 1.
 */
const COOK_LEVEL = {
    shrimp: 1,
    anchovy: 1
};

function fishKind(name: string | undefined) {
    const n = (name ?? '').toLowerCase();
    if (n.includes('anchov')) {
        return 'anchovy';
    }
    if (n.includes('shrimp')) {
        return 'shrimp';
    }
    return null;
}

function rawFishKind(name: string | undefined) {
    const n = (name ?? '').toLowerCase();
    if (!n.startsWith('raw ')) {
        return null;
    }
    return fishKind(n);
}

function canCookRaw(name: string | undefined) {
    const kind = rawFishKind(name);
    if (!kind) {
        return false;
    }
    return Skills.level('cooking') >= COOK_LEVEL[kind];
}

function countMatching(pred: (name: string | undefined, id?: number) => boolean) {
    return Inventory.items()
        .filter(i => pred(i.name))
        .reduce((n, i) => n + Math.max(1, i.count), 0);
}

function rawFishCount() {
    return countMatching(isRawShrimpFish);
}

/** Raw shrimp/anchovies the player is high enough Cooking to cook. */
function cookableCount() {
    return countMatching(n => isRawShrimpFish(n) && canCookRaw(n));
}

function cookedFishCount() {
    return countMatching(isCookedShrimpFish);
}

function burntCount() {
    return countMatching(isBurntFish);
}

function lastCookableRaw() {
    const items = Inventory.items();
    for (let i = items.length - 1; i >= 0; i--) {
        const name = items[i].name;
        if (isRawShrimpFish(name) && canCookRaw(name)) {
            return items[i];
        }
    }
    return null;
}

function countCookableNamed(fragment: any) {
    const want = fragment.toLowerCase();
    return countMatching(
        n => isRawShrimpFish(n) && canCookRaw(n) && (n ?? '').toLowerCase().includes(want)
    );
}

/** Pick make-menu product for a raw we can cook (prefer the item just used on the range). */
function matchCookProduct(products: any, preferName: any) {
    if (!products || products.length === 0) {
        return null;
    }
    const prefer = (preferName ?? '').toLowerCase();
    if (prefer) {
        const hit = products.find(p => (p ?? '').toLowerCase() === prefer);
        if (hit) {
            return hit;
        }
        const soft = products.find(p => (p ?? '').toLowerCase().includes(prefer.replace(/^raw\s+/, '')));
        if (soft) {
            return soft;
        }
    }
    for (const frag of ['anchov', 'shrimp']) {
        if (countCookableNamed(frag) <= 0) {
            continue;
        }
        const hit = products.find(p => (p ?? '').toLowerCase().includes(frag));
        if (hit) {
            return hit;
        }
    }
    return products[0] ?? null;
}

function hasNet() {
    return Inventory.items().some(i => isKeepTool(i.name));
}

function nothingEquipped() {
    return Equipment.items().every(i => !i.name);
}

/** Inventory holds only fishing net(s) — nothing else. */
function inventoryOnlyNet() {
    const items = Inventory.items().filter(i => i.name);
    if (items.length === 0) {
        return false;
    }
    return items.every(i => isKeepTool(i.name));
}

function readyToFish() {
    return hasNet() && inventoryOnlyNet() && nothingEquipped();
}

function netOp(actions: any) {
    return actions.find(a => /^net$/i.test(a)) ?? null;
}

function baitOp(actions: any) {
    return actions.find(a => /^bait$/i.test(a)) ?? null;
}

/** Shrimp hops only — Net + Bait (never Net + Harpoon). */
function isShrimpNetSpot(actions: any) {
    return netOp(actions) !== null && baitOp(actions) !== null;
}

function isShutDoor(loc: Loc | null | undefined) {
    const name = (loc.name ?? '').toLowerCase();
    if (!name.includes('door') && !name.includes('gate')) {
        return false;
    }
    return loc.actions().some(a => /^open/i.test(a));
}

function openDoorOp(loc: Loc | null | undefined) {
    return loc.actions().find(a => /^open/i.test(a)) ?? null;
}

function isNetGroundName(name: string | undefined) {
    if (!name) {
        return false;
    }
    const n = name.toLowerCase();
    return n.includes('fishing net') || n === 'small net';
}

class CatherbyNetFisher extends LoopingBotBase {
    status = 'starting';
    startedAt = 0;
    fishXpAtStart = 0;
    cookXpAtStart = 0;
    /** Total raw fish caught this session. */
    caught = 0;
    /** Total successfully cooked fish this session (not burnt). */
    cooked = 0;
    bankTrips = 0;
    /** False until unequip + bank-all + withdraw net finishes. */
    startReady = false;
    /** Preference: cook on Range before banking. */
    cookOnWay = true;
    cookingLoad = false;
    lastRawSeen = 0;
    /** Set from chat when the east-beach rocks block a hop / Range click. */
    cantReach = false;
    /** @type {Map<string, number>} tileKey → epoch ms until we may retry that hop */
    unreachableUntil = new Map();
    /** @type {{ x: number, z: number, level?: number } | null} */
    lastSpotTile: any = null;
    /** 0 = Harry sand, 1 = mid beach. */
    beachScanIdx = 0;
    emptyScanTicks = 0;
    unlockTimer: ReturnType<typeof setInterval> | null = null;

    override async onStart(): Promise<void> {
        await Execution.delayUntil(() => Game.ingame() && Game.tile() !== null, 0);
        Traversal.preload();
        this.startPausedPrefUnlock();
        ensurePaintFont();

        this.syncPrefs({ silent: true });
        this.startedAt = Date.now();
        this.fishXpAtStart = Skills.xp('fishing');
        this.cookXpAtStart = Skills.xp('cooking');
        this.caught = 0;
        this.cooked = 0;
        this.bankTrips = 0;
        this.startReady = false;
        this.cookingLoad = false;
        this.lastRawSeen = rawFishCount();
        this.cantReach = false;
        this.unreachableUntil = new Map();
        this.lastSpotTile = null;
        this.beachScanIdx = 0;
        this.emptyScanTicks = 0;

        this.on('chat.message', e => {
            if (CANT_REACH_RE.test(String(e.text ?? ''))) {
                this.cantReach = true;
            }
        });

        this.on('skill.level', e => {
            if (e.name === 'fishing' || e.name === 'cooking') {
                this.log(`${e.name} ${e.previous} → ${e.level}`);
            }
        });

        this.log(
            `CatherbyNetFisher @ ${ANCHOR.x},${ANCHOR.z} — start always banks everything ` +
                `(deposit → unequip → deposit → withdraw Small fishing net only); ` +
                `Net+Bait on Harry sand / mid beach only (never east rocks or cape); ` +
                `cook on way to bank: ${this.cookOnWay ? 'on' : 'off'}`
        );
        this.status = 'start: bank';
    }

    startPausedPrefUnlock() {
        unlockPausedPrefsUi();
        this.unlockTimer = setInterval(() => unlockPausedPrefsUi(), 400);
    }

    override onStop(): void {
        if (this.unlockTimer != null) {
            clearInterval(this.unlockTimer);
            this.unlockTimer = null;
        }
        this.log(
            `stopped — caught ${this.caught}, cooked ${this.cooked}, bank trips ${this.bankTrips} (${this.status})`
        );
    }

    syncPrefs({ silent = false }: { silent?: boolean } = {}) {
        const prev = this.cookOnWay;
        this.cookOnWay = readPrefBool(
            'cookOnWay',
            this.settings.bool('cookOnWay', true)
        );
        if (!silent && prev !== this.cookOnWay) {
            this.log(`prefs: cook on way to bank → ${this.cookOnWay ? 'on' : 'off'}`);
        }
    }

    noteCatches() {
        const now = rawFishCount();
        if (now > this.lastRawSeen) {
            this.caught += now - this.lastRawSeen;
        }
        this.lastRawSeen = now;
    }

    /** Credit newly appearing cooked fish only. */
    noteCooked(beforeCooked: any) {
        const now = cookedFishCount();
        if (now > beforeCooked) {
            const gained = now - beforeCooked;
            this.cooked += gained;
            return gained;
        }
        return 0;
    }

    override async loop(): Promise<void> {
        if (!Game.ingame()) {
            await Execution.delayTicks(5);
            return;
        }
        if (await dismissWelcomeScreen()) {
            this.status = 'close welcome';
            return;
        }

        this.syncPrefs({ silent: true });
        unlockPausedPrefsUi();
        this.noteCatches();

        if (this.cantReach) {
            await this.recoverCantReach(this.lastSpotTile);
            return;
        }

        if (ChatDialog.canContinue()) {
            this.status = 'continue dialog';
            await ChatDialog.continue();
            return;
        }

        if (!this.startReady) {
            await this.prepStartInv();
            return;
        }

        if (Bank.isOpen()) {
            await Bank.close();
            return;
        }

        if (ChatDialog.isMakeMenu()) {
            await this.chooseCookProduct();
            if (cookableCount() === 0 && (cookedFishCount() > 0 || burntCount() > 0 || rawFishCount() > 0)) {
                if (burntCount() > 0) {
                    await this.dropBurnt();
                }
                this.cookingLoad = false;
                await this.bankAndReturn();
            }
            return;
        }

        if (!hasNet()) {
            this.status = 'need net';
            if (await this.lootNetFromGround()) {
                this.log('looted Small fishing net');
                return;
            }
            this.log('no Small fishing net — banking to withdraw one');
            await this.bankAndReturn();
            return;
        }

        if (this.cookingLoad && cookableCount() > 0) {
            await this.cookLoad();
            return;
        }

        if (this.cookingLoad && cookableCount() === 0) {
            if (burntCount() > 0) {
                await this.dropBurnt();
            }
            this.cookingLoad = false;
            if (cookedFishCount() > 0 || burntCount() > 0 || rawFishCount() > 0) {
                await this.bankAndReturn();
            }
            return;
        }

        if (Inventory.isFull()) {
            await this.peelOffEastBeach();
            if (this.cookOnWay && cookableCount() > 0) {
                this.cookingLoad = true;
                this.log(
                    `full inv (${cookableCount()} cookable / ${rawFishCount()} raw) — cooking on way to bank`
                );
                await this.cookLoad();
                return;
            }
            if (rawFishCount() > 0 || cookedFishCount() > 0) {
                await this.bankAndReturn();
                return;
            }
        }

        const here = Game.tile();
        if (!here) {
            await Execution.delayTicks(2);
            return;
        }

        if (onEastPeninsula(here) || pastEastWall(here)) {
            await this.peelOffEastBeach();
            return;
        }

        if (Tile.from(here).distanceTo(ANCHOR) > LEASH) {
            this.status = 'returning to shore';
            await this.peelOffEastBeach();
            await Traversal.walkResilient(ANCHOR, {
                radius: 3,
                log: m => this.log(`  ${m}`)
            });
            return;
        }

        if (Game.animating()) {
            this.status = 'fishing';
            await Execution.delayTicks(1);
            return;
        }

        const spot = this.findShrimpSpot();
        if (!spot) {
            await this.scanBeachForSpots();
            return;
        }

        this.emptyScanTicks = 0;
        await this.netSpot(spot);
    }

    markSpotUnreachable(tile: TileLike | null | undefined) {
        const key = tileKey(tile);
        if (!key) {
            return;
        }
        this.unreachableUntil.set(key, Date.now() + UNREACHABLE_MS);
    }

    isSpotBlacklisted(tile: TileLike | null | undefined) {
        const key = tileKey(tile);
        if (!key) {
            return false;
        }
        return Date.now() < (this.unreachableUntil.get(key) ?? 0);
    }

    spotIsFishable(tile: TileLike | null | undefined) {
        if (!tile) {
            return false;
        }
        const t = Tile.from(tile);
        if ((t.level ?? 0) !== 0) {
            return false;
        }
        if (t.x < SPOT_MIN_X || t.x > SPOT_MAX_X || t.z < SPOT_MIN_Z || t.z > SPOT_MAX_Z) {
            return false;
        }
        if (t.distanceTo(ANCHOR) > LEASH) {
            return false;
        }
        return !this.isSpotBlacklisted(t);
    }

    /**
     * East-peninsula rocks block a direct walk off the cape — follow sand west first.
     * Never try 2860 → bank/Harry in one walkResilient (that is how we get stuck).
     */
    async peelOffEastBeach(): Promise<any> {
        const here = Game.tile();
        if (!onEastPeninsula(here) && !pastEastWall(here)) {
            return false;
        }
        this.status = 'leaving east beach';
        this.log(`east beach @ ${here.x},${here.z} — walking west along sand first`);
        for (const stop of BEACH_WESTWARD) {
            const now = Game.tile();
            if (!now) {
                break;
            }
            if (now.x <= stop.x + 1) {
                continue;
            }
            await Traversal.walkResilient(stop, {
                radius: 2,
                log: m => this.log(`  ${m}`)
            });
        }
        const after = Game.tile();
        if (onEastPeninsula(after) || pastEastWall(after)) {
            await Traversal.walkResilient(WEST_BEACH, {
                radius: 3,
                log: m => this.log(`  ${m}`)
            });
        }
        return true;
    }

    /**
     * Walk Harry sand (2838) → mid (2842) → east sand (2845) so both Net+Bait
     * clusters stay in view. Never parks at 2847+ (lobster peninsula).
     */
    async scanBeachForSpots(): Promise<any> {
        this.status = 'scanning beach for Net+Bait';
        const here = Game.tile();
        if (onEastPeninsula(here) || pastEastWall(here)) {
            await this.peelOffEastBeach();
            return;
        }
        const dest = BEACH_SCAN[this.beachScanIdx % BEACH_SCAN.length];
        if (!here || Tile.from(here).distanceTo(dest) > 2) {
            this.log(`scanning beach @ ${dest.x},${dest.z}`);
            await Traversal.walkTo(dest, { radius: 2, timeoutMs: 12_000 });
        }
        this.emptyScanTicks++;
        if (this.emptyScanTicks >= 2) {
            this.emptyScanTicks = 0;
            this.beachScanIdx = (this.beachScanIdx + 1) % BEACH_SCAN.length;
        }
        await Execution.delayTicks(3);
    }

    async recoverCantReach(spotTile: any): Promise<any> {
        const here = Game.tile();
        this.cantReach = false;
        if (spotTile) {
            this.markSpotUnreachable(spotTile);
        }
        this.log(
            `can't reach that @ ${here?.x},${here?.z}` +
                (spotTile ? ` (spot ${spotTile.x},${spotTile.z} blacklisted)` : '')
        );
        await this.peelOffEastBeach();
        const after = Game.tile();
        if (
            !after ||
            onEastPeninsula(after) ||
            pastEastWall(after) ||
            Tile.from(after).distanceTo(ANCHOR) > STAND_RADIUS
        ) {
            this.status = 'returning to Harry sand';
            await Traversal.walkResilient(WEST_BEACH, {
                radius: 3,
                log: m => this.log(`  ${m}`)
            });
        }
    }

    pickBestShrimpSpot(spots: any) {
        if (!spots || spots.length === 0) {
            return null;
        }
        let best = null;
        let bestX = Infinity;
        let bestD = Infinity;
        for (const n of spots) {
            const t = n.tile();
            if (!this.spotIsFishable(t)) {
                continue;
            }
            const x = t.x;
            const d =
                typeof n.distance === 'function'
                    ? n.distance()
                    : Tile.from(t).distanceTo(Game.tile());
            if (x < bestX || (x === bestX && d < bestD)) {
                best = n;
                bestX = x;
                bestD = d;
            }
        }
        return best;
    }

    findShrimpSpot() {
        const q = Npcs.query().name(SPOT_NAME).where(n => isShrimpNetSpot(n.actions()));
        const boxed =
            typeof q.inside === 'function'
                ? q.inside({
                      minX: SPOT_MIN_X,
                      maxX: SPOT_MAX_X,
                      minZ: SPOT_MIN_Z,
                      maxZ: SPOT_MAX_Z
                  })
                : q;
        return this.pickBestShrimpSpot(
            npcList(boxed.where(n => this.spotIsFishable(n.tile())))
        );
    }

    async netSpot(spot: Npc): Promise<any> {
        const op = netOp(spot.actions());
        if (!op) {
            await Execution.delayTicks(2);
            return;
        }

        const st = spot.tile();
        let here = Game.tile();
        if (onEastPeninsula(here) || pastEastWall(here)) {
            await this.peelOffEastBeach();
            return;
        }
        // Mid-cluster hops: stand on sand west of the rocks, never walk around the cape.
        if (st && here && st.x >= 2844 && here.x >= 2845) {
            this.status = 'approaching from west sand';
            await Traversal.walkTo(MID_BEACH, { radius: 2, timeoutMs: 8_000 });
            here = Game.tile();
            if (onEastPeninsula(here) || pastEastWall(here)) {
                await this.peelOffEastBeach();
                return;
            }
        }

        const before = rawFishCount();
        this.cantReach = false;
        this.lastSpotTile = st;
        this.status = `netting (${spot.distance()}t)`;
        this.log(`Net shrimp spot @ ${st.x},${st.z}`);
        await spot.interact(op);

        await Execution.delayUntil(
            () =>
                rawFishCount() > before ||
                Game.animating() ||
                ChatDialog.canContinue() ||
                this.cantReach ||
                Inventory.isFull() ||
                !this.findShrimpSpot(),
            8000
        );
        this.noteCatches();
        if (this.cantReach) {
            await this.recoverCantReach(st);
        }
        if (onEastPeninsula() || pastEastWall()) {
            await this.peelOffEastBeach();
        }
    }

    async lootNetFromGround(): Promise<any> {
        if (hasNet()) {
            return true;
        }
        const ground =
            GroundItems.query().name(NET_NAME).within(12).nearest() ??
            GroundItems.query()
                .where(g => isNetGroundName(g.name))
                .within(12)
                .nearest();
        if (!ground) {
            return false;
        }
        const before = Inventory.used();
        await ground.interact('Take');
        return (
            (await Execution.delayUntil(() => hasNet() || Inventory.used() > before, 6000)) &&
            hasNet()
        );
    }

    findRange() {
        return (
            Locs.query()
                .name('Range', 'Cooking range', 'Fire', 'Fireplace')
                .where(l => Tile.from(l.tile()).distanceTo(RANGE_LOC) <= RANGE_LEASH)
                .nearest() ??
            Locs.query().name('Range', 'Cooking range').nearest()
        );
    }

    async openNearbyDoor(): Promise<any> {
        const door = Locs.query()
            .where(l => isShutDoor(l))
            .where(l => l.distance() <= 3)
            .nearest();
        if (!door) {
            return false;
        }
        const op = openDoorOp(door);
        if (!op) {
            return false;
        }
        this.log(`opening ${door.name}`);
        await door.interact(op);
        await Execution.delayTicks(2);
        return true;
    }

    async walkToRange(): Promise<any> {
        this.status = 'walking to range';
        await this.peelOffEastBeach();
        this.log(`walking to Range ${RANGE_STAND.x},${RANGE_STAND.z} (on way to bank)`);
        await Traversal.walkResilient(RANGE_STAND, {
            radius: 1,
            log: m => this.log(`  ${m}`)
        });
        await this.openNearbyDoor();
        const here = Game.tile();
        if (here && Tile.from(here).distanceTo(RANGE_STAND) > 2) {
            await Traversal.walkTo(RANGE_STAND, { radius: 1, timeoutMs: 12_000 });
        }
        if (!this.findRange()) {
            await Traversal.walkTo(RANGE_LOC, { radius: 1, timeoutMs: 8_000 });
            await this.openNearbyDoor();
        }
    }

    async chooseCookProduct(): Promise<any> {
        const products = ChatDialog.makeProducts();
        const raw = lastCookableRaw();
        const hint = matchCookProduct(products, raw?.name);
        const kind = fishKind(hint) || fishKind(raw?.name);
        const frag = kind === 'anchovy' ? 'anchov' : kind === 'shrimp' ? 'shrimp' : null;
        const batch = frag
            ? Math.max(1, Math.min(countCookableNamed(frag), 28))
            : Math.max(1, Math.min(cookableCount(), 28));
        this.status = 'cook make-menu';
        this.log(
            `cook menu: [${products.join(', ')}] pick=${hint ?? 'none'} x${batch}` +
                ` (cook ${Skills.level('cooking')})`
        );

        let picked = false;
        if (hint && typeof ChatDialog.makeX === 'function') {
            picked = await ChatDialog.makeX(hint, batch);
        }
        if (!picked && hint) {
            picked = await ChatDialog.make(hint);
        }
        if (!picked) {
            picked = await ChatDialog.make();
        }
        if (!picked) {
            this.log('could not pick cook product');
            await Execution.delayTicks(1);
            return;
        }

        const stillThisType = () =>
            frag ? countCookableNamed(frag) > 0 : cookableCount() > 0;

        await Execution.delayUntil(
            () => !ChatDialog.isMakeMenu() && (Game.animating() || !stillThisType()),
            5000
        );

        let cookedMark = cookedFishCount();
        let idle = 0;
        for (let guard = 0; guard < 400 && stillThisType(); guard++) {
            if (ChatDialog.canContinue() || ChatDialog.isMakeMenu()) {
                this.noteCooked(cookedMark);
                return;
            }
            await Execution.delayTicks(1);
            if (this.noteCooked(cookedMark) > 0) {
                cookedMark = cookedFishCount();
                idle = 0;
            } else if (!Game.animating() && ++idle >= 14) {
                break;
            } else if (Game.animating()) {
                idle = 0;
            }
        }
        this.noteCooked(cookedMark);
    }

    async cookLoad(): Promise<any> {
        if (cookableCount() === 0) {
            this.cookingLoad = false;
            return;
        }

        const here = Game.tile();
        let oven = this.findRange();
        if (!here || Tile.from(here).distanceTo(RANGE_STAND) > 2 || !oven) {
            await this.walkToRange();
            oven = this.findRange();
        }
        if (!oven) {
            this.log('WARNING: no Range near bank house — banking raw instead');
            this.cookingLoad = false;
            await this.bankAndReturn();
            return;
        }

        if (ChatDialog.isMakeMenu()) {
            await this.chooseCookProduct();
            if (cookableCount() === 0) {
                if (burntCount() > 0) {
                    await this.dropBurnt();
                }
                this.cookingLoad = false;
                await this.bankAndReturn();
            }
            return;
        }

        const raw = lastCookableRaw();
        if (!raw) {
            this.cookingLoad = false;
            return;
        }

        const beforeCookable = cookableCount();
        let cookedMark = cookedFishCount();
        const beforeXp = Skills.xp('cooking');
        this.status = `cooking ${raw.name}`;
        this.log(
            `use ${raw.name} on ${oven.name ?? 'Range'} ` +
                `(${beforeCookable} cookable, cook lvl ${Skills.level('cooking')})`
        );

        if (!(await raw.useOn(oven))) {
            await this.openNearbyDoor();
            await Execution.delayTicks(2);
            return;
        }

        const started = await Execution.delayUntil(
            () =>
                cookableCount() < beforeCookable ||
                Skills.xp('cooking') > beforeXp ||
                ChatDialog.isMakeMenu() ||
                ChatDialog.canContinue(),
            4000
        );

        if (ChatDialog.isMakeMenu()) {
            await this.chooseCookProduct();
            if (cookableCount() === 0) {
                if (burntCount() > 0) {
                    await this.dropBurnt();
                }
                this.cookingLoad = false;
                await this.bankAndReturn();
            }
            return;
        }

        if (!started && cookableCount() >= beforeCookable) {
            this.log('cook did not start — re-pathing to range');
            await this.walkToRange();
            return;
        }

        let mark = cookableCount();
        let idle = 0;
        // Finish current batch; if another cookable type remains (e.g. anchovies after shrimp), loop continues.
        for (let guard = 0; guard < 400 && cookableCount() > 0; guard++) {
            if (ChatDialog.canContinue() || ChatDialog.isMakeMenu()) {
                this.noteCooked(cookedMark);
                return;
            }
            await Execution.delayTicks(1);
            if (this.noteCooked(cookedMark) > 0) {
                cookedMark = cookedFishCount();
            }
            const now = cookableCount();
            if (now < mark) {
                mark = now;
                idle = 0;
            } else if (!Game.animating() && ++idle >= 14) {
                break;
            } else if (Game.animating()) {
                idle = 0;
            }
        }

        this.noteCooked(cookedMark);

        if (cookableCount() === 0) {
            if (burntCount() > 0) {
                await this.dropBurnt();
            }
            this.cookingLoad = false;
            await this.bankAndReturn();
        }
    }

    async dropBurnt(): Promise<any> {
        this.status = 'dropping burnt';
        for (let guard = 0; guard < 28; guard++) {
            const item = Inventory.items().find(i => isBurntFish(i.name));
            if (!item) {
                break;
            }
            const before = Inventory.used();
            await item.interact('Drop');
            await Execution.delayUntil(() => Inventory.used() < before, 3000);
            await Execution.delay(80 + Math.floor(Math.random() * 140));
        }
    }

    /** Deposit every inventory slot (including nets) while the bank is open. */
    async depositEverythingOpenBank(): Promise<any> {
        if (!Bank.isOpen()) {
            return false;
        }
        this.log('start: depositing inventory');
        if (typeof Bank.depositInventory === 'function') {
            await Bank.depositInventory();
        } else {
            await Bank.depositAllMatching(() => true);
        }
        await Execution.delayTicks(1);
        return Inventory.used() === 0;
    }

    /** Unequip every worn item into free inventory space. */
    async unequipEverything(): Promise<any> {
        this.status = 'start: unequip';
        for (const worn of Equipment.items()) {
            const name = worn.name;
            if (!name) {
                continue;
            }
            if (Inventory.isFull()) {
                this.log('start: inventory full while unequipping — need another deposit');
                return false;
            }
            this.log(`start: unequipping ${name}`);
            if (!(await Equipment.unequip(name))) {
                this.log(`start: could not unequip ${name}`);
                await Execution.delayTicks(1);
                return false;
            }
            await Execution.delayTicks(1);
        }
        return nothingEquipped();
    }

    /**
     * Script start (always): open bank → deposit all → unequip all → deposit again →
     * withdraw Small fishing net only → shore. Never starts fishing until that finishes.
     */
    async prepStartInv(): Promise<any> {
        if (!Bank.isOpen()) {
            this.status = 'start: bank';
            this.log('start: opening bank — unequip + bank everything, then withdraw Small fishing net');
            if (
                !(await Banking.open({
                    stand: BANK_STAND,
                    log: m => this.log(`  ${m}`)
                }))
            ) {
                this.log('start: could not open bank — retrying');
                await Execution.delayTicks(3);
                return;
            }
        }

        if (typeof Bank.loaded === 'function') {
            await Execution.delayUntil(() => Bank.loaded() || Bank.items().length > 0, 3000);
        }
        await Execution.delayTicks(1);

        // Free inv space first so unequip cannot fail on a full pack.
        await this.depositEverythingOpenBank();

        if (!(await this.unequipEverything())) {
            // Still wearing something (or unequip failed) — deposit again for space, retry next loop.
            await this.depositEverythingOpenBank();
            await Execution.delayTicks(1);
            return;
        }

        // Bank gear that just came off.
        await this.depositEverythingOpenBank();

        if (!nothingEquipped() || Inventory.used() > 0) {
            this.log('start: still holding or wearing items — retrying deposit/unequip');
            await Execution.delayTicks(2);
            return;
        }

        if (!(await this.withdrawNetFromOpenBank())) {
            await Bank.close();
            await Execution.delayTicks(8);
            return;
        }

        if (!readyToFish()) {
            this.log('start: expected net-only after withdraw — retrying');
            await Execution.delayTicks(2);
            return;
        }

        await Bank.close();
        this.bankTrips++;
        this.startReady = true;
        this.lastRawSeen = rawFishCount();
        this.status = 'returning to shore';
        this.log('start done — Small fishing net only, nothing equipped; walking to shore');
        await Traversal.walkResilient(ANCHOR, {
            radius: 3,
            log: m => this.log(`  ${m}`)
        });
    }

    /** Withdraw one Small fishing net from an already-open bank. */
    async withdrawNetFromOpenBank(): Promise<any> {
        if (!Bank.isOpen()) {
            return false;
        }
        if (hasNet()) {
            return true;
        }

        await Execution.delayUntil(() => Bank.loaded() || !Bank.isOpen(), 3000);
        if (!Bank.isOpen()) {
            return false;
        }

        const inBank = Bank.count(NET_NAME) || 0;
        if (inBank <= 0) {
            // Soft match — bank may label it slightly differently.
            const soft = Bank.items().find(i => isKeepTool(i.name) || isNetGroundName(i.name));
            if (!soft?.name) {
                this.log('WARNING: no Small fishing net in bank — put one in, then continue');
                return false;
            }
            this.log(`withdrawing ${soft.name}`);
            if (!(await Bank.withdrawX(soft.name, 1))) {
                this.log(`withdraw failed for ${soft.name}`);
                return false;
            }
        } else {
            this.log(`withdrawing ${NET_NAME}`);
            if (!(await Bank.withdrawX(NET_NAME, 1))) {
                this.log(`withdraw failed for ${NET_NAME}`);
                return false;
            }
        }
        await Execution.delayTicks(1);
        return hasNet();
    }

    async bankAndReturn(): Promise<any> {
        const raw = rawFishCount();
        const cooked = cookedFishCount();
        this.status = 'banking';
        this.log(
            `banking` +
                (raw ? ` ${raw} raw` : '') +
                (cooked ? ` ${cooked} cooked` : '') +
                (burntCount() ? ` ${burntCount()} burnt` : '') +
                ` — keep Small fishing net only`
        );

        // After banking raw, lastRawSeen must not credit re-withdraws as new catches.
        this.lastRawSeen = 0;

        await this.peelOffEastBeach();
        await Banking.bankNearest({
            destination: { name: 'Catherby', tile: BANK_STAND },
            // Bank everything (including spare nets), then strip gear and pull exactly one net back.
            deposit: () => true,
            afterDeposit: async () => {
                // Deposit first freed space; unequip any remaining worn gear, deposit again, then net.
                if (!nothingEquipped()) {
                    for (const worn of Equipment.items()) {
                        const name = worn.name;
                        if (!name) {
                            continue;
                        }
                        this.log(`banking: unequipping ${name}`);
                        if (!(await Equipment.unequip(name))) {
                            this.log(`banking: could not unequip ${name}`);
                            await Execution.delayTicks(1);
                            break;
                        }
                        await Execution.delayTicks(1);
                    }
                    if (typeof Bank.depositInventory === 'function') {
                        await Bank.depositInventory();
                    } else {
                        await Bank.depositAllMatching(() => true);
                    }
                    await Execution.delayTicks(1);
                }
                await this.withdrawNetFromOpenBank();
            },
            returnTo: ANCHOR,
            log: m => this.log(`  ${m}`)
        });

        this.bankTrips++;
        this.cookingLoad = false;
        this.lastRawSeen = rawFishCount();
        this.status = 'returning to shore';
    }

    override onPaint(ctx: CanvasRenderingContext2D): void {
        ensurePaintFont();
        const elapsed = Date.now() - this.startedAt;
        const hrs = elapsed / 3_600_000;
        const fishXp = Skills.xp('fishing') - this.fishXpAtStart;
        const cookXp = Skills.xp('cooking') - this.cookXpAtStart;
        const fishXph = hrs > 0.008 ? fishXp / hrs : 0;
        const cookXph = hrs > 0.008 ? cookXp / hrs : 0;
        const caughtPh = hrs > 0.008 ? this.caught / hrs : 0;
        const cookedPh = hrs > 0.008 ? this.cooked / hrs : 0;

        const lines = [
            `Benzyme's Catherby Fisher  Fish ${Skills.level('fishing')}  Cook ${Skills.level('cooking')}`,
            `time ${fmtElapsed(elapsed)}  ·  ${this.cookOnWay ? 'cook→bank' : 'bank raw'}  ·  ${this.status}`,
            `caught ${this.caught} (${fmtXph(caughtPh)}/hr)  cooked ${this.cooked} (${fmtXph(cookedPh)}/hr)`,
            `trips ${this.bankTrips}  raw ${rawFishCount()}  Fish XP ${fmtXph(fishXph)}/hr` +
                (this.cookOnWay || cookXp > 0 ? `  Cook XP ${fmtXph(cookXph)}/hr` : '')
        ];

        ctx.font = PAINT_FONT;
        let maxW = 0;
        for (const line of lines) {
            maxW = Math.max(maxW, ctx.measureText(line).width);
        }
        const pad = 6;
        const lineH = 18;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(6, 6, maxW + pad * 2, pad * 2 + lines.length * lineH);
        ctx.fillStyle = '#7eb8da';
        lines.forEach((line, i) => {
            ctx.fillText(line, 6 + pad, 6 + pad + (i + 1) * lineH - 4);
        });
    }
}

export default defineBot({
    name: SCRIPT_NAME,
    version: '2.1.1',
    category: 'Fishing',
    tags: ['fishing', 'catherby', 'net', 'shrimp', 'bank', 'cook'],
    description:
        'Small-net fishes shrimp at Catherby. Withdraws a small fishing net, then optional cook on the Range next to the bank on the way to deposit.',
    settingsSchema: {
        cookOnWay: {
            type: 'boolean',
            default: true,
            label: 'Cook on way to bank',
            group: 'Cooking',
            help:
                'When the pack is full, cook Raw shrimps/anchovies on the Catherby bank-house Range, drop burnt, then bank and return to Harry sand / mid beach (never the east rocks or cape)'
        }
    },
    create: () => new CatherbyNetFisher()
});
