# Butler

Android app + home-screen widget for talking to the local LLM running on the PC
(OpenClaw gateway + Ollama). The phone connects over Tailscale, so it works from
anywhere without exposing any ports.

## How it works

```
Phone (Butler app / widget)
   │  HTTPS over Tailscale (private tailnet)
   ▼
OpenClaw gateway  ·  /v1/chat/completions  (OpenAI-compatible, token auth)
   │
   ▼
Ollama (gpt-oss:20b) on the PC
```

- The gateway keeps conversation context server-side, keyed by the `user` field
  (`butler-phone`), so the app only ever sends the newest message.
- The chat screen streams replies (SSE) via `expo/fetch`.
- The widget's **⟳ Status** button fires a one-shot, non-streaming request from a
  headless task and renders the answer in place; tapping anywhere else opens the app.

## First-run setup (in the app's settings sheet)

- **Gateway URL**: the PC's Tailscale Serve HTTPS URL, e.g. `https://smithpc.<tailnet>.ts.net`
- **Token**: `gateway.auth.token` from `~/.openclaw/openclaw.json` on the PC

Use **Test** to verify connectivity before saving.

## Building the APK

Requires JDK 17 and the Android SDK (`%LOCALAPPDATA%\Android\Sdk`).

```powershell
npx expo prebuild --platform android   # regenerate ./android after config changes
cd android; .\gradlew assembleRelease
# APK lands at android\app\build\outputs\apk\release\app-release.apk
```

Install by copying the APK to the phone (or `adb install`).
