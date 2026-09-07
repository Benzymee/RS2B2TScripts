/**
 * BowTrader: bank everything at the nearest bank, withdraw every bow and
 * unstrung bow as notes, then trade those notes to a named player.
 * Walks close, Trade.request, offerAll, Accept both screens. After a trade,
 * banks again if more bows remain.
 * Completely vibe coded by @.benzyme on Discord via Cursor AI.
 * Self-contained ESM for rs2b0t Load local script / Load URL.
 *
 * Load URL: https://benzymee.github.io/RS2B2TScripts/BowTrader.js
 */
const SUPPORTED_API_VERSION = 1;
const abi = globalThis.__rs2b0t;
if (!abi) {
    throw new Error('BowTrader: globalThis.__rs2b0t missing, load inside rs2b0t bot.html');
}
if (abi.apiVersion !== SUPPORTED_API_VERSION) {
    throw new Error(`BowTrader: ABI ${abi.apiVersion} != supported ${SUPPORTED_API_VERSION}`);
}

const {
    defineBot,
    Execution,
    Game,
    LoopingBot,
    Players,
    Inventory,
    Bank,
    Banking,
    Traversal,
    Tile,
    ChatDialog,
    Trade,
    withdrawOp
} = abi;

if (!Trade || typeof Trade.active !== 'function') {
    throw new Error('BowTrader: Trade API missing from __rs2b0t');
}
if (!Bank || !Banking || typeof Banking.open !== 'function') {
    throw new Error('BowTrader: Bank API missing from __rs2b0t');
}

const SCRIPT_NAME = 'BowTrader';
const SCRIPT_TITLE = "Benzyme's Bow Trader";
const SCRIPT_VERSION = '1.0.1';
const WELCOME_SCREEN_ID = 5993;

const TRADE_RANGE = 2;
const TRADE_REQUEST_COOLDOWN_TICKS = 9;
const TRADE_OPEN_WAIT_MS = 5_000;
const TRADE_OFFER_WAIT_MS = 5_000;
const TRADE_CONFIRM_WAIT_MS = 8_000;
const WISHES_TRADE_RE = /wishes to trade with you/i;

const PAINT_X = 4;
const PAINT_Y = 4;
const PAINT_FILL = 'rgba(6, 14, 28, 0.64)';
const PAINT_BORDER = 'rgba(180, 150, 80, 0.7)';
const PAINT_INK = '#d8c48a';

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

