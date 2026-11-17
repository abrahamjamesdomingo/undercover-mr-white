# Project: Undercover & Mr. White (Pass-and-Play Web App)

## 1. Tech Stack & Constraints
- Single-page web app (HTML/CSS/JS or React + Vite). Zero backend required; persist player names, scores, and `usedWordIds` in `localStorage` so words never repeat across rounds until a category is exhausted.
- Mobile-first responsive UI (designed for passing one phone around a table of 3–10 players).

## 2. Game Settings & Role Distribution
- **Player Count:** 3 to 10 players (editable names, persistent across rounds).
- **Toggles:**
  - `Include Mr. White` (Boolean, available when players >= 4).
  - `Undercover Count` (Default: 1 for 3–6 players; 1 or 2 for 7–10 players).
  - `Selected Categories` (Multi-select checkboxes + "Select All").
- **Rule:** Total special roles (`Undercover + Mr. White`) must always be strictly less than half of total players.

## 3. Finite State Machine (Screens)
1. **LOBBY:** Add/remove players (3–10), toggle Mr. White, select categories, click "Start Round".
2. **PASS_DEVICE:** Displays `"Pass the phone to [Player Name]"`. Has a `"I am [Player Name]"` button.
3. **REVEAL_SECRET:** Requires **Press-and-Hold** (mouse/touch down) to reveal the card.
   - Civilian / Undercover sees: `[Their Word]` (No role label shown!).
   - Mr. White sees: `"You are MR. WHITE — Blend in and figure out the secret word!"`
   - Releasing hides the card; clicking `"Next Player"` advances to `PASS_DEVICE` (or `DISCUSSION` if last player).
4. **DISCUSSION:** Displays randomized speaking order (Note: **Mr. White must never be chosen as the 1st speaker** so they have at least one clue to go off). Optional countdown timer (e.g., 2–3 mins).
5. **VOTING:** Players select who to eliminate.
   - Reveal eliminated player's true role:
     - If **Mr. White** is eliminated → Trigger `MR_WHITE_GUESS` modal (input box to guess Main Word; exact case-insensitive match = Mr. White wins!).
     - If **Undercover** is eliminated → Check win conditions.
     - If **Civilian** is eliminated → Continue to next clue/vote round.
6. **ROUND_OVER:** Reveal all roles, both words (`Main Word` vs `Impostor Word`), award points, and offer `"Play Next Round"` (keeping players & scores).

## 4. Win Conditions & Scoring
- **Civilians Win:** Both Undercover and Mr. White are eliminated (and Mr. White fails their guess). (+2 pts to surviving Civilians).
- **Undercover / Mr. White Win:** Special roles equal the number of remaining Civilians (e.g., 1v1). (+4 pts to surviving Impostor/Mr. White).
- **Mr. White Guess Win:** Mr. White guesses the exact Main Word upon elimination. (+5 pts to Mr. White).