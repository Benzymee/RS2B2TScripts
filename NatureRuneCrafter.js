/**
 * NatureRuneCrafter: craft Nature runes via Jiminua's Jungle Store.
 * Lost City revision 289 (17 January 2005). Sell noted Rune essence to
 * Jiminua (junglestore allstock), buy it back unnoted, walk north then
 * east of the Tai Bwo Wannai huts, then south-east on tree-clear jungle
 * tiles to the Mysterious ruins. Use a Nature talisman on the ruins (no
 * tiaras in 289). Craft-rune at the Altar, Portal Use
 * to exit. Same path back. Never enters Shilo Village.
 * There is no hardwood grove in 289 (Tai Bwo Wannai Cleanup is August
 * 2005). Keeps a dose of Antipoison(3) from Jiminua. If HP drops below
 * 30%, or the walk gets stuck, or a random tele pulls us off Karamja,
 * casts Ardougne Teleport, restocks 50 Law runes and 100 Water runes at
 * the south bank, heals if needed, then boats back to Brimhaven.
 * Completely vibe coded by @.benzyme on Discord via Cursor AI.
 * Self-contained ESM for rs2b0t Load local script / Load URL.
 *
 * Load URL: https://benzymee.github.io/RS2B2TScripts/NatureRuneCrafter.js
 */
const SUPPORTED_API_VERSION = 1;
const abi = globalThis.__rs2b0t;
if (!abi) {
    throw new Error('NatureRuneCrafter: globalThis.__rs2b0t missing, load inside rs2b0t bot.html');
}
if (abi.apiVersion !== SUPPORTED_API_VERSION) {
    throw new Error(
        `NatureRuneCrafter: ABI ${abi.apiVersion} != supported ${SUPPORTED_API_VERSION}`
    );
}

const {
    defineBot,
    Execution,
    Game,
    LoopingBot,
    Locs,
    Npcs,
    Inventory,
    Equipment,
    Bank,
    Banking,
    Shop,
    Traversal,
    DirectNavigator,
    Tile,
    Skills,
    ChatDialog,
    withdrawOp
} = abi;

const SCRIPT_NAME = 'NatureRuneCrafter';
const SCRIPT_TITLE = "Benzyme's Natures";
const SCRIPT_VERSION = '3.3';
const SCRIPT_VERSION_FULL = '3.3.0';
const WELCOME_SCREEN_ID = 5993;

const TITLE_NATURE_GREEN = '#3ecf5a';

const NATURE_RUNE_PNG = 'data:image/png;base64,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';
const natureRuneIcon = typeof Image !== 'undefined' ? new Image() : null;
if (natureRuneIcon) {
    natureRuneIcon.src = NATURE_RUNE_PNG;
}

function T(x, z, level = 0) {
    return new Tile(x, z, level);
}

const TALISMAN_NAME = 'Nature talisman';
const ESSENCE_NAME = 'Rune essence';
const NATURE_RUNE_NAMES = ['Nature rune', 'Nature runes'];
const RUNECRAFT_SKILLS = ['runecraft', 'runecrafting'];
const STORE_KEEPER = 'Jiminua';
const STORE_KEEPER_ALTS = ['Jiminua', 'jiminua'];

const RC_LEVEL_NEED = 44;
const HEAL_HP_PERCENT = 30;
const HEAL_DONE_PERCENT = 80;
const ARDY_TELE_LEVEL = 51;
const LAW_PER_TELE = 2;
const WATER_PER_TELE = 2;
const LAW_KEEP = 50;
const WATER_KEEP = 100;
const ARDY_TELE_NAMES = ['Ardougne Teleport', 'Ardougne teleport'];
const STUCK_TELE_STRIKES = 4;
const FOOD_WITHDRAW = 8;
const BOAT_FARE = 30;
const BOAT_RESERVE = 60;
const ESSENCE_BUY_GP = 6;
const ANTI_BUY_GP = 400;
/** runecraft.rs2 treats coordz > 4800 as inside a temple. Nature enter is 2400,4835. */
const TEMPLE_MIN_Z = 4800;
const TEMPLE_MAX_Z = 5000;
const MAX_ENTER_FAILS = 3;
const RUINS_RADIUS = 10;
const STORE_RADIUS = 8;
const BANK_RADIUS = 8;
const PIN_LOOSE = 6;
const PIN_FOLLOW = 5;
/** Furthest tile a minimap / scene walk click can target. */
const CLICK_RANGE = 24;

/**
 * Lost City 289 coords (plane_mx_mz_lx_lz → x=mx*64+lx, z=mz*64+lz).
 * runecraft.dbrow [runecraft_nature]:
 *   altar_coord 0_44_47_53_11 = 2869,3019 (talisman locate / ruins)
 *   enter_coord 0_37_75_32_35 = 2400,4835 (inside temple)
 *   exit_coord  0_44_47_49_14 = 2865,3022 (portal landing)
 * maps/m44_47.jm2 loc naturetemple_ruined (id 2460) at lx 52, lz 10 = 2868,3018.
 * maps/m43_48.jm2 npc jiminua (id 560) at lx 15, lz 50 = 2767,3122, indoors.
 */
const RUINS_STAND = T(2869, 3019);
const RUINS_APPROACH = T(2865, 3022);
const TEMPLE_ENTER = T(2400, 4835);
/** Jiminua spawn, north-west of Tai Bwo Wannai. moverestrict=indoors. */
const STORE_STAND = T(2767, 3122);
/** Customs officer (id 380) on maps/m43_50.jm2 at 2772,3225 / 2772,3231 / 2773,3229. */
const BRIMHAVEN_DOCK = T(2772, 3227);
/** Captain Barnaby (id 381) on maps/m41_51.jm2 at 0 55 11 = 2679,3275. */
const ARDOUGNE_DOCK = T(2679, 3275);
/** East Ardougne south bank. */
const BANK_STAND = T(2655, 3286);

/**
 * Jiminua → nature ruins. Reverse is the store trip.
 * Pins from 289 map locs (m43_47/48, m44_47/48): A* around bamboo_wall
 * (max x 2814) and jungle/bamboo tree tiles, 1-tile tree buffer.
 * North of the huts, then south-east through open jungle to the portal
 * landing. No hardwood grove fence in 289.
 */
const HUT_EXIT = T(2776, 3115);
const NORTH_PATH = T(2791, 3119);
const VILLAGE_EAST = T(2815, 3115);
const JUNGLE_NE = T(2834, 3091);
const JUNGLE_MID = T(2848, 3072);
const JUNGLE_SOUTH = T(2851, 3048);
const RUINS_PATH = T(2858, 3032);
const SKIRT_Z = VILLAGE_EAST.z;
const JUNGLE_ROUTE = [
    STORE_STAND,
    HUT_EXIT,
    NORTH_PATH,
    VILLAGE_EAST,
    JUNGLE_NE,
    JUNGLE_MID,
    JUNGLE_SOUTH,
    RUINS_PATH,
    RUINS_APPROACH
];
const TO_RUINS = JUNGLE_ROUTE;
const TO_STORE = [...JUNGLE_ROUTE].reverse();

/** Shilo Village. North gate is ~2866,2971. Do not walk in or click these gates. */
function inShilo(tile = Game.tile()) {
    const t = tileOf(tile);
    return !!t && (t.level ?? 0) === 0 && inBox(t, 2816, 2936, 2888, 2992);
}

/** Tai Bwo Wannai hut cluster. bamboo_wall on m43_47/m43_48 is x 2773-2814, z 3037-3105. */
function inTaiHuts(tile = Game.tile()) {
    const t = tileOf(tile);
    return !!t && (t.level ?? 0) === 0 && inBox(t, 2772, 3036, 2816, 3106);
}

function inBlockedJungle(tile = Game.tile()) {
    return inShilo(tile);
}

function shouldSkipJungleGate(tile) {
    const t = tileOf(tile);
    if (!t || (t.level ?? 0) !== 0) {
        return false;
    }
    if (nearStore(t)) {
        return false;
    }
    if (inShilo(t) || t.z < 3028) {
        return true;
    }
    return inBox(t, 2770, 3036, 2818, 3118);
}

/** Brimhaven dock → Jiminua. Reverse is the heal-boat trip. */
const BRIM_ROUTE = [
    BRIMHAVEN_DOCK,
    T(2772, 3200),
    T(2768, 3172),
    T(2764, 3146),
    STORE_STAND
];
const TO_STORE_FROM_DOCK = BRIM_ROUTE;
const TO_DOCK = [...BRIM_ROUTE].reverse();

/** Musa Point west-bound if the script is started on the east coast. */
const MUSA_TO_STORE = [
    T(2910, 3148),
    T(2888, 3132),
    T(2864, 3120),
    T(2838, 3116),
    VILLAGE_EAST,
    NORTH_PATH,
    HUT_EXIT,
    STORE_STAND
];

const ARDY_SAILORS = ['Captain Barnaby'];
const BRIM_SAILORS = ['Customs officer'];
const TALK_OP = 'Talk-to';

const BRIMHAVEN_DIALOG_PREFER = [
    'brimhaven',
    "i'd like to go to brimhaven",
    'yes please',
    'yes',
    'ok',
    'okay'
];
const ARDOUGNE_DIALOG_PREFER = [
    'search away',
    'nothing to hide',
    'can i journey',
    'journey on this ship',
    'ardougne',
    "i'd like to go to ardougne",
    'ok',
    'okay',
    'yes please',
    'yes'
];
const DIALOG_AVOID = [
    'no, thank',
    'no thank',
    "i'm good",
    'nowhere',
    'rimmington',
    'pandemonium',
    'actually, i don',
    'pay you nothing',
    'not bother',
    'unusual customs',
    'personal use',
    "you're not putting",
    'why?'
];

const DEATH_RE = /oh dear.*you are dead/i;
const POISONED_RE = /you have been poisoned/i;
const CURED_RE = /poison has worn off|no longer poisoned|poison wears off|cured of (the )?poison/i;
const GATE_BLOCKED_RE = /do not have permission to enter/i;

const ANTI_NAMES = [
    'Antipoison(3)',
    'Antipoison(4)',
    'Antipoison(2)',
    'Antipoison(1)',
    'Superantipoison(3)',
    'Superantipoison(4)',
    'Superantipoison(2)',
    'Superantipoison(1)'
];

/** Highest heal first. Used when picking bank food for the Ardougne heal. */
const FOOD_HEAL = [
    ['manta ray', 22],
    ['dark crab', 22],
    ['pineapple pizza', 22],
    ['sea turtle', 21],
    ['shark', 20],
    ['anchovy pizza', 18],
    ['monkfish', 16],
    ['meat pizza', 16],
    ['swordfish', 14],
    ['plain pizza', 14],
    ['pizza', 14],
    ['bass', 13],
    ['lobster', 12],
    ['cake', 12],
    ['2/3 cake', 8],
    ['slice of cake', 4],
    ['tuna', 10],
    ['salmon', 9],
    ['pike', 8],
    ['trout', 7],
    ['bread', 5],
    ['cooked meat', 3],
    ['cooked chicken', 3],
    ['shrimp', 3],
    ['anchovies', 3],
    ['sardine', 4],
    ['herring', 5]
];

function welcomeHost() {
    return globalThis.rs2b0t ?? null;
}

