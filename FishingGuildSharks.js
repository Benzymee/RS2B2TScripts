/**
 * FishingGuildSharks — harpoon sharks at the Fishing Guild (Net+Harpoon spots only).
 * Optional cook on the range at 2615,3396 (preference tick box), then bank and return to the docks.
 * Optional mule: once banked cooked sharks hit the threshold, withdraw as notes and trade to
 * the named mule at the Fishing Guild bank, then keep fishing.
 * Withdraws Harpoon from the guild bank; loots the entrance-hall spawn if the bank has none.
 * If still missing, buys one from Harry (Catherby). Can't afford it: sell a bank item at
 * Arhein's general store, then buy the Harpoon.
 * Completely vibe coded by @.benzyme on Discord via Cursor AI
 * Self-contained ESM for rs2b0t Load local script / Load URL.
 *
 * Load URL: https://benzymee.github.io/RS2B2TScripts/FishingGuildSharks.js
 */
const SUPPORTED_API_VERSION = 1;
const abi = globalThis.__rs2b0t;
if (!abi) {
    throw new Error('FishingGuildSharks: globalThis.__rs2b0t missing — load inside rs2b0t bot.html');
}
if (abi.apiVersion !== SUPPORTED_API_VERSION) {
    throw new Error(
        `FishingGuildSharks: ABI ${abi.apiVersion} != supported ${SUPPORTED_API_VERSION}`
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

const SCRIPT_NAME = 'FishingGuildSharks';

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

/** Mid-dock stand — both shark piers are in leash of this pin. */
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
const MULE_FISH_NAMES = ['Shark'];

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

const HARPOON_NAME = 'Harpoon';
const SPOT_NAME = 'Fishing spot';
const HARRY_NAME = 'Harry';
const HARRY_STAND = new Tile(2833, 3443, 0);
const HARPOON_COST = 5;
const GENERAL_STORES = [
    { keeper: 'Arhein', stand: new Tile(2807, 3430, 0), label: 'Arhein (Catherby)' },
    { keeper: 'Aemad', alt: 'Kortan', stand: new Tile(2613, 3294, 0), label: "Aemad's (Ardougne)" }
];
const FISH_LEVEL = 76;
const COOK_LEVEL = 80;
const GUILD_LEVEL = 68;
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

const PAINT_FONT_ID = 'benzyme-fishing-guild-sharks-font-v1';
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

function isHarpoonName(name) {
    const n = (name ?? '').toLowerCase();
    return n.includes('harpoon');
}

function isRawShark(name) {
    return (name ?? '').toLowerCase() === 'raw shark';
}

function isCookedShark(name) {
    const n = (name ?? '').toLowerCase().trim();
    return n === 'shark';
}

function isBurntFish(name) {
    if (!name) {
        return false;
    }
    const n = name.toLowerCase();
    return n.startsWith('burnt ') || n === 'burnt fish' || n === 'burnt shark';
}

function isBankableFish(name) {
    return isRawShark(name) || isCookedShark(name) || isBurntFish(name);
}

function canCookSharks() {
    return Skills.level('cooking') >= COOK_LEVEL;
}

function countMatching(pred) {
    return Inventory.items()
        .filter(i => pred(i.name))
        .reduce((n, i) => n + Math.max(1, i.count), 0);
}

function rawFishCount() {
    return countMatching(isRawShark);
}

function cookableCount() {
    return canCookSharks() ? rawFishCount() : 0;
}

function cookedFishCount() {
    return countMatching(isCookedShark);
}

/** Cooked shark only, never raw or burnt. */
function isMuleFish(name) {
    return isCookedShark(name);
}

/** Try ObjType.certtemplate when the client exposes it (true = bank note). */
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

function isNotedMuleFishItem(item) {
    if (!item || !isMuleFish(item.name)) {
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

function isUnnotedMuleFishItem(item) {
    return !!item && isMuleFish(item.name) && !isNotedMuleFishItem(item);
}

function isUnnotedMuleFishDeposit(name, id) {
    if (!isMuleFish(name)) {
        return false;
    }
    const cert = certIsNote(id);
    if (cert === true) {
        return false;
    }
    if (cert === false) {
        return true;
    }
    const inv = Inventory.items().filter(i => i.id === id && isMuleFish(i.name));
    if (inv.some(i => Math.max(1, i.count) > 1)) {
        return false;
    }
    return inv.length > 0;
}

function unnotedMuleFishCount() {
    return Inventory.items()
        .filter(isUnnotedMuleFishItem)
        .reduce((n, i) => n + Math.max(1, i.count), 0);
}

function notedMuleFishCount() {
    return Inventory.items()
        .filter(isNotedMuleFishItem)
        .reduce((n, i) => n + Math.max(1, i.count), 0);
}

function muleFishHeldCount() {
    return Inventory.items()
        .filter(i => isMuleFish(i.name))
        .reduce((n, i) => n + Math.max(1, i.count), 0);
}

function muleFishNamesHeld() {
    const names = [];
    const seen = new Set();
    for (const item of Inventory.items()) {
        if (!isMuleFish(item.name)) {
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

function fishForBankCount() {
    return rawFishCount() + cookedFishCount() + burntCount();
}

function lastCookableRaw() {
    const items = Inventory.items();
    for (let i = items.length - 1; i >= 0; i--) {
        if (isRawShark(items[i].name) && canCookSharks()) {
            return items[i];
        }
    }
    return null;
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

function netOp(actions) {
    return actions.find(a => /^(net|big\s*net)$/i.test(a)) ?? null;
}

function harpoonOp(actions) {
    return actions.find(a => /^harpoon$/i.test(a)) ?? null;
}

function cageOp(actions) {
    return actions.find(a => /^cage$/i.test(a)) ?? null;
}

/** Shark hops — Net + Harpoon (never Cage+Harpoon lobster/tuna spots). */
function isSharkSpot(actions) {
    return harpoonOp(actions) !== null && netOp(actions) !== null && cageOp(actions) === null;
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
        n.includes('crate') ||
        n.includes('box') ||
        n.includes('shelf') ||
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

class FishingGuildSharks extends LoopingBot {
    status = 'starting';
    startedAt = 0;
    fishXpAtStart = 0;
    cookXpAtStart = 0;
    /** Total raw sharks caught this session. */
    caught = 0;
    /** Total successfully cooked sharks this session (not burnt). */
    cooked = 0;
    bankTrips = 0;
    /** Preference: cook on guild Range before banking. */
    cookOnWay = true;
    /** Preference: mule cooked sharks to a named partner at the guild bank. */
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
        this.lastRawSeen = rawFishCount();
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
        this.log(
            `FishingGuildSharks @ ${ANCHOR.x},${ANCHOR.z} — Harpoon on Net+Harpoon; ` +
                `cook on way: ${this.cookOnWay ? 'on' : 'off'}; ` +
                `mule: ${this.muleWanted() ? `on (≥${this.muleThreshold()} cooked → ${this.mulePartner() || 'set username'})` : 'off'}; ` +
                `range @ ${RANGE_STAND.x},${RANGE_STAND.z}; bank @ ${BANK_STAND.x},${BANK_STAND.z}`
        );
        if (fishLvl < GUILD_LEVEL) {
            this.log(`WARNING: Fishing Guild door needs Fishing ${GUILD_LEVEL} (you have ${fishLvl})`);
        }
        if (fishLvl < FISH_LEVEL) {
            this.log(`WARNING: sharks need Fishing ${FISH_LEVEL} (you have ${fishLvl})`);
        }
        if (this.cookOnWay && cookLvl < COOK_LEVEL) {
            this.log(
                `WARNING: cooking sharks needs Cooking ${COOK_LEVEL} (you have ${cookLvl}) — will bank raw until then`
            );
        }
        if (this.muleWanted() && !this.cookOnWay) {
            this.log(
                'WARNING: mule trades cooked sharks — turn on Cook on way to bank, or already have cooked sharks in the bank'
            );
        }
        if (this.muleWanted() && !this.mulePartner()) {
            this.log('WARNING: mule mode is on but no mule username is set');
        }
        if (hasHarpoon()) {
            this.log('Harpoon already in inventory / equipped — ready to fish');
        } else {
            this.log(
                'no Harpoon — will withdraw from guild bank, loot the hall spawn, or buy from Harry'
            );
        }
        this.status = hasHarpoon() ? 'ready' : 'start: need harpoon';
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
            `stopped — caught ${this.caught}, cooked ${this.cooked}, muled ${this.muled}, ` +
                `bank ${this.bankTrips}, mule trips ${this.muleTrips} (${this.status})`
        );
    }

    syncPrefs({ silent = false } = {}) {
        const prevCook = this.cookOnWay;
        const prevMule = this.muleOn;
        const prevUser = this.muleUser;
        const prevNeed = this.muleNeed;
        this.cookOnWay = readPrefBool('cookOnWay', this.settings.bool('cookOnWay', true));
        this.muleOn = readPrefBool('muleOn', this.settings.bool('muleOn', false));
        this.muleUser = readPrefStr('muleName', this.settings.str('muleName', DEFAULT_MULE_NAME));
        this.muleNeed = clampMuleThreshold(
            readPrefNum('muleThreshold', this.settings.num('muleThreshold', DEFAULT_MULE_THRESHOLD))
        );
        if (!silent && prevCook !== this.cookOnWay) {
            this.log(`prefs: cook on way → ${this.cookOnWay ? 'on' : 'off'}`);
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
            this.log(`prefs: mule at ${this.muleNeed} cooked sharks`);
        }
    }

    noteCatches() {
        const now = rawFishCount();
        if (now > this.lastRawSeen) {
            this.caught += now - this.lastRawSeen;
        }
        this.lastRawSeen = now;
    }

    noteCooked(beforeCooked) {
        const now = cookedFishCount();
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
            if (cookableCount() === 0 && fishForBankCount() > 0) {
                if (burntCount() > 0) {
                    await this.dropBurnt();
                }
                this.cookingLoad = false;
                await this.bankAndReturn();
            }
            return;
        }

        if (!hasHarpoon()) {
            if (await this.lootHarpoonFromGround()) {
                this.log('looted Harpoon');
                return;
            }
            this.status = 'need Harpoon';
            this.log('missing Harpoon — bank first, then Harry if needed');
            await this.bankAndReturn();
            if (!hasHarpoon() && (await this.lootHarpoonFromGround({ wide: true }))) {
                this.log('looted Harpoon from entrance hall');
            }
            if (!hasHarpoon()) {
                await this.acquireMissingHarpoon();
            }
            return;
        }

        if (this.muleWanted() && !this.muleBankSeen) {
            this.status = 'mule: snapshot bank';
            this.log(
                `mule on — opening bank to count cooked sharks (handoff at ≥${this.muleThreshold()}` +
                    (this.mulePartner() ? ` → ${this.mulePartner()}` : ', set a mule username') +
                    ')'
            );
            await this.bankAndReturn();
            return;
        }

        if (this.cookingLoad && !this.cookOnWay) {
            this.cookingLoad = false;
            if (fishForBankCount() > 0) {
                await this.bankAndReturn();
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
            if (fishForBankCount() > 0) {
                await this.bankAndReturn();
            }
            return;
        }

        if (Inventory.isFull()) {
            if (this.cookOnWay && cookableCount() > 0) {
                this.cookingLoad = true;
                this.log(`full inv (${cookableCount()} raw shark) — cooking at 2615,3396`);
                await this.cookLoad();
                return;
            }
            if (fishForBankCount() > 0) {
                if (this.cookOnWay && rawFishCount() > 0 && !canCookSharks()) {
                    this.log(
                        `full inv — Cooking ${Skills.level('cooking')} < ${COOK_LEVEL}, banking raw`
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

        const spot = this.findSharkSpot();
        if (!spot) {
            this.status = 'waiting for Net+Harpoon spot';
            if (Tile.from(here).distanceTo(ANCHOR) > STAND_RADIUS) {
                await Traversal.walkTo(ANCHOR, { radius: 2, timeoutMs: 12_000 });
            }
            await Execution.delayTicks(3);
            return;
        }

        await this.harpoonSpot(spot);
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

    findSharkSpot() {
        return Npcs.query()
            .name(SPOT_NAME)
            .where(n => isSharkSpot(n.actions()))
            .where(n => this.spotIsFishable(n.tile()))
            .nearest();
    }

    async harpoonSpot(spot) {
        const op = harpoonOp(spot.actions());
        if (!op) {
            await Execution.delayTicks(2);
            return;
        }

        const before = rawFishCount();
        const st = spot.tile();
        this.cantReach = false;
        this.lastSpotTile = st;
        this.status = `harpooning (${spot.distance()}t)`;
        this.log(`Harpoon shark spot @ ${st.x},${st.z}`);
        await spot.interact(op);

        await Execution.delayUntil(
            () =>
                rawFishCount() > before ||
                Game.animating() ||
                ChatDialog.canContinue() ||
                this.cantReach ||
                Inventory.isFull() ||
                !this.findSharkSpot(),
            8000
        );
        this.noteCatches();
        if (this.cantReach) {
            await this.recoverCantReach(st);
        }
    }

    async lootHarpoonFromGround({ wide = false } = {}) {
        if (hasHarpoon()) {
            return true;
        }
        const within = wide ? 18 : 12;
        const ground =
            GroundItems.query().name(HARPOON_NAME).within(within).nearest() ??
            GroundItems.query()
                .where(g => isHarpoonName(g.name))
                .within(within)
                .nearest();
        if (!ground) {
            return false;
        }
        const before = Inventory.used();
        this.log(`taking ${ground.name ?? HARPOON_NAME} from ground`);
        await ground.interact('Take');
        return (
            (await Execution.delayUntil(() => hasHarpoon() || Inventory.used() > before, 6000)) &&
            hasHarpoon()
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
        const products = ChatDialog.makeProducts();
        const raw = lastCookableRaw();
        const hint =
            products.find(p => (p ?? '').toLowerCase().includes('shark')) ??
            raw?.name ??
            products[0] ??
            null;
        const batch = Math.max(1, Math.min(cookableCount(), 28));
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

        await Execution.delayUntil(
            () => !ChatDialog.isMakeMenu() && (Game.animating() || cookableCount() === 0),
            5000
        );

        let cookedMark = cookedFishCount();
        let idle = 0;
        for (let guard = 0; guard < 400 && cookableCount() > 0; guard++) {
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

    async cookLoad() {
        if (cookableCount() === 0) {
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
            if (cookableCount() === 0) {
                if (burntCount() > 0) {
                    await this.dropBurnt();
                }
                this.cookingLoad = false;
                await this.bankAndReturn();
            }
            return;
        }

        await this.ensureRangeDoorOpen({ walk: false });

        const raw = lastCookableRaw();
        if (!raw) {
            this.cookingLoad = false;
            return;
        }

        const beforeCookable = cookableCount();
        let cookedMark = cookedFishCount();
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
                cookableCount() < beforeCookable ||
                Skills.xp('cooking') > beforeXp ||
                ChatDialog.isMakeMenu() ||
                ChatDialog.canContinue(),
            8000
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
        const raw = rawFishCount();
        const cooked = cookedFishCount();
        this.status = 'banking';
        this.log(
            `banking` +
                (raw ? ` ${raw} raw` : '') +
                (cooked ? ` ${cooked} cooked` : '') +
                (burntCount() ? ` ${burntCount()} burnt` : '') +
                ` — restock Harpoon`
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
                await this.restockHarpoonFromOpenBank();
                this.snapshotBankMuleFish();
            },
            returnTo: null,
            log: m => this.log(`  ${m}`)
        });

        this.bankTrips++;
        this.cookingLoad = false;
        this.lastRawSeen = rawFishCount();
        if (Bank.isOpen()) {
            this.snapshotBankMuleFish();
        }
        this.muleBankSeen = true;

        if (!hasHarpoon()) {
            this.log('no Harpoon in inventory — trying entrance-hall spawn');
            await this.walkToRange();
            if (await this.lootHarpoonFromGround({ wide: true })) {
                this.log('looted Harpoon from entrance hall');
            }
        }

        if (!hasHarpoon() && !this.toolInBank) {
            await this.acquireMissingHarpoon();
            return;
        }
        if (!hasHarpoon()) {
            this.log('Harpoon is in the bank — will withdraw next trip, not buying another');
            return;
        }

        if (this.maybeBeginMuleFromBank()) {
            return;
        }

        this.status = 'returning to docks';
        this.log('gear ready — Harpoon');
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

    async restockHarpoonFromOpenBank() {
        if (!Bank.isOpen()) {
            return hasHarpoon();
        }
        await this.depositEverythingOpenBank();
        await this.unequipWornNonTool();
        if (junkInvNames().length > 0) {
            await this.depositEverythingOpenBank();
        }
        if (hasHarpoon()) {
            this.log('already have Harpoon — not withdrawing another');
            return true;
        }
        return await this.withdrawHarpoonFromOpenBank();
    }

    /** @returns {Promise<boolean>} true if a harpoon is in inventory or equipped after */
    async withdrawHarpoonFromOpenBank() {
        if (!Bank.isOpen()) {
            return hasHarpoon();
        }
        await Execution.delayUntil(() => Bank.loaded() || !Bank.isOpen(), 3000);
        if (!Bank.isOpen()) {
            return hasHarpoon();
        }

        this.toolInBank = false;
        if (hasHarpoon()) {
            return true;
        }

        const harpoonBank =
            Bank.items().find(i => (i.name ?? '').toLowerCase() === 'harpoon') ??
            Bank.items().find(i => isHarpoonName(i.name));
        if (harpoonBank) {
            this.toolInBank = true;
            const name = harpoonBank.name ?? HARPOON_NAME;
            const op =
                (typeof withdrawOp === 'function' ? withdrawOp(harpoonBank.ops, '1') : null) ??
                'Withdraw-1';
            this.log(`withdrawing ${name}`);
            await Bank.withdraw(name, op);
            await Execution.delayTicks(1);
            if (hasHarpoon()) {
                return true;
            }
            this.log('Harpoon is in the bank — not buying another');
            return false;
        }

        this.log('WARNING: no Harpoon in bank');
        await this.withdrawCoinsFromOpenBank(HARPOON_COST);
        if (coinCount() < HARPOON_COST) {
            await this.withdrawSellableFromOpenBank();
        }
        return hasHarpoon();
    }

    async withdrawCoinsFromOpenBank(need) {
        const short = Math.max(0, need - coinCount());
        if (!Bank.isOpen() || short <= 0) {
            return coinCount() >= need;
        }
        const bankGp = Bank.count('Coins') || 0;
        if (bankGp <= 0) {
            this.log('WARNING: no Coins in bank for Harry');
            return coinCount() >= need;
        }
        const take = Math.min(short, bankGp);
        this.log(`withdrawing ${take} Coins for Harry Harpoon`);
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
     * Bank / spawn already failed — buy a Harpoon from Harry.
     * If coins are short, sell a bank item at Arhein (Catherby) first.
     */
    async acquireMissingHarpoon() {
        if (hasHarpoon()) {
            this.log('already have Harpoon — not buying another');
            return true;
        }

        for (let attempt = 0; attempt < 3 && !hasHarpoon() && coinCount() < HARPOON_COST; attempt++) {
            if (!this.pickInvSellItem()) {
                await this.bankForHarryFunds();
            }
            if (hasHarpoon()) {
                this.log('already have Harpoon — not buying another');
                return true;
            }
            if (this.pickInvSellItem()) {
                await this.sellAtGeneralStore();
            } else {
                break;
            }
        }

        if (hasHarpoon()) {
            this.log('already have Harpoon — not buying another');
            return true;
        }
        if (this.toolInBank) {
            this.log('Harpoon is in the bank — not buying another');
            this.status = 'need harpoon withdraw';
            await Execution.delayTicks(4);
            return false;
        }

        if (coinCount() >= HARPOON_COST) {
            return await this.buyHarpoonFromHarryAndReturn();
        }

        this.log(
            'WARNING: cannot afford Harpoon — put coins or something sellable in the guild bank'
        );
        this.status = 'need coins';
        await Execution.delayTicks(8);
        return false;
    }

    async bankForHarryFunds() {
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
                if (await this.withdrawHarpoonFromOpenBank()) {
                    return;
                }
                if (this.toolInBank) {
                    return;
                }
                await this.withdrawCoinsFromOpenBank(HARPOON_COST);
                if (coinCount() >= HARPOON_COST) {
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

        let soldAny = false;
        for (let n = 0; n < 6 && coinCount() < HARPOON_COST; n++) {
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
        return soldAny && coinCount() >= HARPOON_COST;
    }

    async buyHarpoonFromHarryAndReturn() {
        if (hasHarpoon()) {
            this.log('already have Harpoon — not buying another');
            this.status = 'returning to docks';
            if (await this.enterGuild()) {
                await Traversal.walkResilient(ANCHOR, {
                    radius: 3,
                    log: m => this.log(`  ${m}`)
                });
            }
            return true;
        }

        if (coinCount() < HARPOON_COST) {
            this.log(`need ${HARPOON_COST}gp for Harpoon (have ${coinCount()})`);
            return false;
        }

        this.status = 'walking to Harry (harpoon)';
        this.log(`buying Harpoon from Harry (${HARPOON_COST}gp)`);
        await this.leaveGuild();
        await Traversal.walkResilient(HARRY_STAND, {
            radius: 2,
            log: m => this.log(`  ${m}`)
        });
        await this.openNearbyDoor();

        this.status = 'buying harpoon';
        if (!(await Shop.open(HARRY_NAME))) {
            this.log('could not open Harry for harpoon — retrying next loop');
            await Execution.delayTicks(3);
            return false;
        }

        if (coinCount() >= HARPOON_COST && !hasHarpoon()) {
            this.log(`Shop.buy 1× ${HARPOON_NAME}`);
            const bought = await Shop.buy(HARPOON_NAME, 1);
            if (bought > 0) {
                this.log(`bought ${bought}× ${HARPOON_NAME} from Harry`);
            } else {
                this.log('Harry had no Harpoon / buy failed');
            }
        }

        if (Shop.isOpen()) {
            await Shop.close();
        }

        if (!hasHarpoon()) {
            this.log('WARNING: still no Harpoon after Harry — need coins or shop stock');
            this.status = 'need harpoon';
            await Execution.delayTicks(8);
            return false;
        }

        this.sellSkipNames = new Set();
        this.log('bought Harpoon — returning to docks');
        this.lastRawSeen = rawFishCount();
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
        const items = Bank.items?.() ?? [];
        const fromItems = items
            .filter(i => isMuleFish(i.name))
            .reduce((n, i) => n + Math.max(1, i.count), 0);
        let fromCount = 0;
        if (typeof Bank.count === 'function') {
            fromCount = MULE_FISH_NAMES.reduce((n, name) => n + (Bank.count(name) || 0), 0);
        }
        return Math.max(fromItems, fromCount);
    }

    cookedAvailableCount() {
        const banked = Bank.isOpen() ? this.bankCookedCount() : this.lastBankCooked;
        return banked + notedMuleFishCount() + unnotedMuleFishCount();
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
            `mule: handoff ≥${this.muleThreshold()} cooked sharks to ${this.mulePartner()}` +
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
        this.lastRawSeen = rawFishCount();
        this.log(`mule: ${reason} — resuming harpoon fishing`);
        if (!hasHarpoon()) {
            this.status = 'mule: restock harpoon';
            await this.bankAndReturn();
            return;
        }
        if (fishForBankCount() > 0) {
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
        const n = unnotedMuleFishCount();
        if (n <= 0) {
            return false;
        }
        this.log(`mule: ${reason} (${n} unnoted) — depositing, will withdraw as notes`);
        if (typeof Bank.depositAllMatching === 'function') {
            await Bank.depositAllMatching((name, id) => isUnnotedMuleFishDeposit(name, id));
        }
        await Execution.delayTicks(1);
        return true;
    }

    async withdrawAllMuleFishNoted() {
        const banked = this.bankCookedCount();
        if (banked <= 0) {
            return true;
        }

        this.log(`mule: withdrawing ALL cooked sharks as notes (${banked})`);
        await this.ensureBankNoteMode(true);

        for (const name of MULE_FISH_NAMES) {
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
                () => this.bankCountByName(name) < have || notedMuleFishCount() > 0,
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
        return unnotedMuleFishCount() <= 0 && this.bankCookedCount() <= 0;
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

        if (notedMuleFishCount() <= 0 && muleFishHeldCount() <= 0) {
            this.lastBankCooked = 0;
            await this.resumeFishingAfterMule('no cooked sharks in pack after withdraw');
            return;
        }
        await this.requestMuleTrade();
    }

    async muleBankNotedFish() {
        const who = this.mulePartner();
        const need = this.muleThreshold();
        this.status = 'mule: banking';
        if (!this.muleAnnounced) {
            this.muleAnnounced = true;
            this.log(
                `mule: withdraw noted cooked sharks (≥${need}) → trade to ${who} at guild bank → resume fish`
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
        const notedHeld = notedMuleFishCount();
        const unnotedHeld = unnotedMuleFishCount();
        let banked = this.bankCookedCount();
        this.log(
            `mule: live cooked ${banked}/${need} noted-pack ${notedHeld} unnoted-pack ${unnotedHeld}`
        );

        if (unnotedHeld > 0) {
            await this.depositUnnotedMuleFish('depositing unnoted sharks before noted withdraw');
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
                    if (isMuleFish(name)) {
                        return isUnnotedMuleFishDeposit(name, id);
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
        const notedNow = notedMuleFishCount();
        const available = this.cookedAvailableCount();

        if (available < need) {
            this.log(`mule: cooked ${available}/${need} — waiting (will not trade)`);
            if (Bank.isOpen()) {
                await Bank.close();
            }
            await this.resumeFishingAfterMule(
                `need ≥${need} cooked sharks before mule (have ${available})`
            );
            return;
        }

        if (notedNow >= need && unnotedMuleFishCount() <= 0 && banked <= 0) {
            if (Bank.isOpen()) {
                await Bank.close();
            }
            this.muleReadyToTrade = true;
            this.lastRawSeen = rawFishCount();
            this.log(`mule: holding ${notedNow} noted sharks — looking for ${who}`);
            this.status = 'mule: find partner';
            return;
        }

        if (banked <= 0 && notedNow <= 0) {
            this.log('mule: no cooked sharks in bank or pack — aborting handoff');
            this.lastBankCooked = 0;
            if (Bank.isOpen()) {
                await Bank.close();
            }
            await this.resumeFishingAfterMule('nothing to mule');
            return;
        }

        if (banked > 0) {
            const allNoted = await this.withdrawAllMuleFishNoted();

            if (unnotedMuleFishCount() > 0) {
                await this.depositUnnotedMuleFish('withdraw came out unnoted');
                await this.ensureBankNoteMode(true);
                await Execution.delayTicks(2);
                return;
            }

            if (notedMuleFishCount() <= 0 && muleFishHeldCount() <= 0) {
                this.log('mule: withdraw did not land noted sharks — retrying');
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

        if (unnotedMuleFishCount() > 0) {
            await this.depositUnnotedMuleFish('still holding unnoted sharks — will not trade');
            await this.ensureBankNoteMode(true);
            await Execution.delayTicks(2);
            return;
        }

        this.snapshotBankMuleFish();
        const notedAfter = notedMuleFishCount();
        if (notedAfter < need) {
            this.log(`mule: pack ${notedAfter} noted — will not trade`);
            if (Bank.isOpen()) {
                await Bank.close();
            }
            await this.resumeFishingAfterMule(
                `need ≥${need} cooked sharks before mule (have ${notedAfter})`
            );
            return;
        }

        await this.ensureBankNoteMode(false);
        if (Bank.isOpen()) {
            await Bank.close();
        }

        this.muleReadyToTrade = true;
        this.lastRawSeen = rawFishCount();
        this.log(`mule: holding ${notedAfter} noted sharks (0 unnoted) — looking for ${who}`);
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
        if (typeof Trade === 'undefined' || typeof Trade.myOffer !== 'function') {
            return false;
        }
        return Trade.myOffer().some(i => isMuleFish(i.name));
    }

    async driveMuleTrade() {
        const who = this.mulePartner();
        const before = muleFishHeldCount();

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
                    this.log('mule: Offer-All noted cooked sharks');
                }
                this.status = 'mule: offering fish';
                const offerNoted = i => {
                    if (!isMuleFish(i.name)) {
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
                    for (const name of muleFishNamesHeld()) {
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
                    this.log('mule: offerAll sharks failed — declining');
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

        const gone = before - muleFishHeldCount();
        if (gone > 0 || muleFishHeldCount() <= 0) {
            this.muled += Math.max(0, gone);
            this.muleTrips++;
            this.lastBankCooked = 0;
            await this.resumeFishingAfterMule(
                `trade over — delivered ${gone > 0 ? gone : 'all'} cooked sharks to ${who}`
            );
            return;
        }
        this.log('mule: trade over but sharks still held — will re-request');
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
        const cookMode = this.cookOnWay && canCookSharks() ? 'cook→bank' : 'bank raw';
        const muleBit = this.muleWanted()
            ? `  mule ${this.muled} (${this.lastBankCooked}/${this.muleThreshold()} ${this.mulePartner() || 'no name'})`
            : '';

        const lines = [
            `Benzyme's Guild Sharks  Fish ${Skills.level('fishing')}  Cook ${Skills.level('cooking')}`,
            `time ${fmtElapsed(elapsed)}  ·  ${cookMode}  ·  ${this.status}`,
            `caught ${this.caught} (${fmtXph(caughtPh)}/hr)  cooked ${this.cooked} (${fmtXph(cookedPh)}/hr)`,
            `harpoon ${hasHarpoon() ? 'yes' : 'NO'}  bank ${this.bankTrips}  Fish XP ${fmtXph(fishXph)}/hr` +
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
        ctx.fillStyle = '#7eb8da';
        lines.forEach((line, i) => {
            ctx.fillText(line, 6 + pad, 6 + pad + (i + 1) * lineH - 4);
        });
    }
}

export default defineBot({
    name: SCRIPT_NAME,
    version: '1.3.2',
    category: 'Fishing',
    tags: ['fishing', 'fishing-guild', 'shark', 'harpoon', 'bank', 'cook', 'mule'],
    description:
        "Benzyme's Fishing Guild Sharks — harpoons sharks on Net+Harpoon spots, then banks. Optional cook on the range at 2615,3396 (drop burnt) before banking. Optional mule: once banked cooked sharks reach the amount you set, withdraw as notes and trade them to the named mule at the Fishing Guild bank, then keep fishing. Withdraws a Harpoon from the guild bank or loots the entrance-hall spawn. If still missing, buys one from Harry (Catherby); if coins are short, sells a bank item at Arhein's general store first. Needs Fishing 68 to enter, 76 to catch sharks, Cooking 80 to cook (banks raw below that).",
    settingsSchema: {
        cookOnWay: {
            type: 'boolean',
            default: true,
            label: 'Cook on way to bank',
            group: 'Cooking',
            help:
                'When the pack is full, cook Raw shark on the range at 2615,3396 (Cooking 80+), drop burnt, then bank. Turn off to bank raw sharks instead.'
        },
        muleOn: {
            type: 'boolean',
            default: false,
            label: 'Mule mode',
            group: 'Mule',
            help:
                'Keep fishing, cooking, and banking. Once cooked sharks in the bank reach Cooked fish to mule, withdraw them as notes at the Fishing Guild bank and trade to the mule username. After the trade, resume fishing. Pause then Edit parameters to change without stopping.'
        },
        muleName: {
            type: 'string',
            default: DEFAULT_MULE_NAME,
            label: 'Mule username',
            group: 'Mule',
            help:
                'Exact in-game name of the player who stands at the Fishing Guild bank to take the noted cooked sharks.'
        },
        muleThreshold: {
            type: 'number',
            default: DEFAULT_MULE_THRESHOLD,
            min: 1,
            max: 10_000,
            label: 'Cooked fish to mule',
            group: 'Mule',
            help:
                'How many cooked sharks must be in the bank before muling (1–10000). After each successful trade, fishing continues until this amount is banked again.'
        }
    },
    create: () => new FishingGuildSharks()
});
