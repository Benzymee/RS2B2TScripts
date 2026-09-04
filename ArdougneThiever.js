/**
 * ArdougneThiever. Pickpockets in East Ardougne.
 *
 * Load URL: https://cdn.jsdelivr.net/gh/Benzymee/RS2B2TScripts@main/ArdougneThiever.js
 */
const SUPPORTED_API_VERSION = 1;
const abi = globalThis.__rs2b0t;
if (!abi) {
  throw new Error("ArdougneThiever: globalThis.__rs2b0t missing \u2014 load inside rs2b0t bot.html");
}
if (abi.apiVersion !== SUPPORTED_API_VERSION) {
  throw new Error(
    `ArdougneThiever: ABI ${abi.apiVersion} != supported ${SUPPORTED_API_VERSION}`
  );
}
const {
  defineBot,
  Execution,
  Game,
  LoopingBot: LoopingBotBase,
  Npcs,
  Locs,
  Inventory,
  Equipment,
  Bank,
  Banking,
  Traversal,
  Tile,
  Skills,
  ChatDialog,
  Players,
  Trade,
  Shop,
  GroundItems,
  withdrawOp
} = abi;
const SCRIPT_NAME = "ArdougneThiever";
const WELCOME_SCREEN_ID = 5993;
function welcomeHost() {
  return globalThis.rs2b0t ?? null;
}
function stopScript() {
  const host = welcomeHost();
  if (typeof host?.stopScript === "function") {
    host.stopScript();
    return;
  }
  if (typeof host?.runner?.stop === "function") {
    host.runner.stop();
  }
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
    const main = reader.modals().main;
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
const PICKPOCKET_OP = "Pickpocket";
const STUN_RE = /been stunned|fail to pick/i;
const STUN_TICKS = 9;
const BANK_STAND = new Tile(2655, 3286, 0);
const COINS_ID = 995;
const COINS_NAME = "Coins";
const MULE_NAME = "Ben";
const MULE_STAND = new Tile(2653, 3284, 0);
const MULE_TRADE_RANGE = 2;
const BANK_MULE_LEASH = 8;
const MULE_GP_THRESHOLD = 1e5;
const MULE_TRADE_REQUEST_MS = 5e3;
const MULE_ACCEPT_WAIT_MIN_MS = 5e3;
const MULE_ACCEPT_WAIT_MAX_MS = 1e4;
const MULE_ACCEPT_RETRY_MS = 3e3;
function muleAcceptDelayMs() {
  return MULE_ACCEPT_WAIT_MIN_MS + Math.floor(Math.random() * (MULE_ACCEPT_WAIT_MAX_MS - MULE_ACCEPT_WAIT_MIN_MS + 1));
}
function isCoinsItem(item) {
  if (!item) {
    return false;
  }
  if (item.id === COINS_ID) {
    return true;
  }
  return (item.name ?? "").toLowerCase() === "coins";
}
const TARGETS = {
  Man: {
    name: "Man",
    /** Level-1 pickpockets in the houses — exact names only (not Warrior woman). */
    names: ["Man", "Woman"],
    npcId: null,
    thieving: 1,
    anchor: new Tile(2625, 3291, 0),
    leash: 14
  },
  "Warrior woman": {
    name: "Warrior woman",
    /** Classic / RS2B cache id. */
    npcId: 15,
    thieving: 25,
    anchor: new Tile(2630, 3297, 0),
    leash: 16
  },
  "Ardougne guard": {
    /** In-game NPC name to match (no id filter). */
    name: "Guard",
    npcId: null,
    thieving: 40,
    anchor: new Tile(2661, 3306, 0),
    leash: 19
  },
  "Ardougne Knights": {
    /** In-game NPC name — East Ardougne market knights. */
    name: "Knight of Ardougne",
    npcId: null,
    thieving: 55,
    anchor: new Tile(2662, 3305, 0),
    leash: 20
  },
  Paladin: {
    name: "Paladin",
    /** Classic / RS2B cache id. */
    npcId: 365,
    thieving: 70,
    /** East Ardougne castle — paladins are indoors; keep castle doors open. */
    keepDoorsOpen: true,
    doorRadius: 16,
    anchor: new Tile(2572, 3296, 0),
    leash: 22
  },
  Hero: {
    /** In-game NPC name — East Ardougne market / streets. */
    name: "Hero",
    npcId: null,
    thieving: 80,
    anchor: new Tile(2662, 3305, 0),
    leash: 24
  }
};
const TARGET_AUTO = "Auto";
const TARGET_OPTIONS = [TARGET_AUTO, ...Object.keys(TARGETS)];
function autoTargetKey(thieving) {
  const lvl = Math.max(1, Math.floor(Number(thieving) || 1));
  if (lvl >= 80) {
    return "Hero";
  }
  if (lvl >= 55) {
    return "Ardougne Knights";
  }
  if (lvl >= 40) {
    return "Ardougne guard";
  }
  if (lvl >= 25) {
    return "Warrior woman";
  }
  return "Man";
}
const FOOD_SLICE = "Slice of cake";
const FOOD_TWO_THIRDS = "2/3 cake";
const FOOD_CAKE = "Cake";
const FOOD_CHOC = "Chocolate slice";
const FOOD_SHRIMP = "Shrimps";
const FOOD_SHRIMP_ALT = "Shrimp";
const FOOD_ANCHOVY = "Anchovies";
const FOOD_ANCHOVY_ALT = "Anchovy";
const FOOD_TUNA = "Tuna";
const FOOD_LOBSTER = "Lobster";
const FOOD_TYPE_SHRIMP = "Shrimp / Anchovies";
const FOOD_TYPES = {
  Cake: {
    eat: [FOOD_SLICE, FOOD_TWO_THIRDS, FOOD_CAKE],
    withdraw: [FOOD_CAKE, FOOD_TWO_THIRDS, FOOD_SLICE],
    label: "cake"
  },
  "Chocolate slice": {
    eat: [FOOD_CHOC],
    withdraw: [FOOD_CHOC],
    label: "choc"
  },
  [FOOD_TYPE_SHRIMP]: {
    eat: [FOOD_SHRIMP, FOOD_SHRIMP_ALT, FOOD_ANCHOVY, FOOD_ANCHOVY_ALT],
    withdraw: [FOOD_SHRIMP, FOOD_SHRIMP_ALT, FOOD_ANCHOVY, FOOD_ANCHOVY_ALT],
    label: "shrimp"
  },
  Tuna: {
    eat: [FOOD_TUNA],
    withdraw: [FOOD_TUNA],
    label: "tuna"
  },
  Lobster: {
    eat: [FOOD_LOBSTER],
    withdraw: [FOOD_LOBSTER],
    label: "lobster"
  },
  None: {
    eat: [],
    withdraw: [],
    label: "off"
  }
};
const FOOD_OPTIONS = Object.keys(FOOD_TYPES);
const CATHERBY_BANK = new Tile(2809, 3441, 0);
const CATHERBY_SHORE = new Tile(2845, 3431, 0);
const CATHERBY_SHORE_LEASH = 35;
const CATHERBY_STAND_RADIUS = 8;
const CATHERBY_RANGE_STAND = new Tile(2817, 3443, 0);
const CATHERBY_RANGE_LOC = new Tile(2817, 3444, 0);
const CATHERBY_RANGE_LEASH = 8;
const HARRY_STAND = new Tile(2833, 3443, 0);
const HARRY_NAME = "Harry";
const POT_NAME = "Lobster pot";
const POT_COST = 20;
const FISHING_SPOT = "Fishing spot";
const CATCH_COOK_GOAL = 500;
const CATCH_COOK_FISH_LVL = 40;
const CATCH_COOK_COOK_LVL = 40;
const CAKE_STALL_STAND = new Tile(2667, 3310, 0);
const CAKE_STALL_MARKET_RADIUS = 40;
const CAKE_STALL_FLEE = new Tile(2661, 3284, 0);
const CAKE_STALL_LOCKOUT_TICKS = 8;
const CAKE_STALL_GOAL = 200;
const CAKE_STALL_NAMES = ["Baker's stall", "Baker stall", "Bakery stall"];
function invCountWhere(pred) {
  return Inventory.items().filter((i) => pred(i.name)).reduce((n, i) => n + Math.max(1, i.count), 0);
}
function isRawLobster(name) {
  return (name ?? "").toLowerCase() === "raw lobster";
}
function isCookedLobster(name) {
  const n = (name ?? "").toLowerCase().trim();
  if (!n || n.startsWith("raw ") || n.startsWith("burnt ")) {
    return false;
  }
  return n === "lobster";
}
function isBurntFish(name) {
  const n = (name ?? "").toLowerCase();
  return n.startsWith("burnt ") || n === "burnt fish" || n === "burnt lobster";
}
function isLobsterPot(name) {
  return (name ?? "").toLowerCase() === "lobster pot";
}
function isCatchCookKeep(name) {
  return isLobsterPot(name) || (name ?? "").toLowerCase() === "coins";
}
function catchCookHasPot() {
  return Inventory.items().some((i) => isLobsterPot(i.name));
}
function rawLobsterCount() {
  return invCountWhere(isRawLobster);
}
function cookedLobsterCount() {
  return invCountWhere(isCookedLobster);
}
function cookableLobsterCount() {
  if (Skills.level("cooking") < CATCH_COOK_COOK_LVL) {
    return 0;
  }
  return rawLobsterCount();
}
function burntFishCount() {
  return invCountWhere(isBurntFish);
}
function lastCookableRawLobster() {
  const items = Inventory.items();
  for (let i = items.length - 1; i >= 0; i--) {
    if (isRawLobster(items[i].name) && Skills.level("cooking") >= CATCH_COOK_COOK_LVL) {
      return items[i];
    }
  }
  return null;
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
function isAnimating() {
  return typeof Game.animating === "function" && Game.animating();
}
function isMakeMenuOpen() {
  return typeof ChatDialog.isMakeMenu === "function" && ChatDialog.isMakeMenu();
}
function fmtXph(n) {
  if (n >= 1e5) {
    return `${(n / 1e3).toFixed(0)}k`;
  }
  if (n >= 1e4) {
    return `${(n / 1e3).toFixed(1)}k`;
  }
  return String(Math.round(n));
}
function fmtGp(n) {
  const v = Math.max(0, Math.round(n));
  if (v >= 1e6) {
    return `${(v / 1e6).toFixed(2)}m`;
  }
  if (v >= 1e5) {
    return `${(v / 1e3).toFixed(0)}k`;
  }
  if (v >= 1e4) {
    return `${(v / 1e3).toFixed(1)}k`;
  }
  return String(v);
}
function invCoins() {
  return Inventory.items().filter((i) => isCoinsItem(i)).reduce((n, i) => n + Math.max(0, i.count), 0);
}
function bankCoins() {
  const items = typeof Bank.items === "function" ? Bank.items() ?? [] : [];
  const fromItems = items.filter((i) => isCoinsItem(i)).reduce((n, i) => n + Math.max(0, i.count), 0);
  if (fromItems > 0) {
    return fromItems;
  }
  if (typeof Bank.count === "function") {
    return Bank.count(COINS_NAME) || Bank.count("Coins") || 0;
  }
  return 0;
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
function nameEq(a, b) {
  return (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
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
function isCakeFoodName(name) {
  const n = (name ?? "").toLowerCase();
  return n === "cake" || n === "2/3 cake" || n === "slice of cake";
}
function carriedCakes() {
  return Inventory.items().filter((i) => isCakeFoodName(i.name)).reduce((n, i) => n + Math.max(0, i.count), 0);
}
function stealFromOp(loc) {
  const acts = typeof loc.actions === "function" ? loc.actions() : [];
  return acts.find((a) => /steal/i.test(a ?? "")) ?? null;
}
function needsHouseDoors(cfg) {
  if (cfg?.keepDoorsOpen === true) {
    return true;
  }
  const names = cfg?.names ?? (cfg?.name ? [cfg.name] : []);
  return names.some((n) => {
    const k = (n ?? "").toLowerCase();
    return k === "man" || k === "woman";
  });
}
function targetNames(cfg) {
  if (Array.isArray(cfg?.names) && cfg.names.length > 0) {
    return cfg.names;
  }
  return cfg?.name ? [cfg.name] : [];
}
class ArdougneThiever extends LoopingBotBase {
  status = "starting";
  /** Dropdown value — Auto, or a TARGETS key. */
  targetPref = TARGET_AUTO;
  /** Resolved TARGETS key actually being pickpocketed. */
  targetKey = "Man";
  /** Eat (with food) or wait for regen (waitForHp, no food) at/below this HP. */
  eatAtHp = 10;
  /** When food is off: pause pickpocketing until HP regenerates above eatAtHp. */
  waitForHp = false;
  /** Dropdown: Cake | Chocolate slice | Shrimp / Anchovies | Tuna | Lobster | None. */
  foodType = "Cake";
  /** How many of the selected food to withdraw when restocking. */
  foodWithdraw = 20;
  /** When selected food is gone from the bank: Catherby cage+cook 500 lobsters. */
  catchAndCook = true;
  /** When Food is Cake and bank cakes are gone: steal from Baker stall until 200. */
  stealCakes = true;
  bankTrips = 0;
  /** Catch-and-cook trip in progress. */
  catchCookActive = false;
  /** Pot withdrawn and ready to cage at Catherby shore. */
  catchCookReady = false;
  /** Mid Range cook of a full inventory. */
  catchCookCookingLoad = false;
  /** Successfully cooked lobsters this catch-and-cook trip. */
  catchCookCooked = 0;
  /** Raw lobsters caught this catch-and-cook trip. */
  catchCookCaught = 0;
  catchCookLastRaw = 0;
  catchCookTrips = 0;
  /** Baker stall restock in progress. */
  stealCakesActive = false;
  /** Cakes deposited this Baker stall trip. */
  stealCakesBanked = 0;
  stealCakesTrips = 0;
  stealCakesCombatEndTick = 0;
  /** False until start bank + food withdraw finishes. */
  startReady = false;
  /** Preference: mule Coins to Ben at East Ardougne bank when banked gp exceeds 100k. */
  muleMode = true;
  /** GP traded to Ben this session. */
  muled = 0;
  muleTrips = 0;
  /** Mule: mid handoff (walk to bank → trade Ben). */
  muleHandoffActive = false;
  /** Mule: at the bank stand and ready to Trade.request Ben. */
  muleReadyToTrade = false;
  /** Mule: already printed the handoff plan line. */
  muleAnnounced = false;
  /** Earliest wall-clock time we may call Trade.request again. */
  nextMuleTradeRequestAtMs = 0;
  steals = 0;
  fails = 0;
  eats = 0;
  /** Coins gained from successful pickpockets this session. */
  gpStolen = 0;
  /** Last known Coins stack in the bank (updated whenever bank is open). */
  bankGp = 0;
  startedAt = 0;
  xpAtStart = 0;
  stunnedUntilTick = 0;
  unlockTimer = null;
  targetCfg() {
    return TARGETS[this.targetKey] ?? TARGETS.Man;
  }
  async onStart() {
    await Execution.delayUntil(() => Game.ingame() && Game.tile() !== null, 0);
    Traversal.preload();
    this.startPausedPrefUnlock();
    this.syncPrefs({ silent: true });
    this.startedAt = Date.now();
    this.xpAtStart = Skills.xp("thieving");
    this.steals = 0;
    this.fails = 0;
    this.eats = 0;
    this.gpStolen = 0;
    this.bankGp = 0;
    this.bankTrips = 0;
    this.startReady = false;
    this.stunnedUntilTick = 0;
    this.muled = 0;
    this.muleTrips = 0;
    this.muleHandoffActive = false;
    this.muleReadyToTrade = false;
    this.muleAnnounced = false;
    this.nextMuleTradeRequestAtMs = 0;
    this.catchCookActive = false;
    this.catchCookReady = false;
    this.catchCookCookingLoad = false;
    this.catchCookCooked = 0;
    this.catchCookCaught = 0;
    this.catchCookLastRaw = 0;
    this.catchCookTrips = 0;
    this.stealCakesActive = false;
    this.stealCakesBanked = 0;
    this.stealCakesTrips = 0;
    this.stealCakesCombatEndTick = 0;
    this.on("chat.message", (e) => {
      if (STUN_RE.test(e.text)) {
        this.stunnedUntilTick = Game.tick() + STUN_TICKS;
        this.fails++;
      }
    });
    this.on("skill.level", (e) => {
      if (e.name === "thieving") {
        this.log(`thieving ${e.previous} \u2192 ${e.level}`);
        this.applyAutoTarget({ silent: false, level: e.level });
      }
    });
    this.applyAutoTarget({ silent: false });
    const cfg = this.targetCfg();
    const need = cfg.thieving;
    const have = Skills.level("thieving");
    if (have < need) {
      this.log(
        `WARNING: ${cfg.name} needs Thieving ${need} (you have ${have}) \u2014 will keep trying`
      );
    }
    this.log(
      `Benzyme's Ardougne Thiever \u2014 bank only if food < withdraw amount, then ` + (this.targetPref === TARGET_AUTO ? `auto (Thieving ${have}) ` : "") + `${cfg.name} @ ${cfg.anchor.x},${cfg.anchor.z}` + (cfg.npcId != null ? ` (id ${cfg.npcId})` : "") + `; HP \u2264 ${this.eatAtHp}` + (this.foodEnabled() ? ` eat; food ${this.describeFoodPrefs()} \xD7${this.foodWithdraw}` : this.waitForHp ? " wait regen (no food)" : `; food ${this.describeFoodPrefs()}`) + `; steal cakes ${this.stealCakesWanted() ? "on" : "off"}` + (this.stealCakesWanted() ? ` (${CAKE_STALL_GOAL} from Baker stall when bank has no cake)` : "") + `; catch & cook ${this.catchAndCookWanted() ? "on" : "off"}` + (this.catchAndCookWanted() ? ` (${CATCH_COOK_GOAL} lobsters at Catherby when bank has no Lobster)` : this.stealCakesWanted() ? "" : " (will stop if bank food is gone)") + (this.muleWanted() ? `; mule when bank Coins (id ${COINS_ID}) > ${fmtGp(MULE_GP_THRESHOLD)} \u2192 withdraw all \u2192 ${MULE_NAME} @ ${MULE_STAND.x},${MULE_STAND.z}` : "")
    );
    this.status = "start: bank";
  }
  onPause() {
    unlockPausedPrefsUi();
  }
  onResume() {
    this.syncPrefs({ silent: false });
  }
  onStop() {
    this.stopPausedPrefUnlock();
    this.log(
      `stopped \u2014 ${this.steals} steals, ${this.fails} fails, ${this.eats} eats, GP stolen ${fmtGp(this.gpStolen)}, bank ${fmtGp(this.bankGp)}gp, muled ${fmtGp(this.muled)}gp (${this.muleTrips} trips), catch & cook ${this.catchCookTrips} trips (${this.catchCookCooked} cooked), steal cakes ${this.stealCakesTrips} trips (${this.stealCakesBanked} cakes), ${this.bankTrips} bank trips (${this.status})`
    );
  }
  startPausedPrefUnlock() {
    this.stopPausedPrefUnlock();
    this.unlockTimer = setInterval(() => unlockPausedPrefsUi(), 500);
  }
  stopPausedPrefUnlock() {
    if (this.unlockTimer !== null) {
      clearInterval(this.unlockTimer);
      this.unlockTimer = null;
    }
  }
  syncPrefs(opts = {}) {
    const silent = opts.silent === true;
    const prevTarget = this.targetKey;
    const prevPref = this.targetPref;
    let target = readPrefStr("target", this.targetPref);
    if (target === "ardy knights") {
      target = "Ardougne Knights";
    }
    const auto = !target || target.toLowerCase() === "auto" || target === TARGET_AUTO;
    if (auto) {
      this.targetPref = TARGET_AUTO;
      this.applyAutoTarget({ silent: true });
    } else if (TARGETS[target]) {
      this.targetPref = target;
      this.targetKey = target;
    } else {
      this.targetPref = TARGET_AUTO;
      this.applyAutoTarget({ silent: true });
    }
    this.eatAtHp = Math.max(1, Math.min(30, Math.round(readPrefNum("eatAtHp", this.eatAtHp))));
    this.waitForHp = readPrefBool("waitForHp", this.waitForHp);
    this.foodType = this.readFoodTypePref();
    this.foodWithdraw = Math.max(
      1,
      Math.min(27, Math.round(readPrefNum("foodWithdraw", this.foodWithdraw)))
    );
    this.muleMode = readPrefBool(
      "muleOn",
      typeof this.settings?.bool === "function" ? this.settings.bool("muleOn", true) : true
    );
    this.catchAndCook = readPrefBool(
      "catchAndCook",
      typeof this.settings?.bool === "function" ? this.settings.bool("catchAndCook", true) : true
    );
    this.stealCakes = readPrefBool(
      "stealCakes",
      typeof this.settings?.bool === "function" ? this.settings.bool("stealCakes", true) : true
    );
    if (!silent && (prevTarget !== this.targetKey || prevPref !== this.targetPref)) {
      const cfg = this.targetCfg();
      const how = this.targetPref === TARGET_AUTO ? "auto " : "";
      this.log(`target \u2192 ${how}${cfg.name} (need Thieving ${cfg.thieving})`);
    }
  }
  /**
   * When the dropdown is Auto, pick Men / Warrior woman / Guard / Knight / Hero from Thieving.
   * @param {{ silent?: boolean, level?: number }} [opts]
   */
  applyAutoTarget(opts = {}) {
    if (this.targetPref !== TARGET_AUTO) {
      return false;
    }
    const silent = opts.silent === true;
    let have = opts.level;
    if (have == null) {
      if (typeof Game?.ingame === "function" && !Game.ingame()) {
        return false;
      }
      have = typeof Skills?.level === "function" ? Skills.level("thieving") : 1;
    }
    const next = autoTargetKey(have);
    if (next === this.targetKey) {
      return false;
    }
    this.targetKey = next;
    if (!silent) {
      const cfg = this.targetCfg();
      this.log(
        `auto: Thieving ${have} \u2192 ${cfg.name} (need ${cfg.thieving}) @ ${cfg.anchor.x},${cfg.anchor.z}`
      );
    }
    return true;
  }
  /**
   * Food dropdown, with a one-time migration from the old Use Cake / Chocolate checkboxes.
   */
  readFoodTypePref() {
    const raw = readPrefStr("foodType", "");
    if (raw && FOOD_TYPES[raw]) {
      return raw;
    }
    const useCake = readPrefBool("useCake", true);
    const useChoc = readPrefBool("useChocolate", true);
    if (useCake) {
      return "Cake";
    }
    if (useChoc) {
      return "Chocolate slice";
    }
    return "None";
  }
  foodCfg() {
    return FOOD_TYPES[this.foodType] ?? FOOD_TYPES.Cake;
  }
  describeFoodPrefs() {
    return this.foodCfg().label;
  }
  /** Eat leftovers first for cake; otherwise the selected item. Always fall back to Lobster. */
  foodPriorityNames() {
    if (!this.foodEnabled()) {
      return [];
    }
    const names = this.foodCfg().eat.slice();
    if (!names.some((n) => (n ?? "").toLowerCase() === "lobster")) {
      names.push(FOOD_LOBSTER);
    }
    return names;
  }
  foodEnabled() {
    return this.foodType !== "None" && this.foodCfg().eat.length > 0;
  }
  findBestFood() {
    for (const name of this.foodPriorityNames()) {
      const item = Inventory.items().find((i) => nameEq(i.name, name));
      if (item) {
        return item;
      }
    }
    return null;
  }
  foodCount() {
    const allowed = new Set(this.foodPriorityNames().map((n) => n.toLowerCase()));
    return Inventory.items().filter((i) => allowed.has((i.name ?? "").toLowerCase())).reduce((n, i) => n + Math.max(1, i.count), 0);
  }
  needEat() {
    if (!this.foodEnabled()) {
      return false;
    }
    if (!this.findBestFood()) {
      return false;
    }
    return Skills.effective("hitpoints") <= this.eatAtHp;
  }
  /**
   * No-food mode: when waitForHp is on, pause thieving until HP regenerates above eatAtHp.
   * Ignored while a food type is selected (eating / banking handle HP instead).
   */
  needHpWait() {
    if (!this.waitForHp || this.foodEnabled()) {
      return false;
    }
    return Skills.effective("hitpoints") <= this.eatAtHp;
  }
  /** Primary bank item name for logs (selected food). */
  withdrawFoodName() {
    if (!this.foodEnabled()) {
      return null;
    }
    return this.foodCfg().withdraw[0] ?? this.foodType;
  }
  /** Selected food first, then cooked Lobster so a full lobster bank is never treated as empty. */
  activeWithdrawNames() {
    if (!this.foodEnabled()) {
      return [];
    }
    const names = this.foodCfg().withdraw.slice();
    if (!names.some((n) => (n ?? "").toLowerCase() === "lobster")) {
      names.push(FOOD_LOBSTER);
    }
    return names;
  }
  /** Cooked Lobster in the open bank. Exact name only — not Lobster pot. */
  bankedLobsterCount() {
    if (!Bank.isOpen()) {
      return 0;
    }
    const items = typeof Bank.items === "function" ? Bank.items() ?? [] : [];
    return items.filter((i) => isCookedLobster(i.name)).reduce((n, i) => n + Math.max(0, i.count), 0);
  }
  /** Bank open: start Catherby if Catch and cook is on and there are no cooked Lobsters. */
  async maybeBeginCatchCookFromOpenBank(context) {
    if (this.stealCakesWanted()) {
      return false;
    }
    if (!this.catchAndCookWanted()) {
      return false;
    }
    const lobsters = this.bankedLobsterCount();
    if (lobsters > 0) {
      return false;
    }
    this.log(`${context}: no Lobster in bank \u2014 starting catch & cook`);
    if (Bank.isOpen()) {
      await Bank.close();
    }
    await this.tryCatchCookOrStop(context);
    return true;
  }
  /**
   * Build a withdraw list filling up to `amount` from `names` in order (may mix cake leftovers).
   * @returns {{ name: string, take: number }[]}
   */
  buildWithdrawPlan(names, amount) {
    let need = Math.max(0, amount);
    let free = Inventory.free();
    const plan = [];
    for (const name of names) {
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
  /**
   * Bank open: withdraw the selected food (Cake → 2/3 → Slice; Shrimp / Anchovies → Anchovies).
   * @returns {{ name: string, take: number }[] | null} plan, or null if no food in bank
   */
  resolveWithdrawPlan(amount) {
    if (!this.foodEnabled() || amount <= 0) {
      return null;
    }
    const plan = this.buildWithdrawPlan(this.activeWithdrawNames(), amount);
    if (plan.length > 0) {
      if (this.foodType === "Cake" && plan[0].name !== FOOD_CAKE) {
        this.log(
          `no ${FOOD_CAKE} in bank \u2014 withdrawing ${plan.map((p) => `${p.take}\xD7 ${p.name}`).join(", ")}`
        );
      } else if (this.foodType === FOOD_TYPE_SHRIMP && !nameEq(plan[0].name, FOOD_SHRIMP) && !nameEq(plan[0].name, FOOD_SHRIMP_ALT)) {
        this.log(
          `no ${FOOD_SHRIMP} in bank \u2014 withdrawing ${plan.map((p) => `${p.take}\xD7 ${p.name}`).join(", ")}`
        );
      } else if (this.foodType !== FOOD_LOBSTER && nameEq(plan[0].name, FOOD_LOBSTER)) {
        this.log(
          `no ${this.foodType} in bank \u2014 withdrawing ${plan.map((p) => `${p.take}\xD7 ${p.name}`).join(", ")} (${this.bankedLobsterCount()} Lobster in bank)`
        );
      }
      return plan;
    }
    return null;
  }
  /** Withdraw according to resolveWithdrawPlan. @returns {Promise<boolean>} */
  async withdrawResolvedFood(amount) {
    const plan = this.resolveWithdrawPlan(amount);
    if (!plan || plan.length === 0) {
      return false;
    }
    for (const { name, take } of plan) {
      this.log(`withdrawing ${take}\xD7 ${name}`);
      if (!await Bank.withdrawX(name, take)) {
        this.log(`withdraw failed for ${name}`);
        return false;
      }
      await Execution.delayTicks(1);
    }
    return true;
  }
  /**
   * Selected food missing from bank. Catch-and-cook: go to Catherby instead of stopping.
   */
  async stopNoFood(context) {
    if (this.stealCakesWanted()) {
      if (this.stealCakesActive) {
        this.log(`${context}: still stealing cakes \u2014 not stopping`);
        await this.stealCakesTick();
        return;
      }
      this.log(`${context}: no cake in bank \u2014 Baker stall instead of stopping`);
      this.beginStealCakes(context);
      await this.stealCakesTick();
      return;
    }
    if (this.catchAndCookWanted()) {
      if (this.catchCookActive) {
        this.log(`${context}: still on catch & cook \u2014 not stopping`);
        await this.catchCookTick();
        return;
      }
      this.log(`${context}: no Lobster in bank \u2014 catch & cook instead of stopping`);
      this.beginCatchCook(context);
      await this.catchCookTick();
      return;
    }
    this.status = "no food \u2014 stopped";
    const names = this.activeWithdrawNames().join(" / ") || this.foodType;
    this.log(`${context}: no ${names} in bank \u2014 stopping (restock food, then restart)`);
    stopScript();
  }
  catchAndCookWanted() {
    return this.catchAndCook === true;
  }
  stealCakesWanted() {
    return this.foodType === "Cake" && this.stealCakes === true;
  }
  /**
   * No cooked Lobster in bank: start a Catherby catch-and-cook trip.
   * Never stops the script — low Fishing/Cooking is a warning, not a halt.
   * @returns {Promise<boolean>} true if a catch-and-cook trip started
   */
  async tryCatchCookOrStop(context) {
    if (!this.catchAndCookWanted()) {
      await this.stopNoFood(context);
      return false;
    }
    const fish = Skills.level("fishing");
    const cook = Skills.level("cooking");
    if (fish < CATCH_COOK_FISH_LVL || cook < CATCH_COOK_COOK_LVL) {
      this.log(
        `${context}: WARNING catch & cook needs Fishing ${CATCH_COOK_FISH_LVL} and Cooking ${CATCH_COOK_COOK_LVL} (have ${fish}/${cook}) \u2014 going to Catherby anyway`
      );
    }
    this.beginCatchCook(context);
    await this.catchCookTick();
    return true;
  }
  needFoodBank() {
    return this.foodEnabled() && this.foodCount() === 0;
  }
  /** True when inventory already has at least foodWithdraw of enabled food. */
  hasEnoughStartFood() {
    return this.foodEnabled() && this.foodCount() >= this.foodWithdraw;
  }
  /** Snapshot bank Coins while the bank interface is open. */
  refreshBankGp() {
    if (!Bank.isOpen()) {
      return;
    }
    this.bankGp = bankCoins();
  }
  isKeepOnDeposit(name) {
    const n = (name ?? "").toLowerCase();
    if (!n) {
      return false;
    }
    return this.foodPriorityNames().some((f) => f.toLowerCase() === n);
  }
  stunned() {
    return Game.tick() <= this.stunnedUntilTick;
  }
  async loop() {
    this.syncPrefs({ silent: true });
    unlockPausedPrefsUi();
    if (!Game.ingame()) {
      await Execution.delayTicks(5);
      return;
    }
    if (await dismissWelcomeScreen()) {
      this.status = "close welcome";
      return;
    }
    if (ChatDialog.canContinue() && !isMakeMenuOpen()) {
      this.status = "continue dialog";
      await ChatDialog.continue();
      return;
    }
    if (this.stealCakesActive) {
      await this.stealCakesTick();
      return;
    }
    if (this.catchCookActive) {
      await this.catchCookTick();
      return;
    }
    if (!this.startReady) {
      await this.prepStartBank();
      return;
    }
    if (this.muleHandoffActive) {
      await this.muleTick();
      return;
    }
    if (Bank.isOpen() && !this.needFoodBank()) {
      await Bank.close();
      return;
    }
    if (this.needEat()) {
      await this.eatFood();
      return;
    }
    if (this.needMule()) {
      this.beginMuleHandoff();
      await this.muleTick();
      return;
    }
    if (this.needFoodBank()) {
      await this.bankFoodRestock();
      return;
    }
    if (this.needHpWait()) {
      const hp = Skills.effective("hitpoints");
      this.status = `HP ${hp} \u2014 regen above ${this.eatAtHp}`;
      await Execution.delayTicks(2);
      return;
    }
    if (this.stunned()) {
      this.status = "stunned";
      await Execution.delayTicks(1);
      return;
    }
    if (await this.escapeIfStuckBehindDoor()) {
      return;
    }
    const cfg = this.targetCfg();
    const here = Game.tile();
    if (!here) {
      await Execution.delayTicks(2);
      return;
    }
    if (Tile.from(here).distanceTo(cfg.anchor) > cfg.leash) {
      this.status = `walking to ${cfg.name}`;
      await Traversal.walkResilient(cfg.anchor, {
        radius: 4,
        log: (m) => this.log(`  ${m}`)
      });
      if (needsHouseDoors(cfg)) {
        await this.clearDoorsForMan(cfg.anchor);
      }
      return;
    }
    if (Game.inCombat()) {
      this.status = "in combat \u2014 waiting";
      await Execution.delayTicks(2);
      return;
    }
    const npc = this.findTarget();
    if (!npc) {
      this.status = `waiting for ${targetNames(cfg).join(" / ")}`;
      if (await this.escapeIfStuckBehindDoor()) {
        return;
      }
      await Traversal.walkTo(cfg.anchor, { radius: 3, timeoutMs: 8e3 });
      if (needsHouseDoors(cfg)) {
        await this.clearDoorsForMan(cfg.anchor);
      } else {
        await this.openNearbyDoor();
      }
      await Execution.delayTicks(2);
      return;
    }
    if (needsHouseDoors(cfg)) {
      if (npc.distance() > 1) {
        await this.clearDoorsToward(npc.tile());
      } else if (this.findAdjacentShutDoor(2)) {
        this.status = "keeping door open";
        await this.openNearbyDoor({ within: 2 });
      }
    }
    await this.pickpocket(npc);
  }
  findTarget() {
    const cfg = this.targetCfg();
    const names = targetNames(cfg).map((n) => n.toLowerCase());
    let q = Npcs.query().action(PICKPOCKET_OP).within(cfg.leash + 4).where((n) => names.includes((n.name ?? "").toLowerCase())).where((n) => !n.inCombat);
    if (cfg.npcId != null) {
      q = q.where((n) => n.id === cfg.npcId);
    }
    return q.nearest();
  }
  /**
   * Script start: if inventory already has foodWithdraw of enabled food, skip bank
   * (unless mule is on — then we still bank to snapshot Coins).
   * With food off (wait-for-HP / no cakes), skip bank unless mule is on.
   * Otherwise unequip → deposit inventory → withdraw food → go thieve.
   */
  async prepStartBank() {
    if (!this.foodEnabled() && !this.muleWanted()) {
      this.startReady = true;
      const cfg2 = this.targetCfg();
      this.status = `walking to ${cfg2.name}`;
      this.log(
        `start: food off` + (this.waitForHp ? ` (wait HP \u2264 ${this.eatAtHp})` : "") + ` \u2014 skipping bank, walking to ${cfg2.anchor.x},${cfg2.anchor.z} for ${cfg2.name}`
      );
      await Traversal.walkResilient(cfg2.anchor, {
        radius: 3,
        log: (m) => this.log(`  ${m}`)
      });
      if (needsHouseDoors(cfg2)) {
        await this.clearDoorsForMan(cfg2.anchor);
      }
      return;
    }
    if (this.hasEnoughStartFood() && !this.muleWanted()) {
      this.startReady = true;
      const cfg2 = this.targetCfg();
      this.status = `walking to ${cfg2.name}`;
      this.log(
        `start: already have ${this.foodCount()} food (\u2265 ${this.foodWithdraw}) \u2014 skipping bank, walking to ${cfg2.anchor.x},${cfg2.anchor.z} for ${cfg2.name}`
      );
      await Traversal.walkResilient(cfg2.anchor, {
        radius: 3,
        log: (m) => this.log(`  ${m}`)
      });
      if (needsHouseDoors(cfg2)) {
        await this.clearDoorsForMan(cfg2.anchor);
      }
      return;
    }
    if (this.muleWanted() && (!this.foodEnabled() || this.hasEnoughStartFood())) {
      await this.prepStartMuleSnapshot();
      return;
    }
    this.status = "start: bank";
    for (const worn of Equipment.items()) {
      const name = worn.name;
      if (!name) {
        continue;
      }
      this.log(`start: unequipping ${name}`);
      if (!await Equipment.unequip(name)) {
        this.log(`start: could not unequip ${name}`);
        await Execution.delayTicks(1);
        return;
      }
      await Execution.delayTicks(1);
    }
    if (!Bank.isOpen()) {
      this.log("start: opening bank \u2014 deposit all, then withdraw food");
      if (!await Banking.open({
        stand: BANK_STAND,
        log: (m) => this.log(`  ${m}`)
      })) {
        this.log("start: could not open bank \u2014 retrying");
        await Execution.delayTicks(3);
        return;
      }
    }
    if (typeof Bank.loaded === "function") {
      await Execution.delayUntil(() => Bank.loaded() || Bank.items().length > 0, 3e3);
    }
    await Execution.delayTicks(1);
    this.log("start: depositing inventory");
    if (typeof Bank.depositInventory === "function") {
      await Bank.depositInventory();
    } else {
      await Bank.depositAllMatching(() => true);
    }
    await Execution.delayTicks(1);
    this.refreshBankGp();
    this.log(`start: bank ${this.bankedLobsterCount()} Lobster`);
    if (await this.maybeBeginStealCakesFromOpenBank("start")) {
      return;
    }
    if (await this.maybeBeginCatchCookFromOpenBank("start")) {
      return;
    }
    if (this.foodEnabled() && this.foodWithdraw > 0) {
      const need = Math.min(this.foodWithdraw, Inventory.free());
      if (!await this.withdrawResolvedFood(need)) {
        if (this.stealCakesWanted()) {
          this.log("start: cake withdraw failed \u2014 retrying");
          await Execution.delayTicks(2);
          return;
        }
        if (this.catchAndCookWanted()) {
          this.log("start: Lobster withdraw failed \u2014 retrying");
          await Execution.delayTicks(2);
          return;
        }
        await Bank.close();
        await this.stopNoFood("start");
        return;
      }
    }
    this.refreshBankGp();
    this.bankTrips++;
    this.startReady = true;
    if (this.maybeBeginMuleFromBank()) {
      return;
    }
    await Bank.close();
    const cfg = this.targetCfg();
    this.status = `walking to ${cfg.name}`;
    this.log(
      `start done \u2014 walking to ${cfg.anchor.x},${cfg.anchor.z}` + (cfg.npcId != null ? ` for ${cfg.name} (id ${cfg.npcId})` : ` for ${cfg.name}`) + ` (bank ${fmtGp(this.bankGp)}gp)`
    );
    await Traversal.walkResilient(cfg.anchor, {
      radius: 3,
      log: (m) => this.log(`  ${m}`)
    });
    if (needsHouseDoors(cfg)) {
      await this.clearDoorsForMan(cfg.anchor);
    }
  }
  /**
   * Mule on but food already sorted: open bank, deposit pack Coins, snapshot.
   * Starts a handoff immediately if banked gp is over the threshold.
   */
  async prepStartMuleSnapshot() {
    this.status = "start: bank gp";
    if (!Bank.isOpen()) {
      this.log("start: mule on \u2014 opening bank to check Coins (id 995)");
      if (!await Banking.open({
        stand: MULE_STAND,
        log: (m) => this.log(`  ${m}`)
      })) {
        this.log("start: could not open bank \u2014 retrying");
        await Execution.delayTicks(3);
        return;
      }
    }
    if (typeof Bank.loaded === "function") {
      await Execution.delayUntil(() => Bank.loaded() || Bank.items().length > 0, 3e3);
    }
    await Execution.delayTicks(1);
    if (invCoins() > 0) {
      this.log(`start: depositing ${fmtGp(invCoins())}gp`);
      if (typeof Bank.depositAllMatching === "function") {
        await Bank.depositAllMatching((name) => (name ?? "").toLowerCase() === "coins");
      }
      await Execution.delayTicks(1);
    }
    this.refreshBankGp();
    this.bankTrips++;
    this.startReady = true;
    if (this.maybeBeginMuleFromBank()) {
      return;
    }
    await Bank.close();
    const cfg = this.targetCfg();
    this.status = `walking to ${cfg.name}`;
    this.log(
      `start: bank ${fmtGp(this.bankGp)}gp (\u2264 ${fmtGp(MULE_GP_THRESHOLD)}) \u2014 walking to ${cfg.anchor.x},${cfg.anchor.z}`
    );
    await Traversal.walkResilient(cfg.anchor, {
      radius: 3,
      log: (m) => this.log(`  ${m}`)
    });
    if (needsHouseDoors(cfg)) {
      await this.clearDoorsForMan(cfg.anchor);
    }
  }
  async pickpocket(npc) {
    const beforeXp = Skills.xp("thieving");
    const coinsBefore = invCoins();
    const t = npc.tile();
    this.status = `pickpocket ${npc.name ?? "NPC"} (${npc.distance()}t)`;
    this.log(`Pickpocket ${npc.name} @ ${t.x},${t.z}`);
    if (!await npc.interact(PICKPOCKET_OP)) {
      if (needsHouseDoors(this.targetCfg())) {
        await this.clearDoorsToward(t);
      } else {
        await this.openNearbyDoor();
      }
      await Execution.delayTicks(1);
      return;
    }
    const ok = await Execution.delayUntil(
      () => Skills.xp("thieving") > beforeXp || this.stunned() || Game.inCombat() || ChatDialog.canContinue(),
      4e3
    );
    if (Skills.xp("thieving") > beforeXp) {
      this.steals++;
      const gained = invCoins() - coinsBefore;
      if (gained > 0) {
        this.gpStolen += gained;
      }
      return;
    }
    if (!ok) {
      this.log("pickpocket did not resolve \u2014 retrying");
    }
  }
  async eatFood() {
    const food = this.findBestFood();
    if (!food) {
      return;
    }
    const before = Skills.effective("hitpoints");
    this.status = `eating ${food.name}`;
    this.log(`HP ${before} \u2264 ${this.eatAtHp} \u2014 Eat ${food.name}`);
    if (!await food.interact("Eat")) {
      await Execution.delayTicks(1);
      return;
    }
    if (await Execution.delayUntil(() => Skills.effective("hitpoints") > before, 3e3)) {
      this.eats++;
    }
  }
  /**
   * Out of food → East Ardougne bank, deposit junk, withdraw foodWithdraw of the selected food.
   * Cake order: Cake → 2/3 cake → Slice of cake. Shrimp / Anchovies: Shrimps → Anchovies.
   * If the selected food is not in bank, catch-and-cook at Catherby or stop.
   */
  async bankFoodRestock() {
    if (!this.foodEnabled()) {
      return;
    }
    this.status = "banking food";
    const cfg = this.targetCfg();
    const prefer = this.withdrawFoodName();
    const extraFood = this.foodType === "Cake" ? ` / ${FOOD_TWO_THIRDS} / ${FOOD_SLICE}` : this.foodType === FOOD_TYPE_SHRIMP ? ` / ${FOOD_ANCHOVY}` : "";
    if (!Bank.isOpen()) {
      this.log(
        `out of food \u2014 banking, withdraw up to ${this.foodWithdraw}\xD7 ${prefer}${extraFood}`
      );
      if (!await Banking.open({
        stand: BANK_STAND,
        log: (m) => this.log(`  ${m}`)
      })) {
        this.log("could not open bank \u2014 retrying");
        await Execution.delayTicks(3);
        return;
      }
    }
    if (typeof Bank.loaded === "function") {
      await Execution.delayUntil(() => Bank.loaded() || Bank.items().length > 0, 3e3);
    }
    await Execution.delayTicks(1);
    await Bank.depositAllMatching((name) => !this.isKeepOnDeposit(name));
    await Execution.delayTicks(1);
    this.refreshBankGp();
    this.log(`restock: bank ${this.bankedLobsterCount()} Lobster`);
    if (await this.maybeBeginStealCakesFromOpenBank("restock")) {
      return;
    }
    if (await this.maybeBeginCatchCookFromOpenBank("restock")) {
      return;
    }
    const have = this.foodCount();
    const need = Math.max(0, this.foodWithdraw - have);
    if (need > 0) {
      if (!await this.withdrawResolvedFood(need)) {
        if (this.stealCakesWanted()) {
          this.log("restock: cake withdraw failed \u2014 retrying");
          await Execution.delayTicks(2);
          return;
        }
        if (this.catchAndCookWanted()) {
          this.log("restock: Lobster withdraw failed \u2014 retrying");
          await Execution.delayTicks(2);
          return;
        }
        await Bank.close();
        await this.stopNoFood("restock");
        return;
      }
    }
    this.refreshBankGp();
    this.bankTrips++;
    if (this.maybeBeginMuleFromBank()) {
      return;
    }
    await Bank.close();
    this.status = `returning to ${cfg.name}`;
    this.log(
      `restocked food (${this.foodCount()}) \u2014 returning to ${cfg.name} (bank ${fmtGp(this.bankGp)}gp)`
    );
    await Traversal.walkResilient(cfg.anchor, {
      radius: 4,
      log: (m) => this.log(`  ${m}`)
    });
    if (needsHouseDoors(cfg)) {
      await this.clearDoorsForMan(cfg.anchor);
    }
  }
  /**
   * Open a shut door near the player, or near an optional tile (house doors by Men).
   * @param {{ within?: number, near?: { x: number, z: number } | null }} [opts]
   */
  async openNearbyDoor({ within = 6, near = null } = {}) {
    let q = Locs.query().where((l) => isShutDoor(l));
    if (near) {
      const focus = Tile.from(near);
      q = q.where((l) => Tile.from(l.tile()).distanceTo(focus) <= within);
    } else {
      q = q.within(within);
    }
    const door = q.nearest();
    if (!door) {
      return false;
    }
    const op = openDoorOp(door);
    if (!op) {
      return false;
    }
    this.status = "opening door";
    this.log(`opening ${door.name}`);
    await door.interact(op);
    await Execution.delayTicks(2);
    return true;
  }
  /**
   * Shut door within a couple tiles of the player (typical "closed behind us" trap).
   */
  findAdjacentShutDoor(within = 2) {
    return Locs.query().where((l) => isShutDoor(l)).within(within).nearest() ?? null;
  }
  /**
   * True when a shut door is trapping us and we're not mid-pickpocket.
   * Skip for indoor targets (Man / Woman / Paladin). Skip while stunned /
   * animating a steal, or when a thieve target is already in melee range.
   */
  isStuckBehindDoor() {
    if (needsHouseDoors(this.targetCfg())) {
      return false;
    }
    if (this.stunned()) {
      return false;
    }
    if (typeof Game.animating === "function" && Game.animating()) {
      return false;
    }
    const door = this.findAdjacentShutDoor(2);
    if (!door) {
      return false;
    }
    const npc = this.findTarget();
    if (npc && npc.distance() <= 1) {
      return false;
    }
    return true;
  }
  /**
   * Open shut doors around us and walk back to the outdoor thieving anchor.
   * @returns {Promise<boolean>} true if we acted on a trapping door
   */
  async escapeIfStuckBehindDoor() {
    if (!this.isStuckBehindDoor()) {
      return false;
    }
    const cfg = this.targetCfg();
    this.status = "stuck behind door \u2014 escaping";
    for (let i = 0; i < 3; i++) {
      const door = this.findAdjacentShutDoor(2);
      if (!door) {
        break;
      }
      const op = openDoorOp(door);
      if (!op) {
        break;
      }
      const t = door.tile();
      this.log(
        `stuck behind ${door.name} @ ${t.x},${t.z} \u2014 opening to escape outside`
      );
      if (door.distance() > 1) {
        await Traversal.walkTo(t, { radius: 1, timeoutMs: 6e3 });
      }
      await door.interact(op);
      await Execution.delayUntil(
        () => {
          const still = Locs.query().where((l) => isShutDoor(l)).where((l) => {
            const lt = l.tile();
            return lt.x === t.x && lt.z === t.z;
          }).nearest();
          return still === null;
        },
        4e3
      );
      await Execution.delayTicks(1);
    }
    const here = Game.tile();
    if (here && Tile.from(here).distanceTo(cfg.anchor) > 3) {
      this.log(`escaping outside to ${cfg.name} @ ${cfg.anchor.x},${cfg.anchor.z}`);
      await Traversal.walkResilient(cfg.anchor, {
        radius: 4,
        log: (m) => this.log(`  ${m}`)
      });
    } else if (here) {
      await Traversal.walkTo(cfg.anchor, { radius: 3, timeoutMs: 8e3 });
    }
    return true;
  }
  /** Open shut doors around the indoor thieving anchor (houses / castle). */
  async clearDoorsForMan(anchor) {
    const focus = Tile.from(anchor);
    const radius = this.targetCfg()?.doorRadius ?? 10;
    this.status = "opening doors";
    for (let i = 0; i < 4; i++) {
      const door = Locs.query().where((l) => isShutDoor(l)).where((l) => Tile.from(l.tile()).distanceTo(focus) <= radius).nearest();
      if (!door) {
        await this.openNearbyDoor({ within: 8 });
        break;
      }
      if (door.distance() > 2) {
        this.log(`walking to ${door.name} (${door.distance()}t)`);
        await Traversal.walkTo(door.tile(), { radius: 1, timeoutMs: 8e3 });
      }
      const op = openDoorOp(door);
      if (!op) {
        break;
      }
      this.log(`opening ${door.name}`);
      const opened = await door.interact(op);
      await Execution.delayTicks(2);
      if (!opened && isShutDoor(door)) {
        if (!await this.openNearbyDoor({ within: 8 })) {
          break;
        }
      }
    }
    await this.openNearbyDoor({ within: 8 });
  }
  /** Open doors near the player and near an indoor NPC tile. */
  async clearDoorsToward(toward) {
    if (await this.openNearbyDoor({ within: 8 })) {
      return true;
    }
    if (!toward) {
      return false;
    }
    const door = Locs.query().where((l) => isShutDoor(l)).where((l) => Tile.from(l.tile()).distanceTo(Tile.from(toward)) <= 5).nearest();
    if (!door) {
      return false;
    }
    if (door.distance() > 2) {
      await Traversal.walkTo(door.tile(), { radius: 1, timeoutMs: 8e3 });
    }
    const op = openDoorOp(door);
    if (!op) {
      return false;
    }
    this.status = "opening door";
    this.log(`opening ${door.name} (toward target)`);
    await door.interact(op);
    await Execution.delayTicks(2);
    return true;
  }
  bankedCakeCount() {
    if (!Bank.isOpen()) {
      return 0;
    }
    const items = typeof Bank.items === "function" ? Bank.items() ?? [] : [];
    return items.filter((i) => isCakeFoodName(i.name)).reduce((n, i) => n + Math.max(0, i.count), 0);
  }
  async maybeBeginStealCakesFromOpenBank(context) {
    if (!this.stealCakesWanted()) {
      return false;
    }
    if (this.bankedCakeCount() > 0) {
      return false;
    }
    this.log(`${context}: no cake in bank \u2014 stealing from Baker stall until ${CAKE_STALL_GOAL}`);
    if (Bank.isOpen()) {
      await Bank.close();
    }
    this.beginStealCakes(context);
    await this.stealCakesTick();
    return true;
  }
  beginStealCakes(context) {
    this.stealCakesActive = true;
    this.stealCakesBanked = 0;
    this.stealCakesCombatEndTick = 0;
    this.startReady = true;
    const thieve = Skills.level("thieving");
    if (thieve < 5) {
      this.log(
        `${context}: WARNING Baker stall needs Thieving 5 (have ${thieve}) \u2014 stealing anyway`
      );
    }
    this.log(
      `${context}: no cake in bank \u2014 steal ${CAKE_STALL_GOAL} from Baker stall @ ${CAKE_STALL_STAND.x},${CAKE_STALL_STAND.z}, then resume thieving`
    );
    this.status = "steal cakes: to stall";
  }
  stealCakesGoalReached() {
    return this.stealCakesBanked >= CAKE_STALL_GOAL;
  }
  stealCakesLockedOut() {
    return Game.tick() < this.stealCakesCombatEndTick + CAKE_STALL_LOCKOUT_TICKS;
  }
  /**
   * Baker stall restock: steal cakes, bank when full, flee guards, until 200 banked.
   */
  async stealCakesTick() {
    if (ChatDialog.canContinue()) {
      this.status = "steal cakes: dialog";
      await ChatDialog.continue();
      return;
    }
    if (this.stealCakesGoalReached()) {
      await this.stealCakesFinish();
      return;
    }
    if (Game.inCombat()) {
      await this.stealCakesFlee();
      return;
    }
    if (this.needEat()) {
      await this.eatFood();
      return;
    }
    if (Inventory.isFull()) {
      await this.stealCakesBankRun();
      return;
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
    if (Tile.from(here).distanceTo(CAKE_STALL_STAND) > CAKE_STALL_MARKET_RADIUS) {
      this.status = "steal cakes: to Baker stall";
      await Traversal.walkResilient(CAKE_STALL_STAND, {
        radius: 2,
        log: (m) => this.log(`  ${m}`)
      });
      await this.openNearbyDoor({ within: 6 });
      return;
    }
    if (this.stealCakesLockedOut()) {
      this.status = "steal cakes: stall lockout";
      await Execution.delayTicks(1);
      return;
    }
    await this.stealCakesFromStall();
  }
  findBakerStall() {
    return Locs.query().name(...CAKE_STALL_NAMES).where((l) => stealFromOp(l) && Tile.from(l.tile()).distanceTo(CAKE_STALL_STAND) <= CAKE_STALL_MARKET_RADIUS).nearest() ?? Locs.query().where(
      (l) => /baker/i.test(l.name ?? "") && /stall/i.test(l.name ?? "") && stealFromOp(l) && Tile.from(l.tile()).distanceTo(CAKE_STALL_STAND) <= CAKE_STALL_MARKET_RADIUS
    ).nearest();
  }
  async stealCakesFromStall() {
    const stall = this.findBakerStall();
    if (!stall) {
      this.status = "steal cakes: waiting for stall";
      const here = Game.tile();
      if (here && Tile.from(here).distanceTo(CAKE_STALL_STAND) > 3) {
        await Traversal.walkTo(CAKE_STALL_STAND, { radius: 2, timeoutMs: 12e3 });
      }
      await Execution.delayTicks(2);
      return;
    }
    const op = stealFromOp(stall);
    if (!op) {
      await Execution.delayTicks(1);
      return;
    }
    const beforeXp = Skills.xp("thieving");
    const beforeCakes = carriedCakes();
    const beforeUsed = Inventory.used();
    const t = stall.tile();
    this.status = `steal cakes ${this.stealCakesBanked}/${CAKE_STALL_GOAL} (${stall.distance()}t)`;
    this.log(`steal cakes: Steal-from ${stall.name} @ ${t.x},${t.z}`);
    if (!await stall.interact(op)) {
      await Execution.delayTicks(1);
      return;
    }
    const ok = await Execution.delayUntil(
      () => Skills.xp("thieving") > beforeXp || carriedCakes() > beforeCakes || Inventory.used() > beforeUsed || Game.inCombat() || ChatDialog.canContinue(),
      4e3
    );
    if (Skills.xp("thieving") > beforeXp || carriedCakes() > beforeCakes || Inventory.used() > beforeUsed) {
      return;
    }
    if (Game.inCombat()) {
      this.log("steal cakes: guard caught the steal \u2014 fleeing");
      return;
    }
    if (!ok) {
      this.log("steal cakes: steal did not resolve \u2014 retrying");
    }
  }
  async stealCakesFlee() {
    this.status = `steal cakes: kiting guard to ${CAKE_STALL_FLEE.x},${CAKE_STALL_FLEE.z}`;
    this.log(`steal cakes: combat \u2014 kiting the guard to ${CAKE_STALL_FLEE.x},${CAKE_STALL_FLEE.z}`);
    await Traversal.walkResilient(CAKE_STALL_FLEE, {
      radius: 1,
      timeoutMs: 3e4,
      log: (m) => this.log(`  ${m}`)
    });
    await Execution.delayUntil(() => !Game.inCombat(), 15e3);
    if (!Game.inCombat()) {
      this.stealCakesCombatEndTick = Game.tick();
    }
  }
  async stealCakesBankRun() {
    this.status = "steal cakes: banking";
    if (!Bank.isOpen()) {
      this.log(
        `steal cakes: inventory full \u2014 banking (${this.stealCakesBanked}/${CAKE_STALL_GOAL})`
      );
      if (!await Banking.open({
        stand: BANK_STAND,
        log: (m) => this.log(`  ${m}`)
      })) {
        this.log("steal cakes: could not open bank \u2014 retrying");
        await Execution.delayTicks(3);
        return;
      }
    }
    if (typeof Bank.loaded === "function") {
      await Execution.delayUntil(() => Bank.loaded() || Bank.items().length > 0, 3e3);
    }
    await Execution.delayTicks(1);
    const before = carriedCakes();
    await Bank.depositAllMatching((name) => (name ?? "").toLowerCase() !== "coins");
    await Execution.delayTicks(1);
    const shed = before - carriedCakes();
    this.stealCakesBanked += Math.max(0, shed);
    this.log(`steal cakes: banked ${shed} cakes (${this.stealCakesBanked}/${CAKE_STALL_GOAL})`);
    this.bankTrips++;
    if (this.stealCakesGoalReached()) {
      await this.stealCakesFinishFromOpenBank();
      return;
    }
    await Bank.close();
    this.status = "steal cakes: to Baker stall";
    await Traversal.walkResilient(CAKE_STALL_STAND, {
      radius: 1,
      attempts: 4,
      timeoutMs: 12e4,
      log: (m) => this.log(`  ${m}`)
    });
  }
  async stealCakesFinish() {
    if (!Bank.isOpen()) {
      this.status = "steal cakes: finish bank";
      if (!await Banking.open({
        stand: BANK_STAND,
        log: (m) => this.log(`  ${m}`)
      })) {
        this.log("steal cakes: could not open bank to finish \u2014 retrying");
        await Execution.delayTicks(3);
        return;
      }
    }
    await this.stealCakesFinishFromOpenBank();
  }
  /**
   * Bank open: dump leftover cakes, withdraw food, walk back to the pickpocket target.
   */
  async stealCakesFinishFromOpenBank() {
    if (typeof Bank.loaded === "function") {
      await Execution.delayUntil(() => Bank.loaded() || Bank.items().length > 0, 3e3);
    }
    await Execution.delayTicks(1);
    const leftover = carriedCakes();
    if (leftover > 0) {
      await Bank.depositAllMatching((name) => (name ?? "").toLowerCase() !== "coins");
      await Execution.delayTicks(1);
      this.stealCakesBanked += Math.max(0, leftover - carriedCakes());
    }
    this.log(
      `steal cakes: done ${this.stealCakesBanked} cakes \u2014 withdraw food, resume thieving`
    );
    const need = Math.min(this.foodWithdraw, Inventory.free());
    if (need > 0) {
      const plan = this.buildWithdrawPlan(this.foodCfg().withdraw, need);
      if (!plan || plan.length === 0) {
        this.log("steal cakes: cake withdraw failed \u2014 retrying");
        await Execution.delayTicks(2);
        return;
      }
      for (const { name, take } of plan) {
        this.log(`steal cakes: withdrawing ${take}\xD7 ${name}`);
        if (!await Bank.withdrawX(name, take)) {
          this.log(`steal cakes: withdraw failed for ${name}`);
          await Execution.delayTicks(2);
          return;
        }
        await Execution.delayTicks(1);
      }
    }
    this.refreshBankGp();
    this.bankTrips++;
    this.stealCakesTrips++;
    this.stealCakesActive = false;
    this.startReady = true;
    if (this.maybeBeginMuleFromBank()) {
      return;
    }
    await Bank.close();
    const cfg = this.targetCfg();
    this.status = `returning to ${cfg.name}`;
    this.log(
      `steal cakes trip ${this.stealCakesTrips} done \u2014 ${this.stealCakesBanked} cakes, ${this.foodCount()} food, walking to ${cfg.anchor.x},${cfg.anchor.z}`
    );
    await Traversal.walkResilient(cfg.anchor, {
      radius: 4,
      log: (m) => this.log(`  ${m}`)
    });
    if (needsHouseDoors(cfg)) {
      await this.clearDoorsForMan(cfg.anchor);
    }
  }
  beginCatchCook(context) {
    this.catchCookActive = true;
    this.catchCookReady = false;
    this.catchCookCookingLoad = false;
    this.catchCookCooked = 0;
    this.catchCookCaught = 0;
    this.catchCookLastRaw = rawLobsterCount();
    this.startReady = true;
    this.log(
      `${context}: no Lobster in bank \u2014 catch & cook ${CATCH_COOK_GOAL} at Catherby (Cage+Harpoon, cook on Range, then return)`
    );
    this.status = "catch & cook: to Catherby";
  }
  catchCookNoteCatches() {
    const now = rawLobsterCount();
    if (now > this.catchCookLastRaw) {
      this.catchCookCaught += now - this.catchCookLastRaw;
    }
    this.catchCookLastRaw = now;
  }
  catchCookNoteCooked(beforeCooked) {
    const now = cookedLobsterCount();
    if (now > beforeCooked) {
      const gained = now - beforeCooked;
      this.catchCookCooked += gained;
      return gained;
    }
    return 0;
  }
  catchCookGoalReached() {
    return this.catchCookCooked >= CATCH_COOK_GOAL;
  }
  /**
   * Catherby lobster trip: withdraw pot, cage, cook, bank until 500 cooked, then resume thieving.
   */
  async catchCookTick() {
    this.catchCookNoteCatches();
    if (ChatDialog.canContinue() && !isMakeMenuOpen()) {
      this.status = "catch & cook: dialog";
      await ChatDialog.continue();
      return;
    }
    if (typeof Shop !== "undefined" && typeof Shop.isOpen === "function" && Shop.isOpen()) {
      await this.catchCookHandleHarry();
      return;
    }
    if (isMakeMenuOpen()) {
      await this.catchCookChooseCookProduct();
      if (cookableLobsterCount() === 0) {
        if (burntFishCount() > 0) {
          await this.catchCookDropBurnt();
        }
        this.catchCookCookingLoad = false;
        await this.catchCookBankOrFinish();
      }
      return;
    }
    if (this.catchCookGoalReached()) {
      await this.catchCookFinish();
      return;
    }
    if (!this.catchCookReady) {
      await this.catchCookPrepPot();
      return;
    }
    if (!catchCookHasPot()) {
      if (await this.catchCookLootPot()) {
        this.log("catch & cook: looted Lobster pot");
        return;
      }
      this.status = "catch & cook: need pot";
      this.log("catch & cook: missing Lobster pot \u2014 banking, then Harry if needed");
      this.catchCookReady = false;
      await this.catchCookPrepPot();
      return;
    }
    if (this.catchCookCookingLoad && cookableLobsterCount() > 0) {
      await this.catchCookCookLoad();
      return;
    }
    if (this.catchCookCookingLoad && cookableLobsterCount() === 0) {
      if (burntFishCount() > 0) {
        await this.catchCookDropBurnt();
      }
      this.catchCookCookingLoad = false;
      await this.catchCookBankOrFinish();
      return;
    }
    if (Bank.isOpen()) {
      await Bank.close();
      return;
    }
    if (Inventory.isFull()) {
      if (cookableLobsterCount() > 0) {
        this.catchCookCookingLoad = true;
        this.log(
          `catch & cook: full inv (${cookableLobsterCount()} raw) \u2014 cooking on Range (${this.catchCookCooked}/${CATCH_COOK_GOAL})`
        );
        await this.catchCookCookLoad();
        return;
      }
      await this.catchCookBankOrFinish();
      return;
    }
    const here = Game.tile();
    if (!here) {
      await Execution.delayTicks(2);
      return;
    }
    if (Tile.from(here).distanceTo(CATHERBY_SHORE) > CATHERBY_SHORE_LEASH) {
      this.status = "catch & cook: to shore";
      await Traversal.walkResilient(CATHERBY_SHORE, {
        radius: 3,
        log: (m) => this.log(`  ${m}`)
      });
      return;
    }
    if (isAnimating()) {
      this.status = `catch & cook: fishing ${this.catchCookCooked}/${CATCH_COOK_GOAL}`;
      await Execution.delayTicks(1);
      return;
    }
    const spot = this.catchCookFindSpot();
    if (!spot) {
      this.status = "catch & cook: waiting for Cage+Harpoon";
      if (Tile.from(here).distanceTo(CATHERBY_SHORE) > CATHERBY_STAND_RADIUS) {
        await Traversal.walkTo(CATHERBY_SHORE, { radius: 2, timeoutMs: 12e3 });
      }
      await Execution.delayTicks(3);
      return;
    }
    await this.catchCookCage(spot);
  }
  catchCookFindSpot() {
    return Npcs.query().name(FISHING_SPOT).where((n) => isCageHarpoonSpot(n.actions())).where((n) => Tile.from(n.tile()).distanceTo(CATHERBY_SHORE) <= CATHERBY_SHORE_LEASH).nearest();
  }
  async catchCookCage(spot) {
    const op = cageOp(spot.actions());
    if (!op) {
      await Execution.delayTicks(2);
      return;
    }
    const before = rawLobsterCount();
    const st = spot.tile();
    this.status = `catch & cook: Cage (${this.catchCookCooked}/${CATCH_COOK_GOAL})`;
    this.log(`catch & cook: Cage lobster @ ${st.x},${st.z}`);
    await spot.interact(op);
    await Execution.delayUntil(
      () => rawLobsterCount() > before || isAnimating() || ChatDialog.canContinue() || !this.catchCookFindSpot(),
      8e3
    );
    this.catchCookNoteCatches();
  }
  async catchCookLootPot() {
    if (catchCookHasPot() || typeof GroundItems?.query !== "function") {
      return catchCookHasPot();
    }
    const ground = GroundItems.query().name(POT_NAME).within(12).nearest() ?? GroundItems.query().where((g) => isLobsterPot(g.name)).within(12).nearest();
    if (!ground) {
      return false;
    }
    const before = Inventory.used();
    await ground.interact("Take");
    return await Execution.delayUntil(
      () => catchCookHasPot() || Inventory.used() > before,
      6e3
    ) && catchCookHasPot();
  }
  /**
   * Catherby bank: deposit junk/fish, withdraw one Lobster pot (buy from Harry if none).
   */
  async catchCookPrepPot() {
    if (catchCookHasPot() && cookedLobsterCount() === 0 && rawLobsterCount() === 0 && burntFishCount() === 0 && !Inventory.items().some((i) => i.name && !isCatchCookKeep(i.name))) {
      this.catchCookReady = true;
      this.catchCookLastRaw = rawLobsterCount();
      this.status = "catch & cook: to shore";
      await Traversal.walkResilient(CATHERBY_SHORE, {
        radius: 3,
        log: (m) => this.log(`  ${m}`)
      });
      return;
    }
    this.status = "catch & cook: Catherby bank";
    if (!Bank.isOpen()) {
      this.log("catch & cook: opening Catherby bank \u2014 deposit, withdraw Lobster pot");
      if (!await Banking.open({
        stand: CATHERBY_BANK,
        log: (m) => this.log(`  ${m}`)
      })) {
        this.log("catch & cook: could not open Catherby bank \u2014 retrying");
        await Execution.delayTicks(3);
        return;
      }
    }
    if (typeof Bank.loaded === "function") {
      await Execution.delayUntil(() => Bank.loaded() || Bank.items().length > 0, 3e3);
    }
    await Execution.delayTicks(1);
    await Bank.depositAllMatching((name) => !isCatchCookKeep(name));
    await Execution.delayTicks(1);
    if (this.catchCookGoalReached()) {
      await this.catchCookFinishFromOpenBank();
      return;
    }
    if (!await this.catchCookWithdrawPot()) {
      const short = Math.max(0, POT_COST - invCoins());
      const bankGp = Bank.count(COINS_NAME) || Bank.count("Coins") || 0;
      if (short > 0 && bankGp > 0) {
        const take = Math.min(short, bankGp);
        this.log(`catch & cook: no bank pot \u2014 withdrawing ${take} Coins for Harry`);
        await Bank.withdrawX(COINS_NAME, take);
        await Execution.delayTicks(1);
      }
      if (Bank.isOpen()) {
        await Bank.close();
      }
      this.log("catch & cook: no Lobster pot in bank \u2014 buying from Harry");
      await this.catchCookBuyPotFromHarry();
      return;
    }
    await Bank.close();
    this.catchCookReady = true;
    this.catchCookLastRaw = rawLobsterCount();
    this.bankTrips++;
    this.status = "catch & cook: to shore";
    this.log(
      `catch & cook: pot ready \u2014 walking to shore (${this.catchCookCooked}/${CATCH_COOK_GOAL} cooked)`
    );
    await Traversal.walkResilient(CATHERBY_SHORE, {
      radius: 3,
      log: (m) => this.log(`  ${m}`)
    });
  }
  async catchCookWithdrawPot() {
    if (!Bank.isOpen()) {
      return catchCookHasPot();
    }
    if (catchCookHasPot()) {
      return true;
    }
    const potBank = Bank.items().find((i) => isLobsterPot(i.name));
    if (!potBank) {
      return false;
    }
    const op = (typeof withdrawOp === "function" ? withdrawOp(potBank.ops, "1") : null) ?? "Withdraw-1";
    this.log("catch & cook: withdrawing Lobster pot");
    if (typeof Bank.withdraw === "function") {
      await Bank.withdraw(POT_NAME, op);
    } else {
      await Bank.withdrawX(POT_NAME, 1);
    }
    await Execution.delayTicks(1);
    return catchCookHasPot();
  }
  async catchCookBuyPotFromHarry() {
    if (catchCookHasPot()) {
      this.catchCookReady = true;
      return;
    }
    if (typeof Shop === "undefined" || typeof Shop.open !== "function") {
      this.log("catch & cook: Shop API missing \u2014 cannot buy Lobster pot");
      await Execution.delayTicks(8);
      return;
    }
    if (invCoins() < POT_COST) {
      this.log(
        `catch & cook: need ${POT_COST}gp for Lobster pot (have ${invCoins()})`
      );
      this.status = "catch & cook: need coins";
      await Execution.delayTicks(8);
      return;
    }
    this.status = "catch & cook: Harry (pot)";
    this.log(`catch & cook: buying Lobster pot from Harry (${POT_COST}gp)`);
    await Traversal.walkResilient(HARRY_STAND, {
      radius: 2,
      log: (m) => this.log(`  ${m}`)
    });
    await this.openNearbyDoor({ within: 3 });
    if (!await Shop.open(HARRY_NAME)) {
      this.log("catch & cook: could not open Harry \u2014 retrying");
      await Execution.delayTicks(3);
      return;
    }
    await this.catchCookHandleHarry();
  }
  async catchCookHandleHarry() {
    if (typeof Shop === "undefined" || !Shop.isOpen()) {
      return;
    }
    if (!catchCookHasPot() && invCoins() >= POT_COST) {
      this.log(`catch & cook: Shop.buy 1\xD7 ${POT_NAME}`);
      const bought = await Shop.buy(POT_NAME, 1);
      if (bought > 0) {
        this.log(`catch & cook: bought ${bought}\xD7 ${POT_NAME} from Harry`);
      } else {
        this.log("catch & cook: Harry had no Lobster pot / buy failed");
      }
    }
    if (Shop.isOpen()) {
      await Shop.close();
    }
    if (catchCookHasPot()) {
      this.catchCookReady = true;
      this.catchCookLastRaw = rawLobsterCount();
      this.status = "catch & cook: to shore";
      this.log("catch & cook: pot ready \u2014 walking to shore");
      await Traversal.walkResilient(CATHERBY_SHORE, {
        radius: 3,
        log: (m) => this.log(`  ${m}`)
      });
      return;
    }
    this.log("catch & cook: still no Lobster pot after Harry");
    await Execution.delayTicks(8);
  }
  catchCookFindRange() {
    return Locs.query().name("Range", "Cooking range", "Fire", "Fireplace").where((l) => Tile.from(l.tile()).distanceTo(CATHERBY_RANGE_LOC) <= CATHERBY_RANGE_LEASH).nearest() ?? Locs.query().name("Range", "Cooking range").nearest();
  }
  async catchCookWalkToRange() {
    this.status = "catch & cook: to range";
    this.log(
      `catch & cook: walking to Range ${CATHERBY_RANGE_STAND.x},${CATHERBY_RANGE_STAND.z}`
    );
    await Traversal.walkResilient(CATHERBY_RANGE_STAND, {
      radius: 1,
      log: (m) => this.log(`  ${m}`)
    });
    await this.openNearbyDoor({ within: 3 });
    const here = Game.tile();
    if (here && Tile.from(here).distanceTo(CATHERBY_RANGE_STAND) > 2) {
      await Traversal.walkTo(CATHERBY_RANGE_STAND, { radius: 1, timeoutMs: 12e3 });
    }
    if (!this.catchCookFindRange()) {
      await Traversal.walkTo(CATHERBY_RANGE_LOC, { radius: 1, timeoutMs: 8e3 });
      await this.openNearbyDoor({ within: 3 });
    }
  }
  async catchCookChooseCookProduct() {
    const products = typeof ChatDialog.makeProducts === "function" ? ChatDialog.makeProducts() : [];
    const raw = lastCookableRawLobster();
    const hint = products.find((p) => (p ?? "").toLowerCase().includes("lobster")) ?? products[0] ?? raw?.name ?? null;
    const batch = Math.max(1, Math.min(cookableLobsterCount(), 28));
    this.status = "catch & cook: cook menu";
    this.log(
      `catch & cook: cook menu [${products.join(", ")}] pick=${hint ?? "none"} x${batch}`
    );
    let picked = false;
    if (hint && typeof ChatDialog.makeX === "function") {
      picked = await ChatDialog.makeX(hint, batch);
    }
    if (!picked && hint && typeof ChatDialog.make === "function") {
      picked = await ChatDialog.make(hint);
    }
    if (!picked && typeof ChatDialog.make === "function") {
      picked = await ChatDialog.make();
    }
    if (!picked) {
      this.log("catch & cook: could not pick cook product");
      await Execution.delayTicks(1);
      return;
    }
    await Execution.delayUntil(
      () => !isMakeMenuOpen() && (isAnimating() || cookableLobsterCount() === 0),
      5e3
    );
    let cookedMark = cookedLobsterCount();
    let idle = 0;
    for (let guard = 0; guard < 400 && cookableLobsterCount() > 0; guard++) {
      if (ChatDialog.canContinue() || isMakeMenuOpen()) {
        this.catchCookNoteCooked(cookedMark);
        return;
      }
      await Execution.delayTicks(1);
      if (this.catchCookNoteCooked(cookedMark) > 0) {
        cookedMark = cookedLobsterCount();
        idle = 0;
      } else if (!isAnimating() && ++idle >= 14) {
        break;
      } else if (isAnimating()) {
        idle = 0;
      }
    }
    this.catchCookNoteCooked(cookedMark);
  }
  async catchCookCookLoad() {
    if (cookableLobsterCount() === 0) {
      this.catchCookCookingLoad = false;
      return;
    }
    const here = Game.tile();
    let oven = this.catchCookFindRange();
    if (!here || Tile.from(here).distanceTo(CATHERBY_RANGE_STAND) > 2 || !oven) {
      await this.catchCookWalkToRange();
      oven = this.catchCookFindRange();
    }
    if (!oven) {
      this.log("catch & cook: no Range near bank house \u2014 banking raw instead");
      this.catchCookCookingLoad = false;
      await this.catchCookBankOrFinish();
      return;
    }
    if (isMakeMenuOpen()) {
      await this.catchCookChooseCookProduct();
      if (cookableLobsterCount() === 0) {
        if (burntFishCount() > 0) {
          await this.catchCookDropBurnt();
        }
        this.catchCookCookingLoad = false;
        await this.catchCookBankOrFinish();
      }
      return;
    }
    const raw = lastCookableRawLobster();
    if (!raw) {
      this.catchCookCookingLoad = false;
      return;
    }
    const beforeCookable = cookableLobsterCount();
    let cookedMark = cookedLobsterCount();
    const beforeXp = Skills.xp("cooking");
    this.status = `catch & cook: cooking (${this.catchCookCooked}/${CATCH_COOK_GOAL})`;
    this.log(
      `catch & cook: use ${raw.name} on ${oven.name ?? "Range"} (${beforeCookable} raw)`
    );
    if (!await raw.useOn(oven)) {
      await this.openNearbyDoor({ within: 3 });
      await Execution.delayTicks(2);
      return;
    }
    const started = await Execution.delayUntil(
      () => cookableLobsterCount() < beforeCookable || Skills.xp("cooking") > beforeXp || isMakeMenuOpen() || ChatDialog.canContinue(),
      4e3
    );
    if (isMakeMenuOpen()) {
      await this.catchCookChooseCookProduct();
      if (cookableLobsterCount() === 0) {
        if (burntFishCount() > 0) {
          await this.catchCookDropBurnt();
        }
        this.catchCookCookingLoad = false;
        await this.catchCookBankOrFinish();
      }
      return;
    }
    if (!started && cookableLobsterCount() >= beforeCookable) {
      this.log("catch & cook: cook did not start \u2014 re-pathing to range");
      await this.catchCookWalkToRange();
      return;
    }
    let mark = cookableLobsterCount();
    let idle = 0;
    for (let guard = 0; guard < 400 && cookableLobsterCount() > 0; guard++) {
      if (ChatDialog.canContinue() || isMakeMenuOpen()) {
        this.catchCookNoteCooked(cookedMark);
        return;
      }
      await Execution.delayTicks(1);
      if (this.catchCookNoteCooked(cookedMark) > 0) {
        cookedMark = cookedLobsterCount();
      }
      const now = cookableLobsterCount();
      if (now < mark) {
        mark = now;
        idle = 0;
      } else if (!isAnimating() && ++idle >= 14) {
        break;
      } else if (isAnimating()) {
        idle = 0;
      }
    }
    this.catchCookNoteCooked(cookedMark);
    if (cookableLobsterCount() === 0) {
      if (burntFishCount() > 0) {
        await this.catchCookDropBurnt();
      }
      this.catchCookCookingLoad = false;
      await this.catchCookBankOrFinish();
    }
  }
  async catchCookDropBurnt() {
    this.status = "catch & cook: drop burnt";
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
  /**
   * Bank cooked/raw at Catherby. Finish the trip at 500 cooked, else return to shore.
   */
  async catchCookBankOrFinish() {
    if (this.catchCookGoalReached() && cookedLobsterCount() === 0 && rawLobsterCount() === 0) {
      await this.catchCookFinish();
      return;
    }
    this.status = "catch & cook: banking";
    this.catchCookLastRaw = 0;
    this.log(
      `catch & cook: banking` + (rawLobsterCount() ? ` ${rawLobsterCount()} raw` : "") + (cookedLobsterCount() ? ` ${cookedLobsterCount()} cooked` : "") + ` \u2014 ${this.catchCookCooked}/${CATCH_COOK_GOAL}`
    );
    if (!Bank.isOpen()) {
      if (!await Banking.open({
        stand: CATHERBY_BANK,
        log: (m) => this.log(`  ${m}`)
      })) {
        this.log("catch & cook: could not open bank \u2014 retrying");
        await Execution.delayTicks(3);
        return;
      }
    }
    if (typeof Bank.loaded === "function") {
      await Execution.delayUntil(() => Bank.loaded() || Bank.items().length > 0, 3e3);
    }
    await Execution.delayTicks(1);
    await Bank.depositAllMatching((name) => !isCatchCookKeep(name));
    await Execution.delayTicks(1);
    this.bankTrips++;
    this.catchCookCookingLoad = false;
    this.catchCookLastRaw = rawLobsterCount();
    if (this.catchCookGoalReached()) {
      await this.catchCookFinishFromOpenBank();
      return;
    }
    if (!catchCookHasPot() && !await this.catchCookWithdrawPot()) {
      if (Bank.isOpen()) {
        await Bank.close();
      }
      this.catchCookReady = false;
      await this.catchCookPrepPot();
      return;
    }
    await Bank.close();
    this.catchCookReady = true;
    this.status = "catch & cook: to shore";
    this.log(
      `catch & cook: ${this.catchCookCooked}/${CATCH_COOK_GOAL} cooked \u2014 back to shore`
    );
    await Traversal.walkResilient(CATHERBY_SHORE, {
      radius: 3,
      log: (m) => this.log(`  ${m}`)
    });
  }
  async catchCookFinish() {
    if (!Bank.isOpen()) {
      this.status = "catch & cook: finish bank";
      if (!await Banking.open({
        stand: CATHERBY_BANK,
        log: (m) => this.log(`  ${m}`)
      })) {
        this.log("catch & cook: could not open bank to finish \u2014 retrying");
        await Execution.delayTicks(3);
        return;
      }
    }
    await this.catchCookFinishFromOpenBank();
  }
  /**
   * Bank open at Catherby: dump pot + leftovers, withdraw food, walk back to Ardougne.
   */
  async catchCookFinishFromOpenBank() {
    if (typeof Bank.loaded === "function") {
      await Execution.delayUntil(() => Bank.loaded() || Bank.items().length > 0, 3e3);
    }
    await Execution.delayTicks(1);
    this.log(
      `catch & cook: done ${this.catchCookCooked} cooked (${this.catchCookCaught} caught) \u2014 deposit pot, withdraw food, return to Ardougne`
    );
    await Bank.depositAllMatching((name) => (name ?? "").toLowerCase() !== "coins");
    await Execution.delayTicks(1);
    const need = Math.min(this.foodWithdraw, Inventory.free());
    if (need > 0 && !await this.withdrawResolvedFood(need)) {
      this.log("catch & cook: food withdraw failed \u2014 retrying (not stopping)");
      await Execution.delayTicks(2);
      return;
    }
    this.bankTrips++;
    this.catchCookTrips++;
    this.catchCookActive = false;
    this.catchCookReady = false;
    this.catchCookCookingLoad = false;
    this.startReady = true;
    await Bank.close();
    const cfg = this.targetCfg();
    this.status = `returning to ${cfg.name}`;
    this.log(
      `catch & cook trip ${this.catchCookTrips} done \u2014 ${this.foodCount()} food, walking to ${cfg.anchor.x},${cfg.anchor.z}`
    );
    await Traversal.walkResilient(cfg.anchor, {
      radius: 4,
      log: (m) => this.log(`  ${m}`)
    });
    if (needsHouseDoors(cfg)) {
      await this.clearDoorsForMan(cfg.anchor);
    }
  }
  muleWanted() {
    if (typeof this.settings?.bool === "function") {
      return this.settings.bool("muleOn", true) === true;
    }
    return this.muleMode === true;
  }
  /** Banked gp (plus any still in the pack) over the mule threshold. */
  needMule() {
    if (!this.muleWanted()) {
      return false;
    }
    return this.bankGp + invCoins() > MULE_GP_THRESHOLD;
  }
  /**
   * Bank is open and we just snapshotted Coins. Start a handoff if over threshold.
   * Leaves the bank open so muleTick can withdraw.
   */
  maybeBeginMuleFromBank() {
    this.refreshBankGp();
    if (!this.muleWanted() || this.bankGp <= MULE_GP_THRESHOLD) {
      return false;
    }
    this.startReady = true;
    this.beginMuleHandoff();
    return true;
  }
  beginMuleHandoff() {
    this.muleHandoffActive = true;
    this.muleReadyToTrade = false;
    this.muleAnnounced = false;
    this.nextMuleTradeRequestAtMs = 0;
    this.log(
      `mule: bank ${fmtGp(this.bankGp)}gp + pack ${fmtGp(invCoins())}gp (id ${COINS_ID}) > ${fmtGp(MULE_GP_THRESHOLD)} \u2014 withdraw ALL Coins at ${MULE_STAND.x},${MULE_STAND.z} and trade to ${MULE_NAME}`
    );
    this.status = "mule: start handoff";
  }
  /** After a finished trade (or aborted handoff): clear flags and return to thieving. */
  async resumeThievingAfterMule(reason) {
    this.muleHandoffActive = false;
    this.muleReadyToTrade = false;
    this.muleAnnounced = false;
    this.startReady = true;
    this.log(`mule: ${reason} \u2014 resuming thieving`);
    if (this.needFoodBank()) {
      await this.bankFoodRestock();
      return;
    }
    const cfg = this.targetCfg();
    this.status = `returning to ${cfg.name}`;
    await Traversal.walkResilient(cfg.anchor, {
      radius: 4,
      log: (m) => this.log(`  ${m}`)
    });
    if (needsHouseDoors(cfg)) {
      await this.clearDoorsForMan(cfg.anchor);
    }
  }
  findMule() {
    if (typeof Players?.query !== "function") {
      return null;
    }
    const partner = Players.query().name(MULE_NAME).nearest() ?? null;
    if (!partner) {
      return null;
    }
    const pt = partner.tile?.() ?? null;
    if (pt && Tile.from(pt).distanceTo(MULE_STAND) > BANK_MULE_LEASH) {
      return null;
    }
    return partner;
  }
  /**
   * Mule handoff: walk to East Ardougne south bank, deposit then withdraw ALL
   * Coins (id 995) if banked gp exceeds the threshold, trade to Ben, resume thieving.
   */
  async muleTick() {
    if (typeof Trade !== "undefined" && typeof Trade.active === "function" && Trade.active()) {
      await this.driveMuleTrade();
      return;
    }
    if (!this.muleReadyToTrade) {
      if (!Bank.isOpen() && this.needEat()) {
        await this.eatFood();
        return;
      }
      await this.muleWithdrawBankCoins();
      return;
    }
    if (Bank.isOpen()) {
      await Bank.close();
      return;
    }
    if (this.needEat()) {
      await this.eatFood();
      return;
    }
    if (typeof Trade === "undefined" || typeof Trade.active !== "function") {
      this.log("mule: Trade API missing \u2014 waiting");
      await Execution.delayTicks(5);
      return;
    }
    if (invCoins() <= 0) {
      await this.resumeThievingAfterMule("no coins in pack after withdraw");
      return;
    }
    await this.requestMuleTrade();
  }
  /**
   * Open East Ardougne bank, dump pack Coins, and if banked gp is over the
   * threshold withdraw the entire stack for the Ben trade.
   */
  async muleWithdrawBankCoins() {
    const here = Game.tile();
    if (!here || Tile.from(here).distanceTo(MULE_STAND) > BANK_MULE_LEASH) {
      this.status = "mule: to bank";
      if (!this.muleAnnounced) {
        this.muleAnnounced = true;
        this.log(
          `mule: bank ${fmtGp(this.bankGp)}gp \u2192 ${MULE_STAND.x},${MULE_STAND.z} withdraw ALL Coins then Trade with ${MULE_NAME}`
        );
      }
      await Traversal.walkResilient(MULE_STAND, {
        radius: 2,
        log: (m) => this.log(`  ${m}`)
      });
      return;
    }
    if (!Bank.isOpen()) {
      this.log("mule: opening bank to withdraw Coins");
      if (!await Banking.open({
        stand: MULE_STAND,
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
    if (invCoins() > 0) {
      this.log(`mule: depositing ${fmtGp(invCoins())}gp into bank`);
      if (typeof Bank.depositAllMatching === "function") {
        await Bank.depositAllMatching((name) => (name ?? "").toLowerCase() === "coins");
      }
      await Execution.delayTicks(1);
    }
    this.refreshBankGp();
    const banked = bankCoins();
    this.bankGp = banked;
    if (banked <= MULE_GP_THRESHOLD) {
      this.log(
        `mule: bank ${fmtGp(banked)}gp \u2264 ${fmtGp(MULE_GP_THRESHOLD)} \u2014 aborting handoff`
      );
      await Bank.close();
      await this.resumeThievingAfterMule(
        `bank only ${fmtGp(banked)}gp (need > ${fmtGp(MULE_GP_THRESHOLD)})`
      );
      return;
    }
    this.log(`mule: withdrawing ALL ${fmtGp(banked)}gp (id ${COINS_ID})`);
    let ok = false;
    if (typeof Bank.withdrawX === "function") {
      ok = !!await Bank.withdrawX(COINS_NAME, banked);
    }
    if (!ok && typeof Bank.withdraw === "function") {
      ok = !!await Bank.withdraw(COINS_NAME, "Withdraw-All");
    }
    await Execution.delayTicks(1);
    this.refreshBankGp();
    const leftover = bankCoins();
    const held = invCoins();
    if (!ok || held <= 0) {
      this.log("mule: withdraw did not land Coins \u2014 retrying");
      await Execution.delayTicks(2);
      return;
    }
    if (leftover > 0) {
      this.log(`mule: ${fmtGp(leftover)}gp still in bank after withdraw \u2014 retrying`);
      await Execution.delayTicks(2);
      return;
    }
    await Bank.close();
    this.muleReadyToTrade = true;
    this.log(`mule: holding ${fmtGp(held)}gp \u2014 looking for ${MULE_NAME}`);
    this.status = "mule: find partner";
  }
  async requestMuleTrade() {
    const here = Game.tile();
    if (!here || Tile.from(here).distanceTo(MULE_STAND) > BANK_MULE_LEASH) {
      this.status = "mule: return to bank";
      await Traversal.walkResilient(MULE_STAND, {
        radius: 2,
        log: (m) => this.log(`  ${m}`)
      });
      return;
    }
    const partner = this.findMule();
    if (!partner) {
      this.status = `mule: waiting for ${MULE_NAME} at bank`;
      if (Tile.from(here).distanceTo(MULE_STAND) > 2) {
        await Traversal.walkTo(MULE_STAND, { radius: 2, timeoutMs: 8e3 });
      }
      await Execution.delayTicks(3);
      return;
    }
    if (partner.distance() > MULE_TRADE_RANGE) {
      this.status = `mule: walking to ${MULE_NAME}`;
      this.log(`mule: ${MULE_NAME} ${partner.distance()}t away \u2014 walking closer (stay at bank)`);
      const pt = partner.tile?.() ?? null;
      if (pt && Tile.from(pt).distanceTo(MULE_STAND) <= BANK_MULE_LEASH) {
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
    this.log(`mule: Trade with ${MULE_NAME} \u2014 offering ${fmtGp(invCoins())}gp`);
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
  async driveMuleTrade() {
    const before = invCoins();
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
      const offered = Trade.myOffer().some((i) => isCoinsItem(i));
      if (!offered) {
        if (this.status !== "mule: offering coins") {
          this.log(`mule: Offer-All ${COINS_NAME} (id ${COINS_ID})`);
        }
        this.status = "mule: offering coins";
        let offeredOk = false;
        if (typeof Trade.offerAll === "function") {
          offeredOk = !!await Trade.offerAll(COINS_NAME, (i) => isCoinsItem(i));
          if (!offeredOk) {
            offeredOk = !!await Trade.offerAll(COINS_NAME);
          }
        }
        if (!offeredOk) {
          this.log("mule: offerAll Coins failed \u2014 declining");
          await Trade.decline();
          return;
        }
        await Execution.delayUntil(
          () => Trade.myOffer().some((i) => isCoinsItem(i)) || Trade.onConfirmScreen() || !Trade.active(),
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
    const gone = before - invCoins();
    if (gone > 0 || invCoins() <= 0) {
      this.muled += Math.max(0, gone);
      this.muleTrips++;
      await this.resumeThievingAfterMule(
        `trade over \u2014 delivered ${fmtGp(gone > 0 ? gone : before)}gp to ${MULE_NAME}`
      );
      return;
    }
    this.log("mule: trade over but coins still held \u2014 will re-request");
    this.nextMuleTradeRequestAtMs = Date.now() + MULE_TRADE_REQUEST_MS;
  }
  onPaint(ctx) {
    if (Bank.isOpen()) {
      this.refreshBankGp();
    }
    const elapsed = Date.now() - this.startedAt;
    const hrs = elapsed / 36e5;
    const xp = Skills.xp("thieving") - this.xpAtStart;
    const xph = hrs > 8e-3 ? xp / hrs : 0;
    const cfg = this.targetCfg();
    const hp = Skills.effective("hitpoints");
    const hpMode = this.foodEnabled() ? `eat \u2264 ${this.eatAtHp}  \xB7  ${this.describeFoodPrefs()} ${this.foodCount()}/${this.foodWithdraw}` : this.waitForHp ? `wait \u2264 ${this.eatAtHp}  \xB7  food off` : `HP thresh ${this.eatAtHp}  \xB7  food off`;
    const lines = [
      `Benzyme's Ardougne Thiever`,
      `Time ${fmtElapsed(elapsed)}  \xB7  ${this.status}`,
      `Target ${this.targetPref === TARGET_AUTO ? "Auto \u2192 " : ""}${targetNames(cfg).join(" / ")}  \xB7  Thieving ${Skills.level("thieving")}`,
      `HP ${hp}/${Skills.level("hitpoints")}  \xB7  ${hpMode}`,
      this.stealCakesActive ? `steal cakes ${this.stealCakesBanked}/${CAKE_STALL_GOAL}  carried ${carriedCakes()}` : this.stealCakesWanted() ? `steal cakes on  \xB7  ${this.stealCakesTrips} Baker trips` : this.catchCookActive ? `catch & cook ${this.catchCookCooked}/${CATCH_COOK_GOAL}  caught ${this.catchCookCaught}  pot ${catchCookHasPot() ? "yes" : "NO"}` : this.catchAndCookWanted() ? `catch & cook on  \xB7  ${this.catchCookTrips} Catherby trips` : `catch & cook off`,
      `steals ${this.steals}  fails ${this.fails}  eats ${this.eats}  banks ${this.bankTrips}`,
      `GP stolen ${fmtGp(this.gpStolen)}  \xB7  bank ${fmtGp(this.bankGp)}gp`,
      this.muleHandoffActive ? `mule handoff \u2192 ${MULE_NAME}  pack ${fmtGp(invCoins())}gp` : this.muleWanted() ? `mule bank ${fmtGp(this.bankGp)}/${fmtGp(MULE_GP_THRESHOLD)} \u2192 ${MULE_NAME}  sent ${fmtGp(this.muled)}  trips ${this.muleTrips}` : `mule off  \xB7  bank ${fmtGp(this.bankGp)}gp`,
      `XP ${fmtXph(xph)}/hr  (+${Math.round(xp)} xp)`
    ];
    ctx.font = "bold 13px monospace";
    let maxW = 0;
    for (const line of lines) {
      maxW = Math.max(maxW, ctx.measureText(line).width);
    }
    const pad = 6;
    const lineH = 17;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(6, 6, maxW + pad * 2, pad * 2 + lines.length * lineH);
    ctx.fillStyle = "#c9a227";
    lines.forEach((line, i) => {
      ctx.fillText(line, 6 + pad, 6 + pad + (i + 1) * lineH - 4);
    });
  }
}
var ArdougneThiever_default = defineBot({
  name: SCRIPT_NAME,
  version: "1.13.0",
  category: "Thieving",
  tags: ["thieving", "ardougne", "pickpocket", "man", "guard", "warrior", "knight", "paladin", "hero", "cake", "baker", "shrimp", "anchovies", "tuna", "lobster", "catherby", "mule"],
  description: "Pickpockets in East Ardougne. Auto-picks Men, Warrior women, Guards, Knights, or Heroes from Thieving level. Optional food, Baker stall cakes, Catherby lobster restock, and mule coins. Change MULE_NAME before using mule mode.",
  settingsSchema: {
    target: {
      type: "string",
      default: TARGET_AUTO,
      options: TARGET_OPTIONS,
      label: "Pickpocket target",
      group: "Thieving",
      help: "Auto (default): on start (and when Thieving levels) pick Men/Women at 1\u201324, Warrior women at 25\u201339, Ardougne Guards at 40\u201354, Knights of Ardougne at 55\u201379, Heroes at 80+. Manual: Man at 2625,3291 (Thieving 1; Men and Women in the houses; opens doors as needed), Warrior woman id 15 at 2630,3297 (Thieving 25), Ardougne guard by name Guard (Thieving 40), Ardougne Knights (Knight of Ardougne, Thieving 55) in the East Ardougne market, Paladin id 365 at the castle courtyard 2572,3296 (Thieving 70; keeps castle doors open), or Hero by name in the East Ardougne market (Thieving 80)"
    },
    foodType: {
      type: "string",
      default: "Cake",
      options: FOOD_OPTIONS,
      label: "Food",
      group: "Food",
      help: "Cake eats leftovers first (Slice of cake \u2192 2/3 cake \u2192 Cake). Shrimp / Anchovies withdraws Shrimps first then Anchovies. Chocolate slice, Tuna, and Lobster eat/withdraw that item only. None disables food (use Wait for HP regen)."
    },
    eatAtHp: {
      type: "number",
      default: 10,
      min: 1,
      max: 30,
      label: "Hitpoints threshold",
      group: "Food",
      help: "With food on: eat at or below this HP. With Wait for HP regen on (and Food set to None): pause thieving until HP regenerates above this (1\u201330)"
    },
    waitForHp: {
      type: "boolean",
      default: false,
      label: "Wait for HP regen (no food)",
      group: "Food",
      showIf: { key: "foodType", anyOf: ["None"] },
      help: "For accounts with no food: when Food is None, pause pickpocketing at/below the Hitpoints threshold until HP regenerates. Ignored while a food type is selected. SET FOOD TO NONE OTHERWISE WE WILL SIT AT THE BANK WAITING FOR FOOD THAT WILL NEVER COME :("
    },
    foodWithdraw: {
      type: "number",
      default: 20,
      min: 1,
      max: 27,
      label: "Amount to withdraw",
      group: "Food",
      showIf: { key: "foodType", anyOf: ["Cake", "Chocolate slice", FOOD_TYPE_SHRIMP, "Tuna", "Lobster"] },
      help: "When out of food, bank and withdraw this many of the selected food. Cake order: Cake \u2192 2/3 cake \u2192 Slice of cake (can mix). Shrimp / Anchovies: Shrimps \u2192 Anchovies (can mix). If Steal cakes and Catch and cook are both off, stops when the selected food is not in the bank."
    },
    stealCakes: {
      type: "boolean",
      default: true,
      label: "Steal cakes (Baker stall)",
      group: "Food",
      showIf: { key: "foodType", anyOf: ["Cake"] },
      help: "On by default when Food is Cake. When the bank has no Cake / 2/3 cake / Slice of cake: steal from the East Ardougne Baker stall (same as ArdyCakes) until 200 cakes are banked, then withdraw food and resume pickpocketing. Takes priority over Catch and cook. Turn off to use Catch and cook or stop when cakes are gone."
    },
    catchAndCook: {
      type: "boolean",
      default: true,
      label: "Catch and cook (Catherby)",
      group: "Food",
      showIf: { key: "foodType", anyOf: ["Cake", "Chocolate slice", FOOD_TYPE_SHRIMP, "Tuna", "Lobster"] },
      help: "On by default. When the bank has no cooked Lobster: walk to Catherby, withdraw a Lobster pot (or buy one from Harry), cage 500 lobsters on Cage+Harpoon spots, cook them on the bank-house Range, bank them, withdraw Lobster, and return to thieving. Skipped while Steal cakes is on (Cake food restocks at the Baker stall first). Cake or other food still in the bank does not skip this when Steal cakes is off. Does not stop the script if Fishing/Cooking is under 40 \u2014 it still walks to Catherby. Turn off to stop when bank food is gone."
    },
    muleOn: {
      type: "boolean",
      default: true,
      label: "Mule mode",
      group: "Mule",
      help: "On by default. Keep pickpocketing and banking Coins (item id 995). Once banked gp exceeds 100,000, withdraw ALL coins at East Ardougne bank (2653,3284) and trade them to Ben. After the trade, resume thieving. Pause \u2192 Edit parameters to toggle without stopping."
    }
  },
  create: () => new ArdougneThiever()
});
export {
  ArdougneThiever_default as default
};