function normName(name) {
    return (name ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Shortbow, longbow, wood-tier bows, unstrung / (u) names. Noted or unnoted.
 * Skips bow string, crossbow, and bowl.
 */
function isBowOrUnstrung(name) {
    const n = normName(name);
    if (!n) {
        return false;
    }
    if (n.includes('bowstring') || n.includes('bow string')) {
        return false;
    }
    if (n.includes('crossbow')) {
        return false;
    }
    if (n.includes('unstrung') && n.includes('bow')) {
        return true;
    }
    if (/\(u\)/.test(n) && n.includes('bow')) {
        return true;
    }
    if (n.includes('shortbow') || n.includes('longbow')) {
        return true;
    }
    if (n.includes('short bow') || n.includes('long bow')) {
        return true;
    }
    return /(^| )bow$/.test(n);
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

function isNotedBow(item) {
    if (!item || !isBowOrUnstrung(item.name)) {
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

function invBowItems() {
    return Inventory.items().filter(i => isBowOrUnstrung(i.name));
}

function invBowCount() {
    return invBowItems().reduce((n, i) => n + Math.max(1, i.count), 0);
}

function notedBowCount() {
    return invBowItems()
        .filter(isNotedBow)
        .reduce((n, i) => n + Math.max(1, i.count), 0);
}

function unnotedBowCount() {
    return invBowItems()
        .filter(i => !isNotedBow(i))
        .reduce((n, i) => n + Math.max(1, i.count), 0);
}

function invHasNonBow() {
    return Inventory.items().some(i => !isBowOrUnstrung(i.name));
}

function bankBowItems() {
    return (Bank.items?.() ?? []).filter(i => isBowOrUnstrung(i.name));
}

function bankBowCount() {
    return bankBowItems().reduce((n, i) => n + Math.max(1, i.count), 0);
}

function bankBowNames() {
    const names = [];
    const seen = new Set();
    for (const item of bankBowItems()) {
        const name = (item.name ?? '').trim();
        const key = normName(name);
        if (!name || seen.has(key)) {
            continue;
        }
        seen.add(key);
        names.push(name);
    }
    return names;
}

function bankCountByName(name) {
    const want = normName(name);
    const fromItems = bankBowItems()
        .filter(i => normName(i.name) === want)
        .reduce((n, i) => n + Math.max(1, i.count), 0);
    if (fromItems > 0) {
        return fromItems;
    }
    if (typeof Bank.count === 'function') {
        return Bank.count(name) || 0;
    }
    return 0;
}

function invBowNames() {
    const names = [];
    const seen = new Set();
    for (const item of invBowItems()) {
        const name = (item.name ?? '').trim();
        const key = normName(name);
        if (!name || seen.has(key)) {
            continue;
        }
        seen.add(key);
        names.push(name);
    }
    return names;
}

function offerHasBows() {
    if (typeof Trade.myOffer !== 'function') {
        return false;
    }
    return Trade.myOffer().some(i => isBowOrUnstrung(i.name));
}

function parseTradeWishName(e) {
    const fromUser = (e?.username ?? '').trim();
    if (fromUser) {
        return fromUser;
    }
    const text = (e?.text ?? '').trim();
    const m = text.match(/^(.+?)\s+wishes to trade with you\.?$/i);
    return m ? m[1].trim() : null;
}

function namesMatch(a, b) {
    return normName(a) !== '' && normName(a) === normName(b);
}

class BowTrader extends LoopingBot {
    status = 'starting';
    startedAt = 0;
    trades = 0;
    bowsSent = 0;
    /** @type {string | null} */
    pendingFrom = null;
    nextRequestTick = 0;
    /** Noted bows withdrawn and ready to trade. */
    readyToTrade = false;

    partnerName() {
        const fromSettings =
            typeof this.settings?.str === 'function' ? this.settings.str('partnerName', '') : '';
        return String(fromSettings ?? '').trim();
    }

    async onStart() {
        await Execution.delayUntil(() => Game.ingame() && Game.tile() !== null, 0);
        if (typeof Traversal?.preload === 'function') {
            Traversal.preload();
        }

        this.startedAt = Date.now();
        this.trades = 0;
        this.bowsSent = 0;
        this.pendingFrom = null;
        this.nextRequestTick = 0;
        this.readyToTrade = false;

        this.on('chat.message', e => {
            if (!WISHES_TRADE_RE.test(e?.text ?? '')) {
                return;
            }
            const who = parseTradeWishName(e);
            const want = this.partnerName();
            if (!who || !want || !namesMatch(who, want)) {
                return;
            }
            this.pendingFrom = who;
            this.log(`incoming trade from ${who}`);
        });

        const who = this.partnerName();
        this.log(
            `${SCRIPT_TITLE} ${SCRIPT_VERSION}. Bank all, withdraw noted bows, trade to ${who || '(set Partner name)'}`
        );
        this.status = who ? 'to bank' : 'set Partner name';
    }

    onStop() {
        this.log(`stopped, trades ${this.trades}, bows ~${this.bowsSent} (${this.status})`);
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

        if (Trade.active()) {
            await this.handleActiveTrade();
            return;
        }

        const who = this.partnerName();
        if (!who) {
            this.status = 'set Partner name';
            await Execution.delayTicks(4);
            return;
        }

        if (!this.readyToTrade) {
            await this.bankNotedBows();
            return;
        }

        if (notedBowCount() <= 0 && invBowCount() <= 0) {
            this.readyToTrade = false;
            await this.bankNotedBows();
            return;
        }

        if (this.pendingFrom && namesMatch(this.pendingFrom, who)) {
            await this.openTrade(this.pendingFrom);
            return;
        }

        await this.findAndRequest(who);
    }

    async waitBankLoaded() {
        if (typeof Bank.loaded === 'function') {
            await Execution.delayUntil(() => Bank.loaded() || Bank.items().length > 0, 3000);
        }
        await Execution.delayTicks(1);
    }

    async depositEverything() {
        if (Inventory.items().length <= 0) {
            return;
        }
        this.log('depositing inventory');
        if (typeof Bank.depositInventory === 'function') {
            await Bank.depositInventory();
        } else if (typeof Bank.depositAllMatching === 'function') {
            await Bank.depositAllMatching(() => true);
        }
        await Execution.delayTicks(1);
    }

    notedWithdrawAllOp(bankItem) {
        const ops = Array.isArray(bankItem?.ops) ? bankItem.ops : [];
        const noteAll = ops.find(a => /withdraw/i.test(String(a)) && /note|cert/i.test(String(a)));
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
            this.log('WARNING: Bank.setNoteMode missing, noted withdraw may fail');
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

    async withdrawAllBowsNoted() {
        const names = bankBowNames();
        if (names.length <= 0) {
            return true;
        }
        this.log(`withdrawing ${bankBowCount()} bows as notes`);
        await this.ensureBankNoteMode(true);

        for (const name of names) {
            if (!Bank.isOpen()) {
                return false;
            }
            const have = bankCountByName(name);
            if (have <= 0) {
                continue;
            }
            if (typeof Inventory.free === 'function' && Inventory.free() <= 0) {
                this.log('pack full of notes, will trade then bank again');
                break;
            }
            const bankItem =
                (Bank.items?.() ?? []).find(i => normName(i.name) === normName(name)) ?? null;
            const op = this.notedWithdrawAllOp(bankItem);
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
                () => bankCountByName(name) < have || notedBowCount() > 0,
                2000
            );
            await Execution.delayTicks(1);
            if (ok) {
                this.log(`withdrew ${name} as notes`);
            } else {
                this.log(`withdraw ${name} did not confirm, will retry`);
            }
        }
        await Execution.delayTicks(1);
        return unnotedBowCount() <= 0;
    }

    async bankNotedBows() {
        this.status = 'banking';
        this.readyToTrade = false;

        if (!Bank.isOpen()) {
            this.log('opening nearest bank');
            if (!(await Banking.open({ log: m => this.log(`  ${m}`) }))) {
                this.log('could not open bank, retrying');
                await Execution.delayTicks(3);
                return;
            }
        }
        await this.waitBankLoaded();
        await this.depositEverything();
        await this.waitBankLoaded();

        if (unnotedBowCount() > 0) {
            this.log(`depositing ${unnotedBowCount()} unnoted bows`);
            if (typeof Bank.depositAllMatching === 'function') {
                await Bank.depositAllMatching((name, id) => {
                    const item = { name, id };
                    return isBowOrUnstrung(name) && !isNotedBow(item);
                });
            }
            await Execution.delayTicks(1);
        }

        if (invHasNonBow()) {
            this.log('depositing leftover non-bow items');
            await this.depositEverything();
            await Execution.delayTicks(1);
        }

        const banked = bankBowCount();
        if (banked <= 0 && notedBowCount() <= 0) {
            this.status = 'waiting for bows in bank';
            this.log('no bows in bank, waiting');
            if (Bank.isOpen()) {
                await Bank.close();
            }
            await Execution.delayTicks(8);
            return;
        }

        if (banked > 0) {
            const notedOk = await this.withdrawAllBowsNoted();
            if (!notedOk && unnotedBowCount() > 0) {
                this.log('withdraw came out unnoted, re-depositing');
                if (typeof Bank.depositAllMatching === 'function') {
                    await Bank.depositAllMatching((name, id) => {
                        const item = { name, id };
                        return isBowOrUnstrung(name) && !isNotedBow(item);
                    });
                }
                await Execution.delayTicks(2);
                return;
            }
            if (notedBowCount() <= 0 && invBowCount() <= 0) {
                this.log('withdraw did not land bows, retrying');
                await Execution.delayTicks(2);
                return;
            }
        }

        if (typeof Bank.setNoteMode === 'function') {
            await Bank.setNoteMode(false);
        }
        if (Bank.isOpen()) {
            await Bank.close();
        }

        this.readyToTrade = true;
        this.log(`holding ${notedBowCount() || invBowCount()} noted bows, looking for partner`);
        this.status = 'find partner';
    }

    canRequestTrade() {
        const tick = typeof Game.tick === 'function' ? Game.tick() : 0;
        return tick >= this.nextRequestTick;
    }

    noteTradeRequest() {
        const tick = typeof Game.tick === 'function' ? Game.tick() : 0;
        this.nextRequestTick = tick + TRADE_REQUEST_COOLDOWN_TICKS;
    }

    findPartner(name) {
        if (!name || typeof Players?.query !== 'function') {
            return null;
        }
        return Players.query().name(name).nearest() ?? null;
    }

    async findAndRequest(name) {
        const partner = this.findPartner(name);
        if (!partner) {
            this.status = `waiting for ${name}`;
            await Execution.delayTicks(3);
            return;
        }

        const dist = typeof partner.distance === 'function' ? partner.distance() : 99;
        if (dist > TRADE_RANGE) {
            this.status = `walking to ${name}`;
            const pt = partner.tile?.() ?? null;
            if (pt && typeof Traversal.walkTo === 'function') {
                await Traversal.walkTo(Tile.from(pt), {
                    radius: TRADE_RANGE,
                    timeoutMs: 12_000,
                    log: m => this.log(`  ${m}`)
                });
            } else {
                await Execution.delayTicks(2);
            }
            return;
        }

        await this.openTrade(name);
    }

    async openTrade(name) {
        if (!this.canRequestTrade()) {
            this.status = `cooldown, ${name}`;
            await Execution.delayTicks(1);
            return;
        }

        this.status = `trading ${name}`;
        this.log(`Trade with ${name}`);
        this.noteTradeRequest();
        await Trade.request(name);
        await Execution.delayUntil(() => Trade.active(), TRADE_OPEN_WAIT_MS);
        if (!Trade.active()) {
            this.log(`trade with ${name} did not open`);
        } else {
            this.pendingFrom = null;
        }
    }

    async offerBows() {
        if (typeof Trade.offerAll !== 'function') {
            this.log('Trade.offerAll missing, declining');
            await Trade.decline();
            return false;
        }

        let offeredOk = false;
        for (const name of invBowNames()) {
            let thisOk = !!(await Trade.offerAll(name, i => isBowOrUnstrung(i.name)));
            if (!thisOk) {
                thisOk = !!(await Trade.offerAll(name));
            }
            if (thisOk) {
                offeredOk = true;
            }
        }
        if (!offeredOk) {
            this.log('offerAll bows failed, declining');
            await Trade.decline();
            return false;
        }
        await Execution.delayUntil(
            () => offerHasBows() || Trade.onConfirmScreen() || !Trade.active(),
            TRADE_OFFER_WAIT_MS
        );
        return true;
    }

    async handleActiveTrade() {
        const want = this.partnerName();
        const who = typeof Trade.partner === 'function' ? Trade.partner() : null;
        if (who && want && !namesMatch(who, want)) {
            this.log(`declining trade with ${who}, want ${want}`);
            await Trade.decline();
            this.pendingFrom = null;
            return;
        }

        if (Trade.onConfirmScreen()) {
            this.status = 'confirming trade';
            const before = invBowCount();
            await Trade.accept();
            await Execution.delayUntil(() => !Trade.active(), TRADE_CONFIRM_WAIT_MS);
            if (!Trade.active()) {
                const sent = Math.max(0, before - invBowCount());
                this.trades++;
                this.bowsSent += sent;
                this.pendingFrom = null;
                this.log(
                    `trade complete` +
                        (sent > 0 ? ` (${sent} bows)` : '') +
                        `, total trades ${this.trades}`
                );
                if (invBowCount() <= 0) {
                    this.readyToTrade = false;
                    this.status = 'to bank';
                } else {
                    this.status = 'find partner';
                }
            } else {
                this.log('confirm still open, partner may not have accepted yet');
            }
            return;
        }

        if (!Trade.onOfferScreen()) {
            await Execution.delayTicks(1);
            return;
        }

        if (!offerHasBows()) {
            if (invBowCount() <= 0) {
                this.log('no bows in pack, declining');
                await Trade.decline();
                return;
            }
            this.status = 'offering bows';
            await this.offerBows();
            return;
        }

        this.status = `accepting offer (${who ?? want})`;
        await Trade.accept();
        await Execution.delayUntil(
            () => Trade.onConfirmScreen() || !Trade.active(),
            TRADE_OFFER_WAIT_MS
        );
    }

    onPaint(ctx) {
        const elapsed = Date.now() - this.startedAt;
        const who = this.partnerName() || 'unset';
        const lines = [
            `${SCRIPT_TITLE} | ${this.status} | ${fmtElapsed(elapsed)}`,
            `partner ${who} | notes ${notedBowCount()} | trades ${this.trades} | sent ~${this.bowsSent}`
        ];
        ctx.font = 'bold 13px monospace';
        let maxW = 0;
        for (const line of lines) {
            maxW = Math.max(maxW, ctx.measureText(line).width);
        }
        const pad = 6;
        const lineH = 16;
        const w = Math.ceil(maxW + pad * 2);
        const h = pad * 2 + lines.length * lineH;
        ctx.fillStyle = PAINT_FILL;
        ctx.fillRect(PAINT_X, PAINT_Y, w, h);
        ctx.strokeStyle = PAINT_BORDER;
        ctx.lineWidth = 1;
        ctx.strokeRect(PAINT_X + 0.5, PAINT_Y + 0.5, w - 1, h - 1);
        ctx.fillStyle = PAINT_INK;
        lines.forEach((line, i) => {
            ctx.fillText(line, PAINT_X + pad, PAINT_Y + pad + (i + 1) * lineH - 4);
        });
    }
}

export default defineBot({
    name: SCRIPT_NAME,
    version: SCRIPT_VERSION,
    category: 'Utility',
    tags: ['trade', 'mule', 'bow', 'unstrung', 'fletching'],
    description:
        "Benzyme's Bow Trader. Banks everything at the nearest bank, withdraws every bow and unstrung bow as notes, then trades those notes to the named player. After a trade, banks again if more bows remain. Set Partner name.",
    settingsSchema: {
        partnerName: {
            type: 'string',
            default: '',
            label: 'Partner name',
            group: 'Trade',
            help: 'Exact in-game name of the player who runs Bow Trade Acceptor.'
        }
    },
    create: () => new BowTrader()
});
