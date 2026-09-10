/**
 * FishingGuildHost — stand at the Fishing Guild bank and accept incoming
 * Shark / Tuna / Swordfish trades (cooked or raw). Stays leashed to the stand
 * (anti-lure). Never offers items; only receives.
 * Completely vibe coded by @.benzyme on Discord via Cursor AI
 * Self-contained ESM for rs2b0t Load local script / Load URL.
 *
 * Load URL: https://benzymee.github.io/RS2B2TScripts/FishingGuildHost.js
 */
const SUPPORTED_API_VERSION = 1;
const abi = globalThis.__rs2b0t;
if (!abi) {
    throw new Error('FishingGuildHost: globalThis.__rs2b0t missing — load inside rs2b0t bot.html');
}
if (abi.apiVersion !== SUPPORTED_API_VERSION) {
    throw new Error(`FishingGuildHost: ABI ${abi.apiVersion} != supported ${SUPPORTED_API_VERSION}`);
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
    Trade,
    BANK_LOCATIONS
} = abi;

const SCRIPT_NAME = 'FishingGuildHost';
const SCRIPT_VERSION = '1.0.0';

/** Cooked names; raw catch of each is accepted too. */
const FOOD_NAMES = ['Shark', 'Tuna', 'Swordfish'];
const ACCEPTED_FOOD = new Set(
    FOOD_NAMES.flatMap(n => [n.toLowerCase(), `raw ${n.toLowerCase()}`])
);
/** Unnoted RS2 ids (notes still match by name). */
const FOOD_IDS = new Set([
    383, 385, // Raw shark, Shark
    359, 361, // Raw tuna, Tuna
    371, 373 // Raw swordfish, Swordfish
]);

/** Max Chebyshev distance to answer a trade wish (request fails beyond this). */
const TRADE_RANGE = 8;
const TRADE_REQUEST_MS = 5_000;
const TRADE_OFFER_WAIT_MS = 5_000;
/** Pause before first Accept on each trade screen (offer + confirm). */
const ACCEPT_WAIT_MIN_MS = 1_000;
const ACCEPT_WAIT_MAX_MS = 3_000;
const ACCEPT_RETRY_MS = 3_000;
/** Open trade sitting idle this long is treated as a troll. */
const TROLL_TRADE_MS = 300_000;
/** After a troll decline, ignore that player's trade wishes for this long. */
const TROLL_BLOCK_MS = 120_000;

const WISHES_TRADE_RE = /wishes to trade with you/i;
const WISH_RE = /^(.+?)\s+wishes to trade with you\.?$/i;
/** How long a noted wish stays valid without being re-seen in chat. */
const WISH_FRESH_MS = 45_000;
const CHAT_POLL_LINES = 20;

/** Fishing Guild bank booth (~2586,3420). */
const STAND =
    (BANK_LOCATIONS || []).find(b => /fishing\s*guild/i.test(b.name || ''))?.tile ??
    new Tile(2586, 3420, 0);
const DEFAULT_LEASH = 3;

const WELCOME_SCREEN_ID = 5993;

/** CSS seagreen — title line on the InventoryAlcher-style overlay. */
const PAINT_TITLE = '#2e8b57';

function acceptDelayMs() {
    return ACCEPT_WAIT_MIN_MS + Math.floor(Math.random() * (ACCEPT_WAIT_MAX_MS - ACCEPT_WAIT_MIN_MS + 1));
}

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

        await Execution.delayUntil(() => !isWelcomeModalOpen(), 1500);
    }
    return !isWelcomeModalOpen();
}

function namesMatch(a, b) {
    return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
}

function foodNameKey(name) {
    return (name ?? '').trim().toLowerCase();
}

function isAcceptedFood(item) {
    if (!item) {
        return false;
    }
    if (typeof item.id === 'number' && FOOD_IDS.has(item.id)) {
        return true;
    }
    return ACCEPTED_FOOD.has(foodNameKey(item.name));
}

function isAcceptedFoodName(name) {
    return ACCEPTED_FOOD.has(foodNameKey(name));
}

/** shark / tuna / swordfish (raw folded into the cooked kind). */
function foodKind(name) {
    const n = foodNameKey(name).replace(/^raw\s+/, '');
    if (n === 'shark' || n === 'tuna' || n === 'swordfish') {
        return n;
    }
    return null;
}