function stopScript() {
    const host = welcomeHost();
    if (typeof host?.stopScript === 'function') {
        host.stopScript();
        return;
    }
    if (typeof host?.runner?.stop === 'function') {
        host.runner.stop();
    }
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

function normName(name) {
    return (name ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function nameIs(name, list) {
    const n = normName(name);
    return list.some(s => n === normName(s));
}

function cheb(a, b) {
    if (!a || !b) {
        return 99;
    }
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
}

function tileOf(t = Game.tile()) {
    return t ? Tile.from(t) : null;
}

function inBox(tile, x0, z0, x1, z1) {
    if (!tile) {
        return false;
    }
    const x = tile.x;
    const z = tile.z;
    return x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && z >= Math.min(z0, z1) && z <= Math.max(z0, z1);
}

function isTalisman(name) {
    return nameIs(name, [TALISMAN_NAME]);
}

/** 289 blankrune only. Notes are cert_blankrune (same display name, id 1437). */
const UNNOTED_ESSENCE_IDS = new Set([1436]);
const NOTED_ESSENCE_IDS = new Set([1437]);

function isEssence(name, id) {
    if (typeof id === 'number' && (UNNOTED_ESSENCE_IDS.has(id) || NOTED_ESSENCE_IDS.has(id))) {
        return true;
    }
    const n = normName(name);
    if (!n) {
        return false;
    }
    if (n.includes('pure essence')) {
        return false;
    }
    if (n.includes('rune essence')) {
        return true;
    }
    return n === 'essence' || n === 'blank rune' || n === 'blankrune';
}

function isNatureRune(name) {
    return nameIs(name, NATURE_RUNE_NAMES);
}

function isCoins(name) {
    const n = normName(name);
    return n === 'coins' || n === 'coin' || n === 'money';
}

function isAntipoison(name) {
    const n = normName(name);
    return /anti-?poison/.test(n);
}

function objType(id) {
    if (typeof id !== 'number' || id < 0) {
        return null;
    }
    try {
        const OT =
            globalThis.ObjType ??
            abi.ObjType ??
            globalThis.__rs2b0t?.ObjType ??
            globalThis.__client?.ObjType ??
            null;
        if (!OT || typeof OT.list !== 'function') {
            return null;
        }
        return OT.list(id) ?? null;
    } catch {
        return null;
    }
}

function isNoteId(id) {
    if (typeof id === 'number' && NOTED_ESSENCE_IDS.has(id)) {
        return true;
    }
    if (typeof id === 'number' && UNNOTED_ESSENCE_IDS.has(id)) {
        return false;
    }
    const t = objType(id);
    if (!t) {
        return false;
    }
    const tmpl = t.certtemplate ?? t.certTemplate;
    if (typeof tmpl === 'number' && tmpl >= 0 && tmpl !== id && tmpl !== -1) {
        return true;
    }
    return false;
}

/**
 * True / false / null. null means ObjType did not say, so callers can fall
 * back to stack size (unnoted essence never stacks).
 */
function certIsEssenceNote(id) {
    if (typeof id === 'number' && NOTED_ESSENCE_IDS.has(id)) {
        return true;
    }
    if (typeof id === 'number' && UNNOTED_ESSENCE_IDS.has(id)) {
        return false;
    }
    const t = objType(id);
    if (!t) {
        return null;
    }
    const tmpl = t.certtemplate ?? t.certTemplate;
    if (tmpl === undefined || tmpl === null || typeof tmpl !== 'number') {
        return null;
    }
    if (tmpl === -1) {
        return false;
    }
    return tmpl >= 0 && tmpl !== id;
}

/**
 * Noted vs unnoted Rune essence. Unnoted blankrune never stacks, so
 * count > 1 is always a bank note even when certtemplate is missing.
 */
function isNotedEssenceItem(item) {
    if (!item || !isEssence(item.name, item.id)) {
        return false;
    }
    if (typeof item.id === 'number' && NOTED_ESSENCE_IDS.has(item.id)) {
        return true;
    }
    if (typeof item.id === 'number' && UNNOTED_ESSENCE_IDS.has(item.id)) {
        return false;
    }
    const n = normName(item.name);
    if (/\(noted\)|\bnoted\b|certificate/.test(n)) {
        return true;
    }
    if (item.noted === true || item.isNoted === true || item.note === true) {
        return true;
    }
    if (Math.max(1, item.count ?? 1) > 1) {
        return true;
    }
    const cert = certIsEssenceNote(item.id);
    return cert === true;
}

function isUnnotedEssenceDeposit(name, id) {
    if (typeof id === 'number') {
        if (NOTED_ESSENCE_IDS.has(id)) {
            return false;
        }
        if (UNNOTED_ESSENCE_IDS.has(id)) {
            return true;
        }
    }
    return isEssence(name, id) && !isNoteId(id);
}

function isNotedEssenceDeposit(name, id) {
    if (typeof id === 'number') {
        return NOTED_ESSENCE_IDS.has(id);
    }
    return isEssence(name, id) && isNoteId(id);
}

function isUnnotedEssenceItem(item) {
    return !!item && isEssence(item.name, item.id) && !isNotedEssenceItem(item);
}

function invItems() {
    try {
        return Inventory.items() ?? [];
    } catch {
        return [];
    }
}

function countMatching(pred) {
    return invItems()
        .filter(i => pred(i))
        .reduce((n, i) => n + Math.max(1, i.count ?? 1), 0);
}

function talismanCount() {
    return countMatching(i => isTalisman(i.name) && !isNoteId(i.id));
}

function essenceCount() {
    return invItems()
        .filter(isUnnotedEssenceItem)
        .reduce((n, i) => n + 1, 0);
}

function notedEssenceCount() {
    return invItems()
        .filter(isNotedEssenceItem)
        .reduce((n, i) => n + Math.max(1, i.count ?? 1), 0);
}

function natureRuneCount() {
    return countMatching(i => isNatureRune(i.name));
}

function coinCount() {
    return countMatching(i => isCoins(i.name));
}

function isLawName(name) {
    const n = normName(name);
    return n === 'law rune' || n === 'law runes';
}

function isWaterRuneName(name) {
    const n = normName(name);
    return n === 'water rune' || n === 'water runes';
}

function isWaterStaffName(name) {
    const n = normName(name);
    return n.includes('staff of water') || n === 'water staff' || n.includes('water battlestaff');
}

function lawCount() {
    return countMatching(i => isLawName(i.name) && !isNoteId(i.id));
}

function waterRuneCount() {
    return countMatching(i => isWaterRuneName(i.name) && !isNoteId(i.id));
}

function hasWaterStaff() {
    return equippedNames().some(n => isWaterStaffName(n)) || invItems().some(i => isWaterStaffName(i.name));
}

function waterNeededForTele() {
    return hasWaterStaff() ? 0 : WATER_PER_TELE;
}

function magicLevel() {
    try {
        return Skills.level('magic') || 1;
    } catch {
        return 1;
    }
}

function canCastArdougneTeleport() {
    if (magicLevel() < ARDY_TELE_LEVEL) {
        return false;
    }
    return lawCount() >= LAW_PER_TELE && waterRuneCount() >= waterNeededForTele();
}

function teleRunesNeedRestock() {
    if (lawCount() < LAW_KEEP) {
        return true;
    }
    return !hasWaterStaff() && waterRuneCount() < WATER_KEEP;
}

function antipoisonCount() {
    return countMatching(i => isAntipoison(i.name) && !isNoteId(i.id));
}

function hasTalisman() {
    return talismanCount() > 0;
}

function hasEntryItem() {
    return hasTalisman();
}

/** Unnoted Rune essence, a dose of antipoison, and a Nature talisman. */
function readyForAltar() {
    return hasEssence() && hasAntipoison() && hasEntryItem();
}

function hasEssence() {
    return essenceCount() > 0;
}

function hasAntipoison() {
    return antipoisonCount() > 0;
}

function hasNotedEssence() {
    return notedEssenceCount() > 0;
}

function findNotedEssence() {
    const hits = invItems().filter(isNotedEssenceItem);
    hits.sort((a, b) => Math.max(1, b.count ?? 1) - Math.max(1, a.count ?? 1));
    return hits[0] ?? null;
}

function findUnnotedEssenceName() {
    const noted = findNotedEssence();
    if (noted?.name) {
        return String(noted.name).replace(/\s*\(noted\)\s*/i, '').trim();
    }
    const raw = invItems().find(isUnnotedEssenceItem);
    return raw?.name ?? ESSENCE_NAME;
}

function findTalisman() {
    return invItems().find(i => isTalisman(i.name) && !isNoteId(i.id)) ?? null;
}

function findAntipoison() {
    return invItems().find(i => isAntipoison(i.name) && !isNoteId(i.id)) ?? null;
}

function lastEssence() {
    const items = invItems();
    for (let i = items.length - 1; i >= 0; i--) {
        if (isUnnotedEssenceItem(items[i])) {
            return items[i];
        }
    }
    return null;
}

function invFree() {
    if (typeof Inventory.free === 'function') {
        return Inventory.free();
    }
    const used = typeof Inventory.used === 'function' ? Inventory.used() : invItems().length;
    return Math.max(0, 28 - used);
}

function itemActions(item) {
    if (!item) {
        return [];
    }
    try {
        if (typeof item.actions === 'function') {
            return item.actions() ?? [];
        }
        if (Array.isArray(item.actions)) {
            return item.actions;
        }
        if (Array.isArray(item.ops)) {
            return item.ops;
        }
    } catch {
        /* ignore */
    }
    return [];
}

function drinkOp(item) {
    return itemActions(item).find(a => /^(drink|sip)/i.test(a ?? '')) ?? null;
}

function eatOp(item) {
    return itemActions(item).find(a => /^eat$/i.test(a ?? '')) ?? null;
}

function foodHealOf(name) {
    const n = normName(name);
    let best = 0;
    for (const [key, heal] of FOOD_HEAL) {
        if (n === key || n.includes(key)) {
            best = Math.max(best, heal);
        }
    }
    return best;
}

function keepInPack(name) {
    return (
        isCoins(name) ||
        isEssence(name) ||
        isNatureRune(name) ||
        isTalisman(name) ||
        isAntipoison(name) ||
        isLawName(name) ||
        isWaterRuneName(name)
    );
}

function equippedNames() {
    const names = [];
    try {
        if (typeof Equipment?.items === 'function') {
            for (const i of Equipment.items()) {
                if (i?.name) {
                    names.push(i.name);
                }
            }
        }
    } catch {
        /* unread */
    }
    return names;
}

function currentHp() {
    try {
        return Math.max(0, Number(Skills.effective('hitpoints')) || 0);
    } catch {
        return 0;
    }
}

function maxHp() {
    try {
        return Math.max(1, Skills.level('hitpoints') || 1);
    } catch {
        return 1;
    }
}

function hpPercent() {
    return (currentHp() / maxHp()) * 100;
}

function hpTooLow() {
    return hpPercent() < HEAL_HP_PERCENT;
}

function hpHealedEnough() {
    return hpPercent() >= HEAL_DONE_PERCENT;
}

function rcSkillName() {
    for (const n of RUNECRAFT_SKILLS) {
        try {
            const xp = Skills.xp(n);
            if (typeof xp === 'number' && xp >= 0) {
                return n;
            }
        } catch {
            /* try next */
        }
    }
    return 'runecraft';
}

function rcLevel() {
    try {
        return Skills.level(rcSkillName()) || 1;
    } catch {
        return 1;
    }
}

function rcXp() {
    try {
        return Skills.xp(rcSkillName()) || 0;
    } catch {
        return 0;
    }
}

function locActions(loc) {
    if (!loc) {
        return [];
    }
    try {
        if (typeof loc.actions === 'function') {
            return loc.actions() ?? [];
        }
    } catch {
        /* ignore */
    }
    return [];
}

function locTile(loc) {
    try {
        const t = typeof loc.tile === 'function' ? loc.tile() : loc.tile;
        return t ? Tile.from(t) : null;
    } catch {
        return null;
    }
}

function locName(loc) {
    return (loc?.name ?? '').toLowerCase();
}

function isShutDoor(loc) {
    const name = locName(loc);
    if (!name.includes('door') && !name.includes('gate')) {
        return false;
    }
    return locActions(loc).some(a => /^open/i.test(a ?? ''));
}

function openDoorOp(loc) {
    return locActions(loc).find(a => /^open/i.test(a ?? '')) ?? null;
}

function portalOp(loc) {
    const acts = locActions(loc);
    return (
        acts.find(a => /^(use|enter|exit|walk-through|pass)/i.test(a ?? '')) ??
        acts.find(a => /use|enter|exit|pass/i.test(a ?? '')) ??
        null
    );
}

function craftOp(loc) {
    const acts = locActions(loc);
    return (
        acts.find(a => a === 'Craft-rune') ??
        acts.find(a => /craft/i.test(a ?? '')) ??
        acts.find(a => /^use$/i.test(a ?? '')) ??
        null
    );
}

function findRuins() {
    return (
        Locs.query()
            .name('Mysterious ruins', 'Mysterious Ruins')
            .where(l => {
                const t = locTile(l);
                return t && cheb(t, RUINS_STAND) <= 14;
            })
            .nearest() ??
        Locs.query()
            .where(l => /mysterious\s*ruins|ruins/i.test(locName(l)))
            .where(l => {
                const t = locTile(l);
                return t && cheb(t, RUINS_STAND) <= 14;
            })
            .nearest() ??
        Locs.query()
            .where(l => /mysterious\s*ruins/i.test(locName(l)))
            .nearest() ??
        null
    );
}

function findCraftAltar() {
    return (
        Locs.query()
            .name('Altar')
            .where(l => !/mysterious/i.test(locName(l)))
            .nearest() ??
        Locs.query()
            .where(l => {
                const n = locName(l);
                return /\baltar\b/i.test(n) && !/mysterious/i.test(n);
            })
            .nearest() ??
        null
    );
}

function findPortal() {
    return (
        Locs.query().name('Portal').nearest() ??
        Locs.query()
            .where(l => /\bportal\b/i.test(locName(l)))
            .nearest() ??
        null
    );
}

function inAltarInterior(tile = Game.tile()) {
    const t = tileOf(tile);
    if (!t) {
        return false;
    }
    if (t.z >= TEMPLE_MIN_Z && t.z <= TEMPLE_MAX_Z) {
        return true;
    }
    if (cheb(t, TEMPLE_ENTER) <= 24) {
        return true;
    }
    if (cheb(t, RUINS_STAND) <= 25 || cheb(t, STORE_STAND) <= 40 || cheb(t, BANK_STAND) <= 40) {
        return false;
    }
    return findPortal() != null && findCraftAltar() != null;
}

function nearRuins(tile = Game.tile()) {
    const t = tileOf(tile);
    return !!t && (t.level ?? 0) === 0 && cheb(t, RUINS_STAND) <= RUINS_RADIUS + 4;
}

function nearStore(tile = Game.tile()) {
    const t = tileOf(tile);
    return !!t && (t.level ?? 0) === 0 && cheb(t, STORE_STAND) <= STORE_RADIUS + 4;
}

function nearBank(tile = Game.tile()) {
    const t = tileOf(tile);
    return !!t && (t.level ?? 0) === 0 && cheb(t, BANK_STAND) <= BANK_RADIUS + 4;
}

function nearBrimDock(tile = Game.tile()) {
    const t = tileOf(tile);
    return !!t && cheb(t, BRIMHAVEN_DOCK) <= 8;
}

function nearArdyDock(tile = Game.tile()) {
    const t = tileOf(tile);
    return !!t && cheb(t, ARDOUGNE_DOCK) <= 8;
}

function findGangplank(radius = 12) {
    return bestDisembarkPlank(nearerDock(), radius);
}

function gangplanks(radius = 20) {
    try {
        const q = Locs.query()
            .within(radius)
            .where(l => /gangplank/i.test(locName(l)));
        if (typeof q.results === 'function') {
            return q.results() ?? [];
        }
        const n = typeof q.nearest === 'function' ? q.nearest() : null;
        return n ? [n] : [];
    } catch {
        return [];
    }
}

function bestDisembarkPlank(dock = nearerDock(), radius = 20) {
    const list = gangplanks(radius);
    let best = null;
    let bestD = 99;
    for (const p of list) {
        const pt = locTile(p);
        if (!pt) {
            continue;
        }
        const d = cheb(pt, dock);
        if (d < bestD) {
            best = p;
            bestD = d;
        }
    }
    return best;
}

function atDockStand(tile = Game.tile()) {
    const t = tileOf(tile);
    return !!t && (cheb(t, BRIMHAVEN_DOCK) <= 4 || cheb(t, ARDOUGNE_DOCK) <= 4);
}

/**
 * Customs ship decks, not the pier. Brimhaven pier is 2772,3227.
 * Ship arrivals sit north of the pier around 2775,3234. z=3230 on the
 * north box caught the pier and recrossed back onto the boat.
 */
function onCustomsBoat(tile = Game.tile()) {
    const t = tileOf(tile);
    if (!t) {
        return false;
    }
    if (inBox(t, 2678, 3264, 2688, 3271)) {
        return true;
    }
    if (inBox(t, 2768, 3232, 2786, 3246)) {
        return true;
    }
    return inBox(t, 2774, 3210, 2786, 3224);
}

function offBrimhavenShip(tile = Game.tile()) {
    const t = tileOf(tile);
    if (!t) {
        return false;
    }
    if (atDockStand(t)) {
        return true;
    }
    return cheb(t, BRIMHAVEN_DOCK) <= 10 && t.z <= 3230 && t.z >= 3220;
}

function onShipDeck(tile = Game.tile()) {
    return onCustomsBoat(tile);
}

function nearerDock(tile = Game.tile()) {
    const t = tileOf(tile);
    if (!t) {
        return BRIMHAVEN_DOCK;
    }
    return cheb(t, BRIMHAVEN_DOCK) <= cheb(t, ARDOUGNE_DOCK) ? BRIMHAVEN_DOCK : ARDOUGNE_DOCK;
}

function onKaramja(tile = Game.tile()) {
    const t = tileOf(tile);
    return !!t && (t.level ?? 0) === 0 && inBox(t, 2688, 2880, 2985, 3264);
}

function inArdougne(tile = Game.tile()) {
    const t = tileOf(tile);
    return !!t && (t.level ?? 0) === 0 && inBox(t, 2500, 3255, 2730, 3380);
}

function inBrimhaven(tile = Game.tile()) {
    const t = tileOf(tile);
    return !!t && (t.level ?? 0) === 0 && inBox(t, 2740, 3140, 2820, 3290);
}

/** Karamja craft loop, Ardougne bank/boat, or the customs ship. */
function onWorkArea(tile = Game.tile()) {
    const t = tileOf(tile);
    if (!t) {
        return false;
    }
    return (
        inAltarInterior(t) ||
        onKaramja(t) ||
        inBrimhaven(t) ||
        inArdougne(t) ||
        nearBank(t) ||
        nearArdyDock(t) ||
        onCustomsBoat(t)
    );
}

function awayFromWork(tile = Game.tile()) {
    return !onWorkArea(tile);
}

function whereLabel(tile = Game.tile()) {
    const t = tileOf(tile);
    if (!t) {
        return '...';
    }
    if (inAltarInterior(t)) {
        return 'altar';
    }
    if (nearRuins(t)) {
        return 'ruins';
    }
    if (nearStore(t)) {
        return 'Jiminua';
    }
    if (nearBrimDock(t) || inBrimhaven(t)) {
        return 'Brimhaven';
    }
    if (nearBank(t)) {
        return 'Ardy bank';
    }
    if (inArdougne(t)) {
        return 'Ardougne';
    }
    if (onKaramja(t)) {
        return 'Karamja';
    }
    return `${t.x},${t.z}`;
}

function walkTarget(dest) {
    if (dest && cheb(dest, RUINS_STAND) <= 2) {
        return RUINS_APPROACH;
    }
    return dest;
}

function viasFor(here, dest) {
    if (!here || !dest) {
        return [];
    }
    if (inAltarInterior(here) || inAltarInterior(dest)) {
        return [];
    }
    const destIsRuins = cheb(dest, RUINS_STAND) <= 20 || cheb(dest, RUINS_APPROACH) <= 4;
    const destIsStore = cheb(dest, STORE_STAND) <= 12;
    const destIsDock = cheb(dest, BRIMHAVEN_DOCK) <= 10;
    if (destIsRuins) {
        return TO_RUINS;
    }
    if (destIsStore) {
        if (nearBrimDock(here) || inBrimhaven(here) || (here.z >= 3170 && here.x <= 2795)) {
            return TO_STORE_FROM_DOCK;
        }
        if (here.x >= 2880 && here.z >= 3120) {
            return MUSA_TO_STORE;
        }
        return TO_STORE;
    }
    if (destIsDock) {
        return TO_DOCK;
    }
    return [];
}

function pinListTo(dest, vias) {
    const pins = Array.isArray(vias) ? vias.filter(Boolean) : [];
    if (dest && cheb(dest, RUINS_STAND) <= 2) {
        return pins;
    }
    if (dest && (!pins.length || cheb(pins[pins.length - 1], dest) > 1)) {
        pins.push(dest);
    }
    return pins;
}

function inCombat() {
    return typeof Game.inCombat === 'function' && Game.inCombat();
}

function stepToward(from, to, maxStep = CLICK_RANGE) {
    if (!from || !to) {
        return to;
    }
    const d = cheb(from, to);
    if (d <= maxStep) {
        return to;
    }
    const n = Math.ceil(d / maxStep);
    return T(
        Math.round(from.x + (to.x - from.x) / n),
        Math.round(from.z + (to.z - from.z) / n),
        to.level ?? from.level ?? 0
    );
}

function samePin(a, b) {
    return !!a && !!b && a.x === b.x && a.z === b.z && (a.level ?? 0) === (b.level ?? 0);
}

function alreadyPastVillageEast(pin, here, nextPin) {
    if (!pin || !here || !samePin(pin, VILLAGE_EAST)) {
        return false;
    }
    if (nextPin && nextPin.z < SKIRT_Z) {
        return here.x >= VILLAGE_EAST.x - 2 && here.z <= JUNGLE_NE.z + 2;
    }
    if (nextPin && nextPin.x < VILLAGE_EAST.x) {
        return here.x <= VILLAGE_EAST.x - 2 && here.z >= SKIRT_Z - 2 && here.z <= SKIRT_Z + 6;
    }
    return false;
}

function isMustVisitPin(pin) {
    return samePin(pin, VILLAGE_EAST);
}

/** Advance when close. Must-visit village-east pins only when actually there, unless already past. */
function skipPassedPins(route, here, pinIndex) {
    let i = Math.max(0, pinIndex);
    while (i < route.length) {
        const pin = route[i];
        const nextPin = i + 1 < route.length ? route[i + 1] : null;
        const reach = isMustVisitPin(pin) ? PIN_LOOSE : 12;
        if (cheb(pin, here) <= reach || alreadyPastVillageEast(pin, here, nextPin)) {
            i++;
            continue;
        }
        if (
            !isMustVisitPin(pin) &&
            nextPin &&
            cheb(here, nextPin) + 2 < cheb(here, pin)
        ) {
            i++;
            continue;
        }
        break;
    }
    return i;
}

/** Furthest pin within click range that does not skip an unvisited village-east pin. */
function furthestSafePin(route, start, here) {
    const i0 = Math.max(0, start);
    if (i0 >= route.length) {
        return Math.max(0, route.length - 1);
    }
    let best = i0;
    for (let i = i0; i < route.length; i++) {
        if (cheb(route[i], here) > CLICK_RANGE) {
            break;
        }
        let skippedVillageEast = false;
        for (let j = i0; j < i; j++) {
            const nextPin = j + 1 < route.length ? route[j + 1] : null;
            if (
                isMustVisitPin(route[j]) &&
                cheb(route[j], here) > PIN_LOOSE &&
                !alreadyPastVillageEast(route[j], here, nextPin)
            ) {
                skippedVillageEast = true;
                break;
            }
        }
        if (skippedVillageEast) {
            break;
        }
        best = i;
    }
    return best;
}

function nearVillageEast(tile = Game.tile()) {
    const t = tileOf(tile);
    return !!t && (t.level ?? 0) === 0 && inBox(t, 2804, 3104, 2830, 3122);
}

function onVillageSkirt(tile = Game.tile()) {
    const t = tileOf(tile);
    return !!t && t.x >= 2768 && t.x <= 2824 && t.z >= SKIRT_Z - 4 && t.z <= SKIRT_Z + 8;
}

function corridorUnstick(here, dest) {
    if (inTaiHuts(here)) {
        return T(Math.max(here.x, VILLAGE_EAST.x), SKIRT_Z);
    }
    if (here.z < SKIRT_Z - 2 && here.x < VILLAGE_EAST.x) {
        return T(Math.max(here.x, VILLAGE_EAST.x), SKIRT_Z);
    }
    if (dest && dest.x < here.x - 2) {
        return T(Math.max(here.x - CLICK_RANGE, STORE_STAND.x), SKIRT_Z);
    }
    if (dest && dest.x > here.x + 2) {
        return T(Math.min(here.x + CLICK_RANGE, VILLAGE_EAST.x), SKIRT_Z);
    }
    return T(here.x, SKIRT_Z);
}

function snapPinIndex(route, here) {
    if (!here || !route.length) {
        return 0;
    }
    const usable = [];
    for (let j = 0; j < route.length; j++) {
        const pin = route[j];
        if (inTaiHuts(here) && (pin.x < VILLAGE_EAST.x || inTaiHuts(pin))) {
            continue;
        }
        if (inShilo(here) && (inShilo(pin) || pin.z < 3028)) {
            continue;
        }
        usable.push(j);
    }
    const idxs = usable.length > 0 ? usable : route.map((_, j) => j);
    let on = -1;
    let near = idxs[0];
    let nearD = 9999;
    for (const j of idxs) {
        const d = cheb(route[j], here);
        if (d <= PIN_LOOSE) {
            on = j;
        }
        if (d < nearD || (d === nearD && j > near)) {
            nearD = d;
            near = j;
        }
    }
    if (on >= 0) {
        return skipPassedPins(route, here, on + 1);
    }
    return skipPassedPins(route, here, near);
}

function dialogOpen() {
    if (ChatDialog.canContinue()) {
        return true;
    }
    return (
        typeof ChatDialog.isOpen === 'function' &&
        ChatDialog.isOpen() &&
        typeof ChatDialog.options === 'function' &&
        ChatDialog.options().length > 0
    );
}

function dialogAvoid(opt) {
    const low = (opt ?? '').toLowerCase();
    return DIALOG_AVOID.some(a => low.includes(a));
}

function pickBoatOption(options, prefer) {
    const prefs = Array.isArray(prefer) ? prefer : [prefer];
    const usable = options.filter(o => !dialogAvoid(o));
    const pool = usable.length > 0 ? usable : options;
    for (const p of prefs) {
        const hit = pool.find(o => (o ?? '').toLowerCase().includes(p.toLowerCase()));
        if (hit) {
            return hit;
        }
    }
    const yes = pool.find(o => /^yes/i.test(o ?? ''));
    if (yes) {
        return yes;
    }
    return pool.length > 0 ? pool[0] : null;
}

function talkOp(npc) {
    const acts = typeof npc.actions === 'function' ? npc.actions() : [];
    return acts.find(a => /^talk/i.test(a ?? '')) ?? TALK_OP;
}

function bankItems() {
    return typeof Bank.items === 'function' ? Bank.items() ?? [] : [];
}

function bankFoodCandidates() {
    return bankItems()
        .filter(i => i?.name && foodHealOf(i.name) > 0)
        .sort((a, b) => foodHealOf(b.name) - foodHealOf(a.name));
}

function bestBankFood() {
    return bankFoodCandidates()[0] ?? null;
}

class NatureRuneCrafter extends LoopingBot {
    status = 'starting';
    startedAt = 0;
    rcXpAtStart = 0;
    crafted = 0;
    storeTrips = 0;
    healTrips = 0;
    enterFails = 0;
    done = false;
    died = false;
    poisoned = false;
    healing = false;
    returning = false;
    mustRestock = false;
    parkedUnnoted = 0;
    parkedNoted = false;
    needDisembark = false;
    recovering = false;
    walkStuckStrikes = 0;
    lastGateLog = 0;
    pinIndex = 0;
    pinRouteKey = '';

    async onStart() {
        await Execution.delayUntil(() => Game.ingame() && Game.tile() !== null, 0);
        Traversal.preload();
        if (typeof Banking?.preload === 'function') {
            Banking.preload();
        }

        this.startedAt = Date.now();
        this.rcXpAtStart = rcXp();
        this.crafted = 0;
        this.storeTrips = 0;
        this.healTrips = 0;
        this.enterFails = 0;
        this.done = false;
        this.died = false;
        this.poisoned = false;
        this.healing = hpTooLow();
        this.returning = awayFromWork();
        this.mustRestock = false;
        this.parkedUnnoted = 0;
        this.parkedNoted = false;
        this.needDisembark = false;
        this.recovering = false;
        this.walkStuckStrikes = 0;
        this.lastGateLog = 0;
        this.pinIndex = 0;
        this.pinRouteKey = '';

        this.on('chat.message', e => {
            const text = e?.text ?? '';
            if (DEATH_RE.test(text)) {
                this.died = true;
                this.log('died, Ardougne Teleport back to the south bank');
            }
            if (POISONED_RE.test(text)) {
                this.poisoned = true;
                this.log('poisoned, drinking antipoison');
            }
            if (CURED_RE.test(text)) {
                this.poisoned = false;
            }
            if (GATE_BLOCKED_RE.test(text) && Date.now() - this.lastGateLog > 8000) {
                this.lastGateLog = Date.now();
                this.log('Shilo gate, walking north of the village');
            }
        });

        this.on('skill.level', e => {
            const n = (e.name ?? '').toLowerCase();
            if (n === 'runecraft' || n === 'runecrafting') {
                this.log(`runecraft ${e.previous} → ${e.level}`);
            }
        });

        this.log(
            `${SCRIPT_TITLE} v${SCRIPT_VERSION} RC ${rcLevel()} (need ${RC_LEVEL_NEED}); ` +
                `Lost City 289 Jiminua ${STORE_STAND.x},${STORE_STAND.z} east of Tai Bwo Wannai ` +
                `${HUT_EXIT.x},${HUT_EXIT.z} → ${VILLAGE_EAST.x},${VILLAGE_EAST.z} → ${RUINS_PATH.x},${RUINS_PATH.z} ` +
                `to nature ruins ${RUINS_STAND.x},${RUINS_STAND.z}; ` +
                `heal if HP < ${HEAL_HP_PERCENT}% via Ardougne Teleport, keep ${LAW_KEEP} law and ${WATER_KEEP} water`
        );

        if (rcLevel() < RC_LEVEL_NEED) {
            this.finishDone(
                `stopped, Runecrafting ${rcLevel()} is below ${RC_LEVEL_NEED} required for Nature runes`
            );
            return;
        }

        if (!hasEntryItem()) {
            this.log('WARNING: no Nature talisman in pack');
        }
        const essBits = invItems()
            .filter(i => isEssence(i.name, i.id))
            .map(
                i =>
                    `${i.name ?? 'essence'} id=${i.id ?? '?'} x${i.count ?? 1} ` +
                    `${isNotedEssenceItem(i) ? 'noted' : 'unnoted'}`
            );
        this.log(
            `essence in pack: ${essBits.join('; ') || 'none'} ` +
                `(${essenceCount()} unnoted slots, ${notedEssenceCount()} noted)`
        );
        this.log(
            `tele runes: ${lawCount()} law, ${waterRuneCount()} water` +
                (hasWaterStaff() ? ' (water staff)' : '') +
                `, Magic ${magicLevel()} (need ${ARDY_TELE_LEVEL} for Ardougne Teleport)`
        );
        if (!hasNotedEssence() && !hasEssence()) {
            this.log('WARNING: no Pure / Rune essence (noted or unnoted) in pack');
        }
    }

    onStop() {
        this.log(
            `stopped, crafted ~${this.crafted} nature runes, store trips ${this.storeTrips}, ` +
                `heal trips ${this.healTrips} (${this.status})`
        );
    }

    finishDone(reason) {
        this.done = true;
        this.status = 'done';
        this.log(reason);
        stopScript();
    }

    noteCrafted(beforeRunes, beforeEssence) {
        const nowRunes = natureRuneCount();
        if (nowRunes > beforeRunes) {
            const gained = nowRunes - beforeRunes;
            this.crafted += gained;
            return gained;
        }
        const used = beforeEssence - essenceCount();
        if (used > 0) {
            this.crafted += used;
            return used;
        }
        return 0;
    }

    async loop() {
        if (!Game.ingame()) {
            await Execution.delayTicks(5);
            return;
        }
        if (this.done) {
            await Execution.delayTicks(5);
            return;
        }
        if (await dismissWelcomeScreen()) {
            this.status = 'close welcome';
            return;
        }

        if (this.died) {
            this.died = false;
            if (!hasEntryItem() && !hasNotedEssence() && !hasEssence()) {
                this.finishDone('stopped after death, restock a Nature talisman and noted Rune essence');
                return;
            }
            this.healing = hpTooLow();
            this.returning = true;
            this.mustRestock = true;
            this.status = 'respawned';
        }

        if (ChatDialog.canContinue() && !dialogOpen()) {
            this.status = 'continue dialog';
            await ChatDialog.continue();
            return;
        }

        if (onCustomsBoat() || this.needDisembark) {
            this.status = 'leaving the ship';
            if (await this.leaveShip()) {
                this.needDisembark = false;
            }
            return;
        }

        if (this.returning && (onKaramja() || inBrimhaven()) && !this.healing && !inAltarInterior()) {
            this.returning = false;
        }

        if (this.poisoned) {
            if (await this.drinkAntipoison()) {
                return;
            }
        }

        if (hpTooLow()) {
            this.healing = true;
        }
        if (awayFromWork()) {
            this.returning = true;
        }
        if (this.healing && hpHealedEnough() && !inArdougne() && !nearBank() && !this.returning) {
            this.healing = false;
        }

        if (Shop.isOpen() && !this.healing && !this.returning) {
            await this.unnoteOpenShop();
            return;
        }
        if (Bank.isOpen() && (this.healing || this.returning || teleRunesNeedRestock())) {
            await this.healAtOpenBank();
            return;
        }
        if (Bank.isOpen()) {
            await Bank.close();
            return;
        }

        if (inAltarInterior()) {
            if (this.healing || this.returning) {
                this.status = `HP ${Math.round(hpPercent())}%, teleport out`;
                if (await this.castArdougneTeleport('leave altar')) {
                    return;
                }
                await this.exitAltar();
                return;
            }
            if (hasEssence()) {
                await this.craftAtAltar();
                return;
            }
            await this.exitAltar();
            return;
        }

        if (
            this.healing ||
            this.returning ||
            (inArdougne() && teleRunesNeedRestock())
        ) {
            if (inArdougne() && teleRunesNeedRestock()) {
                this.returning = true;
            }
            await this.healTrip();
            return;
        }

        if (onKaramja() && !inAltarInterior() && inShilo()) {
            await this.recoverFromBlockedGate();
            return;
        }

        if (readyForAltar()) {
            await this.enterRuins();
            return;
        }

        if (!hasNotedEssence() && !hasEssence()) {
            this.finishDone('stopped, no noted or unnoted essence left to craft');
            return;
        }

        if (!hasEntryItem()) {
            this.finishDone('stopped, no Nature talisman');
            return;
        }

        if (!hasEssence() && !hasAntipoison()) {
            this.status = 'need unnoted essence and antipoison';
        } else if (!hasEssence()) {
            this.status = 'need unnoted essence';
        } else {
            this.status = 'need antipoison before altar';
        }
        await this.goUnnoteAtJiminua();
    }

    async drinkAntipoison() {
        const pot = findAntipoison();
        if (!pot) {
            this.log('poisoned and no antipoison, heading to Jiminua');
            if (inAltarInterior()) {
                await this.exitAltar();
                return true;
            }
            if (!nearStore()) {
                this.status = 'walking to Jiminua for antipoison';
                await this.walkTo(STORE_STAND, 4);
                return true;
            }
            await this.buyAntipoisonAtStore();
            return true;
        }
        const op = drinkOp(pot) ?? 'Drink';
        const before = antipoisonCount();
        this.status = `drinking ${pot.name}`;
        this.log(`${op} ${pot.name}`);
        if (typeof pot.interact === 'function') {
            await pot.interact(op);
        }
        await Execution.delayUntil(
            () => !this.poisoned || antipoisonCount() < before || ChatDialog.canContinue(),
            4000
        );
        if (ChatDialog.canContinue()) {
            await ChatDialog.continue();
        }
        this.poisoned = false;
        return true;
    }

    async openNearbyDoor(radius = 3) {
        const door = Locs.query()
            .where(l => isShutDoor(l))
            .where(l => l.distance() <= radius)
            .where(l => {
                const t = locTile(l);
                if (t && shouldSkipJungleGate(t)) {
                    return false;
                }
                if (!t && locName(l).includes('gate')) {
                    return false;
                }
                return true;
            })
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

    async walkTo(dest, radius) {
        dest = walkTarget(dest);
        const here0 = tileOf();
        if (!here0) {
            return false;
        }
        if (onCustomsBoat(here0)) {
            this.log('on the ship, walking off the gangplank');
            await this.leaveShip();
            return false;
        }
        this.walkStuckStrikes = 0;
        if (cheb(dest, here0) <= radius && (here0.level ?? 0) === (dest.level ?? 0)) {
            return true;
        }
        if (inShilo(here0)) {
            await this.recoverFromBlockedGate();
        }

        const vias = viasFor(here0, dest);
        const route = pinListTo(dest, vias);
        const key = `${dest.x},${dest.z}:${route.map(p => `${p.x},${p.z}`).join('|')}`;
        if (this.pinRouteKey !== key) {
            this.pinRouteKey = key;
            this.pinIndex = snapPinIndex(route, here0);
        } else if (this.pinIndex >= route.length) {
            this.pinIndex = snapPinIndex(route, here0);
        } else {
            this.pinIndex = Math.max(this.pinIndex, skipPassedPins(route, here0, this.pinIndex));
        }
        if (!route.length) {
            return await this.followPin(dest, radius);
        }
        return await this.walkPinsAhead(route, dest, radius);
    }

    issueWalk(tile) {
        if (!tile) {
            return false;
        }
        const point = { x: tile.x, z: tile.z, level: tile.level ?? 0 };
        if (DirectNavigator && typeof DirectNavigator.walk === 'function') {
            DirectNavigator.walk(point);
            return true;
        }
        if (DirectNavigator && typeof DirectNavigator.click === 'function') {
            DirectNavigator.click(point);
            return true;
        }
        return false;
    }

    async followPin(tile, radius = PIN_FOLLOW, timeoutMs = 12_000, opts = {}) {
        if (!tile) {
            return false;
        }
        const here0 = tileOf();
        if (here0 && cheb(tile, here0) <= radius) {
            return true;
        }
        this.status = `walking ${tile.x},${tile.z}`;
        const t0 = Date.now();
        let lastClick = 0;
        while (Date.now() - t0 < timeoutMs) {
            const here = tileOf();
            if (here && cheb(tile, here) <= radius) {
                return true;
            }
            if (this.poisoned && findAntipoison()) {
                await this.drinkAntipoison();
            }
            const gap = inCombat() ? 250 : 400;
            if (Date.now() - lastClick >= gap) {
                const click =
                    here && cheb(here, tile) > CLICK_RANGE
                        ? stepToward(here, tile, CLICK_RANGE)
                        : tile;
                if (!this.issueWalk(click) && typeof Traversal?.walkTo === 'function') {
                    await Traversal.walkTo(tile, { radius, timeoutMs: Math.min(2500, timeoutMs) });
                    lastClick = Date.now();
                    continue;
                }
                lastClick = Date.now();
            }
            await Execution.delay(200);
        }
        const after = tileOf();
        return !!after && cheb(tile, after) <= radius;
    }

    async recoverFromBlockedGate() {
        if (this.recovering) {
            return false;
        }
        const here = tileOf();
        if (!here) {
            return false;
        }
        let safe = null;
        if (inShilo(here)) {
            safe = RUINS_PATH;
        } else {
            return true;
        }
        if (cheb(here, safe) <= 6 && !inBlockedJungle(here)) {
            return true;
        }
        this.recovering = true;
        this.status = 'walking north of Shilo';
        this.log(`inside Shilo, walking to ${safe.x},${safe.z}`);
        try {
            await this.followPin(safe, 6, 12_000);
        } finally {
            this.recovering = false;
        }
        return !inBlockedJungle();
    }

    async walkPinsAhead(route, dest, radius) {
        const started = Date.now();
        let lastClickAt = 0;
        let lastLog = 0;
        let lastHere = tileOf();
        let lastMoved = Date.now();
        let bestDestD = 9999;
        let bestDestAt = Date.now();
        this.pinIndex = Math.max(0, this.pinIndex);
        while (Date.now() - started < 180_000) {
            const here = tileOf();
            if (!here) {
                return false;
            }
            if (cheb(dest, here) <= radius && (here.level ?? 0) === (dest.level ?? 0)) {
                return true;
            }
            if (inShilo(here)) {
                this.issueWalk(stepToward(here, RUINS_PATH, CLICK_RANGE));
                lastMoved = Date.now();
                await Execution.delay(400);
                continue;
            }
            if (this.poisoned && findAntipoison()) {
                await this.drinkAntipoison();
            }
            const dDest = cheb(dest, here);
            if (dDest < bestDestD - 1) {
                bestDestD = dDest;
                bestDestAt = Date.now();
            }
            if (!lastHere || cheb(here, lastHere) > 0) {
                lastHere = { x: here.x, z: here.z };
                lastMoved = Date.now();
                this.walkStuckStrikes = 0;
            }

            this.pinIndex = Math.max(
                this.pinIndex,
                skipPassedPins(route, here, this.pinIndex)
            );
            const reach =
                this.pinIndex < route.length
                    ? furthestSafePin(route, this.pinIndex, here)
                    : this.pinIndex;
            let click = this.pinIndex < route.length ? route[reach] : dest;
            if (
                dest.x + 8 < here.x &&
                click.x > here.x + 2 &&
                here.z >= SKIRT_Z - 2 &&
                here.z <= SKIRT_Z + 8
            ) {
                this.pinIndex = Math.max(
                    this.pinIndex,
                    skipPassedPins(route, here, this.pinIndex)
                );
                click = this.pinIndex < route.length ? route[this.pinIndex] : dest;
                if (click.x > here.x) {
                    click = corridorUnstick(here, dest);
                }
            }
            if (cheb(here, click) > CLICK_RANGE) {
                click = stepToward(here, click, CLICK_RANGE);
            }

            const stalled = Date.now() - bestDestAt > 8000;
            if ((stalled || Date.now() - lastMoved > 5000) && onVillageSkirt(here)) {
                click = corridorUnstick(here, dest);
                this.log(`village bounce, walking to ${click.x},${click.z}`);
                this.issueWalk(click);
                bestDestAt = Date.now();
                lastMoved = Date.now();
                lastClickAt = Date.now();
                await Execution.delay(400);
                continue;
            }

            if (Date.now() - lastMoved > 5000 || stalled) {
                if (onCustomsBoat(here) || findGangplank(8)) {
                    this.log('stuck on the ship, walking off the gangplank');
                    await this.leaveShip();
                    return false;
                }
                this.walkStuckStrikes += 1;
                if (
                    this.walkStuckStrikes >= STUCK_TELE_STRIKES &&
                    canCastArdougneTeleport() &&
                    !inArdougne(here) &&
                    !nearBrimDock(here) &&
                    !nearStore(here)
                ) {
                    this.log(
                        `stuck at ${here.x},${here.z} (${this.walkStuckStrikes} strikes), Ardougne Teleport`
                    );
                    this.returning = true;
                    this.walkStuckStrikes = 0;
                    await this.castArdougneTeleport('stuck');
                    return false;
                }
                const next = this.pinIndex < route.length ? route[this.pinIndex] : dest;
                if (
                    nearVillageEast(here) &&
                    here.z < SKIRT_Z &&
                    next &&
                    next.z >= SKIRT_Z - 2
                ) {
                    click = T(Math.max(here.x, VILLAGE_EAST.x), SKIRT_Z);
                }
                this.log(`stuck, clicking ${click.x},${click.z}`);
                this.issueWalk(click);
                lastMoved = Date.now();
                lastClickAt = Date.now();
                bestDestAt = Date.now();
                continue;
            }

            const gap = inCombat() ? 220 : 320;
            if (Date.now() - lastClickAt >= gap) {
                this.status = `walking ${click.x},${click.z}`;
                if (Date.now() - lastLog > 4000) {
                    this.log(
                        `walk ${click.x},${click.z} (pin ${Math.min(reach + 1, route.length)}/${route.length}, ` +
                            `${cheb(dest, here)}t to dest)`
                    );
                    lastLog = Date.now();
                }
                if (!this.issueWalk(click)) {
                    if (DirectNavigator && typeof DirectNavigator.walkTo === 'function') {
                        await DirectNavigator.walkTo(
                            { x: click.x, z: click.z, level: click.level ?? 0 },
                            8,
                            600
                        );
                    }
                }
                lastClickAt = Date.now();
            }
            await Execution.delay(150);
        }
        const end = tileOf();
        return !!end && cheb(dest, end) <= radius;
    }

    async enterRuins() {
        if (inAltarInterior()) {
            return true;
        }
        if (!hasEntryItem()) {
            this.log('Nature talisman missing');
            return false;
        }
        if (!hasEssence()) {
            this.log('no unnoted essence, not walking to the altar');
            return false;
        }
        if (!hasAntipoison()) {
            this.log('no antipoison, not walking to the altar');
            return false;
        }

        if (!nearRuins() && cheb(tileOf() ?? RUINS_APPROACH, RUINS_APPROACH) > 4) {
            this.status = 'walking to nature ruins';
            this.log(`walking to nature ruins approach ${RUINS_APPROACH.x},${RUINS_APPROACH.z}`);
            await this.walkTo(RUINS_APPROACH, 3);
        }

        if (inAltarInterior()) {
            return true;
        }

        const ruins = findRuins();
        if (!ruins) {
            this.status = 'looking for ruins';
            this.log(`no Mysterious ruins near ${RUINS_STAND.x},${RUINS_STAND.z}, retrying`);
            await this.walkTo(RUINS_APPROACH, 3);
            await Execution.delayTicks(2);
            return false;
        }

        this.status = 'entering nature altar';
        let started = false;
        const talisman = findTalisman();
        if (talisman && typeof talisman.useOn === 'function') {
            this.log(`use ${TALISMAN_NAME} on ${ruins.name ?? 'Mysterious ruins'}`);
            started = !!(await talisman.useOn(ruins));
        }
        if (!started) {
            this.log('could not use Nature talisman on the ruins, retrying');
            await Execution.delayTicks(2);
            return false;
        }

        const entered = await Execution.delayUntil(() => inAltarInterior(), 8_000);
        if (entered || inAltarInterior()) {
            this.log('inside the nature altar');
            this.enterFails = 0;
            return true;
        }
        if (++this.enterFails >= MAX_ENTER_FAILS) {
            this.finishDone('stopped, the talisman did not teleport into the altar');
            return false;
        }
        this.log('ruins use did not teleport, retrying');
        await Execution.delayTicks(2);
        return false;
    }

    async craftAtAltar() {
        if (!hasEssence()) {
            return;
        }

        const altar = findCraftAltar();
        if (!altar) {
            this.status = 'looking for altar';
            this.log('no Altar loc inside, waiting a tick');
            await Execution.delayTicks(2);
            return;
        }

        const dist = typeof altar.distance === 'function' ? altar.distance() : 9;
        if (dist > 2) {
            const t = locTile(altar);
            if (t) {
                this.status = 'walking to altar';
                await Traversal.walkTo(t, { radius: 1, timeoutMs: 8_000 });
            }
        }

        const beforeEss = essenceCount();
        const beforeRunes = natureRuneCount();
        const beforeXp = rcXp();
        this.status = 'crafting nature runes';
        this.log(`crafting ${beforeEss} essence at the nature altar (RC ${rcLevel()})`);

        let started = false;
        const op = craftOp(altar);
        if (op) {
            started = !!(await altar.interact(op));
        }
        if (!started) {
            const ess = lastEssence();
            if (ess && typeof ess.useOn === 'function') {
                started = !!(await ess.useOn(altar));
            }
        }
        if (!started) {
            this.log('craft did not start, retrying');
            await Execution.delayTicks(2);
            return;
        }

        await Execution.delayUntil(
            () =>
                essenceCount() < beforeEss ||
                natureRuneCount() > beforeRunes ||
                rcXp() > beforeXp ||
                ChatDialog.canContinue(),
            8000
        );

        if (ChatDialog.canContinue()) {
            await ChatDialog.continue();
        }

        this.noteCrafted(beforeRunes, beforeEss);

        if (essenceCount() > 0 && typeof Game.animating === 'function' && Game.animating()) {
            await Execution.delayUntil(() => essenceCount() <= 0 || !Game.animating(), 6000);
            this.noteCrafted(beforeRunes, beforeEss);
        }

        if (essenceCount() <= 0) {
            this.log(`crafted, ${natureRuneCount()} Nature rune in pack`);
        }
    }

    async exitAltar() {
        if (!inAltarInterior()) {
            return true;
        }

        const portal = findPortal();
        if (!portal) {
            this.status = 'looking for portal';
            this.log('no Portal inside the altar, waiting');
            await Execution.delayTicks(2);
            return false;
        }

        const dist = typeof portal.distance === 'function' ? portal.distance() : 9;
        if (dist > 2) {
            const t = locTile(portal);
            if (t) {
                this.status = 'walking to portal';
                await Traversal.walkTo(t, { radius: 1, timeoutMs: 8_000 });
            }
        }

        const op = portalOp(portal) ?? 'Use';
        this.status = 'taking the portal out';
        this.log(`${op} ${portal.name ?? 'Portal'}`);
        await portal.interact(op);
        const left = await Execution.delayUntil(() => !inAltarInterior(), 12_000);
        if (left || !inAltarInterior()) {
            this.log('back at the mysterious ruins, walking to Jiminua');
            return true;
        }

        this.log('portal did not exit, retrying');
        await Execution.delayTicks(2);
        return false;
    }

    async goUnnoteAtJiminua() {
        if (inArdougne()) {
            if (teleRunesNeedRestock()) {
                this.returning = true;
                this.status = 'restock Ardougne tele runes';
                await this.healTrip();
                return;
            }
            this.status = 'boat to Brimhaven';
            await this.boatBrimhavenFromArdougne();
            return;
        }
        if (!nearStore()) {
            this.status = 'walking to Jiminua';
            this.log(`walking to Jiminua ${STORE_STAND.x},${STORE_STAND.z} to unnote essence`);
            await this.walkTo(STORE_STAND, 4);
            return;
        }
        if (!(await this.openJiminua())) {
            this.log('could not open Jiminua, retrying');
            await Execution.delayTicks(3);
            return;
        }
        await this.unnoteOpenShop();
    }

    async openJiminua() {
        if (Shop.isOpen()) {
            return true;
        }
        for (const name of STORE_KEEPER_ALTS) {
            if (typeof Shop.open === 'function' && (await Shop.open(name))) {
                return Shop.isOpen();
            }
        }
        const npc =
            Npcs.query().name(STORE_KEEPER).within(12).nearest() ??
            Npcs.query()
                .within(12)
                .where(n => /jiminua/i.test(n.name ?? ''))
                .nearest();
        if (npc && typeof Shop.open === 'function') {
            await Shop.open(npc.name);
        }
        return Shop.isOpen();
    }

    async unnoteOpenShop() {
        if (!Shop.isOpen()) {
            return;
        }

        if (!hasAntipoison()) {
            await this.buyAntipoisonInOpenShop();
        }

        if (hasEssence()) {
            if (Shop.isOpen()) {
                await Shop.close();
            }
            if (readyForAltar()) {
                this.log(
                    `ready for altar: ${essenceCount()} unnoted essence, antipoison in pack, heading to ruins`
                );
            }
            return;
        }

        const empty = invFree();
        const noted = findNotedEssence();
        if (empty <= 0) {
            this.log('pack is full with no unnoted essence, cannot unnote at Jiminua');
            await Shop.close();
            return;
        }
        if (!noted) {
            this.log('no noted essence to sell to Jiminua');
            await Shop.close();
            return;
        }

        const want = Math.min(empty, Math.max(1, noted.count ?? empty));
        const essName = noted.name ?? findUnnotedEssenceName();
        if (coinCount() < want * ESSENCE_BUY_GP + BOAT_RESERVE) {
            this.log(
                `WARNING: ${coinCount()}gp may be short for buying ${want} essence back ` +
                    `(keep ${BOAT_RESERVE}gp for the Ardougne boat)`
            );
        }

        this.status = `selling ${want} noted ${essName}`;
        this.log(`empty pack slots ${empty}, selling ${want}× noted ${essName} to Jiminua`);
        let sold = want;
        if (typeof Shop.sell === 'function') {
            const raw = await Shop.sell(essName, want, i => isNotedEssenceItem(i));
            if (typeof raw === 'number' && raw > 0) {
                sold = raw;
            } else if (!raw) {
                const raw2 = await Shop.sell(essName, want);
                if (typeof raw2 === 'number' && raw2 > 0) {
                    sold = raw2;
                }
            }
        }
        await Execution.delayTicks(1);

        const buyN = sold;
        this.status = `buying ${buyN} ${essName}`;
        this.log(`Shop.buy ${buyN}× ${essName} (unnote buy-back)`);
        if (typeof Shop.buy === 'function') {
            await Shop.buy(essName, buyN);
        }
        await Execution.delayUntil(() => essenceCount() >= buyN || !Shop.isOpen(), 4000);
        await Execution.delayTicks(1);

        if (!hasAntipoison()) {
            await this.buyAntipoisonInOpenShop();
        }

        const got = essenceCount();
        if (Shop.isOpen()) {
            await Shop.close();
        }
        if (got > 0) {
            this.storeTrips++;
            this.log(`unnoted ${got} essence at Jiminua (${want} empty slots)`);
        } else {
            this.log('Jiminua buy-back did not give unnoted essence, retrying');
            await Execution.delayTicks(2);
        }
        if (readyForAltar()) {
            this.log(
                `ready for altar: ${got} unnoted essence, antipoison in pack, heading to ruins`
            );
        } else if (got > 0 && !hasAntipoison()) {
            this.log('still no antipoison after Jiminua, will not walk to the altar');
        }
    }

    async buyAntipoisonAtStore() {
        if (hasAntipoison()) {
            return true;
        }
        if (!nearStore()) {
            this.status = 'walking to Jiminua for antipoison';
            await this.walkTo(STORE_STAND, 4);
            return false;
        }
        if (!(await this.openJiminua())) {
            return false;
        }
        await this.buyAntipoisonInOpenShop();
        if (Shop.isOpen() && hasAntipoison()) {
            await Shop.close();
        }
        return hasAntipoison();
    }

    async buyAntipoisonInOpenShop() {
        if (!Shop.isOpen() || hasAntipoison()) {
            return hasAntipoison();
        }
        if (coinCount() < ANTI_BUY_GP) {
            this.log(`WARNING: ${coinCount()}gp, antipoison at Jiminua is about ${ANTI_BUY_GP}gp`);
        }
        this.status = 'buying antipoison';
        for (const name of ANTI_NAMES) {
            if (hasAntipoison()) {
                break;
            }
            if (typeof Shop.buy !== 'function') {
                break;
            }
            this.log(`Shop.buy 1× ${name}`);
            const bought = await Shop.buy(name, 1);
            if (bought > 0 || hasAntipoison()) {
                this.log(`bought antipoison (${name})`);
                break;
            }
        }
        if (!hasAntipoison()) {
            this.log('Jiminua had no antipoison / buy failed');
        }
        return hasAntipoison();
    }

    async healTrip() {
        if (inAltarInterior()) {
            if (await this.castArdougneTeleport('heal from altar')) {
                return;
            }
            await this.exitAltar();
            return;
        }
        if (inArdougne() || nearBank() || nearArdyDock()) {
            const needBank =
                (this.healing && !hpHealedEnough()) ||
                teleRunesNeedRestock() ||
                this.mustRestock ||
                Bank.isOpen();
            if (!needBank && !Bank.isOpen()) {
                this.healing = false;
                this.status = 'healed, boat to Brimhaven';
                const ok = await this.boatBrimhavenFromArdougne();
                if (ok || onKaramja() || inBrimhaven()) {
                    this.returning = false;
                }
                return;
            }
            if (nearBank() || Bank.isOpen()) {
                await this.healAtBank();
                return;
            }
            this.status = 'walking to Ardougne bank';
            await Traversal.walkResilient(BANK_STAND, {
                radius: 3,
                attempts: 2,
                timeoutMs: 20_000,
                log: m => this.log(`  ${m}`)
            });
            return;
        }

        if (await this.castArdougneTeleport(this.healing ? 'HP low' : 'return to Ardougne')) {
            return;
        }

        if (onKaramja() || inBrimhaven() || nearBrimDock() || nearStore() || nearRuins()) {
            if (!nearBrimDock()) {
                this.status = 'HP low, walking to Brimhaven boat';
                this.log(
                    `no Ardougne Teleport (Magic ${magicLevel()}, ${lawCount()} law, ${waterRuneCount()} water), ` +
                        `boat to Ardougne`
                );
                await this.walkTo(BRIMHAVEN_DOCK, 4);
                return;
            }
            await this.boatArdougneFromBrimhaven();
            return;
        }

        this.returning = true;
        this.status = 'walking to Ardougne bank';
        await Traversal.walkResilient(BANK_STAND, {
            radius: 3,
            attempts: 2,
            timeoutMs: 24_000,
            log: m => this.log(`  ${m}`)
        });
    }

    async castArdougneTeleport(reason = 'return') {
        if (inArdougne() && !onCustomsBoat()) {
            return true;
        }
        if (!canCastArdougneTeleport()) {
            return false;
        }
        const before = tileOf();
        this.returning = true;
        this.status = 'Ardougne Teleport';
        this.log(
            `Ardougne Teleport (${reason}) with ${lawCount()} law, ${waterRuneCount()} water`
        );
        if (typeof Game.cast === 'function') {
            for (const name of ARDY_TELE_NAMES) {
                try {
                    const ok = await Game.cast(name);
                    if (ok) {
                        break;
                    }
                } catch {
                    /* try next name */
                }
            }
        }
        const landed = await Execution.delayUntil(
            () => inArdougne() || this.movedFar(before, 20),
            10_000
        );
        if (inArdougne()) {
            this.log('landed in Ardougne, restock tele runes then boat to Brimhaven');
            this.mustRestock = true;
            return true;
        }
        if (landed) {
            this.log(`teleport moved us to ${tileOf()?.x},${tileOf()?.z}, walking to Ardougne bank`);
            return inArdougne();
        }
        this.log('Ardougne Teleport did not land, will walk the boat if on Karamja');
        return false;
    }

    async restockTeleportRunes() {
        if (!Bank.isOpen()) {
            return !teleRunesNeedRestock();
        }
        const pulls = [
            { name: 'Law rune', n: Math.max(0, LAW_KEEP - lawCount()) },
            {
                name: 'Water rune',
                n: hasWaterStaff() ? 0 : Math.max(0, WATER_KEEP - waterRuneCount())
            }
        ];
        for (const p of pulls) {
            if (p.n <= 0) {
                continue;
            }
            this.log(`withdrawing ${p.n}× ${p.name} (keep ${p.name === 'Law rune' ? LAW_KEEP : WATER_KEEP})`);
            if (typeof Bank.withdrawX === 'function') {
                await Bank.withdrawX(p.name, p.n);
                await Execution.delayTicks(1);
            } else if (typeof Bank.withdraw === 'function') {
                await Bank.withdraw(p.name, 'Withdraw-All');
                await Execution.delayTicks(1);
            }
        }
        if (teleRunesNeedRestock()) {
            this.log(
                `WARNING: pack has ${lawCount()} law and ${waterRuneCount()} water, ` +
                    `want ${LAW_KEEP} law and ${WATER_KEEP} water in the bank`
            );
        } else {
            this.log(`tele runes restocked: ${lawCount()} law, ${waterRuneCount()} water`);
        }
        return !teleRunesNeedRestock();
    }

    async makePackRoom(wantFree, reason) {
        if (!Bank.isOpen() || invFree() >= wantFree) {
            return invFree() >= wantFree;
        }
        const unnoted = essenceCount();
        if (unnoted > 0 && typeof Bank.depositAllMatching === 'function') {
            this.log(
                `${reason}: pack ${28 - invFree()}/28, depositing unnoted essence ` +
                    `(${unnoted} in pack) to free slots`
            );
            await Bank.depositAllMatching((name, id) => isUnnotedEssenceDeposit(name, id));
            await Execution.delayTicks(1);
            const left = essenceCount();
            this.parkedUnnoted += Math.max(0, unnoted - left);
        }
        if (invFree() >= wantFree) {
            return true;
        }
        if (findNotedEssence() && invFree() < 1 && typeof Bank.depositAllMatching === 'function') {
            this.log(`${reason}: depositing noted essence to free a slot`);
            await Bank.depositAllMatching((name, id) => isNotedEssenceDeposit(name, id));
            this.parkedNoted = true;
            await Execution.delayTicks(1);
        }
        return invFree() >= 1;
    }

    async withdrawParkedEssence() {
        if (!Bank.isOpen()) {
            return;
        }
        if (this.parkedNoted && !findNotedEssence()) {
            if (typeof Bank.setNoteMode === 'function') {
                await Bank.setNoteMode(true);
            }
            const name = findUnnotedEssenceName();
            this.log(`withdrawing noted ${name} parked for food`);
            if (typeof Bank.withdrawX === 'function') {
                await Bank.withdrawX(name, 1);
            } else if (typeof Bank.withdraw === 'function') {
                await Bank.withdraw(name, 'Withdraw-All');
            }
            await Execution.delayTicks(1);
            if (findNotedEssence()) {
                this.parkedNoted = false;
            }
        }
        if (this.parkedUnnoted > 0 && invFree() > 0) {
            if (typeof Bank.setNoteMode === 'function') {
                await Bank.setNoteMode(false);
            }
            const take = Math.min(this.parkedUnnoted, invFree());
            const name = findUnnotedEssenceName();
            this.log(`withdrawing ${take} unnoted ${name} parked for food`);
            if (typeof Bank.withdrawX === 'function') {
                await Bank.withdrawX(name, take);
            } else if (typeof Bank.withdraw === 'function') {
                await Bank.withdraw(name, 'Withdraw-All');
            }
            await Execution.delayTicks(1);
            this.parkedUnnoted = 0;
        }
    }

    async healAtBank() {
        if (!Bank.isOpen()) {
            this.status = 'opening Ardougne bank';
            const opened =
                typeof Banking?.open === 'function'
                    ? await Banking.open({ log: m => this.log(`  ${m}`) })
                    : false;
            if (!opened && typeof Banking?.bankNearest === 'function') {
                await Banking.bankNearest({
                    destination: { name: 'Ardougne', tile: BANK_STAND },
                    log: m => this.log(`  ${m}`)
                });
            }
            if (!Bank.isOpen()) {
                await Traversal.walkResilient(BANK_STAND, {
                    radius: 2,
                    timeoutMs: 10_000
                });
                return;
            }
        }
        await this.healAtOpenBank();
    }

    async healAtOpenBank() {
        if (typeof Bank.loaded === 'function') {
            await Execution.delayUntil(() => Bank.loaded() || !Bank.isOpen(), 4000);
        }
        if (typeof Bank.depositAllMatching === 'function') {
            await Bank.depositAllMatching(name => !keepInPack(name));
            await Execution.delayTicks(1);
        }

        if (coinCount() < BOAT_RESERVE && typeof Bank.withdrawX === 'function') {
            this.log(`withdrawing coins for the Brimhaven boat (have ${coinCount()}gp)`);
            await Bank.withdrawX('Coins', Math.max(1000, BOAT_RESERVE - coinCount()));
            await Execution.delayTicks(1);
        }

        if (teleRunesNeedRestock() && invFree() < 2) {
            await this.makePackRoom(2, 'tele restock');
        }
        await this.restockTeleportRunes();
        this.mustRestock = false;

        if (!this.healing || hpHealedEnough()) {
            await this.withdrawParkedEssence();
            if (typeof Bank.depositAllMatching === 'function') {
                await Bank.depositAllMatching(name => foodHealOf(name) > 0 && !keepInPack(name));
            }
            await Bank.close();
            if (this.healing) {
                this.healing = false;
                this.healTrips++;
                this.log(
                    `healed to ${currentHp()}/${maxHp()} (${Math.round(hpPercent())}%), ` +
                        `tele ${lawCount()}L ${waterRuneCount()}W, boat back to Brimhaven`
                );
            } else {
                this.log(
                    `bank done, tele ${lawCount()}L ${waterRuneCount()}W, boat back to Brimhaven`
                );
            }
            return;
        }

        const food = bestBankFood();
        if (!food) {
            this.status = `no bank food, regen ${Math.round(hpPercent())}%`;
            this.log('no cooked food in Ardougne bank, waiting to regen');
            await this.withdrawParkedEssence();
            await Bank.close();
            await Execution.delayUntil(() => hpHealedEnough() || hpPercent() >= 70, 60_000);
            if (hpHealedEnough() || hpPercent() >= 70) {
                this.healing = false;
                this.healTrips++;
            }
            return;
        }

        await this.makePackRoom(FOOD_WITHDRAW, 'heal food');
        const take = Math.min(FOOD_WITHDRAW, Math.max(1, invFree()));
        this.status = `withdraw ${food.name}`;
        this.log(
            `best bank food ${food.name} (heals ~${foodHealOf(food.name)}), ` +
                `withdraw ${take}, eating to ${HEAL_DONE_PERCENT}%`
        );
        if (typeof Bank.withdrawX === 'function') {
            await Bank.withdrawX(food.name, take);
        } else if (typeof Bank.withdraw === 'function') {
            const op =
                (typeof withdrawOp === 'function' && food.ops ? withdrawOp(food.ops, 'all') : null) ??
                'Withdraw-All';
            await Bank.withdraw(food.name, op);
        }
        await Execution.delayTicks(1);
        await Bank.close();

        await this.eatUntilHealed();
        await this.depositLeftoverFood();
        if (this.parkedUnnoted > 0 || this.parkedNoted) {
            if (!Bank.isOpen() && typeof Banking?.open === 'function') {
                await Banking.open({ log: m => this.log(`  ${m}`) });
            }
            if (Bank.isOpen()) {
                await this.withdrawParkedEssence();
                await Bank.close();
            }
        }

        if (hpHealedEnough()) {
            this.healing = false;
            this.healTrips++;
            this.log(`healed to ${currentHp()}/${maxHp()} (${Math.round(hpPercent())}%)`);
        }
    }

    async depositLeftoverFood() {
        const leftover = invItems().some(it => eatOp(it) && !keepInPack(it.name));
        if (!leftover) {
            return;
        }
        if (typeof Banking?.open === 'function') {
            await Banking.open({ log: m => this.log(`  ${m}`) });
        }
        if (Bank.isOpen() && typeof Bank.depositAllMatching === 'function') {
            await Bank.depositAllMatching(name => foodHealOf(name) > 0 && !keepInPack(name));
            await Execution.delayTicks(1);
            await Bank.close();
        }
    }

    async eatUntilHealed() {
        for (let i = 0; i < 20 && !hpHealedEnough(); i++) {
            const food = invItems().find(it => eatOp(it) && !keepInPack(it.name));
            if (!food) {
                break;
            }
            const op = eatOp(food);
            const before = currentHp();
            this.status = `eating ${food.name}`;
            this.log(`Eat ${food.name} (HP ${before}/${maxHp()})`);
            if (typeof food.interact === 'function') {
                await food.interact(op);
            }
            await Execution.delayUntil(() => currentHp() > before, 3000);
            await Execution.delayTicks(1);
        }
    }

    findSailor(names, stand) {
        for (const name of names) {
            const npc = Npcs.query().name(name).within(18).nearest();
            if (npc) {
                return npc;
            }
        }
        const here = Game.tile();
        if (here && stand && Tile.from(here).distanceTo(stand) > 12) {
            return null;
        }
        return (
            Npcs.query()
                .within(18)
                .where(n => {
                    const nm = (n.name ?? '').toLowerCase();
                    return nm.includes('barnaby') || nm.includes('customs') || nm.includes('captain');
                })
                .nearest() ?? null
        );
    }

    movedFar(from, tiles) {
        const now = Game.tile();
        if (!from || !now) {
            return false;
        }
        return Tile.from(from).distanceTo(now) >= tiles;
    }

    async stepSailorDialog(prefer) {
        if (ChatDialog.canContinue()) {
            this.status = 'continue dialog';
            await ChatDialog.continue();
            await Execution.delayTicks(1);
            return true;
        }
        if (
            typeof ChatDialog.isOpen === 'function' &&
            ChatDialog.isOpen() &&
            typeof ChatDialog.options === 'function' &&
            ChatDialog.options().length > 0 &&
            typeof ChatDialog.chooseOption === 'function'
        ) {
            const opts = ChatDialog.options();
            const pick = pickBoatOption(opts, prefer);
            this.status = `dialog: ${pick ?? '?'}`;
            this.log(`dialog → ${pick}  [${opts.join(' | ')}]`);
            if (pick) {
                await ChatDialog.chooseOption(pick);
            } else {
                await ChatDialog.chooseOption();
            }
            await Execution.delayTicks(2);
            return true;
        }
        return false;
    }

    async talkSailorAndRide(npc, prefer, arrivedFn) {
        const before = Game.tile();
        const op = talkOp(npc);
        this.status = `Talk-to ${npc.name ?? 'sailor'}`;
        this.log(`Talk-to ${npc.name} @ dock (${coinCount()}gp)`);

        if (!(await npc.interact(op))) {
            await Execution.delayTicks(2);
            return false;
        }

        if (
            !(await Execution.delayUntil(
                () => dialogOpen() || arrivedFn() || this.movedFar(before, 15),
                8000
            ))
        ) {
            this.log('sailor dialog did not open, retrying');
            return false;
        }

        for (let i = 0; i < 40; i++) {
            if (arrivedFn()) {
                this.needDisembark = true;
                await this.leaveShip();
                return arrivedFn() || atDockStand() || !onShipDeck();
            }
            if (!dialogOpen()) {
                if (
                    await Execution.delayUntil(
                        () => arrivedFn() || this.movedFar(before, 15) || dialogOpen(),
                        6000
                    )
                ) {
                    if (arrivedFn()) {
                        this.needDisembark = true;
                        await this.leaveShip();
                        return arrivedFn() || atDockStand() || !onShipDeck();
                    }
                    if (dialogOpen()) {
                        continue;
                    }
                }
                break;
            }
            if (!(await this.stepSailorDialog(prefer))) {
                await Execution.delayTicks(1);
            }
        }

        if (arrivedFn()) {
            this.needDisembark = true;
            await this.leaveShip();
            return arrivedFn() || atDockStand() || !onShipDeck();
        }
        return false;
    }

    async leaveShip() {
        if (!(await Execution.delayUntil(() => Game.ingame() && Game.tile(), 20_000))) {
            this.log('scene still loading after the boat');
            return false;
        }
        const dock = nearerDock();
        const start = tileOf();
        if (start) {
            const names = gangplanks(20)
                .map(p => {
                    const pt = locTile(p);
                    return pt ? `${pt.x},${pt.z}` : '?';
                })
                .join(' | ');
            this.log(
                `on the ship at ${start.x},${start.z}, dock ${dock.x},${dock.z}` +
                    (names ? `, planks ${names}` : '')
            );
        }
        if (offBrimhavenShip() || atDockStand() || (inArdougne() && !onCustomsBoat())) {
            return true;
        }

        if (typeof Traversal?.walkResilient === 'function') {
            this.log(`webwalk off the ship to ${dock.x},${dock.z}`);
            await Traversal.walkResilient(dock, {
                radius: 3,
                timeoutMs: 14_000,
                log: m => this.log(`  ${m}`)
            });
            if (offBrimhavenShip() || atDockStand() || !onCustomsBoat()) {
                return true;
            }
        }

        for (let i = 0; i < 6; i++) {
            const here = tileOf();
            if (!here) {
                return false;
            }
            if (offBrimhavenShip(here) || atDockStand(here) || !onCustomsBoat(here)) {
                return true;
            }
            const plank = bestDisembarkPlank(dock, 20);
            const pt = locTile(plank);
            const hereD = cheb(here, dock);
            const plankD = pt ? cheb(pt, dock) : 99;
            const towardPier = !!pt && plankD < hereD - 1;
            this.status = 'walking off the gangplank';
            if (towardPier && cheb(here, pt) <= 3) {
                const before = hereD;
                if (await this.crossGangplank(plank)) {
                    const after = tileOf();
                    if (after && cheb(after, dock) < before) {
                        this.log(`left the deck toward ${after.x},${after.z}`);
                        if (offBrimhavenShip(after) || atDockStand(after)) {
                            return true;
                        }
                        this.issueWalk(dock);
                        await Execution.delayTicks(3);
                        return offBrimhavenShip() || atDockStand() || !onCustomsBoat();
                    }
                    this.log('that plank stayed on the ship, walking to the pier');
                }
            } else if (pt && cheb(here, pt) > 3 && towardPier) {
                this.log(`walking to disembark plank ${pt.x},${pt.z}`);
                this.issueWalk(pt);
            } else {
                this.log(`walking off the ship toward ${dock.x},${dock.z}`);
                this.issueWalk(dock);
            }
            await Execution.delayTicks(2);
        }
        return offBrimhavenShip() || atDockStand() || !onCustomsBoat();
    }

    async crossGangplank(plank = null) {
        plank = plank ?? bestDisembarkPlank(nearerDock(), 14);
        if (!plank) {
            this.log('no gangplank in range');
            return false;
        }
        const acts = locActions(plank);
        const op = acts.find(a => /cross|walk|climb/i.test(a ?? '')) ?? acts[0] ?? 'Cross';
        const pt = locTile(plank);
        const before = Game.tile();
        this.status = `cross ${plank.name ?? 'Gangplank'}`;
        this.log(
            `crossing ${plank.name ?? 'Gangplank'} (${op})` +
                (pt ? ` @ ${pt.x},${pt.z}` : '')
        );
        if (!(await plank.interact(op))) {
            return false;
        }
        await Execution.delayUntil(() => this.movedFar(before, 2), 6000);
        return true;
    }

    async boatArdougneFromBrimhaven() {
        if (this.needDisembark) {
            if (await this.leaveShip()) {
                this.needDisembark = false;
            } else {
                return false;
            }
        }
        if (inArdougne() && atDockStand()) {
            this.log('landed Ardougne');
            return true;
        }
        if (coinCount() < BOAT_FARE) {
            this.status = `need ${BOAT_FARE}gp for Brimhaven boat`;
            this.log(`WARNING: only ${coinCount()}gp, need ${BOAT_FARE} for Brimhaven → Ardougne`);
            await Execution.delayTicks(8);
            return false;
        }
        if (!nearBrimDock()) {
            await this.walkTo(BRIMHAVEN_DOCK, 4);
            return false;
        }
        if (dialogOpen()) {
            for (let i = 0; i < 40 && dialogOpen() && !inArdougne(); i++) {
                await this.stepSailorDialog(ARDOUGNE_DIALOG_PREFER);
            }
            if (inArdougne()) {
                this.needDisembark = true;
                if (await this.leaveShip()) {
                    this.needDisembark = false;
                }
                this.log('boat landed in Ardougne');
                return atDockStand() || (inArdougne() && !onShipDeck());
            }
        }
        const sailor = this.findSailor(BRIM_SAILORS, BRIMHAVEN_DOCK);
        if (!sailor) {
            this.status = 'looking for Brimhaven sailor';
            await Traversal.walkResilient(BRIMHAVEN_DOCK, {
                radius: 3,
                timeoutMs: 10_000
            });
            return false;
        }
        const ok = await this.talkSailorAndRide(sailor, ARDOUGNE_DIALOG_PREFER, () => inArdougne());
        if (ok || inArdougne()) {
            this.needDisembark = true;
            if (await this.leaveShip()) {
                this.needDisembark = false;
            }
            this.log('boat landed in Ardougne');
            return atDockStand() || (inArdougne() && !onShipDeck());
        }
        return false;
    }

    async boatBrimhavenFromArdougne() {
        if (this.needDisembark) {
            if (await this.leaveShip()) {
                this.needDisembark = false;
            } else {
                return false;
            }
        }
        if ((onKaramja() || inBrimhaven()) && atDockStand()) {
            this.log('landed Brimhaven');
            return true;
        }
        if (coinCount() < BOAT_FARE) {
            this.status = `need ${BOAT_FARE}gp for Barnaby`;
            this.log(`WARNING: only ${coinCount()}gp, need ${BOAT_FARE} for Ardougne → Brimhaven`);
            this.healing = true;
            return false;
        }
        if (!nearArdyDock()) {
            this.status = 'walking to Barnaby';
            await Traversal.walkResilient(ARDOUGNE_DOCK, {
                radius: 4,
                timeoutMs: 16_000,
                log: m => this.log(`  ${m}`)
            });
            return false;
        }
        if (dialogOpen()) {
            for (let i = 0; i < 40 && dialogOpen() && !onKaramja(); i++) {
                await this.stepSailorDialog(BRIMHAVEN_DIALOG_PREFER);
            }
            if (onKaramja() || inBrimhaven()) {
                this.needDisembark = true;
                if (await this.leaveShip()) {
                    this.needDisembark = false;
                }
                this.log('boat landed in Brimhaven');
                return atDockStand() || ((onKaramja() || inBrimhaven()) && !onShipDeck());
            }
        }
        const sailor = this.findSailor(ARDY_SAILORS, ARDOUGNE_DOCK);
        if (!sailor) {
            this.status = 'looking for Barnaby';
            await Traversal.walkResilient(ARDOUGNE_DOCK, {
                radius: 3,
                timeoutMs: 10_000
            });
            return false;
        }
        const ok = await this.talkSailorAndRide(
            sailor,
            BRIMHAVEN_DIALOG_PREFER,
            () => onKaramja() || inBrimhaven()
        );
        if (ok || onKaramja() || inBrimhaven()) {
            this.needDisembark = true;
            if (await this.leaveShip()) {
                this.needDisembark = false;
            }
            this.log('boat landed in Brimhaven');
            this.returning = false;
            return atDockStand() || ((onKaramja() || inBrimhaven()) && !onShipDeck());
        }
        return false;
    }

    onPaint(ctx) {
        const elapsed = Date.now() - this.startedAt;
        const hrs = elapsed / 3_600_000;
        const xp = Math.max(0, rcXp() - this.rcXpAtStart);
        const xph = hrs > 0.0005 ? xp / hrs : 0;
        const rph = hrs > 0.0005 ? this.crafted / hrs : 0;
        const hp = currentHp();
        const max = maxHp();
        const pct = Math.round(hpPercent());
        const entry = hasTalisman() ? 'talisman' : 'no entry';
        const anti = this.poisoned ? 'poisoned' : hasAntipoison() ? 'anti ready' : 'no anti';
        const lines = [
            SCRIPT_TITLE,
            `time ${fmtElapsed(elapsed)} · ${this.status}`,
            `Nature runes · RC ${rcLevel()} · ${whereLabel()}`,
            `natures ${this.crafted} · ${fmtXph(rph)}/hr · store ${this.storeTrips}`,
            `ess ${essenceCount()} unnoted · ${notedEssenceCount()} noted · ${entry}`,
            `HP ${hp}/${max} (${pct}%) · heal < ${HEAL_HP_PERCENT}% · ${anti}`,
            `tele ${lawCount()}L ${waterRuneCount()}W · keep ${LAW_KEEP}/${WATER_KEEP}`,
            `runecraft: ${fmtXph(xph)} xp/hr  (+${Math.round(xp)} xp)`,
            `pack ${28 - invFree()}/28 · heal trips ${this.healTrips}`
        ];

        ctx.save();
        ctx.font = '13px sans-serif';
        ctx.textBaseline = 'top';
        ctx.lineJoin = 'round';
        const x = 8;
        const y0 = 8;
        const lineH = 16;
        const iconSize = 16;
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#000';
        lines.forEach((line, i) => {
            const y = y0 + i * lineH;
            ctx.strokeText(line, x, y);
            ctx.fillStyle = i === 0 ? TITLE_NATURE_GREEN : '#ffffff';
            ctx.fillText(line, x, y);
            if (
                i === 0 &&
                natureRuneIcon &&
                natureRuneIcon.complete &&
                natureRuneIcon.naturalWidth > 0
            ) {
                const iconX = x + ctx.measureText(line).width + 4;
                const iconY = y + (lineH - iconSize) / 2;
                ctx.drawImage(natureRuneIcon, iconX, iconY, iconSize, iconSize);
            }
        });
        ctx.restore();
    }
}

export default defineBot({
    name: SCRIPT_NAME,
    version: SCRIPT_VERSION_FULL,
    category: 'Runecraft',
    tags: [
        'runecraft',
        'nature rune',
        'jiminua',
        'essence',
        'talisman',
        'karamja',
        'brimhaven',
        'ardougne',
        'antipoison'
    ],
    description:
        "Benzyme's Natures (Lost City 289). Sells noted Rune essence to Jiminua's Jungle Store, buys it back unnoted, walks north then east of Tai Bwo Wannai (bamboo walls end at 2814) south-east to the Mysterious ruins, uses a Nature talisman, Craft-rune, then Portal Use. Buys Antipoison(3) from Jiminua and keeps a dose in the pack. If HP drops below 30%, the walk gets stuck, or a random tele pulls you off Karamja, casts Ardougne Teleport, restocks 50 Law runes and 100 Water runes at the south bank, heals if needed, then boats back to Brimhaven. Needs Runecrafting 44, Magic 51, a Nature talisman, noted Rune essence, Law and Water runes, and coins. No tiaras or Pure essence in 289.",
    settingsSchema: {},
    create: () => new NatureRuneCrafter()
});
