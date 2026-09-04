/// <reference path="./dev/rs2b0t-abi.d.ts" />

/**
 * MapleTreeFletcher — chop Maple trees at 2726,3500 (20t leash), bank.
 * If fletching is on: maple shortbows at 50 / maple longbows at 55, then bank those.
 * Knife required to fletch (inventory, else bank). Seers Village: stops if none available.
 * Broken axe: withdraw 1k at Seers, boat Ardougne → Brimhaven → Musa → Port Sarim,
 * walk to Bob in Lumbridge, repair, then boat back and resume chopping.
 * Completely vibe coded by @.benzyme on Discord via Cursor AI
 * Self-contained ESM for rs2b0t Load local script / Load URL.
 */
const SUPPORTED_API_VERSION = 1;
const abi = globalThis.__rs2b0t;
if (!abi) {
    throw new Error('MapleTreeFletcher: globalThis.__rs2b0t missing — load inside rs2b0t bot.html');
}
if (abi.apiVersion !== SUPPORTED_API_VERSION) {
    throw new Error(
        `MapleTreeFletcher: ABI ${abi.apiVersion} != supported ${SUPPORTED_API_VERSION}`
    );
}

const {
    defineBot,
    Execution,
    Game,
    LoopingBot: LoopingBotBase,
    Locs,
    Npcs,
    Inventory,
    Equipment,
    Bank,
    Banking,
    Shop,
    Traversal,
    Tile,
    Skills,
    ChatDialog,
    AXES,
    bestAxe,
    canWieldTool
} = abi;

const SCRIPT_NAME = 'MapleTreeFletcher';
const SCRIPT_TITLE = "Benzyme's Maples";
const SCRIPT_VERSION = '1.4.0';
const FLEET_HEARTBEAT_URL = 'https://benzyme.online/api/fleet/heartbeat';
const FLEET_HEARTBEAT_MS = 8000;

const TITLE_MAPLE = '#c99422';
const MAPLE_TREE_PNG = 'data:image/png;base64,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';
const mapleTreeIcon = typeof Image !== 'undefined' ? new Image() : null;
if (mapleTreeIcon) {
    mapleTreeIcon.src = MAPLE_TREE_PNG;
}

/** Post-login welcome modal interface id (Close Window top-right). */
const WELCOME_SCREEN_ID = 5993;

function welcomeHost() {
    return globalThis.rs2b0t ?? null;
}

/** Ask the host runner to stop this script (same as the Stop button). */
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

/** Maple camp (Seers' Village) — center + walking radius. */
const ANCHOR = new Tile(2726, 3500, 0);
const LEASH = 20;
const TREE_NAME = 'Maple tree';
const LOG_NAME = 'Maple logs';

/** Fletching tier thresholds. */
const SHORTBOW_LEVEL = 50;
const LONGBOW_LEVEL = 55;

/** Bob steel axe / repair (Lumbridge). */
const GEAR_BOB_STAND = new Tile(3231, 3203, 0);
const GEAR_STEEL_AXE = 'Steel axe';
const GEAR_STEEL_COST = 250;
const GEAR_BROKEN_AXE = 'Broken axe';
const GEAR_REPAIR_PREFER = ['repair', 'fix', 'fix my', 'yes'];
/** Rune axe repair plus four 30gp boat legs. Taken from Seers bank. */
const GEAR_REPAIR_COIN_FLOAT = 1000;
const BOAT_LEG_GP = 30;

/** Captain Barnaby, East Ardougne south docks. */
const ARDOUGNE_DOCK = new Tile(2683, 3275, 0);
/** Captain Barnaby / Customs, Brimhaven docks. */
const BRIMHAVEN_DOCK = new Tile(2772, 3227, 0);
/** Customs officer, Musa Point (Karamja → Port Sarim). */
const MUSA_DOCK = new Tile(2956, 3146, 0);
/** Captain Tobias / Seaman Lorris / Seaman Thresnor. */
const PORT_SARIM_DOCK = new Tile(3029, 3217, 0);

const ARDY_SAILORS = ['Captain Barnaby'];
const BRIM_SAILORS = ['Captain Barnaby', 'Customs officer', 'Customs Officer'];
const SARIM_SAILORS = ['Captain Tobias', 'Seaman Lorris', 'Seaman Thresnor'];
const MUSA_SAILORS = ['Customs officer', 'Customs Officer', 'Captain Tobias', 'Seaman Lorris'];

const KARAMJA_DIALOG_PREFER = ['musa point', 'karamja', 'yes please', 'yes'];
const SARIM_RETURN_DIALOG = [
    'port sarim',
    'sarim',
    'search away',
    'nothing to hide',
    'yes please',
    'yes'
];
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
const BOAT_DIALOG_AVOID = [
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
const TALK_OP = 'Talk-to';

/** Keep only Knife plus the axe in use. Broken axe is kept for Bob. */
const KEEP_KNIFE = 'knife';
const KEEP_BROKEN_AXE = 'broken axe';

function fmtXph(n: number) {
    if (n >= 100_000) {
        return `${(n / 1000).toFixed(0)}k`;
    }
    if (n >= 10_000) {
        return `${(n / 1000).toFixed(1)}k`;
    }
    return String(Math.round(n));
}

/** Elapsed session time as H:MM:SS or M:SS. */
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
        const n = welcomeHost()?.reader?.localPlayerName?.();
        if (n) {
            return String(n);
        }
    } catch {
        /* ABI */
    }
    return '';
}

function gearAxeRank(name: string | undefined) {
    const want = (name ?? '').toLowerCase();
    const i = AXES.findIndex(t => t.name.toLowerCase() === want);
    return i < 0 ? 999 : i;
}

function gearHasKnife() {
    return (
        Inventory.count('Knife') > 0 ||
        Inventory.items().some(i => (i.name ?? '').toLowerCase() === 'knife')
    );
}

function gearInvCoins() {
    return Inventory.items()
        .filter(i => (i.name ?? '').toLowerCase() === 'coins')
        .reduce((n, i) => n + Math.max(0, i.count), 0);
}

function gearBankCoins() {
    return Bank.count('Coins') || 0;
}

function gearAxeCount(name: string | undefined) {
    return (Inventory.count(name) || 0) + (Equipment.contains(name) ? 1 : 0);
}

function gearBestHeldAxe() {
    return bestAxe(Skills.level('woodcutting'), n => gearAxeCount(n) > 0);
}

function gearHasSteelOrBetter() {
    const steelRank = gearAxeRank(GEAR_STEEL_AXE);
    for (const t of AXES) {
        if (gearAxeRank(t.name) > steelRank) {
            continue;
        }
        if (gearAxeCount(t.name) > 0) {
            return true;
        }
        if (Bank.isOpen() && (Bank.count(t.name) || 0) > 0) {
            return true;
        }
    }
    return false;
}

function gearHasBrokenAxe() {
    return (
        Equipment.contains(GEAR_BROKEN_AXE) ||
        (Inventory.count(GEAR_BROKEN_AXE) || 0) > 0 ||
        Inventory.items().some(i => (i.name ?? '').toLowerCase() === 'broken axe')
    );
}

function gearPickRepairOption(options: any) {
    for (const p of GEAR_REPAIR_PREFER) {
        const hit = options.find(o => (o ?? '').toLowerCase().includes(p.toLowerCase()));
        if (hit) {
            return hit;
        }
    }
    return options.length > 0 ? options[options.length - 1] : null;
}

