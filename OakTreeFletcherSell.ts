/// <reference path="./dev/rs2b0t-abi.d.ts" />

/**
 * OakTreeFletcherSell. Chops oak trees north of Varrock, fletches bows, and sells them.
 * Completely vibe coded by @.benzyme on Discord via Cursor AI
 * Self-contained ESM for rs2b0t Load local script / Load URL.
 */
const SUPPORTED_API_VERSION = 1;
const abi = globalThis.__rs2b0t;
if (!abi) {
    throw new Error('OakTreeFletcherSell: globalThis.__rs2b0t missing — load inside rs2b0t bot.html');
}
if (abi.apiVersion !== SUPPORTED_API_VERSION) {
    throw new Error(
        `OakTreeFletcherSell: ABI ${abi.apiVersion} != supported ${SUPPORTED_API_VERSION}`
    );
}

const {
    defineBot,
    Execution,
    Game,
    LoopingBot: LoopingBotBase,
    Locs,
    Npcs,
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
    AXES,
    bestAxe,
    canWieldTool
} = abi;

const SCRIPT_NAME = 'OakTreeFletcherSell';

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
 * Retries until the modal is gone.
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

/** Oak camp — center + walking radius. */
const ANCHOR = new Tile(3166, 3416, 0);
const LEASH = 20;
const TREE_NAME = 'Oak';

/** Varrock General Store (quest anchors). */
const STORE_STAND = new Tile(3218, 3414, 0);
const STORE_KEEPER = 'Shop keeper';
/** Closest bank after selling. */
const VARROCK_WEST_BANK = new Tile(3185, 3440, 0);

/** Fletching tier thresholds. */
const SHORTBOW_LEVEL = 20;
const LONGBOW_LEVEL = 25;

/** Lumbridge knife spawn (behind Bob's) + Bob steel axe / repair. */
const GEAR_KNIFE_SPAWN = new Tile(3224, 3202, 0);
const GEAR_BOB_STAND = new Tile(3231, 3203, 0);
const GEAR_STEEL_AXE = 'Steel axe';
const GEAR_STEEL_COST = 250;
const GEAR_BROKEN_AXE = 'Broken axe';
const GEAR_REPAIR_PREFER = ['repair', 'fix', 'fix my', 'yes'];
/** Rune axe repair at Bob. Taken from the nearest bank. */
const GEAR_REPAIR_COIN_FLOAT = 1000;

/** Always keep these when banking / never sell. */
const KEEP_TOOLS = [
    'knife',
    'broken axe',
    'bronze axe',
    'iron axe',
    'steel axe',
    'black axe',
    'mithril axe',
    'adamant axe',
    'rune axe'
];

function fmtXph(n) {
    if (n >= 100_000) {
        return `${(n / 1000).toFixed(0)}k`;
    }
    if (n >= 10_000) {
        return `${(n / 1000).toFixed(1)}k`;
    }
    return String(Math.round(n));
}

/** Elapsed session time as H:MM:SS or M:SS. */
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

