/**
 * CatherbySwordfish. Harpoons tuna and swordfish at Catherby.
 *
 * Load URL: https://cdn.jsdelivr.net/gh/Benzymee/RS2B2TScripts@main/CatherbySwordfish.js
 */
const SUPPORTED_API_VERSION = 1;
const abi = globalThis.__rs2b0t;
if (!abi) {
  throw new Error("CatherbySwordfish: globalThis.__rs2b0t missing \u2014 load inside rs2b0t bot.html");
}
if (abi.apiVersion !== SUPPORTED_API_VERSION) {
  throw new Error(
    `CatherbySwordfish: ABI ${abi.apiVersion} != supported ${SUPPORTED_API_VERSION}`
  );
}
const {
  defineBot,
  Execution,
  Game,
  LoopingBot: LoopingBotBase,
  Npcs,
  Locs,
  GroundItems,
  Inventory,
  Bank,
  Banking,
  Shop,
  Traversal,
  Tile,
  Skills,
  ChatDialog,
  Players,
  Trade,
  withdrawOp
} = abi;
const SCRIPT_NAME = "CatherbySwordfish";
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
  const main = typeof reader.modals === "function" ? reader.modals?.().main ?? -1 : -1;
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
const ANCHOR = new Tile(2845, 3431, 0);
const LEASH = 35;
const STAND_RADIUS = 8;
const WEST_BEACH = new Tile(2838, 3431, 0);
const MID_BEACH = new Tile(2845, 3431, 0);
const EAST_APPROACH = new Tile(2856, 3429, 0);
const EAST_SAND = new Tile(2857, 3428, 0);
const BEACH_SCAN = [WEST_BEACH, MID_BEACH, EAST_APPROACH, EAST_SAND];
const BEACH_WESTWARD = [EAST_SAND, EAST_APPROACH, MID_BEACH, WEST_BEACH];
const BEACH_EASTWARD = [MID_BEACH, EAST_APPROACH, EAST_SAND];
const SPOT_MIN_X = 2834;
const SPOT_MAX_X = 2860;
const SPOT_MIN_Z = 3425;
const SPOT_MAX_Z = 3435;
const UNREACHABLE_MS = 45e3;
const CANT_REACH_RE = /i can't reach that/i;
function isEastRocksHop(tile) {
  if (!tile) {
    return false;
  }
  const t = Tile.from(tile);
  return (t.level ?? 0) === 0 && t.x >= 2853 && t.x <= 2855 && t.z <= 3424;
}
function onEastRocks(tile = Game.tile()) {
  return !!(tile && (tile.level ?? 0) === 0 && tile.x >= 2853 && tile.x <= 2858 && tile.z <= 3424);
}
function onCape(tile = Game.tile()) {
  return !!(tile && (tile.level ?? 0) === 0 && tile.x >= 2856 && tile.x <= 2860);
}
function pastCapeTip(tile = Game.tile()) {
  return !!(tile && (tile.level ?? 0) === 0 && tile.x >= 2861);
}
function leavingEastBeach(tile = Game.tile()) {
  return onCape(tile) || onEastRocks(tile) || pastCapeTip(tile);
}
function tileKey(tile) {
  if (!tile) {
    return "";
  }
  return `${tile.x},${tile.z},${tile.level ?? 0}`;
}
function npcList(q) {
  if (q && typeof q.results === "function") {
    return q.results();
  }
  const n = q && typeof q.nearest === "function" ? q.nearest() : null;
  return n ? [n] : [];
}
const BANK_STAND = new Tile(2809, 3441, 0);
const MULE_NAME = "eoc";
const MULE_TRADE_RANGE = 2;
const BANK_MULE_LEASH = 8;
const MULE_THRESHOLD = 1e3;
const MULE_TRADE_REQUEST_MS = 5e3;
const MULE_ACCEPT_WAIT_MIN_MS = 5e3;
const MULE_ACCEPT_WAIT_MAX_MS = 1e4;
const MULE_ACCEPT_RETRY_MS = 3e3;
const MULE_FISH_NAMES = ["Swordfish", "Raw swordfish", "Tuna", "Raw tuna"];
function muleAcceptDelayMs() {
  return MULE_ACCEPT_WAIT_MIN_MS + Math.floor(Math.random() * (MULE_ACCEPT_WAIT_MAX_MS - MULE_ACCEPT_WAIT_MIN_MS + 1));
}
const HARRY_STAND = new Tile(2833, 3443, 0);
const HARRY_NAME = "Harry";
const RANGE_STAND = new Tile(2817, 3443, 0);
const RANGE_LOC = new Tile(2817, 3444, 0);
const RANGE_LEASH = 8;
const HARPOON_NAME = "Harpoon";
const SPOT_NAME = "Fishing spot";
const HARPOON_COST = 5;
const HARRY_BUY_RAW = /* @__PURE__ */ new Set(["raw tuna", "raw swordfish"]);
function fmtXph(n) {
  if (n >= 1e5) {
    return `${(n / 1e3).toFixed(0)}k`;
  }
  if (n >= 1e4) {
    return `${(n / 1e3).toFixed(1)}k`;
  }
  return String(Math.round(n));
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
function prefStorageKey(key) {
  const box = typeof location !== "undefined" ? new URLSearchParams(location.search).get("box") : null;
  const suffix = `set:${SCRIPT_NAME}:${key}`;
  return box ? `rs2b0t:${box}:${suffix}` : `rs2b0t:${suffix}`;
}
function readPrefRaw(key) {
  const k = prefStorageKey(key);
  try {
    if (typeof sessionStorage !== "undefined") {
      const v = sessionStorage.getItem(k);
      if (v !== null) {
        return v;
      }
    }
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(k);
    }
  } catch {
  }
  return null;
}
function readPrefBool(key, fallback) {
  const raw = readPrefRaw(key);
  if (raw === null) {
    return fallback;
  }
  const n = raw.trim().toLowerCase();
  return n === "true" || n === "1" || n === "yes";
}
function isPanelPaused() {
  return !!document.querySelector(".rs2b0t-value.rs2b0t-state-paused");
}
function unlockPausedPrefsUi() {
  if (!isPanelPaused()) {
    return;
  }
  for (const btn of document.querySelectorAll("button.rs2b0t-param-edit")) {
    if ((btn.textContent || "").includes("Edit parameters")) {
      btn.disabled = false;
      btn.title = "Editable while paused \u2014 applies on the next loop / Resume";
    }
  }
  for (const backdrop of document.querySelectorAll(".rs2b0t-modal-backdrop")) {
    if (backdrop.style.display !== "flex") {
      continue;
    }
    for (const el of backdrop.querySelectorAll("input, select, textarea")) {
      el.disabled = false;
    }
  }
}
const PAINT_FONT_ID = "benzyme-catherby-swordfish-font-v1";
const PAINT_FONT = '13px Exo, "Bebas Neue", "Bitcount Ink", sans-serif';
function ensurePaintFont() {
  if (typeof document === "undefined") {
    return;
  }
  if (document.getElementById(PAINT_FONT_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = PAINT_FONT_ID;
  style.textContent = "@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Bitcount+Ink:wght@100..900&family=Exo:ital,wght@0,100..900;1,100..900&display=swap');";
  document.head.appendChild(style);
}
function isKeepGear(name) {
  if (!name) {
    return false;
  }
  return name.toLowerCase() === "harpoon";
}
function isRawHarpoonFish(name) {
  if (!name) {
    return false;
  }
  const n = name.toLowerCase();
  if (!n.startsWith("raw ")) {
    return false;
  }
  return n.includes("tuna") || n.includes("swordfish");
}
function isCookedHarpoonFish(name) {
  if (!name) {
    return false;
  }
  const n = name.toLowerCase().trim();
  if (n.startsWith("raw ") || n.startsWith("burnt ")) {
    return false;
  }
  return n === "tuna" || n === "swordfish";
}
function isBurntFish(name) {
  if (!name) {
    return false;
  }
  const n = name.toLowerCase();
  return n.startsWith("burnt ") || n === "burnt fish" || n === "burnt tuna" || n === "burnt swordfish";
}
function isHarrySellable(name) {
  if (!name) {
    return false;
  }
  return HARRY_BUY_RAW.has(name.toLowerCase());
}
const COOK_LEVEL = {
  tuna: 30,
  swordfish: 45
};
function fishKind(name) {
  const n = (name ?? "").toLowerCase();
  if (n.includes("swordfish")) {
    return "swordfish";
  }
  if (n.includes("tuna")) {
    return "tuna";
  }
  return null;
}
function rawFishKind(name) {
  const n = (name ?? "").toLowerCase();
  if (!n.startsWith("raw ")) {
    return null;
  }
  return fishKind(n);
}
function canCookRaw(name) {
  const kind = rawFishKind(name);
  if (!kind) {
    return false;
  }
  return Skills.level("cooking") >= COOK_LEVEL[kind];
}
function countMatching(pred) {
  return Inventory.items().filter((i) => pred(i.name)).reduce((n, i) => n + Math.max(1, i.count), 0);
}
function rawFishCount() {
  return countMatching(isRawHarpoonFish);
}
function cookableCount() {
  return countMatching((n) => isRawHarpoonFish(n) && canCookRaw(n));
}
function cookedFishCount() {
  return countMatching(isCookedHarpoonFish);
}
function burntCount() {
  return countMatching(isBurntFish);
}
function harrySellCount() {
  return countMatching(isHarrySellable);
}
function fishForDisposeCount() {
  return rawFishCount() + cookedFishCount() + burntCount();
}
function lastCookableRaw() {
  const items = Inventory.items();
  for (let i = items.length - 1; i >= 0; i--) {
    const name = items[i].name;
    if (isRawHarpoonFish(name) && canCookRaw(name)) {
      return items[i];
    }
  }
  return null;
}
function countCookableNamed(fragment) {
  const want = fragment.toLowerCase();
  return countMatching(
    (n) => isRawHarpoonFish(n) && canCookRaw(n) && (n ?? "").toLowerCase().includes(want)
  );
}
function matchCookProduct(products, preferName) {
  if (!products || products.length === 0) {
    return null;
  }
  const prefer = (preferName ?? "").toLowerCase();
  if (prefer) {
    const hit = products.find((p) => (p ?? "").toLowerCase() === prefer);
    if (hit) {
      return hit;
    }
    const soft = products.find(
      (p) => (p ?? "").toLowerCase().includes(prefer.replace(/^raw\s+/, ""))
    );
    if (soft) {
      return soft;
    }
  }
  for (const frag of ["swordfish", "tuna"]) {
    if (countCookableNamed(frag) <= 0) {
      continue;
    }
    const hit = products.find((p) => (p ?? "").toLowerCase().includes(frag));
    if (hit) {
      return hit;
    }
  }
  return products[0] ?? null;
}
function hasHarpoon() {
  return Inventory.items().some((i) => (i.name ?? "").toLowerCase() === "harpoon");
}
function needsGear() {
  return !hasHarpoon();
}
function isCoins(name) {
  return (name ?? "").toLowerCase() === "coins";
}
function coinCount() {
  return countMatching(isCoins);
}
function cageOp(actions) {
  return actions.find((a) => /^cage$/i.test(a)) ?? null;
}
function harpoonOp(actions) {
  return actions.find((a) => /^harpoon$/i.test(a)) ?? null;
}
function isCageHarpoonSpot(actions) {
  return cageOp(actions) !== null && harpoonOp(actions) !== null;
}
function isShutDoor(loc) {
  const name = (loc.name ?? "").toLowerCase();
  if (!name.includes("door") && !name.includes("gate")) {
    return false;
  }
  return loc.actions().some((a) => /^open/i.test(a));
}
function openDoorOp(loc) {
  return loc.actions().find((a) => /^open/i.test(a)) ?? null;
}
function isHarpoonGroundName(name) {
  if (!name) {
    return false;
  }
  return name.toLowerCase() === "harpoon";
}
function harrySellNamesHeld() {
  const names = [];
  const seen = /* @__PURE__ */ new Set();
  for (const item of Inventory.items()) {
    const name = item.name;
    if (!name || !isHarrySellable(name)) {
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    names.push(name);
  }
  return names;
}
function countByExactName(name) {
  const want = (name ?? "").toLowerCase();
  return countMatching((n) => (n ?? "").toLowerCase() === want);
}
function isMuleFish(name) {
  return isRawHarpoonFish(name) || isCookedHarpoonFish(name);
}
function certIsNote(id) {
  try {
    const OT = globalThis.ObjType ?? globalThis.__rs2b0t?.ObjType ?? globalThis.__client?.ObjType ?? null;
    if (!OT || typeof OT.list !== "function") {
      return null;
    }
    const t = OT.list(id);
    if (!t) {
      return null;
    }
    return typeof t.certtemplate === "number" && t.certtemplate !== -1;
  } catch {
    return null;
  }
}
function isNotedMuleFishItem(item) {
  if (!item || !isMuleFish(item.name)) {
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
function isUnnotedMuleFishItem(item) {
  return !!item && isMuleFish(item.name) && !isNotedMuleFishItem(item);
}
function isUnnotedMuleFishDeposit(name, id) {
  if (!isMuleFish(name)) {
    return false;
  }
  const cert = certIsNote(id);
  if (cert === true) {
    return false;
  }
  if (cert === false) {
    return true;
  }
  const inv = Inventory.items().filter((i) => i.id === id && isMuleFish(i.name));
  if (inv.some((i) => Math.max(1, i.count) > 1)) {
    return false;
  }
  return inv.length > 0;
}
function unnotedMuleFishCount() {
  return Inventory.items().filter(isUnnotedMuleFishItem).reduce((n, i) => n + Math.max(1, i.count), 0);
}
function notedMuleFishCount() {
  return Inventory.items().filter(isNotedMuleFishItem).reduce((n, i) => n + Math.max(1, i.count), 0);
}
function muleNamesForKind(kind) {
  if (kind === "tuna") {
    return ["Tuna", "Raw tuna"];
  }
  if (kind === "swordfish") {
    return ["Swordfish", "Raw swordfish"];
  }
  return [];
}
function muleNamesForKinds(kinds) {
  return kinds.flatMap(muleNamesForKind);
}
function notedCountForKind(kind) {
  return Inventory.items().filter((i) => isNotedMuleFishItem(i) && fishKind(i.name) === kind).reduce((n, i) => n + Math.max(1, i.count), 0);
}
function unnotedCountForKind(kind) {
  return Inventory.items().filter((i) => isUnnotedMuleFishItem(i) && fishKind(i.name) === kind).reduce((n, i) => n + Math.max(1, i.count), 0);
}
function fmtMuleCounts(tuna, sword) {
  return `tuna ${tuna}/${MULE_THRESHOLD} swordfish ${sword}/${MULE_THRESHOLD}`;
}
function muleFishHeldCount() {
  return Inventory.items().filter((i) => isMuleFish(i.name)).reduce((n, i) => n + Math.max(1, i.count), 0);
}
function muleFishNamesHeld() {
  const names = [];
  const seen = /* @__PURE__ */ new Set();
  for (const item of Inventory.items()) {
    if (!isMuleFish(item.name)) {
      continue;
    }
    const key = (item.name ?? "").toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    names.push(item.name);
  }
  return names;
}
class CatherbySwordfish extends LoopingBotBase {
  status = "starting";
  startedAt = 0;
  fishXpAtStart = 0;
  cookXpAtStart = 0;
  /** Total raw fish caught this session. */
  caught = 0;
  /** Total successfully cooked fish this session (not burnt). */
  cooked = 0;
  /** Units sold to Harry this session. */
  sold = 0;
  bankTrips = 0;
  sellTrips = 0;
  /** False until harpoon is in inventory (bank or Harry). */
  startReady = false;
  /** Preference: cook on Range before banking / selling. */
  cookOnWay = true;
  /** Preference: sell catch to Harry instead of banking. */
  sellToHarry = false;
  /** Preference: mule to eoc when tuna ≥ 1000 or swordfish ≥ 1000 (not combined). */
  muleMode = true;
  cookingLoad = false;
  lastRawSeen = 0;
  /** Units traded to eoc this session. */
  muled = 0;
  muleTrips = 0;
  /** Mule: mid handoff (withdraw noted → trade eoc). */
  muleHandoffActive = false;
  /** Mule: noted fish withdrawn and ready to trade to eoc. */
  muleReadyToTrade = false;
  /** Mule: already printed the handoff plan line. */
  muleAnnounced = false;
  /** Earliest wall-clock time we may call Trade.request again. */
  nextMuleTradeRequestAtMs = 0;
  /** Last known bank tuna+swordfish count (paint / leftover). */
  lastBankFish = 0;
  /** Last known bank tuna (raw + cooked) for per-type mule threshold. */
  lastBankTuna = 0;
  /** Last known bank swordfish (raw + cooked) for per-type mule threshold. */
  lastBankSwordfish = 0;
  /** True after we have opened the bank at least once this session to count fish. */
  muleBankSeen = false;
  /** Set from chat when the east-beach rocks block a hop. */
  cantReach = false;
  /** @type {Map<string, number>} tileKey → epoch ms until we may retry that hop */
  unreachableUntil = /* @__PURE__ */ new Map();
  /** @type {{ x: number, z: number, level?: number } | null} */
  lastSpotTile = null;
  /** 0 = Harry sand, 1 = mid beach. */
  beachScanIdx = 0;
  emptyScanTicks = 0;
  unlockTimer = null;
  async onStart() {
    await Execution.delayUntil(() => Game.ingame() && Game.tile() !== null, 0);
    Traversal.preload();
    this.startPausedPrefUnlock();
    ensurePaintFont();
    this.syncPrefs({ silent: true });
    this.startedAt = Date.now();
    this.fishXpAtStart = Skills.xp("fishing");
    this.cookXpAtStart = Skills.xp("cooking");
    this.caught = 0;
    this.cooked = 0;
    this.sold = 0;
    this.bankTrips = 0;
    this.sellTrips = 0;
    this.muled = 0;
    this.muleTrips = 0;
    this.startReady = false;
    this.cookingLoad = false;
    this.lastRawSeen = rawFishCount();
    this.muleHandoffActive = false;
    this.muleReadyToTrade = false;
    this.muleAnnounced = false;
    this.nextMuleTradeRequestAtMs = 0;
    this.lastBankFish = 0;
    this.lastBankTuna = 0;
    this.lastBankSwordfish = 0;
    this.muleBankSeen = false;
    this.cantReach = false;
    this.unreachableUntil = /* @__PURE__ */ new Map();
    this.lastSpotTile = null;
    this.beachScanIdx = 0;
    this.emptyScanTicks = 0;
    this.on("chat.message", (e) => {
      if (CANT_REACH_RE.test(String(e.text ?? ""))) {
        this.cantReach = true;
      }
    });
    this.on("skill.level", (e) => {
      if (e.name === "fishing" || e.name === "cooking") {
        this.log(`${e.name} ${e.previous} \u2192 ${e.level}`);
      }
    });
    this.log(
      `CatherbySwordfish @ ${ANCHOR.x},${ANCHOR.z} \u2014 Harpoon on Cage+Harpoon only; Harry/mid first, cape via sand (never east rocks); withdraw Harpoon first; tuna/swordfish cook-aware; cook on way: ${this.cookOnWay ? "on" : "off"}; sell to Harry: ${this.sellToHarry ? "on" : "off"}; mule: ${this.muleWanted() ? `on (\u2265${MULE_THRESHOLD} tuna OR \u2265${MULE_THRESHOLD} swordfish \u2192 ${MULE_NAME})` : "off"}`
    );
    if (hasHarpoon()) {
      this.startReady = true;
      this.log("Harpoon already in inventory \u2014 ready to fish");
    } else {
      this.log("no Harpoon \u2014 will withdraw from bank (or buy from Harry)");
    }
    this.status = hasHarpoon() ? "ready" : "start: need harpoon";
  }
  startPausedPrefUnlock() {
    unlockPausedPrefsUi();
    this.unlockTimer = setInterval(() => unlockPausedPrefsUi(), 400);
  }
  onStop() {
    if (this.unlockTimer != null) {
      clearInterval(this.unlockTimer);
      this.unlockTimer = null;
    }
    this.log(
      `stopped \u2014 caught ${this.caught}, cooked ${this.cooked}, sold ${this.sold}, muled ${this.muled}, bank ${this.bankTrips}, sell trips ${this.sellTrips}, mule trips ${this.muleTrips} (${this.status})`
    );
  }
  syncPrefs({ silent = false } = {}) {
    const prevCook = this.cookOnWay;
    const prevSell = this.sellToHarry;
    const prevMule = this.muleMode;
    this.cookOnWay = readPrefBool(
      "cookOnWay",
      this.settings.bool("cookOnWay", true)
    );
    this.sellToHarry = readPrefBool(
      "sellToHarry",
      this.settings.bool("sellToHarry", false)
    );
    this.muleMode = readPrefBool("muleOn", this.settings.bool("muleOn", true));
    if (!silent && prevCook !== this.cookOnWay) {
      this.log(`prefs: cook on way \u2192 ${this.cookOnWay ? "on" : "off"}`);
    }
    if (!silent && prevSell !== this.sellToHarry) {
      this.log(`prefs: sell to Harry \u2192 ${this.sellToHarry ? "on" : "off"}`);
    }
    if (!silent && prevMule !== this.muleMode) {
      this.log(`prefs: mule mode \u2192 ${this.muleMode ? "on" : "off"}`);
    }
  }
  noteCatches() {
    const now = rawFishCount();
    if (now > this.lastRawSeen) {
      this.caught += now - this.lastRawSeen;
    }
    this.lastRawSeen = now;
  }
  noteCooked(beforeCooked) {
    const now = cookedFishCount();
    if (now > beforeCooked) {
      const gained = now - beforeCooked;
      this.cooked += gained;
      return gained;
    }
    return 0;
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
    this.syncPrefs({ silent: true });
    unlockPausedPrefsUi();
    this.noteCatches();
    if (this.cantReach) {
      await this.recoverCantReach(this.lastSpotTile);
      return;
    }
    if (ChatDialog.canContinue()) {
      this.status = "continue dialog";
      await ChatDialog.continue();
      return;
    }
    if (this.muleHandoffActive) {
      if (!this.muleWanted()) {
        await this.resumeFishingAfterMule("mule mode turned off");
        return;
      }
      await this.muleTick();
      return;
    }
    if (Shop.isOpen()) {
      await this.handleOpenHarry();
      return;
    }
    if (Bank.isOpen()) {
      await Bank.close();
      return;
    }
    if (ChatDialog.isMakeMenu()) {
      await this.chooseCookProduct();
      if (cookableCount() === 0 && fishForDisposeCount() > 0) {
        if (burntCount() > 0) {
          await this.dropBurnt();
        }
        this.cookingLoad = false;
        await this.disposeCatchAndReturn();
      }
      return;
    }
    if (!this.startReady || needsGear()) {
      if (!hasHarpoon() && await this.lootHarpoonFromGround()) {
        this.log("looted Harpoon");
        this.startReady = true;
        return;
      }
      this.status = "need Harpoon";
      this.log(
        !this.startReady ? "start: withdrawing Harpoon from bank (Harry if missing)" : "missing Harpoon \u2014 bank first, then Harry if needed"
      );
      await this.bankRestockAndReturn();
      if (!hasHarpoon()) {
        this.log("still no harpoon \u2014 buying Harpoon from Harry");
        await this.buyHarpoonFromHarryAndReturn();
      }
      if (hasHarpoon()) {
        this.startReady = true;
      }
      return;
    }
    if (this.muleWanted() && !this.muleBankSeen) {
      this.status = "mule: snapshot bank";
      this.log(
        `mule on \u2014 opening bank to count tuna/swordfish (handoff at \u2265${MULE_THRESHOLD} of either type)`
      );
      await this.bankRestockAndReturn();
      return;
    }
    if (this.cookingLoad && cookableCount() > 0) {
      await this.cookLoad();
      return;
    }
    if (this.cookingLoad && cookableCount() === 0) {
      if (burntCount() > 0) {
        await this.dropBurnt();
      }
      this.cookingLoad = false;
      if (fishForDisposeCount() > 0) {
        await this.disposeCatchAndReturn();
      }
      return;
    }
    if (Inventory.isFull()) {
      await this.peelOffEastBeach();
      if (this.cookOnWay && cookableCount() > 0) {
        this.cookingLoad = true;
        this.log(
          `full inv (${cookableCount()} cookable / ${rawFishCount()} raw) \u2014 cooking on way`
        );
        await this.cookLoad();
        return;
      }
      if (fishForDisposeCount() > 0) {
        await this.disposeCatchAndReturn();
        return;
      }
      this.log("full inv with no fish \u2014 banking irrelevant items");
      await this.bankRestockAndReturn();
      return;
    }
    if (this.muleWanted() && (this.lastBankTuna >= MULE_THRESHOLD || this.lastBankSwordfish >= MULE_THRESHOLD)) {
      this.log(
        `mule: last bank ${fmtMuleCounts(this.lastBankTuna, this.lastBankSwordfish)} \u2014 starting handoff`
      );
      this.beginMuleHandoff();
      await this.peelOffEastBeach();
      await this.muleTick();
      return;
    }
    const here = Game.tile();
    if (!here) {
      await Execution.delayTicks(2);
      return;
    }
    if (onEastRocks(here) || pastCapeTip(here)) {
      await this.peelOffEastBeach();
      return;
    }
    if (Tile.from(here).distanceTo(ANCHOR) > LEASH) {
      this.status = "returning to shore";
      await this.peelOffEastBeach();
      await Traversal.walkResilient(ANCHOR, {
        radius: 3,
        log: (m) => this.log(`  ${m}`)
      });
      return;
    }
    if (Game.animating()) {
      this.status = "fishing";
      await Execution.delayTicks(1);
      return;
    }
    const spot = this.findHarpoonSpot();
    if (!spot) {
      await this.scanBeachForSpots();
      return;
    }
    this.emptyScanTicks = 0;
    await this.harpoonSpot(spot);
  }
  /** After cook (or raw full): sell to Harry or bank, then return to shore. */
  async disposeCatchAndReturn() {
    if (this.sellToHarry && (harrySellCount() > 0 || cookedFishCount() > 0)) {
      await this.sellToHarryAndReturn();
      return;
    }
    await this.bankRestockAndReturn();
  }
  markSpotUnreachable(tile) {
    const key = tileKey(tile);
    if (!key) {
      return;
    }
    this.unreachableUntil.set(key, Date.now() + UNREACHABLE_MS);
  }
  isSpotBlacklisted(tile) {
    const key = tileKey(tile);
    if (!key) {
      return false;
    }
    return Date.now() < (this.unreachableUntil.get(key) ?? 0);
  }
  spotIsFishable(tile) {
    if (!tile) {
      return false;
    }
    const t = Tile.from(tile);
    if ((t.level ?? 0) !== 0) {
      return false;
    }
    if (isEastRocksHop(t)) {
      return false;
    }
    if (t.x < SPOT_MIN_X || t.x > SPOT_MAX_X || t.z < SPOT_MIN_Z || t.z > SPOT_MAX_Z) {
      return false;
    }
    return !this.isSpotBlacklisted(t);
  }
  /** Follow sand west off the cape/rocks — never 2860 → bank in one walk. */
  async peelOffEastBeach() {
    const here = Game.tile();
    if (!leavingEastBeach(here)) {
      return false;
    }
    this.status = "leaving east beach";
    this.log(`east beach @ ${here.x},${here.z} \u2014 walking west along sand first`);
    for (const stop of BEACH_WESTWARD) {
      const now = Game.tile();
      if (!now) {
        break;
      }
      if (now.x <= stop.x + 1) {
        continue;
      }
      await Traversal.walkResilient(stop, {
        radius: 2,
        log: (m) => this.log(`  ${m}`)
      });
    }
    const after = Game.tile();
    if (leavingEastBeach(after)) {
      await Traversal.walkResilient(MID_BEACH, {
        radius: 3,
        log: (m) => this.log(`  ${m}`)
      });
    }
    return true;
  }
  async walkBeachEast() {
    this.status = "walking east along sand";
    for (const stop of BEACH_EASTWARD) {
      const now = Game.tile();
      if (!now) {
        break;
      }
      if (now.x >= stop.x - 1 && Tile.from(now).distanceTo(stop) <= 3) {
        continue;
      }
      if (now.x < stop.x) {
        await Traversal.walkResilient(stop, {
          radius: 2,
          log: (m) => this.log(`  ${m}`)
        });
      }
    }
  }
  async walkBeachToward(dest) {
    const here = Game.tile();
    if (!here || !dest) {
      return;
    }
    if (here.x < dest.x - 1) {
      for (const stop of BEACH_EASTWARD) {
        const now = Game.tile();
        if (!now) {
          break;
        }
        if (stop.x > dest.x) {
          break;
        }
        if (now.x < stop.x - 1) {
          await Traversal.walkResilient(stop, {
            radius: 2,
            log: (m) => this.log(`  ${m}`)
          });
        }
      }
    } else if (here.x > dest.x + 1) {
      for (const stop of BEACH_WESTWARD) {
        const now = Game.tile();
        if (!now) {
          break;
        }
        if (stop.x < dest.x) {
          continue;
        }
        if (now.x > stop.x + 1) {
          await Traversal.walkResilient(stop, {
            radius: 2,
            log: (m) => this.log(`  ${m}`)
          });
        }
      }
    }
    const after = Game.tile();
    if (after && Tile.from(after).distanceTo(dest) > 2) {
      await Traversal.walkResilient(dest, {
        radius: 2,
        log: (m) => this.log(`  ${m}`)
      });
    }
  }
  async scanBeachForSpots() {
    this.status = "scanning beach for Cage+Harpoon";
    const here = Game.tile();
    if (onEastRocks(here) || pastCapeTip(here)) {
      await this.peelOffEastBeach();
      return;
    }
    const dest = BEACH_SCAN[this.beachScanIdx % BEACH_SCAN.length];
    if (!here || Tile.from(here).distanceTo(dest) > 2) {
      this.log(`scanning beach @ ${dest.x},${dest.z}`);
      await this.walkBeachToward(dest);
    }
    this.emptyScanTicks++;
    if (this.emptyScanTicks >= 2) {
      this.emptyScanTicks = 0;
      this.beachScanIdx = (this.beachScanIdx + 1) % BEACH_SCAN.length;
    }
    await Execution.delayTicks(3);
  }
  async recoverCantReach(spotTile) {
    const here = Game.tile();
    this.cantReach = false;
    if (spotTile) {
      this.markSpotUnreachable(spotTile);
    }
    this.log(
      `can't reach that @ ${here?.x},${here?.z}` + (spotTile ? ` (spot ${spotTile.x},${spotTile.z} blacklisted)` : "")
    );
    await this.peelOffEastBeach();
    const after = Game.tile();
    if (!after || leavingEastBeach(after) || Tile.from(after).distanceTo(ANCHOR) > STAND_RADIUS) {
      this.status = "returning to mid beach";
      await Traversal.walkResilient(MID_BEACH, {
        radius: 3,
        log: (m) => this.log(`  ${m}`)
      });
    }
  }
  pickBestHarpoonSpot(spots) {
    if (!spots || spots.length === 0) {
      return null;
    }
    let best = null;
    let bestX = Infinity;
    let bestD = Infinity;
    for (const n of spots) {
      const t = n.tile();
      if (!this.spotIsFishable(t)) {
        continue;
      }
      const x = t.x;
      const d = typeof n.distance === "function" ? n.distance() : Tile.from(t).distanceTo(Game.tile());
      if (x < bestX || x === bestX && d < bestD) {
        best = n;
        bestX = x;
        bestD = d;
      }
    }
    return best;
  }
  findHarpoonSpot() {
    const q = Npcs.query().name(SPOT_NAME).where((n) => isCageHarpoonSpot(n.actions()));
    return this.pickBestHarpoonSpot(npcList(q.where((n) => this.spotIsFishable(n.tile()))));
  }
  async harpoonSpot(spot) {
    const op = harpoonOp(spot.actions());
    if (!op) {
      await Execution.delayTicks(2);
      return;
    }
    const st = spot.tile();
    const here = Game.tile();
    if (onEastRocks(here) || pastCapeTip(here)) {
      await this.peelOffEastBeach();
      return;
    }
    if (st && here && st.x <= 2846 && leavingEastBeach(here)) {
      await this.peelOffEastBeach();
      return;
    }
    if (st && here && st.x >= 2859 && here.x < 2854) {
      this.log(`cape spot @ ${st.x},${st.z} \u2014 sand corridor, not through rocks`);
      await this.walkBeachEast();
      if (onEastRocks() || pastCapeTip()) {
        await this.peelOffEastBeach();
        return;
      }
    }
    const before = rawFishCount();
    this.cantReach = false;
    this.lastSpotTile = st;
    this.status = `harpooning (${spot.distance()}t)`;
    this.log(`Harpoon tuna/swordfish spot @ ${st.x},${st.z}`);
    await spot.interact(op);
    await Execution.delayUntil(
      () => rawFishCount() > before || Game.animating() || ChatDialog.canContinue() || this.cantReach || Inventory.isFull() || !this.findHarpoonSpot(),
      8e3
    );
    this.noteCatches();
    if (this.cantReach) {
      await this.recoverCantReach(st);
    }
    if (onEastRocks() || pastCapeTip()) {
      await this.peelOffEastBeach();
    }
  }
  async lootHarpoonFromGround() {
    if (hasHarpoon()) {
      return true;
    }
    const ground = GroundItems.query().name(HARPOON_NAME).within(12).nearest() ?? GroundItems.query().where((g) => isHarpoonGroundName(g.name)).within(12).nearest();
    if (!ground) {
      return false;
    }
    const before = Inventory.used();
    await ground.interact("Take");
    return await Execution.delayUntil(() => hasHarpoon() || Inventory.used() > before, 6e3) && hasHarpoon();
  }
  findRange() {
    return Locs.query().name("Range", "Cooking range", "Fire", "Fireplace").where((l) => Tile.from(l.tile()).distanceTo(RANGE_LOC) <= RANGE_LEASH).nearest() ?? Locs.query().name("Range", "Cooking range").nearest();
  }
  async openNearbyDoor() {
    const door = Locs.query().where((l) => isShutDoor(l)).where((l) => l.distance() <= 3).nearest();
    if (!door) {
      return false;
    }
    const op = openDoorOp(door);
    if (!op) {
      return false;
    }
    this.log(`opening ${door.name}`);
    await door.interact(op);
    await Execution.delayTicks(2);
    return true;
  }
  async walkToRange() {
    this.status = "walking to range";
    await this.peelOffEastBeach();
    this.log(`walking to Range ${RANGE_STAND.x},${RANGE_STAND.z} (on way to bank/Harry)`);
    await Traversal.walkResilient(RANGE_STAND, {
      radius: 1,
      log: (m) => this.log(`  ${m}`)
    });
    await this.openNearbyDoor();
    const here = Game.tile();
    if (here && Tile.from(here).distanceTo(RANGE_STAND) > 2) {
      await Traversal.walkTo(RANGE_STAND, { radius: 1, timeoutMs: 12e3 });
    }
    if (!this.findRange()) {
      await Traversal.walkTo(RANGE_LOC, { radius: 1, timeoutMs: 8e3 });
      await this.openNearbyDoor();
    }
  }
  async chooseCookProduct() {
    const products = ChatDialog.makeProducts();
    const raw = lastCookableRaw();
    const hint = matchCookProduct(products, raw?.name);
    const kind = fishKind(hint) || fishKind(raw?.name);
    const frag = kind === "swordfish" ? "swordfish" : kind === "tuna" ? "tuna" : null;
    const batch = frag ? Math.max(1, Math.min(countCookableNamed(frag), 28)) : Math.max(1, Math.min(cookableCount(), 28));
    this.status = "cook make-menu";
    this.log(
      `cook menu: [${products.join(", ")}] pick=${hint ?? "none"} x${batch} (cook ${Skills.level("cooking")})`
    );
    let picked = false;
    if (hint && typeof ChatDialog.makeX === "function") {
      picked = await ChatDialog.makeX(hint, batch);
    }
    if (!picked && hint) {
      picked = await ChatDialog.make(hint);
    }
    if (!picked) {
      picked = await ChatDialog.make();
    }
    if (!picked) {
      this.log("could not pick cook product");
      await Execution.delayTicks(1);
      return;
    }
    const stillThisType = () => frag ? countCookableNamed(frag) > 0 : cookableCount() > 0;
    await Execution.delayUntil(
      () => !ChatDialog.isMakeMenu() && (Game.animating() || !stillThisType()),
      5e3
    );
    let cookedMark = cookedFishCount();
    let idle = 0;
    for (let guard = 0; guard < 400 && stillThisType(); guard++) {
      if (ChatDialog.canContinue() || ChatDialog.isMakeMenu()) {
        this.noteCooked(cookedMark);
        return;
      }
      await Execution.delayTicks(1);
      if (this.noteCooked(cookedMark) > 0) {
        cookedMark = cookedFishCount();
        idle = 0;
      } else if (!Game.animating() && ++idle >= 14) {
        break;
      } else if (Game.animating()) {
        idle = 0;
      }
    }
    this.noteCooked(cookedMark);
  }
  async cookLoad() {
    if (cookableCount() === 0) {
      this.cookingLoad = false;
      return;
    }
    const here = Game.tile();
    let oven = this.findRange();
    if (!here || Tile.from(here).distanceTo(RANGE_STAND) > 2 || !oven) {
      await this.walkToRange();
      oven = this.findRange();
    }
    if (!oven) {
      this.log("WARNING: no Range near bank house \u2014 disposing raw instead");
      this.cookingLoad = false;
      await this.disposeCatchAndReturn();
      return;
    }
    if (ChatDialog.isMakeMenu()) {
      await this.chooseCookProduct();
      if (cookableCount() === 0) {
        if (burntCount() > 0) {
          await this.dropBurnt();
        }
        this.cookingLoad = false;
        await this.disposeCatchAndReturn();
      }
      return;
    }
    const raw = lastCookableRaw();
    if (!raw) {
      this.cookingLoad = false;
      return;
    }
    const beforeCookable = cookableCount();
    let cookedMark = cookedFishCount();
    const beforeXp = Skills.xp("cooking");
    this.status = `cooking ${raw.name}`;
    this.log(
      `use ${raw.name} on ${oven.name ?? "Range"} (${beforeCookable} cookable, cook lvl ${Skills.level("cooking")})`
    );
    if (!await raw.useOn(oven)) {
      await this.openNearbyDoor();
      await Execution.delayTicks(2);
      return;
    }
    const started = await Execution.delayUntil(
      () => cookableCount() < beforeCookable || Skills.xp("cooking") > beforeXp || ChatDialog.isMakeMenu() || ChatDialog.canContinue(),
      4e3
    );
    if (ChatDialog.isMakeMenu()) {
      await this.chooseCookProduct();
      if (cookableCount() === 0) {
        if (burntCount() > 0) {
          await this.dropBurnt();
        }
        this.cookingLoad = false;
        await this.disposeCatchAndReturn();
      }
      return;
    }
    if (!started && cookableCount() >= beforeCookable) {
      this.log("cook did not start \u2014 re-pathing to range");
      await this.walkToRange();
      return;
    }
    let mark = cookableCount();
    let idle = 0;
    for (let guard = 0; guard < 400 && cookableCount() > 0; guard++) {
      if (ChatDialog.canContinue() || ChatDialog.isMakeMenu()) {
        this.noteCooked(cookedMark);
        return;
      }
      await Execution.delayTicks(1);
      if (this.noteCooked(cookedMark) > 0) {
        cookedMark = cookedFishCount();
      }
      const now = cookableCount();
      if (now < mark) {
        mark = now;
        idle = 0;
      } else if (!Game.animating() && ++idle >= 14) {
        break;
      } else if (Game.animating()) {
        idle = 0;
      }
    }
    this.noteCooked(cookedMark);
    if (cookableCount() === 0) {
      if (burntCount() > 0) {
        await this.dropBurnt();
      }
      this.cookingLoad = false;
      await this.disposeCatchAndReturn();
    }
  }
  async dropBurnt() {
    this.status = "dropping burnt";
    for (let guard = 0; guard < 28; guard++) {
      const item = Inventory.items().find((i) => isBurntFish(i.name));
      if (!item) {
        break;
      }
      const before = Inventory.used();
      await item.interact("Drop");
      await Execution.delayUntil(() => Inventory.used() < before, 3e3);
      await Execution.delay(80 + Math.floor(Math.random() * 140));
    }
  }
  async sellToHarryAndReturn() {
    const rawSell = harrySellCount();
    const cooked = cookedFishCount();
    this.status = "walking to Harry";
    this.log(
      `selling to Harry` + (rawSell ? ` ${rawSell} raw` : "") + (cooked ? ` (${cooked} cooked \u2192 bank after)` : "")
    );
    this.lastRawSeen = 0;
    await this.peelOffEastBeach();
    await Traversal.walkResilient(HARRY_STAND, {
      radius: 2,
      log: (m) => this.log(`  ${m}`)
    });
    await this.openNearbyDoor();
    this.status = "opening Harry";
    if (!await Shop.open(HARRY_NAME)) {
      this.log("could not open Harry \u2014 retrying next loop");
      await Execution.delayTicks(3);
      return;
    }
    await this.handleOpenHarry();
  }
  /** Sell catch and/or buy a Harpoon while Harry's shop is open. */
  async handleOpenHarry() {
    this.status = "at Harry";
    let sold = 0;
    for (let guard = 0; guard < 60 && harrySellCount() > 0 && Shop.isOpen(); guard++) {
      const names = harrySellNamesHeld();
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
          this.log(`sold ${n}\xD7 ${name} to Harry`);
        }
        await Execution.delayTicks(1);
      }
      if (harrySellCount() > 0) {
        await Execution.delayTicks(1);
      }
    }
    if (!hasHarpoon() && Shop.isOpen()) {
      await this.buyHarpoonInOpenShop();
    }
    if (Shop.isOpen()) {
      await Shop.close();
    }
    if (sold > 0) {
      this.sold += sold;
      this.sellTrips++;
    }
    this.cookingLoad = false;
    if (harrySellCount() > 0) {
      this.log(`WARNING: still holding ${harrySellCount()} sellable raw \u2014 will retry`);
      await Execution.delayTicks(3);
      return;
    }
    if (cookedFishCount() > 0 || burntCount() > 0 || !hasHarpoon()) {
      if (!hasHarpoon()) {
        await this.bankRestockAndReturn();
        if (!hasHarpoon()) {
          await this.buyHarpoonFromHarryAndReturn();
        }
        return;
      }
      await this.bankRestockAndReturn();
      return;
    }
    this.startReady = true;
    this.lastRawSeen = rawFishCount();
    this.status = "returning to shore";
    await Traversal.walkResilient(ANCHOR, {
      radius: 3,
      log: (m) => this.log(`  ${m}`)
    });
  }
  /**
   * Bank fish + any junk, withdraw Harpoon if needed.
   * Keeps Harpoon (and coins for Harry). If bank has no harpoon, withdraw coins for a Harry purchase.
   */
  async bankRestockAndReturn() {
    const raw = rawFishCount();
    const cooked = cookedFishCount();
    this.status = "banking";
    this.log(
      `banking` + (raw ? ` ${raw} raw` : "") + (cooked ? ` ${cooked} cooked` : "") + (burntCount() ? ` ${burntCount()} burnt` : "") + ` \u2014 restock Harpoon`
    );
    this.lastRawSeen = 0;
    await this.peelOffEastBeach();
    await Banking.bankNearest({
      destination: { name: "Catherby", tile: BANK_STAND },
      deposit: (name) => {
        if (isKeepGear(name) || isCoins(name)) {
          return false;
        }
        return true;
      },
      afterDeposit: async () => {
        await this.withdrawGearFromOpenBank();
        this.snapshotBankMuleFish();
      },
      // Stay near bank if we still need Harry for a pot (don't walk to shore yet).
      returnTo: null,
      log: (m) => this.log(`  ${m}`)
    });
    this.bankTrips++;
    this.cookingLoad = false;
    this.lastRawSeen = rawFishCount();
    if (Bank.isOpen()) {
      this.snapshotBankMuleFish();
    }
    this.muleBankSeen = true;
    if (!hasHarpoon()) {
      this.log("no Harpoon in bank \u2014 buying from Harry");
      await this.buyHarpoonFromHarryAndReturn();
      return;
    }
    if (this.maybeBeginMuleFromBank()) {
      return;
    }
    this.startReady = true;
    this.log("gear ready \u2014 Harpoon");
    this.status = "returning to shore";
    await Traversal.walkResilient(ANCHOR, {
      radius: 3,
      log: (m) => this.log(`  ${m}`)
    });
  }
  /**
   * Walk to Harry, buy one Harpoon, return to shore.
   */
  async buyHarpoonFromHarryAndReturn() {
    if (hasHarpoon()) {
      this.startReady = true;
      this.status = "returning to shore";
      await Traversal.walkResilient(ANCHOR, {
        radius: 3,
        log: (m) => this.log(`  ${m}`)
      });
      return;
    }
    if (coinCount() < HARPOON_COST) {
      this.log(
        `need ${HARPOON_COST}gp for Harpoon (have ${coinCount()}) \u2014 withdrawing coins`
      );
      await this.withdrawCoinsForHarpoon();
    }
    if (coinCount() < HARPOON_COST) {
      this.log("WARNING: not enough coins to buy Harpoon from Harry");
      this.status = "need coins";
      await Execution.delayTicks(8);
      return;
    }
    this.status = "walking to Harry (harpoon)";
    this.log(`buying Harpoon from Harry (${HARPOON_COST}gp)`);
    await this.peelOffEastBeach();
    await Traversal.walkResilient(HARRY_STAND, {
      radius: 2,
      log: (m) => this.log(`  ${m}`)
    });
    await this.openNearbyDoor();
    this.status = "buying harpoon";
    if (!await Shop.open(HARRY_NAME)) {
      this.log("could not open Harry for harpoon \u2014 retrying next loop");
      await Execution.delayTicks(3);
      return;
    }
    await this.buyHarpoonInOpenShop();
    if (Shop.isOpen()) {
      await Shop.close();
    }
    if (!hasHarpoon()) {
      this.log("WARNING: still no Harpoon after Harry \u2014 need coins or shop stock");
      this.status = "need harpoon";
      await Execution.delayTicks(8);
      return;
    }
    this.startReady = true;
    this.log("bought Harpoon \u2014 returning to shore");
    this.lastRawSeen = rawFishCount();
    this.status = "returning to shore";
    await Traversal.walkResilient(ANCHOR, {
      radius: 3,
      log: (m) => this.log(`  ${m}`)
    });
  }
  /** Buy one Harpoon from an already-open Harry shop. */
  async buyHarpoonInOpenShop() {
    if (!Shop.isOpen() || hasHarpoon()) {
      return 0;
    }
    if (coinCount() < HARPOON_COST) {
      this.log("cannot afford Harpoon at Harry");
      return 0;
    }
    this.status = "buying Harpoon";
    this.log(`Shop.buy 1\xD7 ${HARPOON_NAME}`);
    const bought = await Shop.buy(HARPOON_NAME, 1);
    if (bought > 0) {
      this.log(`bought ${bought}\xD7 ${HARPOON_NAME} from Harry`);
    } else {
      this.log("Harry had no Harpoon / buy failed");
    }
    return bought;
  }
  /** Open Catherby bank and withdraw enough coins to buy a Harpoon. */
  async withdrawCoinsForHarpoon() {
    const short = Math.max(0, HARPOON_COST - coinCount());
    if (short <= 0) {
      return;
    }
    await Banking.bankNearest({
      destination: { name: "Catherby", tile: BANK_STAND },
      deposit: (name) => {
        if (isKeepGear(name) || isCoins(name)) {
          return false;
        }
        return true;
      },
      afterDeposit: async () => {
        await Execution.delayUntil(() => Bank.loaded() || !Bank.isOpen(), 3e3);
        if (!Bank.isOpen()) {
          return;
        }
        if (await this.withdrawGearFromOpenBank()) {
          return;
        }
        const bankGp = Bank.count("Coins") || 0;
        if (bankGp <= 0) {
          this.log("WARNING: no Coins in bank for Harry harpoon");
          return;
        }
        const take = Math.min(short, bankGp);
        this.log(`withdrawing ${take} Coins for Harry Harpoon`);
        await Bank.withdrawX("Coins", take);
        await Execution.delayTicks(1);
        this.snapshotBankMuleFish();
      },
      returnTo: null,
      log: (m) => this.log(`  ${m}`)
    });
  }
  /** @returns {Promise<boolean>} true if harpoon is in inventory after */
  async withdrawGearFromOpenBank() {
    if (!Bank.isOpen()) {
      return hasHarpoon();
    }
    await Execution.delayUntil(() => Bank.loaded() || !Bank.isOpen(), 3e3);
    if (!Bank.isOpen()) {
      return hasHarpoon();
    }
    if (hasHarpoon()) {
      return true;
    }
    const harpoonBank = Bank.items().find(
      (i) => (i.name ?? "").toLowerCase() === "harpoon"
    );
    if (harpoonBank) {
      const op = (typeof withdrawOp === "function" ? withdrawOp(harpoonBank.ops, "1") : null) ?? "Withdraw-1";
      this.log("withdrawing Harpoon");
      await Bank.withdraw(HARPOON_NAME, op);
      await Execution.delayTicks(1);
      return hasHarpoon();
    }
    const short = Math.max(0, HARPOON_COST - coinCount());
    const bankGp = Bank.count("Coins") || 0;
    if (short > 0 && bankGp > 0) {
      const take = Math.min(short, bankGp);
      this.log(`no bank harpoon \u2014 withdrawing ${take} Coins for Harry Harpoon`);
      await Bank.withdrawX("Coins", take);
      await Execution.delayTicks(1);
    } else {
      this.log("WARNING: no Harpoon in bank");
    }
    return hasHarpoon();
  }
  muleWanted() {
    try {
      return this.settings.bool("muleOn", true) === true;
    } catch {
      return this.muleMode === true;
    }
  }
  snapshotBankMuleFish() {
    if (!Bank.isOpen()) {
      return false;
    }
    this.lastBankTuna = this.bankTunaCount();
    this.lastBankSwordfish = this.bankSwordfishCount();
    this.lastBankFish = this.lastBankTuna + this.lastBankSwordfish;
    this.muleBankSeen = true;
    return true;
  }
  clearBankMuleSnapshot() {
    this.lastBankTuna = 0;
    this.lastBankSwordfish = 0;
    this.lastBankFish = 0;
  }
  bankTunaCount() {
    return this.bankCountByName("Tuna") + this.bankCountByName("Raw tuna");
  }
  bankSwordfishCount() {
    return this.bankCountByName("Swordfish") + this.bankCountByName("Raw swordfish");
  }
  tunaAvailableCount() {
    const banked = Bank.isOpen() ? this.bankTunaCount() : this.lastBankTuna;
    return banked + notedCountForKind("tuna") + unnotedCountForKind("tuna");
  }
  swordfishAvailableCount() {
    const banked = Bank.isOpen() ? this.bankSwordfishCount() : this.lastBankSwordfish;
    return banked + notedCountForKind("swordfish") + unnotedCountForKind("swordfish");
  }
  /** True when tuna ≥ 1000 or swordfish ≥ 1000 (never a combined 1000). */
  meetsMuleThreshold() {
    return this.kindsReadyToMule().length > 0;
  }
  /** Types that individually meet the mule threshold (raw + cooked). */
  kindsReadyToMule() {
    const kinds = [];
    if (this.tunaAvailableCount() >= MULE_THRESHOLD) {
      kinds.push("tuna");
    }
    if (this.swordfishAvailableCount() >= MULE_THRESHOLD) {
      kinds.push("swordfish");
    }
    return kinds;
  }
  bankCountForKind(kind) {
    return kind === "swordfish" ? this.bankSwordfishCount() : this.bankTunaCount();
  }
  bankCountForKinds(kinds) {
    return kinds.reduce((n, k) => n + this.bankCountForKind(k), 0);
  }
  beginMuleHandoff({ alreadyAtBank = false } = {}) {
    if (this.muleHandoffActive) {
      return;
    }
    this.muleHandoffActive = true;
    this.muleReadyToTrade = false;
    this.muleAnnounced = false;
    this.nextMuleTradeRequestAtMs = 0;
    this.log(
      `mule: handoff tuna/swordfish that are \u2265${MULE_THRESHOLD} each to ${MULE_NAME}` + (alreadyAtBank ? " \u2014 already at bank" : "")
    );
    this.status = "mule: start handoff";
  }
  maybeBeginMuleFromBank() {
    if (!this.muleWanted()) {
      return false;
    }
    if (Bank.isOpen()) {
      this.snapshotBankMuleFish();
    }
    const tuna = Bank.isOpen() ? this.bankTunaCount() : this.lastBankTuna;
    const sword = Bank.isOpen() ? this.bankSwordfishCount() : this.lastBankSwordfish;
    this.log(`mule: bank ${fmtMuleCounts(tuna, sword)}`);
    if (tuna < MULE_THRESHOLD && sword < MULE_THRESHOLD) {
      return false;
    }
    this.beginMuleHandoff({ alreadyAtBank: true });
    return true;
  }
  /** After a finished trade (or aborted handoff): clear flags and return to shore. */
  async resumeFishingAfterMule(reason) {
    this.muleHandoffActive = false;
    this.muleReadyToTrade = false;
    this.muleAnnounced = false;
    this.startReady = true;
    this.lastRawSeen = rawFishCount();
    this.log(`mule: ${reason} \u2014 resuming harpoon fishing`);
    if (!hasHarpoon()) {
      this.status = "mule: restock harpoon";
      await this.bankRestockAndReturn();
      return;
    }
    if (fishForDisposeCount() > 0) {
      await this.bankRestockAndReturn();
      return;
    }
    this.status = "returning to shore";
    await Traversal.walkResilient(ANCHOR, {
      radius: 3,
      log: (m) => this.log(`  ${m}`)
    });
  }
  bankMuleFishCount() {
    const items = Bank.items?.() ?? [];
    const fromItems = items.filter((i) => isMuleFish(i.name)).reduce((n, i) => n + Math.max(1, i.count), 0);
    let fromCount = 0;
    if (typeof Bank.count === "function") {
      fromCount = MULE_FISH_NAMES.reduce((n, name) => n + (Bank.count(name) || 0), 0);
    }
    return Math.max(fromItems, fromCount);
  }
  bankCountByName(name) {
    const want = (name ?? "").toLowerCase();
    const items = Bank.items?.() ?? [];
    const fromItems = items.filter((i) => (i.name ?? "").toLowerCase() === want).reduce((n, i) => n + Math.max(1, i.count), 0);
    if (fromItems > 0) {
      return fromItems;
    }
    if (typeof Bank.count === "function") {
      return Bank.count(name) || 0;
    }
    return 0;
  }
  /** Prefer a Withdraw-All-Notes label when the bank item exposes one. */
  notedWithdrawAllOp(bankItem) {
    const ops = Array.isArray(bankItem?.ops) ? bankItem.ops : [];
    const noteAll = ops.find(
      (a) => /withdraw/i.test(String(a)) && /note|cert/i.test(String(a))
    );
    if (noteAll) {
      return noteAll;
    }
    if (typeof withdrawOp === "function") {
      return withdrawOp(ops, "all") ?? withdrawOp(ops, "any") ?? null;
    }
    return ops.find((a) => /withdraw-?all/i.test(String(a))) ?? "Withdraw-All";
  }
  async ensureBankNoteMode(on) {
    if (typeof Bank.setNoteMode !== "function") {
      this.log("WARNING: Bank.setNoteMode missing \u2014 noted withdraw may fail");
      return false;
    }
    await Bank.setNoteMode(on);
    await Execution.delayTicks(2);
    if (typeof Bank.noteMode === "function" && Bank.noteMode() !== on) {
      await Bank.setNoteMode(on);
      await Execution.delayTicks(2);
    }
    return typeof Bank.noteMode !== "function" || Bank.noteMode() === on;
  }
  async depositUnnotedMuleFish(reason) {
    const n = unnotedMuleFishCount();
    if (n <= 0) {
      return false;
    }
    this.log(`mule: ${reason} (${n} unnoted) \u2014 depositing, will withdraw as notes`);
    if (typeof Bank.depositAllMatching === "function") {
      await Bank.depositAllMatching((name, id) => isUnnotedMuleFishDeposit(name, id));
    }
    await Execution.delayTicks(1);
    return true;
  }
  /**
   * Withdraw banked tuna and/or swordfish as notes — only types that are ≥ threshold.
   * Returns false if we must retry.
   */
  async withdrawAllMuleFishNoted(kinds = this.kindsReadyToMule()) {
    const names = muleNamesForKinds(kinds);
    const banked = this.bankCountForKinds(kinds);
    if (names.length === 0 || banked <= 0) {
      return true;
    }
    this.log(
      `mule: withdrawing ALL ${kinds.join(" + ")} as notes (${banked}) \u2014 leaving the other type in bank if it is under ${MULE_THRESHOLD}`
    );
    await this.ensureBankNoteMode(true);
    for (const name of names) {
      if (!Bank.isOpen()) {
        return false;
      }
      const have = this.bankCountByName(name);
      if (have <= 0) {
        continue;
      }
      const bankItem = (Bank.items?.() ?? []).find(
        (i) => (i.name ?? "").toLowerCase() === name.toLowerCase()
      ) ?? null;
      const op = this.notedWithdrawAllOp(bankItem);
      this.log(`mule: ${op || "Withdraw-All"} ${have}\xD7 ${name} (note mode)`);
      let ok = false;
      if (typeof Bank.withdraw === "function" && op) {
        ok = !!await Bank.withdraw(name, op);
      }
      if (!ok && typeof Bank.withdraw === "function") {
        ok = !!await Bank.withdraw(name, "Withdraw-All");
      }
      if (!ok && typeof Bank.withdrawById === "function" && bankItem?.id != null && op) {
        ok = !!await Bank.withdrawById(bankItem.id, op);
      }
      if (!ok && typeof Bank.withdrawX === "function") {
        ok = !!await Bank.withdrawX(name, have);
      }
      await Execution.delayUntil(
        () => this.bankCountByName(name) < have || notedMuleFishCount() > 0,
        2e3
      );
      await Execution.delayTicks(1);
      if (ok) {
        this.log(`mule: withdrew ${name} as notes`);
      } else {
        this.log(`mule: withdraw ${name} did not confirm \u2014 will retry`);
      }
    }
    await Execution.delayTicks(1);
    const unnotedLeft = kinds.reduce((n, k) => n + unnotedCountForKind(k), 0);
    return unnotedLeft <= 0 && this.bankCountForKinds(kinds) <= 0;
  }
  findEoc() {
    if (typeof Players?.query !== "function") {
      return null;
    }
    const partner = Players.query().name(MULE_NAME).nearest() ?? null;
    if (!partner) {
      return null;
    }
    const pt = partner.tile?.() ?? null;
    if (pt && Tile.from(pt).distanceTo(BANK_STAND) > BANK_MULE_LEASH) {
      return null;
    }
    return partner;
  }
  /**
   * Mule handoff: stay at Catherby bank, withdraw tuna and/or swordfish as notes
   * only when that type is ≥ threshold, trade to eoc, then resume fishing.
   */
  async muleTick() {
    if (!this.muleReadyToTrade) {
      await this.muleBankNotedFish();
      return;
    }
    if (typeof Trade !== "undefined" && Trade.active()) {
      await this.driveMuleTrade();
      return;
    }
    if (notedMuleFishCount() <= 0 && muleFishHeldCount() <= 0) {
      this.clearBankMuleSnapshot();
      await this.resumeFishingAfterMule("no fish in pack after withdraw");
      return;
    }
    await this.requestMuleTrade();
  }
  /**
   * Catherby bank: keep harpoon, withdraw tuna and/or swordfish as notes
   * only when that type is ≥ threshold. The other type stays in the bank.
   */
  async muleBankNotedFish() {
    this.status = "mule: banking";
    if (!this.muleAnnounced) {
      this.muleAnnounced = true;
      this.log(
        `mule: withdraw noted tuna OR swordfish (\u2265${MULE_THRESHOLD} each, not combined) \u2192 trade to ${MULE_NAME} at Catherby bank \u2192 resume fish`
      );
    }
    const here = Game.tile();
    if (!here || Tile.from(here).distanceTo(BANK_STAND) > BANK_MULE_LEASH) {
      this.status = "mule: to bank";
      await Traversal.walkResilient(BANK_STAND, {
        radius: 2,
        log: (m) => this.log(`  ${m}`)
      });
      return;
    }
    if (!Bank.isOpen()) {
      this.log("mule: opening Catherby bank");
      if (!await Banking.open({
        stand: BANK_STAND,
        log: (m) => this.log(`  ${m}`)
      })) {
        this.log("mule: could not open bank \u2014 retrying");
        await Execution.delayTicks(3);
        return;
      }
    }
    if (typeof Bank.loaded === "function") {
      await Execution.delayUntil(() => Bank.loaded() || Bank.items().length > 0, 3e3);
    }
    await Execution.delayTicks(1);
    this.snapshotBankMuleFish();
    const notedHeld = notedMuleFishCount();
    const unnotedHeld = unnotedMuleFishCount();
    let banked = this.bankMuleFishCount();
    this.log(
      `mule: live ${fmtMuleCounts(this.bankTunaCount(), this.bankSwordfishCount())} bank ${banked} noted-pack ${notedHeld} unnoted-pack ${unnotedHeld}`
    );
    if (unnotedHeld > 0) {
      await this.depositUnnotedMuleFish("depositing unnoted fish before noted withdraw");
      this.snapshotBankMuleFish();
      banked = this.bankMuleFishCount();
    }
    if (typeof Inventory.free === "function" && Inventory.free() <= 0 && banked > 0) {
      this.log("mule: clearing non-note junk for noted withdraw");
      if (typeof Bank.depositAllMatching === "function") {
        await Bank.depositAllMatching((name, id) => {
          if (isKeepGear(name) || isCoins(name)) {
            return false;
          }
          if (isMuleFish(name)) {
            return isUnnotedMuleFishDeposit(name, id);
          }
          return true;
        });
      }
      await Execution.delayTicks(1);
      this.snapshotBankMuleFish();
      banked = this.bankMuleFishCount();
    }
    this.snapshotBankMuleFish();
    banked = this.bankMuleFishCount();
    const kinds = this.kindsReadyToMule();
    const notedNowTuna = notedCountForKind("tuna");
    const notedNowSword = notedCountForKind("swordfish");
    if (kinds.length === 0) {
      this.log(
        `mule: ${fmtMuleCounts(this.tunaAvailableCount(), this.swordfishAvailableCount())} \u2014 waiting (will not trade)`
      );
      if (Bank.isOpen()) {
        await Bank.close();
      }
      await this.resumeFishingAfterMule(
        `need \u2265${MULE_THRESHOLD} tuna or \u2265${MULE_THRESHOLD} swordfish before mule (have ${fmtMuleCounts(this.tunaAvailableCount(), this.swordfishAvailableCount())})`
      );
      return;
    }
    const readyBanked = this.bankCountForKinds(kinds);
    const readyNoted = kinds.includes("tuna") && notedNowTuna >= MULE_THRESHOLD || kinds.includes("swordfish") && notedNowSword >= MULE_THRESHOLD;
    if (readyNoted && unnotedMuleFishCount() <= 0 && readyBanked <= 0) {
      if (Bank.isOpen()) {
        await Bank.close();
      }
      this.muleReadyToTrade = true;
      this.lastRawSeen = rawFishCount();
      this.log(
        `mule: holding ${fmtMuleCounts(notedNowTuna, notedNowSword)} noted \u2014 looking for ${MULE_NAME}`
      );
      this.status = "mule: find partner";
      return;
    }
    if (banked <= 0 && notedNowTuna + notedNowSword <= 0) {
      this.log("mule: no tuna/swordfish in bank or pack \u2014 aborting handoff");
      this.clearBankMuleSnapshot();
      if (Bank.isOpen()) {
        await Bank.close();
      }
      await this.resumeFishingAfterMule("nothing to mule");
      return;
    }
    if (readyBanked > 0) {
      const allNoted = await this.withdrawAllMuleFishNoted(kinds);
      if (unnotedMuleFishCount() > 0) {
        await this.depositUnnotedMuleFish("withdraw came out unnoted");
        await this.ensureBankNoteMode(true);
        await Execution.delayTicks(2);
        return;
      }
      if (notedMuleFishCount() <= 0 && muleFishHeldCount() <= 0) {
        this.log("mule: withdraw did not land noted fish \u2014 retrying");
        await this.ensureBankNoteMode(true);
        await Execution.delayTicks(2);
        return;
      }
      const leftoverReady = this.bankCountForKinds(kinds);
      if (leftoverReady > 0 || !allNoted) {
        this.log(
          `mule: ${leftoverReady} ${kinds.join("/")} still in bank \u2014 retrying noted withdraw-all`
        );
        await this.ensureBankNoteMode(true);
        await Execution.delayTicks(2);
        return;
      }
    }
    if (unnotedMuleFishCount() > 0) {
      await this.depositUnnotedMuleFish("still holding unnoted fish \u2014 will not trade");
      await this.ensureBankNoteMode(true);
      await Execution.delayTicks(2);
      return;
    }
    this.snapshotBankMuleFish();
    const notedAfterTuna = notedCountForKind("tuna");
    const notedAfterSword = notedCountForKind("swordfish");
    const leftoverReadyAfter = this.bankCountForKinds(kinds);
    if (notedAfterTuna < MULE_THRESHOLD && notedAfterSword < MULE_THRESHOLD) {
      if (leftoverReadyAfter > 0) {
        this.log(
          `mule: pack ${fmtMuleCounts(notedAfterTuna, notedAfterSword)} with ${leftoverReadyAfter} ready-type still in bank \u2014 retrying`
        );
        await this.ensureBankNoteMode(true);
        await Execution.delayTicks(2);
        return;
      }
      this.log(
        `mule: pack ${fmtMuleCounts(notedAfterTuna, notedAfterSword)} noted \u2014 will not trade`
      );
      if (Bank.isOpen()) {
        await Bank.close();
      }
      await this.resumeFishingAfterMule(
        `need \u2265${MULE_THRESHOLD} tuna or \u2265${MULE_THRESHOLD} swordfish before mule (have ${fmtMuleCounts(notedAfterTuna, notedAfterSword)})`
      );
      return;
    }
    await this.ensureBankNoteMode(false);
    if (Bank.isOpen()) {
      await Bank.close();
    }
    this.muleReadyToTrade = true;
    this.lastRawSeen = rawFishCount();
    this.log(
      `mule: holding ${fmtMuleCounts(notedAfterTuna, notedAfterSword)} noted (0 unnoted) \u2014 looking for ${MULE_NAME}`
    );
    this.status = "mule: find partner";
  }
  async requestMuleTrade() {
    const here = Game.tile();
    if (!here || Tile.from(here).distanceTo(BANK_STAND) > BANK_MULE_LEASH) {
      this.status = "mule: return to bank";
      await Traversal.walkResilient(BANK_STAND, {
        radius: 2,
        log: (m) => this.log(`  ${m}`)
      });
      return;
    }
    const partner = this.findEoc();
    if (!partner) {
      this.status = `mule: waiting for ${MULE_NAME} at bank`;
      if (Tile.from(here).distanceTo(BANK_STAND) > 2) {
        await Traversal.walkTo(BANK_STAND, { radius: 2, timeoutMs: 8e3 });
      }
      await Execution.delayTicks(3);
      return;
    }
    if (partner.distance() > MULE_TRADE_RANGE) {
      this.status = `mule: walking to ${MULE_NAME}`;
      this.log(`mule: ${MULE_NAME} ${partner.distance()}t away \u2014 walking closer (stay at bank)`);
      const pt = partner.tile?.() ?? null;
      if (pt && Tile.from(pt).distanceTo(BANK_STAND) <= BANK_MULE_LEASH) {
        await Traversal.walkTo(pt, {
          radius: MULE_TRADE_RANGE,
          timeoutMs: 12e3,
          log: (m) => this.log(`  ${m}`)
        });
      } else {
        await Execution.delayTicks(2);
      }
      return;
    }
    if (Date.now() < this.nextMuleTradeRequestAtMs) {
      this.status = `mule: waiting to re-request ${MULE_NAME}`;
      await Execution.delayTicks(1);
      return;
    }
    this.status = `mule: trading ${MULE_NAME}`;
    this.log(`mule: Trade with ${MULE_NAME}`);
    this.nextMuleTradeRequestAtMs = Date.now() + MULE_TRADE_REQUEST_MS;
    await Trade.request(MULE_NAME);
    await Execution.delayUntil(() => Trade.active(), MULE_TRADE_REQUEST_MS);
  }
  /**
   * Wait 5–10s, then Accept. On the confirm screen, keep clicking Accept
   * until the trade fully closes.
   * @param {'offer'|'confirm'} screen
   */
  async muleWaitAndAcceptScreen(screen) {
    const onOffer = () => Trade.onOfferScreen() && !Trade.onConfirmScreen();
    const onConfirm = () => Trade.onConfirmScreen();
    const isHere = screen === "confirm" ? onConfirm : onOffer;
    if (!Trade.active() || !isHere()) {
      return;
    }
    const waitMs = muleAcceptDelayMs();
    const label = screen === "confirm" ? "confirm (double-check)" : "offer (trade goods)";
    this.status = `mule: waiting on ${screen}`;
    this.log(`mule: ${label} \u2014 waiting ~${Math.round(waitMs / 1e3)}s before accept`);
    const readyAt = Date.now() + waitMs;
    while (Date.now() < readyAt && Trade.active() && isHere()) {
      await Execution.delayTicks(1);
    }
    if (!Trade.active()) {
      return;
    }
    this.status = `mule: accepting ${screen}`;
    this.log(`mule: accepting ${label}`);
    await Trade.accept();
    if (screen === "offer") {
      while (Trade.active() && onOffer()) {
        await Execution.delayUntil(
          () => !Trade.active() || onConfirm() || !onOffer(),
          MULE_ACCEPT_RETRY_MS
        );
        if (!Trade.active() || onConfirm() || !onOffer()) {
          break;
        }
        this.log("mule: re-accepting offer (still open)");
        await Trade.accept();
      }
      return;
    }
    this.log("mule: confirm accepted \u2014 keeping Accept until trade closes");
    while (Trade.active()) {
      if (onConfirm() || onOffer()) {
        this.status = "mule: accepting until trade ends";
        await Trade.accept();
      }
      await Execution.delayTicks(2);
    }
    this.log("mule: trade interface closed");
  }
  kindsHeldAtOrOverThreshold() {
    const kinds = [];
    if (notedCountForKind("tuna") >= MULE_THRESHOLD) {
      kinds.push("tuna");
    }
    if (notedCountForKind("swordfish") >= MULE_THRESHOLD) {
      kinds.push("swordfish");
    }
    return kinds;
  }
  offerHasMuleFish() {
    if (typeof Trade === "undefined" || typeof Trade.myOffer !== "function") {
      return false;
    }
    return Trade.myOffer().some((i) => isMuleFish(i.name));
  }
  async driveMuleTrade() {
    const before = muleFishHeldCount();
    const beforeTuna = notedCountForKind("tuna");
    const beforeSword = notedCountForKind("swordfish");
    while (typeof Trade !== "undefined" && Trade.active()) {
      if (Trade.onConfirmScreen()) {
        await this.muleWaitAndAcceptScreen("confirm");
        break;
      }
      if (!Trade.onOfferScreen()) {
        await Execution.delayTicks(1);
        continue;
      }
      const who = Trade.partner();
      if (who != null && who.trim().toLowerCase() !== MULE_NAME.toLowerCase()) {
        this.log(`mule: declining trade with ${who} (want ${MULE_NAME})`);
        await Trade.decline();
        return;
      }
      if (who == null) {
        this.status = "mule: reading trade partner";
        await Execution.delayTicks(1);
        continue;
      }
      const offered = this.offerHasMuleFish();
      if (!offered) {
        if (this.status !== "mule: offering fish") {
          this.log("mule: Offer-All noted tuna/swordfish that are \u2265 threshold");
        }
        this.status = "mule: offering fish";
        const readyKinds = this.kindsHeldAtOrOverThreshold();
        const offerNoted = (i) => {
          if (!isMuleFish(i.name)) {
            return false;
          }
          const kind = fishKind(i.name);
          if (!readyKinds.includes(kind)) {
            return false;
          }
          const cert = certIsNote(i.id);
          if (cert === true) {
            return true;
          }
          if (cert === false) {
            return false;
          }
          return Math.max(1, i.count) > 1;
        };
        let offeredOk = false;
        if (typeof Trade.offerAll === "function") {
          const names = muleFishNamesHeld().filter((name) => {
            const kind = fishKind(name);
            return readyKinds.includes(kind);
          });
          for (const name of names) {
            let thisOk = !!await Trade.offerAll(name, offerNoted);
            if (!thisOk) {
              thisOk = !!await Trade.offerAll(name);
            }
            if (thisOk) {
              offeredOk = true;
            }
          }
        }
        if (!offeredOk) {
          this.log("mule: offerAll fish failed \u2014 declining");
          await Trade.decline();
          return;
        }
        await Execution.delayUntil(
          () => this.offerHasMuleFish() || Trade.onConfirmScreen() || !Trade.active(),
          MULE_TRADE_REQUEST_MS
        );
        continue;
      }
      await this.muleWaitAndAcceptScreen("offer");
    }
    if (Trade.active()) {
      this.status = "mule: finishing trade";
      this.log("mule: trade still open \u2014 keeping Accept until it closes");
      while (Trade.active()) {
        if (Trade.onConfirmScreen() || Trade.onOfferScreen()) {
          await Trade.accept();
        }
        await Execution.delayTicks(2);
      }
    }
    await Execution.delayTicks(3);
    if (Trade.active()) {
      this.log("mule: trade reopened \u2014 continuing Accepts");
      return;
    }
    const gone = before - muleFishHeldCount();
    if (gone > 0 || muleFishHeldCount() <= 0) {
      this.muled += Math.max(0, gone);
      this.muleTrips++;
      if (beforeTuna >= MULE_THRESHOLD) {
        this.lastBankTuna = 0;
      }
      if (beforeSword >= MULE_THRESHOLD) {
        this.lastBankSwordfish = 0;
      }
      this.lastBankFish = this.lastBankTuna + this.lastBankSwordfish;
      await this.resumeFishingAfterMule(
        `trade over \u2014 delivered ${gone > 0 ? gone : "all"} tuna/swordfish to ${MULE_NAME}`
      );
      return;
    }
    this.log("mule: trade over but fish still held \u2014 will re-request");
    this.nextMuleTradeRequestAtMs = Date.now() + MULE_TRADE_REQUEST_MS;
  }
  onPaint(ctx) {
    ensurePaintFont();
    const elapsed = Date.now() - this.startedAt;
    const hrs = elapsed / 36e5;
    const fishXp = Skills.xp("fishing") - this.fishXpAtStart;
    const cookXp = Skills.xp("cooking") - this.cookXpAtStart;
    const fishXph = hrs > 8e-3 ? fishXp / hrs : 0;
    const cookXph = hrs > 8e-3 ? cookXp / hrs : 0;
    const caughtPh = hrs > 8e-3 ? this.caught / hrs : 0;
    const cookedPh = hrs > 8e-3 ? this.cooked / hrs : 0;
    const soldPh = hrs > 8e-3 ? this.sold / hrs : 0;
    const muledPh = hrs > 8e-3 ? this.muled / hrs : 0;
    const mode = this.sellToHarry ? this.cookOnWay ? "cook\u2192Harry" : "sell\u2192Harry" : this.cookOnWay ? "cook\u2192bank" : "bank raw";
    const lines = [
      `Benzyme's Catherby Swordfish  Fish ${Skills.level("fishing")}  Cook ${Skills.level("cooking")}`,
      `time ${fmtElapsed(elapsed)}  \xB7  ${mode}  \xB7  ${this.status}`,
      `caught ${this.caught} (${fmtXph(caughtPh)}/hr)  cooked ${this.cooked} (${fmtXph(cookedPh)}/hr)` + (this.sellToHarry || this.sold > 0 ? `  sold ${this.sold} (${fmtXph(soldPh)}/hr)` : ""),
      `harpoon ${hasHarpoon() ? "yes" : "NO"}  bank ${this.bankTrips}` + (this.sellToHarry || this.sellTrips > 0 ? `  sells ${this.sellTrips}` : "") + `  Fish XP ${fmtXph(fishXph)}/hr` + (this.cookOnWay || cookXp > 0 ? `  Cook XP ${fmtXph(cookXph)}/hr` : "")
    ];
    if (this.muleWanted() || this.muleHandoffActive || this.muled > 0) {
      lines.push(
        this.muleHandoffActive ? `mule handoff \u2192 ${MULE_NAME}  noted ${fmtMuleCounts(notedCountForKind("tuna"), notedCountForKind("swordfish"))}` : `mule ${fmtMuleCounts(this.lastBankTuna, this.lastBankSwordfish)} \u2192 ${MULE_NAME}  sent ${this.muled} (${fmtXph(muledPh)}/hr)  trips ${this.muleTrips}`
      );
    }
    ctx.font = PAINT_FONT;
    let maxW = 0;
    for (const line of lines) {
      maxW = Math.max(maxW, ctx.measureText(line).width);
    }
    const pad = 6;
    const lineH = 18;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(6, 6, maxW + pad * 2, pad * 2 + lines.length * lineH);
    ctx.fillStyle = "#9bc47a";
    lines.forEach((line, i) => {
      ctx.fillText(line, 6 + pad, 6 + pad + (i + 1) * lineH - 4);
    });
  }
}
var CatherbySwordfish_default = defineBot({
  name: SCRIPT_NAME,
  version: "1.2.1",
  category: "Fishing",
  tags: ["fishing", "catherby", "harpoon", "tuna", "swordfish", "bank", "cook", "harry", "mule"],
  description: "Harpoons tuna and swordfish at Catherby. Optional cook, sell to Harry, or mule noted fish once a stack reaches 1000. Change MULE_NAME before using mule mode.",
  settingsSchema: {
    muleOn: {
      type: "boolean",
      default: true,
      label: "Mule mode",
      group: "Mule",
      help: "On by default. Keep fishing and banking tuna/swordfish (raw and cooked). Does not trade until tuna \u2265 1000 OR swordfish \u2265 1000 \u2014 mixed totals like 600 tuna + 500 swordfish will not mule. Then withdraws that type as notes at Catherby bank and trades them to eoc; the other type stays in the bank until it also hits 1000. After the trade, resume fishing. Pause \u2192 Edit parameters to toggle without stopping."
    },
    cookOnWay: {
      type: "boolean",
      default: true,
      label: "Cook on way to bank",
      group: "Cooking",
      help: "When the pack is full, cook Raw tuna (Cooking 30+) and Raw swordfish (Cooking 45+) on the Catherby bank-house Range, drop burnt, then bank or sell to Harry"
    },
    sellToHarry: {
      type: "boolean",
      default: false,
      label: "Sell to Harry",
      group: "Sell",
      help: "Sell Raw tuna / Raw swordfish to Harry at the Catherby fishing shop instead of banking, then return to harpoon fishing. Cooked leftovers (if cook-on-way is on) still bank. Restocks Harpoon from bank; buys one from Harry when bank has none."
    }
  },
  create: () => new CatherbySwordfish()
});
export {
  CatherbySwordfish_default as default
};
