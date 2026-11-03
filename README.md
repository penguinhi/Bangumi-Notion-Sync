# Bangumi → Notion 同步

[English](README.en.md) | 简体中文

一个油猴脚本：在 [Bangumi](https://bgm.tv) 条目页上标记动画后，自动把收藏状态、进度和日期同步到你的 Notion 数据库。

- **单向同步**：只从 Bangumi 写到 Notion，不会改动 Bangumi。
- **不覆盖手改内容**：Notion 里已有的条目只更新状态、总集数和进度。你手填的评分、吐槽、日期不会被改掉。
- **Token 不进代码**：首次使用时在设置面板里填写，只保存在本地的脚本管理器里。

## 安装

1. 安装脚本管理器：[Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)。
2. 安装 [bangumi-notion-sync.js](bangumi-notion-sync.js)。
3. 按下面的步骤准备好 Notion 数据库和两个 Token。

## 准备工作

### 1. Notion 数据库

新建一个数据库，包含下面这些属性。名字和类型都要对上；名字不一样的话，可以在脚本里的 `CFG.PROP` 改成你的列名。

| 属性名 | 类型 | 写入内容 |
| --- | --- | --- |
| Title | 标题 | 条目原名 |
| Alternative Title | 文本 | 中文名 |
| Status | 单选 | Plan to Watch / Watching / Completed / On-Hold / Dropped |
| Episodes | 数字 | 总集数（正片，不含 SP） |
| Episodes Watched | 数字 | 已看集数 |
| Rating | 文本 | 你在 Bangumi 打的分 |
| Start Date | 日期 | 开始看的日期 |
| Finish Date | 日期 | 看完（或搁置、抛弃）的日期 |
| Aired | 日期 | 放送日期 |
| Bangumi | 网址 | 条目链接，用于查重 |
| Comment | 文本 | 你的吐槽 |
| Cover | 文件和媒体 | 封面图 |

### 2. Notion Integration

1. 打开 [notion.so/my-integrations](https://www.notion.so/my-integrations)，新建一个 Internal Integration，复制 Token（`ntn_` 开头）。
2. 打开上面的数据库，点右上角 `···` → **Connections**，把这个 Integration 加进去。
3. 复制数据库 ID：在浏览器打开数据库，网址里 `?v=` 前面那串 32 位字符就是。

### 3. Bangumi Token

1. 打开 [next.bgm.tv/demo/access-token](https://next.bgm.tv/demo/access-token) 生成一个 Access Token。
2. 记下你的 Bangumi 用户名或 UID。

### 4. 首次运行

打开任意 bgm.tv 条目页，点右下角的 **「同步到 Notion」**，在弹出的设置面板里填入 Notion Token、数据库 ID、Bangumi Token、Bangumi 用户名，点「保存并同步」。可以切到其他标签页复制，面板不会消失；两个 Token 旁边有「去获取」链接。

之后要修改或清除这些设置，点浏览器上的脚本管理器图标，在菜单里选 **「设置 Token / 数据库」** 或 **「清除已保存的 Token」**。

## 什么时候会同步

| 时机 | 行为 |
| --- | --- |
| 打开条目页 | 自动检查一次 |
| 在页面上点击后 2 秒 | 自动检查一次 |
| 切回这个标签页 | 自动检查一次。在 App 或其他设备上改过的会在这时补上 |
| 点「同步到 Notion」 | 强制同步 |

自动检查只在收藏状态、评分、进度或吐槽发生变化时才写入 Notion。

> **注意：** 脚本第一次看到某个条目时只记录当前状态，不会同步。已经收藏过的旧条目，请手动点一次按钮。

## 同步规则

| Bangumi 上的操作 | Notion 里还没有 → 新建 | Notion 里已有 → 推进 |
| --- | --- | --- |
| 想看 | Status = Plan to Watch | 更新 Status |
| 在看 | Status = Watching，填 Start Date | 更新 Status；Start Date 为空时才补 |
| 看过 | Status = Completed，进度填满，填 Start / Finish Date | 更新 Status 和进度；日期为空时才补 |
| 搁置 / 抛弃 | 同「看过」，但进度按实际 | 同左 |
| 勾分集 | 按当前状态新建 | 更新 Episodes Watched |
| （Bangumi 上总集数有变，如连载中途补全） | — | 更新 Episodes |
| 打分、写吐槽 | 写入 Rating / Comment | 不改动 |
| 取消收藏 | — | 默认只提示；可配置为把页面移入废纸篓 |

更新已有条目后，提示条会逐行列出改了什么，例如「状态：Watching → Completed」「进度：11 → 12/12」「补完成日期：2026-11-04」。

**查重方式**：先按 Bangumi 链接精确匹配，找不到再按标题匹配（原名、中文名）。按标题匹配到的旧条目会顺便补上 Bangumi 链接。

**日期**：

- **Start Date**：取你最早勾「看过」的那一集的日期。推不出来时，剧场版这类单集条目用当天，多集条目默认留空。
- **Finish Date**：取同步当天的日期。如果你在 App 上标了「看过」，几天后才在网页上打开这个条目，Finish Date 会是打开的那天。
- **时区**：所有日期按 `TIMEZONE`（默认 `Asia/Tokyo`）换算。bgm.tv 按 UTC+8 显示，所以深夜勾的集可能在 Notion 里晚一天。

## 配置

脚本开头的 `CFG` 里可以调整：

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `ON_EXISTING` | `'advance'` | 已有条目怎么处理：`'advance'` 更新状态、集数、进度并补空日期，`'skip'` 完全不碰 |
| `DELETE_BEHAVIOR` | `'ignore'` | 取消收藏时：`'ignore'` 只提示，`'archive'` 移入废纸篓 |
| `START_DATE_FALLBACK_TODAY` | `false` | 推不出开始日期时，是否填当天 |
| `TITLE_GUARD` | `true` | 链接匹配不到时，是否再按标题查重 |
| `ONLY_ANIME` | `true` | 只同步动画条目 |
| `SET_PAGE_COVER` | `false` | 是否同时把封面设成 Notion 页面顶部的大图 |
| `TIMEZONE` | `'Asia/Tokyo'` | 日期换算用的时区 |
| `PROP` | — | Notion 属性名映射 |

## 常见问题

**标了却没同步？**
多半是脚本第一次见到这个条目，只记了当前状态。点一次「同步到 Notion」即可。

**提示「Notion 找不到这个数据库」？**
检查数据库 ID，以及 Integration 是否已加进数据库的 Connections。

**提示「写入 Notion 失败（400）」？**
通常是属性名或类型对不上，对照上面的表格检查。

**提示 Token 无效？**
重新生成 Token，然后从脚本菜单「设置 Token / 数据库」更新。

**在 Bangumi 上改了评分，Notion 没变？**
这是设计如此。已有条目的评分和吐槽交给你在 Notion 里自己维护。

## 隐私

- Token、数据库 ID 和用户名只保存在你本机的脚本管理器存储里，不写进脚本代码。
- 脚本只会访问 `api.bgm.tv` 和 `api.notion.com`。
