/**
 * BenzymeGoblinKiller. Kills Lumbridge oak goblins. Hops to giant rats if the camp is crowded.
 * Banks at Al Kharid (this world has no Lumbridge bank chest).
 *
 * Load URL: https://cdn.jsdelivr.net/gh/Benzymee/RS2B2TScripts@main/BenzymeGoblinKiller.js
 */
const SUPPORTED_API_VERSION = 1;
const abi = globalThis.__rs2b0t;
if (!abi) {
    throw new Error(
        "Benzyme's Goblin Killer: globalThis.__rs2b0t missing — load inside rs2b0t bot.html"
    );
}
if (abi.apiVersion !== SUPPORTED_API_VERSION) {
    throw new Error(
        `Benzyme's Goblin Killer: ABI ${abi.apiVersion} != supported ${SUPPORTED_API_VERSION}`
    );
}

const {
    defineBot,
    Execution,
    Game,
    LoopingBot: LoopingBotBase,
    Npcs,
    Locs,
    Players,
    GroundItems,
    Equipment,
    Inventory,
    Bank,
    Banking,
    Traversal,
    Tile,
    Skills,
    ChatDialog,
    Shop,
    Loadouts,
    SettingsStore
} = abi;

const SCRIPT_NAME = 'BenzymeGoblinKiller';
/** Display / paint version — bump minor on each update (v2 → v2.1 → v2.2 …). */
const SCRIPT_VERSION = '2.17';
const SCRIPT_VERSION_FULL = '2.17.0';

/** Post-login welcome modal interface id (Close Window top-right). */
const WELCOME_SCREEN_ID = 5993;

/** Tutorial Island map-square bbox (48,48 → tiles ~3072–3135). */
const TUT_MIN = 3072;
const TUT_MAX = 3200;
const GUIDE_NAME = 'RuneScape Guide';

/**
 * Oak tree in the center of the Lumbridge goblin camp.
 * Combat + bone loot stay inside this radius so cow-paddock bones to the north are ignored.
 */
const OAK_TREE = new Tile(3243, 3240, 0);
const CAMP_RADIUS = 15;
/** Goblin house door — keep Open whenever we're at the oak camp. */
const HOUSE_DOOR = new Tile(3246, 3244, 0);
const GOBLIN_NPC_NAME = 'Goblin';
/** Hop to giant rats when more than this many other players are fighting goblins. */
const GOBLIN_FIGHTER_THRESHOLD = 5;
/** Player must be this close to a fighting goblin to count as engaged with it. */
const GOBLIN_FIGHT_MATCH_DIST = 2;

/**
 * Overflow when the goblin camp is contested — Lumbridge giant rats (south of castle / near farm).
 */
const RAT_CAMP = new Tile(3215, 3180, 0);
const RAT_CAMP_RADIUS = 18;
const RAT_NPC_NAME = 'Giant rat';

/** Only loot Bones that appear on/near our last kill tile, within this window. */
const OWN_BONE_LOOT_RADIUS = 2;
const OWN_BONE_LOOT_MS = 12_000;

const WEAPON_BRONZE = 'Bronze sword';
const WEAPON_DAGGER = 'Bronze dagger';
const WEAPON_STEEL = 'Steel scimitar';
const SHIELD = 'Wooden shield';
const LOADOUT_NONE = '';
const DEATH_RE = /oh dear.*you are dead/i;
const CANT_REACH_RE = /i can't reach that/i;
const TOWARD_SLACK = 4;

const PICKPOCKET_OP = 'Pickpocket';
const STUN_RE = /been stunned|fail to pick/i;
const STUN_TICKS = 9;
/** Never pickpocket below this HP — wait to regen so a fail cannot kill us. */
const PICKPOCKET_MIN_HP = 5;
/** Attack + Hitpoints levels that unlock the Steel scimitar upgrade. */
const STEEL_ATK_NEED = 5;
const STEEL_HP_NEED = 20;
const GP_TARGET = 500;
const STEEL_SCIM_COST = 320;
/** Train at camp this long when Zeke has no Steel scimitar stock. */
const STEEL_RESTOCK_MS = 10 * 60 * 1000;

/** Al Kharid bank booths. Lumbridge has no bank chest on this world. */
const ALKHARID_BANK_STAND = new Tile(3269, 3167, 0);
const BANK_BOOTH_NAME = 'Bank booth';

/** Lumbridge courtyard Men (same stand as other Benzyme thieving scripts). */
const LUMBY_MEN = new Tile(3222, 3218, 0);
const LUMBY_MEN_LEASH = 16;

/** Lumbridge ↔ Al-Kharid toll gate (Border Guards). */
const ALK_GATE = new Tile(3268, 3227, 0);
const ALK_GATE_WEST = new Tile(3265, 3228, 0);
const ALK_GATE_EAST = new Tile(3271, 3228, 0);
const ALK_TOLL_GP = 10;
/** North of the wall (Al-Kharid side) — leave a jammed gate this way. */
const ALK_AROUND_EAST = new Tile(3282, 3255, 0);
/** Lumbridge cow pen (west of the wall) — long route into Lumbridge. */
const ALK_AROUND_WEST = new Tile(3255, 3275, 0);
/** Step east into Al-Kharid off the jammed gate tile before going north. */
const ALK_PEEL_EAST = new Tile(3284, 3218, 0);

/** Zeke's Superior Scimitars — north Al-Kharid. */
const ZEKE_STAND = new Tile(3288, 3190, 0);
const ZEKE_NAME = 'Zeke';

const GATE_DIALOG_PREFER = [
    "yes, i'll pay",
    'yes ill pay',
    "i'll pay",
    'yes, ok',
    'can i come through',
    'come through this gate',
    '10 gold',
    '10gp',
    'yes'
];
const GATE_DIALOG_AVOID = ['no thanks', 'no thank', 'what is this place', 'nothing', 'walk around'];
const GATE_DIALOG_AROUND = [
    "i'll walk around",
    'walk around',
    'no thank you',
    'no thank',
    'no thanks'
];

/** Side-panel tab indices (rs2b0t Game.openSideTab). */
const STATS_TAB = 1;

/** Melee styles that train a single combat skill. */
const TRAINABLE = ['attack', 'strength', 'defence'];
/** Skills we may show XP/hr for once they gain XP this session. */
const COMBAT_TRACK = ['attack', 'strength', 'defence', 'hitpoints', 'prayer'];

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

/** True while standing on Tutorial Island (map square ~48,48). */
function isOnTutorialIsland(tile = Game.tile()) {
    if (!tile) {
        return false;
    }
    return (
        tile.x >= TUT_MIN &&
        tile.x < TUT_MAX &&
        tile.z >= TUT_MIN &&
        tile.z < TUT_MAX
    );
}

function characterCreationTexts() {
    const host = welcomeHost();
    if (!host?.reader || typeof host.reader.mainModalTexts !== 'function') {
        return [];
    }
    return host.reader.mainModalTexts() ?? [];
}

/** Character design (player_kit) open — Accept to finish appearance. */
function isCharacterCreationOpen() {
    const host = welcomeHost();
    if (!host?.reader) {
        return false;
    }
    const { reader } = host;
    const main = typeof reader.modals === 'function' ? reader.modals().main : -1;
    if (main === -1) {
        return false;
    }

    const texts = characterCreationTexts();
    if (
        texts.some(
            t =>
                /design your player/i.test(t) ||
                /use the buttons below to design/i.test(t) ||
                /welcome to runescape - use the buttons/i.test(t)
        )
    ) {
        return true;
    }

    // On tutorial island with an Accept button on the main modal.
    if (
        isOnTutorialIsland() &&
        typeof reader.buttonByText === 'function' &&
        reader.buttonByText(main, 'Accept') !== -1
    ) {
        return true;
    }
    return false;
}

/**
 * player_kit arrows share option text on left/right (e.g. both "Change head").
 * First match is the left arrow — cycling it still walks the full kit list.
 */
function clickDesignButton(label) {
    const host = welcomeHost();
    if (!host?.reader || !host?.actions || typeof host.actions.ifButton !== 'function') {
        return false;
    }
    const { reader, actions } = host;
    const main = typeof reader.modals === 'function' ? reader.modals().main : -1;
    if (main === -1) {
        return false;
    }
    if (typeof reader.buttonByText === 'function') {
        const btn = reader.buttonByText(main, label);
        if (btn !== -1 && actions.ifButton(btn)) {
            return true;
        }
    }
    if (typeof reader.modalButtons === 'function') {
        const want = label.toLowerCase();
        const hit = (reader.modalButtons(main) ?? []).find(
            b => !b.hidden && (b.menu ?? '').toLowerCase() === want
        );
        if (hit && actions.ifButton(hit.comId)) {
            return true;
        }
    }
    return false;
}

/**
 * Randomize player_kit (clientcodes 300–325) before Accept (326).
 * Gender first — switching it resets kits on the client.
 */
function randomizeCharacterLook() {
    const female = Math.random() >= 0.5;
    clickDesignButton(female ? 'Female' : 'Male');

    const parts = [
        ['Change head', 10],
        ['Change jaw', 10],
        ['Change torso', 14],
        ['Change arms', 12],
        ['Change hands', 4],
        ['Change legs', 12],
        ['Change feet', 4]
    ];
    const colours = [
        ['Recolour hair', 24],
        ['Recolour torso', 14],
        ['Recolour legs', 14],
        ['Recolour feet', 6],
        ['Recolour skin', 8]
    ];

    for (const [label, max] of [...parts, ...colours]) {
        const n = Math.floor(Math.random() * max);
        for (let i = 0; i < n; i++) {
            if (!clickDesignButton(label)) {
                break;
            }
        }
    }
    return { female };
}

/**
 * Click Accept on character creation (player_kit clientcode 326).
 * @returns {Promise<boolean>}
 */
async function acceptCharacterCreation() {
    if (!isCharacterCreationOpen()) {
        return false;
    }
    const host = welcomeHost();
    if (!host?.reader || !host?.actions) {
        return false;
    }
    const { reader, actions } = host;
    const main = reader.modals().main;
    if (main === -1 || typeof actions.ifButton !== 'function') {
        return false;
    }

    if (typeof reader.buttonByText === 'function') {
        const btn = reader.buttonByText(main, 'Accept');
        if (btn !== -1 && actions.ifButton(btn)) {
            await Execution.delayTicks(2);
            return true;
        }
    }
    return false;
}

function findRuneScapeGuide() {
    return (
        Npcs.query().name(GUIDE_NAME).nearest() ??
        Npcs.query()
            .where(n => /runescape\s*guide/i.test(n.name ?? ''))
            .nearest() ??
        null
    );
}

function pickTutorialSkipOption(options) {
    if (!options || options.length === 0) {
        return null;
    }
    for (const prefer of [
        /yes\s*please/i,
        /skip\s*(the\s*)?tutorial/i,
        /^yes\b/i
    ]) {
        const hit = options.find(o => prefer.test(o ?? ''));
        if (hit) {
            return hit;
        }
    }
    return options[0] ?? null;
}

function cheb(a, b) {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
}

function towardDest(door, here, dest) {
    return cheb(door, dest) <= cheb(here, dest) + TOWARD_SLACK;
}

function isShutDoor(loc) {
    const name = (loc.name ?? '').toLowerCase();
    if (!name.includes('door')) {
        return false;
    }
    return loc.actions().some(a => /^open/i.test(a));
}

