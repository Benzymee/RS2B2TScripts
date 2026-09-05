/**
 * ProgressiveChopper. Falador trees -> Varrock oaks -> Draynor willows -> Seers maples -> Edgeville yews.
 * Moves on when woodcutting (and fletching, if that toggle is on) can use the next tree.
 * At fletching 65: Edgeville yews, yew shortbows (u), then yew longbows (u) at 70. Banks at Edgeville.
 * After buying a Steel axe from Bob, drops the Bronze axe and leftover coins.
 * If fletching is on and there is no Knife in the bank, picks up the Lumbridge castle spawn
 * (Edgeville yews stop instead if the Edgeville bank has none).
 *
 * Load URL: https://cdn.jsdelivr.net/gh/Benzymee/RS2B2TScripts@main/ProgressiveChopper.js
 * Completely vibe coded by @.benzyme on Discord via Cursor AI
 * Self-contained ESM for rs2b0t Load local script / Load URL.
 */
const SUPPORTED_API_VERSION = 1;
const abi = globalThis.__rs2b0t;
if (!abi) {
  throw new Error("ProgressiveChopper: globalThis.__rs2b0t missing, load inside rs2b0t bot.html");
}
if (abi.apiVersion !== SUPPORTED_API_VERSION) {
  throw new Error(`ProgressiveChopper: ABI ${abi.apiVersion} != supported ${SUPPORTED_API_VERSION}`);
}

