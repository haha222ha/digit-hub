# xlxtest 完整复刻穷尽调研（past / 历史人物匹配）

> 探测日期：2026-08-22  
> 目标站：https://xlxtest.com/past  
> 本仓库对标：`apps/psy-dist/tests/past_new` + `ProductAnalyzer/.../_xlxtest_chunks`

---

## 1. 结论先行：三种复刻等级

| 等级 | 做法 | 像素/UI | 分数一致 | 授权码跨站 | 难度 |
|------|------|---------|----------|------------|------|
| **L1 引擎复刻**（当前） | 拆 `questions` + `scoring` vendor，自写 HTML 结果页 | ~85% | ✅ 同答卷同分 | 用自家分销码 | 中 |
| **L2 结果页复刻** | L1 + 移植 `default-CHTGzYy7` 组件 + `default-HAMcHMCE.css` + `ShareImageModal` | ~95% | ✅ | 用自家码 | 中高 |
| **L3 整路由镜像** | 部署 xlxtest `/past` 全套 29 个 chunk + Vue shell | ~99% | ✅ | 需改 `/api/verify` 或 mock | 高 |

**无法仅靠授权码 KA657C 在服务器端还原用户答卷**——见第 4 节。  
**可以**通过浏览器 `localStorage` 导出 `reportData`（含完整 `answers` + `result`）实现 100% 分数与报告复现。

---

## 2. xlxtest 前端架构（past 路由）

### 2.1 入口与懒加载链

```
/past  →  index-P_hiHzdV-rBnOF_ZDsobST.js  (路由入口)
           ├─ QuestionnairePage-Bbz81Joy   (答题页)
           ├─ WelcomePage-C3T_Q5Vl         (欢迎/授权)
           ├─ default-CHTGzYy7             (★ 结果报告页 Vue 组件)
           ├─ ShareImageModal-pvWOsWns     (截图分享)
           ├─ localHistory-Cs4eP_LD        (本地历史)
           ├─ authCode / authCodeStorage   (授权码)
           ├─ questions-Ct3o4EnI          (26 题)
           ├─ scoring-CuPx53JQ             (评分 + 102 人物)
           ├─ displayDimensions-DjNiJTgC   (六维标签与换算)
           ├─ archetypeLabels-DNANDuXi     (人物别名)
           └─ contentVersion-D7Xuqeb--     (内容版本号 28)
```

完整依赖列表见 `tools/_fetch_past_deps.py`（已拉取 29 个 asset）。

### 2.2 公开 API（已探测）

| 端点 | 作用 | 是否含题目/答卷 |
|------|------|-----------------|
| `GET /api/public/scale-map` | 12 套量表元数据 | ❌ |
| `GET /api/public/config` | 站名、心跳间隔、店铺链接 | ❌ |
| `POST /api/verify` | 授权码验证 → `verifyToken` | ❌ 需设备指纹 |
| `POST /api/verify/heartbeat` | 会话保活 | ❌ |
| `POST /api/test/questions` | 部分量表服务端拉题 | past **题目在客户端 JS** |

**没有** `GET /api/result?code=KA657C` 这类「用授权码查历史结果」的公开接口。

### 2.3 评分数据流（客户端闭环）

```
用户选项[] + gender
    → scoreAnswers(answers, questions, scaleName)   [scoring-CuPx53JQ.js]
    → result {
         kind, contentVersion, genderPreference,
         primary { code, name, profile, bottomReport, ... },
         stats[6],              // 你的六维 %
         referenceStats[6]      // 人物参照六维 %
       }
    → localHistory.save({ reportData: { answers, result, ... } })
    → default-CHTGzYy7.vue 渲染雷达 + 相照 + 晒单
```

`referenceStats` **已在 scoring 输出里**，不需要结果页再算。

---

## 3. localStorage 穷尽清单（个人答卷导入）

### 3.1 past 历史记录（★ 最重要）

| Key | 类型 | 内容 |
|-----|------|------|
| `xlxtest:history:past:v1` | JSON 数组 | 最多 12 条本地历史 |

单条结构（从 `localHistory-Cs4eP_LD.js` 反混淆 + 运行时推断）：