function openDoorOp(loc) {
    return loc.actions().find(a => /^open/i.test(a)) ?? null;
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

function isGoblinNpc(n) {
    return (n.name ?? '').toLowerCase().includes('goblin');
}

function isGiantRatNpc(n) {
    const name = (n.name ?? '').toLowerCase();
    return name.includes('giant rat') || name === 'giant rat';
}

function queryResults(q) {
    if (!q) {
        return [];
    }
    if (typeof q.results === 'function') {
        return q.results() ?? [];
    }
    return [];
}

function playerKey(p) {
    if (p?.index != null && p.index >= 0) {
        return `i:${p.index}`;
    }
    if (p?.name) {
        return `n:${String(p.name).toLowerCase()}`;
    }
    const t = p?.tile?.() ?? null;
    return t ? `t:${t.x},${t.z}` : '';
}

/** Goblin fighting someone else (not us). */
function goblinFightingOther(n) {
    if (npcTargetsMe(n)) {
        return false;
    }
    return !!n.inCombat || npcTargetsAnother(n);
}

/**
 * Unique other players currently engaged in combat with goblins at the oak camp.
 * Matches players standing next to a goblin that is in combat / targeting another player.
 * Falls back to the number of such goblins if player tiles aren't available.
 */
function charactersFightingGoblins(radius = CAMP_RADIUS) {
    const goblinQ = Npcs.query()
        .within(radius + 10)
        .where(n => isGoblinNpc(n))
        .where(n => {
            const t = n.tile?.() ?? null;
            return t != null && Tile.from(t).distanceTo(OAK_TREE) <= radius + 2;
        })
        .where(n => goblinFightingOther(n));

    const goblins = queryResults(goblinQ);
    const goblinFights =
        goblins.length > 0
            ? goblins.length
            : typeof goblinQ.count === 'function'
              ? goblinQ.count()
              : 0;

    if (typeof Players?.query !== 'function') {
        return goblinFights;
    }

    const players = queryResults(
        Players.query().where(p => {
            const pt = p.tile?.() ?? null;
            return pt != null && Tile.from(pt).distanceTo(OAK_TREE) <= radius + 4;
        })
    );

    if (players.length > 0) {
        const seen = new Set();
        for (const p of players) {
            const pt = p.tile?.() ?? null;
            if (!pt) {
                continue;
            }
            const pTile = Tile.from(pt);
            const nextToFightingGoblin =
                goblins.length > 0
                    ? goblins.some(g => {
                          const gt = g.tile?.() ?? null;
                          return (
                              gt != null &&
                              Tile.from(gt).distanceTo(pTile) <= GOBLIN_FIGHT_MATCH_DIST
                          );
                      })
                    : false;
            if (!nextToFightingGoblin) {
                continue;
            }
            const key = playerKey(p);
            if (key) {
                seen.add(key);
            }
        }
        if (seen.size > 0) {
            return seen.size;
        }
    }

    return goblinFights;
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

function invCoins() {
    try {
        if (typeof Inventory.count === 'function') {
            const n = Inventory.count('Coins') || Inventory.count('coins') || 0;
            if (n > 0) {
                return n;
            }
        }
        return Inventory.items()
            .filter(i => (i.name ?? '').toLowerCase() === 'coins')
            .reduce((n, i) => n + Math.max(0, i.count ?? 0), 0);
    } catch {
        return 0;
    }
}

function currentHp() {
    try {
        if (typeof Skills?.effective === 'function') {
            const n = Number(Skills.effective('hitpoints'));
            if (Number.isFinite(n) && n > 0) {
                return n;
            }
        }
        if (typeof Game.hitpoints === 'function') {
            const n = Number(Game.hitpoints());
            if (Number.isFinite(n) && n > 0) {
                return n;
            }
        }
        if (typeof Skills?.level === 'function') {
            return Skills.level('hitpoints');
        }
    } catch {
        /* ABI shape differs */
    }
    return 10;
}

function reachedSteelUpgradeStats() {
    return Skills.level('attack') >= STEEL_ATK_NEED && Skills.level('hitpoints') >= STEEL_HP_NEED;
}

function locActions(loc) {
    try {
        if (loc && typeof loc.actions === 'function') {
            return (loc.actions() ?? []).filter(a => typeof a === 'string' && a.length > 0);
        }
    } catch {
        /* ABI shape differs */
    }
    return [];
}

function bankObjectOp(loc) {
    const list = locActions(loc);
    return (
        list.find(a => /use-quickly/i.test(a)) ??
        list.find(a => /^use$/i.test(a)) ??
        list.find(a => /^bank$/i.test(a)) ??
        list.find(a => /bank/i.test(a)) ??
        list[0] ??
        null
    );
}

function findBankObject(name) {
    try {
        const withOps =
            Locs.query()
                .name(name)
                .where(l => locActions(l).length > 0)
                .nearest() ?? null;
        if (withOps) {
            return withOps;
        }
        return Locs.query().name(name).nearest() ?? null;
    } catch {
        return null;
    }
}

function hasNamedGear(name) {
    return Equipment.contains(name) || !!Inventory.first(name);
}

function heldCount(name) {
    try {
        if (typeof Inventory.count === 'function') {
            const n = Inventory.count(name) || 0;
            if (n > 0) {
                return n;
            }
        }
    } catch {
        /* ABI shape differs */
    }
    if (Equipment.contains(name)) {
        return 1;
    }
    return Inventory.first(name) ? 1 : 0;
}

function uniqueNames(names) {
    const out = [];
    const seen = new Set();
    for (const raw of names) {
        const name = typeof raw === 'string' ? raw.trim() : '';
        if (!name) {
            continue;
        }
        const key = name.toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        out.push(name);
    }
    return out;
}

function parseLoadoutList(raw) {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
        return [];
    }
    let payload;
    try {
        payload = JSON.parse(raw);
    } catch {
        return [];
    }
    if (!Array.isArray(payload)) {
        return [];
    }
    const out = [];
    for (const entry of payload) {
        const name = entry?.name;
        if (typeof name !== 'string' || name.trim().length === 0) {
            continue;
        }
        const worn = {};
        if (entry?.worn && typeof entry.worn === 'object') {
            for (const [slot, value] of Object.entries(entry.worn)) {
                if (typeof value === 'string' && value.trim().length > 0) {
                    worn[slot] = value;
                }
            }
        }
        const carry = [];
        if (Array.isArray(entry?.carry)) {
            for (const row of entry.carry) {
                const item = row?.item;
                const qty = Number(row?.qty);
                if (typeof item === 'string' && item.trim().length > 0 && Number.isFinite(qty) && qty > 0) {
                    carry.push({ item, qty: Math.floor(qty) });
                }
            }
        }
        out.push({ name, worn, carry });
    }
    return out;
}

function listLoadouts() {
    try {
        if (Loadouts && typeof Loadouts.all === 'function') {
            return Loadouts.all() ?? [];
        }
    } catch {
        /* older client */
    }
    try {
        if (SettingsStore && typeof SettingsStore.displayString === 'function') {
            return parseLoadoutList(
                SettingsStore.displayString('Loadouts', 'sets', { type: 'string', default: '[]' })
            );
        }
    } catch {
        /* ignore */
    }
    return [];
}

function resolveLoadout(name) {
    const wanted = typeof name === 'string' ? name.trim().toLowerCase() : '';
    if (!wanted) {
        return null;
    }
    return listLoadouts().find(l => (l.name ?? '').toLowerCase() === wanted) ?? null;
}

function bankHasItem(item) {
    try {
        if (typeof Bank.count === 'function') {
            const n = Bank.count(item) || 0;
            if (n > 0) {
                return n;
            }
        }
    } catch {
        /* ABI shape differs */
    }
    if (typeof Bank.items === 'function') {
        const want = item.toLowerCase();
        const row = Bank.items().find(i => (i.name ?? '').toLowerCase() === want);
        if (row) {
            return Math.max(1, Number(row.count) || 1);
        }
    }
    return 0;
}

function hasSteelScimitar() {
    return hasNamedGear(WEAPON_STEEL);
}

function shopOpen() {
    return typeof Shop !== 'undefined' && Shop && typeof Shop.isOpen === 'function' && Shop.isOpen();
}

/** Steel scimitar count in the open shop, or -1 if we cannot read stock. */
function steelStockCount() {
    if (!shopOpen()) {
        return -1;
    }
    const want = WEAPON_STEEL.toLowerCase();
    const rows = [];
    try {
        if (typeof Shop.stock === 'function') {
            rows.push(...(Shop.stock() ?? []));
        }
    } catch {
        /* ABI shape differs */
    }
    if (rows.length === 0) {
        const host = welcomeHost();
        if (host?.reader && typeof host.reader.shopInv === 'function') {
            try {
                rows.push(...(host.reader.shopInv(3900) ?? []));
            } catch {
                /* ignore */
            }
        }
    }
    const row = rows.find(r => (r.name ?? '').toLowerCase() === want);
    if (!row) {
        return rows.length > 0 ? 0 : -1;
    }
    return Math.max(0, Number(row.count) || 0);
}

function eastOfAlkGate(t) {
    return !!t && t.x >= 3269;
}

function westOfAlkGate(t) {
    return !!t && t.x <= 3266;
}

function tileDist(a, b) {
    if (!a || !b) {
        return 9999;
    }
    if (typeof a.distanceTo === 'function') {
        return a.distanceTo(b);
    }
    if (typeof Tile.from === 'function') {
        return Tile.from(a).distanceTo(b);
    }
    return Math.max(Math.abs(a.x - b.x), Math.abs((a.z ?? 0) - (b.z ?? 0)));
}

function dialogOpen() {
    if (typeof ChatDialog?.canContinue === 'function' && ChatDialog.canContinue()) {
        return true;
    }
    return (
        typeof ChatDialog?.isOpen === 'function' &&
        ChatDialog.isOpen() &&
        typeof ChatDialog.options === 'function' &&
        ChatDialog.options().length > 0
    );
}

function pickGateOption(options, walkAround = false) {
    if (walkAround) {
        for (const p of GATE_DIALOG_AROUND) {
            const hit = options.find(o => (o ?? '').toLowerCase().includes(p));
            if (hit) {
                return hit;
            }
        }
        const nonPay = options.filter(o => !/\byes\b/i.test(o ?? ''));
        return nonPay[0] ?? options[0] ?? null;
    }
    const pool = options.filter(o => {
        const low = (o ?? '').toLowerCase();
        return !GATE_DIALOG_AVOID.some(a => low.includes(a));
    });
    const usable = pool.length > 0 ? pool : options;
    for (const p of GATE_DIALOG_PREFER) {
        const hit = usable.find(o => (o ?? '').toLowerCase().includes(p));
        if (hit) {
            return hit;
        }
    }
    return usable[0] ?? null;
}

function findAlkharidGateLoc() {
    return (
        Locs.query()
            .where(l => {
                const n = (l.name ?? '').toLowerCase();
                if (!n.includes('gate')) {
                    return false;
                }
                const t = l.tile();
                return t && Math.abs(t.x - ALK_GATE.x) <= 3 && Math.abs(t.z - ALK_GATE.z) <= 4;
            })
            .nearest() ?? null
    );
}

function findBorderGuard() {
    return (
        Npcs.query().name('Border Guard').within(10).nearest() ??
        Npcs.query()
            .within(10)
            .where(n => /border\s*guard/i.test(n.name ?? ''))
            .nearest() ??
        null
    );
}

function gateInteractOp(loc) {
    const acts = typeof loc.actions === 'function' ? loc.actions() : [];
    return (
        acts.find(a => /pay-toll/i.test(a ?? '')) ??
        acts.find(a => /^open/i.test(a ?? '')) ??
        null
    );
}

/** Clamp levels-before-swap to the scroll bar range 1–20. */
function clampLevels(n) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v)) {
        return 1;
    }
    return Math.min(20, Math.max(1, v));
}

/**
 * Pick a random melee style. Prefer a different skill than `except` when possible.
 * @param {string | null} [except]
 */
function pickRandomStyle(except = null) {
    const pool = TRAINABLE.filter(s => s !== except);
    const choices = pool.length > 0 ? pool : TRAINABLE.slice();
    return choices[Math.floor(Math.random() * choices.length)];
}

/** Matches rs2b0t SettingsStore boxKey(`set:${name}:${key}`). */
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

function clientReader() {
    return abi.reader ?? welcomeHost()?.reader ?? null;
}

/**
 * Host disables Edit parameters while running *or* paused. Re-enable while
 * paused so Combat prefs can be changed without stopping the script.
 */
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

class BenzymeGoblinKiller extends LoopingBotBase {
    recovering = false;
    deaths = 0;
    attacks = 0;
    status = 'starting';
    /** False until we have banked everything and withdrawn/equipped GEAR once. */
    gearReady = false;
    /** False until Tutorial Island / character creation is cleared (or never present). */
    tutorialCleared = false;
    /** True after we have randomized the design this session (do not re-roll on Accept retry). */
    characterLookApplied = false;

    /** When true: train one style for N levels, then randomly pick another. */
    rotateStyles = true;
    levelsBeforeSwap = 5;
    buryBones = true;
    /** Withdraw and fight with a Bronze dagger only (skips sword / steel upgrade). */
    useBronzeDagger = false;
    /** Chosen rs2b0t Loadouts-panel kit; blank keeps this script's own gear. */
    loadoutName = LOADOUT_NONE;
    desiredStyle = 'attack';
    fixedStyle = 'attack';
    /** Base level of desiredStyle when we committed to this training segment. */
    styleLevelAnchor = 1;

