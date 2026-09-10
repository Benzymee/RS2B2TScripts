/**
 * FishingGuildLobstersSwordfish — Cage+Harpoon spots at the Fishing Guild.
 * Mode: Cage lobsters (Lobster pot) or Harpoon swordfish/tuna (Harpoon).
 * Optional cook on the range at 2615,3396 (preference tick box), then bank and return to the docks.
 * Optional mule: once banked cooked catch hits the threshold, withdraw as notes and trade to
 * the named mule at the Fishing Guild bank, then keep fishing.
 * Withdraws the tool from the guild bank; loots the entrance-hall spawn if the bank has none.
 * If still missing, buys it from Harry (Catherby). Can't afford it: sell a bank item at
 * Arhein's general store, then buy the tool.
 * Completely vibe coded by @.benzyme on Discord via Cursor AI
 * Self-contained ESM for rs2b0t Load local script / Load URL.
 *
 * Load URL: https://benzymee.github.io/RS2B2TScripts/FishingGuildLobstersSwordfish.js
 */
const SUPPORTED_API_VERSION = 1;
const abi = globalThis.__rs2b0t;
if (!abi) {
    throw new Error(
        'FishingGuildLobstersSwordfish: globalThis.__rs2b0t missing — load inside rs2b0t bot.html'
    );
}
if (abi.apiVersion !== SUPPORTED_API_VERSION) {
    throw new Error(
        `FishingGuildLobstersSwordfish: ABI ${abi.apiVersion} != supported ${SUPPORTED_API_VERSION}`
    );
}

const {
    defineBot,
    Execution,
    Game,
    LoopingBot,
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
    Players,
    Trade,
    withdrawOp
} = abi;

const SCRIPT_NAME = 'FishingGuildLobstersSwordfish';

/** Post-login welcome modal interface id (Close Window top-right). */
const WELCOME_SCREEN_ID = 5993;

const FISH_LOBSTER = 'Lobsters';
const FISH_SWORDFISH = 'Swordfish';
const FISH_OPTIONS = [FISH_LOBSTER, FISH_SWORDFISH];

function welcomeHost() {
    return globalThis.rs2b0t ?? null;
}

