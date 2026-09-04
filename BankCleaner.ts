/// <reference path="./dev/rs2b0t-abi.d.ts" />

/**
 * BankCleaner — open a bank and pack every stack into a correlated order.
 * Does not mouse-drag: 2004scape has no "sort bank" button. A drag only sends
 * INV_BUTTOND (swap two slots). This script sends that swap packet directly,
 * which is the fastest rearrange the server accepts.
 * Completely vibe coded by @.benzyme on Discord via Cursor AI
 * Self-contained ESM for rs2b0t Load local script / Load URL.
 */
const SUPPORTED_API_VERSION = 1;
const abi = globalThis.__rs2b0t;
if (!abi) {
    throw new Error('BankCleaner: globalThis.__rs2b0t missing — load inside rs2b0t bot.html');
}
if (abi.apiVersion !== SUPPORTED_API_VERSION) {
    throw new Error(`BankCleaner: ABI ${abi.apiVersion} != supported ${SUPPORTED_API_VERSION}`);
}

const { defineBot, Execution, Game, LoopingBot: LoopingBotBase, Bank, Banking, ChatDialog } = abi;

const SCRIPT_NAME = 'BankCleaner';
const SCRIPT_VERSION = '1.2.0';
const PAINT_TITLE = '#c020ff';

const WELCOME_SCREEN_ID = 5993;
/** ClientProt.INV_BUTTOND — same opcode a finished bank drag writes. */
const INV_BUTTOND = 93;
/** bank_main:com_93/94 = Note/Item (see Bank.setNoteMode). Swap/Insert sit later on the same panel. */
const BANK_SWAP_FALLBACK = 5392;
const BANK_INSERT_FALLBACK = 5393;
const SWAP_DELAY_MS = 90;
const RESYNC_EVERY = 8;

const CAT = {
    CURRENCY: 0,
    QUEST: 1,
    TOOLS: 2,
    JEWELLERY: 3,
    RUNES: 4,
    STAVES: 5,
    TALISMANS: 6,
    ESSENCE: 7,
    ORES: 8,
    BARS: 9,
    GEMS: 10,
    HERBS: 11,
    POTIONS: 12,
    FOOD: 13,
    RAW: 14,
    LOGS: 15,
    FLETCHING: 16,
    CRAFTING: 17,
    FARMING: 18,
    PRAYER: 19,
    AMMO: 20,
    WEAPONS: 21,
    ARMOUR: 22,
    MAGIC_ARMOUR: 23,
    CLOTHES: 24,
    MISC: 25
};

const CAT_LABELS = [
    'Coins',
    'Quest',
    'Tools',
    'Jewellery',
    'Runes',
    'Staves',
    'Talismans',
    'Essence',
    'Ores',
    'Bars',
    'Gems',
    'Herbs',
    'Potions',
    'Food',
    'Raw food',
    'Logs',
    'Fletching',
    'Crafting',
    'Farming',
    'Prayer',
    'Ammo',
    'Weapons',
    'Armour',
    'Magic gear',
    'Clothes',
    'Misc'
];

const RUNE_ORDER = [
    'air',
    'mind',
    'water',
    'earth',
    'fire',
    'body',
    'cosmic',
    'chaos',
    'nature',
    'law',
    'death',
    'astral',
    'blood',
    'soul',
    'wrath',
    'dust',
    'mud',
    'smoke',
    'steam',
    'lava',
    'mist'
];

const ORE_ORDER = [
    'clay',
    'copper',
    'tin',
    'iron',
    'silver',
    'coal',
    'gold',
    'mithril',
    'adamant',
    'adamantite',
    'runite',
    'rune',
    'blurite',
    'elemental',
    'luminite',
    'daeyalt',
    'amethyst'
];

const BAR_ORDER = [
    'bronze',
    'iron',
    'silver',
    'steel',
    'gold',
    'mithril',
    'adamant',
    'adamantite',
    'rune',
    'runite',
    'blurite',
    'elemental'
];