async function gearDriveRepairDialog(log: any): Promise<any> {
    for (let i = 0; i < 80; i++) {
        if (!ChatDialog.isOpen() && !ChatDialog.canContinue()) {
            if (!(await Execution.delayUntil(() => ChatDialog.isOpen() || ChatDialog.canContinue(), 1500))) {
                break;
            }
        }
        if (ChatDialog.canContinue()) {
            await ChatDialog.continue();
            await Execution.delayTicks(1);
            continue;
        }
        const opts = typeof ChatDialog.options === 'function' ? ChatDialog.options() : [];
        if (opts.length > 0) {
            const pick = gearPickRepairOption(opts);
            if (!pick) {
                log(`gear: no repair option in [${opts.join(' | ')}]`);
                return false;
            }
            await ChatDialog.chooseOption(pick);
            await Execution.delayTicks(2);
            continue;
        }
        await Execution.delayTicks(1);
    }
    return !ChatDialog.isOpen();
}

async function gearWaitBankLoaded(): Promise<any> {
    if (typeof Bank.loaded === 'function') {
        await Execution.delayUntil(() => Bank.loaded() || Bank.items().length > 0, 3000);
    }
    await Execution.delayTicks(1);
}

function inBox(tile: TileLike | null | undefined, x0: any, z0: any, x1: any, z1: any) {
    if (!tile) {
        return false;
    }
    const x = tile.x;
    const z = tile.z;
    return x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && z >= Math.min(z0, z1) && z <= Math.max(z0, z1);
}

function regionOf(tile: TileLike | null | undefined) {
    if (!tile) {
        return 'unknown';
    }
    if (inBox(tile, 2650, 3360, 2760, 3520)) {
        return 'seers';
    }
    if (inBox(tile, 2755, 3410, 2865, 3465)) {
        return 'catherby';
    }
    if (inBox(tile, 2500, 3260, 2730, 3380)) {
        return 'ardougne';
    }
    if (inBox(tile, 2740, 3140, 2820, 3290)) {
        return 'brimhaven';
    }
    if (inBox(tile, 2880, 3100, 2985, 3200)) {
        return 'musa';
    }
    if (inBox(tile, 3005, 3175, 3060, 3260)) {
        return 'sarim';
    }
    if (inBox(tile, 3185, 3185, 3265, 3265)) {
        return 'lumbridge';
    }
    if (inBox(tile, 2820, 3100, 2985, 3290)) {
        return 'karamja';
    }
    return 'unknown';
}

function onKaramjaIsland(tile = Game.tile()) {
    const r = regionOf(tile);
    return r === 'brimhaven' || r === 'musa' || r === 'karamja';
}

function inArdougneArea(tile = Game.tile()) {
    return regionOf(tile) === 'ardougne';
}

function nearTile(tile: TileLike | null | undefined, dest: TileLike | null | undefined, radius: number) {
    return !!tile && !!dest && Tile.from(tile).distanceTo(dest) <= radius;
}

function nearBob(tile = Game.tile()) {
    return nearTile(tile, GEAR_BOB_STAND, 12);
}

function nearMaples(tile = Game.tile()) {
    return nearTile(tile, ANCHOR, LEASH);
}