function isWelcomeModalOpen() {
    const host = welcomeHost();
    if (!host?.reader) {
        return false;
    }
    const { reader } = host;
    const main = typeof reader.modals === 'function' ? reader.modals().main : -1;
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
 * @returns {Promise<boolean>} true if we acted on / closed it
 */
async function dismissWelcomeScreen() {
    if (!isWelcomeModalOpen()) {
        return false;
    }
    const host = welcomeHost();
    if (!host?.reader || !host?.actions) {
        return false;
    }
    const { reader, actions } = host;

    for (let attempt = 0; attempt < 8 && isWelcomeModalOpen(); attempt++) {
        const main = reader.modals().main;
        if (main === -1) {
            break;
        }

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

/** Mid-dock stand — both cage piers are in leash of this pin. */
const ANCHOR = new Tile(2605, 3420, 0);
const LEASH = 22;
const STAND_RADIUS = 8;

/** Guild south doors. WalkingBot pin is just outside. */
const GUILD_GATE_OUT = new Tile(2611, 3392, 0);
const GUILD_GATE_IN = new Tile(2611, 3396, 0);
const GUILD_DOOR_TILE = new Tile(2611, 3394, 0);

/** Fishing Guild bank booth (~2586,3420). */
const BANK_STAND = new Tile(2586, 3420, 0);
/** Stay inside the guild bank while waiting / trading the mule. */
const BANK_MULE_LEASH = 8;
const MULE_TRADE_RANGE = 2;
const MULE_TRADE_REQUEST_MS = 5_000;
const MULE_ACCEPT_WAIT_MIN_MS = 5_000;
const MULE_ACCEPT_WAIT_MAX_MS = 10_000;
const MULE_ACCEPT_RETRY_MS = 3_000;
const DEFAULT_MULE_NAME = 'Glarvo';
const DEFAULT_MULE_THRESHOLD = 200;

function muleAcceptDelayMs() {
    return (
        MULE_ACCEPT_WAIT_MIN_MS +
        Math.floor(Math.random() * (MULE_ACCEPT_WAIT_MAX_MS - MULE_ACCEPT_WAIT_MIN_MS + 1))
    );
}

/** Cook range just inside the guild, east of the south doors. Stand west of it. */
const RANGE_LOC = new Tile(2616, 3396, 0);
const RANGE_STAND = new Tile(2615, 3396, 0);
const RANGE_LEASH = 8;
/** Common RS2 / OSRS cooking-range type ids (guild Range is 11475 on OSRS). */
const RANGE_TYPE_IDS = new Set([
    114, 376, 2728, 3039, 4172, 4173, 5275, 8750, 9682, 9683, 11475, 12269, 12542,
    14919, 16641, 20331, 21302, 26181
]);

const POT_NAME = 'Lobster pot';
const HARPOON_NAME = 'Harpoon';
const SPOT_NAME = 'Fishing spot';
const HARRY_NAME = 'Harry';
const HARRY_STAND = new Tile(2833, 3443, 0);
const HARPOON_COST = 5;
const POT_COST = 20;
const GENERAL_STORES = [
    { keeper: 'Arhein', stand: new Tile(2807, 3430, 0), label: 'Arhein (Catherby)' },
    { keeper: 'Aemad', alt: 'Kortan', stand: new Tile(2613, 3294, 0), label: "Aemad's (Ardougne)" }
];
const GUILD_LEVEL = 68;
const FISH_LEVEL = {
    lobster: 40,
    swordfish: 50
};
/** Cooking level for each raw (not fishing level). */
const COOK_LEVEL = {
    lobster: 40,
    tuna: 30,
    swordfish: 45
};
const UNREACHABLE_MS = 45_000;
const CANT_REACH_RE = /i can't reach that/i;

function tileKey(tile) {
    if (!tile) {
        return '';
    }
    return `${tile.x},${tile.z},${tile.level ?? 0}`;
}

function insideGuild(tile = Game.tile()) {
    if (!tile || (tile.level ?? 0) !== 0) {
        return false;
    }
    return tile.x >= 2580 && tile.x <= 2616 && tile.z >= 3394 && tile.z <= 3428;
}

function fmtXph(n) {
    if (n >= 100_000) {
        return `${(n / 1000).toFixed(0)}k`;
    }
    if (n >= 10_000) {
        return `${(n / 1000).toFixed(1)}k`;
    }
    return String(Math.round(n));
}

function fmtElapsed(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) {
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
}

function prefStorageKey(key) {
    const box =
        typeof location !== 'undefined'
            ? new URLSearchParams(location.search).get('box')
            : null;
    const suffix = `set:${SCRIPT_NAME}:${key}`;
    return box ? `rs2b0t:${box}:${suffix}` : `rs2b0t:${suffix}`;
}

function readPrefRaw(key) {
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

function readPrefBool(key, fallback) {
    const raw = readPrefRaw(key);
    if (raw === null) {
        return fallback;
    }
    const n = raw.trim().toLowerCase();
    return n === 'true' || n === '1' || n === 'yes';
}

function readPrefStr(key, fallback) {
    const raw = readPrefRaw(key);
    return raw !== null ? raw.trim() : fallback;
}

function readPrefNum(key, fallback) {
    const raw = readPrefRaw(key);
    if (raw === null) {
        return fallback;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
}

function clampMuleThreshold(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) {
        return DEFAULT_MULE_THRESHOLD;
    }
    return Math.max(1, Math.min(10_000, Math.floor(v)));
}

function normalizeFishMode(raw) {
    const s = (raw ?? '').trim();
    const hit = FISH_OPTIONS.find(o => o.toLowerCase() === s.toLowerCase());
    if (hit) {
        return hit;
    }
    const soft = s.toLowerCase();
    if (soft.includes('sword') || soft.includes('tuna') || soft.includes('harpoon')) {
        return FISH_SWORDFISH;
    }
    if (soft.includes('lob') || soft.includes('cage') || soft.includes('pot')) {
        return FISH_LOBSTER;
    }
    return FISH_LOBSTER;
}

function isLobsterMode(mode) {
    return mode === FISH_LOBSTER;
}

function toolName(mode) {
    return isLobsterMode(mode) ? POT_NAME : HARPOON_NAME;
}

function toolCost(mode) {
    return isLobsterMode(mode) ? POT_COST : HARPOON_COST;
}

function isPanelPaused() {
    return !!document.querySelector('.rs2b0t-value.rs2b0t-state-paused');
}

function unlockPausedPrefsUi() {
    if (!isPanelPaused()) {
        return;
    }
    for (const btn of document.querySelectorAll('button.rs2b0t-param-edit')) {
        if ((btn.textContent || '').includes('Edit parameters')) {
            btn.disabled = false;
            btn.title = 'Editable while paused — applies on the next loop / Resume';
        }
    }
    for (const backdrop of document.querySelectorAll('.rs2b0t-modal-backdrop')) {
        if (backdrop.style.display !== 'flex') {
            continue;
        }
        for (const el of backdrop.querySelectorAll('input, select, textarea')) {
            el.disabled = false;
        }
    }
}

const PAINT_FONT_ID = 'benzyme-fishing-guild-cage-font-v1';
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

function isPotName(name) {
    return (name ?? '').toLowerCase() === 'lobster pot';
}

function isHarpoonName(name) {
    return (name ?? '').toLowerCase().includes('harpoon');
}

function fishKind(name) {
    const n = (name ?? '').toLowerCase();
    if (n.includes('swordfish')) {
        return 'swordfish';
    }
    if (n.includes('tuna')) {
        return 'tuna';
    }
    if (n.includes('lobster')) {
        return 'lobster';
    }
    return null;
}

function rawFishKind(name) {
    const n = (name ?? '').toLowerCase();
    if (!n.startsWith('raw ')) {
        return null;
    }
    return fishKind(n);
}

function isRawCatch(name, mode) {
    const kind = rawFishKind(name);
    if (!kind) {
        return false;
    }
    if (isLobsterMode(mode)) {
        return kind === 'lobster';
    }
    return kind === 'tuna' || kind === 'swordfish';
}

function isCookedCatch(name, mode) {
    if (!name) {
        return false;
    }
    const n = name.toLowerCase().trim();
    if (n.startsWith('raw ') || n.startsWith('burnt ')) {
        return false;
    }
    if (isLobsterMode(mode)) {
        return n === 'lobster';
    }
    return n === 'tuna' || n === 'swordfish';
}

function isBurntFish(name) {
    if (!name) {
        return false;
    }
    const n = name.toLowerCase();
    return (
        n.startsWith('burnt ') ||
        n === 'burnt fish' ||
        n === 'burnt lobster' ||
        n === 'burnt tuna' ||
        n === 'burnt swordfish'
    );
}

function canCookRaw(name) {
    const kind = rawFishKind(name);
    if (!kind || COOK_LEVEL[kind] == null) {
        return false;
    }
    return Skills.level('cooking') >= COOK_LEVEL[kind];
}

function countMatching(pred) {
    return Inventory.items()
        .filter(i => pred(i.name))
        .reduce((n, i) => n + Math.max(1, i.count), 0);
}

function rawFishCount(mode) {
    return countMatching(n => isRawCatch(n, mode));
}

function cookableCount(mode) {
    return countMatching(n => isRawCatch(n, mode) && canCookRaw(n));
}

function cookedFishCount(mode) {
    return countMatching(n => isCookedCatch(n, mode));
}

function muleFishNames(mode) {
    return isLobsterMode(mode) ? ['Lobster'] : ['Swordfish', 'Tuna'];
}

function muleFishLabel(mode) {
    return isLobsterMode(mode) ? 'cooked lobster' : 'cooked tuna/swordfish';
}

/** Cooked catch of the current mode only, never raw or burnt. */
function isMuleFish(name, mode) {
    return isCookedCatch(name, mode);
}

function certIsNote(id) {
    try {
        const OT =
            globalThis.ObjType ??
            globalThis.__rs2b0t?.ObjType ??
            globalThis.__client?.ObjType ??
            null;
        if (!OT || typeof OT.list !== 'function') {
            return null;
        }
        const t = OT.list(id);
        if (!t) {
            return null;
        }
        return typeof t.certtemplate === 'number' && t.certtemplate !== -1;
    } catch {
        return null;
    }
}

function isNotedMuleFishItem(item, mode) {
    if (!item || !isMuleFish(item.name, mode)) {
        return false;
    }
    const cert = certIsNote(item.id);
    if (cert === true) {
        return true;
    }
    if (cert === false) {
        return false;
    }
    return Math.max(1, item.count) > 1;
}

function isUnnotedMuleFishItem(item, mode) {
    return !!item && isMuleFish(item.name, mode) && !isNotedMuleFishItem(item, mode);
}

function isUnnotedMuleFishDeposit(name, id, mode) {
    if (!isMuleFish(name, mode)) {
        return false;
    }
    const cert = certIsNote(id);
    if (cert === true) {
        return false;
    }
    if (cert === false) {
        return true;
    }
    const inv = Inventory.items().filter(i => i.id === id && isMuleFish(i.name, mode));
    if (inv.some(i => Math.max(1, i.count) > 1)) {
        return false;
    }
    return inv.length > 0;
}

function unnotedMuleFishCount(mode) {
    return Inventory.items()
        .filter(i => isUnnotedMuleFishItem(i, mode))
        .reduce((n, i) => n + Math.max(1, i.count), 0);
}

function notedMuleFishCount(mode) {
    return Inventory.items()
        .filter(i => isNotedMuleFishItem(i, mode))
        .reduce((n, i) => n + Math.max(1, i.count), 0);
}

function muleFishHeldCount(mode) {
    return Inventory.items()
        .filter(i => isMuleFish(i.name, mode))
        .reduce((n, i) => n + Math.max(1, i.count), 0);
}

function muleFishNamesHeld(mode) {
    const names = [];
    const seen = new Set();
    for (const item of Inventory.items()) {
        if (!isMuleFish(item.name, mode)) {
            continue;
        }
        const key = (item.name ?? '').toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        names.push(item.name);
    }
    return names;
}

function burntCount() {
    return countMatching(isBurntFish);
}

function fishForBankCount(mode) {
    return rawFishCount(mode) + cookedFishCount(mode) + burntCount();
}

function lastCookableRaw(mode) {
    const items = Inventory.items();
    for (let i = items.length - 1; i >= 0; i--) {
        const name = items[i].name;
        if (isRawCatch(name, mode) && canCookRaw(name)) {
            return items[i];
        }
    }
    return null;
}

function countCookableNamed(fragment, mode) {
    const want = fragment.toLowerCase();
    return countMatching(
        n => isRawCatch(n, mode) && canCookRaw(n) && (n ?? '').toLowerCase().includes(want)
    );
}

function matchCookProduct(products, preferName, mode) {
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
    const frags = isLobsterMode(mode) ? ['lobster'] : ['swordfish', 'tuna'];
    for (const frag of frags) {
        if (countCookableNamed(frag, mode) <= 0) {
            continue;
        }
        const hit = products.find(p => (p ?? '').toLowerCase().includes(frag));
        if (hit) {
            return hit;
        }
    }
    return products[0] ?? null;
}

function hasPot() {
    return Inventory.items().some(i => isPotName(i.name));
}

function hasHarpoonInv() {
    return Inventory.items().some(i => isHarpoonName(i.name));
}

function hasHarpoonWorn() {
    if (typeof Equipment.contains === 'function') {
        try {
            if (Equipment.contains(HARPOON_NAME)) {
                return true;
            }
        } catch {
            /* name miss is fine — fall through to items() */
        }
    }
    if (typeof Equipment.items !== 'function') {
        return false;
    }
    return Equipment.items().some(i => isHarpoonName(i.name));
}

function hasHarpoon() {
    return hasHarpoonInv() || hasHarpoonWorn();
}

function hasGear(mode) {
    return isLobsterMode(mode) ? hasPot() : hasHarpoon();
}

function isCoins(name) {
    return (name ?? '').toLowerCase() === 'coins';
}

function coinCount() {
    return countMatching(isCoins);
}

function cheb(a, b) {
    if (!a || !b) {
        return Infinity;
    }
    return Math.max(Math.abs((a.x ?? 0) - (b.x ?? 0)), Math.abs((a.z ?? 0) - (b.z ?? 0)));
}

function isFishingSupplyName(name) {
    const n = (name ?? '').toLowerCase();
    return (
        n.includes('harpoon') ||
        n.includes('lobster pot') ||
        n.includes('fishing net') ||
        n === 'small net' ||
        n === 'big net' ||
        n.includes('fishing rod') ||
        n === 'fishing bait' ||
        n === 'feather' ||
        n === 'feathers'
    );
}

/** Keep all fishing kit in the pack; deposit fish, coins, junk, worn loot. */
function isKeepOnDeposit(name) {
    return isFishingSupplyName(name);
}

function junkInvNames() {
    const seen = new Set();
    const names = [];
    for (const item of Inventory.items()) {
        const name = (item.name ?? '').trim();
        if (!name || isKeepOnDeposit(name) || seen.has(name)) {
            continue;
        }
        seen.add(name);
        names.push(name);
    }
    return names;
}

function isSellForbidden(name) {
    return isCoins(name) || isFishingSupplyName(name);
}

function nearestGeneralStore(from = Game.tile()) {
    let best = GENERAL_STORES[0];
    let bestDist = Infinity;
    for (const store of GENERAL_STORES) {
        const d = cheb(from, store.stand);
        if (d < bestDist) {
            bestDist = d;
            best = store;
        }
    }
    return best;
}

function cageOp(actions) {
    return actions.find(a => /^cage$/i.test(a)) ?? null;
}

function harpoonOp(actions) {
    return actions.find(a => /^harpoon$/i.test(a)) ?? null;
}

/** Lobster / tuna / swordfish hops — Cage + Harpoon (never Net+Harpoon sharks). */
function isCageHarpoonSpot(actions) {
    return cageOp(actions) !== null && harpoonOp(actions) !== null;
}

function locActions(loc) {
    if (!loc) {
        return [];
    }
    try {
        const acts = typeof loc.actions === 'function' ? loc.actions() : loc.actions;
        return Array.isArray(acts) ? acts : [];
    } catch {
        return [];
    }
}

function isDoorName(loc) {
    if (!loc) {
        return false;
    }
    const name = (loc.name ?? '').toLowerCase();
    return name.includes('door') || name.includes('gate');
}

function isShutDoor(loc) {
    if (!isDoorName(loc)) {
        return false;
    }
    return locActions(loc).some(a => /^open/i.test(a));
}

function openDoorOp(loc) {
    return locActions(loc).find(a => /^open/i.test(a)) ?? null;
}

function locName(loc) {
    if (!loc) {
        return '';
    }
    if (typeof loc.name === 'function') {
        return loc.name() ?? '';
    }
    return loc.name ?? '';
}

function coerceLocTile(t) {
    if (!t) {
        return null;
    }
    const x = t.x;
    const z = typeof t.z === 'number' ? t.z : t.y;
    if (typeof x !== 'number' || typeof z !== 'number') {
        return null;
    }
    return new Tile(x, z, t.level ?? t.plane ?? 0);
}

function locTile(loc) {
    if (!loc) {
        return null;
    }
    const fromTile = coerceLocTile(typeof loc.tile === 'function' ? loc.tile() : loc.tile);
    if (fromTile) {
        return fromTile;
    }
    const snap = loc.snap;
    if (!snap) {
        return null;
    }
    return (
        coerceLocTile(snap) ||
        coerceLocTile({
            x: snap.x,
            z: snap.z ?? snap.y,
            level: snap.level ?? snap.plane ?? 0
        })
    );
}

function locTypeId(loc) {
    if (!loc) {
        return -1;
    }
    try {
        const typecode = loc.snap?.typecode;
        if (typeof typecode === 'number' && typecode > 0) {
            return (typecode >> 14) & 0x7fff;
        }
        const raw = typeof loc.id === 'function' ? loc.id() : loc.id;
        const n = Number(raw);
        return Number.isFinite(n) && n >= 0 && n <= 0x7fff ? n : -1;
    } catch {
        return -1;
    }
}

function pushLocs(into, rows) {
    if (!Array.isArray(rows)) {
        return;
    }
    for (const loc of rows) {
        if (loc) {
            into.push(loc);
        }
    }
}

function sceneLocs() {
    const out = [];
    try {
        const q = Locs.query();
        if (typeof q.results === 'function') {
            pushLocs(out, q.results());
        }
        if (typeof q.within === 'function') {
            const near = q.within(8);
            if (near && typeof near.results === 'function') {
                pushLocs(out, near.results());
            } else if (near && typeof near.nearest === 'function') {
                const one = near.nearest();
                if (one) {
                    out.push(one);
                }
            }
        }
        const named = Locs.query().name('Range', 'Cooking range');
        if (named && typeof named.results === 'function') {
            pushLocs(out, named.results());
        } else if (named && typeof named.nearest === 'function') {
            const one = named.nearest();
            if (one) {
                out.push(one);
            }
        }
        if (typeof q.where === 'function' && out.length === 0) {
            pushLocs(out, q.where(() => true).results?.());
        }
    } catch {
        /* ignore */
    }
    return out;
}

function locCheb(loc, tile) {
    const t = locTile(loc);
    if (!t || !tile) {
        return Infinity;
    }
    return Tile.from(t).distanceTo(Tile.from(tile));
}

function isSceneryJunk(loc) {
    const n = locName(loc).toLowerCase();
    return (
        n.includes('door') ||
        n.includes('gate') ||
        n.includes('barrel') ||
        n.includes('bank') ||
        n.includes('booth') ||
        n.includes('table') ||
        n.includes('bench') ||
        n.includes('stool') ||
        n.includes('ladder') ||
        n.includes('chair') ||
        n.includes('bed')
    );
}

function locDistance(loc) {
    if (!loc) {
        return Infinity;
    }
    if (typeof loc.distance === 'function') {
        try {
            const d = loc.distance();
            if (typeof d === 'number' && Number.isFinite(d)) {
                return d;
            }
        } catch {
            /* ignore */
        }
    }
    const t = locTile(loc);
    const here = Game.tile();
    if (t && here) {
        return Tile.from(t).distanceTo(Tile.from(here));
    }
    return Infinity;
}

function isRangeName(name) {
    const n = (name ?? '').toLowerCase();
    if (!n || n.includes('ranging')) {
        return false;
    }
    return (
        n === 'range' ||
        n === 'cooking range' ||
        n.includes('range') ||
        n.includes('stove') ||
        n.includes('oven')
    );
}

function nearbyLocSummary() {
    try {
        const here = Game.tile();
        const list = sceneLocs()
            .filter(l => {
                const toHere = here ? locCheb(l, here) : Infinity;
                const toRange = locCheb(l, RANGE_LOC);
                return toHere <= 6 || toRange <= 3;
            })
            .sort((a, b) => locCheb(a, RANGE_LOC) - locCheb(b, RANGE_LOC));
        if (!list.length) {
            return '';
        }
        return list
            .slice(0, 12)
            .map(l => {
                const t = locTile(l);
                const id = locTypeId(l);
                return `${locName(l) || 'unnamed'}@${t?.x ?? '?'},${t?.z ?? '?'} cheb${locCheb(l, RANGE_LOC)} id=${id}`;
            })
            .join('; ');
    } catch {
        return '';
    }
}

function onExactTile(tile, here = Game.tile()) {
    return !!(
        tile &&
        here &&
        here.x === tile.x &&
        here.z === tile.z &&
        (here.level ?? 0) === (tile.level ?? 0)
    );
}

/** West of the cook range — do not stand east of it (no path). */
function rangeUseTiles() {
    return [
        RANGE_STAND,
        new Tile(RANGE_STAND.x, RANGE_STAND.z - 1, 0),
        new Tile(RANGE_STAND.x, RANGE_STAND.z + 1, 0)
    ];
}

function guildRangeScore(loc) {
    if (!loc || isSceneryJunk(loc)) {
        return -1;
    }
    const named = isRangeName(locName(loc));
    const knownId = RANGE_TYPE_IDS.has(locTypeId(loc));
    if (!named && !knownId) {
        return -1;
    }
    const t = locTile(loc);
    const cheb = t ? Tile.from(t).distanceTo(RANGE_LOC) : Infinity;
    const dist = locDistance(loc);
    if (t && cheb > RANGE_LEASH && dist > 5) {
        return -1;
    }
    let score = 50;
    if (cheb === 0) {
        score += 40;
    } else if (cheb <= 2) {
        score += 20;
    }
    if (dist <= 3) {
        score += 40;
    } else if (atCookRange() && dist <= 6) {
        score += 20;
    }
    if (knownId) {
        score += 20;
    }
    return score;
}

function isGuildRangeLoc(loc) {
    return guildRangeScore(loc) > 0;
}

function pickGuildRange() {
    let best = null;
    let bestScore = 0;
    for (const loc of sceneLocs()) {
        const score = guildRangeScore(loc);
        if (score > bestScore) {
            best = loc;
            bestScore = score;
        }
    }
    if (best) {
        return best;
    }
    if (!atCookRange()) {
        return null;
    }
    try {
        const named = Locs.query().name('Range', 'Cooking range').nearest();
        if (named && locDistance(named) <= 6 && guildRangeScore(named) > 0) {
            return named;
        }
    } catch {
        /* ignore */
    }
    return null;
}

/** Standing at the cook range east of the guild doors (2615,3396). */
function atCookRange(tile = Game.tile()) {
    if (!tile || (tile.level ?? 0) !== 0) {
        return false;
    }
    return Tile.from(tile).distanceTo(RANGE_STAND) <= 2;
}

class FishingGuildLobstersSwordfish extends LoopingBot {
    status = 'starting';
    startedAt = 0;
    fishXpAtStart = 0;
    cookXpAtStart = 0;
    /** Total raw catch this session (current mode's fish). */
    caught = 0;
    /** Total successfully cooked fish this session (not burnt). */
    cooked = 0;
    bankTrips = 0;
    fishMode = FISH_LOBSTER;
    /** Preference: cook on guild Range before banking. */
    cookOnWay = true;
    /** Preference: mule cooked catch to a named partner at the guild bank. */
    muleOn = false;
    muleUser = DEFAULT_MULE_NAME;
    muleNeed = DEFAULT_MULE_THRESHOLD;
    muled = 0;
    muleTrips = 0;
    muleHandoffActive = false;
    muleReadyToTrade = false;
    muleAnnounced = false;
    nextMuleTradeRequestAtMs = 0;
    lastBankCooked = 0;
    muleBankSeen = false;
    cookingLoad = false;
    lastRawSeen = 0;
    cantReach = false;
    /** @type {Map<string, number>} tileKey → epoch ms until we may retry that hop */
    unreachableUntil = new Map();
    /** @type {{ x: number, z: number, level?: number } | null} */
    lastSpotTile = null;
    /** Which adjacent range-stand tile to use after a failed cook. */
    rangeStandIndex = 0;
    /** Shop names that refused a sell this session (lowercase). */
    sellSkipNames = new Set();
    /** True when the fishing tool was seen in the bank this trip (do not buy another). */
    toolInBank = false;
    /** Consecutive cook loops where the guild Range loc was missing. */
    rangeMisses = 0;
    /** @type {ReturnType<typeof setInterval> | null} */
    unlockTimer = null;

    async onStart() {
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
        this.muled = 0;
        this.muleTrips = 0;
        this.muleHandoffActive = false;
        this.muleReadyToTrade = false;
        this.muleAnnounced = false;
        this.nextMuleTradeRequestAtMs = 0;
        this.lastBankCooked = 0;
        this.muleBankSeen = false;
        this.cookingLoad = false;
        this.lastRawSeen = rawFishCount(this.fishMode);
        this.cantReach = false;
        this.unreachableUntil = new Map();
        this.lastSpotTile = null;
        this.rangeStandIndex = 0;

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

        const fishLvl = Skills.level('fishing');
        const cookLvl = Skills.level('cooking');
        const tool = toolName(this.fishMode);
        const op = isLobsterMode(this.fishMode) ? 'Cage' : 'Harpoon';
        this.log(
            `FishingGuildLobstersSwordfish @ ${ANCHOR.x},${ANCHOR.z} — ${op} on Cage+Harpoon ` +
                `(${this.fishMode}); cook on way: ${this.cookOnWay ? 'on' : 'off'}; ` +
                `mule: ${this.muleWanted() ? `on (≥${this.muleThreshold()} ${muleFishLabel(this.fishMode)} → ${this.mulePartner() || 'set username'})` : 'off'}; ` +
                `range @ ${RANGE_STAND.x},${RANGE_STAND.z}; bank @ ${BANK_STAND.x},${BANK_STAND.z}`
        );
        if (fishLvl < GUILD_LEVEL) {
            this.log(`WARNING: Fishing Guild door needs Fishing ${GUILD_LEVEL} (you have ${fishLvl})`);
        }
        const needFish = isLobsterMode(this.fishMode)
            ? FISH_LEVEL.lobster
            : FISH_LEVEL.swordfish;
        if (fishLvl < needFish) {
            this.log(
                `WARNING: ${this.fishMode.toLowerCase()} need Fishing ${needFish} (you have ${fishLvl})`
            );
        }
        if (this.cookOnWay) {
            if (isLobsterMode(this.fishMode) && cookLvl < COOK_LEVEL.lobster) {
                this.log(
                    `WARNING: cooking lobster needs Cooking ${COOK_LEVEL.lobster} (you have ${cookLvl}) — will bank raw until then`
                );
            } else if (!isLobsterMode(this.fishMode) && cookLvl < COOK_LEVEL.swordfish) {
                this.log(
                    `WARNING: cooking swordfish needs Cooking ${COOK_LEVEL.swordfish} (you have ${cookLvl})` +
                        (cookLvl >= COOK_LEVEL.tuna ? ' — tuna will cook, swordfish banks raw' : ' — will bank raw until then')
                );
            }
        }
        if (this.muleWanted() && !this.cookOnWay) {
            this.log(
                `WARNING: mule trades ${muleFishLabel(this.fishMode)} — turn on Cook on way to bank, or already have cooked fish in the bank`
            );
        }
        if (this.muleWanted() && !this.mulePartner()) {
            this.log('WARNING: mule mode is on but no mule username is set');
        }
        if (hasGear(this.fishMode)) {
            this.log(`${tool} already in inventory / equipped — ready to fish`);
        } else {
            this.log(`no ${tool} — will withdraw from guild bank, loot the hall spawn, or buy from Harry`);
        }
        this.status = hasGear(this.fishMode) ? 'ready' : `start: need ${tool}`;
    }

    startPausedPrefUnlock() {
        unlockPausedPrefsUi();
        this.unlockTimer = setInterval(() => unlockPausedPrefsUi(), 400);
    }

    onStop() {
        if (this.unlockTimer != null) {
            clearInterval(this.unlockTimer);
            this.unlockTimer = null;
        }
        this.log(
            `stopped — ${this.fishMode} caught ${this.caught}, cooked ${this.cooked}, muled ${this.muled}, ` +
                `bank ${this.bankTrips}, mule trips ${this.muleTrips} (${this.status})`
        );
    }

    syncPrefs({ silent = false } = {}) {
        const prevCook = this.cookOnWay;
        const prevMode = this.fishMode;
        const prevMule = this.muleOn;
        const prevUser = this.muleUser;
        const prevNeed = this.muleNeed;
        this.cookOnWay = readPrefBool('cookOnWay', this.settings.bool('cookOnWay', true));
        this.fishMode = normalizeFishMode(
            readPrefStr('fishMode', this.settings.str('fishMode', FISH_LOBSTER))
        );
        this.muleOn = readPrefBool('muleOn', this.settings.bool('muleOn', false));
        this.muleUser = readPrefStr('muleName', this.settings.str('muleName', DEFAULT_MULE_NAME));
        this.muleNeed = clampMuleThreshold(
            readPrefNum('muleThreshold', this.settings.num('muleThreshold', DEFAULT_MULE_THRESHOLD))
        );
        if (!silent && prevCook !== this.cookOnWay) {
            this.log(`prefs: cook on way → ${this.cookOnWay ? 'on' : 'off'}`);
        }
        if (!silent && prevMode !== this.fishMode) {
            this.caught = 0;
            this.cooked = 0;
            this.lastRawSeen = rawFishCount(this.fishMode);
            this.cookingLoad = false;
            this.lastBankCooked = 0;
            this.muleBankSeen = false;
            if (this.muleHandoffActive) {
                this.muleHandoffActive = false;
                this.muleReadyToTrade = false;
                this.log('prefs: fish mode changed — aborting mule handoff');
            }
            this.log(`prefs: fish → ${this.fishMode} (${toolName(this.fishMode)})`);
        }
        if (!silent && prevMule !== this.muleOn) {
            this.log(`prefs: mule mode → ${this.muleOn ? 'on' : 'off'}`);
            if (this.muleOn) {
                this.muleBankSeen = false;
            }
        }
        if (!silent && prevUser !== this.muleUser) {
            this.log(`prefs: mule username → ${this.muleUser || '(empty)'}`);
        }
        if (!silent && prevNeed !== this.muleNeed) {
            this.log(`prefs: mule at ${this.muleNeed} ${muleFishLabel(this.fishMode)}`);
        }
    }

    noteCatches() {
        const now = rawFishCount(this.fishMode);
        if (now > this.lastRawSeen) {
            this.caught += now - this.lastRawSeen;
        }
        this.lastRawSeen = now;
    }

    noteCooked(beforeCooked) {
        const now = cookedFishCount(this.fishMode);
        if (now > beforeCooked) {
            const gained = now - beforeCooked;
            this.cooked += gained;
            return gained;
        }
        return 0;
    }

    async loop() {
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
            if (this.cookingLoad) {
                await this.recoverRangeCantReach();
                return;
            }
            await this.recoverCantReach(this.lastSpotTile);
            return;
        }

        if (ChatDialog.canContinue()) {
            this.status = 'continue dialog';
            await ChatDialog.continue();
            return;
        }

        if (this.muleHandoffActive) {
            if (!this.muleWanted()) {
                await this.resumeFishingAfterMule('mule mode turned off');
                return;
            }
            if (!this.mulePartner()) {
                await this.resumeFishingAfterMule('mule username cleared');
                return;
            }
            await this.muleTick();
            return;
        }

        if (Bank.isOpen()) {
            await Bank.close();
            return;
        }

        if (typeof Shop.isOpen === 'function' && Shop.isOpen()) {
            await Shop.close();
            return;
        }

        if (ChatDialog.isMakeMenu()) {
            await this.chooseCookProduct();
            if (cookableCount(this.fishMode) === 0 && fishForBankCount(this.fishMode) > 0) {
                if (burntCount() > 0) {
                    await this.dropBurnt();
                }
                this.cookingLoad = false;
                await this.bankAndReturn();
            }
            return;
        }

        const tool = toolName(this.fishMode);
        if (!hasGear(this.fishMode)) {
            if (await this.lootToolFromGround()) {
                this.log(`looted ${tool}`);
                return;
            }
            this.status = `need ${tool}`;
            this.log(`missing ${tool} — bank first, then Harry if needed`);
            await this.bankAndReturn();
            if (!hasGear(this.fishMode) && (await this.lootToolFromGround({ wide: true }))) {
                this.log(`looted ${tool} from entrance hall`);
            }
            if (!hasGear(this.fishMode)) {
                await this.acquireMissingTool();
            }
            return;
        }

        if (this.muleWanted() && !this.muleBankSeen) {
            this.status = 'mule: snapshot bank';
            this.log(
                `mule on — opening bank to count ${muleFishLabel(this.fishMode)} (handoff at ≥${this.muleThreshold()}` +
                    (this.mulePartner() ? ` → ${this.mulePartner()}` : ', set a mule username') +
                    ')'
            );
            await this.bankAndReturn();
            return;
        }

        if (this.cookingLoad && !this.cookOnWay) {
            this.cookingLoad = false;
            if (fishForBankCount(this.fishMode) > 0) {
                await this.bankAndReturn();
            }
            return;
        }

        if (this.cookingLoad && cookableCount(this.fishMode) > 0) {
            await this.cookLoad();
            return;
        }

        if (this.cookingLoad && cookableCount(this.fishMode) === 0) {
            if (burntCount() > 0) {
                await this.dropBurnt();
            }
            this.cookingLoad = false;
            if (fishForBankCount(this.fishMode) > 0) {
                await this.bankAndReturn();
            }
            return;
        }

        if (Inventory.isFull()) {
            if (this.cookOnWay && cookableCount(this.fishMode) > 0) {
                this.cookingLoad = true;
                this.log(
                    `full inv (${cookableCount(this.fishMode)} cookable / ${rawFishCount(this.fishMode)} raw) — cooking at 2615,3396`
                );
                await this.cookLoad();
                return;
            }
            if (fishForBankCount(this.fishMode) > 0 || Inventory.used() > 1) {
                if (this.cookOnWay && rawFishCount(this.fishMode) > 0 && cookableCount(this.fishMode) === 0) {
                    this.log(
                        `full inv — Cooking ${Skills.level('cooking')} too low for this load, banking raw`
                    );
                }
                await this.bankAndReturn();
                return;
            }
        }

        if (
            this.muleWanted() &&
            this.mulePartner() &&
            this.lastBankCooked >= this.muleThreshold()
        ) {
            this.log(
                `mule: last bank ${this.lastBankCooked}/${this.muleThreshold()} cooked — starting handoff`
            );
            this.beginMuleHandoff();
            await this.muleTick();
            return;
        }

        if (!(await this.enterGuild())) {
            return;
        }

        const here = Game.tile();
        if (!here) {
            await Execution.delayTicks(2);
            return;
        }

        if (Tile.from(here).distanceTo(ANCHOR) > LEASH) {
            this.status = 'returning to docks';
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
            this.status = 'waiting for Cage+Harpoon spot';
            if (Tile.from(here).distanceTo(ANCHOR) > STAND_RADIUS) {
                await Traversal.walkTo(ANCHOR, { radius: 2, timeoutMs: 12_000 });
            }
            await Execution.delayTicks(3);
            return;
        }

        await this.fishSpot(spot);
    }

    markSpotUnreachable(tile) {
        const key = tileKey(tile);
        if (!key) {
            return;
        }
        this.unreachableUntil.set(key, Date.now() + UNREACHABLE_MS);
    }

    isSpotBlacklisted(tile) {
        const key = tileKey(tile);
        if (!key) {
            return false;
        }
        return Date.now() < (this.unreachableUntil.get(key) ?? 0);
    }

    spotIsFishable(tile) {
        if (!tile) {
            return false;
        }
        const t = Tile.from(tile);
        if ((t.level ?? 0) !== 0) {
            return false;
        }
        if (!insideGuild(t)) {
            return false;
        }
        if (t.distanceTo(ANCHOR) > LEASH) {
            return false;
        }
        return !this.isSpotBlacklisted(t);
    }

    async recoverCantReach(spotTile) {
        const here = Game.tile();
        this.cantReach = false;
        if (spotTile) {
            this.markSpotUnreachable(spotTile);
        }
        this.log(
            `can't reach that @ ${here?.x},${here?.z}` +
                (spotTile ? ` (spot ${spotTile.x},${spotTile.z} blacklisted)` : '')
        );
        this.status = 'returning to docks';
        await Traversal.walkResilient(ANCHOR, {
            radius: 3,
            log: m => this.log(`  ${m}`)
        });
    }

    async enterGuild() {
        if (insideGuild()) {
            return true;
        }
        if (Skills.level('fishing') < GUILD_LEVEL) {
            this.status = 'need Fishing 68';
            this.log(
                `cannot enter Fishing Guild — need Fishing ${GUILD_LEVEL} (you have ${Skills.level('fishing')})`
            );
            await Execution.delayTicks(8);
            return false;
        }

        this.status = 'entering guild';
        this.log(`outside guild — walking to doors @ ${GUILD_GATE_OUT.x},${GUILD_GATE_OUT.z}`);
        await Traversal.walkResilient(GUILD_GATE_OUT, {
            radius: 1,
            log: m => this.log(`  ${m}`)
        });

        const door =
            Locs.query()
                .where(l => isDoorName(l))
                .where(l => {
                    const t = locTile(l);
                    return t && Tile.from(t).distanceTo(GUILD_DOOR_TILE) <= 3;
                })
                .nearest() ??
            Locs.query()
                .where(l => isShutDoor(l))
                .where(l => l.distance() <= 4)
                .nearest();
        const op = door ? openDoorOp(door) : null;
        if (door && op) {
            this.log(`opening ${door.name ?? 'guild door'}`);
            await door.interact(op);
            await Execution.delayTicks(2);
        }

        await Traversal.walkResilient(GUILD_GATE_IN, {
            radius: 2,
            log: m => this.log(`  ${m}`)
        });

        if (!insideGuild()) {
            this.log('still outside Fishing Guild — retrying');
            await Execution.delayTicks(3);
            return false;
        }
        return true;
    }

    async leaveGuild() {
        if (!insideGuild()) {
            return true;
        }
        this.status = 'leaving guild';
        this.log(`leaving guild — walking to doors @ ${GUILD_GATE_IN.x},${GUILD_GATE_IN.z}`);
        await Traversal.walkResilient(GUILD_GATE_IN, {
            radius: 2,
            log: m => this.log(`  ${m}`)
        });

        const door =
            Locs.query()
                .where(l => isDoorName(l))
                .where(l => {
                    const t = locTile(l);
                    return t && Tile.from(t).distanceTo(GUILD_DOOR_TILE) <= 3;
                })
                .nearest() ??
            Locs.query()
                .where(l => isShutDoor(l))
                .where(l => l.distance() <= 4)
                .nearest();
        const op = door ? openDoorOp(door) : null;
        if (door && op) {
            this.log(`opening ${door.name ?? 'guild door'}`);
            await door.interact(op);
            await Execution.delayTicks(2);
        }

        await Traversal.walkResilient(GUILD_GATE_OUT, {
            radius: 1,
            log: m => this.log(`  ${m}`)
        });

        if (insideGuild()) {
            this.log('still inside Fishing Guild — retrying leave');
            await Execution.delayTicks(3);
            return false;
        }
        return true;
    }

    findCageSpot() {
        return Npcs.query()
            .name(SPOT_NAME)
            .where(n => isCageHarpoonSpot(n.actions()))
            .where(n => this.spotIsFishable(n.tile()))
            .nearest();
    }

    async fishSpot(spot) {
        const actions = spot.actions();
        const op = isLobsterMode(this.fishMode) ? cageOp(actions) : harpoonOp(actions);
        if (!op) {
            await Execution.delayTicks(2);
            return;
        }

        const before = rawFishCount(this.fishMode);
        const st = spot.tile();
        this.cantReach = false;
        this.lastSpotTile = st;
        const verb = isLobsterMode(this.fishMode) ? 'caging' : 'harpooning';
        this.status = `${verb} (${spot.distance()}t)`;
        this.log(`${op} ${this.fishMode.toLowerCase()} spot @ ${st.x},${st.z}`);
        await spot.interact(op);

        await Execution.delayUntil(
            () =>
                rawFishCount(this.fishMode) > before ||
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
    }

    async lootToolFromGround({ wide = false } = {}) {
        if (hasGear(this.fishMode)) {
            return true;
        }
        const name = toolName(this.fishMode);
        const match = n => (isLobsterMode(this.fishMode) ? isPotName(n) : isHarpoonName(n));
        const within = wide ? 18 : 12;
        const ground =
            GroundItems.query().name(name).within(within).nearest() ??
            GroundItems.query()
                .where(g => match(g.name))
                .within(within)
                .nearest();
        if (!ground) {
            return false;
        }
        const before = Inventory.used();
        this.log(`taking ${ground.name ?? name} from ground`);
        await ground.interact('Take');
        return (
            (await Execution.delayUntil(
                () => hasGear(this.fishMode) || Inventory.used() > before,
                6000
            )) && hasGear(this.fishMode)
        );
    }

    findRange() {
        return pickGuildRange();
    }

    currentRangeStand() {
        const tiles = rangeUseTiles();
        return tiles[Math.abs(this.rangeStandIndex) % tiles.length] ?? RANGE_STAND;
    }

    async openNearbyDoor() {
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

    findShutRangeDoor() {
        return Locs.query()
            .where(l => isShutDoor(l))
            .where(l => {
                const t = locTile(l);
                return t && Tile.from(t).distanceTo(RANGE_LOC) <= 2;
            })
            .nearest();
    }

    /** Normal Open on the range-house door — no packet spam. */
    async ensureRangeDoorOpen({ walk = true } = {}) {
        const door = this.findShutRangeDoor();
        if (!door) {
            return true;
        }
        const dt = locTile(door);
        const op = openDoorOp(door);
        if (!op) {
            return false;
        }
        if (walk && door.distance() > 2) {
            this.log(
                `walking to range door${dt ? ` @ ${dt.x},${dt.z}` : ''} @ ${RANGE_STAND.x},${RANGE_STAND.z}`
            );
            await Traversal.walkResilient(RANGE_STAND, {
                radius: 1,
                log: m => this.log(`  ${m}`)
            });
        }
        if (door.distance() > 3) {
            return false;
        }
        this.log(`opening ${door.name}${dt ? ` @ ${dt.x},${dt.z}` : ''}`);
        await door.interact(op);
        await Execution.delayUntil(() => !this.findShutRangeDoor(), 4000);
        await Execution.delayTicks(1);
        return !this.findShutRangeDoor();
    }

    async recoverRangeCantReach() {
        const here = Game.tile();
        this.cantReach = false;
        this.rangeStandIndex++;
        const next = this.currentRangeStand();
        this.log(
            `can't reach range @ ${here?.x},${here?.z} — opening door, standing ${next.x},${next.z}`
        );
        await this.ensureRangeDoorOpen({ walk: true });
        if (!onExactTile(next)) {
            await Traversal.walkTo(next, { radius: 0, timeoutMs: 8_000 });
        }
        await Execution.delayTicks(1);
    }

    /** @returns {Promise<boolean>} true if standing at the cook range (2615,3396) */
    async walkToRange() {
        this.status = 'walking to range';
        if (!(await this.enterGuild())) {
            return false;
        }

        const stand = RANGE_STAND;
        const here = Game.tile();
        if (here && (onExactTile(stand, here) || Tile.from(here).distanceTo(stand) <= 1)) {
            return true;
        }

        this.log(`walking to Range stand ${stand.x},${stand.z}`);
        await Traversal.walkResilient(stand, {
            radius: 0,
            log: m => this.log(`  ${m}`)
        });
        await Execution.delayTicks(1);

        const arrived = Game.tile();
        if (arrived && Tile.from(arrived).distanceTo(stand) <= 1) {
            return true;
        }
        this.log(`not at Range yet @ ${arrived?.x},${arrived?.z} — will retry`);
        return false;
    }

    async chooseCookProduct() {
        const mode = this.fishMode;
        const products = ChatDialog.makeProducts();
        const raw = lastCookableRaw(mode);
        const hint = matchCookProduct(products, raw?.name, mode);
        const kind = fishKind(hint) || fishKind(raw?.name);
        const frag = kind ?? null;
        const batch = frag
            ? Math.max(1, Math.min(countCookableNamed(frag, mode), 28))
            : Math.max(1, Math.min(cookableCount(mode), 28));
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
            frag ? countCookableNamed(frag, mode) > 0 : cookableCount(mode) > 0;

        await Execution.delayUntil(
            () => !ChatDialog.isMakeMenu() && (Game.animating() || !stillThisType()),
            5000
        );

        let cookedMark = cookedFishCount(mode);
        let idle = 0;
        for (let guard = 0; guard < 400 && stillThisType(); guard++) {
            if (ChatDialog.canContinue() || ChatDialog.isMakeMenu()) {
                this.noteCooked(cookedMark);
                return;
            }
            await Execution.delayTicks(1);
            if (this.noteCooked(cookedMark) > 0) {
                cookedMark = cookedFishCount(mode);
                idle = 0;
            } else if (!Game.animating() && ++idle >= 14) {
                break;
            } else if (Game.animating()) {
                idle = 0;
            }
        }
        this.noteCooked(cookedMark);
    }

    async cookLoad() {
        const mode = this.fishMode;
        if (cookableCount(mode) === 0) {
            this.cookingLoad = false;
            return;
        }

        const here = Game.tile();
        let oven = this.findRange();
        if (!here || !atCookRange(here)) {
            if (!(await this.walkToRange())) {
                return;
            }
            oven = this.findRange();
        }
        if (!atCookRange()) {
            return;
        }
        if (!oven) {
            this.rangeMisses++;
            const nearby = nearbyLocSummary();
            this.log(
                `Range loc missing — staying put to cook` +
                    (nearby ? ` (locs: ${nearby})` : '')
            );
            await Execution.delayTicks(2);
            return;
        }
        this.rangeMisses = 0;

        if (ChatDialog.isMakeMenu()) {
            await this.chooseCookProduct();
            if (cookableCount(mode) === 0) {
                if (burntCount() > 0) {
                    await this.dropBurnt();
                }
                this.cookingLoad = false;
                await this.bankAndReturn();
            }
            return;
        }

        await this.ensureRangeDoorOpen({ walk: false });

        const raw = lastCookableRaw(mode);
        if (!raw) {
            this.cookingLoad = false;
            return;
        }

        const beforeCookable = cookableCount(mode);
        let cookedMark = cookedFishCount(mode);
        const beforeXp = Skills.xp('cooking');
        const ovenTile = locTile(oven);
        if (ovenTile && Tile.from(ovenTile).distanceTo(RANGE_LOC) > RANGE_LEASH) {
            this.log(
                `ignoring Range @ ${ovenTile.x},${ovenTile.z} — not the cook range`
            );
            return;
        }
        this.status = `cooking ${raw.name}`;
        this.log(
            `use ${raw.name} on ${locName(oven) || 'Range'}` +
                `${ovenTile ? ` @ ${ovenTile.x},${ovenTile.z}` : ''} ` +
                `(stand ${Game.tile()?.x},${Game.tile()?.z}, ${beforeCookable} cookable, cook lvl ${Skills.level('cooking')})`
        );

        if (!(await raw.useOn(oven))) {
            await this.ensureRangeDoorOpen({ walk: true });
            this.rangeStandIndex++;
            await Execution.delayTicks(2);
            return;
        }

        const started = await Execution.delayUntil(
            () =>
                cookableCount(mode) < beforeCookable ||
                Skills.xp('cooking') > beforeXp ||
                ChatDialog.isMakeMenu() ||
                ChatDialog.canContinue(),
            8000
        );

        if (ChatDialog.isMakeMenu()) {
            await this.chooseCookProduct();
            if (cookableCount(mode) === 0) {
                if (burntCount() > 0) {
                    await this.dropBurnt();
                }
                this.cookingLoad = false;
                await this.bankAndReturn();
            }
            return;
        }

        if (!started && cookableCount(mode) >= beforeCookable) {
            this.rangeStandIndex++;
            const next = this.currentRangeStand();
            this.log(`cook did not start — opening door, standing ${next.x},${next.z}`);
            await this.ensureRangeDoorOpen({ walk: true });
            if (!onExactTile(next)) {
                await Traversal.walkTo(next, { radius: 0, timeoutMs: 8_000 });
            }
            await Execution.delayTicks(1);
            return;
        }

        let mark = cookableCount(mode);
        let idle = 0;
        for (let guard = 0; guard < 400 && cookableCount(mode) > 0; guard++) {
            if (ChatDialog.canContinue() || ChatDialog.isMakeMenu()) {
                this.noteCooked(cookedMark);
                return;
            }
            await Execution.delayTicks(1);
            if (this.noteCooked(cookedMark) > 0) {
                cookedMark = cookedFishCount(mode);
            }
            const now = cookableCount(mode);
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

        if (cookableCount(mode) === 0) {
            if (burntCount() > 0) {
                await this.dropBurnt();
            }
            this.cookingLoad = false;
            await this.bankAndReturn();
        }
    }

    async dropBurnt() {
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

    async bankAndReturn() {
        const mode = this.fishMode;
        const tool = toolName(mode);
        const raw = rawFishCount(mode);
        const cooked = cookedFishCount(mode);
        this.status = 'banking';
        this.log(
            `banking` +
                (raw ? ` ${raw} raw` : '') +
                (cooked ? ` ${cooked} cooked` : '') +
                (burntCount() ? ` ${burntCount()} burnt` : '') +
                ` — restock ${tool}`
        );

        this.lastRawSeen = 0;

        const atRange =
            Game.tile() && Tile.from(Game.tile()).distanceTo(RANGE_LOC) <= 8;
        if (atRange) {
            await this.ensureRangeDoorOpen({ walk: true });
        }

        if (!(await this.enterGuild())) {
            return;
        }

        await Banking.bankNearest({
            destination: { name: 'Fishing Guild', tile: BANK_STAND },
            deposit: name => !isKeepOnDeposit(name),
            afterDeposit: async () => {
                await this.restockToolFromOpenBank();
                this.snapshotBankMuleFish();
            },
            returnTo: null,
            log: m => this.log(`  ${m}`)
        });

        this.bankTrips++;
        this.cookingLoad = false;
        this.lastRawSeen = rawFishCount(this.fishMode);
        if (Bank.isOpen()) {
            this.snapshotBankMuleFish();
        }
        this.muleBankSeen = true;

        if (!hasGear(this.fishMode)) {
            this.log(`no ${tool} in inventory — trying entrance-hall spawn`);
            await this.walkToRange();
            if (await this.lootToolFromGround({ wide: true })) {
                this.log(`looted ${tool} from entrance hall`);
            }
        }

        if (!hasGear(this.fishMode) && !this.toolInBank) {
            await this.acquireMissingTool();
            return;
        }
        if (!hasGear(this.fishMode)) {
            this.log(`${tool} is in the bank — will withdraw next trip, not buying another`);
            return;
        }

        if (this.maybeBeginMuleFromBank()) {
            return;
        }

        this.status = 'returning to docks';
        this.log(`gear ready — ${tool}`);
        await Traversal.walkResilient(ANCHOR, {
            radius: 3,
            log: m => this.log(`  ${m}`)
        });
    }

    /** Dump inventory except fishing equipment (harpoon, pot, nets, rods, bait). Never depositInventory — that dumps the kit. */
    async depositEverythingOpenBank() {
        if (!Bank.isOpen()) {
            return;
        }
        this.log('depositing inventory (keeping fishing equipment)');
        if (typeof Bank.depositAllMatching === 'function') {
            await Bank.depositAllMatching(name => !isKeepOnDeposit(name));
            await Execution.delayTicks(1);
        }
        if (typeof Bank.deposit === 'function') {
            for (const name of junkInvNames()) {
                this.log(`depositing ${name}`);
                await Bank.deposit(name, 'Deposit-All');
                await Execution.delayTicks(1);
            }
        }
        const leftover = junkInvNames();
        if (leftover.length > 0) {
            this.log(`still holding after deposit: ${leftover.join(', ')}`);
        }
    }

    async unequipWornNonTool() {
        if (typeof Equipment.items !== 'function' || typeof Equipment.unequip !== 'function') {
            return;
        }
        for (const worn of Equipment.items()) {
            const name = worn.name;
            if (!name || isKeepOnDeposit(name)) {
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
    }

    async restockToolFromOpenBank() {
        const mode = this.fishMode;
        if (!Bank.isOpen()) {
            return hasGear(mode);
        }
        await this.depositEverythingOpenBank();
        await this.unequipWornNonTool();
        if (junkInvNames().length > 0) {
            await this.depositEverythingOpenBank();
        }
        if (hasGear(mode)) {
            this.log(`already have ${toolName(mode)} — not withdrawing another`);
            return true;
        }
        return await this.withdrawToolFromOpenBank();
    }

    /** @returns {Promise<boolean>} true if the mode's tool is in inventory / equipped after */
    async withdrawToolFromOpenBank() {
        const mode = this.fishMode;
        if (!Bank.isOpen()) {
            return hasGear(mode);
        }
        await Execution.delayUntil(() => Bank.loaded() || !Bank.isOpen(), 3000);
        if (!Bank.isOpen()) {
            return hasGear(mode);
        }

        this.toolInBank = false;
        if (hasGear(mode)) {
            return true;
        }

        const wantName = toolName(mode);
        const toolBank = isLobsterMode(mode)
            ? Bank.items().find(i => isPotName(i.name))
            : (Bank.items().find(i => (i.name ?? '').toLowerCase() === 'harpoon') ??
              Bank.items().find(i => isHarpoonName(i.name)));
        if (toolBank) {
            this.toolInBank = true;
            const name = toolBank.name ?? wantName;
            const op =
                (typeof withdrawOp === 'function' ? withdrawOp(toolBank.ops, '1') : null) ??
                'Withdraw-1';
            this.log(`withdrawing ${name}`);
            await Bank.withdraw(name, op);
            await Execution.delayTicks(1);
            if (hasGear(mode)) {
                return true;
            }
            this.log(`${wantName} is in the bank — not buying another`);
            return false;
        }

        this.log(`WARNING: no ${wantName} in bank`);
        const cost = toolCost(mode);
        await this.withdrawCoinsFromOpenBank(cost);
        if (coinCount() < cost) {
            await this.withdrawSellableFromOpenBank();
        }
        return hasGear(mode);
    }

    async withdrawCoinsFromOpenBank(need) {
        const short = Math.max(0, need - coinCount());
        if (!Bank.isOpen() || short <= 0) {
            return coinCount() >= need;
        }
        const bankGp = Bank.count('Coins') || 0;
        if (bankGp <= 0) {
            this.log(`WARNING: no Coins in bank for Harry`);
            return coinCount() >= need;
        }
        const take = Math.min(short, bankGp);
        const tool = toolName(this.fishMode);
        this.log(`withdrawing ${take} Coins for Harry ${tool}`);
        await Bank.withdrawX('Coins', take);
        await Execution.delayTicks(1);
        return coinCount() >= need;
    }

    pickBankSellItem() {
        if (!Bank.isOpen()) {
            return null;
        }
        const skip = this.sellSkipNames ?? new Set();
        const rows = Bank.items().filter(i => {
            const name = (i.name ?? '').trim();
            if (!name || isSellForbidden(name)) {
                return false;
            }
            if (skip.has(name.toLowerCase())) {
                return false;
            }
            return Math.max(1, i.count) > 0;
        });
        if (rows.length === 0) {
            return null;
        }
        rows.sort((a, b) => {
            const an = /noted/i.test(a.name ?? '') ? 1 : 0;
            const bn = /noted/i.test(b.name ?? '') ? 1 : 0;
            if (bn !== an) {
                return bn - an;
            }
            return Math.max(1, b.count) - Math.max(1, a.count);
        });
        return rows[0];
    }

    pickInvSellItem() {
        const skip = this.sellSkipNames ?? new Set();
        return (
            Inventory.items().find(i => {
                const name = (i.name ?? '').trim();
                if (!name || isSellForbidden(name) || isKeepOnDeposit(name)) {
                    return false;
                }
                return !skip.has(name.toLowerCase());
            }) ?? null
        );
    }

    async withdrawSellableFromOpenBank() {
        if (!Bank.isOpen()) {
            return false;
        }
        if (this.pickInvSellItem()) {
            return true;
        }
        const row = this.pickBankSellItem();
        if (!row) {
            this.log('WARNING: bank has nothing to sell for Harry');
            return false;
        }
        const name = row.name;
        const take = Math.min(10, Math.max(1, row.count));
        this.log(`withdrawing ${take}× ${name} to sell at a general store`);
        if (typeof Bank.setNoteMode === 'function') {
            await Bank.setNoteMode(true);
            await Execution.delayTicks(1);
        }
        let ok = false;
        if (typeof Bank.withdrawX === 'function') {
            ok = !!(await Bank.withdrawX(name, take));
        }
        if (!ok) {
            const op =
                (typeof withdrawOp === 'function' ? withdrawOp(row.ops, '10') : null) ??
                'Withdraw-10';
            ok = !!(await Bank.withdraw(name, op));
        }
        if (typeof Bank.setNoteMode === 'function') {
            await Bank.setNoteMode(false);
        }
        await Execution.delayTicks(1);
        return !!this.pickInvSellItem();
    }

    /**
     * Bank / spawn already failed — buy the fishing tool from Harry.
     * If coins are short, sell a bank item at Arhein (Catherby) first.
     */
    async acquireMissingTool() {
        const mode = this.fishMode;
        const tool = toolName(mode);
        const cost = toolCost(mode);
        if (hasGear(mode)) {
            this.log(`already have ${tool} — not buying another`);
            return true;
        }

        for (let attempt = 0; attempt < 3 && !hasGear(mode) && coinCount() < cost; attempt++) {
            if (!this.pickInvSellItem()) {
                await this.bankForHarryFunds();
            }
            if (hasGear(mode)) {
                this.log(`already have ${tool} — not buying another`);
                return true;
            }
            if (this.pickInvSellItem()) {
                await this.sellAtGeneralStore();
            } else {
                break;
            }
        }

        if (hasGear(mode)) {
            this.log(`already have ${tool} — not buying another`);
            return true;
        }
        if (this.toolInBank) {
            this.log(`${tool} is in the bank — not buying another`);
            this.status = `need ${tool.toLowerCase()} withdraw`;
            await Execution.delayTicks(4);
            return false;
        }

        if (coinCount() >= cost) {
            return await this.buyToolFromHarryAndReturn();
        }

        this.log(
            `WARNING: cannot afford ${tool} — put coins or something sellable in the guild bank`
        );
        this.status = 'need coins';
        await Execution.delayTicks(8);
        return false;
    }

    async bankForHarryFunds() {
        const mode = this.fishMode;
        const cost = toolCost(mode);
        if (!insideGuild() && !(await this.enterGuild())) {
            return;
        }
        this.status = 'banking for Harry';
        await Banking.bankNearest({
            destination: { name: 'Fishing Guild', tile: BANK_STAND },
            deposit: name => {
                if (isKeepOnDeposit(name) || isCoins(name)) {
                    return false;
                }
                const sell = this.pickInvSellItem();
                if (sell && name === sell.name) {
                    return false;
                }
                return true;
            },
            afterDeposit: async () => {
                await Execution.delayUntil(() => Bank.loaded() || !Bank.isOpen(), 3000);
                if (!Bank.isOpen()) {
                    return;
                }
                if (await this.withdrawToolFromOpenBank()) {
                    return;
                }
                if (this.toolInBank) {
                    return;
                }
                await this.withdrawCoinsFromOpenBank(cost);
                if (coinCount() >= cost) {
                    return;
                }
                await this.withdrawSellableFromOpenBank();
            },
            returnTo: null,
            log: m => this.log(`  ${m}`)
        });
    }

    async sellAtGeneralStore() {
        const item = this.pickInvSellItem();
        if (!item) {
            return false;
        }
        await this.leaveGuild();
        const here = Game.tile();
        const arhein = GENERAL_STORES.find(s => s.keeper === 'Arhein');
        const store = arhein ?? nearestGeneralStore(here);
        this.status = `walking to ${store.label}`;
        this.log(`selling ${item.name} at ${store.label} for Harry coins`);
        await Traversal.walkResilient(store.stand, {
            radius: 3,
            log: m => this.log(`  ${m}`)
        });
        await this.openNearbyDoor();
        if (!(await Shop.open(store.keeper))) {
            if (store.alt) {
                await Shop.open(store.alt);
            }
        }
        if (!Shop.isOpen()) {
            this.log(`could not open ${store.keeper} — retrying next loop`);
            await Execution.delayTicks(3);
            return false;
        }

        const cost = toolCost(this.fishMode);
        let soldAny = false;
        for (let n = 0; n < 6 && coinCount() < cost; n++) {
            const next = this.pickInvSellItem();
            if (!next) {
                break;
            }
            const name = next.name;
            const want = Math.min(10, Math.max(1, next.count));
            this.status = `selling ${want}× ${name}`;
            const sold = await Shop.sell(name, want);
            if (sold <= 0) {
                this.sellSkipNames.add(name.toLowerCase());
                this.log(`shop would not buy ${name}`);
                break;
            }
            soldAny = true;
            this.log(`sold ${sold}× ${name} — now ${coinCount()}gp`);
            await Execution.delayTicks(1);
        }
        if (Shop.isOpen()) {
            await Shop.close();
        }
        return soldAny && coinCount() >= cost;
    }

    async buyToolFromHarryAndReturn() {
        const mode = this.fishMode;
        const tool = toolName(mode);
        const cost = toolCost(mode);
        if (hasGear(mode)) {
            this.log(`already have ${tool} — not buying another`);
            this.status = 'returning to docks';
            if (await this.enterGuild()) {
                await Traversal.walkResilient(ANCHOR, {
                    radius: 3,
                    log: m => this.log(`  ${m}`)
                });
            }
            return true;
        }

        if (coinCount() < cost) {
            this.log(`need ${cost}gp for ${tool} (have ${coinCount()})`);
            return false;
        }

        this.status = `walking to Harry (${tool.toLowerCase()})`;
        this.log(`buying ${tool} from Harry (${cost}gp)`);
        await this.leaveGuild();
        await Traversal.walkResilient(HARRY_STAND, {
            radius: 2,
            log: m => this.log(`  ${m}`)
        });
        await this.openNearbyDoor();

        this.status = `buying ${tool.toLowerCase()}`;
        if (!(await Shop.open(HARRY_NAME))) {
            this.log(`could not open Harry for ${tool.toLowerCase()} — retrying next loop`);
            await Execution.delayTicks(3);
            return false;
        }

        if (coinCount() >= cost && !hasGear(mode)) {
            this.log(`Shop.buy 1× ${tool}`);
            const bought = await Shop.buy(tool, 1);
            if (bought > 0) {
                this.log(`bought ${bought}× ${tool} from Harry`);
            } else {
                this.log(`Harry had no ${tool} / buy failed`);
            }
        }

        if (Shop.isOpen()) {
            await Shop.close();
        }

        if (!hasGear(mode)) {
            this.log(`WARNING: still no ${tool} after Harry — need coins or shop stock`);
            this.status = `need ${tool.toLowerCase()}`;
            await Execution.delayTicks(8);
            return false;
        }

        this.sellSkipNames = new Set();
        this.log(`bought ${tool} — returning to docks`);
        this.lastRawSeen = rawFishCount(mode);
        this.status = 'returning to docks';
        if (!(await this.enterGuild())) {
            return true;
        }
        await Traversal.walkResilient(ANCHOR, {
            radius: 3,
            log: m => this.log(`  ${m}`)
        });
        return true;
    }

    muleWanted() {
        return this.muleOn === true;
    }

    mulePartner() {
        return (this.muleUser ?? '').trim();
    }

    muleThreshold() {
        return clampMuleThreshold(this.muleNeed);
    }

    snapshotBankMuleFish() {
        if (!Bank.isOpen()) {
            return false;
        }
        this.lastBankCooked = this.bankCookedCount();
        this.muleBankSeen = true;
        return true;
    }

    bankCookedCount() {
        const mode = this.fishMode;
        const names = muleFishNames(mode);
        const items = Bank.items?.() ?? [];
        const fromItems = items
            .filter(i => isMuleFish(i.name, mode))
            .reduce((n, i) => n + Math.max(1, i.count), 0);
        let fromCount = 0;
        if (typeof Bank.count === 'function') {
            fromCount = names.reduce((n, name) => n + (Bank.count(name) || 0), 0);
        }
        return Math.max(fromItems, fromCount);
    }

    cookedAvailableCount() {
        const mode = this.fishMode;
        const banked = Bank.isOpen() ? this.bankCookedCount() : this.lastBankCooked;
        return banked + notedMuleFishCount(mode) + unnotedMuleFishCount(mode);
    }

    beginMuleHandoff({ alreadyAtBank = false } = {}) {
        if (this.muleHandoffActive) {
            return;
        }
        this.muleHandoffActive = true;
        this.muleReadyToTrade = false;
        this.muleAnnounced = false;
        this.nextMuleTradeRequestAtMs = 0;
        this.log(
            `mule: handoff ≥${this.muleThreshold()} ${muleFishLabel(this.fishMode)} to ${this.mulePartner()}` +
                (alreadyAtBank ? ' — already at bank' : '')
        );
        this.status = 'mule: start handoff';
    }

    maybeBeginMuleFromBank() {
        if (!this.muleWanted()) {
            return false;
        }
        if (!this.mulePartner()) {
            this.log('mule: no username set — skipping handoff');
            return false;
        }
        if (Bank.isOpen()) {
            this.snapshotBankMuleFish();
        }
        const cooked = Bank.isOpen() ? this.bankCookedCount() : this.lastBankCooked;
        this.log(`mule: bank cooked ${cooked}/${this.muleThreshold()}`);
        if (cooked < this.muleThreshold()) {
            return false;
        }
        this.beginMuleHandoff({ alreadyAtBank: true });
        return true;
    }

    async resumeFishingAfterMule(reason) {
        this.muleHandoffActive = false;
        this.muleReadyToTrade = false;
        this.muleAnnounced = false;
        this.lastRawSeen = rawFishCount(this.fishMode);
        this.log(`mule: ${reason} — resuming ${this.fishMode.toLowerCase()} fishing`);
        if (!hasGear(this.fishMode)) {
            this.status = 'mule: restock tool';
            await this.bankAndReturn();
            return;
        }
        if (fishForBankCount(this.fishMode) > 0) {
            await this.bankAndReturn();
            return;
        }
        this.status = 'returning to docks';
        await Traversal.walkResilient(ANCHOR, {
            radius: 3,
            log: m => this.log(`  ${m}`)
        });
    }

    bankCountByName(name) {
        const want = (name ?? '').toLowerCase();
        const items = Bank.items?.() ?? [];
        const fromItems = items
            .filter(i => (i.name ?? '').toLowerCase() === want)
            .reduce((n, i) => n + Math.max(1, i.count), 0);
        if (fromItems > 0) {
            return fromItems;
        }
        if (typeof Bank.count === 'function') {
            return Bank.count(name) || 0;
        }
        return 0;
    }

    notedWithdrawAllOp(bankItem) {
        const ops = Array.isArray(bankItem?.ops) ? bankItem.ops : [];
        const noteAll = ops.find(a =>
            /withdraw/i.test(String(a)) && /note|cert/i.test(String(a))
        );
        if (noteAll) {
            return noteAll;
        }
        if (typeof withdrawOp === 'function') {
            return withdrawOp(ops, 'all') ?? withdrawOp(ops, 'any') ?? null;
        }
        return ops.find(a => /withdraw-?all/i.test(String(a))) ?? 'Withdraw-All';
    }

    async ensureBankNoteMode(on) {
        if (typeof Bank.setNoteMode !== 'function') {
            this.log('WARNING: Bank.setNoteMode missing — noted withdraw may fail');
            return false;
        }
        await Bank.setNoteMode(on);
        await Execution.delayTicks(2);
        if (typeof Bank.noteMode === 'function' && Bank.noteMode() !== on) {
            await Bank.setNoteMode(on);
            await Execution.delayTicks(2);
        }
        return typeof Bank.noteMode !== 'function' || Bank.noteMode() === on;
    }

    async depositUnnotedMuleFish(reason) {
        const mode = this.fishMode;
        const n = unnotedMuleFishCount(mode);
        if (n <= 0) {
            return false;
        }
        this.log(`mule: ${reason} (${n} unnoted) — depositing, will withdraw as notes`);
        if (typeof Bank.depositAllMatching === 'function') {
            await Bank.depositAllMatching((name, id) => isUnnotedMuleFishDeposit(name, id, mode));
        }
        await Execution.delayTicks(1);
        return true;
    }

    async withdrawAllMuleFishNoted() {
        const mode = this.fishMode;
        const banked = this.bankCookedCount();
        if (banked <= 0) {
            return true;
        }

        this.log(`mule: withdrawing ALL ${muleFishLabel(mode)} as notes (${banked})`);
        await this.ensureBankNoteMode(true);

        for (const name of muleFishNames(mode)) {
            if (!Bank.isOpen()) {
                return false;
            }
            const have = this.bankCountByName(name);
            if (have <= 0) {
                continue;
            }
            const bankItem =
                (Bank.items?.() ?? []).find(
                    i => (i.name ?? '').toLowerCase() === name.toLowerCase()
                ) ?? null;
            const op = this.notedWithdrawAllOp(bankItem);
            this.log(`mule: ${op || 'Withdraw-All'} ${have}× ${name} (note mode)`);

            let ok = false;
            if (typeof Bank.withdraw === 'function' && op) {
                ok = !!(await Bank.withdraw(name, op));
            }
            if (!ok && typeof Bank.withdraw === 'function') {
                ok = !!(await Bank.withdraw(name, 'Withdraw-All'));
            }
            if (!ok && typeof Bank.withdrawById === 'function' && bankItem?.id != null && op) {
                ok = !!(await Bank.withdrawById(bankItem.id, op));
            }
            if (!ok && typeof Bank.withdrawX === 'function') {
                ok = !!(await Bank.withdrawX(name, have));
            }
            await Execution.delayUntil(
                () => this.bankCountByName(name) < have || notedMuleFishCount(mode) > 0,
                2000
            );
            await Execution.delayTicks(1);
            if (ok) {
                this.log(`mule: withdrew ${name} as notes`);
            } else {
                this.log(`mule: withdraw ${name} did not confirm — will retry`);
            }
        }

        await Execution.delayTicks(1);
        return unnotedMuleFishCount(mode) <= 0 && this.bankCookedCount() <= 0;
    }

    findMulePartnerNpc() {
        const name = this.mulePartner();
        if (!name || typeof Players?.query !== 'function') {
            return null;
        }
        const partner = Players.query().name(name).nearest() ?? null;
        if (!partner) {
            return null;
        }
        const pt = partner.tile?.() ?? null;
        if (pt && Tile.from(pt).distanceTo(BANK_STAND) > BANK_MULE_LEASH) {
            return null;
        }
        return partner;
    }

    async muleTick() {
        if (!this.muleReadyToTrade) {
            await this.muleBankNotedFish();
            return;
        }

        if (typeof Trade !== 'undefined' && Trade.active()) {
            await this.driveMuleTrade();
            return;
        }

        const mode = this.fishMode;
        if (notedMuleFishCount(mode) <= 0 && muleFishHeldCount(mode) <= 0) {
            this.lastBankCooked = 0;
            await this.resumeFishingAfterMule(`no ${muleFishLabel(mode)} in pack after withdraw`);
            return;
        }
        await this.requestMuleTrade();
    }

    async muleBankNotedFish() {
        const who = this.mulePartner();
        const need = this.muleThreshold();
        const mode = this.fishMode;
        const label = muleFishLabel(mode);
        this.status = 'mule: banking';
        if (!this.muleAnnounced) {
            this.muleAnnounced = true;
            this.log(
                `mule: withdraw noted ${label} (≥${need}) → trade to ${who} at guild bank → resume fish`
            );
        }

        const here = Game.tile();
        if (!here || Tile.from(here).distanceTo(BANK_STAND) > BANK_MULE_LEASH) {
            this.status = 'mule: to bank';
            if (!(await this.enterGuild())) {
                return;
            }
            await Traversal.walkResilient(BANK_STAND, {
                radius: 2,
                log: m => this.log(`  ${m}`)
            });
            return;
        }

        if (!Bank.isOpen()) {
            this.log('mule: opening Fishing Guild bank');
            if (
                !(await Banking.open({
                    stand: BANK_STAND,
                    log: m => this.log(`  ${m}`)
                }))
            ) {
                this.log('mule: could not open bank — retrying');
                await Execution.delayTicks(3);
                return;
            }
        }

        if (typeof Bank.loaded === 'function') {
            await Execution.delayUntil(() => Bank.loaded() || Bank.items().length > 0, 3000);
        }
        await Execution.delayTicks(1);

        this.snapshotBankMuleFish();
        const notedHeld = notedMuleFishCount(mode);
        const unnotedHeld = unnotedMuleFishCount(mode);
        let banked = this.bankCookedCount();
        this.log(
            `mule: live cooked ${banked}/${need} noted-pack ${notedHeld} unnoted-pack ${unnotedHeld}`
        );

        if (unnotedHeld > 0) {
            await this.depositUnnotedMuleFish(`depositing unnoted ${label} before noted withdraw`);
            this.snapshotBankMuleFish();
            banked = this.bankCookedCount();
        }

        if (typeof Inventory.free === 'function' && Inventory.free() <= 0 && banked > 0) {
            this.log('mule: clearing non-note junk for noted withdraw');
            if (typeof Bank.depositAllMatching === 'function') {
                await Bank.depositAllMatching((name, id) => {
                    if (isKeepOnDeposit(name) || isCoins(name)) {
                        return false;
                    }
                    if (isMuleFish(name, mode)) {
                        return isUnnotedMuleFishDeposit(name, id, mode);
                    }
                    return true;
                });
            }
            await Execution.delayTicks(1);
            this.snapshotBankMuleFish();
            banked = this.bankCookedCount();
        }

        this.snapshotBankMuleFish();
        banked = this.bankCookedCount();
        const notedNow = notedMuleFishCount(mode);
        const available = this.cookedAvailableCount();

        if (available < need) {
            this.log(`mule: cooked ${available}/${need} — waiting (will not trade)`);
            if (Bank.isOpen()) {
                await Bank.close();
            }
            await this.resumeFishingAfterMule(
                `need ≥${need} ${label} before mule (have ${available})`
            );
            return;
        }

        if (notedNow >= need && unnotedMuleFishCount(mode) <= 0 && banked <= 0) {
            if (Bank.isOpen()) {
                await Bank.close();
            }
            this.muleReadyToTrade = true;
            this.lastRawSeen = rawFishCount(mode);
            this.log(`mule: holding ${notedNow} noted ${label} — looking for ${who}`);
            this.status = 'mule: find partner';
            return;
        }

        if (banked <= 0 && notedNow <= 0) {
            this.log(`mule: no ${label} in bank or pack — aborting handoff`);
            this.lastBankCooked = 0;
            if (Bank.isOpen()) {
                await Bank.close();
            }
            await this.resumeFishingAfterMule('nothing to mule');
            return;
        }

        if (banked > 0) {
            const allNoted = await this.withdrawAllMuleFishNoted();

            if (unnotedMuleFishCount(mode) > 0) {
                await this.depositUnnotedMuleFish('withdraw came out unnoted');
                await this.ensureBankNoteMode(true);
                await Execution.delayTicks(2);
                return;
            }

            if (notedMuleFishCount(mode) <= 0 && muleFishHeldCount(mode) <= 0) {
                this.log('mule: withdraw did not land noted fish — retrying');
                await this.ensureBankNoteMode(true);
                await Execution.delayTicks(2);
                return;
            }

            const leftover = this.bankCookedCount();
            if (leftover > 0 || !allNoted) {
                this.log(`mule: ${leftover} cooked still in bank — retrying noted withdraw-all`);
                await this.ensureBankNoteMode(true);
                await Execution.delayTicks(2);
                return;
            }
        }

        if (unnotedMuleFishCount(mode) > 0) {
            await this.depositUnnotedMuleFish('still holding unnoted fish — will not trade');
            await this.ensureBankNoteMode(true);
            await Execution.delayTicks(2);
            return;
        }

        this.snapshotBankMuleFish();
        const notedAfter = notedMuleFishCount(mode);
        if (notedAfter < need) {
            this.log(`mule: pack ${notedAfter} noted — will not trade`);
            if (Bank.isOpen()) {
                await Bank.close();
            }
            await this.resumeFishingAfterMule(
                `need ≥${need} ${label} before mule (have ${notedAfter})`
            );
            return;
        }

        await this.ensureBankNoteMode(false);
        if (Bank.isOpen()) {
            await Bank.close();
        }

        this.muleReadyToTrade = true;
        this.lastRawSeen = rawFishCount(mode);
        this.log(`mule: holding ${notedAfter} noted ${label} (0 unnoted) — looking for ${who}`);
        this.status = 'mule: find partner';
    }

    async requestMuleTrade() {
        const who = this.mulePartner();
        const here = Game.tile();
        if (!here || Tile.from(here).distanceTo(BANK_STAND) > BANK_MULE_LEASH) {
            this.status = 'mule: return to bank';
            if (!(await this.enterGuild())) {
                return;
            }
            await Traversal.walkResilient(BANK_STAND, {
                radius: 2,
                log: m => this.log(`  ${m}`)
            });
            return;
        }

        const partner = this.findMulePartnerNpc();
        if (!partner) {
            this.status = `mule: waiting for ${who} at bank`;
            if (Tile.from(here).distanceTo(BANK_STAND) > 2) {
                await Traversal.walkTo(BANK_STAND, { radius: 2, timeoutMs: 8_000 });
            }
            await Execution.delayTicks(3);
            return;
        }

        if (partner.distance() > MULE_TRADE_RANGE) {
            this.status = `mule: walking to ${who}`;
            this.log(`mule: ${who} ${partner.distance()}t away — walking closer (stay at bank)`);
            const pt = partner.tile?.() ?? null;
            if (pt && Tile.from(pt).distanceTo(BANK_STAND) <= BANK_MULE_LEASH) {
                await Traversal.walkTo(pt, {
                    radius: MULE_TRADE_RANGE,
                    timeoutMs: 12_000,
                    log: m => this.log(`  ${m}`)
                });
            } else {
                await Execution.delayTicks(2);
            }
            return;
        }

        if (Date.now() < this.nextMuleTradeRequestAtMs) {
            this.status = `mule: waiting to re-request ${who}`;
            await Execution.delayTicks(1);
            return;
        }

        this.status = `mule: trading ${who}`;
        this.log(`mule: Trade with ${who}`);
        this.nextMuleTradeRequestAtMs = Date.now() + MULE_TRADE_REQUEST_MS;
        await Trade.request(who);
        await Execution.delayUntil(() => Trade.active(), MULE_TRADE_REQUEST_MS);
    }

    async muleWaitAndAcceptScreen(screen) {
        const onOffer = () => Trade.onOfferScreen() && !Trade.onConfirmScreen();
        const onConfirm = () => Trade.onConfirmScreen();
        const isHere = screen === 'confirm' ? onConfirm : onOffer;

        if (!Trade.active() || !isHere()) {
            return;
        }

        const waitMs = muleAcceptDelayMs();
        const label =
            screen === 'confirm' ? 'confirm (double-check)' : 'offer (trade goods)';
        this.status = `mule: waiting on ${screen}`;
        this.log(`mule: ${label} — waiting ~${Math.round(waitMs / 1000)}s before accept`);

        const readyAt = Date.now() + waitMs;
        while (Date.now() < readyAt && Trade.active() && isHere()) {
            await Execution.delayTicks(1);
        }

        if (!Trade.active()) {
            return;
        }

        this.status = `mule: accepting ${screen}`;
        this.log(`mule: accepting ${label}`);
        await Trade.accept();

        if (screen === 'offer') {
            while (Trade.active() && onOffer()) {
                await Execution.delayUntil(
                    () => !Trade.active() || onConfirm() || !onOffer(),
                    MULE_ACCEPT_RETRY_MS
                );
                if (!Trade.active() || onConfirm() || !onOffer()) {
                    break;
                }
                this.log('mule: re-accepting offer (still open)');
                await Trade.accept();
            }
            return;
        }

        this.log('mule: confirm accepted — keeping Accept until trade closes');
        while (Trade.active()) {
            if (onConfirm() || onOffer()) {
                this.status = 'mule: accepting until trade ends';
                await Trade.accept();
            }
            await Execution.delayTicks(2);
        }
        this.log('mule: trade interface closed');
    }

    offerHasMuleFish() {
        const mode = this.fishMode;
        if (typeof Trade === 'undefined' || typeof Trade.myOffer !== 'function') {
            return false;
        }
        return Trade.myOffer().some(i => isMuleFish(i.name, mode));
    }

    async driveMuleTrade() {
        const who = this.mulePartner();
        const mode = this.fishMode;
        const before = muleFishHeldCount(mode);

        while (typeof Trade !== 'undefined' && Trade.active()) {
            if (Trade.onConfirmScreen()) {
                await this.muleWaitAndAcceptScreen('confirm');
                break;
            }

            if (!Trade.onOfferScreen()) {
                await Execution.delayTicks(1);
                continue;
            }

            const partner = Trade.partner();
            if (partner != null && partner.trim().toLowerCase() !== who.toLowerCase()) {
                this.log(`mule: declining trade with ${partner} (want ${who})`);
                await Trade.decline();
                return;
            }
            if (partner == null) {
                this.status = 'mule: reading trade partner';
                await Execution.delayTicks(1);
                continue;
            }

            const offered = this.offerHasMuleFish();
            if (!offered) {
                if (this.status !== 'mule: offering fish') {
                    this.log(`mule: Offer-All noted ${muleFishLabel(mode)}`);
                }
                this.status = 'mule: offering fish';
                const offerNoted = i => {
                    if (!isMuleFish(i.name, mode)) {
                        return false;
                    }
                    const cert = certIsNote(i.id);
                    if (cert === true) {
                        return true;
                    }
                    if (cert === false) {
                        return false;
                    }
                    return Math.max(1, i.count) > 1;
                };
                let offeredOk = false;
                if (typeof Trade.offerAll === 'function') {
                    for (const name of muleFishNamesHeld(mode)) {
                        let thisOk = !!(await Trade.offerAll(name, offerNoted));
                        if (!thisOk) {
                            thisOk = !!(await Trade.offerAll(name));
                        }
                        if (thisOk) {
                            offeredOk = true;
                        }
                    }
                }
                if (!offeredOk) {
                    this.log('mule: offerAll fish failed — declining');
                    await Trade.decline();
                    return;
                }
                await Execution.delayUntil(
                    () =>
                        this.offerHasMuleFish() ||
                        Trade.onConfirmScreen() ||
                        !Trade.active(),
                    MULE_TRADE_REQUEST_MS
                );
                continue;
            }

            await this.muleWaitAndAcceptScreen('offer');
        }

        if (Trade.active()) {
            this.status = 'mule: finishing trade';
            this.log('mule: trade still open — keeping Accept until it closes');
            while (Trade.active()) {
                if (Trade.onConfirmScreen() || Trade.onOfferScreen()) {
                    await Trade.accept();
                }
                await Execution.delayTicks(2);
            }
        }

        await Execution.delayTicks(3);
        if (Trade.active()) {
            this.log('mule: trade reopened — continuing Accepts');
            return;
        }

        const gone = before - muleFishHeldCount(mode);
        if (gone > 0 || muleFishHeldCount(mode) <= 0) {
            this.muled += Math.max(0, gone);
            this.muleTrips++;
            this.lastBankCooked = 0;
            await this.resumeFishingAfterMule(
                `trade over — delivered ${gone > 0 ? gone : 'all'} ${muleFishLabel(mode)} to ${who}`
            );
            return;
        }
        this.log('mule: trade over but fish still held — will re-request');
        this.nextMuleTradeRequestAtMs = Date.now() + MULE_TRADE_REQUEST_MS;
    }

    onPaint(ctx) {
        ensurePaintFont();
        const elapsed = Date.now() - this.startedAt;
        const hrs = elapsed / 3_600_000;
        const fishXp = Skills.xp('fishing') - this.fishXpAtStart;
        const cookXp = Skills.xp('cooking') - this.cookXpAtStart;
        const fishXph = hrs > 0.008 ? fishXp / hrs : 0;
        const cookXph = hrs > 0.008 ? cookXp / hrs : 0;
        const caughtPh = hrs > 0.008 ? this.caught / hrs : 0;
        const cookedPh = hrs > 0.008 ? this.cooked / hrs : 0;
        const cookMode = this.cookOnWay ? 'cook→bank' : 'bank raw';
        const tool = toolName(this.fishMode);
        const toolOk = hasGear(this.fishMode);
        const muleBit = this.muleWanted()
            ? `  mule ${this.muled} (${this.lastBankCooked}/${this.muleThreshold()} ${this.mulePartner() || 'no name'})`
            : '';

        const lines = [
            `Benzyme's Guild Cage  ${this.fishMode}  Fish ${Skills.level('fishing')}  Cook ${Skills.level('cooking')}`,
            `time ${fmtElapsed(elapsed)}  ·  ${cookMode}  ·  ${this.status}`,
            `caught ${this.caught} (${fmtXph(caughtPh)}/hr)  cooked ${this.cooked} (${fmtXph(cookedPh)}/hr)`,
            `${tool.toLowerCase()} ${toolOk ? 'yes' : 'NO'}  bank ${this.bankTrips}  Fish XP ${fmtXph(fishXph)}/hr` +
                (this.cookOnWay || cookXp > 0 ? `  Cook XP ${fmtXph(cookXph)}/hr` : '') +
                muleBit
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
    version: '1.2.1',
    category: 'Fishing',
    tags: [
        'fishing',
        'fishing-guild',
        'lobster',
        'swordfish',
        'tuna',
        'cage',
        'harpoon',
        'bank',
        'cook',
        'mule'
    ],
    description:
        "Benzyme's Fishing Guild Cage — Cage+Harpoon spots only. Pick Lobsters (Cage + Lobster pot) or Swordfish (Harpoon; also catches tuna). Optional cook on the range at 2615,3396 (drop burnt) before banking. Optional mule: once banked cooked catch reaches the amount you set, withdraw as notes and trade them to the named mule at the Fishing Guild bank, then keep fishing. Withdraws the tool from the guild bank or loots the entrance-hall spawn. If still missing, buys it from Harry (Catherby); if coins are short, sells a bank item at Arhein's general store first. Needs Fishing 68 to enter. Lobsters: Fishing 40 / Cooking 40. Swordfish: Fishing 50 / Cooking 45 (tuna cooks at 30).",
    settingsSchema: {
        fishMode: {
            type: 'string',
            default: FISH_LOBSTER,
            options: FISH_OPTIONS,
            label: 'Fish',
            group: 'Fishing',
            help:
                'Lobsters: Cage on Cage+Harpoon spots with a Lobster pot. ' +
                'Swordfish: Harpoon those same spots (tuna + swordfish). Restocks the matching tool from the guild bank / hall spawn / Harry.',
        },
        cookOnWay: {
            type: 'boolean',
            default: true,
            label: 'Cook on way to bank',
            group: 'Cooking',
            help:
                'When the pack is full, cook the catch on the range at 2615,3396, drop burnt, then bank. ' +
                'Lobster needs Cooking 40. Tuna 30 / swordfish 45 — under that, leftover raw banks. Turn off to bank raw.'
        },
        muleOn: {
            type: 'boolean',
            default: false,
            label: 'Mule mode',
            group: 'Mule',
            help:
                'Keep fishing, cooking, and banking. Once cooked catch in the bank reaches Cooked fish to mule, withdraw them as notes at the Fishing Guild bank and trade to the mule username. After the trade, resume fishing. Pause then Edit parameters to change without stopping.'
        },
        muleName: {
            type: 'string',
            default: DEFAULT_MULE_NAME,
            label: 'Mule username',
            group: 'Mule',
            help:
                'Exact in-game name of the player who stands at the Fishing Guild bank to take the noted cooked fish.'
        },
        muleThreshold: {
            type: 'number',
            default: DEFAULT_MULE_THRESHOLD,
            min: 1,
            max: 10_000,
            label: 'Cooked fish to mule',
            group: 'Mule',
            help:
                'How many cooked fish must be in the bank before muling (1–10000). Lobster mode mules cooked lobster. Swordfish mode mules cooked tuna and swordfish. After each successful trade, fishing continues until this amount is banked again.'
        }
    },
    create: () => new FishingGuildLobstersSwordfish()
});
