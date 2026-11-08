# Bangumi → Notion Sync

English | [简体中文](README.md) | [日本語](README.ja.md)

A userscript that syncs your anime collection status, progress and dates from [Bangumi](https://bgm.tv) to a Notion database whenever you update an entry on its subject page.

- **One-way**: writes from Bangumi to Notion only. Bangumi is never modified.
- **Respects your edits**: for entries already in Notion, it only updates status, episode count and progress. Ratings, comments and dates you filled in yourself are left alone.
- **No secrets in code**: tokens are entered in a settings panel on first use and stored locally in your userscript manager.

## Installation

1. Install a userscript manager: [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Install [bangumi-notion-sync.user.js](bangumi-notion-sync.user.js).
3. Set up the Notion database and the two tokens as described below.

## Setup

### 1. Notion database

Create a database with the properties below. Names and types must match. If your column names differ, change them in `CFG.PROP` in the script.

| Property | Type | Content |
| --- | --- | --- |
| Title | Title | Original title |
| Alternative Title | Text | Chinese title |
| Status | Select | Plan to Watch / Watching / Completed / On-Hold / Dropped |
| Episodes | Number | Total episodes (main episodes, no SP) |
| Episodes Watched | Number | Episodes watched |
| Rating | Text | Your score on Bangumi |
| Start Date | Date | When you started watching |
| Finish Date | Date | When you finished (or put on hold / dropped) |
| Aired | Date | Air date |
| Bangumi | URL | Subject link, used for matching |
| Comment | Text | Your comment |
| Cover | Files & media | Cover image |

### 2. Notion integration

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations), create an internal integration and copy its token (starts with `ntn_`).
2. Open the database, click `···` in the top right → **Connections**, and add the integration.
3. Copy the database ID: open the database in a browser; the 32-character string before `?v=` in the URL is the ID.

### 3. Bangumi token

1. Generate an access token at [next.bgm.tv/demo/access-token](https://next.bgm.tv/demo/access-token).
2. Note your Bangumi username or UID.

### 4. First run

Open any subject page on bgm.tv and click **「同步到 Notion」** (Sync to Notion) in the bottom right corner. In the settings panel that opens, fill in the Notion token, database ID, Bangumi token and Bangumi username, then click 「保存并同步」 (Save and sync). You can switch to other tabs to copy values; the panel stays open. Both token fields have a 「去获取」 (Get one) link.

To change or clear these settings later, click your userscript manager's icon and choose **「设置 Token / 数据库」** (Set token / database) or **「清除已保存的 Token」** (Clear saved tokens) from the menu.

## When it syncs

| Trigger | Behaviour |
| --- | --- |
| Opening a subject page | Checks once |
| 2 seconds after any click on the page | Checks once |
| Switching back to the tab | Checks once. Picks up changes made in the app or on another device |
| Clicking the sync button | Forces a sync |

Automatic checks only write to Notion when the collection status, rating, progress or comment has changed.

> **Note:** The first time the script sees a subject, it only records the current state and does not sync. For entries you collected before installing the script, click the button once.

## Sync rules

Bangumi labels are shown in Chinese, as they appear on the site.

| Action on Bangumi | Not in Notion → create | Already in Notion → advance |
| --- | --- | --- |
| 想看 (Wish) | Status = Plan to Watch | Update Status |
| 在看 (Watching) | Status = Watching, fill Start Date | Update Status; fill Start Date only if empty |
| 看过 (Watched) | Status = Completed, progress set to total, fill Start / Finish Date | Update Status and progress; fill dates only if empty |
| 搁置 / 抛弃 (On hold / Dropped) | Same as Watched, but progress is actual | Same as left |
| Ticking episodes | Created with current status | Update Episodes Watched |
| (Total episodes change on Bangumi, e.g. during airing) | — | Update Episodes |
| Rating or commenting | Written to Rating / Comment | Not changed |
| Removing from collection | — | Shows a notice by default; can be set to move the page to trash |

After updating an existing entry, the notice lists each change on its own line, e.g. 「状态:Watching → Completed」 (status), 「进度:11 → 12/12」 (progress), 「补完成日期:2026-11-04」 (finish date filled).

**Total episodes**: use Bangumi's announced episode count first. When it is unknown (shown as `*`), provisionally use the number of main-story episode entries currently listed, excluding specials, OP, ED and other types. This applies to both new and existing entries. If neither an announced count nor main-story episodes are available, or the episode query fails, do not write the total episode field: leave it blank for new entries and preserve its current value for existing entries. Status and the actual number of episodes watched still sync normally. The script will try to fetch the total episode count again on the next automatic check.

**Matching**: by Bangumi URL first, then by title (original or Chinese) if no URL match. Old entries matched by title get their Bangumi URL filled in.

**Dates**:

- **Start Date**: the date you first marked an episode as watched. If that's unavailable, single-episode entries such as movies use today; multi-episode entries are left blank by default.
- **Finish Date**: the date of the sync. If you mark something as watched in the app and only open its page on the web days later, Finish Date will be the day you opened it.
- **Time zone**: all dates use `TIMEZONE` (default `Asia/Tokyo`). bgm.tv displays times in UTC+8, so an episode ticked late at night may land on the next day in Notion.

## Configuration

Edit `CFG` at the top of the script:

| Option | Default | Description |
| --- | --- | --- |
| `ON_EXISTING` | `'advance'` | Existing entries: `'advance'` updates status, episodes and progress and fills empty dates; `'skip'` leaves them untouched |
| `DELETE_BEHAVIOR` | `'ignore'` | On removal from collection: `'ignore'` shows a notice, `'archive'` moves the page to trash |
| `START_DATE_FALLBACK_TODAY` | `false` | Use today when the start date can't be determined |
| `TITLE_GUARD` | `true` | Also match by title when no URL match is found |
| `ONLY_ANIME` | `true` | Sync anime entries only |
| `SET_PAGE_COVER` | `false` | Also set the cover as the Notion page's banner image |
| `TIMEZONE` | `'Asia/Tokyo'` | Time zone for dates |
| `PROP` | — | Notion property name mapping |

## FAQ

**I updated an entry but nothing synced.**
The script was probably seeing this subject for the first time and only recorded its state. Click the sync button once.

**"Notion 找不到这个数据库" (database not found).**
Check the database ID, and that the integration has been added under the database's Connections.

**"写入 Notion 失败(400)" (write failed).**
Usually a property name or type mismatch. Check against the table above.

**Token invalid.**
Generate a new token and update it from the script menu (「设置 Token / 数据库」).

**I changed my rating on Bangumi but Notion didn't change.**
By design. For existing entries, rating and comment are yours to maintain in Notion.

## Privacy

- Tokens, database ID and username are stored only in your local userscript manager storage, never in the script code.
- The script only connects to `api.bgm.tv` and `api.notion.com`.
