/**
 * InventoryAlcher. High Level Alchemy with an allowlist or an opt-in dump of the pack.
 * ALCH INVENTORY is off by default. A blank item list uses that checkbox.
 * Named items (comma-separated) are the only things alched when the box is filled.
 * Stand spot walks you back if a random event moves you.
 * Optional Raise a kitten: keep 10 raw fish and a Ball of wool, feed at 50% hunger, play when asked.
 * Completely vibe coded by @.benzyme on Discord via Cursor AI
 * Self-contained ESM for rs2b0t Load local script / Load URL.
 *
 * Load URL: https://benzymee.github.io/RS2B2TScripts/InventoryAlcher.js
 */
const SUPPORTED_API_VERSION = 1;
const abi = globalThis.__rs2b0t;
if (!abi) {
    throw new Error(
        'InventoryAlcher: globalThis.__rs2b0t missing, load inside rs2b0t bot.html'
    );
}
if (abi.apiVersion !== SUPPORTED_API_VERSION) {
    throw new Error(
        `InventoryAlcher: ABI ${abi.apiVersion} != supported ${SUPPORTED_API_VERSION}`
    );
}

const {
    defineBot,
    Execution,
    Game,
    LoopingBot,
    Inventory,
    Equipment,
    Bank,
    Banking,
    Npcs,
    Skills,
    ChatDialog,
    Traversal,
    Tile
} = abi;

const SCRIPT_NAME = 'InventoryAlcher';
const SCRIPT_VERSION = '1.2.2';
const CURRENT_TILE_BTN_ID = 'inventory-alcher-current-tile';

const WELCOME_SCREEN_ID = 5993;
const MAGIC_TAB = 6;

/** MiniMenuAction.TGT_BUTTON / TGT_HELD: spell then inventory item. */
const TGT_BUTTON = 274;
const TGT_HELD = 563;

const SPELL = {
    key: 'High',
    label: 'High Level Alchemy',
    level: 55,
    xp: 65,
    fire: 5,
    ticks: 5,
    names: ['High Level Alchemy', 'High alchemy', 'High Alchemy', 'High-level alchemy'],
    fallbackCom: 1178
};

const NATURE_RUNE_IDS = new Set([561]);
const FIRE_RUNE_IDS = new Set([554]);
const COINS_ID = 995;

const NATURE_RUNE_PNG = 'data:image/png;base64,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';
const natureRuneIcon = typeof Image !== 'undefined' ? new Image() : null;
if (natureRuneIcon) {
    natureRuneIcon.src = NATURE_RUNE_PNG;
}

const FIRE_STAFF_NAMES = [
    'Staff of fire',
    'Fire staff',
    'Fire battlestaff',
    'Mystic fire staff',
    'Lava battlestaff',
    'Mystic lava staff',
    'Steam battlestaff',
    'Mystic steam staff',
    'Smoke battlestaff',
    'Mystic smoke staff'
];

/**
 * Lost City 289 pet.rs2: kittens eat these (debug raw_shrimp, raw_anchovies, raw_sardine,
 * raw_trout, raw_salmon, raw_tuna). Display names from items.json. Other raw fish do nothing.
 */
const FEEDABLE_RAW_FISH = [
    'Raw shrimps',
    'Raw anchovies',
    'Raw sardine',
    'Raw trout',
    'Raw salmon',
    'Raw tuna'
];
const FEEDABLE_RAW_FISH_NORM = new Set([
    'raw shrimps',
    'raw anchovies',
    'raw sardine',
    'raw trout',
    'raw salmon',
    'raw tuna'
]);
const BALL_OF_WOOL = 'Ball of wool';
const PET_KITTEN_NAME = 'Pet kitten';
const PET_CAT_NAME = 'Pet cat';
const KITTEN_NPC_NAME = 'Kitten';
const CAT_NPC_NAME = 'Cat';
const KITTEN_FISH_KEEP = 10;
/** varp cat_growth (pack/varp.pack). Bits 0-4 hunger 0-20, bits 5-10 attention. */
const CAT_GROWTH_VARP = 182;
const KITTEN_HUNGER_MAX = 20;
const KITTEN_HUNGER_FEED_AT = 10;
const KITTEN_ATTENT_PLAY_AT = 40;
const KITTEN_ATTENT_DEFAULT = 28;
/** Growth timer is 150 ticks (90s). Hunger 10/20 = 50%. Attention warning at 40 from default 28 is 18 min. */
const KITTEN_FEED_EVERY_MS = 10 * 90_000;
const KITTEN_PLAY_EVERY_MS = 12 * 60_000;
const KITTEN_CHAT = {
    hungry: /i think it'?s hungry/i,
    reallyHungry: /i think it'?s really hungry/i,
    attention: /i think it wants some attention/i,
    lonely: /i think it'?s feeling lonely/i,
    fed: /kitten gobbles up/i,
    played: /loves to play with that ball of wool/i,
    ranHungry: /kitten has run away to look for food/i,
    ranLonely: /kitten got lonely and ran off/i,
    purr: /\bpurr/i,
    miaow: /miaow/i
};

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

function fmtRemain(ms) {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtXph(n) {
    const v = Math.max(0, Math.floor(n));
    return v.toLocaleString('en-US');
}

function prefStorageKey(key) {
    const box =
        typeof location !== 'undefined' ? new URLSearchParams(location.search).get('box') : null;
    const suffix = `set:${SCRIPT_NAME}:${key}`;
    return box ? `rs2b0t:${box}:${suffix}` : `rs2b0t:${suffix}`;
}

function writePrefRaw(key, value) {
    const k = prefStorageKey(key);
    try {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(k, value);
        }
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(k, value);
        }
    } catch {
        /* private mode / blocked storage */
    }
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