```json
{
  "id": "uuid",
  "label": "文成公主",
  "sublabel": "唐代",
  "tags": ["远嫁和亲", "..."],
  "finishedAt": "ISO8601",
  "reportData": {
    "scaleCode": "past",
    "answers": [
      { "questionId": "1", "optionId": "B" },
      "... 26 题 ...",
      { "questionId": "__historyGenderPreference", "optionId": "female" }
    ],
    "result": {
      "contentVersion": 28,
      "primary": { "...": "完整人物+bottomReport" },
      "stats": [ { "key": "empathy", "value": 94, ... } ],
      "referenceStats": [ { "key": "empathy", "value": 90, ... } ]
    }
  }
}
```

**导入策略**：在 xlxtest 结果页打开控制台执行：

```javascript
copy(localStorage.getItem('xlxtest:history:past:v1'))
```

粘贴到我们站的导入页 → 解析 `reportData` → 直接 `renderPastResult(reportData.result)`，**无需重算、无需 26 题**。

### 3.2 授权码缓存

| Key 模式 | 内容 |
|----------|------|
| `xlxtest_authcode_{scaleCode}` | JWT 形：`{code}.{signature}` + deviceId + exp |

- 纯 `KA657C` **不是**存储格式；验证后写入带签名的对象。
- 只能解锁「能否开始测」，**不含答卷**。

### 3.3 其它可能 key（同站其它量表）

| Key 模式 | 量表 |
|----------|------|
| `xlxtest:history:muse:v1` | 文学原型 |
| `xlxtest:history:six:v1` | 16人格心智阶段 |
| … | 各 scale 独立 history 模块 |

---

## 4. 为什么 KA657C 不能跨站/server 还原

1. **授权码 ≠ 答卷**：`/api/verify` 校验设备指纹 + 码，返回 `verifyToken`，不返回 answers。
2. **答卷在浏览器**：完成测试后写入 `xlxtest:history:past:v1`；服务器未必持久化明细（即使持久化也无公开 API）。
3. **题目不加密**：`questions-Ct3o4EnI.js` 已公开；缺的是「谁选了什么」。
4. **验证请求实测**：`POST /api/verify` + `{code:KA657C, scaleCode:past}` → `INVALID_FINGERPRINT`（无浏览器指纹）。

---

## 5. 七种复刻方法（穷尽）

### 方法 A：Vendor 引擎 + 自研 UI（当前 past_new）

- **做法**：复制 `questions` + `scoring` + `displayDimensions` + `archetypeLabels` 到 `vendor/`；`scoreAnswers()` 出结果；`shared/past-result-ui.js` 渲染。
- **优点**：包体小、用自己的授权分销、可改 UI。
- **缺点**：结果页与 xlxtest 有 CSS/交互差（晒单弹窗、html2canvas 模板等）。
- **工具**：`tools/_build_past_new_dist.py`

### 方法 B：移植原站结果页组件（推荐下一步）

- **做法**：
  1. 拷贝 `default-CHTGzYy7.js` + `default-HAMcHMCE.css` + `ShareImageModal-*`
  2. 用 Vue 3 最小壳或把 SFC 编译进单页
  3. 输入 `reportData.result` 与原站 `reportState` 一致
- **优点**：雷达、维度卡、晒单、文案 95%+ 一致。
- **缺点**：仍依赖 Vue + 部分 `index-DWIgfZ_Z` 工具函数。

### 方法 C：整路由静态镜像（L3，已接入分销）

- **C 端入口**：`/test/past_xlx/{token}` → 原站 Vue 完整体验
- **演示/内测**：`https://psy.xhs365.cn/xlx-mirror/past`（无 token 时 mock 授权）
- **目录**：`apps/psy-dist/xlx-mirror/` + `shared/xlx-digit-integration.js`
- **桥接**：分销 `token` → xlxtest `verifyToken` + `start-test` / `complete-test`
- **优点**：几乎 1:1（原站 Vue 结果页、晒单、雷达）+ 走 digit-hub 配额。
- **缺点**：~12MB 包体；升级需重跑构建脚本。

### 方法 D：localStorage / reportData 导入（★ 个人精确复现）

- **做法**：用户从 xlxtest 复制 history JSON → 我们站 `import.html` 解析渲染。
- **优点**：**100% 还原该次测试**（含 stats/referenceStats/文案）。
- **缺点**：需用户在自己浏览器操作；不能批量猜 KA657C。

### 方法 E：Playwright 自动化抓取

