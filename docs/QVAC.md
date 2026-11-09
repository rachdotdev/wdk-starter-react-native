# QVAC on-device assistant (proof of concept)

The **Assistant** tab is a chat with a small LLM that runs on the phone through
[QVAC](https://qvac.tether.io/) (`@qvac/sdk`). It gets a read-only summary of
the active account (balances and recent transfers) in its system prompt, so it
can answer questions like "how much USDT do I have on Polygon?" or "what was my
last transaction?", and explain crypto concepts. Nothing is sent to a server,
and the assistant cannot sign or send anything.

| | |
|---|---|
| Model | `LLAMA_3_2_1B_INST_Q4_0` (Llama 3.2 1B Instruct, about 770 MB, downloaded on first use and cached) |
| Code | `src/ai/assistant.ts` (QVAC calls + state), `src/ai/walletContext.ts` (system prompt), `src/app/(app)/(tabs)/assistant.tsx` (screen) |
| Bundle config | `qvac.config.json` bundles only the `llamacpp-completion` plugin |

## Running it

QVAC's llama.cpp backend does **not** run on emulators or simulators. Use a
physical device (QVAC lists iOS 17+ and Android 12+, arm64, at least 2 GB RAM).
QVAC's mobile bundler needs Node `^22.21.0 || >=24.9.0`.

```bash
npm install
npx expo prebuild --clean
npx expo run:android --device   # or: npx expo run:ios --device
```

Re-run `expo prebuild` after every `npm install`: the native addons are linked
into `node_modules/react-native-bare-kit`, which a reinstall wipes.

## Version changes and why

| Package | Before | After | Why |
|---|---|---|---|
| `react-native-bare-kit` | 0.14.5 | 0.16.0 | QVAC needs Bare ≥ 1.30.3. bare-kit 0.14.5 embeds Bare 1.29.4; 0.16.0 embeds Bare 1.33.4. `@tetherto/wdk-react-native-core` beta.17 accepts `>=0.14.5`. |
| `@qvac/sdk` | none | 0.23.0 | The SDK. |
| `@qvac/fabric-android-arm64`, `@qvac/fabric-ios` | none | 0.25.0 | Per-platform llama.cpp prebuilds. QVAC's bundler refuses to build without them; versions must match what `@qvac/sdk` asks for. |
| `expo-file-system`, `expo-device` | none | ~55 | QVAC peer dependencies on Expo. |
| `bare-link` (dev) | none | ^4.2.0 | Used by the WDK addon linker below. |

The WDK worklet bundle was checked against Bare 1.33.4 with QVAC's own verifier
(`verifyBundle`): all 28 WDK native addons pass on `android-arm64` and
`ios-arm64`.

## The native addon linking change

react-native-bare-kit 0.14.x ran `bare-link` over the whole app on every native
build, so every addon in `node_modules` got linked automatically. **0.16 removed
that**: the app now links the addons each worklet uses.

QVAC's Expo plugin links the QVAC worker's addons, but it clears the addon
folders first. Left alone, that would drop all of WDK's addons (bare-fs,
sodium-native, spark-frost, ...) and the wallet worklet would crash on start.

`modules/qvac/withWdkWorkletAddons.js` fixes this. During prebuild, after QVAC's
plugin, it reads the addon list from the WDK bundle header
(`.wdk-bundle/wdk-worklet.bundle.js`, packed with `--linked`) and links those
addons into the same folders without clearing them. You can also run it by hand:
`npm run link:wdk-addons -- android` (or `ios`, macOS only).

**Plugin order matters.** In `app.json`, `./modules/qvac/withWdkWorkletAddons.js`
must stay **before** `@qvac/sdk/expo-plugin`. Expo runs dangerous mods in
reverse order, so listing it first makes it run last.

QVAC's plugin also limits Android to `arm64-v8a`, pins NDK 29 and sets
`minSdkVersion` 29 (which this app already used).

## Known limits

- Verified so far: `npm ci`, `expo prebuild` for Android, `tsc`, and a Hermes JS export. Not yet run on a device or built with Gradle/Xcode.
- A 1B model is small: answers can be wrong, especially arithmetic. The prompt
  tells it to only use the wallet data it was given.
- The model holds about 1 GB of RAM while loaded. "Stop assistant" unloads it
  but keeps the download.
