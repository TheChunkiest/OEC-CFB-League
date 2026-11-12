# OEC CFB League Hub

The website for the Original Entertaining Crackers College Football 27 dynasty. It's hosted on GitHub Pages, and logins, wagers and votes are stored in Firebase (free tier).

Every file sits at the top level (no folders), so it's easy to upload from a phone.

## Files
| File | What it is |
|---|---|
| `index.html`, `app.js` | The public hub |
| `admin.html`, `admin.js` | Commissioner tools (commissioner accounts only) |
| `core.js` | Shared league math: odds, simulations, power rankings, storylines |
| `style.css`, `logo.png`, `favicon.png` | Red/black/gold theme and league logo |
| `firebase-config.js` | **You paste your Firebase keys here** |
| `firestore.rules` | Security rules you paste into Firebase |
| `teamcolors.js` | Primary colors for FBS teams (used automatically) |
| `league-data.json` | Your league history + current season, loaded once from the Advance tab |
| `demo.json` | Preview copy of your data, used only until Firebase is connected |

Until `firebase-config.js` is filled in, the site runs in **demo mode** with sample data and nothing is saved. That's useful for clicking around first.

## One-time setup (about 10 minutes)
1. **Upload these files to your repo.** Add file → Upload files → select all → Commit. The old `teams.json`, `games.json`, `league.json`, `rankings.json`, `news.json` and `recruiting.json` are no longer used and can be deleted. Keep `history.json` and `awards.json` until step 8.
2. **Create a Firebase project.** Go to https://console.firebase.google.com → Add project → name it (e.g. `oec-hub`) → Google Analytics can be off.
3. **Turn on logins.** Build → Authentication → Get started → Email/Password → Enable → Save.
   Then Authentication → Settings → Authorized domains → Add domain → `YOURNAME.github.io`.
4. **Create the database.** Build → Firestore Database → Create database → Production mode → choose a US location.
5. **Paste the rules.** Firestore → Rules tab → delete everything → paste all of `firestore.rules` → Publish.
6. **Connect the site.** Project settings (gear icon) → General → Your apps → Web (`</>`) → register the app → copy the values in `firebaseConfig` into `firebase-config.js` → upload that file to GitHub.
7. **Make yourself commissioner.** On the hub, tap Coach Login → Create account. Then in Firebase → Firestore → `users` → your document → change `role` from `coach` to `commish`. This is the only time you edit Firebase directly.
8. **Set up the league** at `yoursite/admin.html`:
   - The **Advance** tab shows a **Load league data** button the first time. It imports `league-data.json`: all 12 teams, coaches, Catholics/Convicts divisions, every result from Seasons 1–3, both champions, awards and "Holy Shit" moments. It then posts Week 10 lines.
   - **Games** tab → Week 9 → enter the two missing results (Nut @ Angel, Kahuna @ Dayce).
   - **Preseason** tab → set each team's real OVR/OFF/DEF (everyone starts at 80) → Save teams. Don't press Publish mid-season.
   - **Coaches & Accounts** → after each coach signs up, link them to their team.

## Commissioner routine
All forms are on the **Advance** tab, and it always shows the right one for where the season is.

| When | Form | What it does |
|---|---|---|
| Offseason | **Preseason** | Coaches, team ratings, schedule. Publishing posts preseason odds, opens Week 0 betting and resets the odds chart. Each coach gets 1,000 credits. |
| Each week | **Week N Results** | Enter scores. A Yes/No asks for a Commissioner's Desk note. Submitting grades wagers, re-rates every team (so lines for all later weeks move), posts next week's lines, and updates power rankings, odds and storylines. |
| After the final regular-season week | **End of Regular Season** | Sets the league championship game (pre-filled from standings) and the awards ballot (3 finalists per category). Opens championship-week betting and awards voting. |
| Championship week | **Championship Results** | Enter the title game score. Closes awards voting and tallies the winners. |
| After bowls | **End of Season** | Optional bowl results and notes. Finalizing writes the champion, award winners and "Holy Shit" moments to History. |

Tip: use "Save scores only" to lock coach-vs-coach games as they finish. A game with a score can't be bet on. "Lock betting" on the Advance or Betting tab freezes the whole board.

## How the numbers work
- **Ratings:** Each team starts from its OFF/DEF/OVR. After every game, its offense and defense ratings shift by how many points it scored or allowed versus expectation.
- **Lines:** The spread and total come from the two teams' expected scores (+2.5 for home field). Moneylines come from win probability with a small house edge. Spreads and totals pay −110.
- **Season odds:** The rest of the schedule is simulated 1,500 times. Tiebreakers are conference record, head-to-head, then overall record. Division winners (or the top two if there are no divisions) meet in the title game.
- **Power rankings:** Team strength plus recent form (last 3 games versus expectation) plus record. "+/−" is the movement since last week.
- **Storylines:** Generated from last week's results each time the page loads. Nothing is stored.

## Limits worth knowing
- Firebase rules check that a wager is at the posted line, in the current week, on an unplayed game. They can't add up a coach's balance, so the site blocks overdrafts but a determined coach could get around it. Any wager can be voided on the Betting tab.
- Firebase's free tier is far more than a league this size needs.
