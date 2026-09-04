/// <reference path="./rs2b0t-abi.d.ts" />

/**
 * CatherbyLobsters — cage lobster at Catherby (Cage+Harpoon spots only).
 * Harry sand / mid beach first; cape via sand corridor; never the east rocks (I can't reach that).
 * Start: bank → deposit everything → withdraw Lobster pot → shore, then cage fish.
 * If none in bank, buys one from Harry. Optional cook on bank-house Range, optional sell to Harry.
 * Completely vibe coded by @.benzyme on Discord via Cursor AI
 * Self-contained ESM for rs2b0t Load local script / Load URL.
 */
const SUPPORTED_API_VERSION = 1;
const abi = globalThis.__rs2b0t;
if (!abi) {
    throw new Error('CatherbyLobsters: globalThis.__rs2b0t missing — load inside rs2b0t bot.html');
}
if (abi.apiVersion !== SUPPORTED_API_VERSION) {
    throw new Error(
        `CatherbyLobsters: ABI ${abi.apiVersion} != supported ${SUPPORTED_API_VERSION}`
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
    Shop,
    Traversal,
    Tile,
    Skills,
    ChatDialog,
    withdrawOp
} = abi;

const SCRIPT_NAME = 'CatherbyLobsters';

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
 * Catherby Cage+Harpoon hops (fishing_movement_catherby_enum):
 *   Harry sand  2836–2838,3431
 *   mid beach    2844–2846,3429
 *   east rocks   2853–2855,3423  (unreachable — skip)
 *   lobster cape 2859–2860,3426  (dead-end — sand corridor only)
 */
const ANCHOR = new Tile(2845, 3431, 0);
const LEASH = 35;
const STAND_RADIUS = 8;
const WEST_BEACH = new Tile(2838, 3431, 0);
const MID_BEACH = new Tile(2845, 3431, 0);
/** Neck of the peninsula — west of cape, north of rocks. */
const EAST_APPROACH = new Tile(2856, 3429, 0);
/** Furthest safe scan stand — sees cape hops, not the last dead-end tiles. */
const EAST_SAND = new Tile(2857, 3428, 0);
const BEACH_SCAN = [WEST_BEACH, MID_BEACH, EAST_APPROACH, EAST_SAND];
const BEACH_WESTWARD = [EAST_SAND, EAST_APPROACH, MID_BEACH, WEST_BEACH];
const BEACH_EASTWARD = [MID_BEACH, EAST_APPROACH, EAST_SAND];
const SPOT_MIN_X = 2834;
const SPOT_MAX_X = 2860;
const SPOT_MIN_Z = 3425;
const SPOT_MAX_Z = 3435;
const UNREACHABLE_MS = 45_000;
const CANT_REACH_RE = /i can't reach that/i;

function isEastRocksHop(tile: TileLike | null | undefined) {
    if (!tile) {
        return false;
    }
    const t = Tile.from(tile);
    return (t.level ?? 0) === 0 && t.x >= 2853 && t.x <= 2855 && t.z <= 3424;
}

function onEastRocks(tile = Game.tile()) {
    return !!(
        tile &&
        (tile.level ?? 0) === 0 &&
        tile.x >= 2853 &&
        tile.x <= 2858 &&
        tile.z <= 3424
    );
}

function onCape(tile = Game.tile()) {
    return !!(tile && (tile.level ?? 0) === 0 && tile.x >= 2856 && tile.x <= 2860);
}

function pastCapeTip(tile = Game.tile()) {
    return !!(tile && (tile.level ?? 0) === 0 && tile.x >= 2861);
}

function leavingEastBeach(tile = Game.tile()) {
    return onCape(tile) || onEastRocks(tile) || pastCapeTip(tile);
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

/** Harry's Fishing Shop stand. */
const HARRY_STAND = new Tile(2833, 3443, 0);
const HARRY_NAME = 'Harry';

/** Bank-house Range — between pier and bank. */
const RANGE_STAND = new Tile(2817, 3443, 0);
const RANGE_LOC = new Tile(2817, 3444, 0);
const RANGE_LEASH = 8;

const POT_NAME = 'Lobster pot';
const SPOT_NAME = 'Fishing spot';
/** Harry's Lobster pot baseline cost (gp). */
const POT_COST = 20;

/** Raw names Harry buys that we catch (cage on Cage+Harpoon). */
const HARRY_BUY_RAW = new Set(['raw lobster']);

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

const PAINT_FONT_ID = 'benzyme-catherby-lobsters-font-v1';
const PAINT_FONT = '13px Exo, "Bebas Neue", "Bitcount Ink", sans-serif';

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

function isKeepGear(name: string | undefined) {
    if (!name) {
        return false;
    }
    return name.toLowerCase() === 'lobster pot';
}

function isRawLobster(name: string | undefined) {
    if (!name) {
        return false;
    }
    return name.toLowerCase() === 'raw lobster';
}

function isCookedLobster(name: string | undefined) {
    if (!name) {
        return false;
    }
    const n = name.toLowerCase().trim();
    if (n.startsWith('raw ') || n.startsWith('burnt ')) {
        return false;
    }
    return n === 'lobster';
}

function isBurntFish(name: string | undefined) {
    if (!name) {
        return false;
    }
    const n = name.toLowerCase();
    return n.startsWith('burnt ') || n === 'burnt fish' || n === 'burnt lobster';
}

function isBankableFish(name: string | undefined) {
    return isRawLobster(name) || isCookedLobster(name) || isBurntFish(name);
}

function isHarrySellable(name: string | undefined) {
    if (!name) {
        return false;
    }
    return HARRY_BUY_RAW.has(name.toLowerCase());
}

/** Cooking level for lobster (Fishing 40 / Cooking 40). */
const COOK_LEVEL = {
    lobster: 40
};

function fishKind(name: string | undefined) {
    const n = (name ?? '').toLowerCase();
    if (n.includes('lobster')) {
        return 'lobster';
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
    return countMatching(isRawLobster);
}

function cookableCount() {
    return countMatching(n => isRawLobster(n) && canCookRaw(n));
}

function cookedFishCount() {
    return countMatching(isCookedLobster);
}

function burntCount() {
    return countMatching(isBurntFish);
}

function harrySellCount() {
    return countMatching(isHarrySellable);
}

function fishForDisposeCount() {
    return rawFishCount() + cookedFishCount() + burntCount();
}

function lastCookableRaw() {
    const items = Inventory.items();
    for (let i = items.length - 1; i >= 0; i--) {
        const name = items[i].name;
        if (isRawLobster(name) && canCookRaw(name)) {
            return items[i];
        }
    }
    return null;
}

function countCookableNamed(fragment: any) {
    const want = fragment.toLowerCase();
    return countMatching(
        n => isRawLobster(n) && canCookRaw(n) && (n ?? '').toLowerCase().includes(want)
    );
}

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
        const soft = products.find(p =>
            (p ?? '').toLowerCase().includes(prefer.replace(/^raw\s+/, ''))
        );
        if (soft) {
            return soft;
        }
    }
    if (countCookableNamed('lobster') > 0) {
        const hit = products.find(p => (p ?? '').toLowerCase().includes('lobster'));
        if (hit) {
            return hit;
        }
    }
    return products[0] ?? null;
}

function hasPot() {
    return Inventory.items().some(i => (i.name ?? '').toLowerCase() === 'lobster pot');
}

function needsGear() {
    return !hasPot();
}

function nothingEquipped() {
    return Equipment.items().every(i => !i.name);
}

/** Inventory holds only lobster pot(s) — nothing else. */
function inventoryOnlyPot() {
    const items = Inventory.items().filter(i => i.name);
    if (items.length === 0) {
        return false;
    }
    return items.every(i => (i.name ?? '').toLowerCase() === 'lobster pot');
}

function readyToFish() {
    return hasPot() && inventoryOnlyPot() && nothingEquipped();
}

function isCoins(name: string | undefined) {
    return (name ?? '').toLowerCase() === 'coins';
}

function coinCount() {
    return countMatching(isCoins);
}

function cageOp(actions: any) {
    return actions.find(a => /^cage$/i.test(a)) ?? null;
}

function harpoonOp(actions: any) {
    return actions.find(a => /^harpoon$/i.test(a)) ?? null;
}

/** Lobster hops — Cage + Harpoon (never Net+Bait / Lure+Bait). */
function isCageHarpoonSpot(actions: any) {
    return cageOp(actions) !== null && harpoonOp(actions) !== null;
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

function isPotGroundName(name: string | undefined) {
    if (!name) {
        return false;
    }
    return name.toLowerCase() === 'lobster pot';
}

function harrySellNamesHeld() {
    const names: any[] = [];
    const seen = new Set();
    for (const item of Inventory.items()) {
        const name = item.name;
        if (!name || !isHarrySellable(name)) {
            continue;
        }
        const key = name.toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        names.push(name);
    }
    return names;
}

function countByExactName(name: string | undefined) {
    const want = (name ?? '').toLowerCase();
    return countMatching(n => (n ?? '').toLowerCase() === want);
}

class CatherbyLobsters extends LoopingBotBase {
    status = 'starting';
    startedAt = 0;
    fishXpAtStart = 0;
    cookXpAtStart = 0;
    /** Total raw fish caught this session. */
    caught = 0;
    /** Total successfully cooked fish this session (not burnt). */
    cooked = 0;
    /** Units sold to Harry this session. */
    sold = 0;
    bankTrips = 0;
    sellTrips = 0;
    /** False until start bank: deposit all + withdraw Lobster pot finishes. */
    startReady = false;
    /** Preference: cook on Range before banking / selling. */
    cookOnWay = true;
    /** Preference: sell catch to Harry instead of banking. */
    sellToHarry = false;
    cookingLoad = false;
    lastRawSeen = 0;
    /** Set from chat when the east-beach rocks block a hop. */
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
        this.sold = 0;
        this.bankTrips = 0;
        this.sellTrips = 0;
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
            `CatherbyLobsters @ ${ANCHOR.x},${ANCHOR.z} — start always banks everything ` +
                `(deposit → unequip → deposit → withdraw Lobster pot); ` +
                `Cage on Harry/mid first, cape via sand (never east rocks); ` +
                `cook on way: ${this.cookOnWay ? 'on' : 'off'}; ` +
                `sell to Harry: ${this.sellToHarry ? 'on' : 'off'}`
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
            `stopped — caught ${this.caught}, cooked ${this.cooked}, sold ${this.sold}, ` +
                `bank ${this.bankTrips}, sell trips ${this.sellTrips} (${this.status})`
        );
    }

    syncPrefs({ silent = false }: { silent?: boolean } = {}) {
        const prevCook = this.cookOnWay;
        const prevSell = this.sellToHarry;
        this.cookOnWay = readPrefBool(
            'cookOnWay',
            this.settings.bool('cookOnWay', true)
        );
        this.sellToHarry = readPrefBool(
            'sellToHarry',
            this.settings.bool('sellToHarry', false)
        );
        if (!silent && prevCook !== this.cookOnWay) {
            this.log(`prefs: cook on way → ${this.cookOnWay ? 'on' : 'off'}`);
        }
        if (!silent && prevSell !== this.sellToHarry) {
            this.log(`prefs: sell to Harry → ${this.sellToHarry ? 'on' : 'off'}`);
        }
    }

    noteCatches() {
        const now = rawFishCount();
        if (now > this.lastRawSeen) {
            this.caught += now - this.lastRawSeen;
        }
        this.lastRawSeen = now;
    }

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

        if (Shop.isOpen()) {
            await this.handleOpenHarry();
            return;
        }

        if (Bank.isOpen()) {
            await Bank.close();
            return;
        }

        if (ChatDialog.isMakeMenu()) {
            await this.chooseCookProduct();
            if (cookableCount() === 0 && fishForDisposeCount() > 0) {
                if (burntCount() > 0) {
                    await this.dropBurnt();
                }
                this.cookingLoad = false;
                await this.disposeCatchAndReturn();
            }
            return;
        }

        if (needsGear()) {
            if (!hasPot() && (await this.lootPotFromGround())) {
                this.log('looted Lobster pot');
                return;
            }
            this.status = 'need Lobster pot';
            this.log('missing Lobster pot — bank first, then Harry if needed');
            await this.bankRestockAndReturn();
            if (!hasPot()) {
                this.log('still no pot — buying Lobster pot from Harry');
                await this.buyPotFromHarryAndReturn();
            }
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
            if (fishForDisposeCount() > 0) {
                await this.disposeCatchAndReturn();
            }
            return;
        }

        if (Inventory.isFull()) {
            await this.peelOffEastBeach();
            if (this.cookOnWay && cookableCount() > 0) {
                this.cookingLoad = true;
                this.log(
                    `full inv (${cookableCount()} cookable / ${rawFishCount()} raw) — cooking on way`
                );
                await this.cookLoad();
                return;
            }
            if (fishForDisposeCount() > 0) {
                await this.disposeCatchAndReturn();
                return;
            }
        }

        const here = Game.tile();
        if (!here) {
            await Execution.delayTicks(2);
            return;
        }

        if (onEastRocks(here) || pastCapeTip(here)) {
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

        const spot = this.findCageSpot();
        if (!spot) {
            await this.scanBeachForSpots();
            return;
        }

        this.emptyScanTicks = 0;
        await this.cageSpot(spot);
    }

    /** After cook (or raw full): sell to Harry or bank, then return to shore. */
    async disposeCatchAndReturn(): Promise<any> {
        if (this.sellToHarry && (harrySellCount() > 0 || cookedFishCount() > 0)) {
            await this.sellToHarryAndReturn();
            return;
        }
        await this.bankRestockAndReturn();
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
        if (isEastRocksHop(t)) {
            return false;
        }
        if (t.x < SPOT_MIN_X || t.x > SPOT_MAX_X || t.z < SPOT_MIN_Z || t.z > SPOT_MAX_Z) {
            return false;
        }
        return !this.isSpotBlacklisted(t);
    }

    /** Follow sand west off the cape/rocks — never 2860 → bank in one walk. */
    async peelOffEastBeach(): Promise<any> {
        const here = Game.tile();
        if (!leavingEastBeach(here)) {
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
        if (leavingEastBeach(after)) {
            await Traversal.walkResilient(MID_BEACH, {
                radius: 3,
                log: m => this.log(`  ${m}`)
            });
        }
        return true;
    }

    async walkBeachEast(): Promise<any> {
        this.status = 'walking east along sand';
        for (const stop of BEACH_EASTWARD) {
            const now = Game.tile();
            if (!now) {
                break;
            }
            if (now.x >= stop.x - 1 && Tile.from(now).distanceTo(stop) <= 3) {
                continue;
            }
            if (now.x < stop.x) {
                await Traversal.walkResilient(stop, {
                    radius: 2,
                    log: m => this.log(`  ${m}`)
                });
            }
        }
    }

    async walkBeachToward(dest: TileLike | null | undefined): Promise<any> {
        const here = Game.tile();
        if (!here || !dest) {
            return;
        }
        if (here.x < dest.x - 1) {
            for (const stop of BEACH_EASTWARD) {
                const now = Game.tile();
                if (!now) {
                    break;
                }
                if (stop.x > dest.x) {
                    break;
                }
                if (now.x < stop.x - 1) {
                    await Traversal.walkResilient(stop, {
                        radius: 2,
                        log: m => this.log(`  ${m}`)
                    });
                }
            }
        } else if (here.x > dest.x + 1) {
            for (const stop of BEACH_WESTWARD) {
                const now = Game.tile();
                if (!now) {
                    break;
                }
                if (stop.x < dest.x) {
                    continue;
                }
                if (now.x > stop.x + 1) {
                    await Traversal.walkResilient(stop, {
                        radius: 2,
                        log: m => this.log(`  ${m}`)
                    });
                }
            }
        }
        const after = Game.tile();
        if (after && Tile.from(after).distanceTo(dest) > 2) {
            await Traversal.walkResilient(dest, {
                radius: 2,
                log: m => this.log(`  ${m}`)
            });
        }
    }

    async scanBeachForSpots(): Promise<any> {
        this.status = 'scanning beach for Cage+Harpoon';
        const here = Game.tile();
        if (onEastRocks(here) || pastCapeTip(here)) {
            await this.peelOffEastBeach();
            return;
        }
        const dest = BEACH_SCAN[this.beachScanIdx % BEACH_SCAN.length];
        if (!here || Tile.from(here).distanceTo(dest) > 2) {
            this.log(`scanning beach @ ${dest.x},${dest.z}`);
            await this.walkBeachToward(dest);
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
        if (!after || leavingEastBeach(after) || Tile.from(after).distanceTo(ANCHOR) > STAND_RADIUS) {
            this.status = 'returning to mid beach';
            await Traversal.walkResilient(MID_BEACH, {
                radius: 3,
                log: m => this.log(`  ${m}`)
            });
        }
    }

    pickBestCageSpot(spots: any) {
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

    findCageSpot() {
        const q = Npcs.query()
            .name(SPOT_NAME)
            .where(n => isCageHarpoonSpot(n.actions()));
        return this.pickBestCageSpot(npcList(q.where(n => this.spotIsFishable(n.tile()))));
    }

    async cageSpot(spot: Npc): Promise<any> {
        const op = cageOp(spot.actions());
        if (!op) {
            await Execution.delayTicks(2);
            return;
        }

        const st = spot.tile();
        const here = Game.tile();
        if (onEastRocks(here) || pastCapeTip(here)) {
            await this.peelOffEastBeach();
            return;
        }
        if (st && here && st.x <= 2846 && leavingEastBeach(here)) {
            await this.peelOffEastBeach();
            return;
        }
        if (st && here && st.x >= 2859 && here.x < 2854) {
            this.log(`cape spot @ ${st.x},${st.z} — sand corridor, not through rocks`);
            await this.walkBeachEast();
            if (onEastRocks() || pastCapeTip()) {
                await this.peelOffEastBeach();
                return;
            }
        }

        const before = rawFishCount();
        this.cantReach = false;
        this.lastSpotTile = st;
        this.status = `caging (${spot.distance()}t)`;
        this.log(`Cage lobster spot @ ${st.x},${st.z}`);
        await spot.interact(op);

        await Execution.delayUntil(
            () =>
                rawFishCount() > before ||
                Game.animating() ||
                ChatDialog.canContinue() ||
                this.cantReach ||
                Inventory.isFull() ||
                !this.findCageSpot(),
            8000
        );
        this.noteCatches();
        if (this.cantReach) {
            await this.recoverCantReach(st);
        }
        if (onEastRocks() || pastCapeTip()) {
            await this.peelOffEastBeach();
        }
    }

    async lootPotFromGround(): Promise<any> {
        if (hasPot()) {
            return true;
        }
        const ground =
            GroundItems.query().name(POT_NAME).within(12).nearest() ??
            GroundItems.query()
                .where(g => isPotGroundName(g.name))
                .within(12)
                .nearest();
        if (!ground) {
            return false;
        }
        const before = Inventory.used();
        await ground.interact('Take');
        return (
            (await Execution.delayUntil(() => hasPot() || Inventory.used() > before, 6000)) &&
            hasPot()
        );
    }

    /** Deposit every inventory slot (including pots) while the bank is open. */
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
     * withdraw Lobster pot only → shore. Never starts fishing until that finishes.
     * If bank has no pot, withdraws coins and buys one from Harry.
     */
    async prepStartInv(): Promise<any> {
        if (!Bank.isOpen()) {
            this.status = 'start: bank';
            this.log(
                'start: opening bank — deposit everything, then withdraw Lobster pot'
            );
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

        if (!(await this.withdrawPotOnlyFromOpenBank())) {
            // No pot in bank — take coins for Harry if needed, then buy.
            const short = Math.max(0, POT_COST - coinCount());
            const bankGp = Bank.count('Coins') || 0;
            if (short > 0 && bankGp > 0) {
                const take = Math.min(short, bankGp);
                this.log(`start: no bank pot — withdrawing ${take} Coins for Harry`);
                await Bank.withdrawX('Coins', take);
                await Execution.delayTicks(1);
            }
            if (Bank.isOpen()) {
                await Bank.close();
            }
            this.log('start: no Lobster pot in bank — buying from Harry');
            await this.buyPotFromHarryAndReturn();
            if (hasPot()) {
                this.startReady = true;
                this.lastRawSeen = rawFishCount();
            }
            return;
        }

        if (!readyToFish()) {
            this.log('start: expected pot-only after withdraw — retrying');
            await Execution.delayTicks(2);
            return;
        }

        await Bank.close();
        this.bankTrips++;
        this.startReady = true;
        this.lastRawSeen = rawFishCount();
        this.status = 'returning to shore';
        this.log('start done — Lobster pot only; walking to shore');
        await Traversal.walkResilient(ANCHOR, {
            radius: 3,
            log: m => this.log(`  ${m}`)
        });
    }

    /** Withdraw one Lobster pot from an already-open bank (no coin fallback). */
    async withdrawPotOnlyFromOpenBank(): Promise<any> {
        if (!Bank.isOpen()) {
            return false;
        }
        if (hasPot()) {
            return true;
        }

        await Execution.delayUntil(() => Bank.loaded() || !Bank.isOpen(), 3000);
        if (!Bank.isOpen()) {
            return false;
        }

        const potBank = Bank.items().find(
            i => (i.name ?? '').toLowerCase() === 'lobster pot'
        );
        if (!potBank) {
            this.log('WARNING: no Lobster pot in bank');
            return false;
        }

        const op =
            (typeof withdrawOp === 'function'
                ? withdrawOp(potBank.ops, '1')
                : null) ?? 'Withdraw-1';
        this.log('withdrawing Lobster pot');
        await Bank.withdraw(POT_NAME, op);
        await Execution.delayTicks(1);
        return hasPot();
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
        this.log(`walking to Range ${RANGE_STAND.x},${RANGE_STAND.z} (on way to bank/Harry)`);
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
        const frag = kind === 'lobster' ? 'lobster' : null;
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
            this.log('WARNING: no Range near bank house — disposing raw instead');
            this.cookingLoad = false;
            await this.disposeCatchAndReturn();
            return;
        }

        if (ChatDialog.isMakeMenu()) {
            await this.chooseCookProduct();
            if (cookableCount() === 0) {
                if (burntCount() > 0) {
                    await this.dropBurnt();
                }
                this.cookingLoad = false;
                await this.disposeCatchAndReturn();
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
                await this.disposeCatchAndReturn();
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
            await this.disposeCatchAndReturn();
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

    async sellToHarryAndReturn(): Promise<any> {
        const rawSell = harrySellCount();
        const cooked = cookedFishCount();
        this.status = 'walking to Harry';
        this.log(
            `selling to Harry` +
                (rawSell ? ` ${rawSell} raw` : '') +
                (cooked ? ` (${cooked} cooked → bank after)` : '')
        );

        this.lastRawSeen = 0;

        await this.peelOffEastBeach();
        await Traversal.walkResilient(HARRY_STAND, {
            radius: 2,
            log: m => this.log(`  ${m}`)
        });
        await this.openNearbyDoor();

        this.status = 'opening Harry';
        if (!(await Shop.open(HARRY_NAME))) {
            this.log('could not open Harry — retrying next loop');
            await Execution.delayTicks(3);
            return;
        }

        await this.handleOpenHarry();
    }

    /** Sell catch and/or buy a Lobster pot while Harry's shop is open. */
    async handleOpenHarry(): Promise<any> {
        this.status = 'at Harry';
        let sold = 0;
        for (let guard = 0; guard < 60 && harrySellCount() > 0 && Shop.isOpen(); guard++) {
            const names = harrySellNamesHeld();
            if (names.length === 0) {
                break;
            }
            for (const name of names) {
                const have = countByExactName(name);
                if (have <= 0) {
                    continue;
                }
                const n = await Shop.sell(name, have);
                if (n > 0) {
                    sold += n;
                    this.log(`sold ${n}× ${name} to Harry`);
                }
                await Execution.delayTicks(1);
            }
            if (harrySellCount() > 0) {
                await Execution.delayTicks(1);
            }
        }

        if (!hasPot() && Shop.isOpen()) {
            await this.buyPotInOpenShop();
        }

        if (Shop.isOpen()) {
            await Shop.close();
        }

        if (sold > 0) {
            this.sold += sold;
            this.sellTrips++;
        }
        this.cookingLoad = false;

        if (harrySellCount() > 0) {
            this.log(`WARNING: still holding ${harrySellCount()} sellable raw — will retry`);
            await Execution.delayTicks(3);
            return;
        }

        // Cooked leftovers Harry won't buy — bank them + restock pot.
        if (cookedFishCount() > 0 || burntCount() > 0 || !hasPot()) {
            if (!hasPot()) {
                // Already tried shop buy; bank for pot / coins next.
                await this.bankRestockAndReturn();
                if (!hasPot()) {
                    await this.buyPotFromHarryAndReturn();
                }
                return;
            }
            await this.bankRestockAndReturn();
            return;
        }

        this.startReady = true;
        this.lastRawSeen = rawFishCount();
        this.status = 'returning to shore';
        await Traversal.walkResilient(ANCHOR, {
            radius: 3,
            log: m => this.log(`  ${m}`)
        });
    }

    /**
     * Bank fish, withdraw Lobster pot if needed.
     * If bank has no pot, withdraw coins for a Harry purchase.
     */
    async bankRestockAndReturn(): Promise<any> {
        const raw = rawFishCount();
        const cooked = cookedFishCount();
        this.status = 'banking';
        this.log(
            `banking` +
                (raw ? ` ${raw} raw` : '') +
                (cooked ? ` ${cooked} cooked` : '') +
                (burntCount() ? ` ${burntCount()} burnt` : '') +
                ` — restock Lobster pot`
        );

        this.lastRawSeen = 0;

        await this.peelOffEastBeach();
        await Banking.bankNearest({
            destination: { name: 'Catherby', tile: BANK_STAND },
            deposit: name => {
                if (isKeepGear(name) || isCoins(name)) {
                    return false;
                }
                return isBankableFish(name);
            },
            afterDeposit: async () => await this.withdrawGearFromOpenBank(),
            // Stay near bank if we still need Harry for a pot (don't walk to shore yet).
            returnTo: null,
            log: m => this.log(`  ${m}`)
        });

        this.bankTrips++;
        this.cookingLoad = false;
        this.lastRawSeen = rawFishCount();

        if (!hasPot()) {
            this.log('no Lobster pot in bank — buying from Harry');
            await this.buyPotFromHarryAndReturn();
            return;
        }

        this.startReady = true;
        this.log('gear ready — Lobster pot');
        this.status = 'returning to shore';
        await Traversal.walkResilient(ANCHOR, {
            radius: 3,
            log: m => this.log(`  ${m}`)
        });
    }

    /**
     * Walk to Harry, buy one Lobster pot, return to shore.
     */
    async buyPotFromHarryAndReturn(): Promise<any> {
        if (hasPot()) {
            this.startReady = true;
            this.status = 'returning to shore';
            await Traversal.walkResilient(ANCHOR, {
                radius: 3,
                log: m => this.log(`  ${m}`)
            });
            return;
        }

        if (coinCount() < POT_COST) {
            this.log(
                `need ${POT_COST}gp for Lobster pot (have ${coinCount()}) — withdrawing coins`
            );
            await this.withdrawCoinsForPot();
        }

        if (coinCount() < POT_COST) {
            this.log('WARNING: not enough coins to buy Lobster pot from Harry');
            this.status = 'need coins';
            await Execution.delayTicks(8);
            return;
        }

        this.status = 'walking to Harry (pot)';
        this.log(`buying Lobster pot from Harry (${POT_COST}gp)`);

        await this.peelOffEastBeach();
        await Traversal.walkResilient(HARRY_STAND, {
            radius: 2,
            log: m => this.log(`  ${m}`)
        });
        await this.openNearbyDoor();

        this.status = 'buying pot';
        if (!(await Shop.open(HARRY_NAME))) {
            this.log('could not open Harry for pot — retrying next loop');
            await Execution.delayTicks(3);
            return;
        }

        await this.buyPotInOpenShop();

        if (Shop.isOpen()) {
            await Shop.close();
        }

        if (!hasPot()) {
            this.log('WARNING: still no Lobster pot after Harry — need coins or shop stock');
            this.status = 'need pot';
            await Execution.delayTicks(8);
            return;
        }

        this.startReady = true;
        this.log('bought Lobster pot — returning to shore');
        this.lastRawSeen = rawFishCount();
        this.status = 'returning to shore';
        await Traversal.walkResilient(ANCHOR, {
            radius: 3,
            log: m => this.log(`  ${m}`)
        });
    }

    /** Buy one Lobster pot from an already-open Harry shop. */
    async buyPotInOpenShop(): Promise<any> {
        if (!Shop.isOpen() || hasPot()) {
            return 0;
        }

        if (coinCount() < POT_COST) {
            this.log('cannot afford Lobster pot at Harry');
            return 0;
        }

        this.status = 'buying Lobster pot';
        this.log(`Shop.buy 1× ${POT_NAME}`);
        const bought = await Shop.buy(POT_NAME, 1);
        if (bought > 0) {
            this.log(`bought ${bought}× ${POT_NAME} from Harry`);
        } else {
            this.log('Harry had no Lobster pot / buy failed');
        }
        return bought;
    }

    /** Open Catherby bank and withdraw enough coins to buy a Lobster pot. */
    async withdrawCoinsForPot(): Promise<any> {
        const short = Math.max(0, POT_COST - coinCount());
        if (short <= 0) {
            return;
        }

        await Banking.bankNearest({
            destination: { name: 'Catherby', tile: BANK_STAND },
            deposit: name => {
                if (isKeepGear(name) || isCoins(name)) {
                    return false;
                }
                return isBankableFish(name);
            },
            afterDeposit: async () => {
                await Execution.delayUntil(() => Bank.loaded() || !Bank.isOpen(), 3000);
                if (!Bank.isOpen()) {
                    return;
                }
                // Prefer withdrawing the pot if it appeared.
                if (await this.withdrawGearFromOpenBank()) {
                    return;
                }
                const bankGp = Bank.count('Coins') || 0;
                if (bankGp <= 0) {
                    this.log('WARNING: no Coins in bank for Harry pot');
                    return;
                }
                const take = Math.min(short, bankGp);
                this.log(`withdrawing ${take} Coins for Harry Lobster pot`);
                await Bank.withdrawX('Coins', take);
                await Execution.delayTicks(1);
            },
            returnTo: null,
            log: m => this.log(`  ${m}`)
        });
    }

    /** @returns {Promise<boolean>} true if pot is in inventory after */
    async withdrawGearFromOpenBank(): Promise<any> {
        if (!Bank.isOpen()) {
            return hasPot();
        }
        await Execution.delayUntil(() => Bank.loaded() || !Bank.isOpen(), 3000);
        if (!Bank.isOpen()) {
            return hasPot();
        }

        if (hasPot()) {
            return true;
        }

        const potBank = Bank.items().find(
            i => (i.name ?? '').toLowerCase() === 'lobster pot'
        );
        if (potBank) {
            const op =
                (typeof withdrawOp === 'function'
                    ? withdrawOp(potBank.ops, '1')
                    : null) ?? 'Withdraw-1';
            this.log('withdrawing Lobster pot');
            await Bank.withdraw(POT_NAME, op);
            await Execution.delayTicks(1);
            return hasPot();
        }

        // Prepare coins for Harry.
        const short = Math.max(0, POT_COST - coinCount());
        const bankGp = Bank.count('Coins') || 0;
        if (short > 0 && bankGp > 0) {
            const take = Math.min(short, bankGp);
            this.log(`no bank pot — withdrawing ${take} Coins for Harry Lobster pot`);
            await Bank.withdrawX('Coins', take);
            await Execution.delayTicks(1);
        } else {
            this.log('WARNING: no Lobster pot in bank');
        }
        return hasPot();
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
        const soldPh = hrs > 0.008 ? this.sold / hrs : 0;

        const mode = this.sellToHarry
            ? this.cookOnWay
                ? 'cook→Harry'
                : 'sell→Harry'
            : this.cookOnWay
              ? 'cook→bank'
              : 'bank raw';

        const lines = [
            `Benzyme's Catherby Lobsters  Fish ${Skills.level('fishing')}  Cook ${Skills.level('cooking')}`,
            `time ${fmtElapsed(elapsed)}  ·  ${mode}  ·  ${this.status}`,
            `caught ${this.caught} (${fmtXph(caughtPh)}/hr)  cooked ${this.cooked} (${fmtXph(cookedPh)}/hr)` +
                (this.sellToHarry || this.sold > 0
                    ? `  sold ${this.sold} (${fmtXph(soldPh)}/hr)`
                    : ''),
            `pot ${hasPot() ? 'yes' : 'NO'}  bank ${this.bankTrips}` +
                (this.sellToHarry || this.sellTrips > 0 ? `  sells ${this.sellTrips}` : '') +
                `  Fish XP ${fmtXph(fishXph)}/hr` +
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
        ctx.fillStyle = '#9bc47a';
        lines.forEach((line, i) => {
            ctx.fillText(line, 6 + pad, 6 + pad + (i + 1) * lineH - 4);
        });
    }
}

export default defineBot({
    name: SCRIPT_NAME,
    version: '1.0.0',
    category: 'Fishing',
    tags: ['fishing', 'catherby', 'lobster', 'cage', 'bank', 'cook', 'harry'],
    description:
        "Benzyme's Catherby Lobsters — on start always banks, deposits everything, withdraws Lobster pot, then cages lobsters on Cage+Harpoon spots (Harry sand / mid beach first; cape via sand corridor; never the east rocks). Buys a pot from Harry if missing. Optional cook on way; optional sell Raw lobster to Harry instead of banking.",
    settingsSchema: {
        cookOnWay: {
            type: 'boolean',
            default: true,
            label: 'Cook on way to bank',
            group: 'Cooking',
            help:
                'When the pack is full, cook Raw lobster on the Catherby bank-house Range (Cooking 40+), drop burnt, then bank or sell to Harry'
        },
        sellToHarry: {
            type: 'boolean',
            default: false,
            label: 'Sell to Harry',
            group: 'Sell',
            help:
                'Sell Raw lobster to Harry at the Catherby fishing shop instead of banking, then return to cage fishing. Cooked leftovers (if cook-on-way is on) still bank. Restocks Lobster pot from bank; buys one from Harry when bank has none.'
        }
    },
    create: () => new CatherbyLobsters()
});
