/**
 * CamelotUnicornHunter, hunt Unicorns around Camelot and Seers Village.
 * Walks four pins. If no Unicorn is in view at the current pin, hops to the
 * next. Takes Unicorn horns. Banks at the nearer of Seers or Catherby when
 * the pack is full. Optional dragon dagger Puncture swap.
 * Completely vibe coded by @.benzyme on Discord via Cursor AI
 * Self-contained ESM for rs2b0t Load local script / Load URL.
 *
 * Load URL: https://benzymee.github.io/RS2B2TScripts/CamelotUnicornHunter.js
 */
const SUPPORTED_API_VERSION = 1;
const abi = globalThis.__rs2b0t;
if (!abi) {
    throw new Error(
        'CamelotUnicornHunter: globalThis.__rs2b0t missing, load inside rs2b0t bot.html'
    );
}
if (abi.apiVersion !== SUPPORTED_API_VERSION) {
    throw new Error(
        `CamelotUnicornHunter: ABI ${abi.apiVersion} != supported ${SUPPORTED_API_VERSION}`
    );
}

const {
    defineBot,
    Execution,
    Game,
    LoopingBot,
    Npcs,
    GroundItems,
    Inventory,
    Equipment,
    Bank,
    Banking,
    Traversal,
    Tile,
    Skills,
    ChatDialog
} = abi;

const SCRIPT_NAME = 'CamelotUnicornHunter';
const SCRIPT_TITLE = "Benzyme's Unicorn Hunter";
const SCRIPT_VERSION = '1.2';
const SCRIPT_VERSION_FULL = '1.2.0';

/** Classic RS2 world view. Paint sits in this corner, not the inventory or chat. */
const GAME_VIEW = { x: 4, y: 4, w: 512, h: 334 };
const PAINT_CANVAS_W = 765;
const PAINT_CANVAS_H = 503;
const HORN_INK = '#3a2408';
const HORN_TITLE = '#4a300c';
const HORN_MUSTARD = '#e6c44a';
const HORN_DEEP = '#b8922a';
const HORN_RIM = '#7a5814';

/** @type {object | null} */
let activePaintBot = null;
let paintClicksInstalled = false;
/** Last drawn horn hitbox, canvas space. */
let paintHornHit = { x: 0, y: 0, w: 28, h: 54 };

const WELCOME_SCREEN_ID = 5993;

function T(x, z, level = 0) {
    return new Tile(x, z, level);
}

const HUNT_SPOTS = [
    { name: 'Camelot east', tile: T(2783, 3466) },
    { name: 'Camelot south', tile: T(2791, 3460) },
    { name: 'Seers south', tile: T(2700, 3423) },
    { name: 'Seers west', tile: T(2700, 3442) }
];

const BANKS = [
    { name: 'Seers', stand: T(2726, 3491) },
    { name: 'Catherby', stand: T(2809, 3441) }
];

const SCAN_RADIUS = 14;
const ARRIVE_RADIUS = 5;
const CHASE_RADIUS = 18;
const EMPTY_DWELL_MS = 2800;
const OWN_LOOT_RADIUS = 4;
const OWN_LOOT_MS = 16_000;
const GROUND_SCAN_RADIUS = 20;
const BANK_RADIUS = 8;

const DEATH_RE = /oh dear.*you are dead/i;
const CANT_REACH_RE = /i can't reach that/i;

const COMBAT_TRACK = ['attack', 'strength', 'defence', 'hitpoints'];

const DDS_SPEC_PERCENT = 25;
const SPEC_ENERGY_VARP = 300;
const SPEC_ENABLED_VARP = 301;
const DDS_WIELD_ATTACK = 60;
const DDS_SPEC_BAR_COM = 7562;

const FOOD_SLICE = 'Slice of cake';
const FOOD_TWO_THIRDS = '2/3 cake';
const FOOD_CAKE = 'Cake';
const FOOD_SHRIMPS = 'Shrimps';
const FOOD_SHRIMP = 'Shrimp';
const FOOD_ANCHOVIES = 'Anchovies';
const FOOD_ANCHOVY = 'Anchovy';
const FOOD_TUNA = 'Tuna';
const FOOD_LOBSTER = 'Lobster';
const FOOD_SWORDFISH = 'Swordfish';
const FOOD_SHARK = 'Shark';
const HORN_NAME = 'Unicorn horn';

const DRAGON_DAGGER_NAMES = [
    'Dragon dagger',
    'Dragon dagger(p)',
    'Dragon dagger(p+)',
    'Dragon dagger(p++)',
    'Dragon dagger(+)',
    'Dragon dagger(s)',
    'Drag dagger(p++)'
];

const FOOD_TYPES = {
    Shrimp: {
        eat: [FOOD_SHRIMPS, FOOD_SHRIMP],
        withdraw: [FOOD_SHRIMPS, FOOD_SHRIMP],
        label: 'shrimp'
    },
    Anchovies: {
        eat: [FOOD_ANCHOVIES, FOOD_ANCHOVY],
        withdraw: [FOOD_ANCHOVIES, FOOD_ANCHOVY],
        label: 'anchovies'
    },
    Cake: {
        eat: [FOOD_SLICE, FOOD_TWO_THIRDS, FOOD_CAKE],
        withdraw: [FOOD_CAKE, FOOD_TWO_THIRDS, FOOD_SLICE],
        label: 'cake'
    },
    Tuna: { eat: [FOOD_TUNA], withdraw: [FOOD_TUNA], label: 'tuna' },
    Lobster: { eat: [FOOD_LOBSTER], withdraw: [FOOD_LOBSTER], label: 'lobster' },
    Swordfish: { eat: [FOOD_SWORDFISH], withdraw: [FOOD_SWORDFISH], label: 'swordfish' },
    Shark: { eat: [FOOD_SHARK], withdraw: [FOOD_SHARK], label: 'shark' }
};

const FOOD_OPTIONS = Object.keys(FOOD_TYPES);

const WEAPON_RE =
    /\b(scimitar|longsword|sword|dagger|mace|axe|battleaxe|warhammer|spear|halberd|whip|claws|scythe|2h\b|two.handed|abyssal|silverlight|excalibur|darklight)\b/i;

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
        return 8;
    }
    return Math.min(28, Math.max(1, v));
}

