# Fix: Dual Parallel SpeechRecognition Race

Scope: only the speech-recognition setup inside `src/routes/index.tsx`. No UI, styling, backend, or unrelated logic changes. `/api/translate`, silence timeout, ghost text (interim), transcript rendering, speaker icons, copy, and end-session flow stay as-is.

## Changes in `src/routes/index.tsx`

1. **Refs replace single recognizer**
   - Remove `recognitionRef`.
   - Add `recognizerARef`, `recognizerBRef` (hold `SpeechRecognition` instances).
   - Add `isRaceActiveRef` and `translationInProgressRef` (boolean refs — needed inside recognizer callbacks; React state would be stale).

2. **Recognizer factory** — `createRecognizer(langCode, sideRef)`:
   - `continuous = false`, `interimResults = true`, `maxAlternatives = 1`, `lang = langCode`.
   - `onstart`: set status `listening`, arm silence timer (only once per race — guarded so the second recognizer starting doesn't double-arm).
   - `onresult`: per spec — take last result; if `isFinal && isRaceActiveRef.current && !translationInProgressRef.current` and (`confidence >= 0.55 || transcript.trim().length > 2`), flip flags, `abortBoth()`, call `translate(transcript)`. Otherwise, when not final, update `setInterim(transcript)` (ghost text). Clear silence timer on any result.
   - `onerror`: ignore `aborted` and `no-speech`. For `not-allowed`/`denied`, keep the existing mic-permission error path (set `micError`, deactivate session). For all other errors, call `startRace()` to recover (only if session still active and not translating).

3. **`startRace()`**:
   - Guard: return if `translationInProgressRef.current` or `!activeRef.current`.
   - Build fresh recognizers from current `yourLangRef`/`theirLangRef` (so language picks at session start are honored), assign to refs.
   - Set `isRaceActiveRef.current = true`.
   - `try { recognizerARef.current.start(); } catch {}` — same for B.

4. **`abortBoth()`**:
   - `try { recognizerARef.current?.abort(); } catch {}` — same for B.
   - Set `isRaceActiveRef.current = false`.

5. **Wire into existing flow**:
   - `startSession()` → call `startRace()` instead of `startListening()`.
   - `translate()` success and failure branches: set `translationInProgressRef.current = false`, then `startRace()` (replaces the current `startListening()` calls). Remove the `setTurn`-driven language switch (race no longer needs it; `turn` is still updated for bubble alignment from the API response).
   - `armSilenceTimer()` callback: call `abortBoth()` instead of `recognitionRef.current.stop()`.
   - `finalizeEnd()` (End Session): call `abortBoth()` instead of `recognitionRef.current.stop()`; also null out the recognizer refs.
   - Delete the now-unused `startListening()` function.

6. **No changes** to: language dropdowns, swap, `LANG_CODES` map (already matches the spec), silence timeout duration, interim/ghost text rendering, transcript bubbles, speaker TTS, copy, two-tap end confirm, banners, validation.

## Notes / edge cases
- Both recognizers share the same mic stream; starting two `SpeechRecognition` instances in Chrome works because each opens its own underlying session against the same input device.
- `onstart` will fire twice (once per recognizer); silence-timer arming and `setStatus("listening")` are idempotent, so this is safe.
- `onend` from the loser (after `abort()`) is ignored because `isRaceActiveRef` is already false and `translationInProgressRef` is true — no auto-restart loop.
- `confidence` can be `0`/`undefined` in some browsers; the `length > 2` fallback (per spec) covers that.