const METAL_ORDER = [
    'bronze',
    'iron',
    'steel',
    'silver',
    'gold',
    'black',
    'white',
    'mithril',
    'adamant',
    'adamantite',
    'runite',
    'rune',
    'dragon'
];

const WEAPON_KIND = [
    'dagger',
    'longsword',
    'scimitar',
    '2h sword',
    'sword',
    'mace',
    'warhammer',
    'battleaxe',
    'thrownaxe',
    'hatchet',
    'pickaxe',
    'axe',
    'spear',
    'hasta',
    'halberd',
    '2h',
    'claws',
    'whip',
    'scythe',
    'shortbow',
    'longbow',
    'crossbow',
    'bow',
    'knife',
    'dart',
    'javelin'
];

const ARMOUR_SLOT = [
    'full helm',
    'med helm',
    'platebody',
    'chainbody',
    'platelegs',
    'plateskirt',
    'kiteshield',
    'sq shield',
    'vambraces',
    'gauntlets',
    'helm',
    'hood',
    'coif',
    'hat',
    'body',
    'top',
    'legs',
    'skirt',
    'chaps',
    'shield',
    'boots',
    'gloves'
];

const GEM_ORDER = [
    'opal',
    'jade',
    'red topaz',
    'sapphire',
    'emerald',
    'ruby',
    'diamond',
    'dragonstone',
    'onyx',
    'zenyte'
];

const LOG_ORDER = ['logs', 'oak', 'willow', 'teak', 'maple', 'mahogany', 'yew', 'magic', 'redwood'];

const FISH_ORDER = [
    'shrimps',
    'shrimp',
    'anchovies',
    'anchovy',
    'sardine',
    'herring',
    'mackerel',
    'trout',
    'cod',
    'pike',
    'salmon',
    'tuna',
    'bass',
    'lobster',
    'swordfish',
    'monkfish',
    'shark',
    'manta ray',
    'manta',
    'karambwanji',
    'karambwan',
    'lava eel',
    'cave eel',
    'slimy eel',
    'eel',
    'crayfish',
    'fish'
];

const FOOD_BAKED = [
    'chocolate cake',
    'slice of cake',
    'chocolate slice',
    'cake',
    'bread dough',
    'bread',
    'meat pie',
    'apple pie',
    'redberry pie',
    'pizza',
    'pie'
];

const FOOD_MEAT = [
    'ugthanki',
    'kebab',
    'stew',
    'curry',
    'cooked chicken',
    'cooked meat',
    'chicken',
    'bear meat',
    'rat meat',
    'beef',
    'meat',
    'rabbit'
];

const FOOD_DRINK = [
    'cup of tea',
    'tea',
    'asgarnian ale',
    'wizard mind bomb',
    'dwarven stout',
    'grog',
    'karamjan rum',
    'beer',
    'ale',
    'wine',
    'vodka',
    'whisky',
    'gin',
    'brandy',
    'rum',
    'keg'
];

const FOOD_PRODUCE = [
    'basket of strawberries',
    'basket of apples',
    'basket of tomatoes',
    'basket of onions',
    'sack of cabbages',
    'strawberries',
    'strawberry',
    'cabbages',
    'cabbage',
    'potatoes',
    'potato',
    'onion',
    'tomato',
    'banana',
    'orange',
    'apple',
    'pineapple',
    'watermelon',
    'cheese',
    'pot of flour',
    'bucket of milk',
    'flour',
    'milk',
    'sweetcorn',
    'dwellberry',
    'equa',
    'lime',
    'lemon',
    'papaya',
    'coconut'
];

