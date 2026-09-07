/**
 * BowTradeAcceptor: stand still and take incoming trades of bows / unstrung
 * bows. Listens for "wishes to trade", opens the trade, waits for the offerer
 * to Accept, then Accepts both screens. Declines if your offer is not empty
 * or their offer has anything that is not a bow.
 * Completely vibe coded by @.benzyme on Discord via Cursor AI.
 * Self-contained ESM for rs2b0t Load local script / Load URL.
 *
 * Load URL: https://benzymee.github.io/RS2B2TScripts/BowTradeAcceptor.js
 */
const SUPPORTED_API_VERSION = 1;
const abi = globalThis.__rs2b0t;
if (!abi) {
    throw new Error(
        'BowTradeAcceptor: globalThis.__rs2b0t missing, load inside rs2b0t bot.html'
    );
}
if (abi.apiVersion !== SUPPORTED_API_VERSION) {
    throw new Error(
        `BowTradeAcceptor: ABI ${abi.apiVersion} != supported ${SUPPORTED_API_VERSION}`
    );
}

const {
    defineBot,
    Execution,
    Game,
    LoopingBot,
    Players,
    Inventory,
    ChatDialog,
    Trade
} = abi;

if (!Trade || typeof Trade.active !== 'function') {
    throw new Error('BowTradeAcceptor: Trade API missing from __rs2b0t');
}

const SCRIPT_NAME = 'BowTradeAcceptor';
const SCRIPT_TITLE = "Benzyme's Bow Trade Acceptor";
const SCRIPT_VERSION = '1.0.1';
const WELCOME_SCREEN_ID = 5993;

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

function realOfferItems(items) {
    return (items ?? []).filter(i => {
        if (!i) {
            return false;
        }
        const n = (i.name ?? '').trim();
        const c = Math.max(0, i.count ?? 0);
        return n !== '' && c > 0;
    });
}

function bowUnits(items) {
    return realOfferItems(items)
        .filter(i => isBowOrUnstrung(i.name))
        .reduce((s, o) => s + Math.max(1, o.count), 0);
}

function offerHasOnlyBows(items) {
    const list = realOfferItems(items);
    if (list.length <= 0) {
        return false;
    }
    return list.every(i => isBowOrUnstrung(i.name));
}

function ownOfferHasItems() {
    if (typeof Trade.myOffer !== 'function') {
        return false;
    }
    return realOfferItems(Trade.myOffer()).length > 0;
}