    startedAt = 0;
    xpAtStart = Object.create(null);
    /** @type {Set<string>} */
    usedSkills = new Set();
    styleFails = 0;
    styleRetryAt = 0;
    cantReach = false;
    buried = 0;
    underAttackSince = 0;
    /** @type {number} */
    lastAttackerIndex = -1;
    retaliatingIndex = -1;
    retaliateClickedAt = 0;
    /** NPC index we are / were fighting — used to claim own-kill bone drops. */
    fightNpcIndex = -1;
    /** @type {InstanceType<typeof Tile> | null} */
    fightNpcTile = null;
    /** @type {InstanceType<typeof Tile> | null} */
    ownBoneLootTile = null;
    ownBoneLootUntil = 0;
    /** Inventory bones from our own loot that we are allowed to bury. */
    ownBonesPending = 0;
    /** When true: oak goblins were crowded — train giant rats for the rest of the run. */
    useRats = false;
    /** Last counted other players fighting goblins (paint / logs). */
    goblinFighters = 0;
    /** @type {ReturnType<typeof setInterval> | null} */
    unlockTimer = null;
    /** True once Steel scimitar is the weapon we should wield. */
    useSteel = false;
    /** True once we leave combat to pickpocket / shop for the scimitar. */
    steelUpgradeStarted = false;
    /** True once we have hit 500gp and started the Zeke trip (toll must not rewind us). */
    steelShopTried = false;
    /** Out of stock: walk back to camp before starting the 10 min train timer. */
    steelAwaitingCamp = false;
    /** Epoch ms when we may retry Zeke; 0 = not waiting. */
    steelRetryAt = 0;
    stunnedUntilTick = 0;
    stunnedUntilMs = 0;
    steals = 0;
    alkGateFree = false;
    /** Skip the toll and walk north of the wall (jammed bots / still raising 500gp). */
    alkAvoidGate = false;