const {
  defineBot,
  Execution,
  Game,
  LoopingBot: LoopingBotBase,
  Locs,
  Npcs,
  Players,
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

const SCRIPT_NAME = "ProgressiveChopper";
const SCRIPT_TITLE = "Benzyme's Progressive Chopper";
const SCRIPT_VERSION = "1.1.0";

const TITLE_WOOD = "#a67c52";
const WELCOME_SCREEN_ID = 5993;

const GEAR_KNIFE_SPAWN = new Tile(3224, 3202, 0);
const EDGEVILLE_BANK = new Tile(3093, 3493, 0);
const BANK_OPEN_RADIUS = 8;
const GEAR_BOB_STAND = new Tile(3231, 3203, 0);
const GEAR_STEEL_AXE = "Steel axe";
const GEAR_STEEL_COST = 250;
const GEAR_BRONZE_AXE = "Bronze axe";
const GEAR_BROKEN_AXE = "Broken axe";
const GEAR_REPAIR_PREFER = ["repair", "fix", "fix my", "yes"];
const GEAR_REPAIR_COIN_FLOAT = 1000;
const BOAT_LEG_GP = 30;

const ARDOUGNE_DOCK = new Tile(2683, 3275, 0);
const BRIMHAVEN_DOCK = new Tile(2772, 3227, 0);
const MUSA_DOCK = new Tile(2956, 3146, 0);
const PORT_SARIM_DOCK = new Tile(3029, 3217, 0);

const ARDY_SAILORS = ["Captain Barnaby"];
const BRIM_SAILORS = ["Captain Barnaby", "Customs officer", "Customs Officer"];
const SARIM_SAILORS = ["Captain Tobias", "Seaman Lorris", "Seaman Thresnor"];
const MUSA_SAILORS = ["Customs officer", "Customs Officer", "Captain Tobias", "Seaman Lorris"];

const KARAMJA_DIALOG_PREFER = ["musa point", "karamja", "yes please", "yes"];
const SARIM_RETURN_DIALOG = [
  "port sarim",
  "sarim",
  "search away",
  "nothing to hide",
  "yes please",
  "yes"
];
const BRIMHAVEN_DIALOG_PREFER = [
  "brimhaven",
  "i'd like to go to brimhaven",
  "yes please",
  "yes",
  "ok",
  "okay"
];
const ARDOUGNE_DIALOG_PREFER = [
  "search away",
  "nothing to hide",
  "can i journey",
  "journey on this ship",
  "ardougne",
  "i'd like to go to ardougne",
  "ok",
  "okay",
  "yes please",
  "yes"
];
const BOAT_DIALOG_AVOID = [
  "no, thank",
  "no thank",
  "i'm good",
  "nowhere",
  "rimmington",
  "pandemonium",
  "actually, i don",
  "pay you nothing",
  "not bother",
  "unusual customs",
  "personal use",
  "you're not putting",
  "why?"
];
const TALK_OP = "Talk-to";

const CAMPS = [
  {
    id: "regular",
    label: "regular trees (Falador)",
    treeName: "Tree",
    wood: "",
    wcLevel: 1,
    fletchLevel: 1,
    shortLevel: 5,
    longLevel: 10,
    shortLabel: "Shortbow",
    longLabel: "Longbow",
    logLabel: "Logs",
    anchor: new Tile(2953, 3407, 0),
    leash: 15,
    waitName: "tree"
  },
  {
    id: "oak",
    label: "oaks (Varrock)",
    treeName: "Oak",
    wood: "oak",
    wcLevel: 15,
    fletchLevel: 20,
    shortLevel: 20,
    longLevel: 25,
    shortLabel: "Oak shortbow",
    longLabel: "Oak longbow",
    logLabel: "Oak logs",
    anchor: new Tile(3166, 3416, 0),
    leash: 20,
    waitName: "oak"
  },
  {
    id: "willow",
    label: "willows (Draynor)",
    treeName: "Willow",
    wood: "willow",
    wcLevel: 30,
    fletchLevel: 35,
    shortLevel: 35,
    longLevel: 40,
    shortLabel: "Willow shortbow",
    longLabel: "Willow longbow",
    logLabel: "Willow logs",
    anchor: new Tile(3087, 3235, 0),
    leash: 20,
    waitName: "willow"
  },
  {
    id: "maple",
    label: "maples (Seers)",
    treeName: "Maple tree",
    wood: "maple",
    wcLevel: 45,
    fletchLevel: 50,
    shortLevel: 50,
    longLevel: 55,
    shortLabel: "Maple shortbow",
    longLabel: "Maple longbow",
    logLabel: "Maple logs",
    anchor: new Tile(2726, 3500, 0),
    leash: 20,
    waitName: "maple"
  },
  {
    id: "yew",
    label: "yews (Edgeville)",
    treeName: "Yew",
    wood: "yew",
    wcLevel: 60,
    fletchLevel: 65,
    shortLevel: 65,
    longLevel: 70,
    shortLabel: "Yew shortbow (u)",
    longLabel: "Yew longbow (u)",
    logLabel: "Yew logs",
    anchor: new Tile(3087, 3476, 0),
    leash: 16,
    waitName: "yew"
  }
];

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
    (t) =>
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
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
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

function campById(id) {
  return CAMPS.find((c) => c.id === id) ?? CAMPS[0];
}

function pickCamp(wc, fl, fletchOn) {
  let pick = CAMPS[0];
  for (const camp of CAMPS) {
    if (wc < camp.wcLevel) {
      break;
    }
    if (fletchOn && fl < camp.fletchLevel) {
      break;
    }
    pick = camp;
  }
  return pick;
}

function gearAxeRank(name) {
  const want = (name ?? "").toLowerCase();
  const i = AXES.findIndex((t) => t.name.toLowerCase() === want);
  return i < 0 ? 999 : i;
}

function gearHasKnife() {
  return (
    Inventory.count("Knife") > 0 ||
    Inventory.items().some((i) => (i.name ?? "").toLowerCase() === "knife")
  );
}

function gearInvCoins() {
  return Inventory.items()
    .filter((i) => {
      const n = (i.name ?? "").toLowerCase();
      return n === "coins" || n === "coin";
    })
    .reduce((n, i) => n + Math.max(0, i.count), 0);
}

function gearBankCoins() {
  return Bank.count("Coins") || 0;
}

function gearAxeCount(name) {
  return (Inventory.count(name) || 0) + (Equipment.contains(name) ? 1 : 0);
}

function gearBestHeldAxe() {
  return bestAxe(Skills.level("woodcutting"), (n) => gearAxeCount(n) > 0);
}

function bestUsableAxe() {
  const wc = Skills.level("woodcutting");
  return (
    bestAxe(wc, (n) => gearAxeCount(n) > 0 || (Bank.isOpen() && (Bank.count(n) || 0) > 0)) ??
    gearBestHeldAxe() ??
    null
  );
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

function hasBronzeInPack() {
  return (
    Equipment.contains(GEAR_BRONZE_AXE) ||
    (Inventory.count(GEAR_BRONZE_AXE) || 0) > 0 ||
    Inventory.items().some((i) => (i.name ?? "").toLowerCase() === "bronze axe")
  );
}

function gearHasBrokenAxe() {
  return (
    Equipment.contains(GEAR_BROKEN_AXE) ||
    (Inventory.count(GEAR_BROKEN_AXE) || 0) > 0 ||
    Inventory.items().some((i) => (i.name ?? "").toLowerCase() === "broken axe")
  );
}

function gearPickRepairOption(options) {
  for (const p of GEAR_REPAIR_PREFER) {
    const hit = options.find((o) => (o ?? "").toLowerCase().includes(p.toLowerCase()));
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
    const opts = typeof ChatDialog.options === "function" ? ChatDialog.options() : [];
    if (opts.length > 0) {
      const pick = gearPickRepairOption(opts);
      if (!pick) {
        log(`gear: no repair option in [${opts.join(" | ")}]`);
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
  if (typeof Bank.loaded === "function") {
    await Execution.delayUntil(() => Bank.loaded() || Bank.items().length > 0, 3000);
  }
  await Execution.delayTicks(1);
}

function inBox(tile, x0, z0, x1, z1) {
  if (!tile) {
    return false;
  }
  const x = tile.x;
  const z = tile.z;
  return x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && z >= Math.min(z0, z1) && z <= Math.max(z0, z1);
}

function regionOf(tile) {
  if (!tile) {
    return "unknown";
  }
  if (inBox(tile, 2650, 3360, 2760, 3520)) {
    return "seers";
  }
  if (inBox(tile, 2755, 3410, 2865, 3465)) {
    return "catherby";
  }
  if (inBox(tile, 2500, 3260, 2730, 3380)) {
    return "ardougne";
  }
  if (inBox(tile, 2740, 3140, 2820, 3290)) {
    return "brimhaven";
  }
  if (inBox(tile, 2880, 3100, 2985, 3200)) {
    return "musa";
  }
  if (inBox(tile, 3005, 3175, 3060, 3260)) {
    return "sarim";
  }
  if (inBox(tile, 3185, 3185, 3265, 3265)) {
    return "lumbridge";
  }
  if (inBox(tile, 2820, 3100, 2985, 3290)) {
    return "karamja";
  }
  return "unknown";
}

function onKaramjaIsland(tile = Game.tile()) {
  const r = regionOf(tile);
  return r === "brimhaven" || r === "musa" || r === "karamja";
}

function inArdougneArea(tile = Game.tile()) {
  return regionOf(tile) === "ardougne";
}

function nearTile(tile, dest, radius) {
  return !!tile && !!dest && Tile.from(tile).distanceTo(dest) <= radius;
}

function nearBob(tile = Game.tile()) {
  return nearTile(tile, GEAR_BOB_STAND, 12);
}

function nearEdgevilleBank(tile = Game.tile()) {
  return nearTile(tile, EDGEVILLE_BANK, BANK_OPEN_RADIUS);
}

function otherPlayersNear(tile, dist = 2) {
  if (!tile || typeof Players?.query !== "function") {
    return 0;
  }
  const t = Tile.from(tile);
  const q = Players.query().where((p) => {
    const pt = typeof p.tile === "function" ? p.tile() : p.tile;
    return pt != null && Tile.from(pt).distanceTo(t) <= dist;
  });
  if (typeof q.count === "function") {
    return q.count();
  }
  const list = typeof q.results === "function" ? q.results() ?? [] : [];
  return list.length;
}

function kandarinNeedsBoat(tile = Game.tile()) {
  if (!tile || onKaramjaIsland(tile)) {
    return !!tile && onKaramjaIsland(tile);
  }
  if (inArdougneArea(tile)) {
    return true;
  }
  const r = regionOf(tile);
  if (r === "seers" || r === "catherby") {
    return true;
  }
  return tile.x < 2944 && (tile.z ?? 0) < 3520 && (tile.z ?? 0) > 3100;
}

function dialogOpen() {
  if (ChatDialog.canContinue()) {
    return true;
  }
  return (
    typeof ChatDialog.isOpen === "function" &&
    ChatDialog.isOpen() &&
    typeof ChatDialog.options === "function" &&
    ChatDialog.options().length > 0
  );
}

function pickBoatOption(options, prefer) {
  const prefs = Array.isArray(prefer) ? prefer : [prefer];
  const usable = options.filter((o) => {
    const low = (o ?? "").toLowerCase();
    return !BOAT_DIALOG_AVOID.some((a) => low.includes(a));
  });
  const pool = usable.length > 0 ? usable : options;
  for (const p of prefs) {
    const hit = pool.find((o) => (o ?? "").toLowerCase().includes(p.toLowerCase()));
    if (hit) {
      return hit;
    }
  }
  const yes = pool.find((o) => /^yes/i.test(o ?? ""));
  if (yes) {
    return yes;
  }
  return pool.length > 0 ? pool[0] : null;
}

function talkOp(npc) {
  const acts = typeof npc.actions === "function" ? npc.actions() : [];
  return acts.find((a) => /^talk/i.test(a ?? "")) ?? TALK_OP;
}

function chopOp(actions) {
  return actions.find((a) => /chop/i.test(a)) ?? null;
}

function isAxeItemName(name) {
  const n = normName(name);
  if (n === "broken axe") {
    return true;
  }
  return AXES.some((t) => t.name.toLowerCase() === n);
}

function isKeepTool(name) {
  if (!name) {
    return false;
  }
  const n = normName(name);
  if (n === "knife") {
    return true;
  }
  if (n === "broken axe") {
    return true;
  }
  const best = bestUsableAxe();
  if (best && n === normName(best)) {
    return true;
  }
  const held = gearBestHeldAxe();
  return !!(held && n === normName(held));
}

function normName(name) {
  return (name ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function isShaft(name) {
  if (!name) {
    return false;
  }
  return normName(name).includes("arrow shaft");
}

function isCampLog(name, camp) {
  const n = normName(name);
  if (camp.id === "regular") {
    return n === "logs" || n === "log";
  }
  return n === `${camp.wood} logs` || n === `${camp.wood} log`;
}

function isAnyLog(name) {
  const n = normName(name);
  if (n === "logs" || n === "log") {
    return true;
  }
  return n.endsWith(" logs") || n.endsWith(" log");
}

function isCampShortbow(name, camp) {
  const n = normName(name);
  if (!(n.includes("short") && n.includes("bow"))) {
    return false;
  }
  if (camp.id === "regular") {
    return (
      !n.includes("oak") &&
      !n.includes("willow") &&
      !n.includes("maple") &&
      !n.includes("yew") &&
      !n.includes("magic")
    );
  }
  return n.includes(camp.wood);
}

function isCampLongbow(name, camp) {
  const n = normName(name);
  if (!(n.includes("long") && n.includes("bow"))) {
    return false;
  }
  if (camp.id === "regular") {
    return (
      !n.includes("oak") &&
      !n.includes("willow") &&
      !n.includes("maple") &&
      !n.includes("yew") &&
      !n.includes("magic")
    );
  }
  return n.includes(camp.wood);
}

function isCampBow(name, camp) {
  return isCampShortbow(name, camp) || isCampLongbow(name, camp);
}

function isAnyBow(name) {
  const n = normName(name);
  if (!n.includes("bow")) {
    return false;
  }
  return !n.includes("string");
}

function isCoins(name) {
  const n = (name ?? "").toLowerCase();
  return n === "coins" || n === "coin";
}

function isYewKeepItem(name) {
  if (!name) {
    return false;
  }
  if (isKeepTool(name) || isCoins(name)) {
    return true;
  }
  const n = normName(name);
  if (n === "yew logs" || n === "yew log") {
    return true;
  }
  return n.includes("yew") && n.includes("bow");
}

function fletchPlan(camp, level, fletchOn) {
  if (!fletchOn) {
    return {
      id: "logs",
      menuMatch: "",
      label: `${camp.logLabel} (bank)`,
      bank: true,
      fletch: false
    };
  }
  if (level < camp.shortLevel) {
    if (camp.id === "regular") {
      return {
        id: "shafts",
        menuMatch: "shaft",
        label: "Arrow shafts",
        bank: false,
        fletch: true
      };
    }
    return {
      id: "logs",
      menuMatch: "",
      label: `${camp.logLabel} (bank)`,
      bank: true,
      fletch: false
    };
  }
  if (level < camp.longLevel) {
    return {
      id: `${camp.id}-shortbow`,
      menuMatch: "short",
      label: camp.shortLabel,
      bank: true,
      fletch: true
    };
  }
  return {
    id: `${camp.id}-longbow`,
    menuMatch: "long",
    label: camp.longLabel,
    bank: true,
    fletch: true
  };
}

function matchMakeProduct(products, menuMatch, camp) {
  const want = menuMatch.toLowerCase();
  if (want === "shaft") {
    return (
      products.find((p) => {
        const n = (p ?? "").toLowerCase();
        return n.includes("shaft") || n.includes("arrow head") || n.includes("arrowhead");
      }) ?? null
    );
  }
  let pool = products;
  if (camp.wood) {
    const typed = products.filter((p) => (p ?? "").toLowerCase().includes(camp.wood));
    if (typed.length > 0) {
      pool = typed;
    }
  } else {
    const plain = products.filter((p) => {
      const n = (p ?? "").toLowerCase();
      return !n.includes("oak") && !n.includes("willow") && !n.includes("maple") && !n.includes("yew");
    });
    if (plain.length > 0) {
      pool = plain;
    }
  }
  return pool.find((p) => (p ?? "").toLowerCase().includes(want)) ?? null;
}

function knifeItem() {
  return Inventory.items().find((i) => (i.name ?? "").toLowerCase().includes("knife")) ?? null;
}

class ProgressiveChopper extends LoopingBotBase {
  status = "starting";
  startedAt = 0;
  wcXpAtStart = 0;
  fletchXpAtStart = 0;
  chopped = 0;
  fletched = 0;
  bankTrips = 0;
  planId = "logs";
  activeCampId = "regular";
  gearReady = false;
  needSteelBuy = false;
  justBoughtSteel = false;
  starterJunkDropped = false;
  /** @type {null | "to_bob" | "home"} */
  repairTrip = null;
  repairBanked = false;

  fletchEnabled() {
    return this.settings?.bool("fletchLogs", true) ?? true;
  }

  camp() {
    return campById(this.activeCampId);
  }

  desiredCamp() {
    return pickCamp(Skills.level("woodcutting"), Skills.level("fletching"), this.fletchEnabled());
  }

  currentPlan() {
    return fletchPlan(this.camp(), Skills.level("fletching"), this.fletchEnabled());
  }

  logCount() {
    const camp = this.camp();
    return Inventory.items()
      .filter((i) => isCampLog(i.name, camp))
      .reduce((n, i) => n + Math.max(1, i.count), 0);
  }

  lastLog() {
    const camp = this.camp();
    const items = Inventory.items();
    for (let i = items.length - 1; i >= 0; i--) {
      if (isCampLog(items[i].name, camp)) {
        return items[i];
      }
    }
    return null;
  }

  bowCount() {
    const camp = this.camp();
    return Inventory.items()
      .filter((i) => isCampBow(i.name, camp))
      .reduce((n, i) => n + Math.max(1, i.count), 0);
  }

  shortbowCount() {
    const camp = this.camp();
    return Inventory.items()
      .filter((i) => isCampShortbow(i.name, camp))
      .reduce((n, i) => n + Math.max(1, i.count), 0);
  }

  shaftCount() {
    return Inventory.items()
      .filter((i) => isShaft(i.name))
      .reduce((n, i) => n + Math.max(1, i.count), 0);
  }

  leftoverCount() {
    return Inventory.items()
      .filter((i) => isAnyLog(i.name) || isAnyBow(i.name) || isShaft(i.name))
      .reduce((n, i) => n + Math.max(1, i.count), 0);
  }

  needsBankTrip(plan, switching) {
    if (switching && this.leftoverCount() > 0) {
      return true;
    }
    const logs = this.logCount();
    if (plan.fletch && logs > 0) {
      return false;
    }
    if (!plan.fletch && logs > 0 && Inventory.isFull()) {
      return true;
    }
    if (plan.bank && this.bowCount() > 0) {
      return true;
    }
    if (plan.fletch && logs === 0 && this.bowCount() > 0) {
      return true;
    }
    return plan.id !== "shafts" && this.shaftCount() > 0;
  }

  async onStart() {
    await Execution.delayUntil(() => Game.ingame() && Game.tile() !== null, 0);
    Traversal.preload();

    this.startedAt = Date.now();
    this.wcXpAtStart = Skills.xp("woodcutting");
    this.fletchXpAtStart = Skills.xp("fletching");
    this.activeCampId = this.desiredCamp().id;
    this.planId = this.currentPlan().id;
    this.gearReady = false;
    this.needSteelBuy = false;
    this.justBoughtSteel = false;
    this.starterJunkDropped = gearHasSteelOrBetter() && !hasBronzeInPack();
    this.repairTrip = null;
    this.repairBanked = false;

    this.on("skill.level", (e) => {
      if (e.name === "fletching") {
        const plan = this.currentPlan();
        this.log(`fletching ${e.previous} -> ${e.level}, now making ${plan.label}`);
        this.planId = plan.id;
      }
      if (e.name === "woodcutting") {
        this.log(`woodcutting ${e.previous} -> ${e.level}`);
        if (e.previous < 6 && e.level >= 6 && !gearHasSteelOrBetter()) {
          this.needSteelBuy = true;
        }
      }
      if (e.name === "woodcutting" || e.name === "fletching") {
        const next = this.desiredCamp();
        if (next.id !== this.activeCampId) {
          this.log(`progress: ${next.label} unlocked (WC ${Skills.level("woodcutting")}, Fletch ${Skills.level("fletching")})`);
        }
      }
    });

    const camp = this.camp();
    const plan = this.currentPlan();
    this.log(
      `${SCRIPT_TITLE} starting at ${camp.label} ` +
        (this.fletchEnabled()
          ? `fletching ${Skills.level("fletching")} -> ${plan.label}`
          : "banking logs (fletch off)")
    );
    this.status = "ready";
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

    if (ChatDialog.canContinue()) {
      this.status = "continue dialog";
      await ChatDialog.continue();
      return;
    }

    if (!ChatDialog.isMakeMenu() && this.camp().id === "yew" && (await this.handleDropJunk())) {
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

    const nextCamp = this.desiredCamp();
    const switching = nextCamp.id !== this.activeCampId;
    const plan = this.currentPlan();
    this.planId = plan.id;

    if (ChatDialog.isMakeMenu()) {
      if (plan.fletch) {
        await this.chooseMakeProduct(plan);
      }
      return;
    }

    if (plan.fletch && this.logCount() > 0 && Inventory.isFull()) {
      await this.fletchLogs(plan);
      return;
    }

    if (
      plan.fletch &&
      this.logCount() > 0 &&
      Game.animating() &&
      this.bowCount() === 0 &&
      !this.findTreeWithin(2)
    ) {
      this.status = `fletching ${plan.label}`;
      await Execution.delayTicks(1);
      return;
    }

    if (switching && plan.fletch && this.logCount() > 0) {
      await this.fletchLogs(plan);
      return;
    }

    if (this.needsBankTrip(plan, switching)) {
      await this.bankProductsAndReturn(nextCamp);
      return;
    }

    if (!plan.fletch && Inventory.isFull() && this.logCount() > 0) {
      await this.bankProductsAndReturn(nextCamp);
      return;
    }

    if (switching) {
      this.log(`progress: walking to ${nextCamp.label}`);
      this.activeCampId = nextCamp.id;
    }

    const camp = this.camp();
    const here = Game.tile();
    if (!here) {
      await Execution.delayTicks(2);
      return;
    }

    if (Tile.from(here).distanceTo(camp.anchor) > camp.leash) {
      if (this.repairTrip) {
        await Execution.delayTicks(1);
        return;
      }
      this.status = `walking to ${camp.waitName}s`;
      this.log(`walking to ${camp.label}`);
      await Traversal.walkResilient(camp.anchor, {
        radius: 4,
        log: (m) => this.log(`  ${m}`)
      });
      return;
    }

    if (Game.animating()) {
      this.status = "chopping";
      await Execution.delayTicks(1);
      return;
    }

    const tree = this.findTree();
    if (!tree) {
      this.status = `waiting for ${camp.waitName}`;
      await Traversal.walkTo(camp.anchor, { radius: 3, timeoutMs: 10_000 });
      await Execution.delayTicks(2);
      return;
    }

    const op = chopOp(tree.actions());
    if (!op) {
      this.log(`${camp.treeName} has no chop action: [${tree.actions().join(", ")}]`);
      await Execution.delayTicks(2);
      return;
    }

    const before = this.logCount();
    const contested = camp.id === "yew" ? otherPlayersNear(tree.tile(), 2) : 0;
    this.status = contested
      ? `chopping contested (${tree.distance()}t)`
      : `chopping (${tree.distance()}t)`;
    this.log(
      `chopping ${camp.treeName} @ ${tree.tile().x},${tree.tile().z}` +
        (contested ? ` (${contested} other player(s) on it)` : "")
    );
    await tree.interact(op);
    const gotLog = await Execution.delayUntil(
      () => this.logCount() > before || Game.animating() || ChatDialog.canContinue(),
      8000
    );
    if (this.logCount() > before) {
      this.chopped += this.logCount() - before;
    } else if (gotLog && Game.animating()) {
      await Execution.delayUntil(
        () => this.logCount() > before || !Game.animating() || ChatDialog.canContinue(),
        20_000
      );
      if (this.logCount() > before) {
        this.chopped += this.logCount() - before;
      }
    }
  }

  maybeQueueSteelBuy() {
    if (gearHasSteelOrBetter()) {
      this.needSteelBuy = false;
      return;
    }
    if (Skills.level("woodcutting") < 6) {
      return;
    }
    if (Bank.isOpen() && gearBankCoins() + gearInvCoins() >= GEAR_STEEL_COST) {
      this.needSteelBuy = true;
    }
  }

  async repairBrokenAxeAtBob() {
    this.status = "gear: repair";
    this.repairTrip = "to_bob";

    if (Shop.isOpen()) {
      await Shop.close();
      return true;
    }

    if (Equipment.contains(GEAR_BROKEN_AXE) && !Inventory.isFull()) {
      this.log("gear: unequipping Broken axe");
      await Equipment.unequip(GEAR_BROKEN_AXE);
      await Execution.delayTicks(1);
    }

    if (await this.prepRepairBank()) {
      return true;
    }

    const broken = Inventory.first(GEAR_BROKEN_AXE);
    if (!broken) {
      this.log("gear: Broken axe not in pack after prep");
      this.repairBanked = false;
      await Execution.delayTicks(3);
      return true;
    }

    if (!nearBob()) {
      await this.stepTravelToBob();
      return true;
    }

    const bob = Npcs.query().name("Bob").within(12).nearest();
    if (!bob) {
      this.log("gear: Bob not nearby, walking in");
      await Traversal.walkResilient(GEAR_BOB_STAND, {
        radius: 2,
        log: (m) => this.log(`  ${m}`)
      });
      return true;
    }

    const before = Inventory.count(GEAR_BROKEN_AXE) || 0;
    this.log("gear: using Broken axe on Bob");
    if (!(await broken.useOn(bob))) {
      this.log("gear: use-on Bob failed");
      await Execution.delayTicks(2);
      return true;
    }

    if (!(await Execution.delayUntil(() => ChatDialog.isOpen() || ChatDialog.canContinue(), 8000))) {
      this.log("gear: Bob never opened repair dialogue");
      await Execution.delayTicks(3);
      return true;
    }

    await gearDriveRepairDialog((m) => this.log(m));
    await Execution.delayTicks(2);

    const after = Inventory.count(GEAR_BROKEN_AXE) || 0;
    if (after < before || !gearHasBrokenAxe()) {
      this.log("gear: axe repaired at Bob, heading back to camp");
      await this.wieldOrKeepBestAxe();
      if (!gearBestHeldAxe() || (this.fletchEnabled() && !gearHasKnife())) {
        this.gearReady = false;
      }
      this.repairTrip = "home";
      this.repairBanked = false;
    } else {
      this.log("gear: Bob did not repair, will retry");
    }
    return true;
  }

  async prepRepairBank() {
    const here = Game.tile();
    const region = regionOf(here);
    const onRoute =
      region === "ardougne" ||
      region === "brimhaven" ||
      region === "musa" ||
      region === "karamja" ||
      region === "sarim" ||
      region === "lumbridge" ||
      nearBob(here);
    const canSkipBank =
      gearHasBrokenAxe() &&
      (this.repairBanked || onRoute) &&
      (gearInvCoins() >= BOAT_LEG_GP || nearBob(here) || region === "lumbridge" || region === "sarim");
    if (canSkipBank) {
      this.repairBanked = true;
      if (Bank.isOpen()) {
        await Bank.close();
        await Execution.delayTicks(1);
      }
      return false;
    }

    this.status = "gear: repair bank";
    if (!Bank.isOpen()) {
      this.log(
        this.camp().id === "yew"
          ? "gear: Edgeville bank for Broken axe + coins (repair)"
          : "gear: bank for Broken axe + coins (repair)"
      );
      if (!(await this.openCampBank())) {
        this.log("gear: could not open bank for repair coins");
        await Execution.delayTicks(3);
        return true;
      }
    }
    await gearWaitBankLoaded();

    this.log("gear: depositing extras (keep knife and axe)");
    await Bank.depositAllMatching((name) => !isKeepTool(name));
    await Execution.delayTicks(1);

    if (!gearHasBrokenAxe() && (Bank.count(GEAR_BROKEN_AXE) || 0) > 0) {
      this.log("gear: withdrawing Broken axe from bank");
      await Bank.withdrawX(GEAR_BROKEN_AXE, 1);
      await Execution.delayTicks(1);
    }

    const need = GEAR_REPAIR_COIN_FLOAT - gearInvCoins();
    if (need > 0) {
      const have = gearBankCoins();
      if (have <= 0 && gearInvCoins() <= 0) {
        this.log("gear: need coins in bank to repair at Bob, waiting");
        await Bank.close();
        await Execution.delayTicks(8);
        return true;
      }
      const take = Math.min(need, have);
      if (take > 0) {
        this.log(`gear: withdrawing ${take}gp (want ${GEAR_REPAIR_COIN_FLOAT}gp for repair)`);
        await Bank.withdrawX("Coins", take);
        await Execution.delayTicks(1);
      }
    }

    await Bank.close();
    await Execution.delayTicks(1);

    if (!gearHasBrokenAxe()) {
      this.log("gear: Broken axe not in pack or bank");
      return true;
    }

    this.repairBanked = true;
    this.log(`gear: repair pack ready, ${gearInvCoins()}gp`);
    return false;
  }

  async stepTravelToBob() {
    const here = Game.tile();
    const region = regionOf(here);

    if (!kandarinNeedsBoat(here) && this.camp().id !== "maple") {
      this.status = "gear: walk Bob";
      this.log(`gear: walking to Bob @ ${GEAR_BOB_STAND.x},${GEAR_BOB_STAND.z}`);
      await Traversal.walkResilient(GEAR_BOB_STAND, {
        radius: 2,
        log: (m) => this.log(`  ${m}`)
      });
      return;
    }

    if (dialogOpen() && (region === "ardougne" || region === "musa")) {
      await this.stepSailorDialog(region === "ardougne" ? BRIMHAVEN_DIALOG_PREFER : SARIM_RETURN_DIALOG);
      return;
    }

    if (region === "musa" || region === "karamja") {
      if (!nearTile(here, MUSA_DOCK, 8)) {
        this.status = "gear: walk Musa";
        this.log(`gear: Karamja, walking to Musa Customs @ ${MUSA_DOCK.x},${MUSA_DOCK.z}`);
        await Traversal.walkResilient(MUSA_DOCK, {
          radius: 4,
          log: (m) => this.log(`  ${m}`)
        });
        return;
      }
      this.status = "gear: boat Sarim";
      await this.boatPortSarimFromMusa();
      return;
    }

    if (region === "brimhaven" || nearTile(here, BRIMHAVEN_DOCK, 8)) {
      this.status = "gear: walk Musa";
      this.log(`gear: Brimhaven, walking to Musa dock @ ${MUSA_DOCK.x},${MUSA_DOCK.z}`);
      await Traversal.walkResilient(MUSA_DOCK, {
        radius: 4,
        log: (m) => this.log(`  ${m}`)
      });
      return;
    }

    if (region === "ardougne" || nearTile(here, ARDOUGNE_DOCK, 8)) {
      this.status = "gear: boat Brimhaven";
      await this.boatBrimhavenFromArdougne();
      return;
    }

    if (kandarinNeedsBoat(here)) {
      this.status = "gear: walk Ardougne";
      this.log(`gear: walking to Ardougne Barnaby @ ${ARDOUGNE_DOCK.x},${ARDOUGNE_DOCK.z}`);
      await Traversal.walkResilient(ARDOUGNE_DOCK, {
        radius: 4,
        log: (m) => this.log(`  ${m}`)
      });
      return;
    }

    this.status = "gear: walk Bob";
    this.log(`gear: walking to Bob @ ${GEAR_BOB_STAND.x},${GEAR_BOB_STAND.z}`);
    await Traversal.walkResilient(GEAR_BOB_STAND, {
      radius: 2,
      log: (m) => this.log(`  ${m}`)
    });
  }

  async travelHomeFromBob() {
    const camp = this.camp();
    const here = Game.tile();
    if (here && Tile.from(here).distanceTo(camp.anchor) <= camp.leash) {
      this.log("gear: back at camp");
      this.repairTrip = null;
      this.repairBanked = false;
      return false;
    }
    if (Shop.isOpen()) {
      await Shop.close();
      return true;
    }

    if (!kandarinNeedsBoat(here) && camp.id !== "maple") {
      this.status = "gear: walk camp";
      this.log(`gear: walking back to ${camp.label}`);
      await Traversal.walkResilient(camp.anchor, {
        radius: 4,
        log: (m) => this.log(`  ${m}`)
      });
      return true;
    }

    const region = regionOf(here);

    if (dialogOpen() && (region === "sarim" || region === "brimhaven")) {
      await this.stepSailorDialog(region === "brimhaven" ? ARDOUGNE_DIALOG_PREFER : KARAMJA_DIALOG_PREFER);
      return true;
    }

    if (region === "seers" || region === "ardougne" || region === "catherby") {
      this.status = "gear: walk camp";
      this.log(`gear: walking back to ${camp.label}`);
      await Traversal.walkResilient(camp.anchor, {
        radius: 4,
        log: (m) => this.log(`  ${m}`)
      });
      return true;
    }

    if (region === "brimhaven" || nearTile(here, BRIMHAVEN_DOCK, 8)) {
      this.status = "gear: boat Ardougne";
      await this.boatArdougneFromBrimhaven();
      return true;
    }

    if (region === "musa" || region === "karamja") {
      this.status = "gear: walk Brimhaven";
      this.log(`gear: Karamja, walking to Brimhaven dock @ ${BRIMHAVEN_DOCK.x},${BRIMHAVEN_DOCK.z}`);
      await Traversal.walkResilient(BRIMHAVEN_DOCK, {
        radius: 5,
        log: (m) => this.log(`  ${m}`)
      });
      return true;
    }

    if (region === "sarim" || nearTile(here, PORT_SARIM_DOCK, 6)) {
      this.status = "gear: boat Karamja";
      await this.boatKaramjaFromSarim();
      return true;
    }

    this.status = "gear: walk Port Sarim";
    this.log(`gear: walking to Port Sarim dock @ ${PORT_SARIM_DOCK.x},${PORT_SARIM_DOCK.z}`);
    await Traversal.walkResilient(PORT_SARIM_DOCK, {
      radius: 4,
      log: (m) => this.log(`  ${m}`)
    });
    return true;
  }

  async stepSailorDialog(prefer) {
    if (typeof ChatDialog.canContinue === "function" && ChatDialog.canContinue()) {
      this.status = "boat dialog";
      await ChatDialog.continue();
      await Execution.delayTicks(1);
      return true;
    }
    if (
      typeof ChatDialog.isOpen === "function" &&
      ChatDialog.isOpen() &&
      typeof ChatDialog.options === "function" &&
      ChatDialog.options().length > 0 &&
      typeof ChatDialog.chooseOption === "function"
    ) {
      const opts = ChatDialog.options();
      const pick = pickBoatOption(opts, prefer);
      this.status = `boat dialog: ${pick ?? "?"}`;
      this.log(`boat -> ${pick}  [${opts.join(" | ")}]`);
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

  movedFar(from, tiles) {
    const now = Game.tile();
    if (!from || !now) {
      return false;
    }
    return Tile.from(from).distanceTo(now) >= tiles;
  }

  async crossGangplank() {
    const plank = Locs.query()
      .within(10)
      .where((l) => /gangplank/i.test(l.name ?? ""))
      .nearest();
    if (!plank) {
      return false;
    }
    const acts = typeof plank.actions === "function" ? plank.actions() : [];
    const op = acts.find((a) => /cross|walk|climb/i.test(a ?? "")) ?? acts[0] ?? null;
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

  async talkSailorAndRide(npc, prefer, arrivedFn) {
    const before = Game.tile();
    const coinsBefore = gearInvCoins();
    const op = talkOp(npc);
    this.status = `Talk-to ${npc.name ?? "sailor"}`;
    this.log(`Talk-to ${npc.name} @ dock (${coinsBefore}gp)`);

    if (!(await npc.interact(op))) {
      await Execution.delayTicks(2);
      return false;
    }

    if (!(await Execution.delayUntil(() => dialogOpen() || arrivedFn() || this.movedFar(before, 15), 8000))) {
      this.log("sailor dialog did not open, retrying");
      return false;
    }

    for (let i = 0; i < 40; i++) {
      if (arrivedFn()) {
        return true;
      }
      if (!dialogOpen()) {
        if (await Execution.delayUntil(() => arrivedFn() || this.movedFar(before, 15) || dialogOpen(), 6000)) {
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

  findSailor(names, stand) {
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
        .where((n) => {
          const nm = (n.name ?? "").toLowerCase();
          return (
            nm.includes("barnaby") ||
            nm.includes("customs") ||
            nm.includes("captain") ||
            nm.includes("seaman") ||
            nm.includes("sailor")
          );
        })
        .nearest() ?? null
    );
  }

  async boatBrimhavenFromArdougne() {
    if (regionOf(Game.tile()) === "brimhaven" || onKaramjaIsland()) {
      this.log("gear: landed Brimhaven");
      return true;
    }
    if (gearInvCoins() < BOAT_LEG_GP) {
      this.log(`gear: need ${BOAT_LEG_GP}gp for Ardougne -> Brimhaven (have ${gearInvCoins()}gp)`);
      this.repairBanked = false;
      return false;
    }
    if (!nearTile(Game.tile(), ARDOUGNE_DOCK, 8)) {
      await Traversal.walkResilient(ARDOUGNE_DOCK, {
        radius: 4,
        timeoutMs: 10_000,
        log: (m) => this.log(`  ${m}`)
      });
      return false;
    }
    const sailor = this.findSailor(ARDY_SAILORS, ARDOUGNE_DOCK);
    if (!sailor) {
      this.status = "looking for Barnaby";
      await Traversal.walkResilient(ARDOUGNE_DOCK, {
        radius: 3,
        timeoutMs: 10_000,
        log: (m) => this.log(`  ${m}`)
      });
      return false;
    }
    const ok = await this.talkSailorAndRide(
      sailor,
      BRIMHAVEN_DIALOG_PREFER,
      () => regionOf(Game.tile()) === "brimhaven" || onKaramjaIsland()
    );
    if (ok || regionOf(Game.tile()) === "brimhaven" || onKaramjaIsland()) {
      this.log("gear: boat landed in Brimhaven");
      return true;
    }
    return false;
  }

  async boatPortSarimFromMusa() {
    if (!onKaramjaIsland()) {
      this.log("gear: landed Port Sarim");
      return true;
    }
    if (gearInvCoins() < BOAT_LEG_GP) {
      this.log(`gear: need ${BOAT_LEG_GP}gp for Musa -> Port Sarim (have ${gearInvCoins()}gp)`);
      this.repairBanked = false;
      return false;
    }
    if (!nearTile(Game.tile(), MUSA_DOCK, 8)) {
      await Traversal.walkResilient(MUSA_DOCK, {
        radius: 4,
        timeoutMs: 10_000,
        log: (m) => this.log(`  ${m}`)
      });
      return false;
    }
    const sailor = this.findSailor(MUSA_SAILORS, MUSA_DOCK);
    if (!sailor) {
      this.status = "looking for Customs";
      await Traversal.walkResilient(MUSA_DOCK, {
        radius: 3,
        timeoutMs: 10_000,
        log: (m) => this.log(`  ${m}`)
      });
      return false;
    }
    const ok = await this.talkSailorAndRide(sailor, SARIM_RETURN_DIALOG, () => !onKaramjaIsland());
    if (ok || !onKaramjaIsland()) {
      this.log("gear: boat landed in Port Sarim");
      return true;
    }
    return false;
  }

  async boatKaramjaFromSarim() {
    if (onKaramjaIsland()) {
      this.log("gear: landed Musa Point / Karamja");
      return true;
    }
    if (gearInvCoins() < BOAT_LEG_GP) {
      this.log(`gear: need ${BOAT_LEG_GP}gp for Port Sarim -> Karamja (have ${gearInvCoins()}gp)`);
      this.repairBanked = false;
      return false;
    }
    if (!nearTile(Game.tile(), PORT_SARIM_DOCK, 8)) {
      await Traversal.walkResilient(PORT_SARIM_DOCK, {
        radius: 4,
        timeoutMs: 10_000,
        log: (m) => this.log(`  ${m}`)
      });
      return false;
    }
    const sailor = this.findSailor(SARIM_SAILORS, PORT_SARIM_DOCK);
    if (!sailor) {
      this.status = "looking for Port Sarim sailor";
      await Traversal.walkResilient(PORT_SARIM_DOCK, {
        radius: 3,
        timeoutMs: 10_000,
        log: (m) => this.log(`  ${m}`)
      });
      return false;
    }
    const ok = await this.talkSailorAndRide(sailor, KARAMJA_DIALOG_PREFER, () => onKaramjaIsland());
    if (ok || onKaramjaIsland()) {
      this.log("gear: boat landed on Karamja");
      return true;
    }
    return false;
  }

  async boatArdougneFromBrimhaven() {
    if (inArdougneArea()) {
      this.log("gear: landed Ardougne");
      return true;
    }
    if (gearInvCoins() < BOAT_LEG_GP) {
      this.log(`gear: need ${BOAT_LEG_GP}gp for Brimhaven -> Ardougne (have ${gearInvCoins()}gp)`);
      this.repairBanked = false;
      return false;
    }
    if (!nearTile(Game.tile(), BRIMHAVEN_DOCK, 8)) {
      await Traversal.walkResilient(BRIMHAVEN_DOCK, {
        radius: 5,
        timeoutMs: 10_000,
        log: (m) => this.log(`  ${m}`)
      });
      return false;
    }
    const sailor = this.findSailor(BRIM_SAILORS, BRIMHAVEN_DOCK);
    if (!sailor) {
      this.status = "looking for Brimhaven sailor";
      await Traversal.walkResilient(BRIMHAVEN_DOCK, {
        radius: 3,
        timeoutMs: 10_000,
        log: (m) => this.log(`  ${m}`)
      });
      return false;
    }
    const ok = await this.talkSailorAndRide(sailor, ARDOUGNE_DIALOG_PREFER, () => inArdougneArea());
    if (ok || inArdougneArea()) {
      this.log("gear: boat landed in Ardougne");
      return true;
    }
    return false;
  }

  async prepWcGear() {
    if (ChatDialog.isMakeMenu()) {
      return false;
    }

    if (this.repairTrip === "home" && !gearHasBrokenAxe()) {
      return await this.travelHomeFromBob();
    }

    if (gearHasBrokenAxe() || (Bank.isOpen() && (Bank.count(GEAR_BROKEN_AXE) || 0) > 0)) {
      return await this.repairBrokenAxeAtBob();
    }

    if (this.gearReady && this.fletchEnabled() && !gearHasKnife()) {
      this.log(
        this.camp().id === "yew"
          ? "gear: Knife missing, checking Edgeville bank"
          : "gear: Knife missing, checking nearest bank"
      );
      this.gearReady = false;
    }

    if (this.needSteelBuy && Shop.isOpen()) {
      return await this.buySteelAtOpenShop();
    }

    if (await this.maybeDropStarterJunk()) {
      return true;
    }

    if (this.gearReady && !this.needSteelBuy) {
      return false;
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

  async maybeDropStarterJunk() {
    if (this.starterJunkDropped) {
      return false;
    }
    if (!gearHasSteelOrBetter()) {
      return false;
    }
    if (gearHasBrokenAxe() || this.needSteelBuy || this.repairTrip) {
      return false;
    }

    const dropCoins = this.justBoughtSteel && gearInvCoins() > 0;
    const dropBronze = hasBronzeInPack();
    if (!dropBronze && !dropCoins) {
      this.starterJunkDropped = true;
      return false;
    }

    this.status = "gear: drop bronze";
    if (Equipment.contains(GEAR_BRONZE_AXE)) {
      this.log("gear: unequipping Bronze axe to drop it");
      await Equipment.unequip(GEAR_BRONZE_AXE);
      await Execution.delayTicks(1);
    }

    if (hasBronzeInPack()) {
      const bronze =
        Inventory.first(GEAR_BRONZE_AXE) ||
        Inventory.items().find((i) => (i.name ?? "").toLowerCase() === "bronze axe");
      if (bronze && typeof bronze.interact === "function") {
        this.log("gear: dropping Bronze axe after Steel upgrade");
        const before = Inventory.count(GEAR_BRONZE_AXE) || 0;
        await bronze.interact("Drop");
        await Execution.delayUntil(() => (Inventory.count(GEAR_BRONZE_AXE) || 0) < before, 4000);
      }
    }

    if (dropCoins && gearInvCoins() > 0) {
      const coins = Inventory.items().find((i) => {
        const n = (i.name ?? "").toLowerCase();
        return n === "coins" || n === "coin";
      });
      if (coins && typeof coins.interact === "function") {
        this.log("gear: dropping leftover coins after Steel axe buy");
        await coins.interact("Drop");
        await Execution.delayUntil(() => gearInvCoins() === 0, 4000);
      }
    }

    const bronzeGone = !hasBronzeInPack();
    const coinsGone = !dropCoins || gearInvCoins() === 0;
    if (bronzeGone && coinsGone) {
      this.starterJunkDropped = true;
      this.justBoughtSteel = false;
      this.log("gear: Bronze axe and leftover coins dropped");
    }
    return true;
  }

  async bootstrapWcGear() {
    this.status = this.camp().id === "yew" ? "gear: Edgeville bank" : "gear: bank";

    if (!Bank.isOpen()) {
      this.log(
        this.camp().id === "yew"
          ? "gear: opening Edgeville bank for best axe / knife"
          : "gear: opening bank for best axe / knife"
      );
      if (!(await this.openCampBank())) {
        this.log("gear: could not open bank, retrying");
        await Execution.delayTicks(3);
        return true;
      }
    }

    await gearWaitBankLoaded();

    this.log("gear: depositing extras (keep knife and best axe, even if unwieldable)");
    await Bank.depositAllMatching((name) => !isKeepTool(name));
    await Execution.delayTicks(1);

    if (!(await this.ensureBestAxeFromOpenBank())) {
      const wc = Skills.level("woodcutting");
      if (!gearHasBrokenAxe() && (Bank.count(GEAR_BROKEN_AXE) || 0) === 0) {
        this.log(`gear: no usable axe in bank/pack for WC ${wc}, waiting`);
        await Bank.close();
        await Execution.delayTicks(8);
        return true;
      }
    }

    if (this.fletchEnabled() && !gearHasKnife()) {
      if ((Bank.count("Knife") || 0) > 0) {
        this.log("gear: withdrawing Knife");
        await Bank.withdrawX("Knife", 1);
        await Execution.delayTicks(1);
      } else if (this.camp().id === "yew") {
        await Bank.close();
        this.stopNoKnife("gear");
        return true;
      } else {
        this.log("gear: no Knife in bank, walking to Lumbridge castle spawn");
      }
    }

    if ((Bank.count(GEAR_BROKEN_AXE) || 0) > 0 && !gearHasBrokenAxe()) {
      this.log("gear: withdrawing Broken axe");
      await Bank.withdrawX(GEAR_BROKEN_AXE, 1);
      await Execution.delayTicks(1);
    }

    if (gearHasBrokenAxe() || (Bank.count(GEAR_BROKEN_AXE) || 0) > 0) {
      const need = GEAR_REPAIR_COIN_FLOAT - gearInvCoins();
      if (need > 0 && gearBankCoins() > 0) {
        const take = Math.min(need, gearBankCoins());
        this.log(`gear: withdrawing ${take}gp for axe repair`);
        await Bank.withdrawX("Coins", take);
        await Execution.delayTicks(1);
      }
      this.repairBanked = true;
      this.repairTrip = "to_bob";
    }

    this.maybeQueueSteelBuy();
    if (this.needSteelBuy) {
      const need = GEAR_STEEL_COST - gearInvCoins();
      if (need > 0) {
        this.log(`gear: withdrawing ${need}gp for Steel axe`);
        await Bank.withdrawX("Coins", need);
        await Execution.delayTicks(1);
      }
    }

    await Bank.close();
    await Execution.delayTicks(1);

    if (gearHasBrokenAxe()) {
      return await this.repairBrokenAxeAtBob();
    }

    await this.wieldOrKeepBestAxe();

    if (this.fletchEnabled() && !gearHasKnife()) {
      if (this.camp().id === "yew") {
        this.stopNoKnife("gear");
        return true;
      }
      return await this.pickupLumbridgeKnife();
    }

    if (!gearBestHeldAxe()) {
      this.log("gear: still missing axe after bank");
      await Execution.delayTicks(5);
      return true;
    }

    this.gearReady = true;
    this.log(`gear: ready, ${gearBestHeldAxe()}` + (this.needSteelBuy ? " (buying Steel axe next)" : ""));

    if (this.needSteelBuy) {
      return await this.runSteelAxeBuy();
    }
    return true;
  }

  async ensureBestAxeFromOpenBank() {
    const wc = Skills.level("woodcutting");
    const best = bestAxe(wc, (n) => gearAxeCount(n) > 0 || (Bank.isOpen() && (Bank.count(n) || 0) > 0));
    if (!best) {
      return false;
    }
    if (gearAxeCount(best) === 0 && Bank.isOpen() && (Bank.count(best) || 0) > 0) {
      this.log(`gear: withdrawing ${best}`);
      if (!(await Bank.withdrawX(best, 1))) {
        this.log(`gear: withdraw failed for ${best}`);
        return false;
      }
      await Execution.delayTicks(1);
    }
    return gearAxeCount(best) > 0;
  }

  async wieldOrKeepBestAxe() {
    const held = gearBestHeldAxe();
    if (!held) {
      return;
    }
    if (Equipment.contains(held)) {
      return;
    }
    if (canWieldTool(held, Skills.level("attack"))) {
      this.status = `gear: wield ${held}`;
      this.log(`gear: wielding ${held}`);
      await Equipment.equip(held);
      await Execution.delayTicks(1);
      return;
    }
    this.log(`gear: keeping ${held} in pack (Attack too low to wield)`);
  }

  stopNoKnife(context) {
    this.status = "no knife, stopped";
    this.log(
      `${context}: no Knife in inventory or Edgeville bank, stopping (withdraw a Knife, then restart)`
    );
    stopScript();
  }

  async openEdgevilleBank() {
    if (Bank.isOpen()) {
      if (nearEdgevilleBank(Game.tile())) {
        return true;
      }
      this.log("wrong bank open, closing");
      await Bank.close();
      await Execution.delayTicks(1);
    }

    const here = Game.tile();
    if (here && !nearEdgevilleBank(here)) {
      this.status = "walking to Edgeville bank";
      this.log(`walking to Edgeville bank ${EDGEVILLE_BANK.x},${EDGEVILLE_BANK.z}`);
      const ok = await Traversal.walkResilient(EDGEVILLE_BANK, {
        radius: 4,
        log: (m) => this.log(`  ${m}`)
      });
      if (!ok) {
        this.log("path to Edgeville bank failed, retrying");
        return false;
      }
    }

    if (!nearEdgevilleBank(Game.tile())) {
      return false;
    }

    this.status = "opening Edgeville bank";
    this.log("opening Edgeville bank booth");
    if (typeof Bank.openBooth === "function") {
      return !!(await Bank.openBooth(EDGEVILLE_BANK, "Bank booth", "Use-quickly", (m) =>
        this.log(`  ${m}`)
      ));
    }
    return !!(await Banking.open({
      stand: EDGEVILLE_BANK,
      log: (m) => this.log(`  ${m}`)
    }));
  }

  async openCampBank() {
    if (this.camp().id === "yew") {
      return await this.openEdgevilleBank();
    }
    return !!(await Banking.open({ log: (m) => this.log(`  ${m}`) }));
  }

  async handleDropJunk() {
    const item = Inventory.items().find((i) => !isYewKeepItem(i.name)) ?? null;
    if (!item) {
      return false;
    }
    const name = item.name ?? "junk";
    this.status = `drop ${name}`;
    this.log(`dropping ${name}`);
    const before = typeof Inventory.used === "function" ? Inventory.used() : Inventory.items().length;
    await item.interact("Drop");
    await Execution.delayUntil(() => {
      const used = typeof Inventory.used === "function" ? Inventory.used() : Inventory.items().length;
      return used < before;
    }, 4000);
    return true;
  }

  async pickupLumbridgeKnife() {
    this.status = "gear: knife spawn";
    this.log("gear: walking to Lumbridge knife spawn (beside castle / behind Bob)");
    await Traversal.walkResilient(GEAR_KNIFE_SPAWN, {
      radius: 1,
      log: (m) => this.log(`  ${m}`)
    });

    let ground = GroundItems.query().name("Knife").within(6).nearest();
    if (!ground) {
      await Execution.delayTicks(3);
      ground = GroundItems.query().name("Knife").within(6).nearest();
    }
    if (!ground) {
      this.log("gear: Knife not on ground yet, waiting");
      await Execution.delayTicks(5);
      return true;
    }

    if (Inventory.isFull()) {
      this.log("gear: inventory full, cannot Take Knife");
      await Execution.delayTicks(5);
      return true;
    }

    this.log("gear: taking Knife");
    await ground.interact("Take");
    await Execution.delayUntil(() => gearHasKnife(), 8000);

    if (gearHasKnife() && gearBestHeldAxe()) {
      this.gearReady = true;
      this.log("gear: Knife acquired, ready");
    }
    return true;
  }

  async runSteelAxeBuy() {
    if (gearHasSteelOrBetter()) {
      this.needSteelBuy = false;
      return false;
    }
    if (Skills.level("woodcutting") < 6) {
      this.needSteelBuy = false;
      return false;
    }

    if (!Bank.isOpen()) {
      this.status = "gear: check steel";
      if (!(await Banking.open({ log: (m) => this.log(`  ${m}`) }))) {
        await Execution.delayTicks(3);
        return true;
      }
    }
    await gearWaitBankLoaded();

    if (gearHasSteelOrBetter()) {
      const steelRank = gearAxeRank(GEAR_STEEL_AXE);
      const best = bestAxe(Skills.level("woodcutting"), (n) => gearAxeCount(n) > 0 || (Bank.count(n) || 0) > 0);
      if (best && gearAxeRank(best) <= steelRank && gearAxeCount(best) === 0) {
        this.log(`gear: already own ${best} in bank, withdrawing (skip Bob)`);
        await Bank.withdrawX(best, 1);
        await Execution.delayTicks(1);
      } else {
        this.log("gear: already own steel+ axe, skip Bob");
      }
      this.needSteelBuy = false;
      await Bank.close();
      await this.wieldOrKeepBestAxe();
      return true;
    }

    if (gearInvCoins() < GEAR_STEEL_COST) {
      this.status = "gear: steel gp";
      if (gearBankCoins() + gearInvCoins() < GEAR_STEEL_COST) {
        this.log("gear: need 250gp in bank for Steel axe, waiting");
        this.needSteelBuy = false;
        await Bank.close();
        return true;
      }
      const need = GEAR_STEEL_COST - gearInvCoins();
      if (need > 0) {
        await Bank.withdrawX("Coins", need);
      }
      await Bank.close();
      await Execution.delayTicks(1);
      return true;
    }

    await Bank.close();
    await Execution.delayTicks(1);

    this.status = "gear: Bob";
    this.log("gear: walking to Bob for Steel axe");
    await Traversal.walkResilient(GEAR_BOB_STAND, {
      radius: 2,
      log: (m) => this.log(`  ${m}`)
    });

    if (!(await Shop.open("Bob"))) {
      this.log("gear: could not open Bob's shop");
      await Execution.delayTicks(3);
      return true;
    }
    return await this.buySteelAtOpenShop();
  }

  async buySteelAtOpenShop() {
    if (gearHasSteelOrBetter()) {
      this.log("gear: already own steel+ axe, closing Bob");
      this.needSteelBuy = false;
      await Shop.close();
      return true;
    }

    this.status = "gear: buy steel";
    const before = gearAxeCount(GEAR_STEEL_AXE);
    const bought = await Shop.buy(GEAR_STEEL_AXE, 1);
    const got = bought > 0 ? bought : Math.max(0, gearAxeCount(GEAR_STEEL_AXE) - before);

    if (got <= 0) {
      this.log("gear: Steel axe buy failed (stock/coins?)");
      await Shop.close();
      await Execution.delayTicks(5);
      return true;
    }

    this.log("gear: bought Steel axe from Bob");
    this.needSteelBuy = false;
    this.justBoughtSteel = true;
    this.starterJunkDropped = false;
    await Shop.close();
    await Execution.delayTicks(1);

    await this.wieldOrKeepBestAxe();
    return await this.maybeDropStarterJunk();
  }

  pickChopTree(query) {
    const camp = this.camp();
    if (camp.id !== "yew" || typeof query.results !== "function") {
      return query.nearest();
    }
    const trees = query.results() ?? [];
    if (!trees.length) {
      return query.nearest();
    }
    const contested = trees.filter((t) => otherPlayersNear(t.tile(), 2) > 0);
    const pool = contested.length > 0 ? contested : trees;
    pool.sort((a, b) => a.distance() - b.distance());
    return pool[0] ?? null;
  }

  findTree() {
    const camp = this.camp();
    return this.pickChopTree(
      Locs.query()
        .name(camp.treeName)
        .where((l) => chopOp(l.actions()) !== null)
        .where((l) => Tile.from(l.tile()).distanceTo(camp.anchor) <= camp.leash)
    );
  }

  findTreeWithin(maxDistFromPlayer) {
    const camp = this.camp();
    return this.pickChopTree(
      Locs.query()
        .name(camp.treeName)
        .where((l) => chopOp(l.actions()) !== null)
        .where((l) => Tile.from(l.tile()).distanceTo(camp.anchor) <= camp.leash)
        .where((l) => l.distance() <= maxDistFromPlayer)
    );
  }

  async fletchLogs(plan) {
    if (!plan.fletch || this.logCount() === 0) {
      return;
    }

    if (ChatDialog.isMakeMenu()) {
      await this.chooseMakeProduct(plan);
      return;
    }

    const knife = knifeItem();
    const log = this.lastLog();
    if (!knife) {
      this.gearReady = false;
      this.log(
        this.camp().id === "yew"
          ? "no Knife in inventory, will check Edgeville bank"
          : "WARNING: no Knife in inventory, checking nearest bank"
      );
      await Execution.delayTicks(2);
      return;
    }
    if (!log) {
      return;
    }

    this.status = `fletching ${plan.label}`;
    this.log(`knife -> logs (${this.logCount()} left) for ${plan.label}`);
    const before = this.logCount();
    if (!(await knife.useOn(log))) {
      await Execution.delayTicks(2);
      return;
    }

    const opened = await Execution.delayUntil(
      () => ChatDialog.isMakeMenu() || this.logCount() < before || ChatDialog.canContinue() || Game.animating(),
      8000
    );

    if (ChatDialog.isMakeMenu()) {
      await this.chooseMakeProduct(plan);
      return;
    }

    if (!opened && this.logCount() >= before) {
      this.log("fletch useOn did not start, retrying");
    }
  }

  async chooseMakeProduct(plan) {
    if (!plan.fletch) {
      return;
    }

    const products = ChatDialog.makeProducts();
    const match = matchMakeProduct(products, plan.menuMatch, this.camp());
    if (!match) {
      this.log(`make menu missing '${plan.label}' (have: [${products.join(", ")}]), closing`);
      await Execution.delayTicks(2);
      return;
    }

    const start = this.logCount();
    this.status = `make ${plan.label}`;
    this.log(`selecting '${match}' x${start}`);

    let picked = false;
    if (typeof ChatDialog.makeX === "function") {
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
      () => !ChatDialog.isMakeMenu() && (Game.animating() || this.logCount() < start || ChatDialog.canContinue()),
      5000
    );

    let mark = this.logCount();
    let idle = 0;
    for (let guard = 0; guard < 400 && this.logCount() > 0; guard++) {
      if (ChatDialog.canContinue()) {
        return;
      }
      if (ChatDialog.isMakeMenu()) {
        return;
      }
      await Execution.delayTicks(1);
      const now = this.logCount();
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

  async bankProductsAndReturn(nextCamp) {
    const camp = this.camp();
    const plan = this.currentPlan();
    const flvl = Skills.level("fletching");
    const bows = this.bowCount();
    const shorts = this.shortbowCount();
    const logs = this.logCount();
    const shafts = this.shaftCount();
    const dest = nextCamp ?? camp;
    const edgeville = camp.id === "yew" && dest.id === "yew";
    this.status = edgeville ? "banking Edgeville" : "banking";
    this.log(
      (edgeville ? "banking at Edgeville" : "banking") +
        (shorts ? ` ${shorts} ${camp.shortLabel}` : "") +
        (bows - shorts > 0 ? ` ${bows - shorts} ${camp.longLabel}` : "") +
        (shafts && plan.id !== "shafts" ? ` ${shafts} arrow shafts` : "") +
        (logs ? ` ${logs} ${camp.logLabel}` : "") +
        ` (fletching ${flvl})`
    );

    await Banking.bankNearest({
      ...(edgeville ? { destination: { name: "Edgeville", tile: EDGEVILLE_BANK } } : {}),
      deposit: (name) => {
        if (isKeepTool(name) || isAxeItemName(name)) {
          return false;
        }
        if (isShaft(name)) {
          return plan.id !== "shafts" || dest.id !== camp.id;
        }
        if (isAnyBow(name) || isAnyLog(name)) {
          return true;
        }
        return false;
      },
      afterDeposit: async () => {
        this.activeCampId = dest.id;
        if ((Bank.count(GEAR_BROKEN_AXE) || 0) > 0 && !gearHasBrokenAxe()) {
          this.log("gear: withdrawing Broken axe");
          await Bank.withdrawX(GEAR_BROKEN_AXE, 1);
        }
        if (gearHasBrokenAxe() || (Bank.count(GEAR_BROKEN_AXE) || 0) > 0) {
          const need = GEAR_REPAIR_COIN_FLOAT - gearInvCoins();
          if (need > 0 && gearBankCoins() > 0) {
            const take = Math.min(need, gearBankCoins());
            this.log(`gear: withdrawing ${take}gp for axe repair`);
            await Bank.withdrawX("Coins", take);
          }
          this.repairBanked = true;
          this.repairTrip = "to_bob";
        }
        if (this.fletchEnabled() && !gearHasKnife()) {
          if ((Bank.count("Knife") || 0) > 0) {
            this.log("gear: withdrawing Knife");
            await Bank.withdrawX("Knife", 1);
          } else if (edgeville) {
            this.stopNoKnife("banking");
          } else {
            this.gearReady = false;
          }
        }
        await this.ensureBestAxeFromOpenBank();
        this.maybeQueueSteelBuy();
      },
      returnTo: dest.anchor,
      log: (m) => this.log(`  ${m}`)
    });

    this.bankTrips++;
    await this.wieldOrKeepBestAxe();
    if (this.repairTrip === "to_bob") {
      this.status = "gear: repair";
      return;
    }
    if (this.fletchEnabled() && dest.id === "yew" && !gearHasKnife() && !edgeville) {
      await this.pickupLumbridgeKnife();
    }
    this.status = `returning to ${dest.waitName}s`;
  }

  sessionSnapshot() {
    const runtimeMs = this.startedAt ? Date.now() - this.startedAt : 0;
    const hrs = runtimeMs / 3_600_000;
    const wcXp = Math.max(0, Skills.xp("woodcutting") - this.wcXpAtStart);
    const flXp = Math.max(0, Skills.xp("fletching") - this.fletchXpAtStart);
    const perHour = (n) => (hrs > 0.0005 ? n / hrs : 0);
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
      `stopped, chopped ~${this.chopped}, fletched ~${this.fletched}, ` +
        `bank trips ${this.bankTrips}, ${fmtElapsed(snap.runtimeMs)} (${this.status})`
    );
  }

  onPaint(ctx) {
    const camp = this.camp();
    const plan = this.currentPlan();
    const snap = this.sessionSnapshot();
    const lines = [
      SCRIPT_TITLE,
      `time ${fmtElapsed(snap.runtimeMs)} · ${this.status}`,
      `Woodcutting ${Skills.level("woodcutting")} · Fletching ${Skills.level("fletching")}`,
      `${camp.label} · ${plan.label}${plan.bank ? (camp.id === "yew" ? " + Edgeville bank" : " + bank") : ""}`,
      `chopped ${snap.chopped} · fletched ${snap.fletched} · trips ${snap.banks}`,
      `WC ${fmtXph(snap.wcXpPerHour)}/hr  (+${Math.round(snap.wcXp)} xp)`,
      `Fletch ${fmtXph(snap.flXpPerHour)}/hr  (+${Math.round(snap.flXp)} xp)`
    ];

    ctx.save();
    ctx.font = "13px sans-serif";
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    const x = 8;
    const y0 = 8;
    const lineH = 16;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#000";
    lines.forEach((line, i) => {
      const y = y0 + i * lineH;
      ctx.strokeText(line, x, y);
      ctx.fillStyle = i === 0 ? TITLE_WOOD : "#ffffff";
      ctx.fillText(line, x, y);
    });
    ctx.restore();
  }
}

export default defineBot({
  name: SCRIPT_NAME,
  version: SCRIPT_VERSION,
  category: "Woodcutting",
  tags: ["woodcutting", "fletching", "progressive", "trees", "oak", "willow", "maple", "yew", "edgeville"],
  description:
    "Progressive chopper: Falador regular trees, Varrock oaks, Draynor willows, Seers maples, then Edgeville yews at fletching 65. Yew shortbows (u) at 65 / longbows (u) at 70, banked at Edgeville. Moves on when woodcutting (and fletching, if enabled) can use the next tree. Optional fletching into bows. Picks up the Lumbridge knife if fletching is on and none is in the bank. Keeps the best usable axe even if Attack is too low to wield. Drops the Bronze axe and leftover coins after buying a Steel axe from Bob.",
  settingsSchema: {
    fletchLogs: {
      type: "boolean",
      default: true,
      label: "Fletch logs into bows",
      group: "Fletching",
      help: "When on: fletch logs into shafts or bows by level (needs a Knife), then bank the bows. At 65: yew shortbows (u), then longbows (u) at 70. Picks up the Lumbridge castle knife if none is in the bank (Edgeville yews stop if the Edgeville bank has none). When off: bank the logs and progress by woodcutting level only."
    }
  },
  create: () => new ProgressiveChopper()
});
