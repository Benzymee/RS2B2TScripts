/**
 * ZanarisOtherworldlyBeingKiller, kill Otherworldly beings south of the Zanaris
 * fairy bank. Right-clicks Bank on the fairy bankers (no booth). Walks the
 * recorded plane-1 pin path (3153,9576 to 3155,9548). Melee style: lowest,
 * random swap every N kills, or stick to Attack / Strength / Defence.
 * Main weapon is a dragon longsword. Dragon dagger is only swapped in for
 * Puncture specs (25% energy): flick Ultimate Strength and Incredible Reflexes,
 * spec, then turn those prayers off and swap back to the longsword.
 * Compact loot ticks from the OSRS Otherworldly being drop table.
 * Completely vibe coded by @.benzyme on Discord via Cursor AI
 * Self-contained ESM for rs2b0t Load local script / Load URL.
 *
 * Load URL: https://benzymee.github.io/RS2B2TScripts/ZanarisOtherworldlyBeingKiller.js
 */
const SUPPORTED_API_VERSION = 1;
const abi = globalThis.__rs2b0t;
if (!abi) {
    throw new Error(
        "ZanarisOtherworldlyBeingKiller: globalThis.__rs2b0t missing, load inside rs2b0t bot.html"
    );
}
if (abi.apiVersion !== SUPPORTED_API_VERSION) {
    throw new Error(
        `ZanarisOtherworldlyBeingKiller: ABI ${abi.apiVersion} != supported ${SUPPORTED_API_VERSION}`
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
    Traversal,
    DirectNavigator,
    Tile,
    Skills,
    ChatDialog
} = abi;

const Prayer = abi.Prayer ?? null;

const SCRIPT_NAME = 'ZanarisOtherworldlyBeingKiller';
const SCRIPT_TITLE = "Benzyme's Beings";
const SCRIPT_VERSION = '1.8';
const SCRIPT_VERSION_FULL = '1.8.0';
const FLEET_HEARTBEAT_URL = 'https://benzyme.online/api/fleet/heartbeat';
const FLEET_HEARTBEAT_MS = 8000;

const WELCOME_SCREEN_ID = 5993;

function T(x, z, level = 0) {
    return new Tile(x, z, level);
}

/** 2004 Zanaris is the Lumbridge swamp underground (surface z + 6400), plane 1. */
const DUNGEON_Z = 6400;
const ZANARIS_LEVEL = 1;
/** Fairy bank, first pin of the recorded being path (same area as Benzyme's Cosmics). */
const BANK_STAND = T(3153, 9576, ZANARIS_LEVEL);
/** Last recorded pin, Otherworldly being room south of the bank. */
const BEING_CAMP = T(3155, 9548, ZANARIS_LEVEL);
const CAMP_RADIUS = 14;
const BANK_RADIUS = 8;
const PIN_LOOSE = 6;
const PIN_FOLLOW = 5;
const MAX_BANK_FAILS = 6;

/** Lumbridge swamp shed into Zanaris (Lost City). Needs a wielded Dramen staff. */
const LOST_CITY_SHED = T(3202, 3169, 0);

/**
 * Recorded walkable tiles, Zanaris bank → Otherworldly beings (plane 1). Reverse is the bank trip.
 */
const CAMP_ROUTE = [
    BANK_STAND,
    T(3158, 9570, ZANARIS_LEVEL),
    T(3163, 9565, ZANARIS_LEVEL),
    T(3162, 9557, ZANARIS_LEVEL),
    T(3160, 9552, ZANARIS_LEVEL),
    BEING_CAMP
];

const DEATH_RE = /oh dear.*you are dead/i;
const CANT_REACH_RE = /i can't reach that/i;

const COMBAT_TRACK = ['attack', 'strength', 'defence', 'hitpoints', 'prayer'];
const TRAINABLE = ['attack', 'strength', 'defence'];
const STYLE_RANDOM = 'Random swap';
const STYLE_LOWEST = 'Lowest melee';
const STYLE_ATTACK = 'Attack';
const STYLE_STRENGTH = 'Strength';
const STYLE_DEFENCE = 'Defence';
const STYLE_OPTIONS = [STYLE_LOWEST, STYLE_RANDOM, STYLE_ATTACK, STYLE_STRENGTH, STYLE_DEFENCE];
const COMBAT_TAB = 0;

/** Dragon dagger Puncture: 25% special energy, two hits, +15% accuracy and damage. */
const DDS_SPEC_PERCENT = 25;
const SPEC_ENERGY_VARP = 300;
const SPEC_ENABLED_VARP = 301;
const DDS_WIELD_ATTACK = 60;
const DLS_WIELD_ATTACK = 60;
/** combat_stabsword spec bar (dragon dagger Puncture). IF_BUTTON, no combat tab. */
const DDS_SPEC_BAR_COM = 7562;
const SPEC_PRAYERS = ['Ultimate Strength', 'Incredible Reflexes'];
const PRAYER_BUTTONS = {
    'ultimate strength': { com: 5619, varp: 93, level: 31 },
    'incredible reflexes': { com: 5620, varp: 94, level: 34 }
};

const TITLE_DARK_GREY = '#4a4a4a';

const OWN_LOOT_RADIUS = 4;
const OWN_LOOT_MS = 20_000;
const GROUND_SCAN_RADIUS = 24;

const FOOD_SLICE = 'Slice of cake';
const FOOD_TWO_THIRDS = '2/3 cake';
const FOOD_CAKE = 'Cake';
const FOOD_TUNA = 'Tuna';
const FOOD_LOBSTER = 'Lobster';
const FOOD_SWORDFISH = 'Swordfish';
const FOOD_SHARK = 'Shark';
const DRAMEN_NAME = 'Dramen staff';
const DRAGON_DAGGER_NAMES = [
    'Dragon dagger',
    'Dragon dagger(p)',
    'Dragon dagger(p+)',
    'Dragon dagger(p++)',
    'Dragon dagger(+)',
    'Dragon dagger(s)',
    'Drag dagger(p++)'
];
const DRAGON_LONGSWORD_NAMES = ['Dragon longsword', 'Dragon longsword (bh)', 'Dragon longsword (cr)'];

const FOOD_TYPES = {
    Tuna: { eat: [FOOD_TUNA], withdraw: [FOOD_TUNA], label: 'tuna' },
    Lobster: { eat: [FOOD_LOBSTER], withdraw: [FOOD_LOBSTER], label: 'lobster' },
    Swordfish: { eat: [FOOD_SWORDFISH], withdraw: [FOOD_SWORDFISH], label: 'swordfish' },
    Shark: { eat: [FOOD_SHARK], withdraw: [FOOD_SHARK], label: 'shark' },
    Cake: {
        eat: [FOOD_SLICE, FOOD_TWO_THIRDS, FOOD_CAKE],
        withdraw: [FOOD_CAKE, FOOD_TWO_THIRDS, FOOD_SLICE],
        label: 'cake'
    }
};

const FOOD_OPTIONS = Object.keys(FOOD_TYPES);

/**
 * Drop list from https://oldschool.runescape.wiki/w/Otherworldly_being
 * Tick a row to Take that drop from our own kills.
 */
/** 2004 unidentified herbs are all named Herb. Odd id is the item, even is the note. */
const HERB_NAMES = {
    guam: { grimy: 'Grimy Guam leaf', clean: 'Guam leaf', unid: [199, 200], ided: [249, 250] },
    marrentill: { grimy: 'Grimy Marrentill', clean: 'Marrentill', unid: [201, 202], ided: [251, 252] },
    tarromin: { grimy: 'Grimy Tarromin', clean: 'Tarromin', unid: [203, 204], ided: [253, 254] },
    harralander: { grimy: 'Grimy Harralander', clean: 'Harralander', unid: [205, 206], ided: [255, 256] },
    ranarr: { grimy: 'Grimy Ranarr weed', clean: 'Ranarr weed', unid: [207, 208], ided: [257, 258] },
    irit: { grimy: 'Grimy Irit leaf', clean: 'Irit leaf', unid: [209, 210], ided: [259, 260] },
    avantoe: { grimy: 'Grimy Avantoe', clean: 'Avantoe', unid: [211, 212], ided: [261, 262] },
    kwuarm: { grimy: 'Grimy Kwuarm', clean: 'Kwuarm', unid: [213, 214], ided: [263, 264] },
    cadantine: { grimy: 'Grimy Cadantine', clean: 'Cadantine', unid: [215, 216], ided: [265, 266] },
    lantadyme: { grimy: 'Grimy Lantadyme', clean: 'Lantadyme', unid: [217, 218], ided: [2481, 2482] },
    'dwarf weed': { grimy: 'Grimy Dwarf weed', clean: 'Dwarf weed', unid: [219, 220], ided: [267, 268] }
};
const HERB_IDS = Object.fromEntries(
    Object.entries(HERB_NAMES).map(([herb, row]) => [herb, [...row.unid, ...row.ided]])
);
const UNIDENTIFIED_HERB_IDS = Object.values(HERB_NAMES).flatMap(row => row.unid);
const HERB_ID_TO_LABEL = Object.create(null);
for (const row of Object.values(HERB_NAMES)) {
    for (const id of row.unid) {
        HERB_ID_TO_LABEL[id] = row.grimy;
    }
    for (const id of row.ided) {
        HERB_ID_TO_LABEL[id] = row.clean;
    }
}

const LOOT_DEFS = [
    { key: 'lootNatureRune', label: 'Nature Rune', names: ['nature rune', 'nature runes', 'nature-rune'] },
    { key: 'lootChaosRune', label: 'Chaos Rune', names: ['chaos rune', 'chaos runes', 'chaos-rune'] },
    { key: 'lootLawRune', label: 'Law Rune', names: ['law rune', 'law runes', 'law-rune'] },
    { key: 'lootCosmicRune', label: 'Cosmic Rune', names: ['cosmic rune', 'cosmic runes', 'cosmic-rune'] },
    { key: 'lootDeathRune', label: 'Death Rune', names: ['death rune', 'death runes', 'death-rune'] },
    { key: 'lootBloodRune', label: 'Blood Rune', names: ['blood rune', 'blood runes', 'blood-rune'] },
    { key: 'lootCoins', label: 'Coins', names: ['coins', 'coin', 'money'] },
    { key: 'lootRubyRing', label: 'Ruby Ring', names: ['ruby ring'] },
    { key: 'lootMithrilMace', label: 'Mithril Mace', names: ['mithril mace'] },
    { key: 'lootMackerel', label: 'Mackerel', names: ['mackerel'] },
    { key: 'lootGuam', label: HERB_NAMES.guam.grimy, herb: 'guam', ids: HERB_IDS.guam },
    { key: 'lootMarrentill', label: HERB_NAMES.marrentill.grimy, herb: 'marrentill', ids: HERB_IDS.marrentill },
    { key: 'lootTarromin', label: HERB_NAMES.tarromin.grimy, herb: 'tarromin', ids: HERB_IDS.tarromin },
    { key: 'lootHarralander', label: HERB_NAMES.harralander.grimy, herb: 'harralander', ids: HERB_IDS.harralander },
    { key: 'lootRanarr', label: HERB_NAMES.ranarr.grimy, herb: 'ranarr', ids: HERB_IDS.ranarr },
    { key: 'lootIrit', label: HERB_NAMES.irit.grimy, herb: 'irit', ids: HERB_IDS.irit },
    { key: 'lootAvantoe', label: HERB_NAMES.avantoe.grimy, herb: 'avantoe', ids: HERB_IDS.avantoe },
    { key: 'lootKwuarm', label: HERB_NAMES.kwuarm.grimy, herb: 'kwuarm', ids: HERB_IDS.kwuarm },
    { key: 'lootCadantine', label: HERB_NAMES.cadantine.grimy, herb: 'cadantine', ids: HERB_IDS.cadantine },
    { key: 'lootLantadyme', label: HERB_NAMES.lantadyme.grimy, herb: 'lantadyme', ids: HERB_IDS.lantadyme },
    { key: 'lootDwarfWeed', label: HERB_NAMES['dwarf weed'].grimy, herb: 'dwarf weed', ids: HERB_IDS['dwarf weed'] },
    { key: 'lootHerb', label: 'Unidentified Herb', kind: 'unidentifiedHerb', ids: UNIDENTIFIED_HERB_IDS },
    { key: 'lootUncutSapphire', label: 'Uncut Sapphire', names: ['uncut sapphire'] },
    { key: 'lootUncutEmerald', label: 'Uncut Emerald', names: ['uncut emerald'] },
    { key: 'lootUncutRuby', label: 'Uncut Ruby', names: ['uncut ruby'] },
    { key: 'lootUncutDiamond', label: 'Uncut Diamond', names: ['uncut diamond'] },
    { key: 'lootNatureTalisman', label: 'Nature Talisman', names: ['nature talisman'] },
    { key: 'lootRuneJavelin', label: 'Rune Javelin', names: ['rune javelin', 'rune javelins'] },
    { key: 'lootLoopHalf', label: 'Loop Half of Key', names: ['loop half of key', 'loop half'] },
    { key: 'lootToothHalf', label: 'Tooth Half of Key', names: ['tooth half of key', 'tooth half'] },
    { key: 'lootMegaRare', label: 'Mega Rare Table', kind: 'megaRare' }
];

const LOOT_LABELS = new Set(LOOT_DEFS.map(d => d.label));

const MEGA_RARE_RE = /rune spear|shield left half|dragon spear|dragon 2h/i;

const SECRET_RDT_NAMES = [
    'adamant javelin',
    'adamant javelins',
    'rune arrow',
    'rune arrows',
    'rune 2h sword',
    'rune 2-handed sword',
    'rune two handed sword',
    'rune battleaxe',
    'rune sq shield',
    'rune square shield',
    'dragon med helm',
    'dragon medium helm',
    'rune kiteshield',
    'runite bar',
    'rune bar',
    'dragonstone',
    'uncut dragonstone',
    'silver ore'
];

const DIALOG_AVOID = [
    'no, thank',
    'no thank',
    'no, not right now',
    'not right now',
    "i'm good",
    'nowhere',
    'nothing',
    'actually, i don'
];
const BANK_DIALOG_PREFER = ['yes please', 'yes', 'bank'];

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

function currentHp() {
    return Skills.effective('hitpoints');
}

function maxHp() {
    return Math.max(1, Skills.level('hitpoints'));
}

function hpPercent() {
    return (currentHp() / maxHp()) * 100;
}

function clampPercent(n) {
    const v = Math.round(Number(n));
    if (!Number.isFinite(v)) {
        return 50;
    }
    return Math.min(100, Math.max(1, v));
}

function clampFoodAmount(n) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v)) {
        return 20;
    }
    return Math.min(28, Math.max(1, v));
}