function nameEq(a, b) {
    return (a ?? '').toLowerCase() === (b ?? '').toLowerCase();
}

function normName(s) {
    return (s ?? '')
        .toLowerCase()
        .replace(/-/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function cheb(a, b) {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
}

function itemNameOf(item) {
    if (!item) {
        return '';
    }
    try {
        if (typeof item.name === 'function') {
            return String(item.name() ?? '');
        }
    } catch {
        /* ignore */
    }
    return String(item.name ?? '');
}

function itemCount(item) {
    const c = Number(item?.count);
    return Number.isFinite(c) && c > 0 ? c : 1;
}

function packUsed() {
    if (typeof Inventory.used === 'function') {
        return Inventory.used();
    }
    try {
        return Inventory.items().length;
    } catch {
        return 0;
    }
}

function packFree() {
    if (typeof Inventory.free === 'function') {
        return Inventory.free();
    }
    return Math.max(0, 28 - packUsed());
}

function packFull() {
    if (typeof Inventory.isFull === 'function' && Inventory.isFull()) {
        return true;
    }
    if (typeof Inventory.free === 'function' && Inventory.free() <= 0) {
        return true;
    }
    return packUsed() >= 28;
}

function invItems() {
    try {
        return Inventory.items() ?? [];
    } catch {
        return [];
    }
}

function equippedItems() {
    try {
        if (typeof Equipment.items === 'function') {
            return Equipment.items() ?? [];
        }
    } catch {
        /* ABI shape differs */
    }
    return [];
}

function equippedNames() {
    return equippedItems().map(i => itemNameOf(i)).filter(Boolean);
}

function isHornName(name) {
    const n = normName(name);
    return n === 'unicorn horn' || n === 'unicorn horns';
}

function hornCount() {
    return invItems()
        .filter(i => isHornName(itemNameOf(i)))
        .reduce((n, i) => n + itemCount(i), 0);
}

function isUnicorn(n) {
    const name = normName(n?.name);
    return name === 'unicorn';
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

function isDragonDaggerName(name) {
    const n = normName(name);
    if (!n) {
        return false;
    }
    return n.startsWith('dragon dagger') || n.startsWith('drag dagger') || n === 'dds';
}

function isWeaponName(name) {
    const n = normName(name);
    if (!n || isDragonDaggerName(n)) {
        return false;
    }
    return WEAPON_RE.test(n);
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
    return invItems().find(i => isDragonDaggerName(itemNameOf(i))) ?? null;
}

function hasDragonDagger() {
    return wearingDragonDagger() || invDragonDagger() != null;
}

function equippedMainWeaponName() {
    for (const item of equippedItems()) {
        const name = itemNameOf(item);
        if (isWeaponName(name)) {
            return name;
        }
    }
    return '';
}

function invNamedWeapon(name) {
    const items = invItems();
    if (name) {
        const exact = items.find(i => nameEq(itemNameOf(i), name));
        if (exact) {
            return exact;
        }
    }
    return items.find(i => isWeaponName(itemNameOf(i))) ?? null;
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

async function wieldItem(item, untilFn) {
    if (!item) {
        return false;
    }
    if (typeof Equipment.equip === 'function') {
        await Equipment.equip(item.name ?? itemNameOf(item));
    } else if (typeof item.interact === 'function') {
        await item.interact('Wield');
    } else {
        return false;
    }
    return !!(await Execution.delayUntil(untilFn, 3000));
}

function nearestBank(tile) {
    if (!tile) {
        return BANKS[0];
    }
    const here = Tile.from(tile);
    let best = BANKS[0];
    let bestD = 9999;
    for (const bank of BANKS) {
        const d = cheb(here, bank.stand);
        if (d < bestD) {
            bestD = d;
            best = bank;
        }
    }
    return best;
}

function spotLabel(index) {
    const spot = HUNT_SPOTS[index] ?? HUNT_SPOTS[0];
    return `${spot.name} ${spot.tile.x},${spot.tile.z}`;
}

function nearSpot(tile, spot, radius = ARRIVE_RADIUS) {
    if (!tile || !spot) {
        return false;
    }
    return cheb(Tile.from(tile), spot.tile) <= radius;
}

function nearestSpotIndex(tile) {
    if (!tile) {
        return 0;
    }
    const here = Tile.from(tile);
    let best = 0;
    let bestD = 9999;
    for (let i = 0; i < HUNT_SPOTS.length; i++) {
        const d = cheb(here, HUNT_SPOTS[i].tile);
        if (d < bestD) {
            bestD = d;
            best = i;
        }
    }
    return best;
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
        /* private mode */
    }
    return null;
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
        /* private mode */
    }
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

function paintCanvasEl() {
    return typeof document !== 'undefined' ? document.getElementById('canvas') : null;
}

function paintCanvasPoint(e) {
    const canvas = e?.currentTarget instanceof HTMLElement ? e.currentTarget : paintCanvasEl();
    if (!canvas) {
        return null;
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
        return null;
    }
    const w = canvas.width > 0 ? canvas.width : PAINT_CANVAS_W;
    const h = canvas.height > 0 ? canvas.height : PAINT_CANVAS_H;
    const cx = e.clientX ?? e.x;
    const cy = e.clientY ?? e.y;
    if (cx == null || cy == null) {
        return null;
    }
    return {
        x: (cx - rect.left) * (w / rect.width),
        y: (cy - rect.top) * (h / rect.height)
    };
}

function pointInRect(p, r) {
    return Boolean(p && r && p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h);
}

function onPaintPointerEvent(e) {
    const bot = activePaintBot;
    if (!bot) {
        return;
    }
    if (!pointInRect(paintCanvasPoint(e), paintHornHit)) {
        return;
    }
    e.stopImmediatePropagation();
    e.preventDefault();
    const isDown = e.type === 'pointerdown' || e.type === 'mousedown';
    if (!isDown || (e.button != null && e.button !== 0)) {
        return;
    }
    bot.paintCollapsed = !bot.paintCollapsed;
    writePrefRaw('paintCollapsed', bot.paintCollapsed ? 'true' : 'false');
}

function installPaintClicks() {
    if (typeof document === 'undefined' || paintClicksInstalled) {
        return;
    }
    const canvas = paintCanvasEl();
    if (!canvas) {
        return;
    }
    paintClicksInstalled = true;
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'pointerup', 'click', 'dblclick']) {
        canvas.addEventListener(type, onPaintPointerEvent, true);
    }
}

function uninstallPaintClicks() {
    if (!paintClicksInstalled || typeof document === 'undefined') {
        return;
    }
    const canvas = paintCanvasEl();
    if (canvas) {
        for (const type of ['pointerdown', 'mousedown', 'mouseup', 'pointerup', 'click', 'dblclick']) {
            canvas.removeEventListener(type, onPaintPointerEvent, true);
        }
    }
    paintClicksInstalled = false;
}

function roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
}