- **做法**：无头浏览器 + 真实授权码 + 自动答题/读取 localStorage。
- **优点**：可批量化。
- **缺点**：违规/封号风险；指纹校验；维护成本高。**仅建议自有码内测**。

### 方法 F：深抓包（Chrome DevTools HAR）

- **做法**：测一遍 past，导出 HAR，找 submit/result API。
- **结论（已扫）**：past 评分**无 submit**；题目不在 API 返回体；HAR 只能看到 `/api/verify` 心跳。

### 方法 G：ProductAnalyzer 批量拆 chunk（12 套 xlxtest 原生量表）

- **做法**：`tools/_xlxtest_clone_inventory.py` + `_scan_xlxtest_deep.py` 按 scale 拉 `index-*.js` → 递归 `assets/`。
- **覆盖**：past, muse, ero, city, six, drk, taa, dkm, scl90, apt, sins, face（**12 套**，不是 digit-hub 117 套）。
- **digit-hub 117 套**来自 lingbo/Trae 另一管线，题目嵌在 `tests/*/index.html`。

---

## 6. 结果页 UI 对照（default-CHTGzYy7）

原站结果模块（已从 chunk 字符串表提取）：

1. 人物原型标题 + quote + tags  
2. **你的核心轮廓**（profile）  
3. **你的行为画像** — SVG 雷达 + 图例「实线为你 / 虚线为人物参照轮廓」  
4. 六维卡片：`你 XX% | 参照 YY%` + desc  
5. **你与{name}的相照之处** — path.summary + steps 01-04  
6. **现实中的你** — scenes + signal 引用  
7. 底部 intro 金句  
8. **截图分享**（ShareImageModal + html2canvas）  
9. **晒单有礼**（客服话术弹窗）  
10. **重新探索**

我们 `past-result-ui.js` 已覆盖 1-7、8 简化版；9-10 文案弹窗待对齐 `ShareImageModal`。

---

## 7. 推荐实施路线

```
Phase 1 ✅  scoring vendor + 基础结果 UI + preview 直显
Phase 2    import.html：粘贴 xlxtest:history:past:v1 → 原样渲染
Phase 3    引入 default-HAMcHMCE.css + ShareImageModal（L2）
Phase 4    可选：/xlx-mirror/past 整站镜像（L3）
```

---

## 8. 仓库与工具索引

| 路径 | 用途 |
|------|------|
| `ProductAnalyzer/.../_xlxtest_chunks/` | 原站 JS 碎片（past 已 29 文件齐全） |
| `tools/_fetch_past_deps.py` | 拉取 past 路由全部 assets |
| `tools/_xlxtest_probe.mjs` | 反混淆 key / 依赖列表 |
| `tools/_xlxtest_import_schema.mjs` | localStorage 结构推断 |
| `tools/_export_preview_results.mjs` | 101 人物 preview 导出 |
| `apps/psy-dist/shared/past-result-ui.js` | 我方结果渲染器 |
| `apps/psy-dist/tests/past_new/import.html` | localStorage 导入页 |

---

## 9. 竞品参考（同类「历史人物/原型匹配」）

- [kaucim.ai 100 古人格](https://www.kaucim.ai/persona) — 15 题 / 100 人  
- [TapTap 历史皇帝 MBTI](https://www.taptap.cn/app/876754) — 30 题 / 雷达  
- [TapTap 三国人物](https://www.taptap.cn/app/871858) — 16 维  
- [IDRLabs 荣格原型](https://www.idrlabs.com/cn/archetype/test.php) — 原型理论类  

xlxtest 差异：**26 场景题 + 102 人 + 双雷达对比 + 长报告 + 分销授权**，组合更完整。

---

## 10. 用户操作：导出你在 xlxtest 的精确结果

1. 在 **完成测试的同一浏览器** 打开 https://xlxtest.com/past  
2. F12 → Console：

```javascript
// 列出所有 xlxtest 相关 key
Object.keys(localStorage).filter(k => k.includes('xlxtest'))

// 导出 past 历史（含答卷+完整 result）
copy(localStorage.getItem('xlxtest:history:past:v1'))
```

3. 打开 `https://psy.xhs365.cn/tests/past_new/import.html`  
4. 粘贴 → 选择一条历史 → 查看与原版一致的分数与报告  

若 `history` 为空：说明清过缓存或换过设备，只能重测或从截图/manual 录入选项。
