/**
 * EdgevilleBodyRunes. Crafts Body runes from Edgeville bank.
 *
 * Load URL: https://cdn.jsdelivr.net/gh/Benzymee/RS2B2TScripts@main/EdgevilleBodyRunes.js
 */
const SUPPORTED_API_VERSION = 1;
const abi = globalThis.__rs2b0t;
if (!abi) {
  throw new Error("EdgevilleBodyRunes: globalThis.__rs2b0t missing, load inside rs2b0t bot.html");
}
if (abi.apiVersion !== SUPPORTED_API_VERSION) {
  throw new Error(
    `EdgevilleBodyRunes: ABI ${abi.apiVersion} != supported ${SUPPORTED_API_VERSION}`
  );
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
  Banking,
  Traversal,
  Tile,
  Skills,
  ChatDialog,
  DirectNavigator,
  withdrawOp
} = abi;
const SCRIPT_NAME = "EdgevilleBodyRunes";
const SCRIPT_VERSION = "1.4";
const SCRIPT_VERSION_FULL = "1.4.0";
const WELCOME_SCREEN_ID = 5993;
function T(x, z, level = 0) {
  return new Tile(x, z, level);
}
const BANK_STAND = T(3092, 3492);
const RUINS_STAND = T(3053, 3445);
const RUINS_APPROACH = T(3057, 3439);
const BODY_ROUTE = [
  T(3092, 3492),
  T(3080, 3475),
  T(3085, 3456),
  T(3073, 3440),
  T(3069, 3417),
  T(3056, 3423),
  RUINS_APPROACH
];
const TO_RUINS = BODY_ROUTE;
const TO_BANK = [...BODY_ROUTE].reverse();
const RUINS_RADIUS = 10;
const BANK_RADIUS = 8;
const LOCAL_RADIUS = 80;
const PIN_LOOSE = 6;
const PIN_FOLLOW = 5;
const TEMPLE_MIN_Z = 4600;
const TEMPLE_MAX_Z = 5e3;
const MAX_BANK_FAILS = 6;
const MAX_ENTER_FAILS = 3;
const BODY_LEVEL = 20;
const TALISMAN_NAME = "Body talisman";
const TIARA_NAME = "Body tiara";
const ESSENCE_NAMES = ["Pure essence", "Rune essence"];
const BODY_RUNE_NAMES = ["Body rune", "Body runes"];
const RUNECRAFT_SKILLS = ["runecraft", "runecrafting"];
const DEATH_RE = /oh dear.*you are dead/i;
const TITLE_LIGHT_BLUE = "#7ec8ff";
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
function normName(name) {
  return (name ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}
function nameIs(name, list) {
  const n = normName(name);
  return list.some((s) => n === normName(s));
}
function cheb(a, b) {
  if (!a || !b) {
    return 99;
  }
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
}
function tileOf(t = Game.tile()) {
  return t ? Tile.from(t) : null;
}
function isTalisman(name) {
  return nameIs(name, [TALISMAN_NAME]);
}
function isTiara(name) {
  return nameIs(name, [TIARA_NAME]);
}
function isEssence(name) {
  return nameIs(name, [...ESSENCE_NAMES, "essence"]);
}
function isBodyRune(name) {
  return nameIs(name, BODY_RUNE_NAMES);
}
function isNoteId(id) {
  if (typeof id !== "number" || id < 0) {
    return false;
  }
  try {
    const OT = globalThis.ObjType ?? abi.ObjType ?? globalThis.__client?.ObjType ?? null;
    const t = OT && typeof OT.list === "function" ? OT.list(id) : null;
    const tmpl = t?.certtemplate ?? t?.certTemplate;
    return typeof tmpl === "number" && tmpl >= 0 && tmpl !== id;
  } catch {
    return false;
  }
}
function invItems() {
  try {
    return Inventory.items() ?? [];
  } catch {
    return [];
  }
}
function countMatching(pred) {
  return invItems().filter((i) => pred(i.name, i.id)).reduce((n, i) => n + Math.max(1, i.count ?? 1), 0);
}
function talismanCount() {
  return countMatching((name) => isTalisman(name));
}
function tiaraCount() {
  return countMatching((name) => isTiara(name));
}
function essenceCount() {
  return countMatching((name, id) => isEssence(name) && !isNoteId(id));
}
function bodyRuneCount() {
  return countMatching((name) => isBodyRune(name));
}
function hasTalisman() {
  return talismanCount() > 0;
}
function hasEssence() {
  return essenceCount() > 0;
}
function equippedNames() {
  const names = [];
  try {
    if (typeof Equipment?.items === "function") {
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
function wearingTiara() {
  try {
    if (typeof Equipment?.contains === "function" && Equipment.contains(TIARA_NAME)) {
      return true;
    }
  } catch {
  }
  return equippedNames().some((n) => isTiara(n));
}
function hasEntryItem() {
  return hasTalisman() || wearingTiara() || tiaraCount() > 0;
}
function findTalisman() {
  return invItems().find((i) => isTalisman(i.name)) ?? null;
}
function findTiara() {
  return invItems().find((i) => isTiara(i.name)) ?? null;
}
function lastEssence() {
  const items = invItems();
  for (let i = items.length - 1; i >= 0; i--) {
    if (isEssence(items[i].name) && !isNoteId(items[i].id)) {
      return items[i];
    }
  }
  return null;
}
function invFree() {
  if (typeof Inventory.free === "function") {
    return Inventory.free();
  }
  const used = typeof Inventory.used === "function" ? Inventory.used() : invItems().length;
  return Math.max(0, 28 - used);
}
function locActions(loc) {
  if (!loc) {
    return [];
  }
  try {
    if (typeof loc.actions === "function") {
      return loc.actions() ?? [];
    }
  } catch {
  }
  return [];
}
function locTile(loc) {
  try {
    const t = typeof loc.tile === "function" ? loc.tile() : loc.tile;
    return t ? Tile.from(t) : null;
  } catch {
    return null;
  }
}
function locName(loc) {
  return (loc?.name ?? "").toLowerCase();
}
function rcSkillName() {
  for (const n of RUNECRAFT_SKILLS) {
    try {
      const xp = Skills.xp(n);
      if (typeof xp === "number" && xp >= 0) {
        return n;
      }
    } catch {
    }
  }
  return "runecraft";
}
function rcLevel() {
  try {
    return Skills.level(rcSkillName()) || 1;
  } catch {
    return 1;
  }
}
function rcXp() {
  try {
    return Skills.xp(rcSkillName()) || 0;
  } catch {
    return 0;
  }
}
function nearBank(tile = Game.tile()) {
  const t = tileOf(tile);
  return !!t && (t.level ?? 0) === 0 && cheb(t, BANK_STAND) <= BANK_RADIUS + 4;
}
function nearRuins(tile = Game.tile()) {
  const t = tileOf(tile);
  return !!t && (t.level ?? 0) === 0 && cheb(t, RUINS_STAND) <= RUINS_RADIUS + 4;
}
function inAltarInterior(tile = Game.tile()) {
  const t = tileOf(tile);
  if (!t) {
    return false;
  }
  if (t.z >= TEMPLE_MIN_Z && t.z <= TEMPLE_MAX_Z) {
    return true;
  }
  if (cheb(t, RUINS_STAND) <= 25 || cheb(t, BANK_STAND) <= 40) {
    return false;
  }
  return findPortal() != null && findCraftAltar() != null;
}
function readyToCraft() {
  return hasEntryItem() && hasEssence();
}
function isShutDoor(loc) {
  const name = locName(loc);
  if (!name.includes("door") && !name.includes("gate")) {
    return false;
  }
  return locActions(loc).some((a) => /^open/i.test(a ?? ""));
}
function openDoorOp(loc) {
  return locActions(loc).find((a) => /^open/i.test(a ?? "")) ?? null;
}
function portalOp(loc) {
  const acts = locActions(loc);
  return acts.find((a) => /^(use|enter|exit|walk-through|pass)/i.test(a ?? "")) ?? acts.find((a) => /use|enter|exit|pass/i.test(a ?? "")) ?? null;
}
function craftOp(loc) {
  const acts = locActions(loc);
  return acts.find((a) => /craft/i.test(a ?? "")) ?? acts.find((a) => /^use$/i.test(a ?? "")) ?? null;
}
function ruinsEnterOp(loc) {
  const acts = locActions(loc);
  return acts.find((a) => /^enter/i.test(a ?? "")) ?? acts.find((a) => /enter|use/i.test(a ?? "")) ?? null;
}
function findRuins() {
  return Locs.query().name("Mysterious ruins", "Mysterious Ruins").where((l) => {
    const t = locTile(l);
    return t && cheb(t, RUINS_STAND) <= 14;
  }).nearest() ?? Locs.query().where((l) => /mysterious\s*ruins|ruins/i.test(locName(l))).where((l) => {
    const t = locTile(l);
    return t && cheb(t, RUINS_STAND) <= 14;
  }).nearest() ?? Locs.query().where((l) => /mysterious\s*ruins/i.test(locName(l))).nearest() ?? null;
}
function findCraftAltar() {
  return Locs.query().name("Altar").where((l) => !/mysterious/i.test(locName(l))).nearest() ?? Locs.query().where((l) => {
    const n = locName(l);
    return /\baltar\b/i.test(n) && !/mysterious/i.test(n);
  }).nearest() ?? null;
}
function findPortal() {
  return Locs.query().name("Portal").nearest() ?? Locs.query().where((l) => /\bportal\b/i.test(locName(l))).nearest() ?? null;
}
function bankItems() {
  return typeof Bank.items === "function" ? Bank.items() : [];
}
function bankItemCount(pred) {
  return bankItems().filter((i) => pred(i.name)).reduce((n, i) => n + Math.max(1, i.count ?? 1), 0);
}
function bankCountByName(name) {
  if (typeof Bank.count === "function") {
    const n = Bank.count(name);
    if (n > 0) {
      return n;
    }
  }
  return bankItemCount((n) => normName(n) === normName(name));
}
function bankTalismanCount() {
  if (typeof Bank.count === "function") {
    const n = Bank.count(TALISMAN_NAME);
    if (n > 0) {
      return n;
    }
  }
  return bankItemCount(isTalisman);
}
function bankTiaraCount() {
  if (typeof Bank.count === "function") {
    const n = Bank.count(TIARA_NAME);
    if (n > 0) {
      return n;
    }
  }
  return bankItemCount(isTiara);
}
function bankEssenceTotal() {
  let n = 0;
  for (const name of ESSENCE_NAMES) {
    n += bankCountByName(name);
  }
  if (n > 0) {
    return n;
  }
  return bankItemCount(isEssence);
}
function bankFindEssenceName() {
  for (const name of ESSENCE_NAMES) {
    if (bankCountByName(name) > 0) {
      return name;
    }
  }
  const hit = bankItems().find((i) => isEssence(i.name));
  return hit?.name ?? null;
}
function bankContentsReady() {
  if (!Bank.isOpen()) {
    return false;
  }
  if (bankEssenceTotal() > 0 || bankTalismanCount() > 0 || bankTiaraCount() > 0) {
    return true;
  }
  return bankItems().length > 0;
}
async function waitBankLoaded() {
  if (typeof Bank.loaded === "function") {
    await Execution.delayUntil(() => Bank.loaded() || bankItems().length > 0, 4e3);
  }
  await Execution.delayUntil(() => bankContentsReady() || !Bank.isOpen(), 4e3);
  await Execution.delayTicks(1);
}
async function withdrawNamed(name, qty) {
  if (qty <= 0 || !Bank.isOpen() || !name) {
    return false;
  }
  const bankItem = (typeof Bank.items === "function" ? Bank.items().find((i) => normName(i.name) === normName(name)) : null) ?? null;
  if (typeof Bank.withdrawX === "function") {
    if (await Bank.withdrawX(name, qty)) {
      return true;
    }
  }
  if (typeof Bank.withdraw === "function") {
    const wantAll = qty >= 5 || bankItem && Math.max(1, bankItem.count ?? 1) <= qty;
    const hint = wantAll ? "all" : "1";
    const op = (typeof withdrawOp === "function" && bankItem?.ops ? withdrawOp(bankItem.ops, hint) : null) ?? (wantAll ? "Withdraw-All" : "Withdraw-1");
    if (await Bank.withdraw(name, op)) {
      return true;
    }
    if (await Bank.withdraw(name)) {
      return true;
    }
  }
  return false;
}
function onBodyCorridor(here) {
  if (!here) {
    return false;
  }
  if (cheb(here, BANK_STAND) <= LOCAL_RADIUS || cheb(here, RUINS_STAND) <= LOCAL_RADIUS) {
    return true;
  }
  return BODY_ROUTE.some((p) => cheb(here, p) <= 12);
}
function viasFor(here, dest) {
  if (!here || !dest) {
    return [];
  }
  if (inAltarInterior(here) || inAltarInterior(dest)) {
    return [];
  }
  const destIsRuins = cheb(dest, RUINS_STAND) <= 20;
  const destIsBank = cheb(dest, BANK_STAND) <= 20;
  if (destIsRuins) {
    return TO_RUINS;
  }
  if (destIsBank) {
    return TO_BANK;
  }
  return [];
}
function pinListTo(dest, vias) {
  const pins = Array.isArray(vias) ? vias.filter(Boolean) : [];
  if (dest && cheb(dest, RUINS_STAND) <= 2) {
    return pins;
  }
  if (dest && (!pins.length || cheb(pins[pins.length - 1], dest) > 1)) {
    pins.push(dest);
  }
  return pins;
}
function walkTarget(dest) {
  if (dest && cheb(dest, RUINS_STAND) <= 2) {
    return RUINS_APPROACH;
  }
  return dest;
}
function snapPinIndex(route, here) {
  if (!here || !route.length) {
    return 0;
  }
  let on = -1;
  let near = -1;
  let nearD = 9999;
  for (let j = 0; j < route.length; j++) {
    const d = cheb(route[j], here);
    if (d <= PIN_LOOSE) {
      on = j;
    } else if (d < nearD) {
      nearD = d;
      near = j;
    }
  }
  if (on >= 0) {
    return Math.min(on + 1, route.length);
  }
  if (near >= 0 && nearD <= 12) {
    return near;
  }
  return 0;
}
function advancePinIndex(route, here, pinIndex) {
  let i = Math.max(0, pinIndex);
  for (let j = route.length - 1; j >= i; j--) {
    if (cheb(route[j], here) <= PIN_LOOSE) {
      return Math.min(j + 1, route.length);
    }
  }
  while (i < route.length && cheb(route[i], here) <= PIN_LOOSE) {
    i++;
  }
  return i;
}
function keepEntryName(name) {
  if (isTiara(name)) {
    return true;
  }
  if (isTalisman(name)) {
    return !wearingTiara() && tiaraCount() === 0;
  }
  return false;
}
class EdgevilleBodyRunes extends LoopingBotBase {
  status = "starting";
  startedAt = 0;
  rcXpAtStart = 0;
  crafted = 0;
  bankTrips = 0;
  bankFails = 0;
  enterFails = 0;
  done = false;
  died = false;
  startBanked = false;
  lastBankEssence = 0;
  emptyEssenceConfirms = 0;
  pinIndex = 0;
  pinRouteKey = "";
  async onStart() {
    await Execution.delayUntil(() => Game.ingame() && Game.tile() !== null, 0);
    Traversal.preload();
    if (typeof Banking?.preload === "function") {
      Banking.preload();
    }
    this.startedAt = Date.now();
    this.rcXpAtStart = rcXp();
    this.crafted = 0;
    this.bankTrips = 0;
    this.bankFails = 0;
    this.enterFails = 0;
    this.done = false;
    this.died = false;
    this.startBanked = false;
    this.lastBankEssence = 0;
    this.emptyEssenceConfirms = 0;
    this.pinIndex = 0;
    this.pinRouteKey = "";
    this.on("chat.message", (e) => {
      const text = e?.text ?? "";
      if (DEATH_RE.test(text)) {
        this.died = true;
        this.startBanked = false;
        this.log("died, will restock at Edgeville bank");
      }
    });
    this.on("skill.level", (e) => {
      const n = (e.name ?? "").toLowerCase();
      if (n === "runecraft" || n === "runecrafting") {
        this.log(`runecraft ${e.previous} \u2192 ${e.level}`);
      }
    });
    this.log(
      `EdgevilleBodyRunes v${SCRIPT_VERSION} RC ${rcLevel()} (need ${BODY_LEVEL}); Edgeville bank ${BANK_STAND.x},${BANK_STAND.z} \u2192 body ruins ${RUINS_STAND.x},${RUINS_STAND.z}`
    );
    if (rcLevel() < BODY_LEVEL) {
      this.finishDone(
        `stopped, Runecrafting ${rcLevel()} is below ${BODY_LEVEL} required for Body runes`
      );
      return;
    }
    if (inAltarInterior() && hasEssence()) {
      this.status = "ready, already in altar";
      this.log("already inside the body altar with essence, crafting");
      return;
    }
    if (readyToCraft() && !nearBank()) {
      this.startBanked = true;
      this.status = "ready";
      this.log(
        `already loaded (${talismanCount()} talisman, ${tiaraCount()} tiara, ${essenceCount()} essence), heading to ruins`
      );
      return;
    }
    this.status = "start bank";
    this.log("startup: restocking Body talisman or tiara + essence at Edgeville bank");
  }
  onStop() {
    this.log(
      `stopped, crafted ~${this.crafted} body runes, bank trips ${this.bankTrips} (${this.status})`
    );
  }
  finishDone(reason) {
    this.done = true;
    this.status = "done";
    this.log(reason);
    stopScript();
  }
  noteCrafted(beforeRunes, beforeEssence) {
    const nowRunes = bodyRuneCount();
    if (nowRunes > beforeRunes) {
      const gained = nowRunes - beforeRunes;
      this.crafted += gained;
      return gained;
    }
    const used = beforeEssence - essenceCount();
    if (used > 0) {
      this.crafted += used;
      return used;
    }
    return 0;
  }
  async loop() {
    if (!Game.ingame()) {
      await Execution.delayTicks(5);
      return;
    }
    if (this.done) {
      await Execution.delayTicks(5);
      return;
    }
    if (await dismissWelcomeScreen()) {
      this.status = "close welcome";
      return;
    }
    if (this.died) {
      this.died = false;
      this.status = "respawned, banking";
      await this.bankCycle({ startup: true });
      return;
    }
    if (Bank.isOpen() && readyToCraft() && invFree() <= 0) {
      await Bank.close();
      return;
    }
    if (ChatDialog.canContinue()) {
      this.status = "continue dialog";
      await ChatDialog.continue();
      return;
    }
    if (inAltarInterior()) {
      if (hasEssence()) {
        await this.craftAtAltar();
        return;
      }
      await this.exitAltar();
      return;
    }
    if (!this.startBanked || !readyToCraft()) {
      await this.bankCycle({ startup: !this.startBanked });
      return;
    }
    if (hasEssence()) {
      await this.enterRuins();
      return;
    }
    await this.bankCycle();
  }
  async openNearbyDoor(radius = 3) {
    const door = Locs.query().where((l) => isShutDoor(l)).where((l) => l.distance() <= radius).nearest();
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
  async walkTo(dest, radius) {
    dest = walkTarget(dest);
    const here0 = tileOf();
    if (!here0) {
      return false;
    }
    if (cheb(dest, here0) <= radius && (here0.level ?? 0) === (dest.level ?? 0)) {
      return true;
    }
    if (!onBodyCorridor(here0)) {
      this.status = `walking ${dest.x},${dest.z}`;
      this.log(`walking to ${dest.x},${dest.z} (${cheb(dest, here0)}t, off corridor)`);
      await Traversal.walkResilient(dest, {
        radius,
        attempts: 2,
        timeoutMs: 24e3,
        log: (m) => this.log(`  ${m}`)
      });
      const after = tileOf();
      return !!after && cheb(dest, after) <= radius;
    }
    const vias = viasFor(here0, dest);
    const route = pinListTo(dest, vias);
    const key = `${dest.x},${dest.z}:${route.map((p) => `${p.x},${p.z}`).join("|")}`;
    if (this.pinRouteKey !== key) {
      this.pinRouteKey = key;
      this.pinIndex = snapPinIndex(route, here0);
    } else if (this.pinIndex >= route.length) {
      this.pinIndex = snapPinIndex(route, here0);
    }
    if (!route.length) {
      return await this.followPin(dest, radius);
    }
    return await this.walkPinsAhead(route, dest, radius);
  }
  async followPin(tile, radius = PIN_FOLLOW) {
    if (!tile) {
      return false;
    }
    const here0 = tileOf();
    if (here0 && cheb(tile, here0) <= radius) {
      return true;
    }
    this.status = `walking ${tile.x},${tile.z}`;
    if (typeof Traversal?.walkResilient === "function") {
      await Traversal.walkResilient(tile, {
        radius,
        attempts: 2,
        timeoutMs: 2e4
      });
    } else if (DirectNavigator && typeof DirectNavigator.walkTo === "function") {
      await DirectNavigator.walkTo(
        { x: tile.x, z: tile.z, level: tile.level ?? 0 },
        radius,
        2e4
      );
    } else if (typeof Traversal?.walkTo === "function") {
      await Traversal.walkTo(tile, { radius, timeoutMs: 2e4 });
    }
    await this.openNearbyDoor(3);
    const after = tileOf();
    return !!after && cheb(tile, after) <= radius + 2;
  }
  /**
   * Path to each recorded pin. Switch to the next pin once we are close, so
   * we do not pause on the waypoint. Do not abort a path that is still moving.
   */
  async walkPinsAhead(route, dest, radius) {
    dest = walkTarget(dest);
    const started = Date.now();
    while (Date.now() - started < 18e4) {
      const here = tileOf();
      if (!here) {
        return false;
      }
      if (cheb(dest, here) <= radius && (here.level ?? 0) === (dest.level ?? 0)) {
        return true;
      }
      if (ChatDialog?.canContinue?.()) {
        await ChatDialog.continue();
        continue;
      }
      this.pinIndex = advancePinIndex(route, here, this.pinIndex);
      if (this.pinIndex >= route.length) {
        await this.followPin(dest, radius);
        continue;
      }
      const pin = route[this.pinIndex];
      if (cheb(here, pin) <= PIN_FOLLOW) {
        this.pinIndex++;
        continue;
      }
      this.log(
        `walk ${pin.x},${pin.z} (pin ${this.pinIndex + 1}/${route.length}, ${cheb(dest, here)}t to dest)`
      );
      const before = tileOf();
      const reached = await this.followPin(pin, PIN_FOLLOW);
      const after = tileOf();
      if (!reached && before && after && cheb(after, before) <= 1) {
        await this.openNearbyDoor(4);
        await this.followPin(pin, PIN_FOLLOW);
      }
    }
    const end = tileOf();
    return !!end && cheb(dest, end) <= radius;
  }
  async openEdgevilleBank() {
    if (Bank.isOpen()) {
      if (nearBank(Game.tile()) && !inAltarInterior()) {
        return true;
      }
      this.log("wrong bank open, closing");
      await Bank.close();
      await Execution.delayTicks(1);
    }
    const here = tileOf();
    if (here && cheb(here, BANK_STAND) > BANK_RADIUS) {
      this.status = "walking to Edgeville bank";
      this.log(`walking to Edgeville bank ${BANK_STAND.x},${BANK_STAND.z}`);
      if (!await this.walkTo(BANK_STAND, 4)) {
        this.log("path to Edgeville bank failed, retrying");
        return false;
      }
    }
    if (cheb(tileOf() ?? BANK_STAND, BANK_STAND) > BANK_RADIUS) {
      return false;
    }
    this.status = "opening Edgeville bank";
    this.log("opening Edgeville bank booth");
    let opened = false;
    if (typeof Bank.openBooth === "function") {
      opened = !!await Bank.openBooth(
        BANK_STAND,
        "Bank booth",
        "Use-quickly",
        (m) => this.log(`  ${m}`)
      );
    }
    if (!opened) {
      opened = !!await Banking.open({
        stand: BANK_STAND,
        log: (m) => this.log(`  ${m}`)
      });
    }
    if (opened) {
      this.bankFails = 0;
      return true;
    }
    if (++this.bankFails >= MAX_BANK_FAILS) {
      this.finishDone("stopped, could not reach Edgeville bank, start nearer it");
      return false;
    }
    return false;
  }
  async bankCycle(opts = {}) {
    const startup = opts.startup === true;
    this.status = startup ? "start bank" : "banking";
    if (inAltarInterior()) {
      await this.exitAltar();
      if (inAltarInterior()) {
        return;
      }
    }
    if (rcLevel() < BODY_LEVEL) {
      this.finishDone(
        `stopped, Runecrafting ${rcLevel()} is below ${BODY_LEVEL} required for Body runes`
      );
      return;
    }
    if (!Bank.isOpen()) {
      this.log(
        `${startup ? "startup: " : ""}Edgeville bank, keep ${TALISMAN_NAME} or ${TIARA_NAME}, fill with essence`
      );
      if (!await this.openEdgevilleBank()) {
        this.log("could not open Edgeville bank, retrying");
        await Execution.delayTicks(3);
        return;
      }
    }
    await waitBankLoaded();
    if (typeof Bank.setNoteMode === "function") {
      await Bank.setNoteMode(false);
    }
    this.log("depositing inventory (keeping Body talisman or Body tiara)");
    if (typeof Bank.depositAllMatching === "function") {
      await Bank.depositAllMatching((name) => !keepEntryName(name));
    } else if (typeof Bank.depositInventory === "function" && !hasEntryItem()) {
      await Bank.depositInventory();
    }
    await Execution.delayTicks(1);
    await waitBankLoaded();
    if (!hasEntryItem()) {
      const tiaras = bankTiaraCount();
      const tals = bankTalismanCount();
      if (tiaras <= 0 && tals <= 0) {
        await Bank.close();
        this.finishDone(
          "stopped, no Body talisman or Body tiara in inventory or Edgeville bank"
        );
        return;
      }
      if (tiaras > 0) {
        this.log(`withdrawing 1\xD7 ${TIARA_NAME}`);
        const before = tiaraCount();
        if (!await withdrawNamed(TIARA_NAME, 1)) {
          this.log("could not withdraw Body tiara, retrying");
          await Execution.delayTicks(3);
          return;
        }
        await Execution.delayUntil(() => tiaraCount() > before || !Bank.isOpen(), 4e3);
        await Execution.delayTicks(1);
      } else {
        this.log(`withdrawing 1\xD7 ${TALISMAN_NAME}`);
        const before = talismanCount();
        if (!await withdrawNamed(TALISMAN_NAME, 1)) {
          this.log("could not withdraw Body talisman, retrying");
          await Execution.delayTicks(3);
          return;
        }
        await Execution.delayUntil(() => talismanCount() > before || !Bank.isOpen(), 4e3);
        await Execution.delayTicks(1);
      }
      if (!hasEntryItem()) {
        this.log("Body talisman / tiara withdraw did not land, retrying");
        await Execution.delayTicks(3);
        return;
      }
    }
    if (tiaraCount() > 0 && !wearingTiara() && typeof Equipment?.equip === "function") {
      const tiara = findTiara();
      if (tiara?.name) {
        this.log(`wielding ${tiara.name}`);
        await Equipment.equip(tiara.name);
        await Execution.delayTicks(1);
      }
    }
    const free = invFree();
    if (free <= 0) {
      if (hasEssence()) {
        await Bank.close();
        this.startBanked = true;
        this.bankTrips++;
        this.status = "walking to ruins";
        this.log(`inventory full (${essenceCount()} essence), heading to body ruins`);
        return;
      }
      this.log("inventory still full after deposit, retrying");
      await Execution.delayTicks(2);
      return;
    }
    let essenceName = bankFindEssenceName();
    let inBank = essenceName ? bankCountByName(essenceName) : bankEssenceTotal();
    if (inBank <= 0) {
      inBank = await this.confirmBankEssenceOrRetry();
      if (inBank < 0) {
        return;
      }
      if (inBank === 0) {
        await Bank.close();
        this.finishDone("stopped, no Rune essence or Pure essence left in Edgeville bank");
        return;
      }
      essenceName = bankFindEssenceName();
    }
    this.lastBankEssence = inBank;
    this.emptyEssenceConfirms = 0;
    const take = Math.min(free, inBank);
    const label = essenceName ?? "essence";
    this.log(`withdrawing ${take}\xD7 ${label} (bank has ${inBank})`);
    const beforeEss = essenceCount();
    if (!await withdrawNamed(essenceName ?? ESSENCE_NAMES[1], take)) {
      this.log("could not withdraw essence, retrying (bank stays open)");
      await Execution.delayTicks(3);
      return;
    }
    await Execution.delayUntil(() => essenceCount() > beforeEss || !Bank.isOpen(), 4e3);
    await Execution.delayTicks(1);
    let stillFree = invFree();
    let stillBank = essenceName ? bankCountByName(essenceName) : bankEssenceTotal();
    if (stillFree > 0 && stillBank > 0) {
      const extraName = bankFindEssenceName() ?? essenceName;
      await withdrawNamed(extraName, Math.min(stillFree, stillBank));
      await Execution.delayUntil(() => invFree() <= 0 || !Bank.isOpen(), 3e3);
      await Execution.delayTicks(1);
    }
    if (!hasEssence()) {
      this.log(
        `withdraw clicked but inventory still has 0 essence (bank ${bankEssenceTotal()}, last saw ${this.lastBankEssence}), retrying`
      );
      await Execution.delayTicks(3);
      return;
    }
    await Bank.close();
    this.startBanked = true;
    this.bankTrips++;
    this.status = "walking to ruins";
    this.log(
      `loaded ${wearingTiara() ? TIARA_NAME : TALISMAN_NAME} + ${essenceCount()} essence, heading to ${RUINS_STAND.x},${RUINS_STAND.z}`
    );
  }
  /**
   * 0 means essence is gone (loaded bank, confirmed).
   * -1 means not sure yet, caller should return and retry next loop.
   */
  async confirmBankEssenceOrRetry() {
    if (!Bank.isOpen()) {
      return -1;
    }
    if (!bankContentsReady()) {
      this.log(
        `bank contents not loaded after deposit (last saw ${this.lastBankEssence} essence), retrying`
      );
      await waitBankLoaded();
      const again2 = bankEssenceTotal();
      if (again2 > 0) {
        return again2;
      }
      if (!bankContentsReady()) {
        if (this.lastBankEssence <= 0) {
          this.emptyEssenceConfirms++;
          this.log(
            `empty bank after wait (confirm ${this.emptyEssenceConfirms}/3), ` + (this.emptyEssenceConfirms < 3 ? "retrying" : "giving up")
          );
          if (this.emptyEssenceConfirms >= 3) {
            return 0;
          }
        }
        await Execution.delayTicks(3);
        return -1;
      }
    }
    const again = bankEssenceTotal();
    if (again > 0) {
      return again;
    }
    this.emptyEssenceConfirms++;
    const items = bankItems().length;
    this.log(
      `bank shows 0 essence (confirm ${this.emptyEssenceConfirms}/3, items ${items}, last saw ${this.lastBankEssence}), ` + (this.emptyEssenceConfirms < 3 ? "retrying" : "giving up")
    );
    if (this.emptyEssenceConfirms < 3) {
      await Bank.close();
      await Execution.delayTicks(3);
      return -1;
    }
    return 0;
  }
  async enterRuins() {
    if (inAltarInterior()) {
      return true;
    }
    if (!hasEntryItem()) {
      this.log("Body talisman / tiara missing, banking");
      this.startBanked = false;
      return false;
    }
    if (!hasEssence()) {
      return false;
    }
    if (!nearRuins() && cheb(tileOf() ?? RUINS_APPROACH, RUINS_APPROACH) > 4) {
      this.status = "walking to body ruins";
      this.log(`walking to body ruins approach ${RUINS_APPROACH.x},${RUINS_APPROACH.z}`);
      await this.walkTo(RUINS_APPROACH, 3);
    }
    if (inAltarInterior()) {
      return true;
    }
    const ruins = findRuins();
    if (!ruins) {
      this.status = "looking for ruins";
      this.log(`no Mysterious ruins near ${RUINS_STAND.x},${RUINS_STAND.z}, retrying`);
      await this.walkTo(RUINS_APPROACH, 3);
      await Execution.delayTicks(2);
      return false;
    }
    this.status = "entering body altar";
    let started = false;
    if (wearingTiara()) {
      const op = ruinsEnterOp(ruins);
      if (op) {
        this.log(`${op} ${ruins.name ?? "Mysterious ruins"} (tiara)`);
        started = !!await ruins.interact(op);
      }
    }
    if (!started) {
      const talisman = findTalisman();
      if (talisman && typeof talisman.useOn === "function") {
        this.log(`use ${TALISMAN_NAME} on ${ruins.name ?? "Mysterious ruins"}`);
        started = !!await talisman.useOn(ruins);
      }
    }
    if (!started) {
      const op = ruinsEnterOp(ruins);
      if (op) {
        this.log(`${op} Mysterious ruins`);
        started = !!await ruins.interact(op);
      }
    }
    if (!started) {
      this.log("could not enter the ruins, retrying");
      await Execution.delayTicks(2);
      return false;
    }
    const entered = await Execution.delayUntil(() => inAltarInterior(), 8e3);
    if (entered || inAltarInterior()) {
      this.log("inside the body altar");
      this.enterFails = 0;
      return true;
    }
    if (++this.enterFails >= MAX_ENTER_FAILS) {
      this.finishDone("stopped, the talisman did not teleport into the altar");
      return false;
    }
    this.log("ruins use did not teleport, retrying");
    await Execution.delayTicks(2);
    return false;
  }
  async craftAtAltar() {
    if (!hasEssence()) {
      return;
    }
    const altar = findCraftAltar();
    if (!altar) {
      this.status = "looking for altar";
      this.log("no Altar loc inside, waiting a tick");
      await Execution.delayTicks(2);
      return;
    }
    const dist = typeof altar.distance === "function" ? altar.distance() : 9;
    if (dist > 2) {
      const t = locTile(altar);
      if (t) {
        this.status = "walking to altar";
        await Traversal.walkTo(t, { radius: 1, timeoutMs: 8e3 });
      }
    }
    const beforeEss = essenceCount();
    const beforeRunes = bodyRuneCount();
    const beforeXp = rcXp();
    this.status = "crafting body runes";
    this.log(`crafting ${beforeEss} essence at the body altar (RC ${rcLevel()})`);
    let started = false;
    const op = craftOp(altar);
    if (op) {
      started = !!await altar.interact(op);
    }
    if (!started) {
      const ess = lastEssence();
      if (ess && typeof ess.useOn === "function") {
        started = !!await ess.useOn(altar);
      }
    }
    if (!started) {
      this.log("craft did not start, retrying");
      await Execution.delayTicks(2);
      return;
    }
    await Execution.delayUntil(
      () => essenceCount() < beforeEss || bodyRuneCount() > beforeRunes || rcXp() > beforeXp || ChatDialog.canContinue(),
      8e3
    );
    if (ChatDialog.canContinue()) {
      await ChatDialog.continue();
    }
    this.noteCrafted(beforeRunes, beforeEss);
    if (essenceCount() > 0 && typeof Game.animating === "function" && Game.animating()) {
      await Execution.delayUntil(() => essenceCount() <= 0 || !Game.animating(), 6e3);
      this.noteCrafted(beforeRunes, beforeEss);
    }
    if (essenceCount() <= 0) {
      this.log(`crafted, ${bodyRuneCount()} Body rune in pack`);
    }
  }
  async exitAltar() {
    if (!inAltarInterior()) {
      return true;
    }
    const portal = findPortal();
    if (!portal) {
      this.status = "looking for portal";
      this.log("no Portal inside the altar, waiting");
      await Execution.delayTicks(2);
      return false;
    }
    const dist = typeof portal.distance === "function" ? portal.distance() : 9;
    if (dist > 2) {
      const t = locTile(portal);
      if (t) {
        this.status = "walking to portal";
        await Traversal.walkTo(t, { radius: 1, timeoutMs: 8e3 });
      }
    }
    const op = portalOp(portal) ?? "Use";
    this.status = "taking the portal out";
    this.log(`${op} ${portal.name ?? "Portal"}`);
    await portal.interact(op);
    const left = await Execution.delayUntil(() => !inAltarInterior(), 12e3);
    if (left || !inAltarInterior()) {
      this.log("back at the mysterious ruins, banking at Edgeville");
      this.startBanked = false;
      return true;
    }
    this.log("portal did not exit, retrying");
    await Execution.delayTicks(2);
    return false;
  }
  onPaint(ctx) {
    const elapsed = Date.now() - this.startedAt;
    const hrs = elapsed / 36e5;
    const xp = Math.max(0, rcXp() - this.rcXpAtStart);
    const xph = hrs > 5e-4 ? xp / hrs : 0;
    const rph = hrs > 5e-4 ? this.crafted / hrs : 0;
    const here = tileOf();
    const where = inAltarInterior(here) ? "altar" : nearRuins(here) ? "ruins" : nearBank(here) ? "bank" : here ? `${here.x},${here.z}` : "...";
    const entry = wearingTiara() ? "tiara" : hasTalisman() ? "talisman" : "no entry";
    const lines = [
      "Benzyme's Body Runes",
      `time ${fmtElapsed(elapsed)} \xB7 ${this.status}`,
      `Body runes \xB7 RC ${rcLevel()} \xB7 ${where}`,
      `body ${this.crafted} \xB7 ${fmtXph(rph)}/hr \xB7 trips ${this.bankTrips}`,
      `ess ${essenceCount()} \xB7 ${entry}`,
      `runecraft: ${fmtXph(xph)} xp/hr  (+${Math.round(xp)} xp)`,
      `pack ${28 - invFree()}/28 \xB7 Edgeville \u2194 ruins`
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
      ctx.fillStyle = i === 0 ? TITLE_LIGHT_BLUE : "#ffffff";
      ctx.fillText(line, x, y);
    });
    ctx.restore();
  }
}
var EdgevilleBodyRunes_default = defineBot({
  name: SCRIPT_NAME,
  version: SCRIPT_VERSION_FULL,
  category: "Runecraft",
  tags: [
    "runecraft",
    "body rune",
    "essence",
    "talisman",
    "tiara",
    "edgeville",
    "altar",
    "bank"
  ],
  description: "Crafts Body runes from Edgeville. Withdraws essence, walks to the body ruins, enters with a Body tiara or talisman, crafts, then banks. Needs Runecrafting 20.",
  settingsSchema: {},
  create: () => new EdgevilleBodyRunes()
});
export {
  EdgevilleBodyRunes_default as default
};