function hornPath(ctx, x, y, w, h) {
    ctx.beginPath();
    ctx.moveTo(x + w * 0.08, y + h * 0.96);
    ctx.quadraticCurveTo(x - w * 0.08, y + h * 0.58, x + w * 0.42, y + h * 0.08);
    ctx.quadraticCurveTo(x + w * 0.62, y - h * 0.02, x + w * 0.92, y + h * 0.10);
    ctx.quadraticCurveTo(x + w * 0.58, y + h * 0.42, x + w * 0.70, y + h * 0.98);
    ctx.quadraticCurveTo(x + w * 0.36, y + h * 1.02, x + w * 0.08, y + h * 0.96);
    ctx.closePath();
}

function drawUnicornHorn(ctx, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(20, 12, 4, 0.28)';
    hornPath(ctx, x + 2, y + 3, w, h);
    ctx.fill();

    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#fff6c8');
    g.addColorStop(0.35, HORN_MUSTARD);
    g.addColorStop(0.75, HORN_DEEP);
    g.addColorStop(1, '#8a6418');
    hornPath(ctx, x, y, w, h);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = HORN_RIM;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.save();
    hornPath(ctx, x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = 'rgba(90, 58, 10, 0.45)';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
        const t = 0.12 + i * 0.14;
        ctx.beginPath();
        ctx.moveTo(x - 4, y + h * (t + 0.18));
        ctx.quadraticCurveTo(x + w * 0.45, y + h * (t - 0.02), x + w + 4, y + h * (t + 0.10));
        ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = 'rgba(255, 248, 210, 0.7)';
    ctx.beginPath();
    ctx.ellipse(x + w * 0.38, y + h * 0.22, w * 0.10, h * 0.07, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawHornPlaque(ctx, bot, rows) {
    installPaintClicks();
    const view = GAME_VIEW;
    const pad = 8;
    const hornW = 34;
    const hornH = 58;
    const collapsed = bot.paintCollapsed === true;
    const lineH = 14;
    const textPadX = 10;
    const textPadY = 8;
    const titleH = 16;
    const body = collapsed ? [] : rows;
    const boxH = collapsed ? 28 : textPadY * 2 + titleH + body.length * lineH;
    ctx.save();
    ctx.font = 'bold 11px sans-serif';
    let textW = ctx.measureText(SCRIPT_TITLE).width;
    ctx.font = '11px sans-serif';
    for (const row of body) {
        textW = Math.max(textW, ctx.measureText(row).width);
    }
    const boxW = collapsed ? 132 : Math.ceil(textW + textPadX * 2);
    const totalW = boxW + hornW - 10;
    const x = view.x + view.w - pad - totalW;
    const y = view.y + view.h - pad - Math.max(boxH, hornH);
    const boxY = y + Math.max(0, hornH - boxH);
    const hornX = x + boxW - 8;
    const hornY = y - 2;
    paintHornHit = { x: hornX, y: hornY, w: hornW + 4, h: hornH + 4 };

    ctx.shadowColor = 'rgba(20, 12, 0, 0.45)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    const fill = ctx.createLinearGradient(x, boxY, x, boxY + boxH);
    fill.addColorStop(0, 'rgba(246, 226, 140, 0.92)');
    fill.addColorStop(0.55, 'rgba(230, 196, 74, 0.90)');
    fill.addColorStop(1, 'rgba(184, 146, 42, 0.90)');
    roundRectPath(ctx, x, boxY, boxW, boxH, 8);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = HORN_RIM;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 243, 196, 0.55)';
    ctx.lineWidth = 1;
    roundRectPath(ctx, x + 1.5, boxY + 1.5, boxW - 3, boxH - 3, 7);
    ctx.stroke();

    drawUnicornHorn(ctx, hornX, hornY, hornW, hornH);

    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = HORN_TITLE;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(SCRIPT_TITLE, x + textPadX, boxY + (collapsed ? 8 : textPadY));
    if (!collapsed) {
        ctx.strokeStyle = 'rgba(122, 88, 20, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + textPadX, boxY + textPadY + titleH - 2);
        ctx.lineTo(x + boxW - textPadX - 18, boxY + textPadY + titleH - 2);
        ctx.stroke();
        ctx.font = '11px sans-serif';
        ctx.fillStyle = HORN_INK;
        body.forEach((row, i) => {
            ctx.fillText(row, x + textPadX, boxY + textPadY + titleH + i * lineH);
        });
    }
    ctx.restore();
}

class CamelotUnicornHunter extends LoopingBot {
    status = 'starting';
    recovering = false;
    deaths = 0;
    attacks = 0;
    kills = 0;
    eats = 0;
    specs = 0;
    hops = 0;
    bankTrips = 0;
    hornsTaken = 0;
    startReady = false;

    foodType = 'Lobster';
    eatAtPercent = 50;
    foodWithdraw = 8;
    useDragonDaggerSpec = false;

    spotIndex = 0;
    arrivedAtSpot = 0;
    mainWeaponName = '';
    specBusy = false;
    specWarned = false;
    nextSpecAttemptAt = 0;
    lastAttackAt = 0;
    paintCollapsed = false;

    startedAt = 0;
    cantReach = false;
    lastCombatAt = 0;
    fightNpcIndex = -1;
    fightNpcTile = null;
    ownLootTile = null;
    ownLootUntil = 0;
    unlockTimer = null;
    bankFailStreak = 0;

    async onStart() {
        await Execution.delayUntil(() => Game.ingame() && Game.tile() !== null, 0);
        Traversal.preload();
        this.startPausedPrefUnlock();

        this.syncPrefs({ silent: true });
        this.paintCollapsed = readPrefBool('paintCollapsed', false);
        activePaintBot = this;
        installPaintClicks();

        this.startedAt = Date.now();
        this.deaths = 0;
        this.attacks = 0;
        this.kills = 0;
        this.eats = 0;
        this.specs = 0;
        this.hops = 0;
        this.bankTrips = 0;
        this.hornsTaken = 0;
        this.startReady = false;
        this.recovering = false;
        this.cantReach = false;
        this.lastCombatAt = 0;
        this.fightNpcIndex = -1;
        this.fightNpcTile = null;
        this.ownLootTile = null;
        this.ownLootUntil = 0;
        this.specBusy = false;
        this.specWarned = false;
        this.nextSpecAttemptAt = 0;
        this.lastAttackAt = 0;
        this.bankFailStreak = 0;
        this.arrivedAtSpot = 0;
        this.mainWeaponName = equippedMainWeaponName();
        this.spotIndex = nearestSpotIndex(Game.tile());

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

        this.on('skill.level', e => {
            if (COMBAT_TRACK.includes(e.name)) {
                this.log(`${e.name} level ${e.previous} -> ${e.level}`);
            }
        });

        const ddsBit = this.useDragonDaggerSpec
            ? `DDS Puncture on (Attack ${DDS_WIELD_ATTACK}+, ${DDS_SPEC_PERCENT}% spec)`
            : 'DDS Puncture off';
        this.log(`${SCRIPT_TITLE} v${SCRIPT_VERSION}`);
        this.log(
            `started, hunt ${HUNT_SPOTS.map(s => `${s.name} ${s.tile.x},${s.tile.z}`).join(' -> ')}; ` +
                `eat ${this.foodType} at <=${this.eatAtPercent}% HP; bring ${this.foodWithdraw}; ${ddsBit}`
        );
        this.log('loot: Unicorn horns. Pack full or out of food -> nearer of Seers / Catherby bank');
        this.log('tip: Pause -> Edit parameters to change food / eat % / DDS spec without stopping');
        this.log('paint: click the horn (bottom-right of the world view) to collapse');
        this.status = 'start: hunt or bank';
    }

    onPause() {
        unlockPausedPrefsUi();
    }

    onResume() {
        this.syncPrefs({ silent: false });
    }

    onStop() {
        this.stopPausedPrefUnlock();
        uninstallPaintClicks();
        if (activePaintBot === this) {
            activePaintBot = null;
        }
        this.log(
            `stopped, ${this.attacks} attacks, ${this.kills} kills, ${this.hornsTaken} horns, ` +
                `${this.eats} eats, ${this.specs} specs, ${this.hops} hops, ${this.bankTrips} bank trips, ` +
                `${this.deaths} deaths (${this.status})`
        );
    }

    startPausedPrefUnlock() {
        this.stopPausedPrefUnlock();
        this.unlockTimer = setInterval(() => unlockPausedPrefsUi(), 500);
        unlockPausedPrefsUi();
    }

    stopPausedPrefUnlock() {
        if (this.unlockTimer !== null) {
            clearInterval(this.unlockTimer);
            this.unlockTimer = null;
        }
    }

    syncPrefs(opts = {}) {
        const silent = opts.silent === true;
        const prevFood = this.foodType;
        const prevEat = this.eatAtPercent;
        const prevBring = this.foodWithdraw;
        const prevDds = this.useDragonDaggerSpec;

        let food = readPrefStr('foodType', this.settings.str('foodType', this.foodType));
        if (!FOOD_TYPES[food]) {
            food = 'Lobster';
        }
        this.foodType = food;
        this.eatAtPercent = clampPercent(
            readPrefNum('eatAtPercent', this.settings.num('eatAtPercent', this.eatAtPercent))
        );
        this.foodWithdraw = clampFoodAmount(
            readPrefNum('foodWithdraw', this.settings.num('foodWithdraw', this.foodWithdraw))
        );
        this.useDragonDaggerSpec = readPrefBool(
            'useDragonDaggerSpec',
            this.settings.bool('useDragonDaggerSpec', this.useDragonDaggerSpec)
        );

        if (!silent && prevFood !== this.foodType) {
            this.log(`prefs: food -> ${this.foodType}`);
        }
        if (!silent && prevEat !== this.eatAtPercent) {
            this.log(`prefs: eat at <= ${this.eatAtPercent}% HP`);
        }
        if (!silent && prevBring !== this.foodWithdraw) {
            this.log(`prefs: bring ${this.foodWithdraw}x ${this.foodType}`);
        }
        if (!silent && prevDds !== this.useDragonDaggerSpec) {
            this.log(`prefs: DDS Puncture -> ${this.useDragonDaggerSpec ? 'on' : 'off'}`);
        }
    }

    foodCfg() {
        return FOOD_TYPES[this.foodType] ?? FOOD_TYPES.Lobster;
    }

    foodNames() {
        return this.foodCfg().eat.slice();
    }

    withdrawNames() {
        return this.foodCfg().withdraw.slice();
    }

    findBestFood() {
        for (const name of this.foodNames()) {
            const item = invItems().find(i => nameEq(itemNameOf(i), name));
            if (item) {
                return item;
            }
        }
        return null;
    }

    foodCount() {
        const allowed = new Set(this.foodNames().map(n => n.toLowerCase()));
        return invItems()
            .filter(i => allowed.has(itemNameOf(i).toLowerCase()))
            .reduce((n, i) => n + itemCount(i), 0);
    }

    needEat() {
        if (!this.findBestFood()) {
            return false;
        }
        return hpPercent() <= this.eatAtPercent;
    }

    describeFood() {
        if (this.foodType === 'Cake') {
            return `${FOOD_CAKE} / ${FOOD_TWO_THIRDS} / ${FOOD_SLICE}`;
        }
        if (this.foodType === 'Shrimp') {
            return `${FOOD_SHRIMPS} / ${FOOD_SHRIMP}`;
        }
        if (this.foodType === 'Anchovies') {
            return `${FOOD_ANCHOVIES} / ${FOOD_ANCHOVY}`;
        }
        return this.foodType;
    }

    stopNoFood(context) {
        this.status = 'no food, stopped';
        this.log(
            `${context}: no ${this.describeFood()} in Seers or Catherby bank, stopping (restock food, then restart)`
        );
        stopScript();
    }

    rememberMainWeapon() {
        const worn = equippedMainWeaponName();
        if (worn) {
            this.mainWeaponName = worn;
        }
    }

    isKeepOnDeposit(name) {
        if (isDragonDaggerName(name)) {
            return true;
        }
        if (this.mainWeaponName && nameEq(name, this.mainWeaponName)) {
            return true;
        }
        return isWeaponName(name);
    }

    currentSpot() {
        return HUNT_SPOTS[this.spotIndex] ?? HUNT_SPOTS[0];
    }

    noteCombat() {
        this.lastCombatAt = Date.now();
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

    npcByIndex(index) {
        if (index == null || index < 0) {
            return null;
        }
        return (
            Npcs.query()
                .where(n => n.index === index)
                .nearest() ?? null
        );
    }

    currentFightNpc() {
        return this.npcByIndex(this.fightNpcIndex);
    }

    recentlyAttacked(ms = 8_000) {
        return this.lastAttackAt > 0 && Date.now() - this.lastAttackAt < ms;
    }

    liveFightUnicorn() {
        const engaged = this.findUnicornFightingMe();
        if (engaged) {
            return engaged;
        }
        const current = this.currentFightNpc();
        if (!current || !isUnicorn(current) || npcTargetsAnother(current)) {
            return null;
        }
        if (!this.recentlyAttacked()) {
            return null;
        }
        return current;
    }

    refreshOwnKillLoot() {
        if (this.fightNpcIndex < 0) {
            return;
        }
        const still = this.npcByIndex(this.fightNpcIndex);
        if (still) {
            const t = still.tile?.() ?? null;
            if (t) {
                this.fightNpcTile = Tile.from(t);
            }
            return;
        }
        this.kills++;
        if (this.fightNpcTile) {
            this.ownLootTile = this.fightNpcTile;
            this.ownLootUntil = Date.now() + OWN_LOOT_MS;
            this.log(`own kill @ ${this.ownLootTile.x},${this.ownLootTile.z}, loot window open`);
        }
        this.fightNpcIndex = -1;
        this.fightNpcTile = null;
        this.lastAttackAt = 0;
        this.arrivedAtSpot = Date.now();
    }

    listGroundItems(within = GROUND_SCAN_RADIUS) {
        try {
            const list = GroundItems.query().within(within).results();
            if (Array.isArray(list)) {
                return list;
            }
        } catch {
            /* fall through */
        }
        try {
            const one = GroundItems.query().within(within).nearest();
            return one ? [one] : [];
        } catch {
            return [];
        }
    }

    findGroundHorn() {
        const lootOpen = this.ownLootTile && Date.now() <= this.ownLootUntil;
        let best = null;
        let bestD = 9999;
        for (const g of this.listGroundItems()) {
            const name = itemNameOf(g);
            if (!isHornName(name)) {
                continue;
            }
            const t = g.tile?.() ?? null;
            if (!t) {
                continue;
            }
            const here = Game.tile();
            const d = here ? Tile.from(t).distanceTo(here) : 0;
            if (lootOpen && this.ownLootTile && Tile.from(t).distanceTo(this.ownLootTile) <= OWN_LOOT_RADIUS) {
                return g;
            }
            if (d < bestD) {
                bestD = d;
                best = g;
            }
        }
        return best;
    }

    findUnicornFightingMe() {
        return (
            Npcs.query()
                .within(CHASE_RADIUS + 8)
                .where(n => isUnicorn(n))
                .where(n => npcTargetsMe(n))
                .nearest() ?? null
        );
    }

    findAttackableUnicorn() {
        const fighting = this.findUnicornFightingMe();
        if (fighting && (npcTargetsMe(fighting) || fighting.inCombat)) {
            return fighting;
        }

        const spot = this.currentSpot();
        const nearSpot =
            Npcs.query()
                .within(SCAN_RADIUS + 6)
                .where(n => isUnicorn(n))
                .where(n => hasAttackOp(n))
                .where(n => !npcTargetsAnother(n))
                .where(n => {
                    const t = n.tile?.() ?? null;
                    return !!t && cheb(Tile.from(t), spot.tile) <= SCAN_RADIUS;
                })
                .nearest() ?? null;
        if (nearSpot) {
            return nearSpot;
        }

        return (
            Npcs.query()
                .within(CHASE_RADIUS)
                .where(n => isUnicorn(n))
                .where(n => hasAttackOp(n))
                .where(n => !npcTargetsAnother(n))
                .nearest() ?? null
        );
    }

    unicornVisibleAtCurrentSpot() {
        const spot = this.currentSpot();
        return (
            Npcs.query()
                .within(SCAN_RADIUS + 6)
                .where(n => isUnicorn(n))
                .where(n => {
                    const t = n.tile?.() ?? null;
                    return !!t && cheb(Tile.from(t), spot.tile) <= SCAN_RADIUS;
                })
                .nearest() != null
        );
    }

    hopToNextSpot(reason) {
        const from = this.currentSpot();
        this.spotIndex = (this.spotIndex + 1) % HUNT_SPOTS.length;
        this.arrivedAtSpot = 0;
        this.hops++;
        const to = this.currentSpot();
        this.log(
            `${reason}, hop ${from.name} ${from.tile.x},${from.tile.z} -> ${to.name} ${to.tile.x},${to.tile.z}`
        );
    }

    async walkTo(dest, opts = {}) {
        const radius = opts.radius ?? 3;
        const timeoutMs = opts.timeoutMs ?? 20_000;
        const log = opts.log;
        if (typeof Traversal.walkResilient === 'function') {
            return !!(await Traversal.walkResilient(dest, { radius, timeoutMs, log }));
        }
        return !!(await Traversal.walkTo(dest, { radius, timeoutMs }));
    }

    async loop() {
        this.syncPrefs({ silent: true });
        unlockPausedPrefsUi();
        this.rememberMainWeapon();

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

        if (this.needEat()) {
            await this.eatFood();
            return;
        }

        if (!this.startReady) {
            const here = Game.tile();
            if (here && this.foodCount() > 0 && !packFull()) {
                this.startReady = true;
                this.spotIndex = nearestSpotIndex(here);
                this.log(
                    `already holding ${this.foodCount()}x ${this.describeFood()}, hunting from ${spotLabel(this.spotIndex)}`
                );
            } else {
                await this.bankFoodRestock({ startup: true });
                return;
            }
        }

        if (Bank.isOpen()) {
            await Bank.close();
            return;
        }

        const here = Game.tile();
        if (!here) {
            await Execution.delayTicks(2);
            return;
        }

        this.refreshOwnKillLoot();

        if (await this.handleLoot()) {
            return;
        }

        const fight = this.liveFightUnicorn();
        if (fight) {
            this.noteCombat();
            this.noteFightTarget(fight);
            this.status = 'in combat';
            if (!this.recentlyAttacked()) {
                await this.clickAttack(fight);
                return;
            }
            if (this.useDragonDaggerSpec && this.canPuncture()) {
                await this.maybeDragonDaggerSpec(fight);
            } else {
                await Execution.delayTicks(2);
            }
            return;
        }

        if (this.foodCount() === 0 || packFull()) {
            if (packFull()) {
                this.log(
                    `pack full (${packUsed()}/28), bank horns at nearer Seers / Catherby, withdraw ${this.foodWithdraw}x ${this.describeFood()}`
                );
            } else {
                this.log(`out of ${this.describeFood()}, restocking at nearer Seers / Catherby`);
            }
            await this.bankFoodRestock({});
            return;
        }

        const target = this.findAttackableUnicorn();
        if (target) {
            const t = target.tile?.() ?? null;
            if (t) {
                const near = HUNT_SPOTS.findIndex(s => cheb(Tile.from(t), s.tile) <= SCAN_RADIUS);
                if (near >= 0) {
                    this.spotIndex = near;
                }
            }
            await this.attackUnicorn(target);
            return;
        }

        const spot = this.currentSpot();
        if (!nearSpot(here, spot, ARRIVE_RADIUS)) {
            this.status = `walking to ${spot.name}`;
            this.log(`walking to ${spot.name} ${spot.tile.x},${spot.tile.z}`);
            const ok = await this.walkTo(spot.tile, {
                radius: 3,
                timeoutMs: 45_000,
                log: m => this.log(`  ${m}`)
            });
            if (ok || nearSpot(Game.tile(), spot, ARRIVE_RADIUS)) {
                this.arrivedAtSpot = Date.now();
            }
            return;
        }

        if (this.arrivedAtSpot <= 0) {
            this.arrivedAtSpot = Date.now();
        }

        if (this.unicornVisibleAtCurrentSpot()) {
            this.arrivedAtSpot = Date.now();
            this.status = `waiting at ${spot.name}`;
            await Execution.delayTicks(2);
            return;
        }

        if (Date.now() - this.arrivedAtSpot < EMPTY_DWELL_MS) {
            this.status = `no unicorn yet at ${spot.name}`;
            await Execution.delayTicks(2);
            return;
        }

        this.hopToNextSpot(`no unicorn at ${spot.name} ${spot.tile.x},${spot.tile.z}`);
        this.status = `hop to ${this.currentSpot().name}`;
    }

    async clickAttack(npc) {
        if (!npc) {
            return false;
        }
        this.noteFightTarget(npc);
        this.cantReach = false;
        if (!(await npc.interact('Attack'))) {
            return false;
        }
        this.lastAttackAt = Date.now();
        this.noteCombat();
        return true;
    }

    async attackUnicorn(npc) {
        const name = npc.name ?? 'Unicorn';
        const t = npc.tile();
        this.status = `attacking ${name}`;
        this.log(`attacking ${name} @ ${t.x},${t.z}`);
        await this.clickAttack(npc);
        await Execution.delayUntil(
            () => Game.inCombat() || this.cantReach || this.findUnicornFightingMe() !== null,
            4000
        );

        if (Game.inCombat() || this.findUnicornFightingMe()) {
            this.attacks++;
            const fighting = this.findUnicornFightingMe();
            if (fighting) {
                this.noteFightTarget(fighting);
            }
            return;
        }

        if (this.cantReach) {
            this.log(`can't reach ${name}, walking closer`);
            if (t) {
                await this.walkTo(Tile.from(t), { radius: 1, timeoutMs: 6_000 });
            }
            this.cantReach = false;
            const again =
                Npcs.query()
                    .where(n => n.index === npc.index)
                    .nearest() ?? this.findAttackableUnicorn();
            if (again) {
                this.log(`retrying Attack on ${again.name ?? name}`);
                await this.clickAttack(again);
                await Execution.delayUntil(
                    () => Game.inCombat() || this.cantReach || this.findUnicornFightingMe() !== null,
                    3000
                );
                if (Game.inCombat() || this.findUnicornFightingMe()) {
                    this.attacks++;
                }
            }
        }
    }

    async handleLoot() {
        const horn = this.findGroundHorn();
        if (!horn) {
            return false;
        }
        if (packFull()) {
            if (this.findBestFood()) {
                await this.eatFood({ reason: 'space' });
                return true;
            }
            return false;
        }
        const name = itemNameOf(horn);
        const t = horn.tile?.() ?? null;
        this.status = `taking ${name}`;
        this.log(`Take ${name}${t ? ` @ ${t.x},${t.z}` : ''}`);
        const before = hornCount();
        if (typeof horn.interact === 'function') {
            await horn.interact('Take');
        }
        if (await Execution.delayUntil(() => hornCount() > before, 4000)) {
            this.hornsTaken += Math.max(1, hornCount() - before);
            return true;
        }
        return true;
    }

    async eatFood(opts = {}) {
        const food = this.findBestFood();
        if (!food) {
            return false;
        }
        const before = currentHp();
        const usedBefore = packUsed();
        const pct = Math.round(hpPercent());
        const forSpace = opts.reason === 'space';
        this.status = forSpace ? `eating ${food.name} (space)` : `eating ${food.name}`;
        this.log(
            forSpace
                ? `pack full, Eat ${food.name} to free a slot for a horn`
                : `HP ${before}/${maxHp()} (${pct}%) <= ${this.eatAtPercent}%, Eat ${food.name}`
        );
        if (!(await food.interact('Eat'))) {
            await Execution.delayTicks(1);
            return false;
        }
        if (await Execution.delayUntil(() => currentHp() > before || packUsed() < usedBefore, 3000)) {
            this.eats++;
            return true;
        }
        return false;
    }

    canPuncture() {
        if (!this.useDragonDaggerSpec) {
            return false;
        }
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
        this.rememberMainWeapon();
        this.status = `wielding ${itemNameOf(dagger)}`;
        this.log(`swapping to ${itemNameOf(dagger)} for Puncture`);
        return wieldItem(dagger, () => wearingDragonDagger());
    }

    async wieldMainWeaponBack() {
        if (!wearingDragonDagger()) {
            return true;
        }
        const want = this.mainWeaponName;
        const item = invNamedWeapon(want);
        if (!item) {
            return false;
        }
        this.status = `wielding ${itemNameOf(item)}`;
        this.log(`swapping back to ${itemNameOf(item)}`);
        return wieldItem(item, () => !wearingDragonDagger());
    }

    async resumeAttack(npc) {
        const target = this.liveFightUnicorn() || this.npcByIndex(npc?.index) || npc;
        if (!target || !isUnicorn(target) || npcTargetsAnother(target)) {
            return false;
        }
        return this.clickAttack(target);
    }

    async maybeDragonDaggerSpec(npc) {
        if (this.specBusy || !this.canPuncture() || !this.liveFightUnicorn()) {
            return false;
        }
        this.specBusy = true;
        try {
            if (!(await this.wieldDragonDaggerForSpec()) || !wearingDragonDagger()) {
                this.log('could not wield a dragon dagger for Puncture');
                return true;
            }
            if (!this.liveFightUnicorn()) {
                this.log('lost the unicorn before Puncture, swap back');
                return true;
            }
            await this.resumeAttack(npc);
            const engaged = await Execution.delayUntil(
                () => Game.inCombat() || this.findUnicornFightingMe() !== null,
                2000
            );
            if (!engaged && !this.liveFightUnicorn()) {
                this.log('not in combat after dagger swap, skip Puncture');
                return true;
            }
            if (!hasPunctureEnergy()) {
                this.log(
                    `spec ${Math.round(specEnergyPercent())}% is below ${DDS_SPEC_PERCENT}%, swap back`
                );
                return true;
            }
            const energy = Math.round(specEnergyPercent());
            this.status = `Puncture spec (${energy}%)`;
            this.log(`Puncture: dragon dagger spec (${energy}% energy)`);
            const before = specEnergyPercent();
            if (!specIsEnabled()) {
                if (!clickSpecialBar()) {
                    this.log('could not send Puncture spec packet');
                    return true;
                }
            }
            const consumed = await Execution.delayUntil(
                () => specEnergyPercent() <= before - DDS_SPEC_PERCENT + 5 || specEnergyPercent() < before - 2,
                2500
            );
            await Execution.delayTicks(1);
            if (consumed) {
                this.specs++;
                this.nextSpecAttemptAt = Date.now() + 1800;
                this.log(`Puncture #${this.specs} done, spec ${Math.round(specEnergyPercent())}%`);
            } else {
                this.nextSpecAttemptAt = Date.now() + 6000;
                this.log('Puncture did not consume spec energy');
            }
            return true;
        } finally {
            await this.wieldMainWeaponBack();
            if (this.liveFightUnicorn() || this.npcByIndex(npc?.index)) {
                await this.resumeAttack(npc);
            }
            this.specBusy = false;
        }
    }

    async openBank(bank) {
        if (Bank.isOpen()) {
            const here = Game.tile();
            if (here && cheb(here, bank.stand) <= 12) {
                return true;
            }
            this.log('wrong bank open, closing');
            await Bank.close();
            await Execution.delayTicks(1);
        }

        const here = Game.tile();
        if (here && cheb(here, bank.stand) > BANK_RADIUS) {
            this.status = `walking to ${bank.name} bank`;
            this.log(`walking to ${bank.name} bank ${bank.stand.x},${bank.stand.z}`);
            const ok = await this.walkTo(bank.stand, {
                radius: 4,
                timeoutMs: 30_000,
                log: m => this.log(`  ${m}`)
            });
            if (!ok) {
                this.log(`path to ${bank.name} bank failed, retrying`);
                return false;
            }
        }

        if (!Game.tile() || cheb(Game.tile(), bank.stand) > BANK_RADIUS) {
            return false;
        }

        this.status = `opening ${bank.name} bank`;
        this.log(`opening ${bank.name} bank booth`);
        if (typeof Bank.openBooth === 'function') {
            return !!(await Bank.openBooth(bank.stand, 'Bank booth', 'Use-quickly', m =>
                this.log(`  ${m}`)
            ));
        }
        return !!(await Banking.open({
            stand: bank.stand,
            log: m => this.log(`  ${m}`)
        }));
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
        for (const { name, take } of plan) {
            this.log(`withdrawing ${take}x ${name}`);
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

    bankFoodCount() {
        let n = 0;
        for (const name of this.withdrawNames()) {
            n += Bank.count(name) || 0;
        }
        return n;
    }

    async depositKeepGear() {
        this.log('depositing inventory (keeping weapons and dragon dagger)');
        const keep = name => this.isKeepOnDeposit(name);
        if (typeof Bank.depositAllMatching === 'function') {
            await Bank.depositAllMatching(name => !keep(name));
        } else if (typeof Bank.depositInventory === 'function' && !invDragonDagger() && !this.mainWeaponName) {
            await Bank.depositInventory();
        }
        await Execution.delayUntil(() => packUsed() <= 3, 4000);
        await Execution.delayTicks(1);
        if (packUsed() > 3 && typeof Bank.depositAllMatching === 'function') {
            this.log(`still holding ${packUsed()} slot(s), depositing remaining (keep weapons)`);
            await Bank.depositAllMatching(name => !keep(name));
            await Execution.delayUntil(() => packUsed() <= 3, 3000);
        }
    }

    async withdrawDragonDagger() {
        if (!this.useDragonDaggerSpec || hasDragonDagger()) {
            return;
        }
        for (const name of DRAGON_DAGGER_NAMES) {
            const n = typeof Bank.count === 'function' ? Bank.count(name) || 0 : 0;
            if (n <= 0) {
                continue;
            }
            this.log(`withdrawing ${name} for Puncture`);
            if (typeof Bank.withdrawX === 'function') {
                await Bank.withdrawX(name, 1);
            } else if (typeof Bank.withdraw === 'function') {
                await Bank.withdraw(name);
            }
            await Execution.delayUntil(() => hasDragonDagger(), 3000);
            return;
        }
        if (!this.specWarned) {
            this.specWarned = true;
            this.log('no dragon dagger in pack or bank, Puncture specs skipped');
        }
    }

    async restockAtOpenBank(bank, want) {
        if (typeof Bank.loaded === 'function') {
            await Execution.delayUntil(
                () => Bank.loaded() || (typeof Bank.items === 'function' && Bank.items().length > 0),
                5000
            );
        }
        await Execution.delayTicks(1);
        await this.depositKeepGear();
        await this.withdrawDragonDagger();
        if (this.bankFoodCount() <= 0) {
            return false;
        }
        if (!(await this.withdrawResolvedFood(want))) {
            return false;
        }
        return this.foodCount() >= Math.min(want, this.foodCount() || want);
    }

    async bankFoodRestock(opts = {}) {
        this.status = 'banking';
        const startup = opts.startup === true;
        const want = this.foodWithdraw;
        const here = Game.tile();
        const first = nearestBank(here);
        const order = [first, ...BANKS.filter(b => b.name !== first.name)];

        for (const bank of order) {
            if (!Bank.isOpen() || (Game.tile() && cheb(Game.tile(), bank.stand) > 12)) {
                this.log(
                    `${startup ? 'startup: ' : ''}${bank.name} ${bank.stand.x},${bank.stand.z}, deposit horns, withdraw ${want}x ${this.foodCfg().withdraw[0]}`
                );
                if (!(await this.openBank(bank))) {
                    this.log(`could not open ${bank.name} bank, trying next`);
                    continue;
                }
            }
            if (await this.restockAtOpenBank(bank, want)) {
                await Bank.close();
                this.bankTrips++;
                this.bankFailStreak = 0;
                this.startReady = true;
                this.spotIndex = nearestSpotIndex(Game.tile());
                this.arrivedAtSpot = 0;
                this.status = `heading to ${this.currentSpot().name}`;
                this.log(
                    `inventory ready, ${this.foodCount()}x ${this.describeFood()}, ${hornCount()} horns banked this trip, hunting ${spotLabel(this.spotIndex)}`
                );
                return;
            }
            this.log(`no ${this.describeFood()} at ${bank.name}, trying the other bank`);
            if (Bank.isOpen()) {
                await Bank.close();
                await Execution.delayTicks(1);
            }
        }

        this.bankFailStreak++;
        if (this.bankFailStreak >= 2) {
            this.stopNoFood('restock');
            return;
        }
        await Execution.delayTicks(3);
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
        this.lastCombatAt = 0;
        this.lastAttackAt = 0;
        this.startReady = false;
        this.specBusy = false;
        this.arrivedAtSpot = 0;
        this.status = 'dead, restock food';
        this.log('respawned, bank then back to Camelot / Seers unicorns');
    }

    onPaint(ctx) {
        const elapsed = Date.now() - this.startedAt;
        const hp = currentHp();
        const max = maxHp();
        const pct = Math.round((hp / max) * 100);
        const spot = this.currentSpot();
        const specBit = this.useDragonDaggerSpec
            ? `DDS ${Math.round(specEnergyPercent())}%`
            : 'DDS off';
        drawHornPlaque(ctx, this, [
            `${fmtElapsed(elapsed)}   ${this.status}`,
            `${spot.name}  ${spot.tile.x},${spot.tile.z}`,
            `HP ${hp}/${max} (${pct}%)   ${this.foodType} ${this.foodCount()}/${this.foodWithdraw}`,
            `kills ${this.kills}   horns ${this.hornsTaken}   ${specBit}`,
            `specs ${this.specs}   hops ${this.hops}   banks ${this.bankTrips}`
        ]);
    }
}

export default defineBot({
    name: SCRIPT_NAME,
    version: SCRIPT_VERSION_FULL,
    category: 'Combat',
    tags: [
        'unicorn',
        'unicorn horn',
        'camelot',
        'seers',
        'catherby',
        'melee',
        'food',
        'bank',
        'dragon dagger',
        'special attack',
        'benzyme'
    ],
    description:
        "Benzyme's Unicorn Hunter. Hunts Unicorns around Camelot and Seers Village at 2783,3466, 2791,3460, 2700,3423, and 2700,3442. If no Unicorn is in view at the current pin it hops to the next. Takes Unicorn horns. Pack full or out of food banks at the nearer of Seers 2726,3491 or Catherby 2809,3441, then withdraws the chosen food. Food dropdown: Shrimp, Anchovies, Cake, Tuna, Lobster, Swordfish, Shark. Eat-at HP% slider. Optional checkbox: swap to a dragon dagger for Puncture (25% spec) then swap back.",
    settingsSchema: {
        foodType: {
            type: 'string',
            default: 'Lobster',
            options: FOOD_OPTIONS,
            label: 'Food',
            group: 'Food',
            help:
                'Eat and restock this food. Cake eats leftovers first (Slice of cake, 2/3 cake, Cake). Shrimp matches Shrimps/Shrimp; Anchovies matches Anchovies/Anchovy. Out of food or pack full -> nearer of Seers or Catherby. None in either bank -> stop.'
        },
        eatAtPercent: {
            type: 'number',
            default: 50,
            min: 1,
            max: 100,
            label: 'Eat at HP %',
            group: 'Food',
            help: 'Scroll bar 1-100: eat when current Hitpoints are at or below this percent of max HP'
        },
        foodWithdraw: {
            type: 'number',
            default: 8,
            min: 1,
            max: 28,
            label: 'Amount to withdraw',
            group: 'Food',
            help: 'Number box 1-28: how many of the selected food to withdraw after depositing horns (default 8).'
        },
        useDragonDaggerSpec: {
            type: 'boolean',
            default: false,
            label: 'Swap to dragon dagger for spec',
            group: 'Combat',
            help:
                'When on and Attack is 60+, swap to a dragon dagger in combat for Puncture (25% special energy), then swap back to the weapon you were using. Needs a dragon dagger in the pack or bank. Off leaves your weapon alone.'
        }
    },
    create: () => new CamelotUnicornHunter()
});
