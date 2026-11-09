// withWdkWorkletAddons.js
//
// Expo Config Plugin — links the WDK worklet's native addons into
// react-native-bare-kit during `expo prebuild`. See link-wdk-addons.js for why.
//
// ORDER: in app.json this plugin must be listed BEFORE "@qvac/sdk/expo-plugin".
// Expo runs dangerous mods in reverse registration order (the last plugin's
// mod runs first), and QVAC's mod clears the addon folders before linking its
// own addons, so ours has to run after it.

const { withDangerousMod, createRunOncePlugin } = require('@expo/config-plugins');
const { linkWdkAddons } = require('./link-wdk-addons');

function withWdkWorkletAddons(config) {
  for (const platform of ['android', 'ios']) {
    config = withDangerousMod(config, [
      platform,
      async (mod) => {
        await linkWdkAddons({ projectRoot: mod.modRequest.projectRoot, platform });
        return mod;
      },
    ]);
  }
  return config;
}

module.exports = createRunOncePlugin(withWdkWorkletAddons, 'withWdkWorkletAddons', '1.0.0');