function fishInOffer(items) {
    let n = 0;
    for (const o of items || []) {
        if (isAcceptedFood(o) || isAcceptedFoodName(o?.name)) {
            n += Math.max(1, o.count);
        }
    }
    return n;
}

function offerHasNonFish(items) {
    return (items || []).some(
        o => o.name != null && o.name.trim() !== '' && !isAcceptedFood(o) && !isAcceptedFoodName(o.name)
    );
}

function countOfferByKind(items) {
    const out = { shark: 0, tuna: 0, swordfish: 0 };
    for (const o of items || []) {
        if (!isAcceptedFood(o) && !isAcceptedFoodName(o?.name)) {
            continue;
        }
        const k = foodKind(o.name);
        if (k) {
            out[k] += Math.max(1, o.count);
        }
    }
    return out;
}

function emptyKindCounts() {
    return { shark: 0, tuna: 0, swordfish: 0 };
}

function addKindCounts(into, add) {
    into.shark += add.shark;
    into.tuna += add.tuna;
    into.swordfish += add.swordfish;
}

/** Drunken Dwarf gifts (and similar junk) — never Eat/Drink. */
function isDropJunk(item) {
    const n = (item?.name ?? '').trim().toLowerCase();
    if (!n) {
        return false;
    }
    if (n === 'kebab') {
        return true;
    }
    // Plain Beer / dwarf beer — not kegs or other drinks.
    return n === 'beer' || (n.includes('beer') && !n.includes('keg'));
}