function clampKillsBeforeSwap(n) {
    const v = Math.round(Number(n));
    if (!Number.isFinite(v)) {
        return 10;
    }
    return Math.min(99, Math.max(1, v));
}

/**
 * Lowest of Attack / Strength / Defence. If `prefer` is tied for lowest, keep it
 * so we do not flicker between equal stats.
 */
function pickLowestStyle(prefer = null) {
    let best = TRAINABLE[0];
    let bestLevel = Skills.level(best);
    for (let i = 1; i < TRAINABLE.length; i++) {
        const style = TRAINABLE[i];
        const level = Skills.level(style);
        if (level < bestLevel) {
            best = style;
            bestLevel = level;
        }
    }
    if (prefer && TRAINABLE.includes(prefer) && Skills.level(prefer) === bestLevel) {
        return prefer;
    }
    return best;
}

function pickRandomStyle(except = null) {
    const pool = TRAINABLE.filter(s => s !== except);
    const choices = pool.length > 0 ? pool : TRAINABLE.slice();
    return choices[Math.floor(Math.random() * choices.length)];
}

function isRandomStyleMode(mode) {
    return String(mode ?? '') === STYLE_RANDOM;
}

/** Stick-to-one: Attack / Strength / Defence. Otherwise null. */
function stickStyleFromMode(mode) {
    const key = String(mode ?? '')
        .trim()
        .toLowerCase();
    return TRAINABLE.includes(key) ? key : null;
}

function nameEq(a, b) {
    return (a ?? '').toLowerCase() === (b ?? '').toLowerCase();
}