function gearAxeRank(name) {
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

function gearAxeCount(name) {
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


function nearBob(tile = Game.tile()) {
    return !!tile && Tile.from(tile).distanceTo(GEAR_BOB_STAND) <= 12;
}

function gearHasBrokenAxe() {
    return (
        Equipment.contains(GEAR_BROKEN_AXE) ||
        (Inventory.count(GEAR_BROKEN_AXE) || 0) > 0 ||
        Inventory.items().some(i => (i.name ?? '').toLowerCase() === 'broken axe')
    );
}

function gearPickRepairOption(options) {
    for (const p of GEAR_REPAIR_PREFER) {
        const hit = options.find(o => (o ?? '').toLowerCase().includes(p.toLowerCase()));
        if (hit) {
            return hit;
        }
    }
    return options.length > 0 ? options[options.length - 1] : null;
}

async function gearDriveRepairDialog(log) {
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

async function gearWaitBankLoaded() {
    if (typeof Bank.loaded === 'function') {
        await Execution.delayUntil(() => Bank.loaded() || Bank.items().length > 0, 3000);
    }
    await Execution.delayTicks(1);
}

function chopOp(actions) {
    return actions.find(a => /chop/i.test(a)) ?? null;
}

function isKeepTool(name) {
    if (!name) {
        return false;
    }
    const n = name.toLowerCase();
    return KEEP_TOOLS.some(k => n === k || n.includes(k));
}

function normName(name) {
    return (name ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function isFletchedShortbow(name) {
    const n = normName(name);
    if (!n.includes('oak')) {
        return false;
    }
    return n.includes('short') && n.includes('bow');
}

function isFletchedLongbow(name) {
    const n = normName(name);
    if (!n.includes('oak')) {
        return false;
    }
    return n.includes('long') && n.includes('bow');
}

function isBankableBow(name) {
    return isFletchedShortbow(name) || isFletchedLongbow(name);
}

function isOakLog(name) {
    const n = normName(name);
    return n === 'oak logs' || n === 'oak log';
}

function isCoins(name) {
    return normName(name) === 'coins';
}

function fletchPlan(level, fletchOn = true) {
    if (!fletchOn || level < SHORTBOW_LEVEL) {
        return {
            id: 'logs',
            menuMatch: '',
            label: 'Oak logs (bank)',
            bank: true,
            fletch: false,
            sell: false
        };
    }
    if (level < LONGBOW_LEVEL) {
        return {
            id: 'oak-shortbow',
            menuMatch: 'short',
            label: 'Oak shortbow',
            bank: false,
            fletch: true,
            sell: true
        };
    }
    return {
        id: 'oak-longbow',
        menuMatch: 'long',
        label: 'Oak longbow',
        bank: false,
        fletch: true,
        sell: true
    };
}

function matchMakeProduct(products, menuMatch) {
    const want = menuMatch.toLowerCase();
    const oakish = products.filter(p => (p ?? '').toLowerCase().includes('oak'));
    const pool = oakish.length > 0 ? oakish : products;
    return pool.find(p => (p ?? '').toLowerCase().includes(want)) ?? null;
}

function logCount() {
    return Inventory.items()
        .filter(i => isOakLog(i.name))
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
        if (isOakLog(items[i].name)) {
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

function coinCount() {
    return Inventory.items()
        .filter(i => isCoins(i.name))
        .reduce((n, i) => n + Math.max(0, i.count), 0);
}

/** Unique display names of bows currently held (Shop.sell needs exact names). */
function bowNamesHeld() {
    const names = [];
    const seen = new Set();
    for (const item of Inventory.items()) {
        if (!isBankableBow(item.name) || !item.name) {
            continue;
        }
        const key = item.name.toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        names.push(item.name);
    }
    return names;
}

function countByExactName(name) {
    return Inventory.items()
        .filter(i => (i.name ?? '').toLowerCase() === name.toLowerCase())
        .reduce((n, i) => n + Math.max(1, i.count), 0);
}

/** Below 20: bank full oak logs. At 20+: sell when logs are gone and bows remain. */
function needsLogBank(plan) {
    if (plan.fletch) {
        return false;
    }
    return logCount() > 0 && Inventory.isFull();
}

function needsSellTrip(plan) {
    if (!plan.sell || !plan.fletch) {
        return false;
    }
    if (logCount() > 0) {
        return false;
    }
    return bowCount() > 0;
}

class OakTreeFletcherSell extends LoopingBotBase {
    status = 'starting';
    startedAt = 0;
    wcXpAtStart = 0;
    fletchXpAtStart = 0;
    chopped = 0;
    fletched = 0;
    sellTrips = 0;
    bankTrips = 0;
    soldBows = 0;
    /** Last known Coins stack in the bank (updated after each GP deposit). */
    totalGpEarned = 0;
    planId = 'logs';
    gearReady = false;
    needSteelBuy = false;
    repairTrip: null | 'to_bob' | 'home' = null;
    repairBanked = false;

    fletchEnabled() {
        return this.settings?.bool('fletchLogs', true) ?? true;
    }

    planAt(level) {
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
        this.totalGpEarned = 0;
        this.planId = this.currentPlan().id;
        this.gearReady = false;
        this.needSteelBuy = false;
        this.repairTrip = null;
        this.repairBanked = false;

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
            `OakTreeFletcherSell @ ${ANCHOR.x},${ANCHOR.z} (leash ${LEASH}) — ` +
                (this.fletchEnabled()
                    ? `fletching ${Skills.level('fletching')} → ${plan.label}; sell bows @ Varrock General → bank GP`
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

        if (needsSellTrip(plan)) {
            await this.sellBowsBankGpAndReturn();
            return;
        }

        if (needsLogBank(plan)) {
            await this.bankLogsAndReturn();
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
            this.status = 'returning to oaks';
            this.log('walking back to oak camp');
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
            this.status = 'waiting for oak';
            await Traversal.walkTo(ANCHOR, { radius: 3, timeoutMs: 10_000 });
            await Execution.delayTicks(2);
            return;
        }

        const op = chopOp(tree.actions());
        if (!op) {
            this.log(`Oak has no chop action: [${tree.actions().join(', ')}]`);
            await Execution.delayTicks(2);
            return;
        }

        const before = logCount();
        this.status = `chopping (${tree.distance()}t)`;
        this.log(`chopping Oak @ ${tree.tile().x},${tree.tile().z}`);
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
     * Bank extras + 1k, walk to Bob in Lumbridge, repair, then walk home.
     * @returns {Promise<boolean>} always true (spent this loop on repair)
     */
    async repairBrokenAxeAtBob() {
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
            this.status = 'gear: walk Bob';
            this.log(`gear: walking to Bob @ ${GEAR_BOB_STAND.x},${GEAR_BOB_STAND.z}`);
            await Traversal.walkResilient(GEAR_BOB_STAND, {
                radius: 2,
                log: m => this.log(`  ${m}`)
            });
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
            this.log('gear: axe repaired at Bob, walking back to camp');
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
    async prepRepairBank() {
        const here = Game.tile();
        const canSkipBank =
            gearHasBrokenAxe() &&
            (this.repairBanked || nearBob(here)) &&
            (gearInvCoins() >= GEAR_REPAIR_COIN_FLOAT || nearBob(here));
        if (canSkipBank) {
            this.repairBanked = true;
            if (Bank.isOpen()) {
                await Bank.close();
                await Execution.delayTicks(1);
            }
            return false;
        }

        this.status = 'gear: repair 1k';
        if (!Bank.isOpen()) {
            this.log('gear: bank for Broken axe + 1k (rune repair)');
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

        if (!gearHasBrokenAxe() && (Bank.count(GEAR_BROKEN_AXE) || 0) > 0) {
            this.log('gear: withdrawing Broken axe from bank');
            await Bank.withdrawX(GEAR_BROKEN_AXE, 1);
            await Execution.delayTicks(1);
        }

        const need = GEAR_REPAIR_COIN_FLOAT - gearInvCoins();
        if (need > 0) {
            const have = gearBankCoins();
            if (have <= 0 && gearInvCoins() <= 0) {
                this.log('gear: need coins in bank to repair at Bob, waiting');
                await Bank.close();
                await Execution.delayTicks(8);
                return true;
            }
            const take = Math.min(need, have);
            if (take > 0) {
                this.log(`gear: withdrawing ${take}gp (want ${GEAR_REPAIR_COIN_FLOAT}gp for rune axe)`);
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

    async walkHomeFromBob() {
        const here = Game.tile();
        if (here && Tile.from(here).distanceTo(ANCHOR) <= LEASH) {
            this.log('gear: back at camp');
            this.repairTrip = null;
            this.repairBanked = false;
            return false;
        }
        if (Shop.isOpen()) {
            await Shop.close();
            return true;
        }
        this.status = 'gear: walk camp';
        this.log(`gear: walking back to camp @ ${ANCHOR.x},${ANCHOR.z}`);
        await Traversal.walkResilient(ANCHOR, {
            radius: 4,
            log: m => this.log(`  ${m}`)
        });
        return true;
    }

    /** @returns {Promise<boolean>} true if this loop spent time on gear prep */
    /** @returns {Promise<boolean>} true if this loop spent time on gear prep */
    async prepWcGear() {
        if (ChatDialog.isMakeMenu()) {
            return false;
        }

        if (this.repairTrip === 'home' && !gearHasBrokenAxe()) {
            return await this.walkHomeFromBob();
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

    async bootstrapWcGear() {
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

        // Initial gear bank: pack must be knife-only, then withdraw axe/coins.
        this.log('gear: depositing all except Knife');
        await Bank.depositAllMatching(name => {
            const n = (name ?? '').toLowerCase();
            return !!n && n !== 'knife';
        });
        await Execution.delayTicks(1);

        const wc = Skills.level('woodcutting');
        const best = bestAxe(wc, n => gearAxeCount(n) > 0 || (Bank.count(n) || 0) > 0);

        if (!best) {
            this.log(`gear: no usable axe in bank/pack for WC ${wc} — waiting`);
            await Bank.close();
            await Execution.delayTicks(8);
            return true;
        }

        if (gearAxeCount(best) === 0 && (Bank.count(best) || 0) > 0) {
            this.log(`gear: withdrawing ${best}`);
            if (!(await Bank.withdrawX(best, 1))) {
                this.log(`gear: withdraw failed for ${best}`);
                await Execution.delayTicks(2);
                return true;
            }
            await Execution.delayTicks(1);
        }

        if (this.fletchEnabled() && !gearHasKnife()) {
            if ((Bank.count('Knife') || 0) > 0) {
                this.log('gear: withdrawing Knife');
                await Bank.withdrawX('Knife', 1);
                await Execution.delayTicks(1);
            } else {
                this.log('gear: no Knife in bank — walking to Lumbridge castle spawn');
            }
        }

        if ((Bank.count(GEAR_BROKEN_AXE) || 0) > 0 && !gearHasBrokenAxe()) {
            this.log('gear: withdrawing Broken axe');
            await Bank.withdrawX(GEAR_BROKEN_AXE, 1);
            await Execution.delayTicks(1);
        }

        if (gearHasBrokenAxe() || (Bank.count(GEAR_BROKEN_AXE) || 0) > 0) {
            const need = GEAR_REPAIR_COIN_FLOAT - gearInvCoins();
            if (need > 0 && gearBankCoins() > 0) {
                const take = Math.min(need, gearBankCoins());
                this.log(`gear: withdrawing ${take}gp for rune axe repair`);
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
            return await this.pickupLumbridgeKnife();
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

    async pickupLumbridgeKnife() {
        this.status = 'gear: knife spawn';
        this.log('gear: walking to Lumbridge knife spawn (beside castle / behind Bob)');
        await Traversal.walkResilient(GEAR_KNIFE_SPAWN, {
            radius: 1,
            log: m => this.log(`  ${m}`)
        });

        let ground = GroundItems.query().name('Knife').within(6).nearest();
        if (!ground) {
            await Execution.delayTicks(3);
            ground = GroundItems.query().name('Knife').within(6).nearest();
        }
        if (!ground) {
            this.log('gear: Knife not on ground yet — waiting');
            await Execution.delayTicks(5);
            return true;
        }

        if (Inventory.isFull()) {
            this.log('gear: inventory full — cannot Take Knife');
            await Execution.delayTicks(5);
            return true;
        }

        this.log('gear: taking Knife');
        await ground.interact('Take');
        await Execution.delayUntil(() => gearHasKnife(), 8000);

        if (gearHasKnife() && gearBestHeldAxe()) {
            this.gearReady = true;
            this.log('gear: Knife acquired — ready');
        }
        return true;
    }

    async runSteelAxeBuy() {
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

    async buySteelAtOpenShop() {
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

    findTreeWithin(maxDistFromPlayer) {
        return Locs.query()
            .name(TREE_NAME)
            .where(l => chopOp(l.actions()) !== null)
            .where(l => Tile.from(l.tile()).distanceTo(ANCHOR) <= LEASH)
            .where(l => l.distance() <= maxDistFromPlayer)
            .nearest();
    }

    async fletchLogs(plan) {
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
            this.log('WARNING: no Knife in inventory — checking nearest bank');
            await Execution.delayTicks(2);
            return;
        }
        if (!log) {
            return;
        }

        this.status = `fletching ${plan.label}`;
        this.log(`knife → oak logs (${logCount()} left) for ${plan.label}`);
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

    async chooseMakeProduct(plan) {
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

    /** Sell all oak bows at Varrock General, bank coins, return to oaks. */
    async sellBowsBankGpAndReturn() {
        const bows = bowCount();
        const shorts = shortbowCount();
        this.status = 'walking to Varrock store';
        this.log(
            `selling` +
                (shorts ? ` ${shorts} Oak shortbow` : '') +
                (bows - shorts > 0 ? ` ${bows - shorts} Oak longbow` : '') +
                ` at Varrock General Store`
        );

        await Traversal.walkResilient(STORE_STAND, {
            radius: 2,
            log: m => this.log(`  ${m}`)
        });

        this.status = 'opening shop';
        if (!(await Shop.open(STORE_KEEPER))) {
            this.log('could not open Shop keeper — retrying next loop');
            await Execution.delayTicks(3);
            return;
        }

        this.status = 'selling bows';
        let sold = 0;
        for (let guard = 0; guard < 60 && bowCount() > 0 && Shop.isOpen(); guard++) {
            const names = bowNamesHeld();
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
                    this.log(`sold ${n}× ${name}`);
                }
                await Execution.delayTicks(1);
            }
            if (bowCount() > 0) {
                await Execution.delayTicks(1);
            }
        }

        if (Shop.isOpen()) {
            await Shop.close();
        }

        this.soldBows += sold;
        this.sellTrips++;

        if (bowCount() > 0) {
            this.log(`WARNING: still holding ${bowCount()} bows after sell — will retry`);
            await Execution.delayTicks(3);
            return;
        }

        const gp = coinCount();
        this.status = 'banking GP';
        this.log(`banking ${gp} coins at Varrock West`);

        await Banking.bankNearest({
            destination: { name: 'Varrock West', tile: VARROCK_WEST_BANK },
            deposit: name => {
                if (isKeepTool(name)) {
                    return false;
                }
                if (isCoins(name)) {
                    return true;
                }
                if (isBankableBow(name)) {
                    return true;
                }
                return isOakLog(name);
            },
            afterDeposit: async () => {
                if ((Bank.count(GEAR_BROKEN_AXE) || 0) > 0 && !gearHasBrokenAxe()) {
                    this.log('gear: withdrawing Broken axe');
                    await Bank.withdrawX(GEAR_BROKEN_AXE, 1);
                }
                if (gearHasBrokenAxe() || (Bank.count(GEAR_BROKEN_AXE) || 0) > 0) {
                    const need = GEAR_REPAIR_COIN_FLOAT - gearInvCoins();
                    if (need > 0 && gearBankCoins() > 0) {
                        const take = Math.min(need, gearBankCoins());
                        this.log(`gear: withdrawing ${take}gp for rune axe repair`);
                        await Bank.withdrawX('Coins', take);
                    }
                    this.repairBanked = true;
                    this.repairTrip = 'to_bob';
                }
                if (this.fletchEnabled() && !gearHasKnife()) {
                    if ((Bank.count('Knife') || 0) > 0) {
                        this.log('gear: withdrawing Knife');
                        await Bank.withdrawX('Knife', 1);
                    } else {
                        this.gearReady = false;
                    }
                }
                await this.refreshBankGp();
                this.maybeQueueSteelBuy();
            },
            returnTo: ANCHOR,
            log: m => this.log(`  ${m}`)
        });

        this.bankTrips++;
        this.status = 'returning to oaks';
    }

    /** Read Coins currently stored in the open bank → totalGpEarned. */
    async refreshBankGp() {
        if (!Bank.isOpen()) {
            return;
        }
        if (typeof Bank.loaded === 'function') {
            await Execution.delayUntil(() => Bank.loaded() || Bank.count('Coins') > 0, 2500);
        }
        await Execution.delayTicks(1);
        const bankCoins = Bank.count('Coins');
        this.totalGpEarned = bankCoins;
        this.log(`bank GP: ${bankCoins}`);
    }

    /** Below fletching 20: deposit oak logs only. */
    async bankLogsAndReturn() {
        const logs = logCount();
        this.status = 'banking logs';
        this.log(`banking ${logs} Oak logs (fletching < ${SHORTBOW_LEVEL})`);

        await Banking.bankNearest({
            deposit: name => {
                if (isKeepTool(name)) {
                    return false;
                }
                return isOakLog(name);
            },
            afterDeposit: async () => {
                if ((Bank.count(GEAR_BROKEN_AXE) || 0) > 0 && !gearHasBrokenAxe()) {
                    this.log('gear: withdrawing Broken axe');
                    await Bank.withdrawX(GEAR_BROKEN_AXE, 1);
                }
                if (gearHasBrokenAxe() || (Bank.count(GEAR_BROKEN_AXE) || 0) > 0) {
                    const need = GEAR_REPAIR_COIN_FLOAT - gearInvCoins();
                    if (need > 0 && gearBankCoins() > 0) {
                        const take = Math.min(need, gearBankCoins());
                        this.log(`gear: withdrawing ${take}gp for rune axe repair`);
                        await Bank.withdrawX('Coins', take);
                    }
                    this.repairBanked = true;
                    this.repairTrip = 'to_bob';
                }
                if (this.fletchEnabled() && !gearHasKnife()) {
                    if ((Bank.count('Knife') || 0) > 0) {
                        this.log('gear: withdrawing Knife');
                        await Bank.withdrawX('Knife', 1);
                    } else {
                        this.gearReady = false;
                    }
                }
                this.maybeQueueSteelBuy();
            },
            returnTo: ANCHOR,
            log: m => this.log(`  ${m}`)
        });

        this.bankTrips++;
        this.status = 'returning to oaks';
    }

    override onStop(): void {
        this.log(
            `stopped — chopped ~${this.chopped}, fletched ~${this.fletched}, ` +
                `sold ~${this.soldBows}, bank GP ${this.totalGpEarned}, sell trips ${this.sellTrips}, ` +
                `bank trips ${this.bankTrips} (${this.status})`
        );
    }

    override onPaint(ctx: CanvasRenderingContext2D): void {
        const plan = this.currentPlan();
        const elapsed = Date.now() - this.startedAt;
        const hrs = elapsed / 3_600_000;
        const wcXp = Skills.xp('woodcutting') - this.wcXpAtStart;
        const flXp = Skills.xp('fletching') - this.fletchXpAtStart;
        const wcXph = hrs > 0.008 ? wcXp / hrs : 0;
        const flXph = hrs > 0.008 ? flXp / hrs : 0;

        const lines = [
            `OakSell  WC ${Skills.level('woodcutting')}  Fletch ${Skills.level('fletching')}`,
            `time ${fmtElapsed(elapsed)}  ·  ${plan.label}${plan.sell ? ' → store+bank GP' : ' + bank'}  ·  ${this.status}`,
            `logs ${logCount()}  bows ${bowCount()}  sold ${this.soldBows}  trips ${this.sellTrips}`,
            `GP earned ${fmtXph(this.totalGpEarned)} (in bank)  ·  WC ${fmtXph(wcXph)}/hr  Fletch ${fmtXph(flXph)}/hr`
        ];

        ctx.font = '12px monospace';
        let maxW = 0;
        for (const line of lines) {
            maxW = Math.max(maxW, ctx.measureText(line).width);
        }
        const pad = 6;
        const lineH = 16;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(6, 6, maxW + pad * 2, pad * 2 + lines.length * lineH);
        ctx.fillStyle = '#9ecb6a';
        lines.forEach((line, i) => {
            ctx.fillText(line, 6 + pad, 6 + pad + (i + 1) * lineH - 4);
        });
    }
}

export default defineBot({
    name: SCRIPT_NAME,
    version: '1.2.0',
    category: 'Fletching',
    tags: ['woodcutting', 'fletching', 'oak', 'shortbow', 'longbow', 'sell', 'varrock'],
    description:
        'Chops oak trees north of Varrock. Optional fletching into oak shortbows at 20 or longbows at 25, then sells the bows at Varrock General Store and banks the coins.',
    settingsSchema: {
        fletchLogs: {
            type: 'boolean',
            default: true,
            label: 'Fletch logs into bows',
            group: 'Fletching',
            help: 'When on: fletch oak shortbows at 20 / longbows at 25 (needs a Knife), sell them, then bank GP. When off: bank the logs.'
        }
    },
    create: () => new OakTreeFletcherSell()
});