/** Strip RS color / markup so wish regexes still match. */
function stripChatMarkup(s) {
    return (s || '')
        .replace(/@[^@\s]+@/g, '')
        .replace(/<\/?col[^>]*>/gi, '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function chatLineSig(line) {
    return `${line?.type ?? ''}|${line?.username ?? ''}|${line?.text ?? ''}`;
}

/**
 * Parse an incoming trade wish from a chat line / event.
 * Handles both forms used by the client:
 *   - username="Bob", text="wishes to trade with you."
 *   - text="Bob wishes to trade with you."
 */
function parseTradeWishName(line) {
    const text = stripChatMarkup(line?.text ?? '');
    if (!WISHES_TRADE_RE.test(text)) {
        return null;
    }
    const fromText = text.match(WISH_RE)?.[1]?.trim() || null;
    if (fromText) {
        return fromText;
    }
    const fromUser = stripChatMarkup(line?.username ?? '');
    return fromUser || null;
}

/** Recent chat lines from the client reader (newest first), or null if unavailable. */
function readChatLines(count = CHAT_POLL_LINES) {
    try {
        const host = welcomeHost();
        const reader = host?.reader;
        if (!reader || typeof reader.chat !== 'function') {
            return null;
        }
        const lines = reader.chat(count);
        return Array.isArray(lines) ? lines : null;
    } catch {
        return null;
    }
}

function findPlayerByName(name) {
    if (!name || typeof Players?.query !== 'function') {
        return null;
    }
    return Players.query().name(name).nearest() ?? null;
}

function fishHeld() {
    return Inventory.items()
        .filter(i => isAcceptedFood(i) || isAcceptedFoodName(i.name))
        .reduce((n, i) => n + Math.max(1, i.count), 0);
}

function inventoryUsed() {
    return typeof Inventory.used === 'function' ? Inventory.used() : Inventory.items().length;
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

class FishingGuildHost extends LoopingBot {
    loopDelay = 600;

    stand = Tile.from(STAND);
    leashRadius = DEFAULT_LEASH;
    depositAfterTrade = true;
    declineNonFish = true;

    status = 'starting';
    trades = 0;
    fishReceived = 0;
    received = emptyKindCounts();
    startedAt = Date.now();
    /** @type {string | null} */
    pendingPartner = null;
    /** Wall-clock when pendingPartner was last (re)confirmed. */
    pendingSeenAt = 0;
    /** @type {Set<string>} */
    pendingSources = new Set();
    /** Signature of newest chat line already consumed by the poller. */
    lastChatSig = null;
    nextRequestAt = 0;
    partnerWaits = 0;
    /** Wall-clock when the current Trade.active() session opened. */
    tradeOpenedAt = 0;
    trollDeclined = false;
    trolls = 0;
    /** @type {Map<string, number>} lowercase name → unblock-at ms */
    blockedUntil = new Map();
    lastBlockedLogName = '';
    lastBlockedLogAt = 0;

    async onStart() {
        await Execution.delayUntil(() => Game.ingame() && Game.tile() !== null, 0);
        await dismissWelcomeScreen();

        this.stand = this.settings?.tile('stand', Tile.from(STAND)) ?? Tile.from(STAND);
        this.leashRadius = this.settings?.num('leashRadius', DEFAULT_LEASH) ?? DEFAULT_LEASH;
        this.depositAfterTrade = this.settings?.bool('depositAfterTrade', true) ?? true;
        this.declineNonFish = this.settings?.bool('declineNonFish', true) ?? true;
        this.startedAt = Date.now();
        this.pendingPartner = null;
        this.pendingSeenAt = 0;
        this.pendingSources = new Set();
        this.lastChatSig = null;
        this.partnerWaits = 0;
        this.tradeOpenedAt = 0;
        this.trollDeclined = false;
        this.trolls = 0;
        this.blockedUntil = new Map();
        this.lastBlockedLogName = '';
        this.lastBlockedLogAt = 0;
        this.received = emptyKindCounts();

        // Check 1: live chat.message events.
        this.on('chat.message', e => {
            const who = parseTradeWishName(e);
            if (who) {
                this.noteTradeWish(who, 'event');
            }
        });

        // Seed poller + catch a wish that arrived just before start.
        this.pollChatForTradeWishes({ seedOnly: false });

        this.log(
            `FishingGuildHost at ${this.stand.x},${this.stand.z} — leash ${this.leashRadius}, accepting ${FOOD_NAMES.join(' / ')} (raw too)`
        );
        this.status = 'walking to stand';
    }

    async loop() {
        if (await dismissWelcomeScreen()) {
            return;
        }

        if (typeof Trade !== 'undefined' && Trade.active()) {
            await this.handleTrade();
            return;
        }
        this.tradeOpenedAt = 0;
        this.trollDeclined = false;

        // Check 2: poll client chat buffer every loop (events can miss a line).
        this.pollChatForTradeWishes();
        this.expireStaleWish();
        this.pruneExpiredBlocks();

        // Drunken Dwarf (etc.) — free inventory slots; never Eat/Drink these.
        if (await this.dropDwarfJunk()) {
            return;
        }

        if (!this.withinLeash()) {
            await this.returnToStand('outside leash — returning to stand');
            return;
        }

        if (!this.atStand()) {
            await this.returnToStand('walking to stand');
            return;
        }

        const target = this.resolveTradeTarget();
        if (target) {
            await this.requestTrade(target);
            return;
        }

        if (!this.pendingPartner) {
            this.status = 'waiting for incoming fish trades';
        }
        await Execution.delayTicks(2);
    }

    /**
     * Record a wish from event or poll. Idempotent for the same name.
     * @param {string} who
     * @param {'event' | 'poll'} source
     */
    noteTradeWish(who, source) {
        const name = (who || '').trim();
        if (!name) {
            return;
        }
        if (this.isBlocked(name)) {
            const left = Math.ceil(this.blockRemainingMs(name) / 1000);
            this.status = `ignoring ${name} (troll block ${left}s)`;
            const now = Date.now();
            if (
                !namesMatch(this.lastBlockedLogName, name) ||
                now - this.lastBlockedLogAt > 10_000
            ) {
                this.lastBlockedLogName = name;
                this.lastBlockedLogAt = now;
                this.log(`ignoring trade request from ${name} (troll-blocked ${left}s)`);
            }
            return;
        }
        const fresh = !namesMatch(this.pendingPartner, name);
        this.pendingPartner = name;
        this.pendingSeenAt = Date.now();
        this.pendingSources.add(source);
        if (fresh) {
            this.log(`trade request from ${name} (${source})`);
        }
    }

    /**
     * Scan reader.chat() for "wishes to trade" lines (newest first).
     * @param {{ seedOnly?: boolean }} [opts]
     */
    pollChatForTradeWishes(opts = {}) {
        const lines = readChatLines(CHAT_POLL_LINES);
        if (!lines || lines.length === 0) {
            return;
        }
        const newestSig = chatLineSig(lines[0]);
        if (opts.seedOnly) {
            this.lastChatSig = newestSig;
            return;
        }
        if (this.lastChatSig === null) {
            // First pass: note any current wish, then remember the tip.
            for (const line of lines) {
                const who = parseTradeWishName(line);
                if (who) {
                    this.noteTradeWish(who, 'poll');
                    break;
                }
            }
            this.lastChatSig = newestSig;
            return;
        }
        if (newestSig === this.lastChatSig) {
            return;
        }
        const fresh = [];
        for (const line of lines) {
            if (chatLineSig(line) === this.lastChatSig) {
                break;
            }
            fresh.push(line);
        }
        this.lastChatSig = newestSig;
        // Oldest → newest so the newest wish wins if several arrived.
        for (const line of fresh.reverse()) {
            const who = parseTradeWishName(line);
            if (who) {
                this.noteTradeWish(who, 'poll');
            }
        }
    }

    /** Drop pending if it went stale and is no longer in the chat buffer. */
    expireStaleWish() {
        if (!this.pendingPartner) {
            return;
        }
        if (Date.now() - this.pendingSeenAt <= WISH_FRESH_MS) {
            return;
        }
        if (this.wishVisibleInChat(this.pendingPartner)) {
            this.pendingSeenAt = Date.now();
            return;
        }
        this.log(`trade wish from ${this.pendingPartner} expired — clearing`);
        this.clearPendingWish();
    }

    clearPendingWish() {
        this.pendingPartner = null;
        this.pendingSeenAt = 0;
        this.pendingSources = new Set();
    }

    blockKey(name) {
        return (name || '').trim().toLowerCase();
    }

    isBlocked(name) {
        const key = this.blockKey(name);
        if (!key) {
            return false;
        }
        const until = this.blockedUntil.get(key);
        if (!until) {
            return false;
        }
        if (Date.now() >= until) {
            this.blockedUntil.delete(key);
            return false;
        }
        return true;
    }

    blockRemainingMs(name) {
        const key = this.blockKey(name);
        const until = this.blockedUntil.get(key) ?? 0;
        return Math.max(0, until - Date.now());
    }

    blockPlayer(name) {
        const key = this.blockKey(name);
        if (!key) {
            return;
        }
        this.blockedUntil.set(key, Date.now() + TROLL_BLOCK_MS);
    }

    pruneExpiredBlocks() {
        const now = Date.now();
        for (const [key, until] of this.blockedUntil) {
            if (now >= until) {
                this.blockedUntil.delete(key);
            }
        }
    }

    tradeTimedOut() {
        return (
            typeof Trade !== 'undefined' &&
            Trade.active() &&
            this.tradeOpenedAt > 0 &&
            Date.now() - this.tradeOpenedAt > TROLL_TRADE_MS
        );
    }

    async declineTrollTrade(who) {
        const name = (who || Trade.partner() || this.pendingPartner || 'unknown').trim();
        this.trolls++;
        this.trollDeclined = true;
        this.status = `troll trade — declining ${name}`;
        this.log(
            `troll trade (${Math.round(TROLL_TRADE_MS / 1000)}s open) with ${name} — declining, block ${Math.round(TROLL_BLOCK_MS / 1000)}s`
        );
        this.blockPlayer(name);
        if (typeof Trade !== 'undefined' && Trade.active()) {
            await Trade.decline();
        }
        this.clearPendingWish();
        this.partnerWaits = 0;
        this.tradeOpenedAt = 0;
    }

    /** True when a matching wish line is still in the recent chat buffer. */
    wishVisibleInChat(name) {
        const lines = readChatLines(CHAT_POLL_LINES);
        if (lines === null) {
            // Reader missing — treat a fresh note as good enough for the chat check.
            return Date.now() - this.pendingSeenAt <= WISH_FRESH_MS;
        }
        for (const line of lines) {
            const who = parseTradeWishName(line);
            if (who && namesMatch(who, name)) {
                return true;
            }
        }
        // Event can beat the poller by a frame — allow a short grace only.
        return (
            namesMatch(this.pendingPartner, name) &&
            Date.now() - this.pendingSeenAt <= 5_000
        );
    }

    /**
     * Drop Beer / Kebab from Drunken Dwarf (never Eat or Drink).
     * @returns {Promise<boolean>} true if this loop dropped something
     */
    async dropDwarfJunk() {
        const item = Inventory.items().find(isDropJunk) ?? null;
        if (!item) {
            return false;
        }
        const name = item.name ?? 'junk';
        this.status = `dropping ${name}`;
        this.log(`dropping ${name}`);
        const before = inventoryUsed();
        await item.interact('Drop');
        await Execution.delayUntil(() => inventoryUsed() < before, 4000);
        return true;
    }

    withinLeash(tile) {
        const here = tile ?? Game.tile();
        return here !== null && this.stand.distanceTo(here) <= this.leashRadius;
    }

    atStand() {
        const here = Game.tile();
        return here !== null && this.stand.distanceTo(here) <= 1;
    }

    async returnToStand(reason) {
        // Never path anywhere except the stand — anti-lure.
        this.status = reason;
        this.log(reason);
        const opts = { radius: 1, log: m => this.log(`  ${m}`) };
        if (Traversal.pureWalk) {
            Object.assign(opts, Traversal.pureWalk);
        }
        await Traversal.walkResilient(this.stand, opts);
    }

    /**
     * Only answer explicit incoming wishes — never cold-trade bystanders.
     * Triple-check before returning a target:
     *   1) pending wish noted (event and/or poll)
     *   2) matching wish still visible in chat (or freshly noted if no reader)
     *   3) player in scene, within leash + trade range
     */
    resolveTradeTarget() {
        if (!this.pendingPartner) {
            return null;
        }
        const pending = this.pendingPartner;
        if (this.isBlocked(pending)) {
            const left = Math.ceil(this.blockRemainingMs(pending) / 1000);
            this.log(`dropping wish from ${pending} (troll-blocked ${left}s)`);
            this.clearPendingWish();
            return null;
        }

        // Check 2 — chat buffer still shows the wish.
        const inChat = this.wishVisibleInChat(pending);
        if (!inChat) {
            if (Date.now() - this.pendingSeenAt > WISH_FRESH_MS) {
                this.log(`no chat wish for ${pending} — clearing`);
                this.clearPendingWish();
            } else {
                this.status = `re-checking chat for ${pending}'s trade wish`;
            }
            return null;
        }

        // Check 3 — player must be on-screen and in range.
        const p = findPlayerByName(pending);
        if (!p) {
            this.status = `waiting for ${pending} (not in scene)`;
            return null;
        }
        if (!this.withinLeash(p.tile())) {
            this.log(`ignoring trade wish from ${pending} (outside leash)`);
            this.clearPendingWish();
            return null;
        }
        if (p.distance() > TRADE_RANGE) {
            this.status = `waiting for ${pending} to step within trade range`;
            return null;
        }

        // pending + chat + scene all passed.
        return p.name ?? pending;
    }

    async requestTrade(name) {
        if (this.isBlocked(name)) {
            this.log(`abort Trade with ${name} — troll-blocked`);
            this.clearPendingWish();
            return;
        }

        const now = Date.now();
        if (now < this.nextRequestAt) {
            this.status = `cooldown before re-request (${name})`;
            await Execution.delayTicks(1);
            return;
        }

        // Final re-check immediately before clicking Trade with.
        const inChat = this.wishVisibleInChat(name);
        const inScene = !!findPlayerByName(name);
        if (!inChat || !inScene) {
            this.status = `abort trade — ${name} no longer confirmed`;
            this.log(
                `abort Trade with ${name} — final check failed ` +
                    `(chat=${inChat} scene=${inScene})`
            );
            return;
        }

        const sources = [...this.pendingSources].join('+') || 'unknown';
        this.status = `accepting trade request with ${name}`;
        this.log(`Trade with ${name} (confirmed pending+chat+scene via ${sources})`);
        this.nextRequestAt = now + TRADE_REQUEST_MS;
        await Trade.request(name);
        await Execution.delayUntil(() => Trade.active() || !this.atStand(), TRADE_REQUEST_MS);
        if (Trade.active()) {
            this.clearPendingWish();
            this.partnerWaits = 0;
            return;
        }
        if (!this.atStand()) {
            this.log(`anti-lure: walked off stand toward ${name} — returning`);
            await this.returnToStand('anti-lure — returning to stand');
            return;
        }
        this.log(`trade with ${name} did not open — will retry if still pending`);
    }

    async waitAndAcceptScreen(screen) {
        const onOffer = () => Trade.onOfferScreen() && !Trade.onConfirmScreen();
        const onConfirm = () => Trade.onConfirmScreen();
        const isHere = screen === 'confirm' ? onConfirm : onOffer;

        if (!Trade.active() || !isHere()) {
            return;
        }

        const waitMs = acceptDelayMs();
        const label = screen === 'confirm' ? 'confirm screen' : 'offer screen';
        this.status = `waiting on ${screen}`;
        this.log(`${label} — waiting ~${Math.round(waitMs / 1000)}s before accept`);

        const readyAt = Date.now() + waitMs;
        while (Date.now() < readyAt && Trade.active() && isHere()) {
            if (this.tradeTimedOut()) {
                await this.declineTrollTrade();
                return;
            }
            await Execution.delayTicks(1);
        }
        if (!Trade.active()) {
            return;
        }

        this.status = `accepting ${screen}`;
        this.log(`accepting ${label}`);
        await Trade.accept();

        if (screen === 'offer') {
            while (Trade.active() && onOffer()) {
                if (this.tradeTimedOut()) {
                    await this.declineTrollTrade();
                    return;
                }
                await Execution.delayUntil(
                    () => !Trade.active() || onConfirm() || !onOffer() || this.tradeTimedOut(),
                    ACCEPT_RETRY_MS
                );
                if (!Trade.active() || onConfirm() || !onOffer()) {
                    break;
                }
                if (this.tradeTimedOut()) {
                    await this.declineTrollTrade();
                    return;
                }
                this.log('re-accepting offer (still open)');
                await Trade.accept();
            }
            return;
        }

        this.log('confirm accepted — keeping Accept until trade closes');
        while (Trade.active()) {
            if (this.tradeTimedOut()) {
                await this.declineTrollTrade();
                return;
            }
            if (onConfirm() || onOffer()) {
                this.status = 'accepting until trade ends';
                await Trade.accept();
            }
            await Execution.delayTicks(1);
        }
    }

    async handleTrade() {
        this.trollDeclined = false;
        if (!this.tradeOpenedAt) {
            this.tradeOpenedAt = Date.now();
        }

        while (typeof Trade !== 'undefined' && Trade.active()) {
            if (this.tradeTimedOut()) {
                await this.declineTrollTrade();
                return;
            }

            if (Trade.onConfirmScreen()) {
                const before = fishHeld();
                const offerKinds = countOfferByKind(Trade.theirOffer());
                await this.waitAndAcceptScreen('confirm');
                if (this.trollDeclined) {
                    return;
                }
                if (!Trade.active()) {
                    const gained = Math.max(0, fishHeld() - before);
                    this.trades++;
                    this.fishReceived += gained;
                    if (offerKinds.shark + offerKinds.tuna + offerKinds.swordfish > 0) {
                        addKindCounts(this.received, offerKinds);
                    }
                    this.log(
                        `trade #${this.trades} complete — +${gained} fish ` +
                            `(shark ${this.received.shark} tuna ${this.received.tuna} swordfish ${this.received.swordfish})`
                    );
                    this.clearPendingWish();
                    this.partnerWaits = 0;
                    this.tradeOpenedAt = 0;
                    if (this.depositAfterTrade && inventoryUsed() > 0) {
                        await this.depositInventory();
                    }
                }
                return;
            }

            if (!Trade.onOfferScreen()) {
                await Execution.delayTicks(1);
                continue;
            }

            const who = Trade.partner();
            if (who === null) {
                this.partnerWaits++;
                this.status = 'reading trade partner';
                if (this.partnerWaits > 8) {
                    this.log('partner name never appeared — declining');
                    await Trade.decline();
                    this.partnerWaits = 0;
                    this.tradeOpenedAt = 0;
                    return;
                }
                await Execution.delayTicks(1);
                continue;
            }
            this.partnerWaits = 0;

            if (this.isBlocked(who)) {
                this.log(`declining ${who}: troll-blocked`);
                await Trade.decline();
                this.clearPendingWish();
                this.tradeOpenedAt = 0;
                return;
            }

            // Safety: never offer anything — this host only receives.
            if (Trade.myOffer().length > 0) {
                this.status = 'declining — own offer not empty';
                this.log('safety: own offer not empty — declining');
                await Trade.decline();
                this.tradeOpenedAt = 0;
                return;
            }

            const their = Trade.theirOffer();
            if (this.declineNonFish && offerHasNonFish(their)) {
                this.status = 'declining — non-fish in offer';
                this.log(`declining ${who}: offer contains items other than shark/tuna/swordfish`);
                await Trade.decline();
                this.tradeOpenedAt = 0;
                return;
            }

            const n = fishInOffer(their);
            if (n <= 0) {
                const openS = Math.floor((Date.now() - this.tradeOpenedAt) / 1000);
                this.status = `waiting for fish from ${who} (${openS}s)`;
                await Execution.delayTicks(1);
                continue;
            }

            this.status = `fish x${n} from ${who} — accepting`;
            this.log(`fish x${n} from ${who}`);
            await this.waitAndAcceptScreen('offer');
            if (this.trollDeclined) {
                return;
            }
            await Execution.delayUntil(
                () => Trade.onConfirmScreen() || !Trade.active() || this.tradeTimedOut(),
                TRADE_OFFER_WAIT_MS
            );
        }
        this.tradeOpenedAt = 0;
    }

    async depositInventory() {
        if (!this.withinLeash()) {
            this.log('skip deposit — outside leash');
            return;
        }
        const before = inventoryUsed();
        if (before <= 0) {
            return;
        }
        this.status = 'depositing fish at bank';
        this.log(`depositing ${before} inventory slot(s)`);
        if (
            !(await Banking.open({
                stand: this.stand,
                nearbyRadius: this.leashRadius,
                log: m => this.log(`  ${m}`)
            }))
        ) {
            this.log('bank open failed — will retry later');
            return;
        }
        if (typeof Bank.loaded === 'function') {
            await Execution.delayUntil(() => Bank.loaded(), 3000);
        }
        if (typeof Bank.depositInventory === 'function') {
            await Bank.depositInventory();
        } else if (typeof Bank.depositAllMatching === 'function') {
            await Bank.depositAllMatching(
                name => isAcceptedFoodName(name) || isDropJunk({ name }),
                m => this.log(`  ${m}`)
            );
        } else if (typeof Bank.deposit === 'function') {
            const names = [...new Set(Inventory.items().map(i => i.name).filter(Boolean))];
            for (const name of names) {
                if (inventoryUsed() === 0) {
                    break;
                }
                await Bank.deposit(name, 'Deposit-All');
            }
        }
        await Execution.delayUntil(() => inventoryUsed() < before || before === 0, 3000);
        if (typeof Bank.close === 'function') {
            await Bank.close();
        }
        this.log('deposited');
    }

    onPaint(ctx) {
        const elapsed = Date.now() - this.startedAt;
        const pack = inventoryUsed();
        const lines = [
            `Benzyme's FishingGuildHost v${SCRIPT_VERSION}`,
            `time ${fmtElapsed(elapsed)} · ${this.status}`,
            `trades ${this.trades} · fish +${this.fishReceived} · pack ${pack}/28`,
            `shark ${this.received.shark} · tuna ${this.received.tuna} · swordfish ${this.received.swordfish}`,
            `trolls ${this.trolls} · blocked ${this.blockedUntil.size}`,
            `leash ${this.leashRadius} @ ${this.stand.x},${this.stand.z}`
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
    category: 'Money making',
    tags: ['shark', 'tuna', 'swordfish', 'trade', 'mule', 'fishing-guild', 'host'],
    description:
        'Stand at the Fishing Guild bank (2586,3420) and accept incoming Shark / Tuna / Swordfish trades (cooked or raw). Leashed anti-lure — never leaves the stand vicinity. Trades open longer than 300s are declined as trolls and that player is blocked for 2 minutes.',
    settingsSchema: {
        stand: {
            type: 'tile',
            default: STAND,
            label: 'Stand tile',
            help: 'Tile to walk to and leash around (default: Fishing Guild bank 2586,3420)'
        },
        leashRadius: {
            type: 'number',
            default: DEFAULT_LEASH,
            min: 1,
            max: 8,
            label: 'Leash radius',
            help: 'Never walk outside this Chebyshev distance from the stand (anti-lure). Traders must come inside this radius.'
        },
        depositAfterTrade: {
            type: 'boolean',
            default: true,
            label: 'Deposit after trade',
            help: 'Open the guild bank and deposit received fish after each completed trade. On by default so unnoted fish do not fill the pack.'
        },
        declineNonFish: {
            type: 'boolean',
            default: true,
            label: 'Decline other items',
            help: 'Decline if their offer contains anything other than Shark, Tuna, Swordfish, or the raw versions'
        }
    },
    create: () => new FishingGuildHost()
});