function invBowCount() {
    return Inventory.items()
        .filter(i => isBowOrUnstrung(i.name))
        .reduce((n, i) => n + Math.max(1, i.count), 0);
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

function looksLikePartnerAccepted(text) {
    if (!text || typeof text !== 'string') {
        return false;
    }
    if (/waiting for other player/i.test(text)) {
        return false;
    }
    return (
        /other player has accepted/i.test(text) ||
        (/accepted/i.test(text) && /other player/i.test(text))
    );
}

function partnerHasAcceptedOffer() {
    const host = welcomeHost();
    const reader = host?.reader;
    const blobs = [];

    if (reader && typeof reader.mainModalTexts === 'function') {
        blobs.push(...(reader.mainModalTexts() ?? []));
    }

    const scanIds = [3431, 3432, 3417, 3421, 3423, 3424, 3535, 3536, 3537, 3538, 3546];
    if (reader && typeof reader.componentText === 'function') {
        for (const id of scanIds) {
            try {
                const t = reader.componentText(id);
                if (t) {
                    blobs.push(t);
                }
            } catch {
                /* ignore */
            }
        }
    }

    try {
        const IfType = globalThis.IfType ?? globalThis.__client?.IfType ?? null;
        const list = IfType?.list;
        if (list) {
            for (const id of scanIds) {
                const t = list[id]?.text;
                if (t) {
                    blobs.push(t);
                }
            }
            const len = typeof list.length === 'number' ? list.length : 4000;
            for (let id = 3400; id < Math.min(3600, len); id++) {
                const t = list[id]?.text;
                if (t && /accept/i.test(t)) {
                    blobs.push(t);
                }
            }
        }
    } catch {
        /* ignore */
    }

    return blobs.some(looksLikePartnerAccepted);
}

class BowTradeAcceptor extends LoopingBot {
    status = 'starting';
    startedAt = 0;
    trades = 0;
    bowsReceived = 0;
    /** @type {string | null} */
    pendingFrom = null;
    nextRequestTick = 0;
    partnerWait = 0;

    partnerFilter() {
        const fromSettings =
            typeof this.settings?.str === 'function' ? this.settings.str('partnerName', '') : '';
        return String(fromSettings ?? '').trim();
    }

    allowsName(name) {
        const want = this.partnerFilter();
        if (!want) {
            return true;
        }
        return namesMatch(name, want);
    }

    async onStart() {
        await Execution.delayUntil(() => Game.ingame() && Game.tile() !== null, 0);

        this.startedAt = Date.now();
        this.trades = 0;
        this.bowsReceived = 0;
        this.pendingFrom = null;
        this.nextRequestTick = 0;
        this.partnerWait = 0;

        this.on('chat.message', e => {
            if (!WISHES_TRADE_RE.test(e?.text ?? '')) {
                return;
            }
            const who = parseTradeWishName(e);
            if (!who || !this.allowsName(who)) {
                return;
            }
            this.pendingFrom = who;
            this.log(`incoming trade from ${who}`);
        });

        const want = this.partnerFilter();
        this.log(
            `${SCRIPT_TITLE} ${SCRIPT_VERSION}. Accepts bow trades` +
                (want ? ` from ${want}` : ' from anyone')
        );
        this.status = 'listening for trades';
    }

    onStop() {
        this.log(
            `stopped, trades ${this.trades}, bows ~${this.bowsReceived} (${this.status})`
        );
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

        this.partnerWait = 0;

        if (this.pendingFrom) {
            if (!this.allowsName(this.pendingFrom)) {
                this.pendingFrom = null;
            } else {
                await this.answerTradeRequest(this.pendingFrom);
                return;
            }
        }

        this.status = 'listening for trades';
        await Execution.delayTicks(2);
    }

    canRequestTrade() {
        const tick = typeof Game.tick === 'function' ? Game.tick() : 0;
        return tick >= this.nextRequestTick;
    }

    noteTradeRequest() {
        const tick = typeof Game.tick === 'function' ? Game.tick() : 0;
        this.nextRequestTick = tick + TRADE_REQUEST_COOLDOWN_TICKS;
    }

    async answerTradeRequest(name) {
        if (!this.canRequestTrade()) {
            this.status = `cooldown, ${name}`;
            await Execution.delayTicks(1);
            return;
        }

        const near =
            typeof Players?.query === 'function' ? Players.query().name(name).nearest() : null;
        if (!near) {
            this.status = `waiting for ${name}`;
            this.log(`${name} not in scene, still listening`);
            await Execution.delayTicks(2);
            return;
        }

        this.status = `opening trade with ${name}`;
        this.log(`Trade with ${name}`);
        this.noteTradeRequest();
        await Trade.request(name);
        await Execution.delayUntil(() => Trade.active(), TRADE_OPEN_WAIT_MS);
        if (!Trade.active()) {
            this.log(`trade with ${name} did not open, will retry if they re-request`);
        } else {
            this.pendingFrom = null;
        }
    }

    async handleActiveTrade() {
        if (Trade.onConfirmScreen()) {
            this.status = 'confirming trade';
            const before = invBowCount();
            await Trade.accept();
            await Execution.delayUntil(() => !Trade.active(), TRADE_CONFIRM_WAIT_MS);
            if (!Trade.active()) {
                const gained = Math.max(0, invBowCount() - before);
                this.trades++;
                this.bowsReceived += gained;
                this.pendingFrom = null;
                this.partnerWait = 0;
                this.log(
                    `trade complete` +
                        (gained > 0 ? ` (+${gained} bows)` : '') +
                        `, total trades ${this.trades}`
                );
                this.status = 'listening for trades';
            } else {
                this.log('confirm still open, partner may not have accepted yet');
            }
            return;
        }

        if (!Trade.onOfferScreen()) {
            await Execution.delayTicks(1);
            return;
        }

        const who = typeof Trade.partner === 'function' ? Trade.partner() : null;
        if (who === null) {
            this.partnerWait++;
            this.status = 'reading partner';
            if (this.partnerWait > 12) {
                this.log('trade partner name never appeared, declining');
                await Trade.decline();
                this.partnerWait = 0;
                this.pendingFrom = null;
            }
            await Execution.delayTicks(1);
            return;
        }
        this.partnerWait = 0;

        if (!this.allowsName(who)) {
            this.status = `declining ${who}`;
            this.log(`declining trade with ${who}, name filter`);
            await Trade.decline();
            this.pendingFrom = null;
            return;
        }

        if (ownOfferHasItems()) {
            this.status = 'declining, own offer not empty';
            this.log('safety: own offer not empty, declining');
            await Trade.decline();
            this.pendingFrom = null;
            return;
        }

        const theirs = typeof Trade.theirOffer === 'function' ? Trade.theirOffer() : [];
        const theirBows = bowUnits(theirs);
        if (theirBows <= 0) {
            this.status = `waiting for bows (${who})`;
            await Execution.delayTicks(1);
            return;
        }
        if (!offerHasOnlyBows(theirs)) {
            this.status = `declining, mixed offer (${who})`;
            this.log(`their offer has non-bow items, declining`);
            await Trade.decline();
            this.pendingFrom = null;
            return;
        }

        if (!partnerHasAcceptedOffer()) {
            this.status = `waiting for ${who} to Accept (${theirBows} bows)`;
            await Execution.delayTicks(1);
            return;
        }

        this.status = `accepting ${theirBows} bows from ${who}`;
        this.log(`Accept offer, ${theirBows} bows from ${who}`);
        await Trade.accept();
        await Execution.delayUntil(
            () => Trade.onConfirmScreen() || !Trade.active(),
            TRADE_OFFER_WAIT_MS
        );
    }

    onPaint(ctx) {
        const elapsed = Date.now() - this.startedAt;
        const want = this.partnerFilter();
        const pending = this.pendingFrom ? ` | pending ${this.pendingFrom}` : '';
        const lines = [
            `${SCRIPT_TITLE} | ${this.status} | ${fmtElapsed(elapsed)}`,
            `from ${want || 'anyone'} | trades ${this.trades} | got ~${this.bowsReceived} | held ${invBowCount()}${pending}`
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
    tags: ['trade', 'mule', 'bow', 'unstrung', 'fletching', 'accept'],
    description:
        "Benzyme's Bow Trade Acceptor. Stands still, answers incoming trades, and Accepts after the offerer Accepts if their offer is only bows or unstrung bows. Optional Partner name filter. Declines mixed offers and any trade where you put items up.",
    settingsSchema: {
        partnerName: {
            type: 'string',
            default: '',
            label: 'Partner name (optional)',
            group: 'Trade',
            help: 'Leave empty to accept bow trades from anyone. Set a name to only answer that player.'
        }
    },
    create: () => new BowTradeAcceptor()
});