    async onStart() {
        await Execution.delayUntil(() => Game.ingame() && Game.tile() !== null, 0);
        Traversal.preload();
        this.startPausedPrefUnlock();

        this.syncPrefs({ silent: true });
        if (this.rotateStyles) {
            this.desiredStyle = pickRandomStyle(null);
        } else {
            this.desiredStyle = this.fixedStyle;
        }
        this.styleLevelAnchor = Skills.level(this.desiredStyle);

        this.startedAt = Date.now();
        this.xpAtStart = Object.create(null);
        this.usedSkills = new Set();
        this.buried = 0;
        this.gearReady = false;
        this.tutorialCleared = false;
        this.characterLookApplied = false;
        this.underAttackSince = 0;
        this.lastAttackerIndex = -1;
        this.retaliatingIndex = -1;
        this.retaliateClickedAt = 0;
        this.fightNpcIndex = -1;
        this.fightNpcTile = null;
        this.ownBoneLootTile = null;
        this.ownBoneLootUntil = 0;
        this.ownBonesPending = 0;
        this.useRats = false;
        this.goblinFighters = 0;
        this.useSteel = this.skipSteelUpgrade() ? false : hasSteelScimitar();
        this.steelUpgradeStarted = false;
        this.steelShopTried = false;
        this.steelAwaitingCamp = false;
        this.steelRetryAt = 0;
        this.stunnedUntilTick = 0;
        this.stunnedUntilMs = 0;
        this.steals = 0;
        this.alkGateFree = false;
        this.alkAvoidGate = false;
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
                this.log(`died (#${this.deaths}) — waiting for respawn`);
            }
            if (STUN_RE.test(e.text)) {
                this.stunnedUntilTick =
                    typeof Game.tick === 'function' ? Game.tick() + STUN_TICKS : 0;
                this.stunnedUntilMs = Date.now() + STUN_TICKS * 600;
            }
        });

        this.on('skill.xp', e => {
            if (COMBAT_TRACK.includes(e.name)) {
                this.usedSkills.add(e.name);
            }
        });

        this.on('skill.level', e => {
            if (TRAINABLE.includes(e.name)) {
                this.log(`${e.name} level ${e.previous} → ${e.level}`);
            }
        });

        this.log(
            this.rotateStyles
                ? `started — rotate styles (swap every ${this.levelsBeforeSwap} lvl); training ${this.desiredStyle}`
                : `started — fixed style ${this.desiredStyle}`
        );
        this.log(
            `camp oak ${OAK_TREE.x},${OAK_TREE.z} · radius ${CAMP_RADIUS} · ` +
                `if >${GOBLIN_FIGHTER_THRESHOLD} players fighting goblins → rats ${RAT_CAMP.x},${RAT_CAMP.z} · ` +
                `bury bones: ${this.buryBones ? 'own kills only' : 'off'}`
        );
        this.log(this.gearModeLog());
        if (!this.skipSteelUpgrade()) {
            this.log(
                `at Attack ${STEEL_ATK_NEED} / Hitpoints ${STEEL_HP_NEED}: pickpocket Men to ${GP_TARGET}gp ` +
                    `(wait if HP < ${PICKPOCKET_MIN_HP}) → Al-Kharid toll → Zeke Steel scimitar`
            );
            if (this.useSteel) {
                this.log('Steel scimitar already held — will wield it instead of Bronze sword');
            }
        }
        if (isOnTutorialIsland() || isCharacterCreationOpen() || findRuneScapeGuide()) {
            this.log(
                'Tutorial Island / character creation detected — randomize look → Accept → Guide → skip'
            );
            this.status = 'tutorial';
        } else {
            this.tutorialCleared = true;
            this.status = 'find bank';
        }
        this.log('tip: Pause → Edit parameters to change prefs without stopping');
    }

    onPause() {
        unlockPausedPrefsUi();
    }

    onResume() {
        this.syncPrefs({ silent: false });
    }

    /**
     * Tutorial Island / character creation:
     * 1) Randomize player design, then Accept
     * 2) Talk to RuneScape Guide
     * 3) Choose "Yes please." to skip (dev/private servers)
     * Then mark cleared and let normal bank/gear flow run.
     * @returns {Promise<boolean>} true if this loop spent time on tutorial
     */
    async handleTutorialIsland() {
        // Already off the island with no design UI — commence normal script.
        if (
            !isCharacterCreationOpen() &&
            !isOnTutorialIsland() &&
            !findRuneScapeGuide() &&
            !(
                typeof ChatDialog !== 'undefined' &&
                ChatDialog &&
                (ChatDialog.canContinue() ||
                    (typeof ChatDialog.isOpen === 'function' && ChatDialog.isOpen()))
            )
        ) {
            this.tutorialCleared = true;
            this.log('tutorial cleared — commencing normal script');
            this.status = 'find bank';
            return false;
        }

        if (isCharacterCreationOpen()) {
            return await this.handleCharacterCreation();
        }

        if (typeof ChatDialog !== 'undefined' && ChatDialog) {
            if (ChatDialog.canContinue()) {
                this.status = 'tutorial: continue';
                await ChatDialog.continue();
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
                const pick = pickTutorialSkipOption(opts);
                this.status = 'tutorial: skip option';
                this.log(
                    `tutorial dialog: [${opts.join(' | ')}] → ${pick ?? 'none'}`
                );
                if (pick) {
                    await ChatDialog.chooseOption(pick);
                } else {
                    await ChatDialog.chooseOption();
                }
                await Execution.delayTicks(2);
                return true;
            }
        }

        if (isOnTutorialIsland() || findRuneScapeGuide()) {
            const guide = findRuneScapeGuide();
            if (!guide) {
                this.status = 'tutorial: find guide';
                this.log('waiting for RuneScape Guide');
                await Execution.delayTicks(3);
                return true;
            }

            const talk =
                guide.actions().find(a => /talk/i.test(a ?? '')) ?? 'Talk-to';
            this.status = 'tutorial: talk to guide';
            this.log(`Talk-to ${GUIDE_NAME} — skip tutorial`);
            await guide.interact(talk);
            await Execution.delayUntil(
                () =>
                    (typeof ChatDialog !== 'undefined' &&
                        ChatDialog &&
                        (ChatDialog.canContinue() ||
                            (typeof ChatDialog.isOpen === 'function' &&
                                ChatDialog.isOpen()))) ||
                    !isOnTutorialIsland(),
                8000
            );
            return true;
        }

        // Fallback: something odd — wait then re-check.
        await Execution.delayTicks(2);
        return true;
    }

    /**
     * First action on a new account: randomize the design screen, then Accept.
     * @returns {Promise<boolean>} true if this loop spent time on character creation
     */
    async handleCharacterCreation() {
        if (!isCharacterCreationOpen()) {
            return false;
        }
        if (!this.characterLookApplied) {
            this.status = 'tutorial: randomize look';
            const look = randomizeCharacterLook();
            this.characterLookApplied = true;
            this.log(`character creation — randomized ${look.female ? 'female' : 'male'} look`);
        }
        this.status = 'tutorial: accept design';
        this.log('character creation — clicking Accept');
        if (await acceptCharacterCreation()) {
            this.log('accepted character design');
        } else {
            this.log('could not click Accept — retrying');
            await Execution.delayTicks(2);
        }
        return true;
    }

    async loop() {
        this.syncPrefs({ silent: false });

        if (!Game.ingame()) {
            await Execution.delayTicks(5);
            return;
        }

        // New accounts: randomize appearance before welcome / tutorial / combat.
        if (await this.handleCharacterCreation()) {
            return;
        }

        if (await dismissWelcomeScreen()) {
            this.status = 'close welcome';
            return;
        }

        // Fresh accounts: character design → RuneScape Guide → skip tutorial → Lumbridge.
        if (!this.tutorialCleared) {
            if (await this.handleTutorialIsland()) {
                return;
            }
        }

        if (this.recovering) {
            await this.recover();
            return;
        }

        // First priority after login/respawn gear loss: find a bank and kit up.
        if (!this.gearReady) {
            if (await this.prepCombatGear()) {
                return;
            }
        }

        if (this.skipSteelUpgrade()) {
            if (this.steelUpgradeStarted) {
                this.steelUpgradeStarted = false;
                this.steelShopTried = false;
                this.steelAwaitingCamp = false;
                this.steelRetryAt = 0;
            }
        } else if (await this.handleSteelUpgrade()) {
            return;
        }

        if (typeof ChatDialog !== 'undefined' && ChatDialog) {
            if (ChatDialog.canContinue()) {
                this.status = 'continue dialog';
                await ChatDialog.continue();
                return;
            }
            if (
                typeof ChatDialog.isOpen === 'function' &&
                ChatDialog.isOpen() &&
                typeof ChatDialog.options === 'function' &&
                ChatDialog.options().length > 0 &&
                typeof ChatDialog.chooseOption === 'function'
            ) {
                this.status = 'dialog option';
                await ChatDialog.chooseOption();
                return;
            }
        }

        if (await this.handleDropJunk()) {
            return;
        }

        if (await this.prepCombatGear()) {
            return;
        }

        if (await this.ensureCombatStyle()) {
            return;
        }

        if (await this.ensureStatsTab()) {
            return;
        }

        this.refreshOwnKillLoot();

        if (await this.handleBones()) {
            return;
        }

        const here = Game.tile();
        if (!here) {
            await Execution.delayTicks(2);
            return;
        }

        if (await this.ensureRetaliate()) {
            return;
        }

        // Finish the current fight before hopping camps.
        if (Game.inCombat()) {
            const onMe = this.findTargetFightingMe();
            if (onMe) {
                this.noteFightTarget(onMe);
                this.status = 'in combat';
                await Execution.delayTicks(2);
                return;
            }
            this.status = 're-engaging';
            this.log('combat interrupted (e.g. random event) — re-engaging');
        }

        this.refreshCampChoice();
        const anchor = this.campAnchor();
        const radius = this.campRadius();

        if (Tile.from(here).distanceTo(anchor) > radius) {
            this.status = this.useRats ? 'walking to rats' : 'walking to goblins';
            this.log(
                this.useRats
                    ? `walking to giant rats ${anchor.x},${anchor.z}`
                    : `walking to goblin camp oak ${anchor.x},${anchor.z}`
            );
            const ok = await this.walkViaAlkharidGate(anchor, 4);
            if (!ok) {
                this.log('path to camp failed — retrying');
            }
            return;
        }

        // Re-check crowding once we arrive (scene may have loaded more players/goblins).
        if (!this.useRats) {
            this.refreshCampChoice();
            if (this.useRats) {
                return;
            }
        }

        if (!this.useRats && (await this.ensureHouseDoorOpen())) {
            return;
        }

        const target = this.findAttackableTarget();
        if (!target) {
            this.status = this.useRats ? 'waiting for giant rat' : 'waiting for goblin';
            const idleRadius = this.useRats
                ? Math.min(8, Math.floor(RAT_CAMP_RADIUS / 2))
                : 2;
            await Traversal.walkTo(anchor, {
                radius: idleRadius,
                timeoutMs: 8_000
            });
            await Execution.delayTicks(2);
            return;
        }

        await this.attackTarget(target);
    }

    onStop() {
        this.stopPausedPrefUnlock();
        this.log(
            `stopped — ${this.attacks} attacks, ${this.deaths} deaths` +
                (this.buryBones ? `, ${this.buried} buried` : '') +
                ` (${this.status})`
        );
    }

    onPaint(ctx) {
        const elapsed = Date.now() - this.startedAt;
        const lines = [
            `Benzyme's Goblin Killer v${SCRIPT_VERSION}`,
            `time ${fmtElapsed(elapsed)}  ·  ${this.status}`,
            `deaths ${this.deaths}`
        ];

        if (this.buryBones) {
            lines.push(
                `bury own bones · buried ${this.buried}` +
                    (this.ownBonesPending > 0 ? ` · pending ${this.ownBonesPending}` : '')
            );
        }

        if (this.useRats) {
            lines.push(
                `camp rats ${RAT_CAMP.x},${RAT_CAMP.z} r${RAT_CAMP_RADIUS} · left goblins (${this.goblinFighters} fighters)`
            );
        } else {
            lines.push(
                `camp oak ${OAK_TREE.x},${OAK_TREE.z} · goblin fighters ${this.goblinFighters} (rats if >${GOBLIN_FIGHTER_THRESHOLD})`
            );
        }

        if (this.rotateStyles) {
            const gained = Skills.level(this.desiredStyle) - this.styleLevelAnchor;
            lines.push(
                `rotate · ${gained}/${this.levelsBeforeSwap} lv on ${this.desiredStyle}`
            );
        }

        lines.push(`Currently training ${this.desiredStyle.toUpperCase()}`);

        const hrs = elapsed / 3_600_000;
        for (const skill of COMBAT_TRACK) {
            if (!this.usedSkills.has(skill)) {
                continue;
            }
            const gained = Math.max(0, Skills.xp(skill) - (this.xpAtStart[skill] ?? 0));
            const xph = hrs > 0.0005 ? gained / hrs : 0;
            lines.push(`${skill}: ${fmtXph(xph)} xp/hr  (+${Math.round(gained)} xp)`);
        }

        lines.push(this.paintGearLine());
        if (this.steelAwaitingCamp || Date.now() < this.steelRetryAt) {
            const left = Math.max(0, this.steelRetryAt - Date.now());
            lines.push(
                this.steelAwaitingCamp && left <= 0
                    ? 'Zeke out of stock · walking back to train 10 min'
                    : `Zeke out of stock · train ${fmtElapsed(left)} then retry`
            );
        } else if (this.steelUpgradeStarted && !this.useSteel) {
            lines.push(
                `steel upgrade · ${invCoins()}/${GP_TARGET}gp · HP ${currentHp()} (min ${PICKPOCKET_MIN_HP})`
            );
        }

        ctx.font = '12px monospace';
        let maxW = 0;
        for (const line of lines) {
            maxW = Math.max(maxW, ctx.measureText(line).width);
        }
        const pad = 6;
        const lineH = 16;
        const boxH = pad * 2 + lines.length * lineH;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(6, 6, maxW + pad * 2, boxH);
        lines.forEach((line, i) => {
            const isCaution = i === lines.length - 1;
            ctx.fillStyle = isCaution ? '#e8b84a' : '#9dce6a';
            ctx.fillText(line, 6 + pad, 6 + pad + (i + 1) * lineH - 4);
        });
    }

    /**
     * Live-read Combat prefs from SettingsStore storage (panel saves there).
     * Host snapshots this.settings only at Start — we re-read so Pause edits apply.
     */
    syncPrefs(opts = {}) {
        const silent = opts.silent === true;
        const prevRotate = this.rotateStyles;
        const prevLevels = this.levelsBeforeSwap;
        const prevFixed = this.fixedStyle;
        const prevBury = this.buryBones;
        const prevDagger = this.useBronzeDagger;
        const prevLoadout = this.loadoutName;

        this.rotateStyles = readPrefBool('rotateStyles', this.settings.bool('rotateStyles', true));
        this.buryBones = readPrefBool('buryBones', this.settings.bool('buryBones', true));
        this.useBronzeDagger = readPrefBool(
            'useBronzeDagger',
            this.settings.bool('useBronzeDagger', false)
        );
        this.loadoutName = readPrefStr('loadout', this.settings.str('loadout', LOADOUT_NONE));
        this.levelsBeforeSwap = clampLevels(
            readPrefNum('levelsBeforeSwap', this.settings.num('levelsBeforeSwap', 5))
        );
        let fixed = readPrefStr('meleeStyle', this.settings.str('meleeStyle', 'attack')).toLowerCase();
        if (!TRAINABLE.includes(fixed)) {
            fixed = 'attack';
        }
        this.fixedStyle = fixed;

        if (!silent && this.buryBones !== prevBury) {
            this.log(`prefs: bury bones → ${this.buryBones ? 'on' : 'off'}`);
        }

        if (this.useBronzeDagger !== prevDagger || this.loadoutName !== prevLoadout) {
            if (this.useBronzeDagger) {
                this.useSteel = false;
            }
            this.gearReady = false;
            if (!silent) {
                this.log(`prefs: ${this.gearModeLog()} — will re-kit at the bank`);
            }
        }

        if (this.rotateStyles !== prevRotate) {
            if (this.rotateStyles) {
                this.desiredStyle = pickRandomStyle(null);
                this.styleLevelAnchor = Skills.level(this.desiredStyle);
                if (!silent) {
                    this.log(`prefs: rotate styles ON → training ${this.desiredStyle}`);
                }
            } else {
                this.desiredStyle = this.fixedStyle;
                this.styleLevelAnchor = Skills.level(this.desiredStyle);
                if (!silent) {
                    this.log(`prefs: rotate styles OFF → fixed ${this.desiredStyle}`);
                }
            }
            return;
        }

        if (!this.rotateStyles && this.fixedStyle !== prevFixed) {
            this.desiredStyle = this.fixedStyle;
            this.styleLevelAnchor = Skills.level(this.desiredStyle);
            if (!silent) {
                this.log(`prefs: melee style → ${this.desiredStyle}`);
            }
            return;
        }

        if (this.levelsBeforeSwap !== prevLevels && !silent) {
            this.log(`prefs: levels before random swap → ${this.levelsBeforeSwap}`);
        }
    }

    campAnchor() {
        return this.useRats ? RAT_CAMP : OAK_TREE;
    }

    campRadius() {
        return this.useRats ? RAT_CAMP_RADIUS : CAMP_RADIUS;
    }

    inActiveCamp(tile, radius = this.campRadius()) {
        if (!tile) {
            return false;
        }
        return Tile.from(tile).distanceTo(this.campAnchor()) <= radius;
    }

    /**
     * If more than 5 other players are fighting goblins at oak, latch onto giant rats.
     * Does not hop while we are still in a fight.
     */
    refreshCampChoice() {
        if (this.useRats) {
            return;
        }
        const fighters = charactersFightingGoblins();
        this.goblinFighters = fighters;
        if (Game.inCombat() || this.findTargetFightingMe()) {
            return;
        }
        if (fighters > GOBLIN_FIGHTER_THRESHOLD) {
            this.useRats = true;
            this.log(
                `${fighters} players fighting goblins (>${GOBLIN_FIGHTER_THRESHOLD}) — ` +
                    `moving to giant rats ${RAT_CAMP.x},${RAT_CAMP.z}`
            );
        }
    }

    async attackTarget(npc) {
        const index = npc.index;
        const targetTile = npc.tile();
        const name = npc.name ?? 'NPC';

        this.status = `attacking ${name} (${npc.distance()}t)`;
        this.log(`attacking ${name} @ ${targetTile.x},${targetTile.z}`);
        this.cantReach = false;
        this.noteFightTarget(npc);
        await npc.interact('Attack');
        this.noteRetaliateClick(npc.index);
        await Execution.delayUntil(
            () => Game.inCombat() || this.cantReach || this.findTargetFightingMe() !== null,
            4000
        );

        if (Game.inCombat() || this.findTargetFightingMe()) {
            const fighting = this.findTargetFightingMe() ?? npc;
            this.noteFightTarget(fighting);
            this.attacks++;
            return;
        }

        if (!this.cantReach) {
            return;
        }

        this.log("can't reach that — opening door then retrying");
        this.status = 'opening door';
        const opened = await this.openDoorToward(targetTile);
        if (!opened) {
            this.log(`no shut door found toward that ${name}`);
            return;
        }

        const again =
            Npcs.query()
                .where(n => n.index === index)
                .nearest() ?? this.findAttackableTarget();

        if (!again) {
            // Target gone after door open — likely died / despawned; claim bone tile if we had one.
            this.refreshOwnKillLoot();
            this.log(`${name} gone after opening door`);
            return;
        }

        this.status = `retry attack (${again.distance()}t)`;
        this.log(`retrying ${again.name ?? name} @ ${again.tile().x},${again.tile().z}`);
        this.cantReach = false;
        this.noteFightTarget(again);
        await again.interact('Attack');
        this.noteRetaliateClick(again.index);
        if (
            await Execution.delayUntil(
                () => Game.inCombat() || this.cantReach || this.findTargetFightingMe() !== null,
                4000
            )
        ) {
            if (Game.inCombat() || this.findTargetFightingMe()) {
                const fighting = this.findTargetFightingMe() ?? again;
                this.noteFightTarget(fighting);
                this.attacks++;
            }
        }
    }

    noteFightTarget(npc) {
        if (!npc) {
            return;
        }
        this.fightNpcIndex = npc.index;
        const t = npc.tile?.() ?? null;
        if (t) {
            this.fightNpcTile = Tile.from(t);
        }
    }

    /**
     * When the NPC we were fighting despawns, treat last tile as our kill drop spot
     * so we only loot / bury those bones — never random camp piles.
     */
    refreshOwnKillLoot() {
        if (this.fightNpcIndex < 0) {
            return;
        }
        const still = Npcs.query()
            .where(n => n.index === this.fightNpcIndex)
            .nearest();
        if (still) {
            const t = still.tile?.() ?? null;
            if (t) {
                this.fightNpcTile = Tile.from(t);
            }
            return;
        }
        if (this.fightNpcTile) {
            this.ownBoneLootTile = this.fightNpcTile;
            this.ownBoneLootUntil = Date.now() + OWN_BONE_LOOT_MS;
            this.log(
                `own kill @ ${this.ownBoneLootTile.x},${this.ownBoneLootTile.z} — loot bones only there`
            );
        }
        this.fightNpcIndex = -1;
        this.fightNpcTile = null;
    }

    noteRetaliateClick(index) {
        this.retaliatingIndex = index;
        this.retaliateClickedAt = Date.now();
        this.underAttackSince = 0;
        this.lastAttackerIndex = index;
    }

    findNpcAttackingMe() {
        const range = this.campRadius() + 12;
        const targeting = Npcs.query()
            .within(range)
            .where(n => hasAttackOp(n))
            .where(n => npcTargetsMe(n))
            .nearest();
        if (targeting) {
            return targeting;
        }

        const sticky = Npcs.query()
            .within(4)
            .where(n => hasAttackOp(n))
            .where(n => n.inCombat && !npcTargetsAnother(n))
            .nearest();
        if (sticky) {
            return sticky;
        }

        return null;
    }

    async ensureRetaliate() {
        const attacker = this.findNpcAttackingMe();
        if (!attacker) {
            this.underAttackSince = 0;
            this.lastAttackerIndex = -1;
            return false;
        }

        if (
            attacker.index === this.retaliatingIndex &&
            Date.now() - this.retaliateClickedAt < 12_000
        ) {
            this.underAttackSince = 0;
            this.lastAttackerIndex = attacker.index;
            return false;
        }

        if (attacker.index !== this.lastAttackerIndex || this.underAttackSince === 0) {
            this.lastAttackerIndex = attacker.index;
            this.underAttackSince = Date.now();
            return false;
        }

        const waited = Date.now() - this.underAttackSince;
        if (waited < 5000) {
            return false;
        }

        const name = attacker.name ?? 'NPC';
        this.status = `retaliating (${name})`;
        this.log(
            `${name} attacking for ${Math.round(waited / 1000)}s without retaliate — clicking Attack`
        );
        this.cantReach = false;
        await attacker.interact('Attack');
        this.noteFightTarget(attacker);
        this.noteRetaliateClick(attacker.index);
        await Execution.delayUntil(
            () => Game.animating() || Game.inCombat() || this.cantReach,
            3000
        );
        this.attacks++;
        return true;
    }

    findTargetFightingMe() {
        const r = this.campRadius();
        if (this.useRats) {
            return (
                Npcs.query()
                    .name(RAT_NPC_NAME)
                    .within(r + 6)
                    .where(n => this.inActiveCamp(n.tile(), r + 2))
                    .where(n => npcTargetsMe(n))
                    .nearest() ??
                Npcs.query()
                    .within(r + 6)
                    .where(n => isGiantRatNpc(n))
                    .where(n => this.inActiveCamp(n.tile(), r + 2))
                    .where(n => npcTargetsMe(n))
                    .nearest() ??
                null
            );
        }
        return (
            Npcs.query()
                .name(GOBLIN_NPC_NAME)
                .within(r + 6)
                .where(n => this.inActiveCamp(n.tile(), r + 2))
                .where(n => npcTargetsMe(n))
                .nearest() ??
            Npcs.query()
                .within(r + 6)
                .where(n => isGoblinNpc(n))
                .where(n => this.inActiveCamp(n.tile(), r + 2))
                .where(n => npcTargetsMe(n))
                .nearest() ??
            null
        );
    }

    /**
     * Prefer a target already on us, else an idle NPC in the active camp.
     * Oak goblins by default; giant rats after the goblin camp is crowded.
     */
    findAttackableTarget() {
        const onMe = this.findTargetFightingMe();
        if (onMe) {
            return onMe;
        }

        const r = this.campRadius();
        if (this.useRats) {
            return (
                Npcs.query()
                    .name(RAT_NPC_NAME)
                    .action('Attack')
                    .within(r + 4)
                    .where(n => this.inActiveCamp(n.tile()))
                    .where(n => !n.inCombat)
                    .nearest() ??
                Npcs.query()
                    .action('Attack')
                    .within(r + 4)
                    .where(n => isGiantRatNpc(n))
                    .where(n => this.inActiveCamp(n.tile()))
                    .where(n => !n.inCombat)
                    .nearest() ??
                null
            );
        }

        return (
            Npcs.query()
                .name(GOBLIN_NPC_NAME)
                .action('Attack')
                .within(r + 4)
                .where(n => this.inActiveCamp(n.tile()))
                .where(n => !n.inCombat)
                .nearest() ??
            Npcs.query()
                .action('Attack')
                .within(r + 4)
                .where(n => isGoblinNpc(n))
                .where(n => this.inActiveCamp(n.tile()))
                .where(n => !n.inCombat)
                .nearest() ??
            null
        );
    }

    /** @deprecated use findTargetFightingMe */
    findGoblinFightingMe() {
        return this.findTargetFightingMe();
    }

    /** @deprecated use findAttackableTarget */
    findAttackableGoblin() {
        return this.findAttackableTarget();
    }

    findShutHouseDoor() {
        return (
            Locs.query()
                .where(l => isShutDoor(l))
                .within(10)
                .where(l => {
                    const t = l.tile();
                    return (
                        Math.abs(t.x - HOUSE_DOOR.x) <= 1 &&
                        Math.abs(t.z - HOUSE_DOOR.z) <= 1 &&
                        (t.level ?? 0) === (HOUSE_DOOR.level ?? 0)
                    );
                })
                .nearest() ?? null
        );
    }

    /**
     * If the house door is shut while we're at the oak camp, open it.
     * @returns {Promise<boolean>} true if this loop spent time on the door
     */
    async ensureHouseDoorOpen() {
        const shut = this.findShutHouseDoor();
        if (!shut) {
            return false;
        }
        this.status = 'opening house door';
        this.log('house door shut — opening');
        await this.openDoorToward(HOUSE_DOOR, shut);
        return true;
    }

    findShutDoorToward(toward) {
        const here = Game.tile();
        if (!here) {
            return null;
        }
        return (
            Locs.query()
                .where(l => isShutDoor(l))
                .within(8)
                .where(l => towardDest(l.tile(), here, toward))
                .nearest() ??
            Locs.query().where(l => isShutDoor(l)).within(6).nearest()
        );
    }

    async openDoorToward(toward, knownDoor = null) {
        const here = Game.tile();
        if (!here) {
            return false;
        }

        const door = knownDoor ?? this.findShutDoorToward(toward);
        if (!door) {
            return false;
        }

        const t = door.tile();
        if (cheb(here, t) > 1) {
            this.log(`walking to ${door.name} at ${t.x},${t.z}`);
            await Traversal.walkTo(t, { radius: 1, timeoutMs: 15_000 });
        }

        const shut = Locs.query()
            .where(l => l.tile().x === t.x && l.tile().z === t.z && isShutDoor(l))
            .nearest();
        if (!shut) {
            return true;
        }

        const op = openDoorOp(shut);
        if (!op) {
            return false;
        }

        this.log(`opening ${shut.name} at ${t.x},${t.z}`);
        if (!(await shut.interact(op))) {
            return false;
        }

        return Execution.delayUntil(() => {
            const still = Locs.query()
                .where(l => l.tile().x === t.x && l.tile().z === t.z && isShutDoor(l))
                .nearest();
            return still === null;
        }, 5000);
    }

    async handleDropJunk() {
        const keep = new Set(
            [...this.gearItems(), ...this.carryEntries().map(e => e.item), this.weaponName()]
                .filter(Boolean)
                .map(n => n.toLowerCase())
        );
        const item =
            Inventory.items().find(i => {
                const n = (i.name ?? '').toLowerCase();
                if (!n || keep.has(n)) {
                    return false;
                }
                if (n === 'kebab' || n === 'casket' || n.includes('casket')) {
                    return true;
                }
                return n === 'beer' || (n.includes('beer') && !n.includes('keg'));
            }) ?? null;

        if (!item) {
            return false;
        }

        const name = item.name ?? 'junk';
        this.status = `drop ${name}`;
        this.log(`dropping ${name}`);
        const before = Inventory.used();
        await item.interact('Drop');
        await Execution.delayUntil(() => Inventory.used() < before, 4000);
        return true;
    }

    async ensureStatsTab() {
        if (typeof Game.openSideTab !== 'function') {
            return false;
        }
        const reader = clientReader();
        if (reader && typeof reader.activeSideTab === 'function') {
            if (reader.activeSideTab() === STATS_TAB) {
                return false;
            }
        }
        this.status = 'open stats';
        const ok = await Game.openSideTab(STATS_TAB);
        if (ok) {
            this.log('stats tab open');
        }
        return true;
    }

    /**
     * Bury inventory bones from our own kills only.
     * Ground loot is limited to the last kill tile window — never scoop other players' piles.
     */
    async handleBones() {
        if (!this.buryBones || Game.inCombat()) {
            return false;
        }

        const bones = Inventory.first('Bones');
        if (bones) {
            if (this.ownBonesPending <= 0) {
                // Foreign / leftover bones — drop instead of burying Prayer XP we didn't earn.
                this.status = 'drop foreign bones';
                this.log('dropping bones not from our kill');
                const before = Inventory.used();
                await bones.interact('Drop');
                await Execution.delayUntil(() => Inventory.used() < before, 4000);
                return true;
            }
            this.status = 'burying own bones';
            const before = Inventory.used();
            await bones.interact('Bury');
            if (await Execution.delayUntil(() => Inventory.used() < before, 3000)) {
                this.ownBonesPending = Math.max(0, this.ownBonesPending - 1);
                this.buried++;
                this.log(`buried own bones (#${this.buried})`);
            }
            return true;
        }

        if (Inventory.isFull()) {
            return false;
        }

        if (!this.ownBoneLootTile || Date.now() > this.ownBoneLootUntil) {
            return false;
        }

        const spot = this.ownBoneLootTile;
        const ground = GroundItems.query()
            .name('Bones')
            .within(OWN_BONE_LOOT_RADIUS + 4)
            .where(g => {
                const t = g.tile?.() ?? null;
                return t != null && Tile.from(t).distanceTo(spot) <= OWN_BONE_LOOT_RADIUS;
            })
            .nearest();
        if (!ground) {
            return false;
        }

        this.status = 'looting own bones';
        const before = Inventory.used();
        await ground.interact('Take');
        if (await Execution.delayUntil(() => Inventory.used() > before, 5000)) {
            this.ownBonesPending++;
            this.log(
                `looted own-kill bones @ ${spot.x},${spot.z} (pending ${this.ownBonesPending})`
            );
        }
        return true;
    }

    startPausedPrefUnlock() {
        this.stopPausedPrefUnlock();
        this.unlockTimer = setInterval(unlockPausedPrefsUi, 250);
        unlockPausedPrefsUi();
    }

    stopPausedPrefUnlock() {
        if (this.unlockTimer !== null) {
            clearInterval(this.unlockTimer);
            this.unlockTimer = null;
        }
    }

    /**
     * After N levels on the current style, randomly pick another melee skill.
     * @returns {Promise<boolean>} true if this loop spent time on the style click
     */
    async ensureCombatStyle() {
        if (this.rotateStyles) {
            const cur = Skills.level(this.desiredStyle);
            if (cur >= this.styleLevelAnchor + this.levelsBeforeSwap) {
                const next = pickRandomStyle(this.desiredStyle);
                this.log(
                    `random swap ${this.desiredStyle} → ${next} ` +
                        `(gained ${cur - this.styleLevelAnchor} lv; atk=${Skills.level('attack')} ` +
                        `str=${Skills.level('strength')} def=${Skills.level('defence')})`
                );
                this.desiredStyle = next;
                this.styleLevelAnchor = Skills.level(this.desiredStyle);
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
            this.log('could not set attack style (combat tab not ready?) — retrying in 60s');
        }
        return true;
    }

    async recover() {
        const ready = await Execution.delayUntil(() => Game.ingame() && Game.tile() !== null, 20_000);
        if (!ready) {
            this.log('still waiting for respawn…');
            return;
        }
        await Execution.delayTicks(3);

        const haveGear = this.requiredGearItems().every(
            g => Equipment.contains(g) || Inventory.first(g)
        );
        if (!haveGear) {
            if (this.useSteel && !this.skipSteelUpgrade() && !hasSteelScimitar()) {
                this.useSteel = false;
                this.steelUpgradeStarted = false;
                this.log('Steel scimitar lost on death — bank bronze+shield, then buy steel again');
            }
            this.steelShopTried = false;
            this.steelAwaitingCamp = false;
            this.steelRetryAt = 0;
            this.gearReady = false;
            this.fightNpcIndex = -1;
            this.fightNpcTile = null;
            this.ownBoneLootTile = null;
            this.ownBoneLootUntil = 0;
            this.ownBonesPending = 0;
            this.log('gear missing after death — find bank, re-kit, then back to camp');
            this.recovering = false;
            this.status = 'find bank';
            return;
        }

        this.status = 're-equipping';
        for (const item of this.gearItems()) {
            if (Equipment.contains(item)) {
                continue;
            }
            if (!Inventory.first(item)) {
                if (this.isOptionalGear(item)) {
                    continue;
                }
                this.log(`WARNING: could not equip ${item} — is it in the pack?`);
                continue;
            }
            if (!(await Equipment.equip(item))) {
                this.log(`WARNING: could not equip ${item} — is it in the pack?`);
            } else {
                this.log(`equipped ${item}`);
            }
        }

        this.status = 'returning';
        this.refreshCampChoice();
        const anchor = this.campAnchor();
        this.log(
            this.useRats
                ? `running back to giant rats ${anchor.x},${anchor.z}`
                : 'running back to goblins'
        );
        const ok = await this.walkViaAlkharidGate(anchor, 4);
        if (ok) {
            this.recovering = false;
            this.status = 'fighting';
            this.log(this.useRats ? 'back at giant rats' : 'back at goblins');
        } else {
            this.log('could not reach camp after death — will retry');
        }
    }

    activeLoadout() {
        return resolveLoadout(this.loadoutName);
    }

    skipSteelUpgrade() {
        if (this.useBronzeDagger) {
            return true;
        }
        const weapon = this.activeLoadout()?.worn?.righthand;
        return typeof weapon === 'string' && weapon.trim().length > 0;
    }

    gearModeLog() {
        const loadout = this.activeLoadout();
        if (this.useBronzeDagger && loadout) {
            return `gear: Bronze dagger + loadout '${loadout.name}'`;
        }
        if (this.useBronzeDagger) {
            return `gear: Bronze dagger only (no sword, no shield, no steel upgrade)`;
        }
        if (loadout) {
            return `gear: loadout '${loadout.name}'`;
        }
        return (
            'startup first: skip Tutorial Island if needed → find bank → unequip all → deposit all → ' +
            'withdraw Bronze sword (Wooden shield preferred, not required)'
        );
    }

    paintGearLine() {
        const loadout = this.activeLoadout();
        const extras = this.requiredGearItems().filter(
            n => n.toLowerCase() !== this.weaponName().toLowerCase()
        );
        let line = `GEAR: ${this.weaponName()}`;
        if (extras.length > 0) {
            line += ` + ${extras.join(', ')}`;
        } else if (!loadout && !this.useBronzeDagger) {
            line += hasNamedGear(SHIELD) ? ` + ${SHIELD}` : ` (${SHIELD} optional)`;
        }
        if (loadout) {
            line += ` [${loadout.name}]`;
        }
        if (this.useBronzeDagger) {
            line += ' (dagger).';
        } else if (this.useSteel && !this.skipSteelUpgrade()) {
            line += ' (steel locked in).';
        } else {
            line += '.';
        }
        return line;
    }

    weaponName() {
        if (this.useBronzeDagger) {
            return WEAPON_DAGGER;
        }
        if (!this.skipSteelUpgrade() && this.useSteel) {
            return WEAPON_STEEL;
        }
        const loadoutWeapon = this.activeLoadout()?.worn?.righthand;
        if (typeof loadoutWeapon === 'string' && loadoutWeapon.trim().length > 0) {
            return loadoutWeapon;
        }
        return WEAPON_BRONZE;
    }

    requiredGearItems() {
        const loadout = this.activeLoadout();
        if (loadout) {
            const worn = { ...(loadout.worn ?? {}) };
            if (this.useBronzeDagger) {
                worn.righthand = WEAPON_DAGGER;
            }
            const names = uniqueNames(Object.values(worn));
            return names.length > 0 ? names : [this.weaponName()];
        }
        return [this.weaponName()];
    }

    preferredGearItems() {
        if (this.useBronzeDagger || this.activeLoadout()) {
            return [];
        }
        return [SHIELD];
    }

    carryEntries() {
        const rows = this.activeLoadout()?.carry;
        return Array.isArray(rows) ? rows : [];
    }

    isOptionalGear(item) {
        return this.preferredGearItems().some(g => g.toLowerCase() === item.toLowerCase());
    }

    gearItems() {
        return uniqueNames([...this.requiredGearItems(), ...this.preferredGearItems()]);
    }

    stunned() {
        if (typeof Game.tick === 'function' && this.stunnedUntilTick > 0) {
            return Game.tick() <= this.stunnedUntilTick;
        }
        return this.stunnedUntilMs > 0 && Date.now() < this.stunnedUntilMs;
    }

    hasGearEquipped() {
        return this.requiredGearItems().every(g => Equipment.contains(g));
    }

    hasGearAvailable() {
        return this.requiredGearItems().every(g => hasNamedGear(g));
    }

    /**
     * Open Al Kharid bank. Walks the toll (or the long way around if broke / jammed).
     * @returns {Promise<boolean>}
     */
    async findAndOpenBank() {
        if (Bank.isOpen()) {
            return true;
        }
        this.status = 'find bank';
        this.log('opening Al-Kharid bank for gear prep');
        if (await this.openAlkharidBank()) {
            return true;
        }
        if (typeof Banking !== 'undefined' && Banking && typeof Banking.open === 'function') {
            this.log('booth click missed, trying Banking.open at Al-Kharid');
            return !!(await Banking.open({
                stand: ALKHARID_BANK_STAND,
                boothName: BANK_BOOTH_NAME,
                boothOp: 'Use-quickly',
                destination: {
                    name: 'Al Kharid',
                    tile: ALKHARID_BANK_STAND,
                    access: { name: BANK_BOOTH_NAME, op: 'Use-quickly' }
                },
                log: m => this.log(`  ${m}`)
            }));
        }
        if (typeof Bank.openNearest === 'function') {
            return !!(await Bank.openNearest(BANK_BOOTH_NAME, 'Use-quickly', m => this.log(`  ${m}`)));
        }
        this.log('WARNING: Banking.open unavailable, cannot find a bank');
        return false;
    }

    async openAlkharidBank() {
        const here = Game.tile();
        const far = !here || tileDist(here, ALKHARID_BANK_STAND) > 8;
        if (far) {
            this.status = 'walk to Al-Kharid bank';
            this.log(
                `walking to Al-Kharid bank ${ALKHARID_BANK_STAND.x},${ALKHARID_BANK_STAND.z}`
            );
            await this.walkViaAlkharidGate(ALKHARID_BANK_STAND, 2, { allowToll: true });
        }
        let booth = findBankObject(BANK_BOOTH_NAME);
        if (!booth || (typeof booth.distance === 'function' && booth.distance() > 8)) {
            this.log(`no '${BANK_BOOTH_NAME}' at Al-Kharid bank`);
            return false;
        }
        const op = bankObjectOp(booth) ?? 'Use-quickly';
        const t = typeof booth.tile === 'function' ? booth.tile() : ALKHARID_BANK_STAND;
        this.status = `open ${BANK_BOOTH_NAME}`;
        this.log(`${op} ${BANK_BOOTH_NAME} @ ${t.x},${t.z}`);
        if (typeof booth.interact === 'function') {
            await booth.interact(op);
        }
        return !!(await Execution.delayUntil(() => Bank.isOpen(), 8000));
    }

    async withdrawNamedFromOpenBank(item, qty = 1) {
        const want = Math.max(1, Math.floor(Number(qty) || 1));
        let ok = false;
        if (typeof Bank.withdrawX === 'function') {
            ok = !!(await Bank.withdrawX(item, want));
        }
        if (!ok && typeof Bank.withdraw === 'function') {
            ok = !!(await Bank.withdraw(item, want === 1 ? 'Withdraw-1' : 'Withdraw-X'));
        }
        if (!ok && typeof Bank.withdraw === 'function') {
            ok = !!(await Bank.withdraw(item));
        }
        return ok;
    }

    async withdrawMissingGearFromOpenBank() {
        if (!Bank.isOpen()) {
            return this.hasGearAvailable();
        }

        if (typeof Bank.loaded === 'function') {
            await Execution.delayUntil(
                () => Bank.loaded() || (typeof Bank.items === 'function' && Bank.items().length > 0),
                5000
            );
        }
        await Execution.delayTicks(1);

        if (!this.skipSteelUpgrade()) {
            if (Skills.level('attack') >= STEEL_ATK_NEED && !hasSteelScimitar()) {
                if (bankHasItem(WEAPON_STEEL) > 0) {
                    this.status = `gear: withdraw ${WEAPON_STEEL}`;
                    this.log(`gear: withdrawing ${WEAPON_STEEL} (Attack ${Skills.level('attack')})`);
                    await this.withdrawNamedFromOpenBank(WEAPON_STEEL, 1);
                    await Execution.delayUntil(
                        () => !!Inventory.first(WEAPON_STEEL) || Equipment.contains(WEAPON_STEEL),
                        4000
                    );
                    if (hasSteelScimitar()) {
                        this.useSteel = true;
                        this.log(`gear: withdrew ${WEAPON_STEEL} — using as main weapon`);
                    }
                }
            } else if (hasSteelScimitar()) {
                this.useSteel = true;
            }
        } else {
            this.useSteel = false;
        }

        for (const item of this.gearItems()) {
            if (Equipment.contains(item) || Inventory.first(item)) {
                continue;
            }

            const inBank = bankHasItem(item);
            if (inBank <= 0) {
                if (this.isOptionalGear(item)) {
                    this.log(`no ${item} in open bank — continuing without it (preferred, not required)`);
                } else {
                    this.log(`WARNING: no ${item} in open bank`);
                }
                continue;
            }

            this.status = `gear: withdraw ${item}`;
            this.log(`gear: withdrawing ${item}`);
            await this.withdrawNamedFromOpenBank(item, 1);

            await Execution.delayUntil(
                () => !!Inventory.first(item) || Equipment.contains(item),
                4000
            );
            if (!Inventory.first(item) && !Equipment.contains(item)) {
                this.log(`gear: ${item} still missing after withdraw — keep bank open and retry`);
                return false;
            }
            this.log(`gear: withdrew ${item}`);
            await Execution.delayTicks(1);
        }

        await this.withdrawCarryFromOpenBank();

        return this.hasGearAvailable();
    }

    async withdrawCarryFromOpenBank() {
        for (const entry of this.carryEntries()) {
            const item = entry?.item;
            const qty = Math.max(1, Math.floor(Number(entry?.qty) || 1));
            if (typeof item !== 'string' || item.trim().length === 0) {
                continue;
            }
            const have = heldCount(item);
            if (have >= qty) {
                continue;
            }
            const need = qty - have;
            const inBank = bankHasItem(item);
            if (inBank <= 0) {
                this.log(`WARNING: no ${item} in open bank (loadout carry x${qty})`);
                continue;
            }
            const take = Math.min(need, inBank);
            if (typeof Inventory.isFull === 'function' && Inventory.isFull() && have === 0) {
                this.log(`WARNING: inventory full — could not withdraw ${item}`);
                continue;
            }
            this.status = `gear: withdraw ${item} x${take}`;
            this.log(`gear: withdrawing ${item} x${take} (loadout carry)`);
            await this.withdrawNamedFromOpenBank(item, take);
            await Execution.delayUntil(() => heldCount(item) >= Math.min(qty, have + take), 4000);
            this.log(`gear: now holding ${heldCount(item)}x ${item}`);
            await Execution.delayTicks(1);
        }
    }

    async equipGearFromPack() {
        if (!this.skipSteelUpgrade() && hasSteelScimitar()) {
            this.useSteel = true;
        }
        for (const item of this.gearItems()) {
            if (Equipment.contains(item)) {
                continue;
            }
            if (!Inventory.first(item)) {
                continue;
            }
            this.status = `gear: equip ${item}`;
            this.log(`equipping ${item}`);
            if (await Equipment.equip(item)) {
                this.log(`gear: equipped ${item}`);
            } else {
                this.log(`WARNING: could not equip ${item}`);
            }
            await Execution.delayTicks(1);
        }
        return this.hasGearEquipped();
    }

    /** Unequip every worn slot into the pack. */
    async unequipEverything() {
        for (const worn of Equipment.items()) {
            const name = worn.name;
            if (!name) {
                continue;
            }
            this.status = `unequip ${name}`;
            this.log(`gear: unequipping ${name}`);
            if (!(await Equipment.unequip(name))) {
                this.log(`gear: could not unequip ${name}`);
                await Execution.delayTicks(1);
                return false;
            }
            await Execution.delayTicks(1);
        }
        return true;
    }

    /**
     * Startup / re-gear: find bank → unequip all → deposit inventory → withdraw GEAR → equip.
     * @returns {Promise<boolean>} true if this loop spent time on travel/gear
     */
    async prepGearAtBank() {
        // First action: locate a bank and open it (walks there if needed).
        if (!(await this.findAndOpenBank())) {
            this.log('could not find / open a bank — retrying');
            await Execution.delayTicks(3);
            return true;
        }

        if (!(await this.unequipEverything())) {
            return true;
        }

        // Re-open if unequip somehow closed the interface.
        if (!Bank.isOpen() && !(await this.findAndOpenBank())) {
            this.log('bank closed during unequip — retrying');
            await Execution.delayTicks(3);
            return true;
        }

        if (typeof Bank.loaded === 'function') {
            await Execution.delayUntil(
                () => Bank.loaded() || (typeof Bank.items === 'function' && Bank.items().length > 0),
                5000
            );
        }
        await Execution.delayTicks(1);

        this.log('gear: depositing inventory');
        if (typeof Bank.depositInventory === 'function') {
            await Bank.depositInventory();
        } else {
            await Bank.depositAllMatching(() => true);
        }
        await Execution.delayTicks(2);

        await this.withdrawMissingGearFromOpenBank();
        if (Bank.isOpen()) {
            await Bank.close();
            await Execution.delayTicks(1);
        }

        await this.equipGearFromPack();

        if (this.hasGearAvailable()) {
            this.gearReady = true;
            this.status = 'walking to goblins';
            let extra = '';
            if (hasNamedGear(SHIELD)) {
                extra = ` + ${SHIELD}`;
            } else if (!this.useBronzeDagger && !this.activeLoadout()) {
                extra = ` (no ${SHIELD} — fighting without it)`;
            }
            this.log(
                `gear ready — ${this.gearItems().join(' + ') || this.weaponName()}${extra}` +
                    (this.useSteel && !this.skipSteelUpgrade() ? ' (steel)' : '') +
                    '; heading to goblins'
            );
            return false;
        }

        this.log(
            `gear incomplete — need ${this.requiredGearItems().join(', ') || this.weaponName()} in the bank` +
                (this.preferredGearItems().length > 0 ? ` (${SHIELD} is optional)` : '')
        );
        await Execution.delayTicks(5);
        return true;
    }

    /**
     * Startup: find nearest bank, unequip + bank all + withdraw gear. After gearReady,
     * never banks again until death loses gear.
     */
    async prepCombatGear() {
        if (this.gearReady) {
            return await this.ensureGear();
        }
        return await this.prepGearAtBank();
    }

    async ensureGear() {
        if (!this.skipSteelUpgrade() && hasSteelScimitar()) {
            this.useSteel = true;
        }
        let did = false;
        for (const item of this.gearItems()) {
            if (Equipment.contains(item)) {
                continue;
            }
            if (!Inventory.first(item)) {
                if (!this.isOptionalGear(item)) {
                    this.log(`WARNING: ${item} missing mid-fight — bank only after death if lost`);
                }
                continue;
            }
            this.status = `equipping ${item}`;
            if (await Equipment.equip(item)) {
                this.log(`equipped ${item}`);
                did = true;
            }
            await Execution.delayTicks(1);
        }
        return did;
    }

    /**
     * At Attack 5 / Hitpoints 20: pickpocket Lumbridge Men to 500gp (never click
     * below 5 HP), pay the Al-Kharid toll, buy a Steel scimitar from Zeke, wield it.
     * @returns {Promise<boolean>} true if this loop spent time on the upgrade
     */
    async handleSteelUpgrade() {
        if (this.skipSteelUpgrade()) {
            return false;
        }
        if (hasSteelScimitar()) {
            this.useSteel = true;
            if (shopOpen()) {
                await Shop.close();
                return true;
            }
            if (!Equipment.contains(WEAPON_STEEL) && Inventory.first(WEAPON_STEEL)) {
                this.status = `equip ${WEAPON_STEEL}`;
                this.log(`equipping ${WEAPON_STEEL} as main weapon`);
                await Equipment.equip(WEAPON_STEEL);
                await Execution.delayTicks(1);
                return true;
            }
            if (this.steelUpgradeStarted) {
                this.steelUpgradeStarted = false;
                this.steelShopTried = false;
                this.steelAwaitingCamp = false;
                this.steelRetryAt = 0;
                this.log(`${WEAPON_STEEL} equipped — back to goblins`);
            }
            return false;
        }

        if (!reachedSteelUpgradeStats()) {
            return false;
        }

        if (!this.steelUpgradeStarted) {
            if (Game.inCombat() || this.findTargetFightingMe()) {
                return false;
            }
            this.steelUpgradeStarted = true;
            this.log(
                `Attack ${Skills.level('attack')} / Hitpoints ${Skills.level('hitpoints')} — ` +
                    `pickpocket Men to ${GP_TARGET}gp, then Al-Kharid for ${WEAPON_STEEL}`
            );
        }

        if (shopOpen()) {
            if (!this.steelShopTried && invCoins() < GP_TARGET) {
                this.log('shop open before 500gp — closing, pickpocket Lumbridge Men first');
                await Shop.close();
                return true;
            }
            return await this.buySteelAtOpenShop();
        }

        if (await this.handleSteelRestockWait()) {
            return true;
        }
        if (this.waitingOnSteelRestock()) {
            return false;
        }

        if (!this.steelShopTried && invCoins() < GP_TARGET) {
            if (dialogOpen()) {
                const here = Game.tile();
                if (here && tileDist(here, ALK_GATE) <= 14) {
                    this.alkAvoidGate = true;
                    await this.stepGateDialog({ walkAround: true });
                    return true;
                }
                if (typeof ChatDialog.canContinue === 'function' && ChatDialog.canContinue()) {
                    this.status = 'continue dialog';
                    await ChatDialog.continue();
                    return true;
                }
                if (
                    typeof ChatDialog.chooseOption === 'function' &&
                    typeof ChatDialog.options === 'function' &&
                    ChatDialog.options().length > 0
                ) {
                    this.status = 'dialog option';
                    await ChatDialog.chooseOption();
                    return true;
                }
            }
            if (Game.inCombat()) {
                this.status = 'in combat — waiting';
                await Execution.delayTicks(2);
                return true;
            }
            await this.doPickpocketGold();
            return true;
        }

        if (dialogOpen()) {
            const here = Game.tile();
            const nearGate = here && tileDist(here, ALK_GATE) <= 12;
            if (nearGate) {
                await this.stepGateDialog({ walkAround: this.shouldAvoidAlkGate() });
                return true;
            }
            if (typeof ChatDialog.canContinue === 'function' && ChatDialog.canContinue()) {
                this.status = 'continue dialog';
                await ChatDialog.continue();
                return true;
            }
            if (
                typeof ChatDialog.chooseOption === 'function' &&
                typeof ChatDialog.options === 'function' &&
                ChatDialog.options().length > 0
            ) {
                this.status = 'dialog option';
                await ChatDialog.chooseOption();
                return true;
            }
        }

        if (Game.inCombat()) {
            this.status = 'in combat — waiting';
            await Execution.delayTicks(2);
            return true;
        }

        if (invCoins() < this.steelGpNeed()) {
            await this.doPickpocketGold();
            return true;
        }

        return await this.buySteelFromZeke();
    }

    steelGpNeed() {
        return this.steelShopTried ? STEEL_SCIM_COST + ALK_TOLL_GP : GP_TARGET;
    }

    waitingOnSteelRestock() {
        return this.steelAwaitingCamp || Date.now() < this.steelRetryAt;
    }

    /**
     * Walk back to the training camp after Zeke is out of stock, then start
     * the 10 minute train timer once we arrive.
     * @returns {Promise<boolean>} true if this loop spent time walking
     */
    async handleSteelRestockWait() {
        if (this.steelRetryAt > 0 && Date.now() >= this.steelRetryAt && !this.steelAwaitingCamp) {
            this.steelRetryAt = 0;
            this.log('10 min up — returning to Zeke for Steel scimitar');
            return false;
        }
        if (!this.waitingOnSteelRestock()) {
            return false;
        }

        const here = Game.tile();
        if (this.inActiveCamp(here)) {
            if (this.steelAwaitingCamp) {
                this.steelAwaitingCamp = false;
                this.steelRetryAt = Date.now() + STEEL_RESTOCK_MS;
                this.log(
                    `back at camp — training ${Math.round(STEEL_RESTOCK_MS / 60_000)} min, then retry Zeke`
                );
            }
            return false;
        }

        const anchor = this.campAnchor();
        this.status = this.useRats ? 'Zeke OOS — back to rats' : 'Zeke OOS — back to goblins';
        this.log(
            `Zeke out of ${WEAPON_STEEL} — long way / toll back to ${anchor.x},${anchor.z}`
        );
        await this.walkViaAlkharidGate(anchor, 4);
        return true;
    }

    async noteSteelOutOfStock() {
        this.steelShopTried = true;
        this.steelAwaitingCamp = true;
        this.steelRetryAt = 0;
        const stock = steelStockCount();
        this.status = 'Zeke out of stock';
        this.log(
            `Zeke has no ${WEAPON_STEEL} in stock` +
                (stock >= 0 ? ` (${stock})` : '') +
                ' — close shop, pay the toll back, train 10 min, then retry'
        );
        if (shopOpen()) {
            await Shop.close();
            await Execution.delayTicks(1);
        }
        return true;
    }

    async doPickpocketGold() {
        if (currentHp() < PICKPOCKET_MIN_HP) {
            this.status = `HP ${currentHp()} — regen to ${PICKPOCKET_MIN_HP}`;
            await Execution.delayTicks(2);
            return;
        }
        if (this.stunned()) {
            this.status = 'stunned';
            await Execution.delayTicks(1);
            return;
        }

        const here = Game.tile();
        if (!here) {
            await Execution.delayTicks(2);
            return;
        }
        if (Tile.from(here).distanceTo(LUMBY_MEN) > LUMBY_MEN_LEASH) {
            this.status = 'walking to Lumbridge Men';
            this.log(`walking to Lumbridge Men ${LUMBY_MEN.x},${LUMBY_MEN.z} for ${GP_TARGET}gp`);
            if (eastOfAlkGate(here) || tileDist(here, ALK_GATE) <= 14) {
                this.alkAvoidGate = true;
            }
            await this.walkViaAlkharidGate(LUMBY_MEN, 4);
            return;
        }

        const npc = this.findThieveNpc();
        if (!npc) {
            this.status = 'waiting for Man';
            await Traversal.walkTo(LUMBY_MEN, { radius: 3, timeoutMs: 8_000 });
            await this.openNearbyDoor();
            await Execution.delayTicks(2);
            return;
        }
        await this.pickpocket(npc);
    }

    findThieveNpc() {
        return (
            Npcs.query()
                .name('Man')
                .action(PICKPOCKET_OP)
                .where(n => !n.inCombat)
                .nearest() ??
            Npcs.query()
                .action(PICKPOCKET_OP)
                .where(n => /^man$/i.test(n.name ?? ''))
                .where(n => !n.inCombat)
                .nearest() ??
            null
        );
    }

    async pickpocket(npc) {
        const beforeXp = typeof Skills.xp === 'function' ? Skills.xp('thieving') : 0;
        const coinsBefore = invCoins();
        const t = npc.tile();
        this.status = `pickpocket ${npc.name} (${npc.distance()}t) · ${coinsBefore}gp`;
        this.log(
            `Pickpocket ${npc.name} @ ${t.x},${t.z} · ${coinsBefore}gp · HP ${currentHp()}`
        );
        if (!(await npc.interact(PICKPOCKET_OP))) {
            await this.openNearbyDoor();
            await Execution.delayTicks(1);
            return;
        }
        await Execution.delayUntil(
            () =>
                (typeof Skills.xp === 'function' && Skills.xp('thieving') > beforeXp) ||
                this.stunned() ||
                Game.inCombat() ||
                dialogOpen() ||
                invCoins() > coinsBefore,
            4000
        );
        if (
            (typeof Skills.xp === 'function' && Skills.xp('thieving') > beforeXp) ||
            invCoins() > coinsBefore
        ) {
            this.steals++;
            this.log(`steal #${this.steals} — ${invCoins()}/${GP_TARGET}gp`);
        }
    }

    async openNearbyDoor() {
        const door = Locs.query().where(l => isShutDoor(l)).within(6).nearest();
        if (!door) {
            return false;
        }
        const op = openDoorOp(door);
        if (!op) {
            return false;
        }
        this.status = 'opening door';
        this.log(`opening ${door.name}`);
        await door.interact(op);
        await Execution.delayTicks(2);
        return true;
    }

    async buySteelFromZeke() {
        this.steelShopTried = true;
        if (Inventory.isFull() && !Inventory.first(WEAPON_STEEL)) {
            const bones = Inventory.first('Bones');
            if (bones) {
                this.status = 'drop bones for shop';
                this.log('inventory full — dropping bones before Zeke');
                const before = Inventory.used();
                await bones.interact('Drop');
                await Execution.delayUntil(() => Inventory.used() < before, 4000);
                return true;
            }
        }

        const here = Game.tile();
        if (!here) {
            await Execution.delayTicks(2);
            return true;
        }

        if (Tile.from(here).distanceTo(ZEKE_STAND) > 6) {
            this.status = 'walking to Zeke';
            this.log(
                `have ${invCoins()}gp — walking to Zeke ${ZEKE_STAND.x},${ZEKE_STAND.z} for ${WEAPON_STEEL}`
            );
            await this.walkViaAlkharidGate(ZEKE_STAND, 3);
            return true;
        }

        const zeke =
            Npcs.query().name(ZEKE_NAME).within(8).nearest() ??
            Npcs.query()
                .within(10)
                .where(n => /^zeke$/i.test(n.name ?? ''))
                .nearest() ??
            null;
        if (!zeke) {
            this.status = 'finding Zeke';
            this.log('Zeke not in scene — opening nearby door / waiting');
            await this.openNearbyDoor();
            await Execution.delayTicks(3);
            return true;
        }

        this.status = 'open Zeke shop';
        this.log(`Trade ${ZEKE_NAME} for ${WEAPON_STEEL}`);
        let opened = false;
        if (typeof Shop?.open === 'function') {
            opened = !!(await Shop.open(zeke.name ?? ZEKE_NAME));
        }
        if (!opened) {
            const trade =
                (typeof zeke.actions === 'function'
                    ? zeke.actions().find(a => /trade/i.test(a ?? ''))
                    : null) ?? 'Trade';
            opened = !!(await zeke.interact(trade));
            if (opened) {
                await Execution.delayUntil(() => shopOpen() || dialogOpen(), 5000);
            }
        }
        if (shopOpen()) {
            return await this.buySteelAtOpenShop();
        }
        if (dialogOpen()) {
            if (ChatDialog.canContinue()) {
                await ChatDialog.continue();
            } else if (typeof ChatDialog.chooseOption === 'function') {
                await ChatDialog.chooseOption();
            }
            await Execution.delayTicks(2);
            return true;
        }
        this.log('could not open Zeke — retrying');
        await Execution.delayTicks(3);
        return true;
    }

    async buySteelAtOpenShop() {
        if (hasSteelScimitar()) {
            this.useSteel = true;
            if (shopOpen()) {
                await Shop.close();
            }
            return true;
        }
        if (invCoins() < STEEL_SCIM_COST) {
            this.log(
                `Zeke open but only ${invCoins()}gp (need ${STEEL_SCIM_COST}) — closing and pickpocketing`
            );
            await Shop.close();
            return true;
        }

        this.status = `buy ${WEAPON_STEEL}`;
        const stock = steelStockCount();
        if (stock === 0) {
            return await this.noteSteelOutOfStock();
        }

        const before = Inventory.count(WEAPON_STEEL) || (Inventory.first(WEAPON_STEEL) ? 1 : 0);
        const bought = await Shop.buy(WEAPON_STEEL, 1);
        const got = bought > 0 ? bought : Math.max(0, (Inventory.count(WEAPON_STEEL) || 0) - before);

        if (got <= 0 && !hasSteelScimitar()) {
            const after = steelStockCount();
            if (after === 0 || after === -1) {
                return await this.noteSteelOutOfStock();
            }
            this.log(`${WEAPON_STEEL} buy failed (stock ${after}) — retrying`);
            await Execution.delayTicks(3);
            return true;
        }

        this.log(`bought ${WEAPON_STEEL} from Zeke`);
        this.useSteel = true;
        if (shopOpen()) {
            await Shop.close();
        }
        await Execution.delayTicks(1);

        if (!Equipment.contains(WEAPON_STEEL) && Inventory.first(WEAPON_STEEL)) {
            this.status = `wield ${WEAPON_STEEL}`;
            this.log(`wielding ${WEAPON_STEEL} in place of ${WEAPON_BRONZE}`);
            await Equipment.equip(WEAPON_STEEL);
            await Execution.delayTicks(1);
        }
        return true;
    }

    async walkViaAlkharidGate(dest, radius = 4, opts = {}) {
        const here = Game.tile();
        if (!here || !dest) {
            return false;
        }
        const destEast = dest.x >= 3269;
        const onDestSide = destEast ? eastOfAlkGate(here) : westOfAlkGate(here);
        if (onDestSide && (here.level ?? 0) === (dest.level ?? 0)) {
            return !!(await Traversal.walkResilient(dest, {
                radius,
                log: m => this.log(`  ${m}`)
            }));
        }

        if (!opts.allowToll && this.shouldAvoidAlkGate()) {
            return await this.walkAlkAround(dest, radius);
        }

        const pass = await this.passAlkharidGate(destEast);
        if (pass === 'passed') {
            this.alkAvoidGate = false;
            return !!(await Traversal.walkResilient(dest, {
                radius,
                log: m => this.log(`  ${m}`)
            }));
        }

        this.alkAvoidGate = true;
        this.log(`Al-Kharid gate jammed (${pass}) — taking the long way around`);
        return await this.walkAlkAround(dest, radius);
    }

    shouldAvoidAlkGate() {
        if (this.alkAvoidGate) {
            return true;
        }
        if (!this.steelShopTried && invCoins() < GP_TARGET) {
            return true;
        }
        return false;
    }

    /**
     * North of the wall: Al-Kharid 3282,3255 ↔ Lumbridge cows 3255,3275.
     * Used when the toll is jammed or we still need 500gp from courtyard Men.
     */
    async walkAlkAround(dest, radius = 4) {
        const here = Game.tile();
        if (!here || !dest) {
            return false;
        }
        const destEast = dest.x >= 3269;
        const onDestSide = destEast ? eastOfAlkGate(here) : westOfAlkGate(here);
        if (onDestSide) {
            return !!(await Traversal.walkResilient(dest, {
                radius,
                log: m => this.log(`  ${m}`)
            }));
        }

        const nearSide = destEast ? ALK_AROUND_WEST : ALK_AROUND_EAST;
        const farSide = destEast ? ALK_AROUND_EAST : ALK_AROUND_WEST;

        if (
            !destEast &&
            tileDist(here, ALK_GATE) <= 10 &&
            tileDist(here, ALK_PEEL_EAST) > 5 &&
            (here.x ?? 0) < 3280
        ) {
            this.status = 'off the toll pile';
            this.log(
                `peeling off the jammed gate into Al-Kharid ${ALK_PEEL_EAST.x},${ALK_PEEL_EAST.z}`
            );
            await Traversal.walkResilient(ALK_PEEL_EAST, {
                radius: 4,
                attempts: 2,
                timeoutMs: 12_000,
                log: m => this.log(`  ${m}`)
            });
            return false;
        }

        if (tileDist(here, nearSide) > 8 && (here.z ?? 0) < 3250) {
            this.status = 'around Al-Kharid (north)';
            this.log(`leaving the toll — north around the wall ${nearSide.x},${nearSide.z}`);
            await Traversal.walkResilient(nearSide, {
                radius: 6,
                attempts: 2,
                timeoutMs: 20_000,
                log: m => this.log(`  ${m}`)
            });
            return destEast ? eastOfAlkGate(Game.tile()) : westOfAlkGate(Game.tile());
        }

        if (!onDestSide) {
            this.status = destEast ? 'around Al-Kharid (east)' : 'around Al-Kharid (west)';
            this.log(
                `crossing north of the wall ${farSide.x},${farSide.z}`
            );
            await Traversal.walkResilient(farSide, {
                radius: 6,
                attempts: 2,
                timeoutMs: 20_000,
                log: m => this.log(`  ${m}`)
            });
            const now = Game.tile();
            if (!(destEast ? eastOfAlkGate(now) : westOfAlkGate(now))) {
                return false;
            }
        }

        return !!(await Traversal.walkResilient(dest, {
            radius,
            log: m => this.log(`  ${m}`)
        }));
    }

    async stepGateDialog(opts = {}) {
        const walkAround = opts.walkAround === true || this.shouldAvoidAlkGate();
        if (typeof ChatDialog.canContinue === 'function' && ChatDialog.canContinue()) {
            this.status = 'gate dialog';
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
            const optsList = ChatDialog.options();
            const pick = pickGateOption(optsList, walkAround);
            this.status = `gate dialog: ${pick ?? '?'}`;
            this.log(`Al-Kharid gate → ${pick}  [${optsList.join(' | ')}]`);
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

    /**
     * Walk to the toll gate, Open / pay, and wait until we are on the destination side.
     * @param {boolean} goingEast
     * @returns {Promise<'passed' | 'walking' | 'broke' | 'stuck'>}
     */
    async passAlkharidGate(goingEast) {
        const wantEast = goingEast;
        const arrived = () => {
            const t = Game.tile();
            return wantEast ? eastOfAlkGate(t) : westOfAlkGate(t);
        };
        if (arrived()) {
            return 'passed';
        }

        const approach = wantEast ? ALK_GATE_WEST : ALK_GATE_EAST;
        const otherSide = wantEast ? ALK_GATE_EAST : ALK_GATE_WEST;
        if (tileDist(Game.tile(), approach) > 6) {
            this.status = 'walking to Al-Kharid gate';
            this.log(
                `walking to Al-Kharid gate ${approach.x},${approach.z} (${wantEast ? 'east' : 'west'}bound)`
            );
            await Traversal.walkResilient(approach, {
                radius: 3,
                attempts: 2,
                timeoutMs: 12_000,
                log: m => this.log(`  ${m}`)
            });
            if (arrived()) {
                return 'passed';
            }
            if (tileDist(Game.tile(), approach) > 6) {
                return 'walking';
            }
        }
        if (arrived()) {
            return 'passed';
        }

        const coinsBefore = invCoins();
        if (dialogOpen()) {
            for (let i = 0; i < 24 && dialogOpen() && !arrived(); i++) {
                await this.stepGateDialog();
            }
        } else {
            const loc = findAlkharidGateLoc();
            const op = loc ? gateInteractOp(loc) : null;
            const guard = findBorderGuard();
            let started = false;
            if (loc && op) {
                this.log(`${op} ${loc.name ?? 'gate'} @ ${loc.tile().x},${loc.tile().z}`);
                started = !!(await loc.interact(op));
            }
            if (!started && guard) {
                const talk =
                    (typeof guard.actions === 'function'
                        ? guard.actions().find(a => /^talk/i.test(a ?? ''))
                        : null) ?? 'Talk-to';
                this.log(`${talk} ${guard.name ?? 'Border Guard'}`);
                started = !!(await guard.interact(talk));
            }
            if (started) {
                await Execution.delayUntil(() => dialogOpen() || arrived(), 4000);
            }
            for (let i = 0; i < 24 && dialogOpen() && !arrived(); i++) {
                await this.stepGateDialog();
            }
        }

        if (!arrived()) {
            await Traversal.walkTo(otherSide, { radius: 1, timeoutMs: 8_000 });
        }

        if (arrived()) {
            if (invCoins() < coinsBefore) {
                this.log(`paid ${coinsBefore - invCoins()}gp at Al-Kharid gate`);
            } else {
                this.alkGateFree = true;
            }
            return 'passed';
        }

        if (invCoins() < ALK_TOLL_GP && !this.alkGateFree) {
            return 'broke';
        }
        return 'stuck';
    }
}

export default defineBot({
    name: SCRIPT_NAME,
    version: SCRIPT_VERSION_FULL,
    category: 'Combat',
    tags: ['goblin', 'giant-rat', 'lumbridge', 'al-kharid', 'melee', 'thieving', 'scimitar', 'dagger', 'loadout', 'death-recovery', 'xp', 'prayer', 'bank', 'tutorial', 'benzyme'],
    description:
        'Kills Lumbridge oak goblins. Hops to giant rats if more than 5 players fight goblins. Banks at Al Kharid. Optional bronze dagger, loadout, and Steel scimitar upgrade.',
    settingsSchema: {
        useBronzeDagger: {
            type: 'boolean',
            default: false,
            label: 'Bronze dagger only',
            group: 'Gear',
            help:
                'Withdraw and fight with a Bronze dagger only. Skips Bronze sword, Wooden shield, and the Steel scimitar upgrade. A selected loadout still equips its other slots and supplies.'
        },
        loadout: {
            type: 'string',
            default: '',
            options: [],
            optionsFrom: 'loadouts',
            label: 'Loadout',
            group: 'Gear',
            help:
                'Gear and supplies from the rs2b0t Loadouts panel. Leave unset to use this script\'s own kit (Bronze sword + optional Wooden shield, or Bronze dagger if that box is ticked).'
        },
        buryBones: {
            type: 'boolean',
            default: true,
            label: 'Bury own-kill bones',
            group: 'Loot',
            help:
                'Loot Bones only from NPCs you killed (drop tile of your last kill) and bury those for Prayer XP — ignores other players\' piles'
        },
        rotateStyles: {
            type: 'boolean',
            default: true,
            label: 'Rotate melee styles',
            group: 'Combat',
            help: 'Train one Attack / Strength / Defence style, then randomly pick another after N levels'
        },
        levelsBeforeSwap: {
            type: 'number',
            default: 5,
            min: 1,
            max: 20,
            label: 'Levels before random swap',
            group: 'Combat',
            showIf: { key: 'rotateStyles', anyOf: ['true'] },
            help: 'Scroll bar 1–20: levels to gain on the current style before randomly selecting another'
        },
        meleeStyle: {
            type: 'string',
            default: 'attack',
            options: ['attack', 'strength', 'defence'],
            label: 'Melee style',
            group: 'Combat',
            showIf: { key: 'rotateStyles', anyOf: ['false'] },
            help: 'Fixed combat style when rotate is off'
        }
    },
    create: () => new BenzymeGoblinKiller()
});