/** West of White Wolf: Seers / Ardougne boats beat the mountain walk to Lumbridge. */
function kandarinNeedsBoat(tile = Game.tile()) {
    if (!tile || onKaramjaIsland(tile)) {
        return !!tile && onKaramjaIsland(tile);
    }
    if (inArdougneArea(tile)) {
        return true;
    }
    const r = regionOf(tile);
    if (r === 'seers' || r === 'catherby') {
        return true;
    }
    return tile.x < 2944 && (tile.z ?? 0) < 3520 && (tile.z ?? 0) > 3100;
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

function pickBoatOption(options: any, prefer: any) {
    const prefs = Array.isArray(prefer) ? prefer : [prefer];
    const usable = options.filter(o => {
        const low = (o ?? '').toLowerCase();
        return !BOAT_DIALOG_AVOID.some(a => low.includes(a));
    });
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

function talkOp(npc: Npc | null | undefined) {
    const acts = typeof npc.actions === 'function' ? npc.actions() : [];
    return acts.find(a => /^talk/i.test(a ?? '')) ?? TALK_OP;
}

function chopOp(actions: any) {
    return actions.find(a => /chop/i.test(a)) ?? null;
}

function isKeepTool(name: string | undefined) {
    if (!name) {
        return false;
    }
    const n = name.toLowerCase();
    if (n === KEEP_KNIFE) {
        return true;
    }
    if (n === KEEP_BROKEN_AXE) {
        return true;
    }
    const active = gearBestHeldAxe();
    if (active && n === active.toLowerCase()) {
        return true;
    }
    return false;
}

/** True when inventory/equipment still has knife (if needed) plus a usable or broken axe. */
function hasEssentialsAfterBank(needKnife: any = true) {
    if (needKnife && !gearHasKnife()) {
        return false;
    }
    return gearHasBrokenAxe() || !!gearBestHeldAxe();
}

function normName(name: string | undefined) {
    return (name ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Maple shortbow — "Maple shortbow", "Maple short bow", or (u) / unstrung variants.
 */
function isFletchedShortbow(name: string | undefined) {
    const n = normName(name);
    if (!n.includes('maple')) {
        return false;
    }
    if (!(n.includes('short') && n.includes('bow'))) {
        return false;
    }
    return true;
}

/**
 * Maple longbow — "Maple longbow", "Maple long bow", or (u) / unstrung variants.
 */
function isFletchedLongbow(name: string | undefined) {
    const n = normName(name);
    if (!n.includes('maple')) {
        return false;
    }
    if (!(n.includes('long') && n.includes('bow'))) {
        return false;
    }
    return true;
}

function isBankableBow(name: string | undefined) {
    return isFletchedShortbow(name) || isFletchedLongbow(name);
}

function isMapleLog(name: string | undefined) {
    const n = normName(name);
    return n === 'maple logs' || n === 'maple log';
}

/** Current fletch product for the make-menu + banking phase. */
function fletchPlan(level: number, fletchOn: any = true) {
    if (!fletchOn || level < SHORTBOW_LEVEL) {
        return {
            id: 'logs',
            menuMatch: '',
            label: 'Maple logs (bank)',
            bank: true,
            fletch: false
        };
    }
    if (level < LONGBOW_LEVEL) {
        return {
            id: 'maple-shortbow',
            menuMatch: 'short',
            label: 'Maple shortbow',
            bank: true,
            fletch: true
        };
    }
    return {
        id: 'maple-longbow',
        menuMatch: 'long',
        label: 'Maple longbow',
        bank: true,
        fletch: true
    };
}

function matchMakeProduct(products: any, menuMatch: any) {
    const want = menuMatch.toLowerCase();
    const mapleish = products.filter(p => (p ?? '').toLowerCase().includes('maple'));
    const pool = mapleish.length > 0 ? mapleish : products;
    return pool.find(p => (p ?? '').toLowerCase().includes(want)) ?? null;
}

function logCount() {
    return Inventory.items()
        .filter(i => isMapleLog(i.name))
        .reduce((n, i) => n + Math.max(1, i.count), 0);
}

function knifeItem() {
    return (
        Inventory.items().find(i => (i.name ?? '').toLowerCase().includes('knife')) ?? null
    );
}

function lastLog() {
    const items = Inventory.items();
    for (let i = items.length - 1; i >= 0; i--) {
        if (isMapleLog(items[i].name)) {
            return items[i];
        }
    }
    return null;
}

function bowCount() {
    return Inventory.items()
        .filter(i => isBankableBow(i.name))
        .reduce((n, i) => n + Math.max(1, i.count), 0);
}

function shortbowCount() {
    return Inventory.items()
        .filter(i => isFletchedShortbow(i.name))
        .reduce((n, i) => n + Math.max(1, i.count), 0);
}

/** Bank when no logs left and we have bows/logs to deposit. */
function needsBankTrip(plan: any) {
    if (logCount() > 0 && plan.fletch) {
        return false;
    }
    if (plan.bank && bowCount() > 0) {
        return true;
    }
    // Below 50 (or after fletching): full/leftover maple logs → bank.
    if (!plan.fletch && logCount() > 0 && Inventory.isFull()) {
        return true;
    }
    if (plan.fletch && logCount() === 0 && bowCount() > 0) {
        return true;
    }
    return !plan.fletch && logCount() > 0 && Inventory.isFull();
}

class MapleTreeFletcher extends LoopingBotBase {
    status = 'starting';
    startedAt = 0;
    wcXpAtStart = 0;
    fletchXpAtStart = 0;
    chopped = 0;
    fletched = 0;
    bankTrips = 0;
    planId = 'logs';
    gearReady = false;
    needSteelBuy = false;
    repairTrip: null | 'to_bob' | 'home' = null;
    repairBanked = false;
    fleetId = '';
    fleetTimer: ReturnType<typeof setInterval> | null = null;

    fletchEnabled() {
        return this.settings?.bool('fletchLogs', true) ?? true;
    }

    planAt(level: number) {
        return fletchPlan(level, this.fletchEnabled());
    }

    currentPlan() {
        return this.planAt(Skills.level('fletching'));
    }

    override async onStart(): Promise<void> {
        await Execution.delayUntil(() => Game.ingame() && Game.tile() !== null, 0);
        Traversal.preload();

        this.startedAt = Date.now();
        this.wcXpAtStart = Skills.xp('woodcutting');
        this.fletchXpAtStart = Skills.xp('fletching');
        this.planId = this.currentPlan().id;
        this.gearReady = false;
        this.needSteelBuy = false;
        this.repairTrip = null;
        this.repairBanked = false;
        this.fleetId =
            typeof crypto?.randomUUID === 'function'
                ? crypto.randomUUID()
                : `maple-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.startFleetHeartbeat();

        this.on('skill.level', e => {
            if (e.name === 'fletching') {
                const plan = this.planAt(e.level);
                this.log(`fletching ${e.previous} → ${e.level} — now making ${plan.label}`);
                this.planId = plan.id;
            }
            if (e.name === 'woodcutting') {
                this.log(`woodcutting ${e.previous} → ${e.level}`);
                if (e.previous < 6 && e.level >= 6 && !gearHasSteelOrBetter()) {
                    this.needSteelBuy = true;
                }
            }
        });

        const plan = this.currentPlan();
        this.log(
            `MapleTreeFletcher @ ${ANCHOR.x},${ANCHOR.z} (leash ${LEASH}) — ` +
                (this.fletchEnabled()
                    ? `fletching ${Skills.level('fletching')} → ${plan.label}`
                    : 'banking logs (fletch off)')
        );
        this.status = 'ready';
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

        if (ChatDialog.canContinue()) {
            this.status = 'continue dialog';
            await ChatDialog.continue();
            return;
        }

        if (await this.prepWcGear()) {
            return;
        }

        if (Shop.isOpen()) {
            await Shop.close();
            return;
        }

        if (Bank.isOpen()) {
            await Bank.close();
            return;
        }

        const plan = this.currentPlan();
        this.planId = plan.id;

        if (ChatDialog.isMakeMenu()) {
            if (plan.fletch) {
                await this.chooseMakeProduct(plan);
            }
            return;
        }

        if (plan.fletch && logCount() > 0 && Inventory.isFull()) {
            await this.fletchLogs(plan);
            return;
        }

        if (
            plan.fletch &&
            logCount() > 0 &&
            Game.animating() &&
            bowCount() === 0 &&
            !this.findTreeWithin(2)
        ) {
            this.status = `fletching ${plan.label}`;
            await Execution.delayTicks(1);
            return;
        }

        if (needsBankTrip(plan)) {
            await this.bankProductsAndReturn();
            return;
        }

        // Below 50: bank a full pack of maple logs instead of fletching.
        if (!plan.fletch && Inventory.isFull() && logCount() > 0) {
            await this.bankProductsAndReturn();
            return;
        }

        const here = Game.tile();
        if (!here) {
            await Execution.delayTicks(2);
            return;
        }

        if (Tile.from(here).distanceTo(ANCHOR) > LEASH) {
            if (this.repairTrip) {
                await Execution.delayTicks(1);
                return;
            }
            this.status = 'returning to maples';
            this.log('walking back to maple camp');
            await Traversal.walkResilient(ANCHOR, {
                radius: 4,
                log: m => this.log(`  ${m}`)
            });
            return;
        }

        if (Game.animating()) {
            this.status = 'chopping';
            await Execution.delayTicks(1);
            return;
        }

        const tree = this.findTree();
        if (!tree) {
            this.status = 'waiting for maple';
            await Traversal.walkTo(ANCHOR, { radius: 3, timeoutMs: 10_000 });
            await Execution.delayTicks(2);
            return;
        }

        const op = chopOp(tree.actions());
        if (!op) {
            this.log(`Maple tree has no chop action: [${tree.actions().join(', ')}]`);
            await Execution.delayTicks(2);
            return;
        }

        const before = logCount();
        this.status = `chopping (${tree.distance()}t)`;
        this.log(`chopping Maple tree @ ${tree.tile().x},${tree.tile().z}`);
        await tree.interact(op);
        const gotLog = await Execution.delayUntil(
            () => logCount() > before || Game.animating() || ChatDialog.canContinue(),
            8000
        );
        if (logCount() > before) {
            this.chopped += logCount() - before;
        } else if (gotLog && Game.animating()) {
            await Execution.delayUntil(
                () => logCount() > before || !Game.animating() || ChatDialog.canContinue(),
                20_000
            );
            if (logCount() > before) {
                this.chopped += logCount() - before;
            }
        }
    }

    maybeQueueSteelBuy() {
        if (gearHasSteelOrBetter()) {
            this.needSteelBuy = false;
            return;
        }
        if (Skills.level('woodcutting') < 6) {
            return;
        }
        if (Bank.isOpen() && gearBankCoins() + gearInvCoins() >= GEAR_STEEL_COST) {
            this.needSteelBuy = true;
        }
    }

    /**
     * Seers bank 1k + Broken axe, boat Ardougne → Brimhaven → Musa → Port Sarim,
     * walk to Bob, repair, then boat home.
     * @returns {Promise<boolean>} always true (spent this loop on repair)
     */
    async repairBrokenAxeAtBob(): Promise<any> {
        this.status = 'gear: repair';
        this.repairTrip = 'to_bob';

        if (Shop.isOpen()) {
            await Shop.close();
            return true;
        }

        if (Equipment.contains(GEAR_BROKEN_AXE) && !Inventory.isFull()) {
            this.log('gear: unequipping Broken axe');
            await Equipment.unequip(GEAR_BROKEN_AXE);
            await Execution.delayTicks(1);
        }

        if (await this.prepRepairBank()) {
            return true;
        }

        const broken = Inventory.first(GEAR_BROKEN_AXE);
        if (!broken) {
            this.log('gear: Broken axe not in pack after prep');
            this.repairBanked = false;
            await Execution.delayTicks(3);
            return true;
        }

        if (!nearBob()) {
            await this.stepTravelToBob();
            return true;
        }

        const bob = Npcs.query().name('Bob').within(12).nearest();
        if (!bob) {
            this.log('gear: Bob not nearby, walking in');
            await Traversal.walkResilient(GEAR_BOB_STAND, {
                radius: 2,
                log: m => this.log(`  ${m}`)
            });
            return true;
        }

        const before = Inventory.count(GEAR_BROKEN_AXE) || 0;
        this.log('gear: using Broken axe on Bob');
        if (!(await broken.useOn(bob))) {
            this.log('gear: use-on Bob failed');
            await Execution.delayTicks(2);
            return true;
        }

        if (!(await Execution.delayUntil(() => ChatDialog.isOpen() || ChatDialog.canContinue(), 8000))) {
            this.log('gear: Bob never opened repair dialogue');
            await Execution.delayTicks(3);
            return true;
        }

        await gearDriveRepairDialog(m => this.log(m));
        await Execution.delayTicks(2);

        const after = Inventory.count(GEAR_BROKEN_AXE) || 0;
        if (after < before || !gearHasBrokenAxe()) {
            this.log('gear: axe repaired at Bob, boats back to Seers');
            const held = gearBestHeldAxe();
            if (held && !Equipment.contains(held) && canWieldTool(held, Skills.level('attack'))) {
                await Equipment.equip(held);
            }
            if (!gearBestHeldAxe() || (this.fletchEnabled() && !gearHasKnife())) {
                this.gearReady = false;
            }
            this.repairTrip = 'home';
            this.repairBanked = false;
        } else {
            this.log('gear: Bob did not repair, will retry');
        }
        return true;
    }

    /**
     * Dump logs/bows at the nearest bank, withdraw Broken axe + 1k.
     * @returns {Promise<boolean>} true if this loop should stop here
     */
    async prepRepairBank(): Promise<any> {
        const here = Game.tile();
        const region = regionOf(here);
        const onRoute =
            region === 'ardougne' ||
            region === 'brimhaven' ||
            region === 'musa' ||
            region === 'karamja' ||
            region === 'sarim' ||
            region === 'lumbridge' ||
            nearBob(here);
        const canSkipBank =
            gearHasBrokenAxe() &&
            (this.repairBanked || onRoute) &&
            (gearInvCoins() >= BOAT_LEG_GP || nearBob(here) || region === 'lumbridge' || region === 'sarim');
        if (canSkipBank) {
            this.repairBanked = true;
            if (Bank.isOpen()) {
                await Bank.close();
                await Execution.delayTicks(1);
            }
            return false;
        }

        this.status = 'gear: Seers 1k';
        if (!Bank.isOpen()) {
            this.log('gear: Seers bank for Broken axe + 1k (rune repair + boats)');
            if (!(await Banking.open({ log: m => this.log(`  ${m}`) }))) {
                this.log('gear: could not open bank for repair coins');
                await Execution.delayTicks(3);
                return true;
            }
        }
        await gearWaitBankLoaded();

        this.log('gear: depositing extras (keep knife and axe)');
        await Bank.depositAllMatching(name => !isKeepTool(name));
        await Execution.delayTicks(1);

        await this.restockEssentialsFromOpenBank();

        const need = GEAR_REPAIR_COIN_FLOAT - gearInvCoins();
        if (need > 0) {
            const have = gearBankCoins();
            if (have <= 0 && gearInvCoins() < BOAT_LEG_GP) {
                this.log('gear: need coins in Seers bank for Bob boats, waiting');
                await Bank.close();
                await Execution.delayTicks(8);
                return true;
            }
            const take = Math.min(need, have);
            if (take > 0) {
                this.log(`gear: withdrawing ${take}gp (want ${GEAR_REPAIR_COIN_FLOAT}gp for rune axe + boats)`);
                await Bank.withdrawX('Coins', take);
                await Execution.delayTicks(1);
            }
        }

        await Bank.close();
        await Execution.delayTicks(1);

        if (!gearHasBrokenAxe()) {
            this.log('gear: Broken axe not in pack or bank');
            return true;
        }

        this.repairBanked = true;
        this.log(`gear: repair pack ready, ${gearInvCoins()}gp`);
        return false;
    }

    async stepTravelToBob(): Promise<any> {
        const here = Game.tile();
        const region = regionOf(here);

        if (dialogOpen() && (region === 'ardougne' || region === 'musa')) {
            await this.stepSailorDialog(
                region === 'ardougne' ? BRIMHAVEN_DIALOG_PREFER : SARIM_RETURN_DIALOG
            );
            return;
        }

        if (region === 'musa' || region === 'karamja') {
            if (!nearTile(here, MUSA_DOCK, 8)) {
                this.status = 'gear: walk Musa';
                this.log(`gear: Karamja, walking to Musa Customs @ ${MUSA_DOCK.x},${MUSA_DOCK.z}`);
                await Traversal.walkResilient(MUSA_DOCK, {
                    radius: 4,
                    log: m => this.log(`  ${m}`)
                });
                return;
            }
            this.status = 'gear: boat Sarim';
            await this.boatPortSarimFromMusa();
            return;
        }

        if (region === 'brimhaven' || nearTile(here, BRIMHAVEN_DOCK, 8)) {
            this.status = 'gear: walk Musa';
            this.log(`gear: Brimhaven, walking to Musa dock @ ${MUSA_DOCK.x},${MUSA_DOCK.z}`);
            await Traversal.walkResilient(MUSA_DOCK, {
                radius: 4,
                log: m => this.log(`  ${m}`)
            });
            return;
        }

        if (region === 'ardougne' || nearTile(here, ARDOUGNE_DOCK, 8)) {
            this.status = 'gear: boat Brimhaven';
            await this.boatBrimhavenFromArdougne();
            return;
        }

        if (kandarinNeedsBoat(here)) {
            this.status = 'gear: walk Ardougne';
            this.log(`gear: walking to Ardougne Barnaby @ ${ARDOUGNE_DOCK.x},${ARDOUGNE_DOCK.z}`);
            await Traversal.walkResilient(ARDOUGNE_DOCK, {
                radius: 4,
                log: m => this.log(`  ${m}`)
            });
            return;
        }

        this.status = 'gear: walk Bob';
        this.log(`gear: walking to Bob @ ${GEAR_BOB_STAND.x},${GEAR_BOB_STAND.z}`);
        await Traversal.walkResilient(GEAR_BOB_STAND, {
            radius: 2,
            log: m => this.log(`  ${m}`)
        });
    }

    async travelBoatHomeToSeers(): Promise<any> {
        const here = Game.tile();
        if (nearMaples(here)) {
            this.log('gear: back at maple camp');
            this.repairTrip = null;
            this.repairBanked = false;
            return false;
        }

        if (Shop.isOpen()) {
            await Shop.close();
            return true;
        }

        const region = regionOf(here);

        if (dialogOpen() && (region === 'sarim' || region === 'brimhaven')) {
            await this.stepSailorDialog(
                region === 'brimhaven' ? ARDOUGNE_DIALOG_PREFER : KARAMJA_DIALOG_PREFER
            );
            return true;
        }

        if (region === 'seers' || region === 'ardougne' || region === 'catherby') {
            this.status = 'gear: walk maples';
            this.log(`gear: walking back to maples @ ${ANCHOR.x},${ANCHOR.z}`);
            await Traversal.walkResilient(ANCHOR, {
                radius: 4,
                log: m => this.log(`  ${m}`)
            });
            return true;
        }

        if (region === 'brimhaven' || nearTile(here, BRIMHAVEN_DOCK, 8)) {
            this.status = 'gear: boat Ardougne';
            await this.boatArdougneFromBrimhaven();
            return true;
        }

        if (region === 'musa' || region === 'karamja') {
            this.status = 'gear: walk Brimhaven';
            this.log(`gear: Karamja, walking to Brimhaven dock @ ${BRIMHAVEN_DOCK.x},${BRIMHAVEN_DOCK.z}`);
            await Traversal.walkResilient(BRIMHAVEN_DOCK, {
                radius: 5,
                log: m => this.log(`  ${m}`)
            });
            return true;
        }

        if (region === 'sarim' || nearTile(here, PORT_SARIM_DOCK, 6)) {
            this.status = 'gear: boat Karamja';
            await this.boatKaramjaFromSarim();
            return true;
        }

        this.status = 'gear: walk Port Sarim';
        this.log(`gear: walking to Port Sarim dock @ ${PORT_SARIM_DOCK.x},${PORT_SARIM_DOCK.z}`);
        await Traversal.walkResilient(PORT_SARIM_DOCK, {
            radius: 4,
            log: m => this.log(`  ${m}`)
        });
        return true;
    }

    async stepSailorDialog(prefer: any): Promise<any> {
        if (typeof ChatDialog.canContinue === 'function' && ChatDialog.canContinue()) {
            this.status = 'boat dialog';
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
            this.status = `boat dialog: ${pick ?? '?'}`;
            this.log(`boat → ${pick}  [${opts.join(' | ')}]`);
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

    movedFar(from: TileLike | null | undefined, tiles: number) {
        const now = Game.tile();
        if (!from || !now) {
            return false;
        }
        return Tile.from(from).distanceTo(now) >= tiles;
    }

    async crossGangplank(): Promise<any> {
        const plank = Locs.query()
            .within(10)
            .where(l => /gangplank/i.test(l.name ?? ''))
            .nearest();
        if (!plank) {
            return false;
        }
        const acts = typeof plank.actions === 'function' ? plank.actions() : [];
        const op = acts.find(a => /cross|walk|climb/i.test(a ?? '')) ?? acts[0] ?? null;
        if (!op) {
            return false;
        }
        const before = Game.tile();
        this.status = `cross ${plank.name}`;
        this.log(`crossing ${plank.name} (${op})`);
        if (!(await plank.interact(op))) {
            return false;
        }
        await Execution.delayUntil(() => this.movedFar(before, 3), 6000);
        return true;
    }

    async talkSailorAndRide(npc: Npc | null | undefined, prefer: any, arrivedFn: any): Promise<any> {
        const before = Game.tile();
        const coinsBefore = gearInvCoins();
        const op = talkOp(npc);
        this.status = `Talk-to ${npc.name ?? 'sailor'}`;
        this.log(`Talk-to ${npc.name} @ dock (${coinsBefore}gp)`);

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
                return true;
            }
            if (!dialogOpen()) {
                if (
                    await Execution.delayUntil(
                        () => arrivedFn() || this.movedFar(before, 15) || dialogOpen(),
                        6000
                    )
                ) {
                    if (arrivedFn()) {
                        return true;
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
            return true;
        }
        await this.crossGangplank();
        return arrivedFn();
    }

    findSailor(names: any, stand: TileLike | null | undefined) {
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
                    return (
                        nm.includes('barnaby') ||
                        nm.includes('customs') ||
                        nm.includes('captain') ||
                        nm.includes('seaman') ||
                        nm.includes('sailor')
                    );
                })
                .nearest() ?? null
        );
    }

    async boatBrimhavenFromArdougne(): Promise<any> {
        if (regionOf(Game.tile()) === 'brimhaven' || onKaramjaIsland()) {
            this.log('gear: landed Brimhaven');
            return true;
        }
        if (gearInvCoins() < BOAT_LEG_GP) {
            this.log(`gear: need ${BOAT_LEG_GP}gp for Ardougne → Brimhaven (have ${gearInvCoins()}gp)`);
            this.repairBanked = false;
            return false;
        }
        if (!nearTile(Game.tile(), ARDOUGNE_DOCK, 8)) {
            await Traversal.walkResilient(ARDOUGNE_DOCK, {
                radius: 4,
                timeoutMs: 10_000,
                log: m => this.log(`  ${m}`)
            });
            return false;
        }
        const sailor = this.findSailor(ARDY_SAILORS, ARDOUGNE_DOCK);
        if (!sailor) {
            this.status = 'looking for Barnaby';
            await Traversal.walkResilient(ARDOUGNE_DOCK, {
                radius: 3,
                timeoutMs: 10_000,
                log: m => this.log(`  ${m}`)
            });
            return false;
        }
        const ok = await this.talkSailorAndRide(sailor, BRIMHAVEN_DIALOG_PREFER, () =>
            regionOf(Game.tile()) === 'brimhaven' || onKaramjaIsland()
        );
        if (ok || regionOf(Game.tile()) === 'brimhaven' || onKaramjaIsland()) {
            this.log('gear: boat landed in Brimhaven');
            return true;
        }
        return false;
    }

    async boatPortSarimFromMusa(): Promise<any> {
        if (!onKaramjaIsland()) {
            this.log('gear: landed Port Sarim');
            return true;
        }
        if (gearInvCoins() < BOAT_LEG_GP) {
            this.log(`gear: need ${BOAT_LEG_GP}gp for Musa → Port Sarim (have ${gearInvCoins()}gp)`);
            this.repairBanked = false;
            return false;
        }
        if (!nearTile(Game.tile(), MUSA_DOCK, 8)) {
            await Traversal.walkResilient(MUSA_DOCK, {
                radius: 4,
                timeoutMs: 10_000,
                log: m => this.log(`  ${m}`)
            });
            return false;
        }
        const sailor = this.findSailor(MUSA_SAILORS, MUSA_DOCK);
        if (!sailor) {
            this.status = 'looking for Customs';
            await Traversal.walkResilient(MUSA_DOCK, {
                radius: 3,
                timeoutMs: 10_000,
                log: m => this.log(`  ${m}`)
            });
            return false;
        }
        const ok = await this.talkSailorAndRide(sailor, SARIM_RETURN_DIALOG, () => !onKaramjaIsland());
        if (ok || !onKaramjaIsland()) {
            this.log('gear: boat landed in Port Sarim');
            return true;
        }
        return false;
    }

    async boatKaramjaFromSarim(): Promise<any> {
        if (onKaramjaIsland()) {
            this.log('gear: landed Musa Point / Karamja');
            return true;
        }
        if (gearInvCoins() < BOAT_LEG_GP) {
            this.log(`gear: need ${BOAT_LEG_GP}gp for Port Sarim → Karamja (have ${gearInvCoins()}gp)`);
            this.repairBanked = false;
            return false;
        }
        if (!nearTile(Game.tile(), PORT_SARIM_DOCK, 8)) {
            await Traversal.walkResilient(PORT_SARIM_DOCK, {
                radius: 4,
                timeoutMs: 10_000,
                log: m => this.log(`  ${m}`)
            });
            return false;
        }
        const sailor = this.findSailor(SARIM_SAILORS, PORT_SARIM_DOCK);
        if (!sailor) {
            this.status = 'looking for Port Sarim sailor';
            await Traversal.walkResilient(PORT_SARIM_DOCK, {
                radius: 3,
                timeoutMs: 10_000,
                log: m => this.log(`  ${m}`)
            });
            return false;
        }
        const ok = await this.talkSailorAndRide(sailor, KARAMJA_DIALOG_PREFER, () => onKaramjaIsland());
        if (ok || onKaramjaIsland()) {
            this.log('gear: boat landed on Karamja');
            return true;
        }
        return false;
    }

    async boatArdougneFromBrimhaven(): Promise<any> {
        if (inArdougneArea()) {
            this.log('gear: landed Ardougne');
            return true;
        }
        if (gearInvCoins() < BOAT_LEG_GP) {
            this.log(`gear: need ${BOAT_LEG_GP}gp for Brimhaven → Ardougne (have ${gearInvCoins()}gp)`);
            this.repairBanked = false;
            return false;
        }
        if (!nearTile(Game.tile(), BRIMHAVEN_DOCK, 8)) {
            await Traversal.walkResilient(BRIMHAVEN_DOCK, {
                radius: 5,
                timeoutMs: 10_000,
                log: m => this.log(`  ${m}`)
            });
            return false;
        }
        const sailor = this.findSailor(BRIM_SAILORS, BRIMHAVEN_DOCK);
        if (!sailor) {
            this.status = 'looking for Brimhaven sailor';
            await Traversal.walkResilient(BRIMHAVEN_DOCK, {
                radius: 3,
                timeoutMs: 10_000,
                log: m => this.log(`  ${m}`)
            });
            return false;
        }
        const ok = await this.talkSailorAndRide(sailor, ARDOUGNE_DIALOG_PREFER, () => inArdougneArea());
        if (ok || inArdougneArea()) {
            this.log('gear: boat landed in Ardougne');
            return true;
        }
        return false;
    }

    /** @returns {Promise<boolean>} true if this loop spent time on gear prep */
    async prepWcGear(): Promise<any> {
        if (ChatDialog.isMakeMenu()) {
            return false;
        }

        if (this.repairTrip === 'home' && !gearHasBrokenAxe()) {
            return await this.travelBoatHomeToSeers();
        }

        // Broken axe always wins, take it to Bob before anything else.
        if (gearHasBrokenAxe() || (Bank.isOpen() && (Bank.count(GEAR_BROKEN_AXE) || 0) > 0)) {
            return await this.repairBrokenAxeAtBob();
        }

        if (this.gearReady && this.fletchEnabled() && !gearHasKnife()) {
            this.log('gear: Knife missing — checking nearest bank');
            this.gearReady = false;
        }

        if (this.gearReady && !this.needSteelBuy) {
            return false;
        }

        if (this.needSteelBuy && Shop.isOpen()) {
            return await this.buySteelAtOpenShop();
        }

        if (Shop.isOpen()) {
            await Shop.close();
            return true;
        }

        if (!this.gearReady) {
            return await this.bootstrapWcGear();
        }

        if (this.needSteelBuy) {
            return await this.runSteelAxeBuy();
        }

        return false;
    }

    async bootstrapWcGear(): Promise<any> {
        this.status = 'gear: bank';

        if (!Bank.isOpen()) {
            this.log('gear: opening bank for best axe / knife');
            if (!(await Banking.open({ log: m => this.log(`  ${m}`) }))) {
                this.log('gear: could not open bank — retrying');
                await Execution.delayTicks(3);
                return true;
            }
        }

        await gearWaitBankLoaded();

        this.log('gear: depositing all except Knife');
        await Bank.depositAllMatching(name => {
            const n = (name ?? '').toLowerCase();
            return !!n && n !== 'knife';
        });
        await Execution.delayTicks(1);

        if (!(await this.restockEssentialsFromOpenBank())) {
            return true;
        }

        const wc = Skills.level('woodcutting');
        const best = bestAxe(wc, n => gearAxeCount(n) > 0 || (Bank.count(n) || 0) > 0);

        if (!best && !gearHasBrokenAxe()) {
            this.log(`gear: no usable axe in bank/pack for WC ${wc}, waiting`);
            await Bank.close();
            await Execution.delayTicks(8);
            return true;
        }

        if (gearHasBrokenAxe() || (Bank.count(GEAR_BROKEN_AXE) || 0) > 0) {
            const need = GEAR_REPAIR_COIN_FLOAT - gearInvCoins();
            if (need > 0 && gearBankCoins() > 0) {
                const take = Math.min(need, gearBankCoins());
                this.log(`gear: withdrawing ${take}gp for rune axe repair + boats`);
                await Bank.withdrawX('Coins', take);
                await Execution.delayTicks(1);
            }
            this.repairBanked = true;
            this.repairTrip = 'to_bob';
        }

        this.maybeQueueSteelBuy();
        if (this.needSteelBuy) {
            const need = GEAR_STEEL_COST - gearInvCoins();
            if (need > 0) {
                this.log(`gear: withdrawing ${need}gp for Steel axe`);
                await Bank.withdrawX('Coins', need);
                await Execution.delayTicks(1);
            }
        }

        await Bank.close();
        await Execution.delayTicks(1);

        if (gearHasBrokenAxe()) {
            return await this.repairBrokenAxeAtBob();
        }

        const held = gearBestHeldAxe();
        if (held && !Equipment.contains(held) && canWieldTool(held, Skills.level('attack'))) {
            this.status = `gear: wield ${held}`;
            this.log(`gear: wielding ${held}`);
            await Equipment.equip(held);
            await Execution.delayTicks(1);
        } else if (held && !canWieldTool(held, Skills.level('attack'))) {
            this.log(`gear: keeping ${held} in pack (Attack too low to wield)`);
        }

        if (this.fletchEnabled() && !gearHasKnife()) {
            this.stopNoKnife('gear');
            return true;
        }

        if (!gearBestHeldAxe()) {
            this.log('gear: still missing axe after bank');
            await Execution.delayTicks(5);
            return true;
        }

        this.gearReady = true;
        this.log(
            `gear: ready — ${gearBestHeldAxe()}` +
                (this.needSteelBuy ? ' (buying Steel axe next)' : '')
        );

        if (this.needSteelBuy) {
            return await this.runSteelAxeBuy();
        }
        return true;
    }

    /** Fletch on, no Knife in inventory or bank — stop (Seers is too far from Lumbridge). */
    stopNoKnife(context: any) {
        this.status = 'no knife — stopped';
        this.log(
            `${context}: no Knife in inventory or bank — stopping ` +
                '(Seers Village will not walk to Lumbridge; withdraw a Knife, then restart)'
        );
        stopScript();
    }

    async runSteelAxeBuy(): Promise<any> {
        if (gearHasSteelOrBetter()) {
            this.needSteelBuy = false;
            return false;
        }
        if (Skills.level('woodcutting') < 6) {
            this.needSteelBuy = false;
            return false;
        }

        // Confirm ownership in bank before spending at Bob (need 250gp float).
        if (!Bank.isOpen()) {
            this.status = 'gear: check steel';
            if (!(await Banking.open({ log: m => this.log(`  ${m}`) }))) {
                await Execution.delayTicks(3);
                return true;
            }
        }
        await gearWaitBankLoaded();

        if (gearHasSteelOrBetter()) {
            const steelRank = gearAxeRank(GEAR_STEEL_AXE);
            const best = bestAxe(
                Skills.level('woodcutting'),
                n => gearAxeCount(n) > 0 || (Bank.count(n) || 0) > 0
            );
            if (best && gearAxeRank(best) <= steelRank && gearAxeCount(best) === 0) {
                this.log(`gear: already own ${best} in bank — withdrawing (skip Bob)`);
                await Bank.withdrawX(best, 1);
                await Execution.delayTicks(1);
            } else {
                this.log('gear: already own steel+ axe — skip Bob');
            }
            this.needSteelBuy = false;
            await Bank.close();
            const held = gearBestHeldAxe();
            if (held && !Equipment.contains(held) && canWieldTool(held, Skills.level('attack'))) {
                await Equipment.equip(held);
            }
            return true;
        }

        if (gearInvCoins() < GEAR_STEEL_COST) {
            this.status = 'gear: steel gp';
            if (gearBankCoins() + gearInvCoins() < GEAR_STEEL_COST) {
                this.log('gear: need 250gp in bank for Steel axe — waiting');
                this.needSteelBuy = false;
                await Bank.close();
                return true;
            }
            const need = GEAR_STEEL_COST - gearInvCoins();
            if (need > 0) {
                await Bank.withdrawX('Coins', need);
            }
            await Bank.close();
            await Execution.delayTicks(1);
            return true;
        }

        await Bank.close();
        await Execution.delayTicks(1);

        this.status = 'gear: Bob';
        this.log('gear: walking to Bob for Steel axe');
        await Traversal.walkResilient(GEAR_BOB_STAND, {
            radius: 2,
            log: m => this.log(`  ${m}`)
        });

        if (!(await Shop.open('Bob'))) {
            this.log("gear: could not open Bob's shop");
            await Execution.delayTicks(3);
            return true;
        }
        return await this.buySteelAtOpenShop();
    }

    async buySteelAtOpenShop(): Promise<any> {
        if (gearHasSteelOrBetter()) {
            this.log('gear: already own steel+ axe — closing Bob');
            this.needSteelBuy = false;
            await Shop.close();
            return true;
        }

        this.status = 'gear: buy steel';
        const before = gearAxeCount(GEAR_STEEL_AXE);
        const bought = await Shop.buy(GEAR_STEEL_AXE, 1);
        const got = bought > 0 ? bought : Math.max(0, gearAxeCount(GEAR_STEEL_AXE) - before);

        if (got <= 0) {
            this.log('gear: Steel axe buy failed (stock/coins?)');
            await Shop.close();
            await Execution.delayTicks(5);
            return true;
        }

        this.log('gear: bought Steel axe from Bob');
        this.needSteelBuy = false;
        await Shop.close();
        await Execution.delayTicks(1);

        if (
            !Equipment.contains(GEAR_STEEL_AXE) &&
            canWieldTool(GEAR_STEEL_AXE, Skills.level('attack'))
        ) {
            await Equipment.equip(GEAR_STEEL_AXE);
        }
        return true;
    }

    findTree() {
        return Locs.query()
            .name(TREE_NAME)
            .where(l => chopOp(l.actions()) !== null)
            .where(l => Tile.from(l.tile()).distanceTo(ANCHOR) <= LEASH)
            .nearest();
    }

    findTreeWithin(maxDistFromPlayer: any) {
        return Locs.query()
            .name(TREE_NAME)
            .where(l => chopOp(l.actions()) !== null)
            .where(l => Tile.from(l.tile()).distanceTo(ANCHOR) <= LEASH)
            .where(l => l.distance() <= maxDistFromPlayer)
            .nearest();
    }

    async fletchLogs(plan: any): Promise<any> {
        if (!plan.fletch || logCount() === 0) {
            return;
        }

        if (ChatDialog.isMakeMenu()) {
            await this.chooseMakeProduct(plan);
            return;
        }

        const knife = knifeItem();
        const log = lastLog();
        if (!knife) {
            this.gearReady = false;
            this.log('WARNING: no Knife in inventory — will check bank');
            await Execution.delayTicks(2);
            return;
        }
        if (!log) {
            return;
        }

        this.status = `fletching ${plan.label}`;
        this.log(`knife → maple logs (${logCount()} left) for ${plan.label}`);
        const before = logCount();
        if (!(await knife.useOn(log))) {
            await Execution.delayTicks(2);
            return;
        }

        const opened = await Execution.delayUntil(
            () =>
                ChatDialog.isMakeMenu() ||
                logCount() < before ||
                ChatDialog.canContinue() ||
                Game.animating(),
            8000
        );

        if (ChatDialog.isMakeMenu()) {
            await this.chooseMakeProduct(plan);
            return;
        }

        if (!opened && logCount() >= before) {
            this.log('fletch useOn did not start — retrying');
        }
    }

    async chooseMakeProduct(plan: any): Promise<any> {
        if (!plan.fletch) {
            return;
        }

        const products = ChatDialog.makeProducts();
        const match = matchMakeProduct(products, plan.menuMatch);
        if (!match) {
            this.log(
                `make menu missing '${plan.label}' (have: [${products.join(', ')}]) — closing`
            );
            await Execution.delayTicks(2);
            return;
        }

        const start = logCount();
        this.status = `make ${plan.label}`;
        this.log(`selecting '${match}' x${start}`);

        let picked = false;
        if (typeof ChatDialog.makeX === 'function') {
            const count = Math.max(1, Math.min(start, 30));
            picked = await ChatDialog.makeX(match, count);
        }
        if (!picked) {
            picked = await ChatDialog.make(match);
        }
        if (!picked) {
            this.log(`could not pick '${match}' from make menu`);
            await Execution.delayTicks(1);
            return;
        }

        await Execution.delayUntil(
            () =>
                !ChatDialog.isMakeMenu() &&
                (Game.animating() || logCount() < start || ChatDialog.canContinue()),
            5000
        );

        let mark = logCount();
        let idle = 0;
        for (let guard = 0; guard < 400 && logCount() > 0; guard++) {
            if (ChatDialog.canContinue()) {
                return;
            }
            if (ChatDialog.isMakeMenu()) {
                return;
            }
            await Execution.delayTicks(1);
            const now = logCount();
            if (now < mark) {
                this.fletched += mark - now;
                mark = now;
                idle = 0;
            } else if (!Game.animating() && ++idle >= 12) {
                return;
            } else if (Game.animating()) {
                idle = 0;
            }
        }
    }

    async bankProductsAndReturn(): Promise<any> {
        const flvl = Skills.level('fletching');
        const bows = bowCount();
        const shorts = shortbowCount();
        const logs = logCount();
        this.status = 'banking';
        this.log(
            `banking` +
                (shorts ? ` ${shorts} Maple shortbow` : '') +
                (bows - shorts > 0 ? ` ${bows - shorts} Maple longbow` : '') +
                (logs ? ` ${logs} Maple logs` : '') +
                ` (fletching ${flvl})`
        );

        await Banking.bankNearest({
            deposit: name => !isKeepTool(name),
            afterDeposit: async () => {
                if (!(await this.restockEssentialsFromOpenBank())) {
                    return;
                }
                if (gearHasBrokenAxe() || (Bank.count(GEAR_BROKEN_AXE) || 0) > 0) {
                    const need = GEAR_REPAIR_COIN_FLOAT - gearInvCoins();
                    if (need > 0 && gearBankCoins() > 0) {
                        const take = Math.min(need, gearBankCoins());
                        this.log(`gear: withdrawing ${take}gp for rune axe repair + boats`);
                        await Bank.withdrawX('Coins', take);
                    }
                    this.repairBanked = true;
                    this.repairTrip = 'to_bob';
                }
                this.maybeQueueSteelBuy();
            },
            returnTo: ANCHOR,
            log: m => this.log(`  ${m}`)
        });

        this.bankTrips++;
        if (this.repairTrip === 'to_bob') {
            this.status = 'gear: repair boats';
            return;
        }
        this.status = 'returning to maples';
    }

    /**
     * After a full deposit: Knife + best usable axe (or Broken axe) back in pack.
     * @returns {Promise<boolean>} false if Knife is missing from bank (script stops)
     */
    async restockEssentialsFromOpenBank(): Promise<any> {
        const needKnife = this.fletchEnabled();
        if (!Bank.isOpen()) {
            return hasEssentialsAfterBank(needKnife);
        }
        await Execution.delayUntil(() => Bank.loaded() || !Bank.isOpen(), 3000);
        if (!Bank.isOpen()) {
            return hasEssentialsAfterBank(needKnife);
        }

        if ((Bank.count(GEAR_BROKEN_AXE) || 0) > 0 && !gearHasBrokenAxe()) {
            this.log('gear: withdrawing Broken axe');
            await Bank.withdrawX(GEAR_BROKEN_AXE, 1);
            await Execution.delayTicks(1);
        }

        if (this.fletchEnabled() && !gearHasKnife()) {
            if ((Bank.count('Knife') || 0) > 0) {
                this.log('gear: withdrawing Knife');
                await Bank.withdrawX('Knife', 1);
                await Execution.delayTicks(1);
            } else {
                this.stopNoKnife('banking');
                return false;
            }
        }

        if (!gearHasBrokenAxe() && !gearBestHeldAxe()) {
            const wc = Skills.level('woodcutting');
            const best = bestAxe(wc, n => (Bank.count(n) || 0) > 0);
            if (best) {
                this.log(`gear: withdrawing ${best}`);
                await Bank.withdrawX(best, 1);
                await Execution.delayTicks(1);
            } else {
                this.log(`gear: no usable axe in bank for WC ${wc}`);
            }
        }

        return hasEssentialsAfterBank(needKnife);
    }

    sessionSnapshot() {
        const runtimeMs = this.startedAt ? Date.now() - this.startedAt : 0;
        const hrs = runtimeMs / 3_600_000;
        const wcXp = Math.max(0, Skills.xp('woodcutting') - this.wcXpAtStart);
        const flXp = Math.max(0, Skills.xp('fletching') - this.fletchXpAtStart);
        const perHour = n => (hrs > 0.0005 ? n / hrs : 0);
        return {
            runtimeMs,
            wcXp,
            flXp,
            chopped: this.chopped,
            fletched: this.fletched,
            banks: this.bankTrips,
            wcXpPerHour: perHour(wcXp),
            flXpPerHour: perHour(flXp),
            bowsPerHour: perHour(this.fletched)
        };
    }

    startFleetHeartbeat() {
        this.stopFleetHeartbeat();
        this.pushFleetHeartbeat();
        this.fleetTimer = setInterval(() => this.pushFleetHeartbeat(), FLEET_HEARTBEAT_MS);
    }

    stopFleetHeartbeat() {
        if (this.fleetTimer !== null) {
            clearInterval(this.fleetTimer);
            this.fleetTimer = null;
        }
    }

    fleetPayload(status: string = this.status) {
        const snap = this.sessionSnapshot();
        const xp: Record<string, number> = {};
        if (snap.wcXp > 0) {
            xp.woodcutting = Math.round(snap.wcXp);
        }
        if (snap.flXp > 0) {
            xp.fletching = Math.round(snap.flXp);
        }
        return {
            id: this.fleetId,
            script: SCRIPT_NAME,
            title: SCRIPT_TITLE,
            version: SCRIPT_VERSION,
            name: localPlayerName() || 'unknown',
            status,
            startedAt: this.startedAt ? new Date(this.startedAt).toISOString() : null,
            runtimeMs: snap.runtimeMs,
            banks: snap.banks,
            chopped: snap.chopped,
            fletched: snap.fletched,
            bows: snap.fletched,
            woodcuttingXpPerHour: Math.round(snap.wcXpPerHour),
            fletchingXpPerHour: Math.round(snap.flXpPerHour),
            bowsPerHour: Math.round(snap.bowsPerHour),
            xp,
            loot: {
                Bows: snap.fletched
            }
        };
    }

    pushFleetHeartbeat(status: string = this.status) {
        const body = JSON.stringify(this.fleetPayload(status));
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

    override onStop(): void {
        this.pushFleetHeartbeat('stopped');
        this.stopFleetHeartbeat();
        const snap = this.sessionSnapshot();
        this.log(
            `stopped, chopped ~${this.chopped}, fletched ~${this.fletched} bows, ` +
                `bank trips ${this.bankTrips}, ${fmtElapsed(snap.runtimeMs)} (${this.status})`
        );
    }

    override onPaint(ctx: CanvasRenderingContext2D): void {
        const plan = this.currentPlan();
        const snap = this.sessionSnapshot();
        const lines = [
            SCRIPT_TITLE,
            `time ${fmtElapsed(snap.runtimeMs)} · ${this.status}`,
            `Woodcutting ${Skills.level('woodcutting')} · Fletching ${Skills.level('fletching')}`,
            `${plan.label}${plan.bank ? ' + bank' : ''}`,
            `fletched ${snap.fletched} · logs ${logCount()} · trips ${snap.banks}`,
            `WC ${fmtXph(snap.wcXpPerHour)}/hr  (+${Math.round(snap.wcXp)} xp)`,
            `Fletch ${fmtXph(snap.flXpPerHour)}/hr  (+${Math.round(snap.flXp)} xp)`,
            `bows ${fmtXph(snap.bowsPerHour)}/hr`
        ];

        ctx.save();
        ctx.font = '13px sans-serif';
        ctx.textBaseline = 'top';
        ctx.lineJoin = 'round';
        const x = 8;
        const y0 = 8;
        const lineH = 16;
        const iconH = 20;
        const iconW = 14;
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#000';
        lines.forEach((line, i) => {
            const y = y0 + i * lineH;
            ctx.strokeText(line, x, y);
            ctx.fillStyle = i === 0 ? TITLE_MAPLE : '#ffffff';
            ctx.fillText(line, x, y);
            if (
                i === 0 &&
                mapleTreeIcon &&
                mapleTreeIcon.complete &&
                mapleTreeIcon.naturalWidth > 0
            ) {
                const iconX = x + ctx.measureText(line).width + 5;
                const iconY = y + (lineH - iconH) / 2;
                ctx.drawImage(mapleTreeIcon, iconX, iconY, iconW, iconH);
            }
        });
        ctx.restore();
    }
}

export default defineBot({
    name: SCRIPT_NAME,
    version: SCRIPT_VERSION,
    category: 'Fletching',
    tags: ['woodcutting', 'fletching', 'maple', 'shortbow', 'longbow'],
    description:
        "Chops maples near Seers' Village (2726,3500). Banks logs. If fletching is on: maple shortbows at 50 / maple longbows at 55, then banks those. Stops if fletching is on and there is no knife. Broken rune axe: withdraws 1k at Seers, boats Ardougne to Brimhaven to Port Sarim, repairs at Bob, boats back.",
    settingsSchema: {
        fletchLogs: {
            type: 'boolean',
            default: true,
            label: 'Fletch logs into bows',
            group: 'Fletching',
            help: 'When on: fletch maple shortbows at 50 / longbows at 55 (needs a Knife), then bank those. When off: bank the logs. Missing Knife in Seers Village stops the script.'
        }
    },
    create: () => new MapleTreeFletcher()
});