function normName(s) {
    return String(s ?? '')
        .toLowerCase()
        .replace(/-/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function worldZ(t) {
    if (!t) {
        return 0;
    }
    const z = t.z;
    const y = t.y;
    if (typeof z === 'number' && z > 32) {
        return z;
    }
    if (typeof y === 'number' && y > 32) {
        return y;
    }
    if (typeof z === 'number') {
        return z;
    }
    if (typeof y === 'number') {
        return y;
    }
    return 0;
}

function cheb(a, b) {
    if (!a || !b) {
        return 99;
    }
    return Math.max(Math.abs(a.x - b.x), Math.abs(worldZ(a) - worldZ(b)));
}

function tileOf(t = Game.tile()) {
    if (!t) {
        return null;
    }
    let src = t;
    try {
        if (typeof Tile.from === 'function') {
            src = Tile.from(t) ?? t;
        }
    } catch {
        src = t;
    }
    const x = src.x ?? t.x;
    const fromSrc = worldZ(src);
    const fromRaw = worldZ(t);
    const z = fromSrc > 32 ? fromSrc : fromRaw > 32 ? fromRaw : fromSrc || fromRaw;
    let level = src.level ?? src.plane ?? t.level ?? t.plane;
    if (typeof level !== 'number') {
        level = z >= DUNGEON_Z ? ZANARIS_LEVEL : 0;
    }
    if (typeof x !== 'number') {
        return src;
    }
    return new Tile(x, z, level);
}

function sameFloor(a, b) {
    if (!a || !b) {
        return true;
    }
    if (worldZ(a) >= DUNGEON_Z && worldZ(b) >= DUNGEON_Z) {
        return true;
    }
    const la = a.level ?? a.plane;
    const lb = b.level ?? b.plane;
    if (typeof la !== 'number' || typeof lb !== 'number') {
        return true;
    }
    return la === lb;
}

function playerLevel() {
    const here = Game.tile();
    return typeof here?.level === 'number' ? here.level : 0;
}

/**
 * Traversal and DirectNavigator only arrive when dest.level matches the player.
 * Keep the pin x,z and stamp the live plane. Do not remap across a z-band hop
 * (Zanaris z~9500 vs swamp shed z~3169).
 */
function walkTile(t) {
    if (!t || typeof t.x !== 'number') {
        return t;
    }
    const z = worldZ(t);
    const here = Game.tile();
    const hereZ = here ? worldZ(here) : z;
    const sameBand = Math.abs(z - hereZ) < 2000;
    const level = sameBand ? playerLevel() : (t.level ?? 0);
    return new Tile(t.x, z, level);
}

function distToBank(tile) {
    if (!tile) {
        return 999;
    }
    return cheb(tileOf(tile), BANK_STAND);
}

function inCamp(tile, radius = CAMP_RADIUS) {
    if (!tile) {
        return false;
    }
    return cheb(tileOf(tile), BEING_CAMP) <= radius;
}

function npcTargetsMe(n) {
    return typeof n.targetsMe === 'function' && !!n.targetsMe();
}

function npcTargetsAnother(n) {
    return typeof n.targetsAnotherPlayer === 'function' && !!n.targetsAnotherPlayer();
}

function hasAttackOp(n) {
    return n.actions().some(a => /attack/i.test(a ?? ''));
}

function isOtherworldlyBeing(n) {
    const name = (n?.name ?? '').toLowerCase().trim();
    return name.includes('otherworldly being') || name.includes('otherwordly being');
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

function locName(loc) {
    return (loc?.name ?? '').toLowerCase();
}

function locTile(loc) {
    try {
        const t = typeof loc.tile === 'function' ? loc.tile() : loc.tile;
        return tileOf(t);
    } catch {
        return null;
    }
}

function isShutDoor(loc) {
    const name = locName(loc);
    if (!name.includes('door') && !name.includes('gate') && !name.includes('shed')) {
        return false;
    }
    return locActions(loc).some(a => /^open/i.test(a ?? ''));
}

function openDoorOp(loc) {
    return locActions(loc).find(a => /^open/i.test(a ?? '')) ?? null;
}

function npcActions(npc) {
    if (!npc) {
        return [];
    }
    try {
        if (typeof npc.actions === 'function') {
            return npc.actions() ?? [];
        }
    } catch {
        /* ignore */
    }
    return [];
}

function npcTile(npc) {
    try {
        const t = typeof npc.tile === 'function' ? npc.tile() : npc.tile;
        return tileOf(t);
    } catch {
        return null;
    }
}

function bankerOp(npc) {
    const acts = npcActions(npc);
    return (
        acts.find(a => /^bank$/i.test(a ?? '')) ??
        acts.find(a => /bank/i.test(a ?? '')) ??
        null
    );
}

function findFairyBanker() {
    const hasBank = n => {
        const op = bankerOp(n);
        return !!op && /bank/i.test(op);
    };
    if (!Npcs || typeof Npcs.query !== 'function') {
        return null;
    }
    return (
        Npcs.query().name('Banker').within(20).where(hasBank).nearest() ??
        Npcs.query()
            .within(20)
            .where(n => /banker/i.test(n.name ?? '') && hasBank(n))
            .nearest() ??
        null
    );
}

function seesZanarisNpcs() {
    if (!Npcs || typeof Npcs.query !== 'function') {
        return false;
    }
    try {
        return (
            Npcs.query()
                .within(24)
                .where(n => {
                    const nm = (n.name ?? '').toLowerCase();
                    return (
                        nm.includes('fairy') ||
                        nm === 'gatekeeper' ||
                        nm === 'co-ordinator' ||
                        nm === 'coordinator' ||
                        nm.includes('otherworldly') ||
                        nm.includes('otherwordly')
                    );
                })
                .nearest() != null
        );
    } catch {
        return false;
    }
}

function inZanarisBox(t) {
    if (!t) {
        return false;
    }
    const z = worldZ(t);
    const x = t.x;
    if (x >= 2350 && x <= 2500 && z >= 4320 && z <= 4520) {
        return true;
    }
    return x >= 3140 && x <= 3260 && z >= 9440 && z <= 9680;
}

function inZanaris(tile = Game.tile()) {
    const t = tileOf(tile);
    if (inZanarisBox(t)) {
        return true;
    }
    if (t && cheb(t, LOST_CITY_SHED) <= 12) {
        return false;
    }
    return seesZanarisNpcs();
}

function nearBank(tile = Game.tile()) {
    const t = tileOf(tile);
    if (!t || !inZanaris(t)) {
        return false;
    }
    if (findFairyBanker()) {
        return true;
    }
    return cheb(t, BANK_STAND) <= BANK_RADIUS + 4;
}

function invItems() {
    try {
        return Inventory.items() ?? [];
    } catch {
        return [];
    }
}

function isDramenStaff(name) {
    const n = normName(name);
    return n === 'dramen staff' || n === 'dramenstaff';
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

function wearingDramenStaff() {
    try {
        if (typeof Equipment?.contains === 'function' && Equipment.contains(DRAMEN_NAME)) {
            return true;
        }
    } catch {
        /* ABI shape differs */
    }
    return equippedNames().some(n => isDramenStaff(n));
}

function dramenStaffCount() {
    return invItems().filter(i => isDramenStaff(i.name)).length;
}

function isDragonDaggerName(name) {
    const n = normName(name);
    if (!n) {
        return false;
    }
    return n.startsWith('dragon dagger') || n.startsWith('drag dagger') || n === 'dds';
}

function wearingDragonDagger() {
    try {
        if (typeof Equipment?.contains === 'function') {
            for (const name of DRAGON_DAGGER_NAMES) {
                if (Equipment.contains(name)) {
                    return true;
                }
            }
        }
    } catch {
        /* ABI shape differs */
    }
    return equippedNames().some(n => isDragonDaggerName(n));
}

function invDragonDagger() {
    return invItems().find(i => isDragonDaggerName(i.name)) ?? null;
}

function hasDragonDagger() {
    return wearingDragonDagger() || invDragonDagger() != null;
}

function isDragonLongswordName(name) {
    const n = normName(name);
    if (!n) {
        return false;
    }
    return n.startsWith('dragon longsword') || n === 'd long' || n === 'd longsword';
}

function wearingDragonLongsword() {
    try {
        if (typeof Equipment?.contains === 'function') {
            for (const name of DRAGON_LONGSWORD_NAMES) {
                if (Equipment.contains(name)) {
                    return true;
                }
            }
        }
    } catch {
        /* ABI shape differs */
    }
    return equippedNames().some(n => isDragonLongswordName(n));
}

function invDragonLongsword() {
    return invItems().find(i => isDragonLongswordName(i.name)) ?? null;
}

function hasDragonLongsword() {
    return wearingDragonLongsword() || invDragonLongsword() != null;
}

function isKeepWeaponName(name) {
    return isDramenStaff(name) || isDragonDaggerName(name) || isDragonLongswordName(name);
}

function paintWeaponStatus() {
    const main = wearingDragonLongsword()
        ? 'D long'
        : wearingDragonDagger()
          ? 'DDS (swap to D long)'
          : hasDragonLongsword()
            ? 'draw D long'
            : 'no D long';
    const spec = hasDragonDagger() ? 'DDS Puncture' : 'no dragon dagger';
    return `weapon ${main} · spec ${Math.round(specEnergyPercent())}% · ${spec}`;
}

async function wieldItem(item, untilFn) {
    if (!item) {
        return false;
    }
    if (typeof Equipment.equip === 'function') {
        await Equipment.equip(item.name);
    } else if (typeof item.interact === 'function') {
        await item.interact('Wield');
    } else {
        return false;
    }
    return !!(await Execution.delayUntil(untilFn, 3000));
}

function clientReader() {
    return welcomeHost()?.reader ?? null;
}

function clientActions() {
    return welcomeHost()?.actions ?? abi.actions ?? null;
}

function readVarp(id) {
    if (typeof Game.varp === 'function') {
        const v = Number(Game.varp(id));
        if (Number.isFinite(v)) {
            return v;
        }
    }
    const reader = clientReader();
    if (typeof reader?.varp === 'function') {
        const v = Number(reader.varp(id));
        if (Number.isFinite(v)) {
            return v;
        }
    }
    return 0;
}

function clickCom(com) {
    if (com == null || com < 0) {
        return false;
    }
    const actions = clientActions();
    if (typeof actions?.ifButton === 'function' && actions.ifButton(com)) {
        return true;
    }
    const MiniMenuAction = abi.MiniMenuAction ?? globalThis.MiniMenuAction;
    const ifButton = MiniMenuAction?.IF_BUTTON ?? MiniMenuAction?.ifButton;
    return typeof actions?.menuAction === 'function' && ifButton != null && !!actions.menuAction(ifButton, 0, 0, com);
}

/** Special energy 0–100. Varp 300 is usually 0–1000 (OSRS / late RS2). */
function specEnergyPercent() {
    for (const fn of [
        Game.specialEnergy,
        Game.specEnergy,
        Game.specialAttackEnergy,
        Game.specialAttackPercent
    ]) {
        if (typeof fn === 'function') {
            const v = Number(fn.call(Game));
            if (Number.isFinite(v) && v >= 0) {
                return v <= 100 ? v : v / 10;
            }
        }
    }
    const raw = readVarp(SPEC_ENERGY_VARP);
    if (raw <= 100) {
        return raw;
    }
    return raw / 10;
}

function hasPunctureEnergy() {
    return specEnergyPercent() >= DDS_SPEC_PERCENT;
}

function specIsEnabled() {
    for (const fn of [Game.specialAttackEnabled, Game.specEnabled, Game.specialAttackOn]) {
        if (typeof fn === 'function') {
            return !!fn.call(Game);
        }
    }
    return readVarp(SPEC_ENABLED_VARP) === 1;
}

function clickSpecialBar() {
    for (const fn of [Game.setSpecialAttack, Game.toggleSpecialAttack, Game.useSpecialAttack]) {
        if (typeof fn === 'function') {
            const ok = fn.call(Game, true);
            if (ok !== false) {
                return true;
            }
        }
    }
    return clickCom(DDS_SPEC_BAR_COM);
}

function prayerApiActive(name) {
    if (Prayer && typeof Prayer.active === 'function') {
        return !!Prayer.active(name);
    }
    const def = PRAYER_BUTTONS[name.toLowerCase()];
    return def ? readVarp(def.varp) === 1 : false;
}

function prayerApiAvailable(name) {
    if (Prayer && typeof Prayer.available === 'function') {
        return !!Prayer.available(name);
    }
    const def = PRAYER_BUTTONS[name.toLowerCase()];
    if (!def) {
        return false;
    }
    return Skills.level('prayer') >= def.level && Skills.effective('prayer') > 0;
}

async function setNamedPrayer(name, on) {
    if (prayerApiActive(name) === on) {
        return true;
    }
    if (on && !prayerApiAvailable(name)) {
        return false;
    }
    if (Prayer && typeof Prayer.set === 'function') {
        return !!(await Prayer.set(name, on));
    }
    const def = PRAYER_BUTTONS[name.toLowerCase()];
    if (!def) {
        return false;
    }
    if (!clickCom(def.com)) {
        return false;
    }
    return Execution.delayUntil(() => prayerApiActive(name) === on, 2000);
}

function packUsed() {
    if (typeof Inventory.used === 'function') {
        return Inventory.used();
    }
    return invItems().length;
}

function packFree() {
    if (typeof Inventory.free === 'function') {
        return Inventory.free();
    }
    return Math.max(0, 28 - packUsed());
}

function isMegaRareName(name) {
    return MEGA_RARE_RE.test(name ?? '');
}

function isUnidentifiedHerbName(itemName) {
    const n = normName(itemName);
    if (!n) {
        return false;
    }
    if (n.startsWith('grimy ')) {
        return false;
    }
    if (n === 'herb' || n === 'herbs' || n === 'unidentified herb') {
        return true;
    }
    return n.includes('unidentified') && (n.includes('herb') || n.includes('leaf') || n.includes('weed'));
}

function isHerbDrop(itemName, herb) {
    const n = normName(itemName);
    const token = normName(herb);
    if (!n || !token || !n.includes(token)) {
        return false;
    }
    return (
        n.includes('unidentified') ||
        n.includes('grimy') ||
        n.includes('leaf') ||
        n.includes('weed') ||
        n.includes('herb') ||
        n === token
    );
}

function itemId(item) {
    if (!item) {
        return -1;
    }
    try {
        if (typeof item.id === 'function') {
            const n = Number(item.id());
            if (Number.isFinite(n) && n >= 0) {
                return Math.floor(n);
            }
        }
    } catch {
        /* ignore */
    }
    const raw = item.id ?? item.typeId ?? item.snap?.id;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : -1;
}

function herbLabelForId(id) {
    if (typeof id !== 'number' || id < 0) {
        return null;
    }
    return HERB_ID_TO_LABEL[id] ?? null;
}

function groundItemName(g) {
    if (!g) {
        return '';
    }
    try {
        if (typeof g.name === 'function') {
            return String(g.name() ?? '');
        }
    } catch {
        /* ignore */
    }
    return String(g.name ?? '');
}

function namesMatchWanted(dropName, wanted) {
    const b = normName(wanted);
    let a = normName(dropName);
    if (!a || !b) {
        return false;
    }
    a = a
        .replace(/^\d+\s*x\s+/, '')
        .replace(/^\d+\s+/, '')
        .replace(/\s*\(\d+\)\s*$/, '')
        .trim();
    if (a === b || a === `${b}s` || b === `${a}s`) {
        return true;
    }
    if (a.startsWith(`${b} `) || a.startsWith(`${b}(`)) {
        return true;
    }
    return false;
}

function takeOp(g) {
    const acts = [];
    try {
        if (typeof g?.actions === 'function') {
            acts.push(...(g.actions() ?? []));
        }
    } catch {
        /* ignore */
    }
    return (
        acts.find(a => /^take$/i.test(String(a ?? ''))) ??
        acts.find(a => /take/i.test(String(a ?? ''))) ??
        'Take'
    );
}

function isSecretRdtName(itemName) {
    return SECRET_RDT_NAMES.some(n => namesMatchWanted(itemName, n));
}

function lootDefMatches(def, itemName, id = -1) {
    if (typeof id === 'number' && id >= 0 && Array.isArray(def.ids) && def.ids.includes(id)) {
        return true;
    }
    if (def.kind === 'megaRare') {
        return isMegaRareName(itemName);
    }
    if (def.kind === 'unidentifiedHerb') {
        if (herbLabelForId(id)) {
            return true;
        }
        return isUnidentifiedHerbName(itemName);
    }
    if (def.herb) {
        return isHerbDrop(itemName, def.herb);
    }
    return (def.names ?? []).some(n => namesMatchWanted(itemName, n));
}

function lootLabelForName(itemName, id = -1) {
    const fromId = herbLabelForId(id);
    if (fromId) {
        return fromId;
    }
    const def = LOOT_DEFS.find(d => lootDefMatches(d, itemName, id));
    if (def && def.kind !== 'unidentifiedHerb') {
        return def.label;
    }
    if (def?.kind === 'unidentifiedHerb') {
        return def.label;
    }
    if (isSecretRdtName(itemName) || isMegaRareName(itemName)) {
        return 'Mega Rare Table';
    }
    const n = groundItemName({ name: itemName }) || String(itemName ?? '').trim();
    return n || 'Unknown';
}

function lootLabelForItem(item) {
    return lootLabelForName(groundItemName(item), itemId(item));
}

function stackQty(item) {
    if (!item) {
        return 1;
    }
    for (const key of ['count', 'quantity', 'amount', 'stackSize']) {
        try {
            const raw = typeof item[key] === 'function' ? item[key]() : item[key];
            const n = Number(raw);
            if (Number.isFinite(n) && n > 0) {
                return Math.floor(n);
            }
        } catch {
            /* try next */
        }
    }
    return 1;
}

function invQtyForLootLabel(label) {
    return invItems().reduce((sum, i) => {
        if (lootLabelForItem(i) !== label) {
            return sum;
        }
        return sum + stackQty(i);
    }, 0);
}

function localPlayerName() {
    try {
        if (typeof Game.myName === 'function') {
            const n = Game.myName();
            if (n) {
                return String(n);
            }
        }
    } catch {
        /* ABI */
    }
    try {
        const n = clientReader()?.localPlayerName?.();
        if (n) {
            return String(n);
        }
    } catch {
        /* ABI */
    }
    return '';
}

function fmtXph(n) {
    const v = Math.max(0, Math.floor(n));
    return v.toLocaleString('en-US');
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
        typeof location !== 'undefined' ? new URLSearchParams(location.search).get('box') : null;
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
        /* private mode / blocked storage */
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

function readPrefNum(key, fallback) {
    const raw = readPrefRaw(key);
    if (raw === null) {
        return fallback;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
}

function readPrefStr(key, fallback) {
    const raw = readPrefRaw(key);
    return raw !== null ? raw.trim() : fallback;
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
            btn.title = 'Editable while paused, applies on the next loop / Resume';
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

const LOOT_STYLE_ID = 'zobk-loot-compact-css';
const LOOT_GRID_CLASS = 'zobk-loot-grid';
const LOOT_PILL_CLASS = 'zobk-loot-pill';

function injectLootCompactCss() {
    if (typeof document === 'undefined' || document.getElementById(LOOT_STYLE_ID)) {
        return;
    }
    const style = document.createElement('style');
    style.id = LOOT_STYLE_ID;
    style.textContent = `
.${LOOT_GRID_CLASS}{
  display:flex;
  flex-wrap:wrap;
  gap:5px 6px;
  align-items:flex-start;
  margin:4px 0 8px;
}
.${LOOT_GRID_CLASS} .${LOOT_PILL_CLASS},
.${LOOT_GRID_CLASS} .rs2b0t-param-row{
  display:inline-flex !important;
  flex-direction:row !important;
  align-items:center !important;
  gap:5px !important;
  margin:0 !important;
  padding:3px 9px 3px 6px !important;
  width:auto !important;
  max-width:none !important;
  min-width:0 !important;
  background:#2b2b2b !important;
  border-radius:999px !important;
  box-sizing:border-box;
  border:none !important;
}
.${LOOT_GRID_CLASS} .rs2b0t-param-help,
.${LOOT_GRID_CLASS} .rs2b0t-param-desc,
.${LOOT_GRID_CLASS} .rs2b0t-param-hint{
  display:none !important;
}
.${LOOT_GRID_CLASS} .rs2b0t-param-label{
  white-space:nowrap !important;
  font-size:12px !important;
  line-height:1.2 !important;
  padding:0 !important;
  margin:0 !important;
}
.${LOOT_GRID_CLASS} input[type="checkbox"],
.${LOOT_GRID_CLASS} input.rs2b0t-param-cb{
  width:13px !important;
  height:13px !important;
  min-width:13px !important;
  margin:0 !important;
  flex:0 0 auto;
}
`;
    document.head.appendChild(style);
}

function lootRowLabelText(row) {
    return (row.querySelector('.rs2b0t-param-label')?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function isLootParamRow(row) {
    if (row.classList.contains(LOOT_PILL_CLASS)) {
        return true;
    }
    const label = lootRowLabelText(row);
    if (LOOT_LABELS.has(label)) {
        return true;
    }
    return LOOT_DEFS.some(d => label === d.label || label.startsWith(`${d.label} `));
}

function wrapLootRows(rows) {
    if (rows.length === 0) {
        return;
    }
    const parent = rows[0].parentElement;
    if (parent?.classList.contains(LOOT_GRID_CLASS)) {
        for (const r of rows) {
            r.classList.add(LOOT_PILL_CLASS);
        }
        return;
    }
    const grid = document.createElement('div');
    grid.className = LOOT_GRID_CLASS;
    parent.insertBefore(grid, rows[0]);
    for (const r of rows) {
        r.classList.add(LOOT_PILL_CLASS);
        grid.appendChild(r);
    }
}

function compactLootTab() {
    if (typeof document === 'undefined') {
        return;
    }
    injectLootCompactCss();
    const bodies = document.querySelectorAll('.rs2b0t-params-body, .rs2b0t-settings, .rs2b0t-modal-body');
    const scopes = bodies.length > 0 ? bodies : [document];
    for (const scope of scopes) {
        const rows = [...scope.querySelectorAll('.rs2b0t-param-row')].filter(isLootParamRow);
        if (rows.length === 0) {
            continue;
        }
        const groups = new Map();
        for (const row of rows) {
            const key = row.parentElement;
            if (!key) {
                continue;
            }
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key).push(row);
        }
        for (const list of groups.values()) {
            wrapLootRows(list);
        }
    }
}

function dialogOpen() {
    if (!ChatDialog) {
        return false;
    }
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

function pickDialogOption(options, prefer, avoid) {
    const prefs = Array.isArray(prefer) ? prefer : [prefer];
    const avoidList = Array.isArray(avoid) ? avoid : [];
    const usable = options.filter(o => {
        const low = (o ?? '').toLowerCase();
        return !avoidList.some(a => low.includes(a));
    });
    const pool = usable.length > 0 ? usable : options;
    for (const p of prefs) {
        const hit = pool.find(o => (o ?? '').toLowerCase().includes(String(p).toLowerCase()));
        if (hit) {
            return hit;
        }
    }
    const yes = pool.find(o => /^yes/i.test(o ?? ''));
    return yes ?? (pool.length > 0 ? pool[0] : null);
}

function snapPinIndex(route, here) {
    if (!here || !route.length) {
        return 0;
    }
    let on = -1;
    let near = -1;
    let nearD = 9999;
    for (let j = 0; j < route.length; j++) {
        const d = cheb(route[j], here);
        if (d <= PIN_LOOSE) {
            on = j;
        } else if (d < nearD) {
            nearD = d;
            near = j;
        }
    }
    if (on >= 0) {
        return Math.min(on + 1, route.length);
    }
    if (near >= 0 && nearD <= 12) {
        return near;
    }
    return 0;
}

function advancePinIndex(route, here, pinIndex) {
    let i = Math.max(0, pinIndex);
    for (let j = route.length - 1; j >= i; j--) {
        if (cheb(route[j], here) <= PIN_LOOSE) {
            return Math.min(j + 1, route.length);
        }
    }
    while (i < route.length && cheb(route[i], here) <= PIN_LOOSE) {
        i++;
    }
    return i;
}

function lootSettingsSchema() {
    const schema = {};
    for (const def of LOOT_DEFS) {
        schema[def.key] = {
            type: 'boolean',
            default: true,
            label: def.label,
            group: 'Loot',
            help: `Take ${def.label} from Otherworldly beings you killed (drop tile of your last kill).`
        };
    }
    return schema;
}

class ZanarisOtherworldlyBeingKiller extends LoopingBot {
    status = 'starting';
    recovering = false;
    deaths = 0;
    attacks = 0;
    kills = 0;
    eats = 0;
    bankTrips = 0;
    bankFails = 0;
    startReady = false;
    goingToBank = false;
    banking = false;
    pinIndex = 0;
    pinRouteKey = '';

    foodType = 'Tuna';
    eatAtPercent = 50;
    panicHpPercent = 25;
    foodWithdraw = 20;
    styleMode = STYLE_LOWEST;
    killsBeforeSwap = 10;
    desiredStyle = 'attack';
    styleKillAnchor = 0;
    styleFails = 0;
    styleRetryAt = 0;
    /** @type {Record<string, boolean>} */
    lootTicks = Object.fromEntries(LOOT_DEFS.map(d => [d.key, true]));

    startedAt = 0;
    xpAtStart = Object.create(null);
    /** @type {Set<string>} */
    usedSkills = new Set();
    cantReach = false;
    lastCombatAt = 0;
    fightNpcIndex = -1;
    /** @type {InstanceType<typeof Tile> | null} */
    fightNpcTile = null;
    /** @type {InstanceType<typeof Tile> | null} */
    ownLootTile = null;
    ownLootUntil = 0;
    lootPileLogged = false;
    specs = 0;
    specWarned = false;
    mainWeaponWarned = false;
    specBusy = false;
    nextSpecAttemptAt = 0;
    /** @type {Record<string, number>} */
    lootCounts = Object.create(null);
    fleetId = '';
    /** @type {(() => void) | null} */
    fleetOnWake = null;
    /** @type {ReturnType<typeof setInterval> | null} */
    fleetTimer = null;
    /** @type {ReturnType<typeof setInterval> | null} */
    unlockTimer = null;

    async onStart() {
        await Execution.delayUntil(() => Game.ingame() && Game.tile() !== null, 0);
        Traversal.preload();
        if (typeof Banking?.preload === 'function') {
            Banking.preload();
        }
        this.startPausedPrefUnlock();

        this.syncPrefs({ silent: true });
        this.desiredStyle = this.pickStyleForMode();
        this.styleKillAnchor = 0;
        this.styleFails = 0;
        this.styleRetryAt = 0;

        this.startedAt = Date.now();
        this.xpAtStart = Object.create(null);
        this.usedSkills = new Set();
        this.deaths = 0;
        this.attacks = 0;
        this.kills = 0;
        this.eats = 0;
        this.bankTrips = 0;
        this.bankFails = 0;
        this.startReady = false;
        this.goingToBank = false;
        this.banking = false;
        this.pinIndex = 0;
        this.pinRouteKey = '';
        this.recovering = false;
        this.cantReach = false;
        this.lastCombatAt = 0;
        this.fightNpcIndex = -1;
        this.fightNpcTile = null;
        this.ownLootTile = null;
        this.ownLootUntil = 0;
        this.lootPileLogged = false;
        this.specs = 0;
        this.specWarned = false;
        this.mainWeaponWarned = false;
        this.specBusy = false;
        this.nextSpecAttemptAt = 0;
        this.lootCounts = Object.create(null);
        this.fleetId =
            typeof crypto?.randomUUID === 'function'
                ? crypto.randomUUID()
                : `zobk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.startFleetHeartbeat();
        for (const skill of COMBAT_TRACK) {
            this.xpAtStart[skill] = Skills.xp(skill);
        }

        this.on('chat.message', e => {
            if (CANT_REACH_RE.test(e.text)) {
                this.cantReach = true;
            }
            if (DEATH_RE.test(e.text) && !this.recovering) {
                this.recovering = true;
                this.deaths++;
                this.status = 'dead';
                this.log(`died (#${this.deaths}), waiting for respawn`);
            }
        });

        this.on('skill.xp', e => {
            if (COMBAT_TRACK.includes(e.name)) {
                this.usedSkills.add(e.name);
            }
        });

        this.on('skill.level', e => {
            if (TRAINABLE.includes(e.name) || e.name === 'hitpoints' || e.name === 'prayer') {
                this.log(`${e.name} level ${e.previous} → ${e.level}`);
            }
        });

        const lootOn = LOOT_DEFS.filter(d => this.lootTicks[d.key]).map(d => d.label);
        const here = tileOf();
        const where = inZanaris(here)
            ? 'Zanaris'
            : here
              ? `surface ${here.x},${here.z}`
              : 'unknown';
        this.log(
            `started, standing ${here ? `${here.x},${here.z}` : '?'} (${where}); ` +
                `Zanaris fairy bank ${BANK_STAND.x},${BANK_STAND.z} plane ${ZANARIS_LEVEL} (right-click Bank) → ` +
                `Otherworldly beings ${BEING_CAMP.x},${BEING_CAMP.z} r${CAMP_RADIUS}; ` +
                `eat ${this.foodType} at ≤${this.eatAtPercent}% HP; panic exit ≤${this.panicHpPercent}% with no food; ` +
                `bring ${this.foodWithdraw}; ${this.describeStyleMode()}; ` +
                `atk=${Skills.level('attack')} str=${Skills.level('strength')} def=${Skills.level('defence')}; ` +
                `dragon longsword to hit, dragon dagger Puncture at ${DDS_SPEC_PERCENT}% spec, then swap back`
        );
        if (inZanaris(here)) {
            this.log('already in Zanaris, skipping Lost City shed');
            this.status = inCamp(here) ? 'already at beings' : 'already in Zanaris';
        } else {
            this.status = 'start: Zanaris fairy bank';
        }
        this.log(
            `loot ticks: ${lootOn.length}/${LOOT_DEFS.length} on (${lootOn.length > 0 ? lootOn.slice(0, 8).join(', ') : 'none'}${lootOn.length > 8 ? '...' : ''})`
        );
        this.log(`special energy ${Math.round(specEnergyPercent())}% (Puncture costs ${DDS_SPEC_PERCENT}%)`);
        if (this.foodType === 'Cake') {
            this.log(
                `cake: eat leftovers first (${FOOD_SLICE} → ${FOOD_TWO_THIRDS} → ${FOOD_CAKE}); ` +
                    `withdraw ${FOOD_CAKE} then leftovers`
            );
        }
        this.log('tip: Pause → Edit parameters to change food / eat % / melee style / loot without stopping');
    }

    onPause() {
        unlockPausedPrefsUi();
        compactLootTab();
    }

    onResume() {
        this.syncPrefs({ silent: false });
    }

    onStop() {
        this.stopPausedPrefUnlock();
        this.setSpecPrayers(false);
        this.pushFleetHeartbeat('stopped');
        this.stopFleetHeartbeat();
        this.log(
            `stopped, ${this.attacks} attacks, ${this.kills} kills, ${this.eats} eats, ` +
                `${this.specs} Puncture specs, ${this.bankTrips} bank trips, ${this.deaths} deaths (${this.status})`
        );
    }

    startPausedPrefUnlock() {
        this.stopPausedPrefUnlock();
        this.unlockTimer = setInterval(() => {
            unlockPausedPrefsUi();
            compactLootTab();
        }, 500);
        unlockPausedPrefsUi();
        compactLootTab();
    }

    stopPausedPrefUnlock() {
        if (this.unlockTimer !== null) {
            clearInterval(this.unlockTimer);
            this.unlockTimer = null;
        }
    }

    startFleetHeartbeat() {
        this.stopFleetHeartbeat();
        this.pushFleetHeartbeat();
        this.fleetTimer = setInterval(() => this.pushFleetHeartbeat(), FLEET_HEARTBEAT_MS);
        this.startFleetWake();
    }

    stopFleetHeartbeat() {
        this.stopFleetWake();
        if (this.fleetTimer !== null) {
            clearInterval(this.fleetTimer);
            this.fleetTimer = null;
        }
    }

    startFleetWake() {
        this.stopFleetWake();
        this.fleetOnWake = () => this.pushFleetHeartbeat();
        try {
            globalThis.addEventListener('focus', this.fleetOnWake);
            globalThis.document?.addEventListener('visibilitychange', this.fleetOnWake);
        } catch {
            /* ignore */
        }
    }

    stopFleetWake() {
        if (!this.fleetOnWake) {
            return;
        }
        try {
            globalThis.removeEventListener('focus', this.fleetOnWake);
            globalThis.document?.removeEventListener('visibilitychange', this.fleetOnWake);
        } catch {
            /* ignore */
        }
        this.fleetOnWake = null;
    }

    noteLoot(label, qty) {
        if (!label || qty <= 0) {
            return;
        }
        this.lootCounts[label] = (this.lootCounts[label] ?? 0) + qty;
    }

    sessionXp() {
        const xp = {};
        for (const skill of COMBAT_TRACK) {
            const gained = Math.max(0, Skills.xp(skill) - (this.xpAtStart[skill] ?? 0));
            if (gained > 0) {
                xp[skill] = Math.round(gained);
            }
        }
        return xp;
    }

    fleetPayload(status = this.status) {
        return {
            id: this.fleetId,
            sessionId: this.fleetId,
            script: SCRIPT_NAME,
            title: SCRIPT_TITLE,
            version: SCRIPT_VERSION_FULL,
            name: localPlayerName() || 'unknown',
            status,
            startedAt: this.startedAt ? new Date(this.startedAt).toISOString() : null,
            runtimeMs: this.startedAt ? Date.now() - this.startedAt : 0,
            kills: this.kills,
            eats: this.eats,
            specs: this.specs,
            banks: this.bankTrips,
            deaths: this.deaths,
            attacks: this.attacks,
            hp: currentHp(),
            maxHp: maxHp(),
            food: this.foodType,
            foodCount: this.foodCount(),
            foodWithdraw: this.foodWithdraw,
            specEnergy: Math.round(specEnergyPercent()),
            style: this.desiredStyle,
            loot: { ...this.lootCounts },
            xp: this.sessionXp()
        };
    }

    publishFleetLocal(payload) {
        try {
            globalThis.postMessage({ __benzymeFleet: true, payload }, '*');
        } catch {
            /* ignore */
        }
    }

    pushFleetHeartbeat(status = this.status) {
        const payload = this.fleetPayload(status);
        this.publishFleetLocal(payload);
        const body = JSON.stringify(payload);
        try {
            if (status === 'stopped' && typeof navigator?.sendBeacon === 'function') {
                navigator.sendBeacon(FLEET_HEARTBEAT_URL, new Blob([body], { type: 'application/json' }));
                return;
            }
        } catch {
            /* fall through to fetch */
        }
        if (typeof fetch !== 'function') {
            return;
        }
        fetch(FLEET_HEARTBEAT_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
            keepalive: status === 'stopped',
            mode: 'cors'
        }).catch(() => {
            /* dashboard host down */
        });
    }

    syncPrefs(opts = {}) {
        const silent = opts.silent === true;
        const prevFood = this.foodType;
        const prevEat = this.eatAtPercent;
        const prevPanic = this.panicHpPercent;
        const prevBring = this.foodWithdraw;
        const prevMode = this.styleMode;
        const prevKillsSwap = this.killsBeforeSwap;

        let food = readPrefStr('foodType', this.settings.str('foodType', this.foodType));
        if (!FOOD_TYPES[food]) {
            food = 'Tuna';
        }
        this.foodType = food;
        this.eatAtPercent = clampPercent(
            readPrefNum('eatAtPercent', this.settings.num('eatAtPercent', this.eatAtPercent))
        );
        this.panicHpPercent = clampPercent(
            readPrefNum('panicHpPercent', this.settings.num('panicHpPercent', this.panicHpPercent))
        );
        const bringRaw = readPrefStr(
            'foodWithdraw',
            this.settings.str('foodWithdraw', String(this.foodWithdraw))
        );
        this.foodWithdraw = clampFoodAmount(bringRaw);

        let mode = readPrefStr('styleMode', this.settings.str('styleMode', this.styleMode));
        if (!STYLE_OPTIONS.includes(mode)) {
            mode = STYLE_LOWEST;
        }
        this.styleMode = mode;
        this.killsBeforeSwap = clampKillsBeforeSwap(
            readPrefNum('killsBeforeSwap', this.settings.num('killsBeforeSwap', this.killsBeforeSwap))
        );

        for (const def of LOOT_DEFS) {
            this.lootTicks[def.key] = readPrefBool(def.key, this.settings.bool(def.key, true));
        }

        if (!silent && prevFood !== this.foodType) {
            this.log(`prefs: food → ${this.foodType}`);
        }
        if (!silent && prevEat !== this.eatAtPercent) {
            this.log(`prefs: eat at ≤ ${this.eatAtPercent}% HP`);
        }
        if (!silent && prevPanic !== this.panicHpPercent) {
            this.log(`prefs: panic exit at ≤ ${this.panicHpPercent}% HP with no food`);
        }
        if (!silent && prevBring !== this.foodWithdraw) {
            this.log(`prefs: bring ${this.foodWithdraw}× ${this.foodType}`);
        }
        if (this.styleMode !== prevMode) {
            this.desiredStyle = this.pickStyleForMode();
            this.styleKillAnchor = this.kills;
            if (!silent) {
                this.log(`prefs: melee style → ${this.describeStyleMode()}`);
            }
        } else if (!silent && isRandomStyleMode(this.styleMode) && prevKillsSwap !== this.killsBeforeSwap) {
            this.log(`prefs: random swap every ${this.killsBeforeSwap} kills`);
        }
    }

    pickStyleForMode() {
        const stick = stickStyleFromMode(this.styleMode);
        if (stick) {
            return stick;
        }
        if (isRandomStyleMode(this.styleMode)) {
            return pickRandomStyle(null);
        }
        return pickLowestStyle(this.desiredStyle);
    }

    describeStyleMode() {
        const stick = stickStyleFromMode(this.styleMode);
        if (stick) {
            return `stick ${stick}`;
        }
        if (isRandomStyleMode(this.styleMode)) {
            const done = Math.max(0, this.kills - this.styleKillAnchor);
            return `random swap every ${this.killsBeforeSwap} kills (now ${this.desiredStyle}, ${done}/${this.killsBeforeSwap})`;
        }
        return `lowest melee (now ${this.desiredStyle})`;
    }

    foodCfg() {
        return FOOD_TYPES[this.foodType] ?? FOOD_TYPES.Tuna;
    }

    foodNames() {
        return this.foodCfg().eat.slice();
    }

    withdrawNames() {
        return this.foodCfg().withdraw.slice();
    }

    findBestFood() {
        for (const name of this.foodNames()) {
            const item = invItems().find(i => nameEq(i.name, name));
            if (item) {
                return item;
            }
        }
        return null;
    }

    foodCount() {
        return this.foodNames().reduce((n, name) => {
            if (typeof Inventory.count === 'function') {
                return n + (Inventory.count(name) || 0);
            }
            return (
                n +
                invItems()
                    .filter(i => nameEq(i.name, name))
                    .reduce((s, i) => s + Math.max(1, i.count || 0), 0)
            );
        }, 0);
    }

    isFoodName(name) {
        const n = (name ?? '').toLowerCase();
        return this.foodNames().some(f => f.toLowerCase() === n);
    }

    packHasLoot() {
        return invItems().some(i => {
            if (this.isFoodName(i.name)) {
                return false;
            }
            if (isKeepWeaponName(i.name)) {
                return false;
            }
            return true;
        });
    }

    needBankTrip() {
        if (this.foodCount() === 0) {
            return true;
        }
        if (this.goingToBank) {
            return true;
        }
        return Inventory.isFull() && this.packHasLoot();
    }

    needEat() {
        if (!this.findBestFood()) {
            return false;
        }
        return hpPercent() <= this.eatAtPercent;
    }

    needPanicExit() {
        return this.foodCount() === 0 && hpPercent() <= this.panicHpPercent;
    }

    async beginPanicBank() {
        if (!this.goingToBank) {
            this.goingToBank = true;
            const pct = Math.round(hpPercent());
            this.log(
                `PANIC ${pct}% HP ≤ ${this.panicHpPercent}% and no food, leaving now (skip loot / combat)`
            );
        }
        this.status = 'panic exit, bank';
        await this.setSpecPrayers(false);
        await this.bankFoodRestock();
    }

    describeFood() {
        if (this.foodType === 'Cake') {
            return `${FOOD_CAKE} / ${FOOD_TWO_THIRDS} / ${FOOD_SLICE}`;
        }
        return this.foodType;
    }

    lootTicked(def) {
        return this.lootTicks[def.key] === true;
    }

    shouldLootName(itemName, id = -1) {
        const name = groundItemName({ name: itemName }) || String(itemName ?? '');
        if (isSecretRdtName(name)) {
            return true;
        }
        return LOOT_DEFS.some(def => this.lootTicked(def) && lootDefMatches(def, name, id));
    }

    shouldLootItem(item) {
        return this.shouldLootName(groundItemName(item), itemId(item));
    }

    stopNoFood(context) {
        this.status = 'no food, stopped';
        this.log(
            `${context}: no ${this.describeFood()} in Zanaris fairy bank, stopping (restock food, then restart)`
        );
        stopScript();
    }

    noteCombat() {
        this.lastCombatAt = Date.now();
    }

    noteFightTarget(npc) {
        if (!npc) {
            return;
        }
        if (this.fightNpcIndex >= 0 && npc.index !== this.fightNpcIndex) {
            this.openOwnLootWindow(this.fightNpcTile);
        }
        this.fightNpcIndex = npc.index;
        const t = npc.tile?.() ?? null;
        if (t) {
            this.fightNpcTile = tileOf(t);
        }
    }

    npcIsOurFight(npc) {
        if (!npc) {
            return false;
        }
        if (npcTargetsMe(npc)) {
            return true;
        }
        if (Game.inCombat() && npc.inCombat && !npcTargetsAnother(npc)) {
            return true;
        }
        return false;
    }

    openOwnLootWindow(tile) {
        this.kills++;
        if (tile) {
            this.ownLootTile = tileOf(tile);
            this.ownLootUntil = Date.now() + OWN_LOOT_MS;
            this.lootPileLogged = false;
            this.log(
                `own kill @ ${this.ownLootTile.x},${this.ownLootTile.z}, loot window ${OWN_LOOT_MS / 1000}s`
            );
        }
        this.fightNpcIndex = -1;
        this.fightNpcTile = null;
    }

    refreshOwnKillLoot() {
        if (this.fightNpcIndex < 0) {
            return;
        }
        const still = Npcs.query()
            .where(n => n.index === this.fightNpcIndex)
            .nearest();
        if (still && this.npcIsOurFight(still)) {
            const t = still.tile?.() ?? null;
            if (t && this.fightNpcTile && cheb(tileOf(t), this.fightNpcTile) > 10) {
                this.openOwnLootWindow(this.fightNpcTile);
                return;
            }
            if (t) {
                this.fightNpcTile = tileOf(t);
            }
            return;
        }
        this.openOwnLootWindow(this.fightNpcTile);
    }

    listGroundItems() {
        try {
            const list = GroundItems.query().within(GROUND_SCAN_RADIUS).results();
            if (Array.isArray(list)) {
                return list;
            }
        } catch {
            /* fall through */
        }
        try {
            const one = GroundItems.query().within(GROUND_SCAN_RADIUS).nearest();
            return one ? [one] : [];
        } catch {
            return [];
        }
    }

    findOwnGroundLoot() {
        if (!this.ownLootTile || Date.now() > this.ownLootUntil) {
            return null;
        }
        if (Inventory.isFull()) {
            return null;
        }
        const spot = this.ownLootTile;
        const nearby = [];
        const hits = [];
        for (const g of this.listGroundItems()) {
            const t = g.tile?.() ?? null;
            if (!t) {
                continue;
            }
            const d = cheb(tileOf(t), spot);
            if (d > OWN_LOOT_RADIUS) {
                continue;
            }
            nearby.push(g);
            if (this.shouldLootItem(g)) {
                hits.push(g);
            }
        }
        if (nearby.length > 0 && hits.length === 0 && !this.lootPileLogged) {
            this.lootPileLogged = true;
            this.log(
                `own pile @ ${spot.x},${spot.z} has [${nearby
                    .map(g => {
                        const id = itemId(g);
                        const herb = herbLabelForId(id);
                        return herb ? `${herb}#${id}` : groundItemName(g);
                    })
                    .join(', ')}], none match ticks`
            );
        }
        return hits.length > 0 ? hits[0] : null;
    }

    async handleLoot() {
        const here = tileOf();
        const windowOpen =
            this.ownLootTile && Date.now() <= this.ownLootUntil && !Inventory.isFull();
        if (windowOpen && here && cheb(here, this.ownLootTile) > 2) {
            this.status = 'walking to loot pile';
            this.log(`walking to loot pile ${this.ownLootTile.x},${this.ownLootTile.z}`);
            await this.walkTo(this.ownLootTile, 1);
            return true;
        }

        const ground = this.findOwnGroundLoot();
        if (!ground) {
            return false;
        }

        const pile = ground.tile?.() ?? this.ownLootTile;
        if (here && pile && cheb(here, tileOf(pile)) > 1) {
            this.status = 'walking to loot';
            this.log(
                `walking to loot ${herbLabelForId(itemId(ground)) ?? groundItemName(ground)} @ ${pile.x},${pile.z}`
            );
            await this.walkTo(tileOf(pile), 1);
        }

        const name = groundItemName(ground);
        const id = itemId(ground);
        const label = lootLabelForItem(ground);
        const shown = herbLabelForId(id) ?? name;
        this.status = `looting ${shown}`;
        const beforeSlots = packUsed();
        const beforeQty = invQtyForLootLabel(label);
        await ground.interact(takeOp(ground));
        const took = await Execution.delayUntil(
            () => packUsed() > beforeSlots || invQtyForLootLabel(label) > beforeQty,
            5000
        );
        if (took) {
            const gained = Math.max(1, invQtyForLootLabel(label) - beforeQty);
            this.noteLoot(label, gained);
            this.log(
                `looted ${gained}× ${shown}` +
                    (id >= 0 ? ` (id ${id})` : '') +
                    ` @ ${this.ownLootTile.x},${this.ownLootTile.z}`
            );
        }
        return true;
    }

    async loop() {
        this.syncPrefs({ silent: true });
        unlockPausedPrefsUi();
        compactLootTab();

        if (!Game.ingame()) {
            await Execution.delayTicks(5);
            return;
        }
        if (await dismissWelcomeScreen()) {
            this.status = 'close welcome';
            return;
        }

        if (this.recovering) {
            await this.recover();
            return;
        }

        if (this.needPanicExit()) {
            if (typeof ChatDialog !== 'undefined' && ChatDialog?.canContinue()) {
                await ChatDialog.continue();
                return;
            }
            await this.beginPanicBank();
            return;
        }

        if (await this.handleDialog()) {
            return;
        }

        if (this.needEat()) {
            await this.eatFood();
            return;
        }

        if (!this.startReady) {
            const here = tileOf();
            if (inZanaris(here) && this.foodCount() > 0) {
                this.startReady = true;
                if (inCamp(here)) {
                    this.log(
                        `already at beings in Zanaris with ${this.foodCount()}× ${this.describeFood()}, skip startup bank`
                    );
                } else {
                    this.log(
                        `already in Zanaris with ${this.foodCount()}× ${this.describeFood()}, skip shed and startup bank`
                    );
                }
            } else {
                if (inZanaris(here)) {
                    this.log('already in Zanaris, startup restock at fairy bank');
                }
                await this.bankFoodRestock({ startup: true });
                return;
            }
        }

        if (this.needBankTrip()) {
            if (!this.goingToBank) {
                this.goingToBank = true;
                if (this.foodCount() === 0) {
                    this.log('out of food, walking to Zanaris fairy bank (right-click Bank)');
                } else {
                    this.log(
                        `pack full of loot (${packUsed()}/28), walking to Zanaris fairy bank (right-click Bank)`
                    );
                }
            }
            await this.bankFoodRestock();
            return;
        }

        if (Bank.isOpen()) {
            await Bank.close();
            return;
        }

        if (await this.ensureCombatStyle()) {
            return;
        }

        if (inZanaris() && (await this.ensureWieldMainWeapon())) {
            return;
        }

        const here = tileOf();
        if (!here) {
            await Execution.delayTicks(2);
            return;
        }

        if (!inZanaris(here)) {
            this.status = 'returning to Zanaris';
            if (!(await this.ensureZanaris())) {
                return;
            }
        }

        this.refreshOwnKillLoot();

        if (await this.handleLoot()) {
            return;
        }

        if (!inCamp(here)) {
            if (await this.openNearbyDoor(4)) {
                return;
            }
            this.status = 'walking to beings';
            this.log(`walking to Otherworldly beings ${BEING_CAMP.x},${BEING_CAMP.z}`);
            await this.walkTo(BEING_CAMP, 4);
            return;
        }

        if (Game.inCombat()) {
            this.noteCombat();
            const onMe = this.findBeingFightingMe();
            if (onMe) {
                this.noteFightTarget(onMe);
                this.status = 'in combat';
                if (await this.maybeDragonDaggerSpec()) {
                    return;
                }
                await Execution.delayTicks(2);
                return;
            }
        }

        const target = this.findAttackableBeing();
        if (!target) {
            this.status = 'waiting for being';
            await this.walkTo(BEING_CAMP, 2);
            await Execution.delayTicks(2);
            return;
        }

        await this.attackBeing(target);
    }

    async handleDialog() {
        if (!ChatDialog) {
            return false;
        }
        if (ChatDialog.canContinue()) {
            this.status = 'continue dialog';
            await ChatDialog.continue();
            await Execution.delayTicks(1);
            return true;
        }
        if (!dialogOpen()) {
            return false;
        }
        const opts = typeof ChatDialog.options === 'function' ? ChatDialog.options() : [];
        const pick = pickDialogOption(opts, BANK_DIALOG_PREFER, DIALOG_AVOID);
        this.status = `dialog: ${pick ?? '?'}`;
        this.log(`dialog → ${pick}  [${opts.join(' | ')}]`);
        if (typeof ChatDialog.chooseOption === 'function') {
            if (pick) {
                await ChatDialog.chooseOption(pick);
            } else {
                await ChatDialog.chooseOption();
            }
        }
        await Execution.delayTicks(2);
        return true;
    }

    async openNearbyDoor(radius = 3) {
        const door = Locs.query()
            .where(l => isShutDoor(l))
            .where(l => l.distance() <= radius)
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

    async ensureZanaris() {
        if (inZanaris()) {
            return true;
        }
        if (!wearingDramenStaff()) {
            const staff = invItems().find(i => isDramenStaff(i.name));
            if (staff && typeof Equipment.equip === 'function') {
                this.status = 'wielding Dramen staff';
                this.log('wielding Dramen staff for Zanaris');
                await Equipment.equip(staff.name);
                await Execution.delayTicks(2);
            }
        }
        if (!wearingDramenStaff() && dramenStaffCount() <= 0) {
            this.status = 'not in Zanaris';
            this.log(
                'stopped, Otherworldly beings are in Zanaris (Lost City). Wield a Dramen staff and start at the swamp shed, or start already in Zanaris'
            );
            stopScript();
            return false;
        }
        const here = tileOf();
        if (here && cheb(here, LOST_CITY_SHED) > 6) {
            this.status = 'walking to Lost City shed';
            this.log(
                `not in Zanaris (at ${here.x},${here.z}), walking to Lost City shed ${LOST_CITY_SHED.x},${LOST_CITY_SHED.z}`
            );
            await this.followPin(LOST_CITY_SHED, 3);
        }
        const door =
            Locs.query()
                .where(l => {
                    const t = locTile(l);
                    return t && cheb(t, LOST_CITY_SHED) <= 4 && /door|shed/i.test(locName(l));
                })
                .nearest() ??
            Locs.query()
                .where(l => isShutDoor(l) && l.distance() <= 4)
                .nearest();
        if (door) {
            const op = openDoorOp(door) ?? 'Open';
            this.status = 'entering Zanaris shed';
            this.log(`${op} ${door.name ?? 'shed door'} (Dramen staff)`);
            await door.interact(op);
            await Execution.delayUntil(() => inZanaris(), 8000);
        }
        if (!inZanaris()) {
            await this.followPin(LOST_CITY_SHED, 1);
        }
        return inZanaris();
    }

    async followPin(tile, radius = PIN_FOLLOW, opts = {}) {
        if (!tile) {
            return false;
        }
        tile = walkTile(tile);
        const here0 = tileOf();
        if (here0 && cheb(tile, here0) <= radius) {
            return true;
        }
        this.status = `walking ${tile.x},${tile.z}`;
        const timeoutMs = opts.timeoutMs ?? (opts.scene ? 12_000 : 20_000);
        const dest = { x: tile.x, z: worldZ(tile), level: tile.level ?? playerLevel() };
        if (opts.scene && DirectNavigator && typeof DirectNavigator.walkTo === 'function') {
            await DirectNavigator.walkTo(dest, radius, timeoutMs);
        } else if (typeof Traversal?.walkResilient === 'function') {
            await Traversal.walkResilient(tile, {
                radius,
                attempts: 2,
                timeoutMs,
                log: m => this.log(`  ${m}`)
            });
        } else if (DirectNavigator && typeof DirectNavigator.walkTo === 'function') {
            await DirectNavigator.walkTo(dest, radius, timeoutMs);
        } else if (typeof Traversal?.walkTo === 'function') {
            await Traversal.walkTo(tile, { radius, timeoutMs });
        }
        await this.openNearbyDoor(3);
        const after = tileOf();
        return !!after && cheb(tile, after) <= radius + 2;
    }

    async walkTo(dest, radius) {
        dest = walkTile(tileOf(dest) ?? dest);
        const here0 = tileOf();
        if (!here0) {
            return false;
        }
        if (cheb(dest, here0) <= radius && sameFloor(here0, dest)) {
            return true;
        }

        const toCamp = cheb(dest, BEING_CAMP) <= cheb(dest, BANK_STAND);
        const route = toCamp ? CAMP_ROUTE.slice() : [...CAMP_ROUTE].reverse();
        const onRoute = route.some(p => cheb(here0, p) <= 18);
        if (!inZanaris(here0) || !onRoute) {
            return await this.followPin(dest, radius, { scene: true });
        }

        const key = `${dest.x},${dest.z}:${route.map(p => `${p.x},${p.z}`).join('|')}`;
        if (this.pinRouteKey !== key) {
            this.pinRouteKey = key;
            this.pinIndex = snapPinIndex(route, here0);
        } else if (this.pinIndex >= route.length) {
            this.pinIndex = snapPinIndex(route, here0);
        }

        const started = Date.now();
        while (Date.now() - started < 90_000) {
            const here = tileOf();
            if (!here) {
                return false;
            }
            if (cheb(dest, here) <= radius && sameFloor(here, dest)) {
                return true;
            }
            if (ChatDialog?.canContinue?.()) {
                await ChatDialog.continue();
                continue;
            }
            this.pinIndex = advancePinIndex(route, here, this.pinIndex);
            if (this.pinIndex >= route.length) {
                await this.followPin(dest, radius, { scene: true });
                continue;
            }
            const pin = route[this.pinIndex];
            if (cheb(here, pin) <= PIN_FOLLOW) {
                this.pinIndex++;
                continue;
            }
            this.log(
                `walk ${pin.x},${pin.z} (pin ${this.pinIndex + 1}/${route.length}, ${cheb(dest, here)}t to dest)`
            );
            const before = tileOf();
            const reached = await this.followPin(pin, PIN_FOLLOW, { scene: true, timeoutMs: 12_000 });
            const after = tileOf();
            if (!reached && before && after && cheb(after, before) <= 1) {
                await this.openNearbyDoor(4);
                await this.followPin(pin, PIN_FOLLOW, { scene: true, timeoutMs: 8_000 });
                const stuck = tileOf();
                if (stuck && cheb(stuck, pin) > PIN_FOLLOW + 2 && cheb(stuck, before) <= 1) {
                    this.log(`pin ${pin.x},${pin.z} blocked, skipping`);
                    this.pinIndex++;
                }
            }
        }
        const end = tileOf();
        return !!end && cheb(dest, end) <= radius;
    }

    async ensureWieldMainWeapon() {
        if (this.specBusy) {
            return false;
        }
        if (wearingDragonLongsword()) {
            return false;
        }
        if (Game.inCombat() && this.canPuncture() && wearingDragonDagger()) {
            return false;
        }
        if (Skills.level('attack') < DLS_WIELD_ATTACK) {
            if (!this.mainWeaponWarned) {
                this.mainWeaponWarned = true;
                this.log(
                    `Attack ${Skills.level('attack')} < ${DLS_WIELD_ATTACK}, cannot wield a dragon longsword`
                );
            }
            return false;
        }
        const longsword = invDragonLongsword();
        if (!longsword) {
            if (!this.mainWeaponWarned && !hasDragonLongsword()) {
                this.mainWeaponWarned = true;
                this.log('no dragon longsword worn or in pack, hitting with whatever is equipped');
            }
            return false;
        }
        this.status = `wielding ${longsword.name}`;
        this.log(`wielding ${longsword.name} as main weapon`);
        await wieldItem(longsword, () => wearingDragonLongsword());
        return true;
    }

    async wieldDragonDaggerForSpec() {
        if (wearingDragonDagger()) {
            return true;
        }
        if (Skills.level('attack') < DDS_WIELD_ATTACK) {
            if (!this.specWarned) {
                this.specWarned = true;
                this.log(
                    `Attack ${Skills.level('attack')} < ${DDS_WIELD_ATTACK}, cannot wield a dragon dagger, skipping Puncture`
                );
            }
            return false;
        }
        const dagger = invDragonDagger();
        if (!dagger) {
            return false;
        }
        this.status = `wielding ${dagger.name}`;
        this.log(`swapping to ${dagger.name} for Puncture`);
        return wieldItem(dagger, () => wearingDragonDagger());
    }

    async wieldMainWeaponBack() {
        if (wearingDragonLongsword()) {
            return true;
        }
        const longsword = invDragonLongsword();
        if (!longsword) {
            if (wearingDragonDagger()) {
                this.log('Puncture done, no dragon longsword in pack to swap back to');
            }
            return false;
        }
        this.status = `wielding ${longsword.name}`;
        this.log(`swapping back to ${longsword.name}`);
        return wieldItem(longsword, () => wearingDragonLongsword());
    }

    async setSpecPrayers(on) {
        let changed = false;
        for (const name of SPEC_PRAYERS) {
            if (on && !prayerApiAvailable(name)) {
                continue;
            }
            if (prayerApiActive(name) === on) {
                continue;
            }
            const ok = await setNamedPrayer(name, on);
            if (ok) {
                changed = true;
            } else if (on) {
                this.log(`could not turn on ${name}`);
            }
        }
        return changed;
    }

    canPuncture() {
        if (!hasDragonDagger()) {
            return false;
        }
        if (Skills.level('attack') < DDS_WIELD_ATTACK) {
            return false;
        }
        if (Date.now() < (this.nextSpecAttemptAt || 0)) {
            return false;
        }
        return hasPunctureEnergy();
    }

    async maybeDragonDaggerSpec() {
        if (this.specBusy || !this.canPuncture()) {
            return false;
        }
        this.specBusy = true;
        try {
            if (!hasPunctureEnergy()) {
                return false;
            }
            if (!(await this.wieldDragonDaggerForSpec()) || !wearingDragonDagger()) {
                this.log('could not wield a dragon dagger for Puncture');
                return true;
            }
            if (!hasPunctureEnergy()) {
                this.log(`spec ${Math.round(specEnergyPercent())}% is below ${DDS_SPEC_PERCENT}%, swap back to dragon longsword`);
                return true;
            }
            const energy = Math.round(specEnergyPercent());
            this.status = `Puncture spec (${energy}%)`;
            this.log(
                `Puncture: Ultimate Strength + Incredible Reflexes, then dragon dagger spec (${energy}% energy)`
            );
            await this.setSpecPrayers(true);
            if (!wearingDragonDagger()) {
                this.log('lost dragon dagger before spec click, aborting Puncture');
                await this.setSpecPrayers(false);
                return true;
            }
            if (!hasPunctureEnergy()) {
                this.log(`spec dropped below ${DDS_SPEC_PERCENT}% before click, aborting Puncture`);
                await this.setSpecPrayers(false);
                return true;
            }
            const before = specEnergyPercent();
            if (!specIsEnabled()) {
                if (!clickSpecialBar()) {
                    this.log('could not send Puncture spec packet');
                    await this.setSpecPrayers(false);
                    return true;
                }
            }
            const consumed = await Execution.delayUntil(
                () => specEnergyPercent() <= before - DDS_SPEC_PERCENT + 5 || specEnergyPercent() < before - 2,
                3500
            );
            await Execution.delayTicks(2);
            await this.setSpecPrayers(false);
            if (consumed) {
                this.specs++;
                this.log(
                    `Puncture #${this.specs} done, spec ${Math.round(specEnergyPercent())}%, prayers off, swap to dragon longsword`
                );
            } else {
                this.nextSpecAttemptAt = Date.now() + 8000;
                this.log('Puncture did not consume spec energy, prayers off, swap to dragon longsword');
            }
            return true;
        } finally {
            await this.wieldMainWeaponBack();
            this.specBusy = false;
        }
    }

    async attackBeing(npc) {
        const name = npc.name ?? 'Otherworldly being';
        const t = npc.tile();
        this.status = `attacking ${name}`;
        this.log(`attacking ${name} @ ${t.x},${t.z}`);
        this.cantReach = false;
        this.noteFightTarget(npc);
        await npc.interact('Attack');
        await Execution.delayUntil(
            () => Game.inCombat() || this.cantReach || this.findBeingFightingMe() !== null,
            4000
        );

        if (Game.inCombat() || this.findBeingFightingMe()) {
            this.noteCombat();
            this.attacks++;
            const fighting = this.findBeingFightingMe();
            if (fighting) {
                this.noteFightTarget(fighting);
            }
            return;
        }

        if (this.cantReach) {
            this.log("can't reach that being, skipping");
            this.fightNpcIndex = -1;
        }
    }

    findBeingFightingMe() {
        return (
            Npcs.query()
                .within(CAMP_RADIUS + 4)
                .where(n => isOtherworldlyBeing(n))
                .where(n => npcTargetsMe(n))
                .nearest() ??
            Npcs.query()
                .within(4)
                .where(n => isOtherworldlyBeing(n))
                .where(n => hasAttackOp(n))
                .where(n => n.inCombat && !npcTargetsAnother(n))
                .nearest() ??
            null
        );
    }

    findAttackableBeing() {
        const onMe = this.findBeingFightingMe();
        if (onMe) {
            return onMe;
        }

        return (
            Npcs.query()
                .action('Attack')
                .within(CAMP_RADIUS)
                .where(n => isOtherworldlyBeing(n))
                .where(n => {
                    const t = n.tile?.() ?? null;
                    return t != null && inCamp(t);
                })
                .where(n => !npcTargetsAnother(n))
                .where(n => !n.inCombat)
                .nearest() ??
            Npcs.query()
                .within(CAMP_RADIUS)
                .where(n => isOtherworldlyBeing(n))
                .where(n => hasAttackOp(n))
                .where(n => {
                    const t = n.tile?.() ?? null;
                    return t != null && inCamp(t);
                })
                .where(n => !npcTargetsAnother(n))
                .where(n => !n.inCombat)
                .nearest() ??
            null
        );
    }

    async eatFood() {
        const food = this.findBestFood();
        if (!food) {
            return;
        }
        const before = currentHp();
        const pct = Math.round(hpPercent());
        this.status = `eating ${food.name}`;
        this.log(`HP ${before}/${maxHp()} (${pct}%) ≤ ${this.eatAtPercent}%, Eat ${food.name}`);
        if (!(await food.interact('Eat'))) {
            await Execution.delayTicks(1);
            return;
        }
        if (await Execution.delayUntil(() => currentHp() > before, 3000)) {
            this.eats++;
        }
    }

    async openFairyBank() {
        if (Bank.isOpen()) {
            if (nearBank(Game.tile())) {
                this.bankFails = 0;
                return true;
            }
            this.log('wrong bank open, closing');
            await Bank.close();
            await Execution.delayTicks(1);
        }

        if (!inZanaris()) {
            if (!(await this.ensureZanaris())) {
                return false;
            }
        }

        const here = tileOf();
        if (here && cheb(here, BANK_STAND) > BANK_RADIUS) {
            this.status = 'walking to Zanaris bank';
            this.log(`walking to Zanaris fairy bank ${BANK_STAND.x},${BANK_STAND.z}`);
            if (!(await this.walkTo(BANK_STAND, 4))) {
                this.log('path to Zanaris bank failed, retrying');
                return false;
            }
        }

        if (cheb(tileOf() ?? BANK_STAND, BANK_STAND) > BANK_RADIUS) {
            return false;
        }

        this.status = 'opening Zanaris bank';
        const banker = findFairyBanker();
        const op = banker ? bankerOp(banker) : null;
        let opened = false;
        if (banker && op) {
            this.log(`Bank ${banker.name ?? 'Banker'} (right-click)`);
            await banker.interact(op);
            await Execution.delayUntil(() => Bank.isOpen() || dialogOpen(), 6000);
            if (dialogOpen() && !Bank.isOpen()) {
                await this.handleDialog();
                await Execution.delayUntil(() => Bank.isOpen(), 4000);
            }
            opened = Bank.isOpen();
        } else {
            this.log('no fairy banker with Bank nearby');
        }
        if (!opened) {
            this.log('fairy banker Bank missed, retrying');
        }
        if (opened) {
            this.bankFails = 0;
            return true;
        }
        if (++this.bankFails >= MAX_BANK_FAILS) {
            this.status = 'could not bank, stopped';
            this.log('stopped, could not Bank the Zanaris fairy bankers, stand nearer them');
            stopScript();
            return false;
        }
        return false;
    }

    buildWithdrawPlan(amount) {
        let need = Math.max(0, amount);
        let free = packFree();
        const plan = [];
        for (const name of this.withdrawNames()) {
            if (need <= 0 || free <= 0) {
                break;
            }
            const inBank = Bank.count(name) || 0;
            if (inBank <= 0) {
                continue;
            }
            const take = Math.min(need, inBank, free);
            if (take <= 0) {
                continue;
            }
            plan.push({ name, take });
            need -= take;
            free -= take;
        }
        return plan;
    }

    async withdrawResolvedFood(amount) {
        const plan = this.buildWithdrawPlan(amount);
        if (plan.length === 0) {
            return false;
        }
        if (this.foodType === 'Cake' && plan[0].name !== FOOD_CAKE) {
            this.log(
                `no ${FOOD_CAKE} in bank, withdrawing ${plan.map(p => `${p.take}× ${p.name}`).join(', ')}`
            );
        }
        for (const { name, take } of plan) {
            this.log(`withdrawing ${take}× ${name}`);
            let ok = false;
            if (typeof Bank.withdrawX === 'function') {
                ok = !!(await Bank.withdrawX(name, take));
            }
            if (!ok && typeof Bank.withdraw === 'function') {
                ok = !!(await Bank.withdraw(name));
            }
            if (!ok) {
                this.log(`withdraw failed for ${name}`);
                return false;
            }
            await Execution.delayTicks(1);
        }
        return true;
    }

    async depositKeepGear() {
        this.log('depositing inventory (keeping Dramen staff, dragon longsword, and dragon dagger)');
        const keep = name => isKeepWeaponName(name);
        if (typeof Bank.depositAllMatching === 'function') {
            await Bank.depositAllMatching(name => !keep(name));
        } else if (
            typeof Bank.depositInventory === 'function' &&
            dramenStaffCount() <= 0 &&
            !invDragonDagger() &&
            !invDragonLongsword()
        ) {
            await Bank.depositInventory();
        }
        const keptSlots = () =>
            dramenStaffCount() + (invDragonDagger() ? 1 : 0) + (invDragonLongsword() ? 1 : 0);
        await Execution.delayUntil(() => packUsed() <= keptSlots(), 4000);
        await Execution.delayTicks(1);
        if (packUsed() > keptSlots() && typeof Bank.depositAllMatching === 'function') {
            this.log(
                `still holding ${packUsed()} slot(s), depositing remaining (keep Dramen staff, dragon longsword, and dragon dagger)`
            );
            await Bank.depositAllMatching(name => !keep(name));
            await Execution.delayUntil(() => packUsed() <= keptSlots(), 3000);
        }
    }

    async withdrawNamedWeapon(names, hasFn, purpose, missingLog, warnKey) {
        if (hasFn()) {
            return;
        }
        for (const name of names) {
            const n = typeof Bank.count === 'function' ? Bank.count(name) || 0 : 0;
            if (n <= 0) {
                continue;
            }
            this.log(`withdrawing ${name} ${purpose}`);
            if (typeof Bank.withdrawX === 'function') {
                await Bank.withdrawX(name, 1);
            } else if (typeof Bank.withdraw === 'function') {
                await Bank.withdraw(name);
            }
            await Execution.delayUntil(() => hasFn(), 3000);
            return;
        }
        if (!this[warnKey]) {
            this[warnKey] = true;
            this.log(missingLog);
        }
    }

    async withdrawCombatWeapons() {
        await this.withdrawNamedWeapon(
            DRAGON_LONGSWORD_NAMES,
            hasDragonLongsword,
            'as main weapon',
            'no dragon longsword in pack or Zanaris bank, hitting with whatever is equipped',
            'mainWeaponWarned'
        );
        await this.withdrawNamedWeapon(
            DRAGON_DAGGER_NAMES,
            hasDragonDagger,
            'for Puncture specs',
            'no dragon dagger in pack or Zanaris bank, Puncture specs skipped',
            'specWarned'
        );
    }

    async bankFoodRestock(opts = {}) {
        if (this.banking) {
            return;
        }
        this.banking = true;
        try {
            await this.runBankFoodRestock(opts);
        } finally {
            this.banking = false;
        }
    }

    async runBankFoodRestock(opts = {}) {
        this.status = 'banking food';
        const extraCake =
            this.foodType === 'Cake' ? ` / ${FOOD_TWO_THIRDS} / ${FOOD_SLICE}` : '';
        const startup = opts.startup === true;
        const want = this.foodWithdraw;

        if (!inZanaris()) {
            if (!(await this.ensureZanaris())) {
                return;
            }
        }

        if (!Bank.isOpen()) {
            this.log(
                `${startup ? 'startup: ' : ''}restocking ${want}× ${this.foodCfg().withdraw[0]}${extraCake} at Zanaris fairy bank ${BANK_STAND.x},${BANK_STAND.z} (right-click Bank)`
            );
            if (!(await this.openFairyBank())) {
                this.log('could not open Zanaris fairy bank, retrying');
                await Execution.delayTicks(3);
                return;
            }
        }

        if (typeof Bank.loaded === 'function') {
            await Execution.delayUntil(
                () => Bank.loaded() || (typeof Bank.items === 'function' && Bank.items().length > 0),
                5000
            );
        }
        await Execution.delayTicks(1);

        await this.depositKeepGear();
        await this.withdrawCombatWeapons();

        if (!(await this.withdrawResolvedFood(want))) {
            await Bank.close();
            this.stopNoFood('restock');
            return;
        }

        const got = this.foodCount();
        if (got <= 0) {
            await Bank.close();
            this.stopNoFood('withdraw');
            return;
        }
        if (got > want) {
            this.log(`withdrew ${got}× ${this.describeFood()} (wanted ${want})`);
        }

        await Bank.close();
        this.bankTrips++;
        this.startReady = true;
        this.goingToBank = false;
        this.pinRouteKey = '';
        this.pinIndex = 0;
        this.status = 'heading to beings';
        this.log(
            `inventory ready, ${got}× ${this.describeFood()}, walking to Otherworldly beings`
        );
    }

    async ensureCombatStyle() {
        if (typeof Game.hasCombatStyle !== 'function' || typeof Game.setCombatStyle !== 'function') {
            return false;
        }
        const stick = stickStyleFromMode(this.styleMode);
        if (stick) {
            if (this.desiredStyle !== stick) {
                this.log(`stick melee ${this.desiredStyle} → ${stick}`);
                this.desiredStyle = stick;
                this.styleKillAnchor = this.kills;
            }
        } else if (isRandomStyleMode(this.styleMode)) {
            if (this.kills >= this.styleKillAnchor + this.killsBeforeSwap) {
                const next = pickRandomStyle(this.desiredStyle);
                this.log(
                    `random swap ${this.desiredStyle} → ${next} after ${this.kills - this.styleKillAnchor} kills ` +
                        `(atk=${Skills.level('attack')} str=${Skills.level('strength')} def=${Skills.level('defence')})`
                );
                this.desiredStyle = next;
                this.styleKillAnchor = this.kills;
            }
        } else {
            const next = pickLowestStyle(this.desiredStyle);
            if (next !== this.desiredStyle) {
                this.log(
                    `lowest melee ${this.desiredStyle} → ${next} ` +
                        `(atk=${Skills.level('attack')} str=${Skills.level('strength')} def=${Skills.level('defence')})`
                );
                this.desiredStyle = next;
                this.styleKillAnchor = this.kills;
            }
        }

        if (Game.hasCombatStyle(this.desiredStyle) || Date.now() < this.styleRetryAt) {
            return false;
        }

        this.status = `setting style: ${this.desiredStyle}`;
        Game.setCombatStyle(this.desiredStyle);
        if (await Execution.delayUntil(() => Game.hasCombatStyle(this.desiredStyle), 3000)) {
            this.styleFails = 0;
            this.log(`combat style set to ${this.desiredStyle}`);
            return true;
        }

        if (++this.styleFails >= 5) {
            this.styleFails = 0;
            this.styleRetryAt = Date.now() + 60_000;
            this.log('could not set attack style (combat tab not ready?), retrying in 60s');
        }
        return true;
    }

    async recover() {
        const ready = await Execution.delayUntil(() => Game.ingame() && Game.tile() !== null, 20_000);
        if (!ready) {
            this.log('still waiting for respawn...');
            return;
        }
        await Execution.delayTicks(3);
        this.recovering = false;
        this.fightNpcIndex = -1;
        this.fightNpcTile = null;
        this.ownLootTile = null;
        this.ownLootUntil = 0;
        this.lootPileLogged = false;
        this.lastCombatAt = 0;
        this.startReady = false;
        this.goingToBank = true;
        this.pinRouteKey = '';
        this.pinIndex = 0;
        this.specBusy = false;
        this.status = 'dead, restock food';
        this.log('respawned, Zanaris fairy bank (right-click Bank) then back to beings');
        await this.setSpecPrayers(false);
    }

    paintStyleLine() {
        const atk = Skills.level('attack');
        const str = Skills.level('strength');
        const def = Skills.level('defence');
        const stick = stickStyleFromMode(this.styleMode);
        if (stick) {
            return `stick ${stick} · atk ${atk} / str ${str} / def ${def}`;
        }
        if (isRandomStyleMode(this.styleMode)) {
            const done = Math.max(0, this.kills - this.styleKillAnchor);
            return `random swap · ${done}/${this.killsBeforeSwap} kills on ${this.desiredStyle}`;
        }
        return `lowest melee · atk ${atk} / str ${str} / def ${def}`;
    }

    onPaint(ctx) {
        const elapsed = Date.now() - this.startedAt;
        const hp = currentHp();
        const max = maxHp();
        const pct = Math.round((hp / max) * 100);
        const lootOn = LOOT_DEFS.filter(d => this.lootTicks[d.key]).length;
        const hrs = elapsed / 3_600_000;
        const lines = [
            "Benzyme's Beings",
            `time ${fmtElapsed(elapsed)} · ${this.status}`,
            `HP ${hp}/${max} (${pct}%) · eat ≤ ${this.eatAtPercent}% · ${this.foodType} ${this.foodCount()}/${this.foodWithdraw}`,
            this.paintStyleLine(),
            `Currently training ${this.desiredStyle.toUpperCase()}`,
            `kills ${this.kills} · eats ${this.eats} · specs ${this.specs} · banks ${this.bankTrips} · loot ticks ${lootOn}/${LOOT_DEFS.length}`,
            paintWeaponStatus()
        ];
        const lootBits = Object.entries(this.lootCounts)
            .filter(([, n]) => n > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([label, n]) => `${n} ${label}`);
        if (lootBits.length > 0) {
            lines.push(`loot ${lootBits.join(', ')}`);
        }
        for (const skill of COMBAT_TRACK) {
            if (!this.usedSkills.has(skill)) {
                continue;
            }
            const gained = Math.max(0, Skills.xp(skill) - (this.xpAtStart[skill] ?? 0));
            const xph = hrs > 0.0005 ? gained / hrs : 0;
            lines.push(`${skill}: ${fmtXph(xph)} xp/hr  (+${Math.round(gained)} xp)`);
        }

        ctx.save();
        ctx.font = '13px sans-serif';
        ctx.textBaseline = 'top';
        ctx.lineJoin = 'round';
        const x = 8;
        const y0 = 8;
        const lineH = 16;
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#000';
        lines.forEach((line, i) => {
            const y = y0 + i * lineH;
            ctx.strokeText(line, x, y);
            ctx.fillStyle = i === 0 ? TITLE_DARK_GREY : '#ffffff';
            ctx.fillText(line, x, y);
        });
        ctx.restore();
    }
}

export default defineBot({
    name: SCRIPT_NAME,
    version: SCRIPT_VERSION_FULL,
    category: 'Combat',
    tags: [
        'otherworldly being',
        'zanaris',
        'fairy',
        'melee',
        'food',
        'bank',
        'loot',
        'benzyme',
        'dragon longsword',
        'dragon dagger',
        'special attack',
        'prayer'
    ],
    description:
        "Benzyme's Beings. Kills Otherworldly beings south of the Zanaris bank (3155,9548 r14, plane 1). Right-clicks Bank on the fairy bankers at 3153,9576 (no booth). Walks the recorded plane-1 pin path between bank and camp. Melee style: lowest of Attack/Strength/Defence, random swap after N kills, or stick to one type. Hits with a dragon longsword. Swaps to a dragon dagger only for Puncture (25% spec, two hits), flicks Ultimate Strength and Incredible Reflexes, then swaps back to the longsword. Food dropdown: Tuna, Lobster, Swordfish, Shark, Cake. Eat-at HP% slider plus panic exit. Compact loot ticks for every Otherworldly being drop. Needs Lost City. Start already in Zanaris, or wield a Dramen staff at the swamp shed.",
    settingsSchema: {
        styleMode: {
            type: 'string',
            default: STYLE_LOWEST,
            options: STYLE_OPTIONS,
            label: 'Melee train',
            group: 'Combat',
            help:
                'Lowest melee: always train whichever of Attack, Strength, or Defence is currently lowest (ties keep the current style). Random swap: train one style, then pick another at random after N kills. Attack / Strength / Defence: stick to that one style.'
        },
        killsBeforeSwap: {
            type: 'number',
            default: 10,
            min: 1,
            max: 99,
            label: 'Kills before random swap',
            group: 'Combat',
            showIf: { key: 'styleMode', anyOf: [STYLE_RANDOM] },
            help: 'Only used for Random swap. After this many kills on the current style, pick a different Attack / Strength / Defence style at random.'
        },
        foodType: {
            type: 'string',
            default: 'Tuna',
            options: FOOD_OPTIONS,
            label: 'Food',
            group: 'Food',
            help:
                'Eat and restock this food. Cake eats leftovers first (Slice of cake → 2/3 cake → Cake) and withdraws Cake then leftovers. Tuna, Lobster, Swordfish, and Shark eat/withdraw that item only. Out of food → Zanaris fairy bankers (right-click Bank). None in bank → stop.'
        },
        foodWithdraw: {
            type: 'string',
            default: '20',
            label: 'Amount to bring',
            group: 'Food',
            help: 'Text box: how many of the selected food to withdraw each Zanaris fairy bank trip (1–28). Not a slider.'
        },
        eatAtPercent: {
            type: 'number',
            default: 50,
            min: 1,
            max: 100,
            label: 'Eat at HP %',
            group: 'Food',
            help: 'Scroll bar 1–100: eat when current Hitpoints are at or below this percent of max HP'
        },
        panicHpPercent: {
            type: 'number',
            default: 25,
            min: 1,
            max: 100,
            label: 'Panic exit HP %',
            group: 'Food',
            help:
                'If you have no food and HP is at or below this percent, immediately walk to the fairy bankers, right-click Bank, and restock. Overrides combat and loot. Default 25%.'
        },
        ...lootSettingsSchema()
    },
    create: () => new ZanarisOtherworldlyBeingKiller()
});

function startBeingLootCompactUi() {
    compactLootTab();
    if (typeof MutationObserver === 'function' && document.body) {
        const obs = new MutationObserver(() => compactLootTab());
        obs.observe(document.body, { childList: true, subtree: true });
    }
    setInterval(compactLootTab, 800);
}

if (typeof document !== 'undefined' && !globalThis.__zobkLootCompactUi) {
    globalThis.__zobkLootCompactUi = true;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startBeingLootCompactUi);
    } else {
        startBeingLootCompactUi();
    }
}