const STAFF_ORDER = [
    'staff of air',
    'staff of water',
    'staff of earth',
    'staff of fire',
    'air staff',
    'water staff',
    'earth staff',
    'fire staff',
    'magic staff',
    'battlestaff',
    'air battlestaff',
    'water battlestaff',
    'earth battlestaff',
    'fire battlestaff',
    'lava battlestaff',
    'mud battlestaff',
    'steam battlestaff',
    'smoke battlestaff',
    'dust battlestaff',
    'mist battlestaff',
    'mystic air staff',
    'mystic water staff',
    'mystic earth staff',
    'mystic fire staff',
    'mystic lava staff',
    'mystic mud staff',
    'mystic steam staff',
    'mystic smoke staff',
    'ancient staff',
    'slayer staff',
    "iban's staff",
    'iban staff',
    'saradomin staff',
    'guthix staff',
    'zamorak staff',
    'staff'
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

function compactName(name) {
    return String(name ?? '')
        .toLowerCase()
        .replace(/['’]/g, '')
        .replace(/[^a-z0-9+]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function hasWord(n, word) {
    return n === word || n.startsWith(word + ' ') || n.endsWith(' ' + word) || n.includes(' ' + word + ' ');
}

function indexIn(list, n) {
    let best = 99;
    let bestLen = -1;
    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (hasWord(n, item) && item.length > bestLen) {
            best = i;
            bestLen = item.length;
        }
    }
    return best;
}

function metalRank(n) {
    let best = 99;
    let bestLen = -1;
    for (let i = 0; i < METAL_ORDER.length; i++) {
        const m = METAL_ORDER[i];
        if ((n === m || n.startsWith(m + ' ')) && m.length > bestLen) {
            best = i;
            bestLen = m.length;
        }
    }
    return best;
}

function magicRuneRank(n) {
    const m = n.match(/^([a-z]+(?: [a-z]+)*) runes?$/);
    if (!m) {
        return -1;
    }
    const i = RUNE_ORDER.indexOf(m[1]);
    return i >= 0 ? i : -1;
}

function fishRank(n) {
    return indexIn(FISH_ORDER, n);
}

function isCookware(n) {
    return (
        n === 'bowl' ||
        n === 'empty bowl' ||
        n === 'pie dish' ||
        n === 'empty pot' ||
        n === 'pot' ||
        n === 'empty jug' ||
        n === 'jug' ||
        n === 'jug of water' ||
        n === 'empty cup' ||
        n === 'basket' ||
        n === 'empty basket' ||
        n === 'sack' ||
        n === 'empty sack'
    );
}

function isEdible(n) {
    if (hasWord(n, 'key')) {
        return false;
    }
    return (
        fishRank(n) < 90 ||
        indexIn(FOOD_BAKED, n) < 90 ||
        indexIn(FOOD_MEAT, n) < 90 ||
        indexIn(FOOD_DRINK, n) < 90 ||
        indexIn(FOOD_PRODUCE, n) < 90 ||
        isCookware(n) ||
        (n.includes('burnt') && (fishRank(n) < 90 || hasWord(n, 'fish') || hasWord(n, 'meat')))
    );
}

function foodSub(n) {
    if (n.includes('burnt')) {
        const fish = fishRank(n);
        return 80 + (fish < 90 ? fish : 0);
    }
    const baked = indexIn(FOOD_BAKED, n);
    if (baked < 90) {
        return baked;
    }
    const fish = fishRank(n);
    if (fish < 90) {
        return 20 + fish;
    }
    const meat = indexIn(FOOD_MEAT, n);
    if (meat < 90) {
        return 45 + meat;
    }
    const drink = indexIn(FOOD_DRINK, n);
    if (drink < 90) {
        return 55 + drink;
    }
    const produce = indexIn(FOOD_PRODUCE, n);
    if (produce < 90) {
        return 65 + produce;
    }
    if (isCookware(n)) {
        return 90;
    }
    return 75;
}

function objType(id) {
    try {
        const OT =
            globalThis.ObjType ??
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
    const t = objType(id);
    const tmpl = t?.certtemplate ?? t?.certTemplate;
    return typeof tmpl === 'number' && tmpl >= 0 && tmpl !== id;
}

function uncertId(id) {
    const t = objType(id);
    if (!t) {
        return id;
    }
    const link = t.certlink ?? t.certLink;
    const tmpl = t.certtemplate ?? t.certTemplate;
    if (typeof tmpl === 'number' && tmpl >= 0 && tmpl !== id && typeof link === 'number' && link >= 0) {
        return link;
    }
    return id;
}

function displayName(id, fallback) {
    const t = objType(typeof id === 'number' ? uncertId(id) : -1);
    return t?.name || fallback || '';
}

/**
 * Every cache object gets a bucket. Named families (runes, staves, ores, …)
 * sit in contiguous blocks; leftovers correlate by name so similar stacks
 * still land next to each other.
 */
function classify(name, id) {
    const noted = typeof id === 'number' && isNoteId(id) ? 1 : 0;
    const raw = displayName(id, name);
    const n = compactName(raw);
    if (!n || n === 'null' || n === 'dwarf remains') {
        return { cat: CAT.MISC, sub: 900, noted, label: n || `id ${id}` };
    }

    if (n === 'coins' || n === 'coin' || n === 'tokkul' || n === 'trading sticks' || n === 'platinum token') {
        return { cat: CAT.CURRENCY, sub: 0, noted, label: n };
    }

    if (/\b(talisman|tiara)\b/.test(n)) {
        return { cat: CAT.TALISMANS, sub: indexIn(RUNE_ORDER, n), noted, label: n };
    }
    if (/\b(pure essence|rune essence|essence)\b/.test(n) && !n.includes('ore')) {
        return { cat: CAT.ESSENCE, sub: n.includes('pure') ? 1 : 0, noted, label: n };
    }

    // "air rune" is a stack of runes. "rune platebody" is metal armour.
    const runeRank = magicRuneRank(n);
    if (runeRank >= 0) {
        return { cat: CAT.RUNES, sub: runeRank, noted, label: n };
    }

    if (/\b(staff|stave|battlestaff|wand)\b/.test(n)) {
        const exact = STAFF_ORDER.findIndex(s => n === s || n.startsWith(s));
        return { cat: CAT.STAVES, sub: exact >= 0 ? exact : 80 + indexIn(RUNE_ORDER, n), noted, label: n };
    }

    if (/\bore\b/.test(n) || n === 'coal' || n === 'clay' || n === 'tin' || n === 'copper') {
        return { cat: CAT.ORES, sub: indexIn(ORE_ORDER, n), noted, label: n };
    }
    if (/\bbar\b/.test(n)) {
        return { cat: CAT.BARS, sub: indexIn(BAR_ORDER, n), noted, label: n };
    }

    if (/\b(uncut|sapphire|emerald|ruby|diamond|dragonstone|onyx|zenyte|opal|jade|topaz)\b/.test(n) && !n.includes('amulet') && !n.includes('necklace') && !n.includes('ring') && !n.includes('bracelet')) {
        const uncut = n.includes('uncut') ? 0 : 1;
        return { cat: CAT.GEMS, sub: uncut * 20 + indexIn(GEM_ORDER, n), noted, label: n };
    }

    if (/\b(ring|amulet|necklace|bracelet|glory|wealth|dueling|duelling|games necklace|combat bracelet|skills necklace)\b/.test(n)) {
        return { cat: CAT.JEWELLERY, sub: metalRank(n), noted, label: n };
    }

    if (
        /\b(pickaxe|hatchet|tinderbox|hammer|chisel|needle|shears|spade|rake|secateurs|harpoon|lobster pot|small fishing net|big fishing net|fishing rod|fly fishing rod|barbarian rod|saw|glassblowing|pestle|crucible|mould)\b/.test(
            n
        ) ||
        (hasWord(n, 'knife') && metalRank(n) >= 90)
    ) {
        return { cat: CAT.TOOLS, sub: metalRank(n), noted, label: n };
    }

    if (/\b(grimy|herb|guam|marrentill|tarromin|harralander|ranarr|toadflax|irit|avantoe|kwuarm|snapdragon|cadantine|lantadyme|dwarf weed|torstol)\b/.test(n) && !n.includes('potion') && !n.includes('seed')) {
        return { cat: CAT.HERBS, sub: 0, noted, label: n };
    }
    if (/\b(potion|dose|vial|eye of newt|unicorn horn|snape grass|limpwurt|wine of zamorak|white berries|goat horn)\b/.test(n)) {
        return { cat: CAT.POTIONS, sub: 0, noted, label: n };
    }

    if (/\b(seed|sapling|compost|supercompost|rake|seed dibber)\b/.test(n)) {
        return { cat: CAT.FARMING, sub: 0, noted, label: n };
    }

    if (/\b(bones|big bones|dragon bones|wyvern|ashes|ensouled)\b/.test(n)) {
        return { cat: CAT.PRAYER, sub: 0, noted, label: n };
    }

    if (/\b(arrow|bolt|brutal|cannonball|javelin heads|arrowtips)\b/.test(n)) {
        return { cat: CAT.AMMO, sub: metalRank(n), noted, label: n };
    }

    const isBow =
        hasWord(n, 'shortbow') || hasWord(n, 'longbow') || hasWord(n, 'crossbow') || hasWord(n, 'bow') || n.endsWith('bow');
    const unstrung = hasWord(n, 'u') || n.includes('unstrung');
    if (/\b(bow string|bowstring|feather|arrow shaft|headless|unstrung|flax)\b/.test(n) || (isBow && unstrung)) {
        const wood = indexIn(LOG_ORDER, n);
        return { cat: CAT.FLETCHING, sub: wood * 4 + (unstrung ? 0 : 1), noted, label: n };
    }

    if (/\b(logs?|kindling)\b/.test(n)) {
        return { cat: CAT.LOGS, sub: indexIn(LOG_ORDER, n), noted, label: n };
    }

    const wornHide =
        hasWord(n, 'body') ||
        hasWord(n, 'chaps') ||
        hasWord(n, 'vambraces') ||
        hasWord(n, 'vambrace') ||
        hasWord(n, 'coif') ||
        hasWord(n, 'shield');
    if (
        /\b(cowhide|leather|dragonhide|d hide|thread|wool|ball of wool|silk|molten glass|soda ash|bucket of sand)\b/.test(n) &&
        !wornHide
    ) {
        return { cat: CAT.CRAFTING, sub: 0, noted, label: n };
    }

    if (isEdible(n) && (/^raw\b/.test(n) || hasWord(n, 'raw'))) {
        const fish = fishRank(n);
        return { cat: CAT.RAW, sub: fish < 90 ? fish : 50, noted, label: n };
    }
    if (isEdible(n)) {
        return { cat: CAT.FOOD, sub: foodSub(n), noted, label: n };
    }

    if (/\b(robe|wizard|mystic|splitbark|ahrim|ancestral|infinity)\b/.test(n)) {
        return { cat: CAT.MAGIC_ARMOUR, sub: 0, noted, label: n };
    }

    if (/\b(cape|cloak|boots|gloves|hat|hood|skirt|gown|apron|eye patch|eyepatch|desert)\b/.test(n) && metalRank(n) >= 90) {
        return { cat: CAT.CLOTHES, sub: 0, noted, label: n };
    }

    const armourHit = ARMOUR_SLOT.some(s => hasWord(n, s));
    if (armourHit || /\b(plate|chain|shield|helm|kiteshield)\b/.test(n)) {
        return {
            cat: CAT.ARMOUR,
            sub: metalRank(n) * 30 + indexIn(ARMOUR_SLOT, n),
            noted,
            label: n
        };
    }

    const wepHit = WEAPON_KIND.some(s => hasWord(n, s));
    if (wepHit) {
        return {
            cat: CAT.WEAPONS,
            sub: metalRank(n) * 40 + indexIn(WEAPON_KIND, n),
            noted,
            label: n
        };
    }

    if (/\b(key|map|scroll|certificate|book|lamp|quest|garlic|stake|hammer)\b/.test(n) && n !== 'hammer') {
        return { cat: CAT.QUEST, sub: 0, noted, label: n };
    }

    return { cat: CAT.MISC, sub: 0, noted, label: n };
}

function sortTuple(item) {
    const c = classify(item.name, item.id);
    return [c.cat, c.sub, c.noted, c.label, item.id ?? 0];
}

function compareItems(a, b) {
    const ka = sortTuple(a);
    const kb = sortTuple(b);
    for (let i = 0; i < ka.length; i++) {
        if (ka[i] < kb[i]) {
            return -1;
        }
        if (ka[i] > kb[i]) {
            return 1;
        }
    }
    return 0;
}

function walkCache() {
    const OT =
        globalThis.ObjType ??
        globalThis.__rs2b0t?.ObjType ??
        globalThis.__client?.ObjType ??
        null;
    const counts = new Array(CAT_LABELS.length).fill(0);
    let named = 0;
    if (!OT || typeof OT.list !== 'function') {
        return { named, counts };
    }
    const cap = typeof OT.count === 'number' ? OT.count : 8000;
    let miss = 0;
    for (let id = 0; id < cap && miss < 400; id++) {
        const t = OT.list(id);
        if (!t || !t.name) {
            miss++;
            continue;
        }
        miss = 0;
        const tmpl = t.certtemplate ?? t.certTemplate;
        if (typeof tmpl === 'number' && tmpl >= 0 && tmpl !== id) {
            continue;
        }
        named++;
        counts[classify(t.name, id).cat]++;
    }
    return { named, counts };
}

function bankItems() {
    if (typeof Bank.items !== 'function') {
        return [];
    }
    try {
        return (Bank.items() ?? []).filter(i => i && typeof i.slot === 'number' && (i.id ?? 0) >= 0);
    } catch {
        return [];
    }
}

async function waitBankLoaded() {
    if (typeof Bank.loaded === 'function') {
        await Execution.delayUntil(() => Bank.loaded() || bankItems().length > 0, 4000);
    }
    await Execution.delayTicks(1);
}

function rawClient() {
    const host = welcomeHost();
    return host?.client ?? globalThis.__client ?? null;
}

function bankButtonId(label) {
    const host = welcomeHost();
    const reader = host?.reader;
    if (!reader) {
        return -1;
    }
    const main = typeof reader.modals === 'function' ? reader.modals().main : -1;
    if (main === -1) {
        return -1;
    }
    if (typeof reader.buttonByText === 'function') {
        const id = reader.buttonByText(main, label);
        if (typeof id === 'number' && id >= 0) {
            return id;
        }
    }
    return -1;
}

async function ensureSwapMode() {
    const host = welcomeHost();
    const actions = host?.actions;
    if (!actions || typeof actions.ifButton !== 'function') {
        return;
    }
    const swap = bankButtonId('Swap');
    const insert = bankButtonId('Insert');
    const id = swap >= 0 ? swap : BANK_SWAP_FALLBACK;
    if (id >= 0) {
        actions.ifButton(id);
        await Execution.delayTicks(1);
    }
    if (insert >= 0 && insert === id) {
        actions.ifButton(BANK_SWAP_FALLBACK);
        await Execution.delayTicks(1);
    }
}

function applyLocalSwap(comId, fromSlot, toSlot) {
    try {
        const IfType = globalThis.IfType ?? globalThis.__rs2b0t?.IfType ?? null;
        const com = IfType?.list?.[comId];
        if (com && typeof com.swapSlots === 'function') {
            com.swapSlots(fromSlot, toSlot);
            return true;
        }
    } catch {
        /* cache layout unread */
    }
    return false;
}

function sendInvButtonD(comId, fromSlot, toSlot, mode) {
    const client = rawClient();
    const out = client?.out;
    if (!out || typeof out.p1Enc !== 'function' || typeof out.p2 !== 'function') {
        return false;
    }
    out.p1Enc(INV_BUTTOND);
    out.p2(comId);
    out.p2(fromSlot);
    out.p2(toSlot);
    if (typeof out.p1 === 'function') {
        out.p1(mode);
    }
    return true;
}

function layoutSnapshot() {
    return bankItems().map((i, key) => ({
        key,
        slot: i.slot,
        id: i.id,
        name: i.name ?? displayName(i.id, ''),
        count: i.count ?? 1,
        comId: i.comId
    }));
}

function alreadySorted(layout) {
    const wanted = layout.slice().sort(compareItems);
    for (let i = 0; i < wanted.length; i++) {
        const at = layout.find(x => x.slot === i);
        if (!at || at.key !== wanted[i].key) {
            return false;
        }
    }
    return true;
}

function fmtElapsed(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
}

class BankCleaner extends LoopingBotBase {
    status = 'starting';
    done = false;
    startedAt = 0;
    swaps = 0;
    stacks = 0;
    catalogNamed = 0;
    failStreak = 0;
    lastMove = '';
    depositFirst = true;
    closeWhenDone = false;

    override async onStart(): Promise<void> {
        await Execution.delayUntil(() => Game.ingame() && Game.tile() !== null, 0);
        if (typeof Banking?.preload === 'function') {
            Banking.preload();
        }
        this.startedAt = Date.now();
        this.done = false;
        this.swaps = 0;
        this.failStreak = 0;
        this.syncSettings();
        const cache = walkCache();
        this.catalogNamed = cache.named;
        const filled = cache.counts
            .map((n, i) => (n > 0 ? `${CAT_LABELS[i]} ${n}` : null))
            .filter(Boolean)
            .slice(0, 8)
            .join(', ');
        this.log(
            `Benzyme's Bank Cleaner — slot-swap sort (INV_BUTTOND), not mouse-drag. ` +
                `Cache ${cache.named} items. ${filled}`
        );
        this.status = 'ready';
    }

    override onStop(): void {
        this.log(`stopped — ${this.swaps} swaps, ${this.stacks} stacks (${this.status})`);
    }

    syncSettings() {
        this.depositFirst = this.settings.bool('depositFirst', true);
        this.closeWhenDone = this.settings.bool('closeWhenDone', false);
    }

    finish(reason) {
        this.done = true;
        this.status = reason;
        this.log(reason);
        stopScript();
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
        this.syncSettings();
        if (this.done) {
            await Execution.delayTicks(8);
            return;
        }
        if (ChatDialog.canContinue()) {
            this.status = 'continue dialog';
            await ChatDialog.continue();
            return;
        }

        if (!Bank.isOpen()) {
            this.status = 'opening bank';
            const opened = await Banking.open({ log: m => this.log(`  ${m}`) });
            if (!opened && !Bank.isOpen()) {
                this.failStreak++;
                if (this.failStreak >= 6) {
                    this.finish('stopped — could not open a bank (stand at a booth)');
                    return;
                }
                this.log('could not open bank — retrying');
                await Execution.delayTicks(3);
                return;
            }
        }

        await waitBankLoaded();
        this.failStreak = 0;

        if (this.depositFirst && typeof Bank.depositInventory === 'function') {
            this.status = 'depositing pack';
            await Bank.depositInventory();
            await waitBankLoaded();
        }

        await ensureSwapMode();

        const layout = layoutSnapshot();
        this.stacks = layout.length;
        if (layout.length === 0) {
            this.finish('bank is empty — nothing to sort');
            return;
        }
        if (alreadySorted(layout)) {
            if (this.closeWhenDone && Bank.isOpen()) {
                await Bank.close();
            }
            this.finish(`already sorted (${layout.length} stacks)`);
            return;
        }

        const moved = await this.sortLayout(layout);
        await waitBankLoaded();
        const after = layoutSnapshot();
        const neat = alreadySorted(after);

        if (this.closeWhenDone && Bank.isOpen()) {
            await Bank.close();
        }

        if (neat) {
            this.finish(`sorted ${after.length} stacks with ${this.swaps} swaps`);
            return;
        }
        if (moved <= 0) {
            this.finish('stopped — could not send bank swaps (client out buffer missing?)');
            return;
        }
        this.finish(`partial sort — ${this.swaps} swaps, ${after.length} stacks (re-run if gaps remain)`);
    }

    async sortLayout(start) {
        let layout = start.slice();
        const wanted = layout.slice().sort(compareItems);
        const comId = layout[0]?.comId;
        if (comId == null) {
            return 0;
        }

        let moved = 0;
        for (let dest = 0; dest < wanted.length; dest++) {
            const wantKey = wanted[dest].key;
            const from = layout.find(x => x.key === wantKey);
            if (!from) {
                continue;
            }
            if (from.slot === dest) {
                continue;
            }

            this.status = `swap ${from.name || from.id} → slot ${dest + 1}`;
            this.lastMove = this.status;
            const gen = typeof Bank.snapshotGeneration === 'function' ? Bank.snapshotGeneration() : -1;
            if (!sendInvButtonD(comId, from.slot, dest, 0)) {
                this.log('INV_BUTTOND write failed — client.out not available');
                return moved;
            }
            applyLocalSwap(comId, from.slot, dest);

            const occupant = layout.find(x => x.slot === dest && x.key !== wantKey);
            const fromSlot = from.slot;
            from.slot = dest;
            if (occupant) {
                occupant.slot = fromSlot;
            }

            this.swaps++;
            moved++;
            await Execution.delay(SWAP_DELAY_MS);

            if (moved % RESYNC_EVERY === 0) {
                if (typeof Bank.waitSnapshotAfter === 'function' && gen >= 0) {
                    await Bank.waitSnapshotAfter(gen, 2000);
                } else {
                    await Execution.delayTicks(1);
                }
                const live = layoutSnapshot();
                if (live.length === layout.length) {
                    const byId = new Map(live.map(i => [`${i.slot}:${i.id}`, i]));
                    for (const row of layout) {
                        const hit = byId.get(`${row.slot}:${row.id}`);
                        if (hit) {
                            row.slot = hit.slot;
                        }
                    }
                }
            }
        }
        return moved;
    }

    override onPaint(ctx: CanvasRenderingContext2D): void {
        const elapsed = this.startedAt ? fmtElapsed(Date.now() - this.startedAt) : '0:00';
        const lines = [
            `Benzyme's Bank Cleaner v${SCRIPT_VERSION}`,
            `time ${elapsed} · ${this.status}`,
            `stacks ${this.stacks} · swaps ${this.swaps}`,
            `cache ${this.catalogNamed} items · swap packets (no drag)`,
            this.lastMove ? this.lastMove : 'runes, staves, ores pack together'
        ];

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
            ctx.fillStyle = i === 0 ? PAINT_TITLE : '#ffffff';
            ctx.fillText(line, x, y);
        });
        ctx.restore();
    }
}

export default defineBot({
    name: SCRIPT_NAME,
    version: SCRIPT_VERSION,
    category: 'Utility',
    tags: ['bank', 'sort', 'utility', 'cleaner'],
    description:
        "Benzyme's Bank Cleaner — opens the nearest bank and packs stacks by family (runes, staves, ores, bars, food, gear, …). Uses bank slot-swap packets (what a drag sends) instead of mouse-dragging. Stand at a booth or let it walk to one.",
    settingsSchema: {
        depositFirst: {
            type: 'boolean',
            default: true,
            label: 'Deposit pack first',
            group: 'Bank',
            help: 'Dump the inventory into the bank before sorting.'
        },
        closeWhenDone: {
            type: 'boolean',
            default: false,
            label: 'Close bank when done',
            group: 'Bank',
            help: 'Close the bank interface after the sort finishes.'
        }
    },
    create: () => new BankCleaner()
});