function setNativeInputValue(el, value) {
    const setter =
        typeof window !== 'undefined' && window.HTMLInputElement
            ? Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
            : null;
    if (setter) {
        setter.call(el, value);
    } else {
        el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
}

function normName(name) {
    return String(name ?? '')
        .toLowerCase()
        .replace(/-/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function objType(id) {
    if (id == null || id < 0) {
        return null;
    }
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

function relatedIds(id) {
    const ids = new Set();
    if (typeof id !== 'number' || id < 0) {
        return ids;
    }
    ids.add(id);
    const t = objType(id);
    if (!t) {
        return ids;
    }
    for (const key of ['certlink', 'certtemplate', 'certLink', 'certTemplate']) {
        const other = t[key];
        if (typeof other === 'number' && other >= 0 && other !== id) {
            ids.add(other);
            const pair = objType(other);
            const back = pair?.certlink ?? pair?.certLink;
            if (typeof back === 'number' && back >= 0) {
                ids.add(back);
            }
        }
    }
    return ids;
}

function isNoteId(id) {
    const t = objType(id);
    const tmpl = t?.certtemplate ?? t?.certTemplate;
    return typeof tmpl === 'number' && tmpl >= 0 && tmpl !== id;
}

function isNatureRune(name, id) {
    if (typeof id === 'number' && NATURE_RUNE_IDS.has(id)) {
        return true;
    }
    const n = normName(name);
    return n === 'nature rune' || n === 'nature runes';
}

function isFireRune(name, id) {
    if (typeof id === 'number' && FIRE_RUNE_IDS.has(id)) {
        return true;
    }
    const n = normName(name);
    return n === 'fire rune' || n === 'fire runes';
}

function isCoins(name, id) {
    if (id === COINS_ID) {
        return true;
    }
    const n = normName(name);
    return n === 'coins' || n === 'coin';
}

function isFireStaffName(name) {
    const n = normName(name);
    if (!n) {
        return false;
    }
    if (FIRE_STAFF_NAMES.some(s => normName(s) === n)) {
        return true;
    }
    return (
        n.includes('staff') &&
        (n.includes('fire') || n.includes('lava') || n.includes('steam') || n.includes('smoke'))
    );
}

function isBallOfWool(name) {
    return normName(name) === 'ball of wool';
}

function isPetKittenItem(name) {
    return normName(name) === normName(PET_KITTEN_NAME);
}

function isPetCatItem(name) {
    return normName(name) === normName(PET_CAT_NAME);
}

function isPetItem(name) {
    return isPetKittenItem(name) || isPetCatItem(name);
}

function isFeedableRawFish(name, id) {
    if (typeof id === 'number' && isNoteId(id)) {
        return false;
    }
    return FEEDABLE_RAW_FISH_NORM.has(normName(name));
}

function readVarp(id) {
    const readers = [];
    if (typeof Game.varp === 'function') {
        readers.push(() => Game.varp(id));
    }
    if (typeof Game.setting === 'function') {
        readers.push(() => Game.setting(id));
    }
    const host = welcomeHost();
    if (typeof host?.reader?.varp === 'function') {
        readers.push(() => host.reader.varp(id));
    }
    if (typeof host?.reader?.setting === 'function') {
        readers.push(() => host.reader.setting(id));
    }
    for (const fn of readers) {
        try {
            const v = Number(fn());
            if (Number.isFinite(v)) {
                return v;
            }
        } catch {
            /* ABI shape differs */
        }
    }
    return null;
}

function dialogHaystack() {
    const parts = [];
    try {
        const reader = welcomeHost()?.reader;
        if (typeof reader?.mainModalTexts === 'function') {
            parts.push(...(reader.mainModalTexts() ?? []));
        }
        if (typeof reader?.chatModalTexts === 'function') {
            parts.push(...(reader.chatModalTexts() ?? []));
        }
        if (typeof reader?.chat === 'function') {
            for (const line of reader.chat(20) ?? []) {
                parts.push(line?.text ?? line ?? '');
            }
        }
    } catch {
        /* ABI */
    }
    if (typeof ChatDialog?.text === 'function') {
        try {
            parts.push(String(ChatDialog.text() ?? ''));
        } catch {
            /* ABI */
        }
    }
    return parts.filter(Boolean).join(' ');
}

function npcOps(npc) {
    if (!npc) {
        return [];
    }
    if (typeof npc.actions === 'function') {
        return npc.actions() ?? [];
    }
    if (Array.isArray(npc.ops)) {
        return npc.ops;
    }
    return [];
}

function npcHasOp(npc, want) {
    const n = normName(want);
    return npcOps(npc).some(op => normName(op) === n);
}

function npcTile(npc) {
    if (!npc) {
        return null;
    }
    try {
        if (typeof npc.tile === 'function') {
            return npc.tile();
        }
    } catch {
        /* ABI */
    }
    return npc.tile ?? null;
}

function npcCheb(npc) {
    const here = Game.tile();
    const t = npcTile(npc);
    if (!here || !t || typeof t.x !== 'number' || typeof t.z !== 'number') {
        return 99;
    }
    return Math.max(Math.abs(here.x - t.x), Math.abs(here.z - t.z));
}

function isKittenName(name) {
    return normName(name) === 'kitten';
}

function isCatName(name) {
    return normName(name) === 'cat';
}

function isFollowerKittenNpc(npc) {
    if (!isKittenName(npc?.name)) {
        return false;
    }
    if (npcHasOp(npc, 'Stroke') || npcHasOp(npc, 'Pick-up')) {
        return true;
    }
    return npcCheb(npc) <= 8;
}

function isFollowerCatNpc(npc) {
    return isCatName(npc?.name) && (npcHasOp(npc, 'Stroke') || npcCheb(npc) <= 8);
}

function listNpcs() {
    const out = [];
    const seen = new Set();
    const push = npc => {
        if (!npc) {
            return;
        }
        const key = npc.index ?? npc.uid ?? `${npc.name}:${npcCheb(npc)}`;
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        out.push(npc);
    };
    try {
        if (typeof Npcs?.all === 'function') {
            for (const n of Npcs.all() ?? []) {
                push(n);
            }
        }
    } catch {
        /* ABI */
    }
    try {
        if (Npcs && typeof Npcs.query === 'function') {
            let q = Npcs.query();
            if (typeof q.within === 'function') {
                q = q.within(15);
            }
            const list = typeof q.results === 'function' ? q.results() : [];
            for (const n of list ?? []) {
                push(n);
            }
        }
    } catch {
        /* ABI */
    }
    return out;
}

function nearestNpc(pred) {
    let best = null;
    let bestD = 99;
    for (const npc of listNpcs()) {
        if (!pred(npc)) {
            continue;
        }
        const d = npcCheb(npc);
        if (d < bestD) {
            bestD = d;
            best = npc;
        }
    }
    return best;
}

function queryNpc(name, pred) {
    const byName = nearestNpc(n => (!name || normName(n?.name) === normName(name)) && pred(n));
    if (byName) {
        return byName;
    }
    if (!Npcs || typeof Npcs.query !== 'function') {
        return null;
    }
    try {
        let q = Npcs.query();
        if (name && typeof q.name === 'function') {
            q = q.name(name);
        }
        if (typeof q.within === 'function') {
            q = q.within(15);
        }
        if (typeof q.where === 'function') {
            q = q.where(pred);
        }
        if (typeof q.nearest === 'function') {
            return q.nearest() ?? null;
        }
        const list = typeof q.results === 'function' ? q.results() : [];
        return list[0] ?? null;
    } catch {
        return null;
    }
}

function findKittenNpc() {
    return queryNpc(KITTEN_NPC_NAME, isFollowerKittenNpc) ?? queryNpc(null, isFollowerKittenNpc);
}

function findCatNpc() {
    return queryNpc(CAT_NPC_NAME, isFollowerCatNpc) ?? queryNpc(null, isFollowerCatNpc);
}

function packFishCount() {
    return itemCountBy(isFeedableRawFish);
}

function packWoolCount() {
    return itemCountBy((name) => isBallOfWool(name));
}

function packPetKitten() {
    return Inventory.items().find(i => isPetKittenItem(i.name)) ?? null;
}

function packFishItem() {
    return Inventory.items().find(i => isFeedableRawFish(i.name, i.id)) ?? null;
}

function packWoolItem() {
    return Inventory.items().find(i => isBallOfWool(i.name)) ?? null;
}

function catGrowthBits() {
    const raw = readVarp(CAT_GROWTH_VARP);
    if (raw == null) {
        return null;
    }
    let hunger = raw & 0x1f;
    let attent = (raw >> 5) & 0x3f;
    if (attent === 0) {
        attent = KITTEN_ATTENT_DEFAULT;
    }
    const growth = (raw >> 11) & 0x1ff;
    return { raw, hunger, attent, growth };
}

async function waitBankLoaded() {
    if (typeof Bank.loaded === 'function') {
        await Execution.delayUntil(() => Bank.loaded() || (Bank.items?.() ?? []).length > 0, 3000);
    }
    await Execution.delayTicks(1);
}

function bankRows() {
    try {
        return Bank.items?.() ?? [];
    } catch {
        return [];
    }
}

function bankFishRows() {
    return bankRows().filter(i => isFeedableRawFish(i.name, i.id));
}

function bankWoolCount() {
    try {
        if (typeof Bank.count === 'function') {
            const n = Bank.count(BALL_OF_WOOL) || 0;
            if (n > 0) {
                return n;
            }
        }
    } catch {
        /* ABI */
    }
    const row = bankRows().find(i => isBallOfWool(i.name));
    return row ? Math.max(1, Number(row.count) || 1) : 0;
}

async function withdrawNamed(name, qty) {
    const want = Math.max(1, Math.floor(Number(qty) || 1));
    let ok = false;
    if (typeof Bank.withdrawX === 'function') {
        ok = !!(await Bank.withdrawX(name, want));
    }
    if (!ok && typeof Bank.withdraw === 'function') {
        ok = !!(await Bank.withdraw(name, want === 1 ? 'Withdraw-1' : 'Withdraw-X'));
    }
    return ok;
}

function itemCountBy(pred) {
    return Inventory.items()
        .filter(i => pred(i.name, i.id))
        .reduce((n, i) => n + Math.max(1, i.count), 0);
}

function natureCount() {
    return itemCountBy(isNatureRune);
}

function fireCount() {
    return itemCountBy(isFireRune);
}

function equippedNames() {
    const names = [];
    try {
        if (typeof Equipment.items === 'function') {
            for (const i of Equipment.items()) {
                if (i?.name) {
                    names.push(i.name);
                }
            }
        }
    } catch {
        /* equipment tab unread */
    }
    return names;
}

function hasFireStaff() {
    if (typeof Equipment.contains === 'function') {
        for (const n of FIRE_STAFF_NAMES) {
            if (Equipment.contains(n)) {
                return true;
            }
        }
    }
    return equippedNames().some(n => isFireStaffName(n));
}

function packFireStaff() {
    return Inventory.items().find(i => isFireStaffName(i.name)) ?? null;
}

function fireNeeded() {
    return hasFireStaff() ? 0 : SPELL.fire;
}

function canCast() {
    return natureCount() > 0 && fireCount() >= fireNeeded();
}

function inventorySnaps() {
    const host = welcomeHost();
    if (typeof host?.reader?.inventory === 'function') {
        return host.reader.inventory() ?? [];
    }
    return Inventory.items().map(i => i.snap ?? i);
}

function findSpellCom() {
    const host = welcomeHost();
    const reader = host?.reader;
    const root = typeof reader?.sideTabInterface === 'function' ? reader.sideTabInterface(MAGIC_TAB) : -1;

    if (root !== -1 && typeof reader.targetButtonByBase === 'function') {
        for (const name of SPELL.names) {
            const com = reader.targetButtonByBase(root, name);
            if (com !== -1) {
                return com;
            }
        }
    }

    if (root !== -1 && typeof reader.buttonByText === 'function') {
        for (const name of SPELL.names) {
            for (const label of [name, `Cast ${name}`, `Cast @gre@${name}`]) {
                const com = reader.buttonByText(root, label);
                if (com !== -1) {
                    return com;
                }
            }
        }
    }

    return SPELL.fallbackCom;
}

async function castOnInv(item) {
    if (typeof Game.castOnInv === 'function') {
        return !!(await Game.castOnInv(SPELL.label, item));
    }
    if (typeof Game.castOnItem === 'function') {
        return !!(await Game.castOnItem(SPELL.label, item));
    }

    const host = welcomeHost();
    const actions = host?.actions;
    if (!actions || typeof actions.menuAction !== 'function') {
        return false;
    }

    const snap = item.snap ?? inventorySnaps().find(s => s.slot === item.slot && s.id === item.id);
    if (!snap || snap.id == null || snap.slot == null || snap.comId == null) {
        return false;
    }

    const com = findSpellCom();
    if (com == null || com < 0) {
        return false;
    }

    return (
        !!actions.menuAction(TGT_BUTTON, 0, 0, com) &&
        !!actions.menuAction(TGT_HELD, snap.id, snap.slot, snap.comId)
    );
}

function isProtected(name, id, bot) {
    if (isNatureRune(name, id) || isCoins(name, id) || isFireRune(name, id) || isFireStaffName(name)) {
        return true;
    }
    if (!bot?.raiseKitten) {
        return false;
    }
    if (isBallOfWool(name) || isPetItem(name)) {
        return true;
    }
    if (bot.kittenGrown) {
        return false;
    }
    return isFeedableRawFish(name, id);
}

function parseAlchList(raw) {
    return String(raw ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => {
            if (/^\d+$/.test(s)) {
                const id = Number(s);
                return { kind: 'id', id, ids: relatedIds(id), name: objType(id)?.name ?? s };
            }
            return { kind: 'name', name: s };
        });
}

function itemOnAllowlist(item, list) {
    for (const q of list) {
        if (q.kind === 'id') {
            if (typeof item.id === 'number' && q.ids.has(item.id)) {
                return true;
            }
            continue;
        }
        if (normName(item.name) === normName(q.name)) {
            return true;
        }
    }
    return false;
}

function isAlchEnabled(bot) {
    return parseAlchList(bot.alchItemsRaw).length > 0 || bot.alchInventory === true;
}

function isAlchTarget(item, bot) {
    if (!item || !item.name) {
        return false;
    }
    if (isProtected(item.name, item.id, bot)) {
        return false;
    }
    if (typeof item.id === 'number' && bot.skippedIds.has(item.id)) {
        return false;
    }
    const list = parseAlchList(bot.alchItemsRaw);
    if (list.length > 0) {
        return itemOnAllowlist(item, list);
    }
    return bot.alchInventory === true;
}

function alchableItems(bot) {
    return Inventory.items().filter(i => isAlchTarget(i, bot));
}

function alchableCount(bot) {
    return alchableItems(bot).reduce((n, i) => n + Math.max(1, i.count), 0);
}

function pickAlchItem(bot) {
    const items = alchableItems(bot);
    if (!items.length) {
        return null;
    }
    return [...items].sort((a, b) => {
        const noteDiff = Number(isNoteId(b.id)) - Number(isNoteId(a.id));
        if (noteDiff !== 0) {
            return noteDiff;
        }
        const countDiff = Math.max(1, b.count) - Math.max(1, a.count);
        if (countDiff !== 0) {
            return countDiff;
        }
        return (a.slot ?? 0) - (b.slot ?? 0);
    })[0];
}

function asTile(raw, fallback = new Tile(0, 0, 0)) {
    if (!raw) {
        return fallback;
    }
    if (typeof raw.x === 'number' && typeof raw.z === 'number') {
        return new Tile(raw.x, raw.z, raw.level ?? 0);
    }
    return fallback;
}

function parseStandTileRaw(raw) {
    if (!raw) {
        return new Tile(0, 0, 0);
    }
    if (typeof raw === 'object') {
        return asTile(raw);
    }
    const text = String(raw).trim();
    if (!text) {
        return new Tile(0, 0, 0);
    }
    try {
        const o = JSON.parse(text);
        if (o && typeof o === 'object') {
            return asTile(o);
        }
    } catch {
        /* not JSON */
    }
    const m = text.match(/(-?\d+)\s*[,:\s]\s*(-?\d+)(?:\s*[,:\s]\s*(-?\d+))?/);
    if (m) {
        return new Tile(Number(m[1]), Number(m[2]), Number(m[3] ?? 0));
    }
    return new Tile(0, 0, 0);
}

function readStandTile(settings) {
    if (typeof settings?.tile === 'function') {
        const fromSettings = asTile(settings.tile('standTile', new Tile(0, 0, 0)));
        if (isStandSet(fromSettings)) {
            return fromSettings;
        }
    }
    const fromPref = parseStandTileRaw(readPrefRaw('standTile'));
    if (isStandSet(fromPref)) {
        return fromPref;
    }
    const raw = typeof settings?.str === 'function' ? settings.str('standTile', '') : '';
    return parseStandTileRaw(raw);
}

function isStandSet(tile) {
    return Boolean(tile && (tile.x !== 0 || tile.z !== 0));
}

function onStandTile(tile) {
    const here = Game.tile();
    if (!here || !isStandSet(tile)) {
        return false;
    }
    return here.x === tile.x && here.z === tile.z;
}

function findParamRow(labelRe) {
    if (typeof document === 'undefined') {
        return null;
    }
    for (const row of document.querySelectorAll('.rs2b0t-param-row')) {
        const text = (row.querySelector('.rs2b0t-param-label')?.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (labelRe.test(text)) {
            return row;
        }
    }
    return null;
}

function fillStandTileInputs(tile) {
    const row = findParamRow(/stand coords|stand tile/i);
    if (!row) {
        return;
    }
    const inputs = [...row.querySelectorAll('input')].filter(
        el => el.type === 'number' || el.type === 'text'
    );
    if (inputs.length >= 2) {
        setNativeInputValue(inputs[0], String(tile.x));
        setNativeInputValue(inputs[1], String(tile.z));
        if (inputs[2]) {
            setNativeInputValue(inputs[2], String(tile.level ?? 0));
        }
    }
}

function uncheckCurrentTileBox() {
    const row = findParamRow(/current tile/i);
    const box = row?.querySelector('input[type="checkbox"]');
    if (box && box.checked) {
        box.click();
    }
    writePrefRaw('currentTile', 'false');
}

function installCurrentTileButton(bot) {
    if (typeof document === 'undefined' || document.getElementById(CURRENT_TILE_BTN_ID)) {
        return;
    }
    const host =
        findParamRow(/stand coords|stand tile/i) ?? findParamRow(/stand spot/i) ?? findParamRow(/current tile/i);
    if (!host) {
        return;
    }
    const btn = document.createElement('button');
    btn.id = CURRENT_TILE_BTN_ID;
    btn.type = 'button';
    btn.textContent = 'Current Tile';
    btn.className = 'rs2b0t-param-edit';
    btn.title = 'Set stand coords to the tile you are standing on';
    btn.style.marginLeft = '8px';
    btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        bot.captureCurrentTile();
    });
    host.appendChild(btn);
}

function packUsed() {
    if (typeof Inventory.used === 'function') {
        return Inventory.used();
    }
    return Inventory.items().length;
}

function coinCount() {
    return itemCountBy(isCoins);
}

function unnotedId(id) {
    const t = objType(id);
    if (!t) {
        return id;
    }
    const tmpl = t.certtemplate ?? t.certTemplate;
    const link = t.certlink ?? t.certLink;
    if (typeof tmpl === 'number' && tmpl >= 0 && tmpl !== id && typeof link === 'number' && link >= 0) {
        return link;
    }
    return id;
}

function shopCost(id) {
    const t = objType(unnotedId(id));
    if (!t) {
        return 0;
    }
    for (const key of ['cost', 'value', 'costgp']) {
        const v = t[key];
        if (typeof v === 'number' && v > 0) {
            return v;
        }
    }
    return 0;
}

function highAlchGp(id) {
    const cost = shopCost(id);
    if (cost <= 0) {
        return 0;
    }
    return Math.floor(cost * 0.6);
}

class InventoryAlcher extends LoopingBot {
    status = 'starting';
    startedAt = 0;
    magicXpAtStart = 0;
    casts = 0;
    gpAlched = 0;
    failStreak = 0;
    itemFailStreak = 0;
    lastFailId = -1;
    skippedIds = new Set();
    currentName = '';
    done = false;
    standSpot = false;
    standTile = new Tile(0, 0, 0);
    alchInventory = false;
    alchItemsRaw = '';
    currentTileArmed = false;
    uiTimer = null;
    raiseKitten = false;
    kittenChatHooked = false;
    kittenHungry = false;
    kittenWantsPlay = false;
    kittenGrown = false;
    kittenBankDryUntil = 0;
    lastKittenHunger = null;
    lastKittenAttent = null;
    lastFedAt = 0;
    lastPlayedAt = 0;
    kittenExpected = false;
    kittenRanOff = false;
    varpLive = false;

    async onStart() {
        await Execution.delayUntil(() => Game.ingame() && Game.tile() !== null, 0);

        this.startedAt = Date.now();
        this.magicXpAtStart = Skills.xp('magic');
        this.casts = 0;
        this.gpAlched = 0;
        this.failStreak = 0;
        this.itemFailStreak = 0;
        this.lastFailId = -1;
        this.skippedIds = new Set();
        this.currentName = '';
        this.done = false;
        this.kittenHungry = false;
        this.kittenWantsPlay = false;
        this.kittenGrown = false;
        this.kittenExpected = !!(packPetKitten() || findKittenNpc());
        this.kittenRanOff = false;
        this.varpLive = false;
        this.lastFedAt = Date.now();
        this.lastPlayedAt = 0;
        this.syncSettings();
        this.hookKittenChat();
        this.startUiTimer();

        const magic = Skills.level('magic');
        const list = parseAlchList(this.alchItemsRaw);
        this.log(
            `Benzyme's InventoryAlcher, High Level Alchemy (Magic ${magic}, need ${SPELL.level})`
        );
        if (list.length > 0) {
            this.log(`allowlist: ${list.map(q => q.name).join(', ')}`);
        } else if (this.alchInventory) {
            this.log('ALCH INVENTORY is on: alchs the pack except Nature runes and coins');
        } else {
            this.log('waiting: tick ALCH INVENTORY or list items in the text box');
        }
        if (this.raiseKitten) {
            this.log(
                `kitten mode: keep ${KITTEN_FISH_KEEP} raw fish and a Ball of wool, feed at 50% hunger, play when it wants attention`
            );
        }
        if (this.standSpot) {
            if (isStandSet(this.standTile)) {
                this.log(`stand spot ${this.standTile.x},${this.standTile.z}`);
            } else {
                this.log('stand spot is on, press Current Tile (or type coords) so it can walk you back');
            }
        }

        if (magic < SPELL.level) {
            this.finish(`Magic ${magic} < ${SPELL.level} for ${SPELL.label}`);
            return;
        }

        this.status = 'ready';
    }

    onStop() {
        this.stopUiTimer();
        const xp = Math.max(0, Skills.xp('magic') - this.magicXpAtStart);
        this.log(
            `stopped, ${this.casts} high alchs, ${fmtXph(this.gpAlched)}gp, +${fmtXph(xp)} magic xp (${this.status})`
        );
    }

    startUiTimer() {
        this.stopUiTimer();
        this.uiTimer = setInterval(() => {
            installCurrentTileButton(this);
        }, 500);
        installCurrentTileButton(this);
    }

    stopUiTimer() {
        if (this.uiTimer !== null) {
            clearInterval(this.uiTimer);
            this.uiTimer = null;
        }
    }

    syncSettings() {
        const s = this.settings;
        this.standSpot = s?.bool?.('standSpot', false) ?? false;
        const fromSettings = readStandTile(s);
        if (isStandSet(fromSettings)) {
            this.standTile = fromSettings;
        } else if (!isStandSet(this.standTile)) {
            this.standTile = fromSettings;
        }
        this.alchInventory = s?.bool?.('alchInventory', false) ?? false;
        this.alchItemsRaw = s?.str?.('alchItems', '') ?? '';
        this.raiseKitten = s?.bool?.('raiseKitten', false) ?? false;
        const wantCapture = s?.bool?.('currentTile', false) ?? false;
        if (wantCapture && !this.currentTileArmed) {
            this.captureCurrentTile();
            this.currentTileArmed = true;
        }
        if (!wantCapture) {
            this.currentTileArmed = false;
        }
    }

    captureCurrentTile() {
        const here = Game.tile();
        if (!here) {
            this.log('Current Tile: not in game yet');
            return false;
        }
        this.standTile = new Tile(here.x, here.z, here.level ?? 0);
        writePrefRaw('standTile', JSON.stringify({ x: here.x, z: here.z, level: here.level ?? 0 }));
        fillStandTileInputs(this.standTile);
        uncheckCurrentTileBox();
        this.log(`stand coords set to ${here.x},${here.z}`);
        this.status = `stand ${here.x},${here.z}`;
        return true;
    }

    recoveryAnchor() {
        if (this.standSpot && isStandSet(this.standTile)) {
            return this.standTile;
        }
        return null;
    }

    alchModeLabel() {
        const list = parseAlchList(this.alchItemsRaw);
        if (list.length > 0) {
            return `only ${list.map(q => q.name).join(', ')}`;
        }
        if (this.alchInventory) {
            return 'ALCH INVENTORY';
        }
        return 'waiting for items';
    }

    kittenPaintSafe() {
        try {
            return this.kittenPaintLine();
        } catch {
            return 'kitten';
        }
    }

    kittenPaintLine() {
        if (!this.raiseKitten) {
            return 'kitten off';
        }
        if (this.kittenRanOff) {
            return 'kitten ran off';
        }
        if (this.kittenGrown) {
            return `kitten grown · fish ${packFishCount()} · wool ${packWoolCount()}`;
        }
        const held = !!packPetKitten();
        const following = findKittenNpc();
        const where = held ? 'in pack' : following ? 'following' : this.kittenExpected ? 'not seen' : 'none';
        const now = Date.now();
        const bits = this.kittenBits();
        let hunger;
        if (this.kittenHungry) {
            hunger = 'hungry';
        } else if (this.varpLive && bits) {
            hunger = `${bits.hunger}/${KITTEN_HUNGER_MAX} (${Math.round((bits.hunger / KITTEN_HUNGER_MAX) * 100)}%)`;
        } else {
            const untilFeed = KITTEN_FEED_EVERY_MS - (now - this.lastFedAt);
            hunger =
                untilFeed <= 0 ? 'feed now' : `feed ${fmtRemain(untilFeed)}`;
        }
        let play;
        if (this.kittenWantsPlay) {
            play = 'play now';
        } else if (this.lastPlayedAt <= 0) {
            play = following || this.kittenExpected ? 'play now' : 'play';
        } else {
            const untilPlay = KITTEN_PLAY_EVERY_MS - (now - this.lastPlayedAt);
            play = untilPlay <= 0 ? 'play now' : `play ${fmtRemain(untilPlay)}`;
        }
        return `kitten ${where} · ${hunger} · ${play} · fish ${packFishCount()}/${KITTEN_FISH_KEEP} · wool ${packWoolCount()}`;
    }

    finish(reason) {
        this.done = true;
        this.status = reason;
        this.log(reason);
        stopScript();
    }

    async returnToStand() {
        const dest = this.standTile;
        const here = Game.tile();
        this.status = `returning to ${dest.x},${dest.z}`;
        this.log(
            `off stand at ${here?.x ?? '?'},${here?.z ?? '?'}, walking back to ${dest.x},${dest.z}`
        );
        const opts = {
            radius: 0,
            timeoutMs: 20_000,
            log: m => this.log(`  ${m}`)
        };
        if (typeof Traversal?.walkResilient === 'function') {
            await Traversal.walkResilient(dest, opts);
            return;
        }
        if (typeof Traversal?.walkTo === 'function') {
            await Traversal.walkTo(dest, opts);
        }
    }

    hookKittenChat() {
        if (this.kittenChatHooked || typeof this.on !== 'function') {
            return;
        }
        this.kittenChatHooked = true;
        this.on('chat.message', e =>
            this.noteKittenChat(e?.text ?? e?.message ?? '', e?.username ?? e?.type ?? '')
        );
    }

    noteKittenChat(text, username = '') {
        const t = String(text ?? '');
        if (!t) {
            return;
        }
        const who = normName(username);
        if (KITTEN_CHAT.ranHungry.test(t) || KITTEN_CHAT.ranLonely.test(t)) {
            this.kittenHungry = false;
            this.kittenWantsPlay = false;
            this.kittenExpected = false;
            this.kittenRanOff = true;
            this.log('kitten ran off');
            return;
        }
        if (KITTEN_CHAT.reallyHungry.test(t) || KITTEN_CHAT.hungry.test(t) || (who === 'kitten' && KITTEN_CHAT.miaow.test(t))) {
            this.kittenHungry = true;
            this.kittenExpected = true;
        }
        if (
            KITTEN_CHAT.attention.test(t) ||
            KITTEN_CHAT.lonely.test(t) ||
            (who === 'kitten' && KITTEN_CHAT.purr.test(t))
        ) {
            this.kittenWantsPlay = true;
            this.kittenExpected = true;
        }
        if (KITTEN_CHAT.fed.test(t)) {
            this.kittenHungry = false;
            this.lastFedAt = Date.now();
        }
        if (KITTEN_CHAT.played.test(t)) {
            this.kittenWantsPlay = false;
            this.lastPlayedAt = Date.now();
        }
    }

    kittenBits() {
        const bits = catGrowthBits();
        if (bits && bits.raw !== 0) {
            this.varpLive = true;
            this.lastKittenHunger = bits.hunger;
            this.lastKittenAttent = bits.attent;
        }
        return bits;
    }

    hungerReadyToFeed() {
        if (this.kittenHungry) {
            return true;
        }
        const bits = this.kittenBits();
        if (this.varpLive && bits && bits.hunger >= KITTEN_HUNGER_FEED_AT) {
            return true;
        }
        if (!this.lastFedAt) {
            return false;
        }
        return Date.now() - this.lastFedAt >= KITTEN_FEED_EVERY_MS;
    }

    wantsPlay() {
        if (this.kittenWantsPlay) {
            return true;
        }
        const bits = this.kittenBits();
        if (this.varpLive && bits && bits.attent >= KITTEN_ATTENT_PLAY_AT) {
            return true;
        }
        if (!this.lastPlayedAt) {
            return true;
        }
        return Date.now() - this.lastPlayedAt >= KITTEN_PLAY_EVERY_MS;
    }

    hasKitten() {
        if (this.kittenRanOff || this.kittenGrown) {
            return false;
        }
        if (packPetKitten() || findKittenNpc()) {
            this.kittenExpected = true;
            return true;
        }
        return this.kittenExpected;
    }

    kittenNeedsBank() {
        if (!this.raiseKitten || this.kittenGrown || !this.hasKitten()) {
            return false;
        }
        if (Date.now() < this.kittenBankDryUntil) {
            return false;
        }
        if (packFishCount() < KITTEN_FISH_KEEP) {
            return true;
        }
        if (packWoolCount() < 1) {
            return true;
        }
        return false;
    }

    async careForKitten() {
        this.hookKittenChat();
        this.noteKittenChat(dialogHaystack());

        const catNpc = findCatNpc();
        const heldCat = Inventory.items().find(i => isPetCatItem(i.name));
        const following = findKittenNpc();
        const held = packPetKitten();
        if ((catNpc || heldCat) && !following && !held) {
            if (!this.kittenGrown) {
                this.kittenGrown = true;
                this.kittenExpected = false;
                this.log('kitten grew into a cat, stopping feed and play');
            }
            return false;
        }
        this.kittenGrown = false;

        if (held || following) {
            this.kittenExpected = true;
            this.kittenRanOff = false;
        }

        if (!this.hasKitten()) {
            return false;
        }

        if (!following && held) {
            this.status = 'drop Pet kitten';
            this.log('dropping Pet kitten so it can follow');
            this.kittenExpected = true;
            this.lastPlayedAt = 0;
            if (typeof held.interact === 'function') {
                await held.interact('Drop');
                await Execution.delayTicks(2);
            }
            return true;
        }

        if (following && (this.wantsPlay() || this.hungerReadyToFeed())) {
            if (this.hungerReadyToFeed()) {
                if (packFishCount() <= 0) {
                    this.kittenBankDryUntil = 0;
                    return await this.restockKittenSupplies();
                }
                return await this.feedKitten(following);
            }
            if (packWoolCount() <= 0) {
                this.kittenBankDryUntil = 0;
                return await this.restockKittenSupplies();
            }
            return await this.playWithKitten(following);
        }

        if (this.kittenNeedsBank()) {
            if (packUsed() >= 28) {
                this.log('pack full, alching to free a slot for kitten supplies');
                return false;
            }
            return await this.restockKittenSupplies();
        }

        if (!following) {
            return false;
        }

        return false;
    }

    async restockKittenSupplies() {
        const needFish = Math.max(0, KITTEN_FISH_KEEP - packFishCount());
        const needWool = packWoolCount() < 1 ? 1 : 0;
        if (needFish <= 0 && needWool <= 0) {
            return false;
        }
        if (packUsed() >= 28) {
            this.log('pack full, cannot withdraw kitten supplies');
            return false;
        }

        this.status = 'bank kitten supplies';
        if (typeof Bank.isOpen === 'function' && !Bank.isOpen()) {
            if (!Banking || typeof Banking.open !== 'function') {
                this.log('Banking.open unavailable, cannot withdraw kitten fish');
                await Execution.delayTicks(3);
                return true;
            }
            const opened = !!(await Banking.open({ log: m => this.log(`  ${m}`) }));
            if (!opened) {
                this.log('could not open bank for kitten fish');
                await Execution.delayTicks(3);
                return true;
            }
        }
        await waitBankLoaded();
        if (typeof Bank.setNoteMode === 'function') {
            await Bank.setNoteMode(false);
        }

        if (needWool > 0) {
            if (bankWoolCount() > 0) {
                this.log(`withdrawing ${BALL_OF_WOOL}`);
                await withdrawNamed(BALL_OF_WOOL, 1);
                await Execution.delayTicks(1);
            } else {
                this.log(`no ${BALL_OF_WOOL} in bank`);
            }
        }

        let still = Math.max(0, KITTEN_FISH_KEEP - packFishCount());
        const rows = bankFishRows();
        if (still > 0) {
            const inPack = packFishItem();
            const preferredName = inPack ? normName(inPack.name) : '';
            const byName = [];
            for (const name of FEEDABLE_RAW_FISH) {
                const row = rows.find(r => normName(r.name) === normName(name));
                if (row) {
                    byName.push(row);
                }
            }
            const order = preferredName
                ? [
                      ...byName.filter(r => normName(r.name) === preferredName),
                      ...byName.filter(r => normName(r.name) !== preferredName)
                  ]
                : byName;
            const seen = new Set();
            for (const row of order) {
                const key = normName(row.name);
                if (seen.has(key) || still <= 0) {
                    continue;
                }
                seen.add(key);
                const have = Math.max(1, Number(row.count) || 1);
                const take = Math.min(still, have);
                this.log(`withdrawing ${take} ${row.name}`);
                await withdrawNamed(row.name, take);
                await Execution.delayTicks(1);
                still = Math.max(0, KITTEN_FISH_KEEP - packFishCount());
            }
        }

        if (typeof Bank.isOpen === 'function' && Bank.isOpen()) {
            await Bank.close();
            await Execution.delayTicks(1);
        }

        if (needFish > 0 && packFishCount() < KITTEN_FISH_KEEP) {
            this.kittenBankDryUntil = Date.now() + 30_000;
            this.log(`kitten fish ${packFishCount()}/${KITTEN_FISH_KEEP}, back to alching`);
        }

        if (this.standSpot && isStandSet(this.standTile) && !onStandTile(this.standTile)) {
            await this.returnToStand();
        }
        return false;
    }

    async feedKitten(npc) {
        const kitten = npc ?? findKittenNpc();
        const fish = packFishItem();
        if (!kitten || !fish || typeof fish.useOn !== 'function') {
            return false;
        }
        const before = packFishCount();
        this.status = `feed kitten ${fish.name}`;
        this.log(`feeding kitten ${fish.name} (hunger ${this.lastKittenHunger ?? '?'}/${KITTEN_HUNGER_MAX})`);
        await fish.useOn(kitten);
        const ok = await Execution.delayUntil(
            () => packFishCount() < before || ChatDialog.canContinue(),
            4000
        );
        if (ok) {
            this.kittenHungry = false;
            this.lastFedAt = Date.now();
        }
        await Execution.delayTicks(1);
        return true;
    }

    async playWithKitten(npc) {
        const kitten = npc ?? findKittenNpc();
        if (!kitten) {
            return false;
        }
        const wool = packWoolItem();
        this.status = 'play with kitten';
        this.log('playing with kitten');
        let used = false;
        if (wool && typeof wool.useOn === 'function') {
            used = !!(await wool.useOn(kitten));
        }
        if (!used && typeof kitten.interact === 'function' && npcHasOp(kitten, 'Stroke')) {
            this.log('stroking kitten');
            used = !!(await kitten.interact('Stroke'));
        }
        if (!used) {
            return false;
        }
        await Execution.delayUntil(() => ChatDialog.canContinue(), 4000);
        this.noteKittenChat(dialogHaystack());
        this.kittenWantsPlay = false;
        this.lastPlayedAt = Date.now();
        await Execution.delayTicks(1);
        return true;
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
        if (this.done) {
            await Execution.delayTicks(8);
            return;
        }
        this.syncSettings();
        installCurrentTileButton(this);

        if (ChatDialog.canContinue()) {
            this.noteKittenChat(dialogHaystack());
            this.status = 'continue dialog';
            await ChatDialog.continue();
            if (!(this.raiseKitten && (this.kittenWantsPlay || this.kittenHungry))) {
                return;
            }
        }

        if (Skills.level('magic') < SPELL.level) {
            this.finish(`Magic ${Skills.level('magic')} < ${SPELL.level} for ${SPELL.label}`);
            return;
        }

        if (this.raiseKitten && (await this.careForKitten())) {
            return;
        }

        if (this.failStreak >= 8) {
            if (this.raiseKitten) {
                this.status = 'alch paused, still raising kitten';
                await Execution.delayTicks(5);
                return;
            }
            this.finish('stopped, alch keep failing (spell, runes, or item?)');
            return;
        }

        if (this.standSpot) {
            if (!isStandSet(this.standTile)) {
                this.status = 'stand spot on, press Current Tile';
                await Execution.delayTicks(2);
                return;
            }
            if (!onStandTile(this.standTile)) {
                await this.returnToStand();
                return;
            }
        }

        if (typeof Bank.isOpen === 'function' && Bank.isOpen()) {
            this.status = 'closing bank';
            await Bank.close();
            await Execution.delayTicks(1);
        }

        if (!hasFireStaff() && packFireStaff() && fireCount() < SPELL.fire) {
            const staff = packFireStaff();
            this.status = `wield ${staff.name}`;
            this.log(`wielding ${staff.name} for fire runes`);
            if (typeof Equipment.equip === 'function') {
                await Equipment.equip(staff.name);
                await Execution.delayTicks(1);
            }
        }

        if (!isAlchEnabled(this)) {
            this.status = this.raiseKitten ? 'kitten, waiting to alch' : 'tick ALCH INVENTORY or list items';
            await Execution.delayTicks(3);
            return;
        }

        if (!canCast()) {
            if (this.raiseKitten) {
                this.status = 'kitten, no runes to alch';
                await Execution.delayTicks(3);
                return;
            }
            if (natureCount() <= 0) {
                this.finish('stopped, no Nature runes left');
                return;
            }
            this.finish(`stopped, need ${SPELL.fire} Fire runes (or a fire staff)`);
            return;
        }

        const item = pickAlchItem(this);
        if (!item) {
            if (this.raiseKitten) {
                this.status = 'kitten, nothing left to alch';
                await Execution.delayTicks(3);
                return;
            }
            if (parseAlchList(this.alchItemsRaw).length > 0) {
                this.finish('stopped, none of the listed items left in pack');
                return;
            }
            this.finish('stopped, pack has nothing left to alch');
            return;
        }

        await this.alchOnce(item);
    }

    async alchOnce(item) {
        const before = alchableCount(this);
        const beforeXp = Skills.xp('magic');
        const coinsBefore = coinCount();
        this.currentName = item.name || 'item';
        this.status = `High alch ${this.currentName}`;
        this.log(
            `${SPELL.label} -> ${this.currentName}` +
                (typeof item.id === 'number' ? ` (id ${item.id})` : '') +
                ` x${before}`
        );

        const dispatched = await castOnInv(item);
        if (!dispatched) {
            this.noteFail(item);
            this.log(`cast failed (spell com / inv target?) streak ${this.failStreak}`);
            await Execution.delayTicks(2);
            return;
        }

        const ok = await Execution.delayUntil(
            () => alchableCount(this) < before || Skills.xp('magic') > beforeXp,
            Math.max(2500, SPELL.ticks * 700)
        );

        if (ok) {
            this.casts++;
            this.failStreak = 0;
            this.itemFailStreak = 0;
            this.lastFailId = -1;
            const gained = coinCount() - coinsBefore;
            this.gpAlched += gained > 0 ? gained : highAlchGp(item.id);
            await Execution.delayUntil(() => !Game.animating?.(), SPELL.ticks * 600 + 400);
            await Execution.delayTicks(1);
            return;
        }

        this.noteFail(item);
        this.log(`alch did not consume an item, streak ${this.failStreak}`);
        await Execution.delayTicks(2);
    }

    noteFail(item) {
        this.failStreak++;
        if (typeof item.id === 'number' && item.id === this.lastFailId) {
            this.itemFailStreak++;
        } else {
            this.lastFailId = typeof item.id === 'number' ? item.id : -1;
            this.itemFailStreak = 1;
        }
        if (this.itemFailStreak >= 3 && this.lastFailId >= 0) {
            this.skippedIds.add(this.lastFailId);
            this.log(`skipping ${item.name ?? 'item'} (id ${this.lastFailId}), alch would not take it`);
            this.itemFailStreak = 0;
            this.lastFailId = -1;
            this.failStreak = Math.max(0, this.failStreak - 3);
        }
    }

    onPaint(ctx) {
        try {
            this.raiseKitten = this.settings?.bool?.('raiseKitten', false) ?? this.raiseKitten;
            this.noteKittenChat(dialogHaystack());
        } catch {
            /* paint must not throw */
        }
        const elapsed = Date.now() - this.startedAt;
        const hrs = elapsed / 3_600_000;
        const xp = Math.max(0, Skills.xp('magic') - this.magicXpAtStart);
        const xph = hrs > 0.0005 ? xp / hrs : 0;
        const cph = hrs > 0.0005 ? this.casts / hrs : 0;
        const gph = hrs > 0.0005 ? this.gpAlched / hrs : 0;
        const left = alchableCount(this);
        const stand =
            this.standSpot && isStandSet(this.standTile)
                ? `stand ${this.standTile.x},${this.standTile.z}`
                : this.standSpot
                  ? 'stand unset'
                  : 'stand off';
        const lines = [
            `Benzyme's InventoryAlcher v${SCRIPT_VERSION}`,
            `time ${fmtElapsed(elapsed)} · ${this.status}`,
            `High Level Alchemy · Magic ${Skills.level('magic')}`,
            `alch ${this.currentName || 'none'} · left ${left} · pack ${packUsed()}/28`,
            `alchs ${this.casts} · ${fmtXph(cph)}/hr`,
            `gp alched ${fmtXph(this.gpAlched)} · ${fmtXph(gph)}/hr`,
            `magic: ${fmtXph(xph)} xp/hr  (+${Math.round(xp)} xp)`,
            `Nature ${natureCount()} · Fire ${hasFireStaff() ? 'staff' : fireCount()}`,
            `${stand} · ${this.alchModeLabel()}`,
            this.kittenPaintSafe()
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
            ctx.fillStyle = i === 0 ? '#20c428' : '#ffffff';
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
    version: SCRIPT_VERSION,
    category: 'Magic',
    tags: ['magic', 'alch', 'high alchemy', 'inventory', 'utility', 'kitten'],
    description:
        "Benzyme's InventoryAlcher. High Level Alchemy with safeguards: ALCH INVENTORY is off by default. Tick it to alch the pack except Nature runes and coins, or list exact item names/IDs in the text box (comma-separated). A filled list always wins. Optional stand spot walks you back after random events. Optional Raise a kitten keeps 10 raw fish and a Ball of wool (never alched), feeds at 50% hunger, and plays with the wool when needed. Needs Magic 55, Nature runes, and Fire runes or a fire staff.",
    settingsSchema: {
        standSpot: {
            type: 'boolean',
            default: false,
            label: 'Stand spot',
            group: 'Stand',
            help: 'When ticked, stay on the stand coords. If a random event (or anything else) moves you, walk back before the next alch.'
        },
        standTile: {
            type: 'tile',
            default: { x: 0, z: 0, level: 0 },
            label: 'Stand coords',
            group: 'Stand',
            help: 'Tile to stand on. Press Current Tile to snapshot where you are, or type the coords.'
        },
        currentTile: {
            type: 'boolean',
            default: false,
            label: 'Current Tile',
            group: 'Stand',
            help: 'Tick (or press the Current Tile button) to set stand coords to the tile you are standing on. Clears after capture.'
        },
        alchInventory: {
            type: 'boolean',
            default: false,
            label: 'ALCH INVENTORY',
            group: 'Alch',
            help: 'WARNING: ticking this box will alch everything in your inventory except Nature runes and coins. Fire runes and a fire staff are also left alone so the spell can keep casting. Raise a kitten also skips Pet kitten, a Ball of wool, and the raw fish it eats. Leave this off unless you mean it.'
        },
        alchItems: {
            type: 'string',
            default: '',
            label: 'Only alch these items',
            group: 'Alch',
            help: 'Comma-separated exact item names or IDs (e.g. Yew longbow, Magic longbow). When this box has anything in it, only those items are alched. Leave it blank to use the ALCH INVENTORY checkbox instead.'
        },
        raiseKitten: {
            type: 'boolean',
            default: false,
            label: 'Raise a kitten',
            group: 'Kitten',
            help: 'Keep 10 raw fish (Raw shrimps, Raw anchovies, Raw sardine, Raw trout, Raw salmon, or Raw tuna) and a Ball of wool. Never alch those, or Pet kitten. Drop the kitten so it follows. Feed when hunger is at least 50%. Play with the wool when it wants attention. If fish run out, withdraw more from the bank.'
        }
    },
    create: () => new InventoryAlcher()
});
