/**
 * BackyardYews. Chops yew trees behind Varrock castle. Optional fletching into unstrung bows.
 *
 * Load URL: https://cdn.jsdelivr.net/gh/Benzymee/RS2B2TScripts@main/BackyardYews.js
 */
const SUPPORTED_API_VERSION = 1;
const abi = globalThis.__rs2b0t;
if (!abi) {
    throw new Error('BackyardYews: globalThis.__rs2b0t missing, load inside rs2b0t bot.html');
}
if (abi.apiVersion !== SUPPORTED_API_VERSION) {
    throw new Error(
        `BackyardYews: ABI ${abi.apiVersion} != supported ${SUPPORTED_API_VERSION}`
    );
}

const {
    defineBot,
    Execution,
    Game,
    LoopingBot: LoopingBotBase,
    Locs,
    Npcs,
    Players,
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

const SCRIPT_NAME = 'BackyardYews';
const SCRIPT_TITLE = "Benzyme's Backyard Yews";
const SCRIPT_VERSION = '1.0.0';

const TITLE_WOOD = '#8B5A2B';

const WELCOME_SCREEN_ID = 5993;

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

/** Three yews on the lawn behind Varrock castle. */
const ANCHOR = new Tile(3214, 3503, 0);
const LEASH = 20;
const TREE_NAME = 'Yew';

/** Fletching tier thresholds. */
const SHORTBOW_LEVEL = 65;
const LONGBOW_LEVEL = 70;
const YEW_WC_LEVEL = 60;

/** Varrock west bank stand (same pin as castle guards / west anvils). */
const VARROCK_WEST_BANK = new Tile(3185, 3440, 0);
const BANK_OPEN_RADIUS = 8;

/** Bob steel axe / repair (Lumbridge). */
const GEAR_BOB_STAND = new Tile(3231, 3203, 0);
const GEAR_BROKEN_AXE = 'Broken axe';
const GEAR_REPAIR_PREFER = ['repair', 'fix', 'fix my', 'yes'];
const GEAR_REPAIR_COIN_FLOAT = 1000;

const KEEP_KNIFE = 'knife';
const KEEP_BROKEN_AXE = 'broken axe';

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

function nearTile(tile, dest, radius) {
    return !!tile && !!dest && Tile.from(tile).distanceTo(dest) <= radius;
}

function nearBob(tile = Game.tile()) {
    return nearTile(tile, GEAR_BOB_STAND, 12);
}

function nearVarrockWestBank(tile = Game.tile()) {
    return nearTile(tile, VARROCK_WEST_BANK, BANK_OPEN_RADIUS);
}

function chopOp(actions) {
    return actions.find(a => /chop/i.test(a)) ?? null;
}

function otherPlayersNear(tile, dist = 2) {
    if (!tile || typeof Players?.query !== 'function') {
        return 0;
    }
    const t = Tile.from(tile);
    return Players.query()
        .where(p => {
            const pt = p.tile?.() ?? null;
            return pt != null && Tile.from(pt).distanceTo(t) <= dist;
        })
        .count();
}

function isKeepTool(name) {
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

function hasEssentialsAfterBank(needKnife = true) {
    if (needKnife && !gearHasKnife()) {
        return false;
    }
    return gearHasBrokenAxe() || !!gearBestHeldAxe();
}

function normName(name) {
    return (name ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function isFletchedShortbow(name) {
    const n = normName(name);
    if (!n.includes('yew')) {
        return false;
    }
    return n.includes('short') && n.includes('bow');
}

function isFletchedLongbow(name) {
    const n = normName(name);
    if (!n.includes('yew')) {
        return false;
    }
    return n.includes('long') && n.includes('bow');
}

function isBankableBow(name) {
    return isFletchedShortbow(name) || isFletchedLongbow(name);
}

function isYewLog(name) {
    const n = normName(name);
    return n === 'yew logs' || n === 'yew log';
}

function isCoins(name) {
    return (name ?? '').toLowerCase() === 'coins';
}

function fletchPlan(level, fletchOn = true) {
    if (!fletchOn || level < SHORTBOW_LEVEL) {
        return {
            id: 'logs',
            menuMatch: '',
            label: 'Yew logs (bank)',
            bank: true,
            fletch: false
        };
    }
    if (level < LONGBOW_LEVEL) {
        return {
            id: 'yew-shortbow',
            menuMatch: 'short',
            label: 'Yew shortbow (u)',
            bank: true,
            fletch: true
        };
    }
    return {
        id: 'yew-longbow',
        menuMatch: 'long',
        label: 'Yew longbow (u)',
        bank: true,
        fletch: true
    };
}

function matchMakeProduct(products, menuMatch) {
    const want = menuMatch.toLowerCase();
    const yewish = products.filter(p => (p ?? '').toLowerCase().includes('yew'));
    const pool = yewish.length > 0 ? yewish : products;
    return pool.find(p => (p ?? '').toLowerCase().includes(want)) ?? null;
}

function logCount() {
    return Inventory.items()
        .filter(i => isYewLog(i.name))
        .reduce((n, i) => n + Math.max(1, i.count), 0);
}

function knifeItem() {
    return Inventory.items().find(i => (i.name ?? '').toLowerCase().includes('knife')) ?? null;
}

function lastLog() {
    const items = Inventory.items();
    for (let i = items.length - 1; i >= 0; i--) {
        if (isYewLog(items[i].name)) {
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

function isKeepInventory(name) {
    if (!name) {
        return false;
    }
    return isKeepTool(name) || isYewLog(name) || isBankableBow(name) || isCoins(name);
}

function junkInvItem() {
    return Inventory.items().find(i => !isKeepInventory(i.name)) ?? null;
}

function needsBankTrip(plan) {
    if (logCount() > 0 && plan.fletch) {
        return false;
    }
    if (plan.bank && bowCount() > 0) {
        return true;
    }
    if (!plan.fletch && logCount() > 0 && Inventory.isFull()) {
        return true;
    }
    if (plan.fletch && logCount() === 0 && bowCount() > 0) {
        return true;
    }
    return !plan.fletch && logCount() > 0 && Inventory.isFull();
}

class BackyardYews extends LoopingBotBase {
    status = 'starting';
    startedAt = 0;
    wcXpAtStart = 0;
    fletchXpAtStart = 0;
    chopped = 0;
    fletched = 0;
    bankTrips = 0;
    planId = 'logs';
    gearReady = false;
    /** @type {null | 'to_bob' | 'home'} */
    repairTrip = null;
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

    async onStart() {
        await Execution.delayUntil(() => Game.ingame() && Game.tile() !== null, 0);
        if (typeof Traversal?.preload === 'function') {
            Traversal.preload();
        }

        this.startedAt = Date.now();
        this.wcXpAtStart = Skills.xp('woodcutting');
        this.fletchXpAtStart = Skills.xp('fletching');
        this.planId = this.currentPlan().id;
        this.gearReady = false;
        this.repairTrip = null;
        this.repairBanked = false;

        this.on('skill.level', e => {
            if (e.name === 'fletching') {
                const plan = this.planAt(e.level);
                this.log(`fletching ${e.previous} -> ${e.level}, now making ${plan.label}`);
                this.planId = plan.id;
            }
            if (e.name === 'woodcutting') {
                this.log(`woodcutting ${e.previous} -> ${e.level}`);
            }
        });

        const plan = this.currentPlan();
        const wc = Skills.level('woodcutting');
        this.log(
            `${SCRIPT_TITLE} @ ${ANCHOR.x},${ANCHOR.z} (leash ${LEASH}), bank Varrock west ${VARROCK_WEST_BANK.x},${VARROCK_WEST_BANK.z}`
        );
        this.log(
            this.fletchEnabled()
                ? `fletching ${Skills.level('fletching')} -> ${plan.label}`
                : 'banking logs (fletch off)'
        );
        if (wc < YEW_WC_LEVEL) {
            this.log(`Woodcutting ${wc} < ${YEW_WC_LEVEL}, yews will not chop until 60`);
        }
        this.status = 'ready';
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

        if (ChatDialog.canContinue()) {
            this.status = 'continue dialog';
            await ChatDialog.continue();
            return;
        }

        if (!ChatDialog.isMakeMenu() && (await this.handleDropJunk())) {
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

        if (needsBankTrip(plan) || (!plan.fletch && Inventory.isFull() && logCount() > 0)) {
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
            this.status = 'returning to yews';
            this.log('walking back to backyard yews');
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
            this.status = 'waiting for yew';
            await Traversal.walkTo(ANCHOR, { radius: 3, timeoutMs: 10_000 });
            await Execution.delayTicks(2);
            return;
        }

        const op = chopOp(tree.actions());
        if (!op) {
            this.log(`Yew has no chop action: [${tree.actions().join(', ')}]`);
            await Execution.delayTicks(2);
            return;
        }

        const before = logCount();
        const contested = otherPlayersNear(tree.tile(), 2);
        this.status = contested
            ? `chopping contested (${tree.distance()}t)`
            : `chopping (${tree.distance()}t)`;
        this.log(
            `chopping Yew @ ${tree.tile().x},${tree.tile().z}` +
                (contested ? ` (${contested} other player(s) on it)` : '')
        );
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

    async handleDropJunk() {
        const item = junkInvItem();
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

    /**
     * Walk to the Varrock west booths and open them. Never uses another town's bank.
     * @returns {Promise<boolean>}
     */
    async openVarrockWestBank() {
        if (Bank.isOpen()) {
            if (nearVarrockWestBank(Game.tile())) {
                return true;
            }
            this.log('wrong bank open, closing');
            await Bank.close();
            await Execution.delayTicks(1);
        }

        const here = Game.tile();
        if (here && !nearVarrockWestBank(here)) {
            this.status = 'walking to Varrock west bank';
            this.log(`walking to Varrock west bank ${VARROCK_WEST_BANK.x},${VARROCK_WEST_BANK.z}`);
            const ok = await Traversal.walkResilient(VARROCK_WEST_BANK, {
                radius: 4,
                log: m => this.log(`  ${m}`)
            });
            if (!ok) {
                this.log('path to Varrock west bank failed, retrying');
                return false;
            }
        }

        if (!nearVarrockWestBank(Game.tile())) {
            return false;
        }

        this.status = 'opening Varrock west bank';
        this.log('opening Varrock west bank booth');
        if (typeof Bank.openBooth === 'function') {
            return !!(await Bank.openBooth(VARROCK_WEST_BANK, 'Bank booth', 'Use-quickly', m =>
                this.log(`  ${m}`)
            ));
        }
        return !!(await Banking.open({
            stand: VARROCK_WEST_BANK,
            log: m => this.log(`  ${m}`)
        }));
    }

    findTree() {
        const trees = Locs.query()
            .name(TREE_NAME)
            .where(l => chopOp(l.actions()) !== null)
            .where(l => Tile.from(l.tile()).distanceTo(ANCHOR) <= LEASH)
            .results();
        if (!trees.length) {
            return null;
        }
        const contested = trees.filter(t => otherPlayersNear(t.tile(), 2) > 0);
        const pool = contested.length > 0 ? contested : trees;
        pool.sort((a, b) => a.distance() - b.distance());
        return pool[0] ?? null;
    }

    findTreeWithin(maxDistFromPlayer) {
        const trees = Locs.query()
            .name(TREE_NAME)
            .where(l => chopOp(l.actions()) !== null)
            .where(l => Tile.from(l.tile()).distanceTo(ANCHOR) <= LEASH)
            .where(l => l.distance() <= maxDistFromPlayer)
            .results();
        if (!trees.length) {
            return null;
        }
        const contested = trees.filter(t => otherPlayersNear(t.tile(), 2) > 0);
        const pool = contested.length > 0 ? contested : trees;
        pool.sort((a, b) => a.distance() - b.distance());
        return pool[0] ?? null;
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
            this.log('no Knife in inventory, will check Varrock west bank');
            await Execution.delayTicks(2);
            return;
        }
        if (!log) {
            return;
        }

        this.status = `fletching ${plan.label}`;
        this.log(`knife -> yew logs (${logCount()} left) for ${plan.label}`);
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
            this.log('fletch useOn did not start, retrying');
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
                `make menu missing '${plan.label}' (have: [${products.join(', ')}]), closing`
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

    async bankProductsAndReturn() {
        const flvl = Skills.level('fletching');
        const bows = bowCount();
        const shorts = shortbowCount();
        const logs = logCount();
        this.status = 'banking Varrock west';
        this.log(
            `banking at Varrock west` +
                (shorts ? ` ${shorts} Yew shortbow (u)` : '') +
                (bows - shorts > 0 ? ` ${bows - shorts} Yew longbow (u)` : '') +
                (logs ? ` ${logs} Yew logs` : '') +
                ` (fletching ${flvl})`
        );

        await Banking.bankNearest({
            destination: { name: 'Varrock West', tile: VARROCK_WEST_BANK },
            deposit: name => !isKeepTool(name),
            afterDeposit: async () => {
                await this.restockEssentialsFromOpenBank();
            },
            returnTo: ANCHOR,
            log: m => this.log(`  ${m}`)
        });

        this.bankTrips++;
        this.status = 'returning to yews';
    }

    async restockEssentialsFromOpenBank() {
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
                this.log(`gear: no usable axe in Varrock west bank for WC ${wc}`);
            }
        }

        return hasEssentialsAfterBank(needKnife);
    }

    stopNoKnife(context) {
        this.status = 'no knife, stopped';
        this.log(
            `${context}: no Knife in inventory or Varrock west bank, stopping (withdraw a Knife, then restart)`
        );
        stopScript();
    }

    async prepWcGear() {
        if (ChatDialog.isMakeMenu()) {
            return false;
        }

        if (this.repairTrip === 'home' && !gearHasBrokenAxe()) {
            return await this.walkHomeFromBob();
        }

        if (gearHasBrokenAxe() || (Bank.isOpen() && (Bank.count(GEAR_BROKEN_AXE) || 0) > 0)) {
            return await this.repairBrokenAxeAtBob();
        }

        if (this.gearReady && this.fletchEnabled() && !gearHasKnife()) {
            this.log('gear: Knife missing, checking Varrock west bank');
            this.gearReady = false;
        }

        if (this.gearReady) {
            return false;
        }

        if (Shop.isOpen()) {
            await Shop.close();
            return true;
        }

        return await this.bootstrapWcGear();
    }

    async bootstrapWcGear() {
        this.status = 'gear: Varrock west bank';

        if (!Bank.isOpen()) {
            this.log('gear: opening Varrock west bank for best axe / knife');
            if (!(await this.openVarrockWestBank())) {
                this.log('gear: could not open Varrock west bank, retrying');
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

        const wc = Skills.level('woodcutting');
        const best = bestAxe(wc, n => gearAxeCount(n) > 0 || (Bank.count(n) || 0) > 0);

        if (!best) {
            this.log(`gear: no usable axe in Varrock west bank/pack for WC ${wc}, waiting`);
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
                await Bank.close();
                this.stopNoKnife('gear');
                return true;
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
            this.log('gear: still missing axe after Varrock west bank');
            await Execution.delayTicks(5);
            return true;
        }

        this.gearReady = true;
        this.log(`gear: ready, ${gearBestHeldAxe()}`);
        return true;
    }

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
            this.log('gear: axe repaired at Bob, walking back to backyard yews');
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
            this.log('gear: Varrock west bank for Broken axe + 1k (rune repair)');
            if (!(await this.openVarrockWestBank())) {
                this.log('gear: could not open Varrock west bank for repair coins');
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
                this.log('gear: need coins in Varrock west bank to repair at Bob, waiting');
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
            this.log('gear: back at backyard yews');
            this.repairTrip = null;
            this.repairBanked = false;
            return false;
        }
        if (Shop.isOpen()) {
            await Shop.close();
            return true;
        }
        this.status = 'gear: walk yews';
        this.log(`gear: walking back to yews @ ${ANCHOR.x},${ANCHOR.z}`);
        await Traversal.walkResilient(ANCHOR, {
            radius: 4,
            log: m => this.log(`  ${m}`)
        });
        return true;
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

    onStop() {
        const snap = this.sessionSnapshot();
        this.log(
            `stopped, chopped ~${this.chopped}, fletched ~${this.fletched} bows, ` +
                `bank trips ${this.bankTrips}, ${fmtElapsed(snap.runtimeMs)} (${this.status})`
        );
    }

    onPaint(ctx) {
        const plan = this.currentPlan();
        const snap = this.sessionSnapshot();
        const lines = [
            SCRIPT_TITLE,
            `time ${fmtElapsed(snap.runtimeMs)} · ${this.status}`,
            `Woodcutting ${Skills.level('woodcutting')} · Fletching ${Skills.level('fletching')}`,
            `${plan.label}${plan.bank ? ' + Varrock west bank' : ''}`,
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
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#000';
        lines.forEach((line, i) => {
            const y = y0 + i * lineH;
            ctx.strokeText(line, x, y);
            ctx.fillStyle = i === 0 ? TITLE_WOOD : '#ffffff';
            ctx.fillText(line, x, y);
        });
        ctx.restore();
    }
}

export default defineBot({
    name: SCRIPT_NAME,
    version: SCRIPT_VERSION,
    category: 'Fletching',
    tags: ['woodcutting', 'fletching', 'yew', 'varrock', 'shortbow', 'longbow'],
    description:
        'Chops yew trees behind Varrock castle. Optional fletching into yew shortbows (u) at 65 or longbows (u) at 70, then banks at Varrock west.',
    settingsSchema: {
        fletchLogs: {
            type: 'boolean',
            default: true,
            label: 'Fletch logs into unstrung bows',
            group: 'Fletching',
            help: 'When on: fletch yew shortbows (u) at 65 / longbows (u) at 70 (needs a Knife), then bank those at Varrock west. When off: bank the logs. Missing Knife in Varrock west bank stops the script.'
        }
    },
    create: () => new BackyardYews()
});
