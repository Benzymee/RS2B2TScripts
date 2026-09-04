/**
 * Alchgility. WARNING: High Alchs the whole inventory on the Gnome Stronghold agility course.
 * Load URL: https://cdn.jsdelivr.net/gh/Benzymee/RS2B2TScripts@main/Alchgility.js
 */
const SUPPORTED_API_VERSION = 1;
const abi = globalThis.__rs2b0t;
if (!abi) {
  throw new Error("Alchgility: globalThis.__rs2b0t missing, load inside rs2b0t bot.html");
}
if (abi.apiVersion !== SUPPORTED_API_VERSION) {
  throw new Error(`Alchgility: ABI ${abi.apiVersion} != supported ${SUPPORTED_API_VERSION}`);
}
const {
  defineBot,
  Execution,
  Game,
  LoopingBot: LoopingBotBase,
  Locs,
  Inventory,
  Equipment,
  Bank,
  Skills,
  ChatDialog,
  Traversal,
  Tile
} = abi;
const SCRIPT_NAME = "Alchgility";
const SCRIPT_TITLE = "Benzyme's Alchgility";
const SCRIPT_VERSION = "1.8.0";
const WELCOME_SCREEN_ID = 5993;
const MAGIC_TAB = 6;
const INV_TAB = 3;
const INV_COM = 3214;
const OPHELDT = 135;
const TGT_BUTTON = 274;
const TGT_HELD = 563;
const SPELL = {
  key: "High",
  label: "High Level Alchemy",
  level: 55,
  xp: 65,
  fire: 5,
  ticks: 5,
  names: ["High Level Alchemy", "High alchemy", "High Alchemy", "High-level alchemy"],
  fallbackCom: 1178
};
const NATURE_RUNE_IDS = /* @__PURE__ */ new Set([561]);
const FIRE_RUNE_IDS = /* @__PURE__ */ new Set([554]);
const COINS_ID = 995;
const GNOME_COURSE_START = new Tile(2474, 3436, 0);
const GNOME_COURSE_RADIUS = 20;
const DEFAULT_OBSTACLES = "Log balance,Obstacle net,Tree branch,Balancing rope,Tree branch,Obstacle net,Obstacle pipe";
const GNOME_STEPS = [
  { name: "log balance", locX: 2474, locZ: 3435, standX: 2474, standZ: 3436, walk: true },
  { name: "obstacle net", locX: 2474, locZ: 3426, standX: 2474, standZ: 3429, walk: false },
  { name: "tree branch", locX: 2473, locZ: 3423, standX: 2473, standZ: 3423, walk: false },
  { name: "balancing rope", locX: 2478, locZ: 3420, standX: 2474, standZ: 3420, walk: false },
  { name: "tree branch", locX: 2483, locZ: 3420, standX: 2483, standZ: 3420, walk: false },
  { name: "obstacle net", locX: 2483, locZ: 3426, standX: 2483, standZ: 3423, walk: false },
  { name: "obstacle pipe", locX: 2484, locZ: 3431, standX: 2484, standZ: 3430, walk: true }
];
const PIN_MATCH = 6;
const ALCH_TICK_MS = SPELL.ticks * 600;
const OBSTACLE_XP_MS = 8e3;
const DEFAULT_ALCHS_PER_OBSTACLE = 3;
const TITLE_BROWN = "#c4782a";
const NATURE_RUNE_PNG = "data:image/png;base64,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";
const natureRuneIcon = typeof Image !== "undefined" ? new Image() : null;
if (natureRuneIcon) {
  natureRuneIcon.src = NATURE_RUNE_PNG;
}
const FIRE_STAFF_NAMES = [
  "Staff of fire",
  "Fire staff",
  "Fire battlestaff",
  "Mystic fire staff",
  "Lava battlestaff",
  "Mystic lava staff",
  "Steam battlestaff",
  "Mystic steam staff",
  "Smoke battlestaff",
  "Mystic smoke staff"
];
function welcomeHost() {
  return globalThis.rs2b0t ?? null;
}
function rawClient() {
  return welcomeHost()?.client ?? globalThis.__client ?? null;
}
function isWelcomeModalOpen() {
  const host = welcomeHost();
  if (!host?.reader) {
    return false;
  }
  const { reader } = host;
  const main = typeof reader.modals === "function" ? reader.modals().main : -1;
  if (main === -1) {
    return false;
  }
  if (main === WELCOME_SCREEN_ID) {
    return true;
  }
  if (typeof reader.mainModalTexts !== "function") {
    return false;
  }
  const texts = reader.mainModalTexts();
  return texts.some(
    (t) => /welcome to runescape/i.test(t) || /unread messages?/i.test(t) || /jagex staff will never email/i.test(t)
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
    const main = reader.modals?.().main ?? -1;
    if (main === -1) {
      break;
    }
    let clicked = typeof actions.closeModal === "function" && actions.closeModal();
    if (!clicked && typeof reader.closeButtonComId === "function" && typeof actions.ifButton === "function") {
      const closeId = reader.closeButtonComId(main);
      if (closeId !== -1) {
        clicked = !!actions.ifButton(closeId);
      }
    }
    if (!clicked && typeof reader.buttonByText === "function" && typeof actions.ifButton === "function") {
      for (const label of ["Close Window", "Close"]) {
        const btn = reader.buttonByText(main, label);
        if (btn !== -1 && actions.ifButton(btn)) {
          clicked = true;
          break;
        }
      }
    }
    if (!clicked && typeof actions.closeMainModal === "function") {
      actions.closeMainModal(main);
    }
    await Execution.delay(250);
  }
  return !isWelcomeModalOpen();
}
function fmtElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1e3));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor(totalSec % 3600 / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}
function fmtXph(n) {
  const v = Math.max(0, Math.floor(n));
  return v.toLocaleString("en-US");
}
function normName(name) {
  return String(name ?? "").toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();
}
function objType(id) {
  if (id == null || id < 0) {
    return null;
  }
  try {
    const OT = globalThis.ObjType ?? globalThis.__rs2b0t?.ObjType ?? globalThis.__client?.ObjType ?? null;
    if (!OT || typeof OT.list !== "function") {
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
  return typeof tmpl === "number" && tmpl >= 0 && tmpl !== id;
}
function isNatureRune(name, id) {
  if (typeof id === "number" && NATURE_RUNE_IDS.has(id)) {
    return true;
  }
  const n = normName(name);
  return n === "nature rune" || n === "nature runes";
}
function isFireRune(name, id) {
  if (typeof id === "number" && FIRE_RUNE_IDS.has(id)) {
    return true;
  }
  const n = normName(name);
  return n === "fire rune" || n === "fire runes";
}
function isCoins(name, id) {
  if (id === COINS_ID) {
    return true;
  }
  const n = normName(name);
  return n === "coins" || n === "coin";
}
function isFireStaffName(name) {
  const n = normName(name);
  if (!n) {
    return false;
  }
  if (FIRE_STAFF_NAMES.some((s) => normName(s) === n)) {
    return true;
  }
  return n.includes("staff") && (n.includes("fire") || n.includes("lava") || n.includes("steam") || n.includes("smoke"));
}
function isDropJunk(name) {
  const n = normName(name);
  if (!n) {
    return false;
  }
  if (n === "kebab") {
    return true;
  }
  if (n === "strange fruit" || n.includes("strange fruit")) {
    return true;
  }
  if (n === "casket" || n.includes("casket")) {
    return true;
  }
  return n === "beer" || n.includes("beer") && !n.includes("keg");
}
function itemCountBy(pred) {
  return Inventory.items().filter((i) => pred(i.name, i.id)).reduce((n, i) => n + Math.max(1, i.count), 0);
}
function natureCount() {
  return itemCountBy(isNatureRune);
}
function fireCount() {
  return itemCountBy(isFireRune);
}
function coinCount() {
  return itemCountBy(isCoins);
}
function packUsed() {
  if (typeof Inventory.used === "function") {
    return Inventory.used();
  }
  return Inventory.items().length;
}
function equippedNames() {
  const names = [];
  try {
    if (typeof Equipment.items === "function") {
      for (const i of Equipment.items()) {
        if (i?.name) {
          names.push(i.name);
        }
      }
    }
  } catch {
  }
  return names;
}
function hasFireStaff() {
  if (typeof Equipment.contains === "function") {
    for (const n of FIRE_STAFF_NAMES) {
      if (Equipment.contains(n)) {
        return true;
      }
    }
  }
  return equippedNames().some((n) => isFireStaffName(n));
}
function packFireStaff() {
  return Inventory.items().find((i) => isFireStaffName(i.name)) ?? null;
}
function fireNeeded() {
  return hasFireStaff() ? 0 : SPELL.fire;
}
function canCast() {
  return Skills.level("magic") >= SPELL.level && natureCount() > 0 && fireCount() >= fireNeeded();
}
function inventorySnaps() {
  const host = welcomeHost();
  if (typeof host?.reader?.inventory === "function") {
    return host.reader.inventory() ?? [];
  }
  return Inventory.items().map((i) => i.snap ?? { slot: i.slot, id: i.id });
}
function findSpellCom() {
  const host = welcomeHost();
  const reader = host?.reader;
  const root = typeof reader?.sideTabInterface === "function" ? reader.sideTabInterface(MAGIC_TAB) : -1;
  if (root !== -1 && typeof reader?.targetButtonByBase === "function") {
    for (const name of SPELL.names) {
      const com = reader.targetButtonByBase(root, name);
      if (com !== -1) {
        return com;
      }
    }
  }
  if (root !== -1 && typeof reader?.buttonByText === "function") {
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
function keepInventoryTab() {
  const host = welcomeHost();
  const reader = host?.reader;
  const actions = host?.actions;
  try {
    if (typeof reader?.activeSideTab === "function" && reader.activeSideTab() === INV_TAB) {
      return;
    }
  } catch {
  }
  if (typeof actions?.clickSideTab === "function") {
    actions.clickSideTab(INV_TAB);
  }
}
function sendOpHeldT(itemId, slot, itemComId, spellComId) {
  const out = rawClient()?.out;
  if (!out || typeof out.p1Enc !== "function" || typeof out.p2 !== "function") {
    return false;
  }
  out.p1Enc(OPHELDT);
  out.p2(itemId);
  out.p2(slot);
  out.p2(itemComId);
  out.p2(spellComId);
  return true;
}
async function castOnInv(item) {
  const snap = item.snap ?? inventorySnaps().find((s) => s.slot === item.slot && s.id === item.id);
  if (!snap || snap.id == null || snap.slot == null) {
    return false;
  }
  const itemCom = typeof snap.comId === "number" && snap.comId >= 0 ? snap.comId : INV_COM;
  const spellCom = findSpellCom();
  if (spellCom == null || spellCom < 0) {
    return false;
  }
  if (sendOpHeldT(snap.id, snap.slot, itemCom, spellCom)) {
    keepInventoryTab();
    return true;
  }
  const host = welcomeHost();
  const actions = host?.actions;
  if (!actions || typeof actions.menuAction !== "function") {
    return false;
  }
  return !!actions.menuAction(TGT_BUTTON, 0, 0, spellCom) && !!actions.menuAction(TGT_HELD, snap.id, snap.slot, itemCom);
}
function isProtected(name, id) {
  return isNatureRune(name, id) || isCoins(name, id) || isFireRune(name, id) || isFireStaffName(name) || isDropJunk(name);
}
function isAlchTarget(item, skippedIds) {
  if (!item || !item.name) {
    return false;
  }
  if (isProtected(item.name, item.id)) {
    return false;
  }
  if (typeof item.id === "number" && skippedIds.has(item.id)) {
    return false;
  }
  return true;
}
function alchableItems(skippedIds) {
  return Inventory.items().filter((i) => isAlchTarget(i, skippedIds));
}
function alchableCount(skippedIds) {
  return alchableItems(skippedIds).reduce((n, i) => n + Math.max(1, i.count), 0);
}
function pickAlchItem(skippedIds) {
  const items = alchableItems(skippedIds);
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
  })[0] ?? null;
}
function unnotedId(id) {
  const t = objType(id);
  if (!t) {
    return id;
  }
  const tmpl = t.certtemplate ?? t.certTemplate;
  const link = t.certlink ?? t.certLink;
  if (typeof tmpl === "number" && tmpl >= 0 && tmpl !== id && typeof link === "number" && link >= 0) {
    return link;
  }
  return id;
}
function shopCost(id) {
  const t = objType(unnotedId(id));
  if (!t) {
    return 0;
  }
  for (const key of ["cost", "value", "costgp"]) {
    const v = t[key];
    if (typeof v === "number" && v > 0) {
      return v;
    }
  }
  return 0;
}
function highAlchGp(id) {
  if (typeof id !== "number") {
    return 0;
  }
  const cost = shopCost(id);
  if (cost <= 0) {
    return 0;
  }
  return Math.floor(cost * 0.6);
}
function locName(loc) {
  if (!loc) {
    return "";
  }
  if (typeof loc.name === "function") {
    return loc.name() ?? "";
  }
  return loc.name ?? "";
}
function locTile(loc) {
  if (!loc) {
    return null;
  }
  const t = typeof loc.tile === "function" ? loc.tile() : loc.tile;
  return t ?? null;
}
function locActions(loc) {
  if (!loc) {
    return [];
  }
  try {
    const acts = typeof loc.actions === "function" ? loc.actions() : loc.actions;
    return Array.isArray(acts) ? acts : [];
  } catch {
    return [];
  }
}
function locDistance(loc) {
  if (!loc) {
    return 9999;
  }
  if (typeof loc.distance === "function") {
    try {
      const d = loc.distance();
      if (typeof d === "number" && Number.isFinite(d)) {
        return d;
      }
    } catch {
    }
  }
  const t = locTile(loc);
  const here = Game.tile();
  if (!t || !here) {
    return 9999;
  }
  return Math.max(Math.abs((t.x ?? 0) - here.x), Math.abs((t.z ?? 0) - here.z));
}
function parseCourse(raw) {
  return String(raw ?? DEFAULT_OBSTACLES).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}
function atGnomeCourse(here, radius = GNOME_COURSE_RADIUS) {
  if (!here) {
    return false;
  }
  return Math.max(Math.abs(here.x - GNOME_COURSE_START.x), Math.abs(here.z - GNOME_COURSE_START.z)) <= radius;
}
function isAnimating() {
  try {
    return typeof Game.animating === "function" && !!Game.animating();
  } catch {
    return false;
  }
}
function cheb(ax, az, bx, bz) {
  return Math.max(Math.abs((ax ?? 0) - (bx ?? 0)), Math.abs((az ?? 0) - (bz ?? 0)));
}
function nearXZ(x, z, maxCheb) {
  const here = Game.tile();
  if (!here) {
    return false;
  }
  return cheb(here.x, here.z, x, z) <= maxCheb;
}
function tilePlane(t) {
  if (!t) {
    return 0;
  }
  if (typeof t.level === "number") {
    return t.level;
  }
  return 0;
}
function locPinDistance(loc, pin) {
  const t = locTile(loc);
  if (!t || !pin) {
    return 9999;
  }
  return cheb(t.x, t.z, pin.locX, pin.locZ);
}
function findObstacle(name, radius, pin) {
  const want = String(name ?? "").toLowerCase();
  const query = Locs?.query;
  if (!want || typeof query !== "function") {
    return null;
  }
  const pred = (l) => {
    if (locName(l).toLowerCase() !== want || locActions(l).length === 0) {
      return false;
    }
    if (pin) {
      return locPinDistance(l, pin) <= PIN_MATCH;
    }
    return locDistance(l) <= radius;
  };
  const q = query().where(pred);
  if (pin && typeof q.results === "function") {
    const list = q.results() ?? [];
    let best = null;
    let bestD = 99;
    for (const l of list) {
      const d = locPinDistance(l, pin);
      if (d < bestD) {
        best = l;
        bestD = d;
      }
    }
    return best;
  }
  return q.nearest() ?? null;
}
class Alchgility extends LoopingBotBase {
  status = "starting";
  startedAt = 0;
  magicXpAtStart = 0;
  agilityXpAtStart = 0;
  casts = 0;
  gpAlched = 0;
  laps = 0;
  obstaclesCleared = 0;
  step = 0;
  course = [];
  radius = GNOME_COURSE_RADIUS;
  failStreak = 0;
  itemFailStreak = 0;
  lastFailId = -1;
  skippedIds = /* @__PURE__ */ new Set();
  currentName = "";
  stuck = 0;
  magicWarned = false;
  pendingAlch = null;
  alchsPerObstacle = DEFAULT_ALCHS_PER_OBSTACLE;
  waitingForObstacle = false;
  obstacleXpBefore = null;
  walkBlockedKey = "";
  walkBlockedUntil = 0;
  async onStart() {
    await Execution.delayUntil(() => Game.ingame() && Game.tile() !== null, 0);
    if (typeof Traversal?.preload === "function") {
      Traversal.preload();
    }
    this.startedAt = Date.now();
    this.magicXpAtStart = Skills.xp("magic");
    this.agilityXpAtStart = Skills.xp("agility");
    this.casts = 0;
    this.gpAlched = 0;
    this.laps = 0;
    this.obstaclesCleared = 0;
    this.step = 0;
    this.failStreak = 0;
    this.itemFailStreak = 0;
    this.lastFailId = -1;
    this.skippedIds = /* @__PURE__ */ new Set();
    this.currentName = "";
    this.stuck = 0;
    this.magicWarned = false;
    this.pendingAlch = null;
    this.alchsPerObstacle = DEFAULT_ALCHS_PER_OBSTACLE;
    this.waitingForObstacle = false;
    this.obstacleXpBefore = null;
    this.walkBlockedKey = "";
    this.walkBlockedUntil = 0;
    this.syncSettings();
    const magic = Skills.level("magic");
    this.log(
      `Benzyme's Alchgility, Gnome agility + High Level Alchemy (Magic ${magic}, need ${SPELL.level}, Agility ${Skills.level("agility")})`
    );
    this.log(`course: [${this.course.join(" -> ")}] within ${this.radius} tiles`);
    this.log(`alchs ${this.alchsPerObstacle} times (wait 5-tick animation between casts), then clicks the next obstacle`);
    this.log("each gnome step uses a pinned tile so the two nets and two branches are not swapped");
    this.log("alchs the pack except Nature runes, Fire runes, coins, and a fire staff");
    this.log("High Alch via OPHELDT packet so the inventory tab stays open");
    this.log("drops beer, kebabs, caskets, and strange fruit");
    keepInventoryTab();
    if (magic < SPELL.level) {
      this.magicWarned = true;
      this.log(`Magic ${magic} < ${SPELL.level}, running the course without alchemy`);
    }
    this.status = "ready";
  }
  onStop() {
    const snap = this.sessionSnapshot();
    this.log(
      `stopped, ${this.laps} laps, ${this.casts} high alchs, ${fmtXph(this.gpAlched)}gp, +${fmtXph(snap.magicXp)} magic xp, +${fmtXph(snap.agilityXp)} agility xp (${this.status})`
    );
  }
  sessionSnapshot() {
    const runtimeMs = this.startedAt ? Date.now() - this.startedAt : 0;
    const hrs = runtimeMs / 36e5;
    const magicXp = Math.max(0, Skills.xp("magic") - this.magicXpAtStart);
    const agilityXp = Math.max(0, Skills.xp("agility") - this.agilityXpAtStart);
    const perHour = (n) => hrs > 5e-4 ? n / hrs : 0;
    return {
      runtimeMs,
      magicXp,
      agilityXp,
      alchs: this.casts,
      gp: this.gpAlched,
      laps: this.laps,
      obstacles: this.obstaclesCleared,
      alchsPerHour: perHour(this.casts),
      gpPerHour: perHour(this.gpAlched),
      magicXpPerHour: perHour(magicXp),
      agilityXpPerHour: perHour(agilityXp)
    };
  }
  syncSettings() {
    const s = this.settings;
    this.course = parseCourse(s?.str?.("obstacles", DEFAULT_OBSTACLES));
    const r = s?.num?.("searchRadius", GNOME_COURSE_RADIUS);
    this.radius = typeof r === "number" && r > 0 ? r : GNOME_COURSE_RADIUS;
    if (!this.course.length) {
      this.course = parseCourse(DEFAULT_OBSTACLES);
    }
    const n = typeof s?.num === "function" ? s.num("alchsPerObstacle", DEFAULT_ALCHS_PER_OBSTACLE) : DEFAULT_ALCHS_PER_OBSTACLE;
    this.alchsPerObstacle = Number.isFinite(n) ? Math.max(0, Math.min(8, Math.floor(n))) : DEFAULT_ALCHS_PER_OBSTACLE;
  }
  currentObstacleName() {
    return this.course[this.step] ?? null;
  }
  currentPin() {
    const name = this.currentObstacleName();
    const pin = GNOME_STEPS[this.step];
    if (pin && pin.name === name) {
      return pin;
    }
    return null;
  }
  nearPinStand(pin, maxCheb) {
    return !!(pin && nearXZ(pin.standX, pin.standZ, maxCheb));
  }
  shouldWalkToPin(pin) {
    if (!pin?.walk) {
      return false;
    }
    if (tilePlane(Game.tile()) > 0) {
      return false;
    }
    if (this.nearPinStand(pin, 4)) {
      return false;
    }
    const key = `${pin.standX},${pin.standZ}`;
    if (this.walkBlockedKey === key && Date.now() < this.walkBlockedUntil) {
      return false;
    }
    const loc = findObstacle(this.currentObstacleName(), this.radius, pin);
    if (loc && locDistance(loc) <= 8) {
      return false;
    }
    return true;
  }
  markWalkBlocked(pin) {
    this.walkBlockedKey = `${pin.standX},${pin.standZ}`;
    this.walkBlockedUntil = Date.now() + 6e4;
    this.log(
      `${pin.name} approach ${pin.standX},${pin.standZ} is not walkable from here, clicking the obstacle instead`
    );
  }
  async walkToPin(pin) {
    if (!pin) {
      return false;
    }
    const dest = new Tile(pin.standX, pin.standZ, 0);
    this.status = `walking to ${pin.name} at ${pin.standX},${pin.standZ}`;
    this.log(`walking to ${pin.name} approach ${pin.standX},${pin.standZ}`);
    const opts = {
      radius: 1,
      attempts: 2,
      timeoutMs: 12e3,
      useTeleports: false,
      log: (m) => this.log(`  ${m}`)
    };
    if (typeof Traversal?.walkResilient === "function") {
      await Traversal.walkResilient(dest, opts);
    } else if (typeof Traversal?.walkTo === "function") {
      await Traversal.walkTo(dest, opts);
    }
    if (this.nearPinStand(pin, 4)) {
      this.walkBlockedKey = "";
      this.walkBlockedUntil = 0;
      return true;
    }
    this.markWalkBlocked(pin);
    return false;
  }
  async settleAfterObstacle() {
    if (ChatDialog.canContinue()) {
      return;
    }
    if (isAnimating()) {
      this.status = `crossing ${this.currentObstacleName()}`;
      await Execution.delayUntil(() => !isAnimating() || ChatDialog.canContinue(), 8e3);
    }
    await Execution.delayTicks(1);
  }
  advance() {
    this.step++;
    if (this.step >= this.course.length) {
      this.step = 0;
      this.laps++;
      this.log(`lap ${this.laps} complete`);
    }
  }
  resyncTo(name) {
    const want = String(name ?? "").toLowerCase();
    let best = -1;
    let bestForward = 99;
    for (let i = 0; i < this.course.length; i++) {
      if (this.course[i] !== want) {
        continue;
      }
      const forward = i >= this.step ? i - this.step : i + this.course.length - this.step;
      if (best === -1 || forward < bestForward) {
        best = i;
        bestForward = forward;
      }
    }
    if (best === -1 || best === this.step) {
      return false;
    }
    this.log(`course re-sync: step ${this.step} (${this.currentObstacleName()}) -> ${best} (${want})`);
    this.step = best;
    return true;
  }
  canAlchNow() {
    return !this.pendingAlch && !this.waitingForObstacle && !isAnimating() && canCast() && !!pickAlchItem(this.skippedIds);
  }
  async dropJunk() {
    let dropped = false;
    for (let guard = 0; guard < 8; guard++) {
      const item = Inventory.items().find((i) => isDropJunk(i.name)) ?? null;
      if (!item) {
        break;
      }
      const name = item.name ?? "junk";
      this.status = `dropping ${name}`;
      this.log(`dropping ${name}`);
      const before = packUsed();
      if (typeof item.interact === "function") {
        await item.interact("Drop");
      }
      await Execution.delayUntil(() => packUsed() < before, 4e3);
      dropped = true;
    }
    return dropped;
  }
  async maybeWieldFireStaff() {
    if (hasFireStaff() || fireCount() >= SPELL.fire) {
      return false;
    }
    const staff = packFireStaff();
    if (!staff) {
      return false;
    }
    this.status = `wield ${staff.name}`;
    this.log(`wielding ${staff.name} for fire runes`);
    if (typeof Equipment.equip === "function") {
      await Equipment.equip(staff.name ?? "");
      await Execution.delayTicks(1);
    }
    return true;
  }
  async walkToCourse() {
    const here = Game.tile();
    this.status = "walking to gnome agility";
    this.log(
      `web-walking to the course start ${GNOME_COURSE_START.x},${GNOME_COURSE_START.z} from ${here?.x ?? "?"},${here?.z ?? "?"}`
    );
    const opts = {
      radius: 2,
      attempts: 6,
      timeoutMs: 24e4,
      useTeleports: false,
      log: (m) => this.log(`  ${m}`)
    };
    if (typeof Traversal?.walkResilient === "function") {
      await Traversal.walkResilient(GNOME_COURSE_START, opts);
      return;
    }
    if (typeof Traversal?.walkTo === "function") {
      await Traversal.walkTo(GNOME_COURSE_START, opts);
    }
  }
  alchHasLanded(beforeCount, beforeXp) {
    return Skills.xp("magic") > beforeXp || alchableCount(this.skippedIds) < beforeCount;
  }
  pendingHasLanded() {
    const p = this.pendingAlch;
    if (!p) {
      return false;
    }
    return this.alchHasLanded(p.beforeCount, p.beforeXp);
  }
  recordAlch(item, coinsBefore) {
    this.casts++;
    this.failStreak = 0;
    this.itemFailStreak = 0;
    this.lastFailId = -1;
    const gained = coinCount() - coinsBefore;
    this.gpAlched += gained > 0 ? gained : highAlchGp(item?.id);
  }
  creditPendingIfLanded() {
    if (!this.pendingAlch || !this.pendingHasLanded()) {
      return false;
    }
    this.recordAlch(this.pendingAlch.item, this.pendingAlch.coinsBefore);
    this.pendingAlch = null;
    return true;
  }
  async startAlch() {
    if (!this.canAlchNow()) {
      return false;
    }
    const item = pickAlchItem(this.skippedIds);
    if (!item) {
      return false;
    }
    const beforeCount = alchableCount(this.skippedIds);
    const beforeXp = Skills.xp("magic");
    const coinsBefore = coinCount();
    this.currentName = item.name || "item";
    this.status = `High alch ${this.currentName}`;
    this.log(
      `${SPELL.label} -> ${this.currentName}` + (typeof item.id === "number" ? ` (id ${item.id})` : "") + ` x${beforeCount}`
    );
    const dispatched = await castOnInv(item);
    this.pendingAlch = {
      item,
      beforeCount,
      beforeXp,
      coinsBefore,
      at: Date.now()
    };
    if (!dispatched) {
      this.noteFail(item);
      this.log(`cast failed (spell com / inv target?) streak ${this.failStreak}`);
      this.pendingAlch = null;
      await Execution.delayTicks(1);
      return false;
    }
    return true;
  }
  noteFail(item) {
    this.failStreak++;
    if (typeof item?.id === "number" && item.id === this.lastFailId) {
      this.itemFailStreak++;
    } else {
      this.lastFailId = typeof item?.id === "number" ? item.id : -1;
      this.itemFailStreak = 1;
    }
    if (this.itemFailStreak >= 3 && this.lastFailId >= 0) {
      this.skippedIds.add(this.lastFailId);
      this.log(`skipping ${item?.name ?? "item"} (id ${this.lastFailId}), alch would not take it`);
      this.itemFailStreak = 0;
      this.lastFailId = -1;
      this.failStreak = Math.max(0, this.failStreak - 3);
    }
  }
  async waitAlchAnimation(startedAt) {
    const readyAt = startedAt + ALCH_TICK_MS;
    const remain = readyAt - Date.now();
    if (remain > 50) {
      await Execution.delayUntil(
        () => ChatDialog.canContinue() || Date.now() >= readyAt && !isAnimating(),
        remain + 800
      );
    }
    if (isAnimating()) {
      this.status = "waiting alch animation";
      await Execution.delayUntil(() => !isAnimating() || ChatDialog.canContinue(), 3e3);
    }
    await Execution.delayTicks(1);
  }
  async settlePendingAlch() {
    if (!this.pendingAlch) {
      return;
    }
    const started = this.pendingAlch.at;
    await this.waitAlchAnimation(started);
    if (this.creditPendingIfLanded() || ChatDialog.canContinue()) {
      return;
    }
    await Execution.delayUntil(
      () => this.pendingHasLanded() || ChatDialog.canContinue(),
      1200
    );
    if (this.creditPendingIfLanded() || !this.pendingAlch || ChatDialog.canContinue()) {
      return;
    }
    if (!isAnimating()) {
      this.noteFail(this.pendingAlch.item);
      this.log(`alch did not consume an item, streak ${this.failStreak}`);
      this.pendingAlch = null;
    }
  }
  async clickCurrentObstacle(obstacle) {
    const op = locActions(obstacle)[0];
    if (!op) {
      return false;
    }
    const t = locTile(obstacle);
    this.status = `${op} ${locName(obstacle)}${t ? ` at ${t.x},${t.z}` : ""}`;
    const clicked = await obstacle.interact(op);
    return clicked !== false;
  }
  async finishObstacle() {
    const pin = this.currentPin();
    if (this.shouldWalkToPin(pin)) {
      await this.walkToPin(pin);
    }
    let obstacle = findObstacle(this.currentObstacleName(), this.radius, pin);
    if (!obstacle && !pin) {
      for (const name of new Set(this.course)) {
        if (findObstacle(name, this.radius) && this.resyncTo(name)) {
          obstacle = findObstacle(name, this.radius);
          break;
        }
      }
    }
    if (!obstacle) {
      if (this.shouldWalkToPin(pin)) {
        await this.walkToPin(pin);
        return;
      }
      this.status = `waiting: no ${this.currentObstacleName()}` + (pin ? ` at ${pin.locX},${pin.locZ}` : ` within ${this.radius} tiles`);
      await Execution.delayTicks(2);
      return;
    }
    if (this.obstacleXpBefore == null) {
      this.obstacleXpBefore = Skills.xp("agility");
      await this.clickCurrentObstacle(obstacle);
    }
    const xpBefore = this.obstacleXpBefore ?? Skills.xp("agility");
    const gotAgil = () => Skills.xp("agility") > xpBefore;
    if (!gotAgil() && !ChatDialog.canContinue()) {
      await Execution.delayUntil(() => gotAgil() || ChatDialog.canContinue(), OBSTACLE_XP_MS);
    }
    if (ChatDialog.canContinue()) {
      this.status = "continue dialog";
      return;
    }
    if (gotAgil()) {
      await this.settleAfterObstacle();
      if (ChatDialog.canContinue()) {
        this.status = "continue dialog";
        return;
      }
      this.waitingForObstacle = false;
      this.obstacleXpBefore = null;
      this.stuck = 0;
      this.obstaclesCleared++;
      this.advance();
      return;
    }
    if (isAnimating()) {
      this.status = `crossing ${this.currentObstacleName()}`;
      return;
    }
    this.obstacleXpBefore = null;
    this.stuck++;
    if (this.stuck >= 8) {
      this.log(`step '${this.currentObstacleName()}' gave no xp after ${this.stuck} clicks, skipping`);
      this.stuck = 0;
      this.waitingForObstacle = false;
      this.advance();
    }
  }
  async doObstacleAndAlch() {
    if (this.pendingAlch) {
      await this.settlePendingAlch();
      if (ChatDialog.canContinue()) {
        this.status = "continue dialog";
        return;
      }
    }
    if (this.waitingForObstacle) {
      await this.finishObstacle();
      return;
    }
    const pin = this.currentPin();
    if (this.shouldWalkToPin(pin)) {
      await this.walkToPin(pin);
    }
    keepInventoryTab();
    for (let n = 0; n < this.alchsPerObstacle && this.canAlchNow(); n++) {
      if (isAnimating()) {
        await this.waitAlchAnimation(Date.now() - ALCH_TICK_MS);
      }
      if (!await this.startAlch()) {
        break;
      }
      await this.settlePendingAlch();
      if (ChatDialog.canContinue()) {
        this.status = "continue dialog";
        return;
      }
    }
    if (isAnimating()) {
      await this.waitAlchAnimation(Date.now() - ALCH_TICK_MS);
    }
    this.waitingForObstacle = true;
    this.obstacleXpBefore = null;
    await this.finishObstacle();
  }
  async loop() {
    if (!Game.ingame()) {
      await Execution.delayTicks(5);
      return;
    }
    if (await dismissWelcomeScreen()) {
      this.status = "close welcome";
      return;
    }
    this.syncSettings();
    if (ChatDialog.canContinue()) {
      this.status = "continue dialog";
      await ChatDialog.continue();
      return;
    }
    if (typeof Bank.isOpen === "function" && Bank.isOpen()) {
      this.status = "closing bank";
      await Bank.close();
      await Execution.delayTicks(1);
      return;
    }
    if (await this.dropJunk()) {
      return;
    }
    if (await this.maybeWieldFireStaff()) {
      return;
    }
    if (!this.magicWarned && Skills.level("magic") < SPELL.level) {
      this.magicWarned = true;
      this.log(`Magic ${Skills.level("magic")} < ${SPELL.level}, running the course without alchemy`);
    }
    const here = Game.tile();
    if (!atGnomeCourse(here, this.radius)) {
      await this.walkToCourse();
      return;
    }
    await this.doObstacleAndAlch();
  }
  onPaint(ctx) {
    const snap = this.sessionSnapshot();
    const elapsed = snap.runtimeMs;
    const magicXp = snap.magicXp;
    const agilXp = snap.agilityXp;
    const magicXph = snap.magicXpPerHour;
    const agilXph = snap.agilityXpPerHour;
    const cph = snap.alchsPerHour;
    const gph = snap.gpPerHour;
    const left = alchableCount(this.skippedIds);
    const lines = [
      "Benzyme's Alchgility",
      `time ${fmtElapsed(elapsed)} \xB7 ${this.status}`,
      `High Level Alchemy \xB7 Magic ${Skills.level("magic")} \xB7 Agility ${Skills.level("agility")}`,
      `alch ${this.currentName || "none"} \xB7 left ${left} \xB7 pack ${packUsed()}/28`,
      `alchs ${this.casts} \xB7 ${fmtXph(cph)}/hr`,
      `gp alched ${fmtXph(this.gpAlched)} \xB7 ${fmtXph(gph)}/hr`,
      `magic: ${fmtXph(magicXph)} xp/hr  (+${Math.round(magicXp)} xp)`,
      `agility: ${fmtXph(agilXph)} xp/hr  (+${Math.round(agilXp)} xp)`,
      `Nature ${natureCount()} \xB7 Fire ${hasFireStaff() ? "staff" : fireCount()}`,
      `laps ${this.laps} \xB7 obstacles ${this.obstaclesCleared} \xB7 ${this.currentObstacleName() ?? "none"}`
    ];
    ctx.save();
    ctx.font = "13px sans-serif";
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    const x = 8;
    const y0 = 8;
    const lineH = 16;
    const iconSize = 16;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#000";
    lines.forEach((line, i) => {
      const y = y0 + i * lineH;
      ctx.strokeText(line, x, y);
      ctx.fillStyle = i === 0 ? TITLE_BROWN : "#ffffff";
      ctx.fillText(line, x, y);
      if (i === 0 && natureRuneIcon && natureRuneIcon.complete && natureRuneIcon.naturalWidth > 0) {
        const iconX = x + ctx.measureText(line).width + 4;
        const iconY = y + (lineH - iconSize) / 2;
        ctx.drawImage(natureRuneIcon, iconX, iconY, iconSize, iconSize);
      }
    });
    ctx.restore();
  }
}
var Alchgility_default = defineBot({
  name: SCRIPT_NAME,
  version: SCRIPT_VERSION,
  category: "Agility",
  tags: ["agility", "gnome", "alchemy", "high alchemy", "alch", "inventory"],
  description: "WARNING: High Alchs the whole inventory while running the Gnome Stronghold agility course. Leaves Nature runes, Fire runes, coins, and a fire staff alone. Needs Magic 55.",
  settingsSchema: {
    obstacles: {
      type: "string",
      default: DEFAULT_OBSTACLES,
      label: "Obstacles (lap order)",
      help: "Comma-separated obstacle loc names in lap order. The default gnome course pins each step to a tile so the two nets are not swapped. Advances when agility xp is awarded."
    },
    searchRadius: {
      type: "number",
      default: 20,
      min: 4,
      max: 64,
      label: "Obstacle search radius (tiles)",
      help: "How far to look for the next gnome-course obstacle."
    },
    alchsPerObstacle: {
      type: "number",
      default: 3,
      min: 0,
      max: 8,
      label: "High alchs before each obstacle",
      help: "How many High Level Alchemy casts to fire before the next gnome obstacle is clicked. Each cast waits out the 5-tick animation. 3 is the default. 0 skips alchemy and only runs the course."
    }
  },
  create: () => new Alchgility()
});
export {
  Alchgility_default as default
};
