# Fix: Speech recognition not registering anything

## Root cause

Chrome (and every other browser that ships the Web Speech API) only allows **one active `SpeechRecognition` instance per page/microphone at a time**. The current implementation in `src/routes/index.tsx` starts two recognizers in parallel (`recognizerARef` + `recognizerBRef`) and then waits for **both** to return a final result before translating.

Two things go wrong:

1. Starting the second recognizer immediately aborts/errors the first (or vice versa). Often neither produces results.
2. Even when one does fire, the new "wait for both pending results" logic (lines 285–298) blocks translation until the *other* recognizer also returns a final result. The other recognizer is tuned to a language the user isn't speaking, so it never returns one. The 8-second fallback is the only thing that ever fires — and only if a result was captured at all.

Net effect from the user's perspective: speaking does nothing.

The earlier "race" approach was already fragile; layering "wait for both + pick higher confidence" on top made it fail completely. We need to abandon the dual-recognizer approach.

## The fix: single recognizer, auto-switch language based on detection

Use **one** `SpeechRecognition` instance. Let the **server** detect the language (it already does — `/api/translate` returns `sourceLanguage`). Use that detection result to set the recognizer's `lang` for the *next* utterance.

This is the standard pattern for bilingual conversation apps and avoids the browser's single-recognizer constraint entirely. Trade-off: the very first utterance uses whichever language we guess (we'll alternate based on `turn`, same as the original pre-race version). After that, every subsequent utterance benefits from server-side detection.

## Changes (all in `src/routes/index.tsx`)

1. **Remove dual-recognizer state**
   - Delete `recognizerARef`, `recognizerBRef`, `isRaceActiveRef`, `pendingResultARef`, `pendingResultBRef`, `restartTimerRef`.
   - Add back a single `recognitionRef`.
   - Keep `translationInProgressRef`.

2. **Add `currentLangCodeRef`** — tracks which language the next recognizer instance should listen in. Initialized to `LANG_CODES[yourLang]` on session start; updated in `translate()` after the server returns `sourceLanguage` (we re-arm with the *detected* source language, since the same speaker is most likely to continue).

3. **Replace `createRecognizer` / `startRace` / `abortBoth` with `startListening` / `stopListening`**
   - `startListening()`: builds one recognizer with `continuous=false`, `interimResults=true`, `lang = currentLangCodeRef.current`. On `onresult` final → set `translationInProgressRef = true`, call `translate(transcript)`. On `onend` → if session still active and not translating, call `startListening()` again (debounced ~150ms) to keep the mic open. On `onerror` → keep existing not-allowed/denied handling; ignore `aborted`/`no-speech`; for other errors, restart after 200ms.
   - `stopListening()`: aborts the single recognizer.

4. **Update `translate()`**
   - In the success branch, after computing `sourceLang`, set `currentLangCodeRef.current = LANG_CODES[sourceLang]` so the next utterance listens in the language the user just spoke.
   - In `finally`, set `translationInProgressRef = false` and call `startListening()` (instead of `startRace()`).

5. **Wire-up changes**
   - `startSession()` → `currentLangCodeRef.current = LANG_CODES[yourLang]` (or `theirLang` based on `turn`), then `startListening()`.
   - `armSilenceTimer()` callback → `stopListening()`.
   - `finalizeEnd()` → `stopListening()`, null out `recognitionRef`.

6. **Keep unchanged**: UI, status indicator, ghost text (interim), transcript bubbles, swap, copy, two-tap end confirm, silence timeout (20s), banners, `/api/translate` route, server-side language detection prompt.

## Why this works

- One recognizer = no browser conflict, mic actually captures audio.
- Server already detects language from the transcript text — we leverage that instead of trying to detect it client-side via parallel recognizers.
- After the first utterance, `currentLangCodeRef` tracks reality. If the speaker switches languages mid-conversation, the *first* utterance in the new language may be slightly less accurate (recognizer is still tuned to the previous language) but the server still detects it correctly and translates it; the *next* utterance is then tuned correctly. This matches how Google Translate's conversation mode behaves.

## Out of scope

- No changes to `src/routes/api/translate.ts`.
- No UI, styling, or layout changes.
- The 8-second fallback timer, "race", and "wait for both" logic are removed entirely (they were the bug).
