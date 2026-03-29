/**
 * 状态 / 变量向 AI：参考 stage_prompt 的单条 user 载荷形式，先支持「按 stuff_describe 体系向主角储物袋添加物品」。
 * 依赖：MjCreationConfig、全局描述表 MjDescribe*、MortalJourneyGame（应用时）。
 */
(function (global) {
  "use strict";

  var INVENTORY_SLOT_COUNT = 12;
  /** 与 mainScreen 一致：佩戴 3 格、功法 12 格 */
  var EQUIP_SLOT_COUNT = 3;
  var GONGFA_SLOT_COUNT = 12;
  var EQUIP_SLOT_LABELS = ["武器", "法器", "防具"];
  var OPS_TAG_OPEN = "<mj_inventory_ops>";
  var OPS_TAG_CLOSE = "</mj_inventory_ops>";

  function ensureInventoryShape(G) {
    if (!G) return;
    if (!Array.isArray(G.inventorySlots) || G.inventorySlots.length !== INVENTORY_SLOT_COUNT) {
      var a = [];
      for (var i = 0; i < INVENTORY_SLOT_COUNT; i++) a.push(null);
      G.inventorySlots = a;
    }
  }

  function normalizeBagItem(entry) {
    if (entry == null) return null;
    var name =
      entry.name != null
        ? String(entry.name).trim()
        : entry.label != null
          ? String(entry.label).trim()
          : "";
    if (!name) return null;
    var c = entry.count;
    var cnt = typeof c === "number" && isFinite(c) ? Math.max(0, Math.floor(c)) : 1;
    var o = { name: name, count: cnt };
    if (entry.desc != null && String(entry.desc).trim() !== "") o.desc = String(entry.desc);
    if (entry.equipType != null && String(entry.equipType).trim() !== "") {
      o.equipType = String(entry.equipType).trim();
    }
    if (entry.grade != null && String(entry.grade).trim() !== "") o.grade = String(entry.grade).trim();
    if (typeof entry.value === "number" && isFinite(entry.value)) {
      o.value = Math.max(0, Math.floor(entry.value));
    }
    if (!o.equipType && entry.type != null && String(entry.type).trim() !== "") {
      o.type = String(entry.type).trim();
    }
    if (entry.bonus && typeof entry.bonus === "object" && Object.keys(entry.bonus).length > 0) {
      o.bonus = entry.bonus;
    }
    if (entry.effects && typeof entry.effects === "object" && Object.keys(entry.effects).length > 0) {
      o.effects = entry.effects;
    }
    return o;
  }

  function findFirstEmptyBagSlot(G) {
    ensureInventoryShape(G);
    for (var i = 0; i < INVENTORY_SLOT_COUNT; i++) {
      if (!G.inventorySlots[i]) return i;
    }
    return -1;
  }

  /**
   * 与 mainScreen.tryPlaceItemInBag 一致：同名堆叠，否则占空位。
   * @returns {boolean}
   */
  function tryPlaceItemInBag(G, payload) {
    if (!G || !payload || !payload.name) return false;
    ensureInventoryShape(G);
    var name = String(payload.name).trim();
    if (!name) return false;
    var cnt =
      typeof payload.count === "number" && isFinite(payload.count) ? Math.max(1, Math.floor(payload.count)) : 1;
    var desc = payload.desc != null ? String(payload.desc) : "";
    for (var i = 0; i < INVENTORY_SLOT_COUNT; i++) {
      var c = G.inventorySlots[i];
      if (c && c.name === name) {
        c.count = (typeof c.count === "number" && isFinite(c.count) ? c.count : 1) + cnt;
        return true;
      }
    }
    var j = findFirstEmptyBagSlot(G);
    if (j < 0) return false;
    G.inventorySlots[j] = normalizeBagItem({
      name: name,
      count: cnt,
      desc: desc || undefined,
      equipType: payload.equipType,
      grade: payload.grade,
      value: payload.value,
      type: payload.type,
      bonus: payload.bonus,
      effects: payload.effects,
    });
    return true;
  }

  function bagCellContinuityForNormalize(c) {
    if (!c) return {};
    var o = {};
    if (c.desc != null) o.desc = c.desc;
    if (c.equipType != null) o.equipType = c.equipType;
    if (c.grade != null) o.grade = c.grade;
    if (typeof c.value === "number" && isFinite(c.value)) o.value = c.value;
    if (c.type != null) o.type = c.type;
    if (c.bonus && typeof c.bonus === "object") o.bonus = c.bonus;
    if (c.effects && typeof c.effects === "object") o.effects = c.effects;
    return o;
  }

  /**
   * 从储物袋扣减同名堆叠（先校验总量，再修改格子；多格同名会按槽位顺序扣）。
   * @returns {{ ok: boolean, reason?: string }}
   */
  function removeStackedItemsFromBag(G, name, count) {
    ensureInventoryShape(G);
    var nm = name != null ? String(name).trim() : "";
    if (!nm) return { ok: false, reason: "缺少有效 name" };
    var n = typeof count === "number" && isFinite(count) ? Math.max(1, Math.floor(count)) : 1;
    var total = 0;
    for (var t = 0; t < INVENTORY_SLOT_COUNT; t++) {
      var ct = G.inventorySlots[t];
      if (ct && String(ct.name).trim() === nm) {
        var cc = typeof ct.count === "number" && isFinite(ct.count) ? Math.max(1, Math.floor(ct.count)) : 1;
        total += cc;
      }
    }
    if (total < n) return { ok: false, reason: "数量不足（仅有 " + total + "）" };
    var remaining = n;
    for (var i = 0; i < INVENTORY_SLOT_COUNT && remaining > 0; i++) {
      var c = G.inventorySlots[i];
      if (!c || String(c.name).trim() !== nm) continue;
      var cur = typeof c.count === "number" && isFinite(c.count) ? Math.max(1, Math.floor(c.count)) : 1;
      var take = Math.min(cur, remaining);
      var next = cur - take;
      remaining -= take;
      if (next <= 0) G.inventorySlots[i] = null;
      else {
        G.inventorySlots[i] = normalizeBagItem(
          Object.assign({ name: nm, count: next }, bagCellContinuityForNormalize(c)),
        );
      }
    }
    return { ok: true };
  }

  function sampleDescribeFields(src) {
    if (!src || typeof src !== "object") return null;
    var o = {};
    if (src.desc != null && String(src.desc).trim() !== "") o.desc = String(src.desc).trim();
    if (src.grade != null && String(src.grade).trim() !== "") o.grade = String(src.grade).trim();
    if (src.type != null && String(src.type).trim() !== "") o.type = String(src.type).trim();
    if (typeof src.value === "number" && isFinite(src.value)) o.value = src.value;
    if (src.bonus && typeof src.bonus === "object" && Object.keys(src.bonus).length) {
      o.bonus = src.bonus;
    }
    if (src.effects && typeof src.effects === "object") o.effects = src.effects;
    return Object.keys(o).length ? o : null;
  }

  /**
   * 汇总 stuff_describe（灵石 / 丹药 / 杂物）及装备表，供模型对齐字段与合法名称。
   */
  function buildStuffDescribeCatalog() {
    var out = {
      spirit_stones: {},
      pills: {},
      stuff: {},
      equipment: {},
    };
    var SS = global.MjDescribeSpiritStones;
    if (SS && typeof SS === "object") {
      for (var ks in SS) {
        if (Object.prototype.hasOwnProperty.call(SS, ks)) {
          var s = sampleDescribeFields(SS[ks]);
          if (s) out.spirit_stones[ks] = s;
        }
      }
    }
    var P = global.MjDescribePills;
    if (P && typeof P === "object") {
      for (var kp in P) {
        if (Object.prototype.hasOwnProperty.call(P, kp)) {
          var p = sampleDescribeFields(P[kp]);
          if (p) out.pills[kp] = p;
        }
      }
    }
    var ST = global.MjDescribeStuff;
    if (ST && typeof ST === "object") {
      for (var kt in ST) {
        if (Object.prototype.hasOwnProperty.call(ST, kt)) {
          var t = sampleDescribeFields(ST[kt]);
          if (t) out.stuff[kt] = t;
        }
      }
    }
    var E = global.MjDescribeEquipment;
    if (E && typeof E === "object") {
      for (var ke in E) {
        if (Object.prototype.hasOwnProperty.call(E, ke)) {
          var e = sampleDescribeFields(E[ke]);
          if (e) out.equipment[ke] = e;
        }
      }
    }
    return out;
  }

  function buildStuffDescribeCatalogJson() {
    return JSON.stringify(buildStuffDescribeCatalog());
  }

  /**
   * 当前储物袋 12 格快照（与运行时一致：name、count，及可选 desc、grade、value、equipType、type、bonus、effects）
   */
  function buildInventorySnapshot(G) {
    var g = G || global.MortalJourneyGame || {};
    ensureInventoryShape(g);
    var slots = [];
    for (var i = 0; i < INVENTORY_SLOT_COUNT; i++) {
      var cell = g.inventorySlots[i];
      slots.push(cell ? normalizeBagItem(cell) : null);
    }
    return JSON.stringify(slots);
  }

  function normalizeEquipSlotCell(cell) {
    if (cell == null) return null;
    var name =
      cell.name != null
        ? String(cell.name).trim()
        : cell.label != null
          ? String(cell.label).trim()
          : "";
    if (!name) return null;
    var o = { name: name };
    if (cell.desc != null && String(cell.desc).trim() !== "") o.desc = String(cell.desc);
    if (cell.equipType != null && String(cell.equipType).trim() !== "") o.equipType = String(cell.equipType);
    return o;
  }

  function normalizeGongfaSlotCell(cell) {
    if (cell == null) return null;
    var name =
      cell.name != null
        ? String(cell.name).trim()
        : cell.label != null
          ? String(cell.label).trim()
          : "";
    if (!name) return null;
    var o = { name: name };
    if (cell.desc != null && String(cell.desc).trim() !== "") o.desc = String(cell.desc);
    if (cell.type != null && String(cell.type).trim() !== "") o.type = String(cell.type);
    if (cell.grade != null && String(cell.grade).trim() !== "") o.grade = String(cell.grade);
    return o;
  }

  /**
   * 主角佩戴栏 3 格快照（只读，不写回 G）
   */
  function buildEquippedSnapshot(G) {
    var g = G || global.MortalJourneyGame || {};
    var raw =
      Array.isArray(g.equippedSlots) && g.equippedSlots.length === EQUIP_SLOT_COUNT
        ? g.equippedSlots
        : [null, null, null];
    var out = [];
    for (var i = 0; i < EQUIP_SLOT_COUNT; i++) {
      var item = normalizeEquipSlotCell(raw[i]);
      if (!item) {
        out.push(null);
        continue;
      }
      var row = { 槽位: EQUIP_SLOT_LABELS[i] || "装备", index: i, name: item.name };
      if (item.desc) row.desc = item.desc;
      if (item.equipType) row.equipType = item.equipType;
      out.push(row);
    }
    return JSON.stringify(out);
  }

  /**
   * 主角功法栏 12 格快照（只读）
   */
  function buildGongfaSnapshot(G) {
    var g = G || global.MortalJourneyGame || {};
    var raw =
      Array.isArray(g.gongfaSlots) && g.gongfaSlots.length === GONGFA_SLOT_COUNT
        ? g.gongfaSlots
        : [];
    var slots = [];
    for (var j = 0; j < GONGFA_SLOT_COUNT; j++) {
      slots.push(normalizeGongfaSlotCell(raw[j]) || null);
    }
    return JSON.stringify(slots);
  }

  function isWearSlotEquipType(t) {
    return t === "武器" || t === "法器" || t === "防具";
  }

  function shallowCloneEffects(eff) {
    if (!eff || typeof eff !== "object") return undefined;
    try {
      return JSON.parse(JSON.stringify(eff));
    } catch (e) {
      return eff;
    }
  }

  /**
   * 将 AI 操作与描述表合并为可放入格子的 payload（表内 desc/grade/value/type/bonus/effects 优先，op 可覆盖）。
   * 注意：装备佩戴部位仅用 equipType 或 type 为「武器|法器|防具」；丹药等用 type「丹药」等，不可把丹药 type 误写入 equipType。
   */
  function resolvePlacePayload(raw) {
    var op = raw && typeof raw === "object" ? raw : {};
    var name = op.name != null ? String(op.name).trim() : "";
    if (!name) return null;

    var C = global.MjCreationConfig;
    var st = C && typeof C.getStuffDescribe === "function" ? C.getStuffDescribe(name) : null;
    var eq = C && typeof C.getEquipmentDescribe === "function" ? C.getEquipmentDescribe(name) : null;
    var base = st || eq || null;

    var count =
      typeof op.count === "number" && isFinite(op.count) ? Math.max(1, Math.floor(op.count)) : 1;

    var desc = "";
    if (op.desc != null && String(op.desc).trim() !== "") desc = String(op.desc).trim();
    else if (base && base.desc) desc = String(base.desc);

    var grade = "";
    if (op.grade != null && String(op.grade).trim() !== "") grade = String(op.grade).trim();
    else if (base && base.grade != null && String(base.grade).trim() !== "")
      grade = String(base.grade).trim();

    var equipType;
    var bagType;
    if (op.equipType != null && String(op.equipType).trim() !== "") {
      equipType = String(op.equipType).trim();
    } else if (eq && eq.type != null && String(eq.type).trim() !== "") {
      equipType = String(eq.type).trim();
    }
    if (op.type != null && String(op.type).trim() !== "") {
      var top = String(op.type).trim();
      if (isWearSlotEquipType(top)) {
        if (!equipType) equipType = top;
      } else {
        bagType = top;
      }
    }
    if (!bagType && st && st.type != null && String(st.type).trim() !== "" && !eq) {
      bagType = String(st.type).trim();
    }
    if (equipType) {
      bagType = undefined;
    }

    var valueNum;
    if (typeof op.value === "number" && isFinite(op.value)) {
      valueNum = Math.max(0, Math.floor(op.value));
    } else if (base && typeof base.value === "number" && isFinite(base.value)) {
      valueNum = Math.floor(base.value);
    }

    var mergedBonus = {};
    if (base && base.bonus && typeof base.bonus === "object") {
      Object.assign(mergedBonus, base.bonus);
    }
    if (op.bonus && typeof op.bonus === "object") {
      Object.assign(mergedBonus, op.bonus);
    }
    var bonusOut = Object.keys(mergedBonus).length ? mergedBonus : undefined;

    var effectsOut;
    if (op.effects != null && typeof op.effects === "object") {
      effectsOut = shallowCloneEffects(op.effects);
    } else if (st && st.effects != null && typeof st.effects === "object") {
      effectsOut = shallowCloneEffects(st.effects);
    }

    if (C && typeof C.resolveStuffEntry === "function") {
      var meta = {};
      if (desc) meta.desc = desc;
      if (grade) meta.grade = grade;
      meta.count = count;
      if (bonusOut) meta.bonus = bonusOut;
      var resolved = C.resolveStuffEntry(name, meta);
      if (resolved && resolved.type === "item" && resolved.name) {
        var c0 = typeof resolved.count === "number" && isFinite(resolved.count) ? resolved.count : count;
        var pay = {
          name: String(resolved.name).trim(),
          count: Math.max(1, c0),
          desc: resolved.desc,
          grade: resolved.grade,
          equipType: equipType,
        };
        if (typeof valueNum === "number") pay.value = valueNum;
        if (bagType) pay.type = bagType;
        if (bonusOut) pay.bonus = bonusOut;
        if (effectsOut) pay.effects = effectsOut;
        return pay;
      }
    }

    var out = {
      name: name,
      count: count,
      desc: desc || undefined,
      grade: grade || undefined,
      equipType: equipType,
    };
    if (typeof valueNum === "number") out.value = valueNum;
    if (bagType) out.type = bagType;
    if (bonusOut) out.bonus = bonusOut;
    if (effectsOut) out.effects = effectsOut;
    return out;
  }

  /**
   * 单独 system 消息：与 user 里的规则双保险，避免模型只写说明不写标签。
   */
  var DEFAULT_STATE_SYSTEM_PROMPT =
    "你是修仙游戏的「储物袋状态」执行器，只做一件事：根据剧情判断主角储物袋内物品与堆叠数量应如何变化，并输出机器可解析的 JSON 数组（可增加、可减少）。\n" +
    "【铁律】\n" +
    "1. 回复正文可以先用一两句中文说明你的判断（可选）。\n" +
    "2. 全文【必须】包含一对闭合标签（标签名与下列完全一致，区分大小写）：\n" +
    "   开始行：" +
    OPS_TAG_OPEN +
    "\n   结束行：" +
    OPS_TAG_CLOSE +
    "\n" +
    "3. 标签内【只有】JSON 数组，禁止 Markdown 代码围栏（不要用 ``` 包裹标签）。\n" +
    "4. 无变更时标签内写空数组：" +
    OPS_TAG_OPEN +
    "[]" +
    OPS_TAG_CLOSE +
    "\n" +
    "5. 增加：剧情若明确「获得××× N」「奖励×× N 份」「买入到手」等，用 op:add，name 用表中已有名称（如 下品灵石），count 为新增数量；程序会自动与储物袋同名堆叠合并。\n" +
    "6. 减少：剧情若明确支付灵石、消费堆叠物、遗失、上缴、赠出、被没收等导致袋内数量减少，必须用 op:remove，name 与快照中一致（如 下品灵石），count 为扣减件数。灵石收支由你负责：买了东西花了灵石就要 remove 灵石；卖了或领到灵石就要 add 灵石。禁止在说明文字里写「灵石扣除不在此范围」——凡影响袋内堆叠数量的，都须写进标签内数组。\n" +
    "7. op:add 时：表外新物必须对齐「可引用物品表」字段：必填 desc、grade、value；非装备带 type；装备带 type 或 equipType（武器|法器|防具）与 bonus；丹药带 type:\"丹药\" 并尽量带 effects。op:remove 只需 name 与 count，不要求精简字段。\n" +
    "8. 【禁止重复入库】下方「主角当前佩戴」「主角功法栏」中已出现的物品/功法，视为已在身或已修习。剧情里只是「使用」「驾驭」「运转」它们不算新获得，【禁止】再 op:add 进储物袋；仅当剧情明确新发放、拾取、购买且应进背包时才 add。储物袋与佩戴栏、功法栏是三个独立数据区。";

  var DEFAULT_OUTPUT_RULES =
    "【输出要求 · 机器解析】\n" +
    "■ 无论是否有物品变更，【必须】输出下面这一对标签，且标签内为合法 JSON 数组（不要用 ```json 代码块代替标签）。\n" +
    "■ 示例（仅增加）：\n" +
    OPS_TAG_OPEN +
    '[{"op":"add","name":"下品灵石","count":3}]' +
    OPS_TAG_CLOSE +
    "\n" +
    "■ 示例（买装备花灵石：先扣灵石再加新物，顺序可任意）：\n" +
    OPS_TAG_OPEN +
    '[{"op":"remove","name":"下品灵石","count":11},{"op":"add","name":"铁剑","count":1,"desc":"……","grade":"下品","value":20,"type":"武器","bonus":{"物攻":5}}]' +
    OPS_TAG_CLOSE +
    "\n" +
    "■ 示例（无变更）：\n" +
    OPS_TAG_OPEN +
    "[]" +
    OPS_TAG_CLOSE +
    "\n" +
    "■ 数组元素：op 为 \"add\" 或 \"remove\"；name 必填；count 为正整数（add 为增加数量，remove 为扣减数量），默认 1。\n" +
    "■ 表中不存在的物品：必须 desc、grade、value；非装备加 type（如 丹药）；装备加 type 或 equipType（武器|法器|防具）与 bonus；丹药建议加 effects（同表内丹药 JSON 结构）。\n" +
    "■ 表示例（表外杂物）：{\"op\":\"add\",\"name\":\"青木令牌\",\"count\":1,\"desc\":\"……\",\"grade\":\"下品\",\"value\":50,\"type\":\"杂物\"}\n" +
    "■ 表示例（表外·武器）：{\"op\":\"add\",\"name\":\"试炼铁剑\",\"count\":1,\"desc\":\"……\",\"grade\":\"下品\",\"value\":25,\"type\":\"武器\",\"bonus\":{\"物攻\":6}}\n" +
    "■ 表示例（表外·法器）：{\"op\":\"add\",\"name\":\"试炼青叶\",\"count\":1,\"desc\":\"……\",\"grade\":\"下品\",\"value\":30,\"type\":\"法器\",\"bonus\":{\"脚力\":5}}\n" +
    "■ 表示例（表外·防具）：{\"op\":\"add\",\"name\":\"试炼布衣\",\"count\":1,\"desc\":\"……\",\"grade\":\"下品\",\"value\":10,\"type\":\"防具\",\"bonus\":{\"物防\":5}}\n" +
    "■ 表示例（表外丹药）：{\"op\":\"add\",\"name\":\"辟谷丹\",\"count\":3,\"desc\":\"……\",\"grade\":\"下品\",\"value\":15,\"type\":\"丹药\",\"effects\":{\"recover\":{\"hp\":5,\"mp\":0}}}\n" +
    "■ 剧情中出现「获得下品灵石×3」应 add；出现「付出/支付/递出十一块下品灵石」等应对 下品灵石 做 remove，count 与剧情一致。\n" +
    "■ 已在「主角当前佩戴」或「主角功法栏」中出现的名称，不要再 add 进储物袋（除非剧情明确又给了第二份同款且应堆叠在背包）。";

  /**
   * 拼出与 stage_prompt 类似的单条 user 正文（状态快照 + 表 + 剧情 + 规则）。
   * @param {Object} opts
   * @param {string} [opts.storyText] 剧情或当前局面说明
   * @param {string} [opts.extraUserHint] 追加说明
   * @param {Object} [opts.game] 默认 MortalJourneyGame
   */
  function buildInventoryStateUserContent(opts) {
    var o = opts || {};
    var G = o.game != null ? o.game : global.MortalJourneyGame || {};
    var parts = [];
    parts.push("你");
    parts.push("");
    parts.push(
      "### 主角当前佩戴（3 格，顺序：武器、法器、防具；与储物袋分立，已穿在身上的不要因剧情「使用」而再 add 入袋）",
    );
    parts.push(buildEquippedSnapshot(G));
    parts.push("### 主角功法栏（12 格，null 为空位；已学已装载的功法不要当背包物品重复 add）");
    parts.push(buildGongfaSnapshot(G));
    parts.push("### 储物袋快照（12 格，null 为空位）");
    parts.push(buildInventorySnapshot(G));
    parts.push("### 可引用物品表（stuff_describe + 装备表，字段与游戏内描述一致）");
    parts.push(buildStuffDescribeCatalogJson());
    if (o.storyText != null && String(o.storyText).trim() !== "") {
      parts.push("### 剧情 / 局面");
      parts.push(String(o.storyText).trim());
    }
    if (o.extraUserHint != null && String(o.extraUserHint).trim() !== "") {
      parts.push("### 补充说明");
      parts.push(String(o.extraUserHint).trim());
    }
    parts.push("### 变量操作（储物袋）");
    parts.push(DEFAULT_OUTPUT_RULES);
    return parts.join("\n");
  }

  /**
   * @param {Object} opts
   * @param {string} [opts.systemPrompt]
   * @param {string} [opts.storyText]
   * @param {string} [opts.extraUserHint]
   * @param {Object} [opts.game]
   * @returns {Array<{role:string,content:string}>}
   */
  function buildMessages(opts) {
    var o = opts || {};
    var messages = [];
    var custom = o.systemPrompt != null && String(o.systemPrompt).trim() !== "" ? String(o.systemPrompt).trim() : "";
    var sys = custom ? custom + "\n\n---\n\n" + DEFAULT_STATE_SYSTEM_PROMPT : DEFAULT_STATE_SYSTEM_PROMPT;
    messages.push({ role: "system", content: sys });
    messages.push({ role: "user", content: buildInventoryStateUserContent(o) });
    return messages;
  }

  function stripJsonFence(s) {
    var t = String(s || "").trim();
    var m = /^```(?:json)?\s*([\s\S]*?)\s*```$/im.exec(t);
    return m ? m[1].trim() : t;
  }

  /**
   * 从全文提取 ``` / ```json 围栏内的块，尝试解析为 JSON 数组（兼容模型不写标签的坏习惯）。
   */
  function tryParseInventoryOpsFromMarkdownFences(raw) {
    var text = String(raw || "");
    var i = 0;
    var candidates = [];
    while (i < text.length) {
      var open = text.indexOf("```", i);
      if (open < 0) break;
      var afterOpen = open + 3;
      var nl = text.indexOf("\n", afterOpen);
      var bodyStart = afterOpen;
      if (nl > afterOpen && nl - afterOpen <= 12) {
        var head = text.slice(afterOpen, nl).trim().toLowerCase();
        if (head === "json" || head === "") bodyStart = nl + 1;
      }
      var close = text.indexOf("```", bodyStart);
      if (close < 0) break;
      var block = text.slice(bodyStart, close).trim();
      if (block.charAt(0) === "[") {
        try {
          var p = JSON.parse(block);
          if (Array.isArray(p)) candidates.push(p);
        } catch (e1) {
          /* 忽略 */
        }
      }
      i = close + 3;
    }
    if (!candidates.length) return null;
    for (var c = candidates.length - 1; c >= 0; c--) {
      var arr = candidates[c];
      if (!arr.length) continue;
      for (var j = 0; j < arr.length; j++) {
        if (arr[j] && typeof arr[j] === "object" && String(arr[j].op || "").trim() !== "") {
          return arr;
        }
      }
    }
    for (var c2 = candidates.length - 1; c2 >= 0; c2--) {
      if (!candidates[c2].length) return candidates[c2];
    }
    return candidates[candidates.length - 1];
  }

  /**
   * @param {string} text
   * @returns {{ ok: boolean, ops: Array<Object>, error?: string, parseVia?: string }}
   */
  function parseInventoryOpsFromText(text) {
    var raw = String(text || "");
    var errBits = [];

    var tagRe = /<mj_inventory_ops\s*>\s*([\s\S]*?)\s*<\/mj_inventory_ops\s*>/i;
    var tm = tagRe.exec(raw);
    if (tm) {
      var inner = stripJsonFence(tm[1].trim());
      try {
        var parsed = JSON.parse(inner);
        if (!Array.isArray(parsed)) {
          errBits.push("标签内须为 JSON 数组");
        } else {
          return { ok: true, ops: parsed, parseVia: "tag" };
        }
      } catch (eTag) {
        errBits.push("标签内 JSON：" + (eTag && eTag.message ? String(eTag.message) : "解析失败"));
      }
    } else {
      errBits.push("未找到 " + OPS_TAG_OPEN + " … " + OPS_TAG_CLOSE);
    }

    var fromFence = tryParseInventoryOpsFromMarkdownFences(raw);
    if (fromFence) {
      return { ok: true, ops: fromFence, parseVia: "markdown_fence" };
    }

    var lines = raw.split(/\r?\n/);
    for (var li = lines.length - 1; li >= 0; li--) {
      var L = String(lines[li] || "").trim();
      if (L === "") continue;
      if (L === "[]") return { ok: true, ops: [], parseVia: "trailing_line" };
      if (L.charAt(0) === "[" && L.charAt(L.length - 1) === "]") {
        try {
          var pLine = JSON.parse(L);
          if (Array.isArray(pLine)) return { ok: true, ops: pLine, parseVia: "trailing_line" };
        } catch (eLine) {
          errBits.push("末行 JSON：" + (eLine && eLine.message ? String(eLine.message) : ""));
        }
      }
      break;
    }

    return { ok: false, ops: [], error: errBits.length ? errBits.join("；") : "无法解析储物袋指令" };
  }

  /**
   * @param {Object} G MortalJourneyGame
   * @param {Array<Object>} ops
   * @returns {{ placed: Array<Object>, removed: Array<Object>, failed: Array<{op:Object,reason:string}> }}
   */
  function applyInventoryOps(G, ops) {
    var placed = [];
    var removed = [];
    var failed = [];
    if (!G) {
      failed.push({ op: null, reason: "MortalJourneyGame 不存在" });
      return { placed: placed, removed: removed, failed: failed };
    }
    if (!Array.isArray(ops)) return { placed: placed, removed: removed, failed: failed };

    for (var i = 0; i < ops.length; i++) {
      var raw = ops[i];
      if (!raw || typeof raw !== "object") continue;
      var opn = raw.op != null ? String(raw.op).trim().toLowerCase() : "";
      if (opn === "remove") {
        var rnm = raw.name != null ? String(raw.name).trim() : "";
        var rcnt =
          typeof raw.count === "number" && isFinite(raw.count) ? Math.max(1, Math.floor(raw.count)) : 1;
        if (!rnm) {
          failed.push({ op: raw, reason: "remove 缺少有效 name" });
          continue;
        }
        var rm = removeStackedItemsFromBag(G, rnm, rcnt);
        if (rm.ok) removed.push({ name: rnm, count: rcnt });
        else failed.push({ op: raw, reason: rm.reason || "扣除失败" });
        continue;
      }
      if (opn !== "add") {
        failed.push({ op: raw, reason: "不支持的 op（仅支持 add、remove）" });
        continue;
      }
      var payload = resolvePlacePayload(raw);
      if (!payload) {
        failed.push({ op: raw, reason: "缺少有效 name" });
        continue;
      }
      if (tryPlaceItemInBag(G, payload)) placed.push(payload);
      else failed.push({ op: raw, reason: "储物袋已满或无法放置" });
    }
    return { placed: placed, removed: removed, failed: failed };
  }

  function applyInventoryOpsFromAssistantText(G, assistantText) {
    var pr = parseInventoryOpsFromText(assistantText);
    if (!pr.ok) {
      return { ok: false, placed: [], removed: [], failed: [], parseError: pr.error, parseVia: null };
    }
    var r = applyInventoryOps(G, pr.ops);
    return {
      ok: true,
      placed: r.placed,
      removed: r.removed,
      failed: r.failed,
      parseError: null,
      parseVia: pr.parseVia != null ? pr.parseVia : "tag",
    };
  }

  /**
   * @param {Object} opts
   * @param {Array<{role:string,content:string}>} [opts.messages]
   * @param {string} [opts.storyText] 未传 messages 时用于 buildMessages
   * @param {boolean} [opts.shouldStream=true]
   * @param {function(string,string):void} [opts.onDelta]
   * @param {AbortSignal} [opts.signal]
   */
  function sendTurn(opts) {
    var TH = global.TavernHelper;
    if (!TH || typeof TH.generateFromMessages !== "function") {
      return Promise.reject(
        new Error("TavernHelper 未加载：请在 main.html 中于本脚本之后引入 silly_tarven/bridge-config.js 与 bridge.js。"),
      );
    }
    var o = opts || {};
    var messages =
      Array.isArray(o.messages) && o.messages.length > 0 ? o.messages : buildMessages(o);
    return TH.generateFromMessages({
      messages: messages,
      should_stream: o.shouldStream !== false,
      onDelta: o.onDelta,
      signal: o.signal,
    });
  }

  global.MortalJourneyStateGenerate = {
    INVENTORY_SLOT_COUNT: INVENTORY_SLOT_COUNT,
    EQUIP_SLOT_COUNT: EQUIP_SLOT_COUNT,
    GONGFA_SLOT_COUNT: GONGFA_SLOT_COUNT,
    OPS_TAG_OPEN: OPS_TAG_OPEN,
    OPS_TAG_CLOSE: OPS_TAG_CLOSE,
    buildStuffDescribeCatalog: buildStuffDescribeCatalog,
    buildStuffDescribeCatalogJson: buildStuffDescribeCatalogJson,
    buildEquippedSnapshot: buildEquippedSnapshot,
    buildGongfaSnapshot: buildGongfaSnapshot,
    buildInventorySnapshot: buildInventorySnapshot,
    buildInventoryStateUserContent: buildInventoryStateUserContent,
    buildMessages: buildMessages,
    parseInventoryOpsFromText: parseInventoryOpsFromText,
    resolvePlacePayload: resolvePlacePayload,
    applyInventoryOps: applyInventoryOps,
    applyInventoryOpsFromAssistantText: applyInventoryOpsFromAssistantText,
    sendTurn: sendTurn,
  };
})(typeof window !== "undefined" ? window : globalThis);
