// link-wdk-addons.js
//
// Links the native addons of the WDK worklet bundle into react-native-bare-kit.
//
// Why this exists: QVAC (@qvac/sdk) needs react-native-bare-kit >= 0.16, which
// embeds a Bare runtime new enough for its llama.cpp addon. react-native-bare-kit
// 0.16 dropped the automatic linking step that 0.14.x ran on every build (a
// `bare-link` pass over the whole app's node_modules). From 0.16 the app has to
// link the addons each worklet loads itself.
//
// QVAC's Expo plugin does that for the QVAC worker, but it CLEARS the addon
// folders first and links only QVAC's own addons. Without this script the WDK
// worklet would start and then crash on its first `require.addon()` (bare-fs,
// sodium-native, spark-frost, ...).
//
// How: the WDK bundle (.wdk-bundle/wdk-worklet.bundle.js, generated on
// postinstall by wdk-worklet-bundler) is packed with `--linked`, so its header
// lists every addon binding it loads and where it was resolved from. We hand
// those binding files to bare-link as entry points, writing into the same
// react-native-bare-kit folders as QVAC, WITHOUT clearing them. Addon files are
// named <name>.<version>, so a library both worklets share is the same file.
//
// Run order matters: this must run after QVAC's plugin. withWdkWorkletAddons.js
// wires it into `expo prebuild`; it can also be run by hand:
//
//   node modules/qvac/link-wdk-addons.js android|ios

const fs = require('fs');
const path = require('path');

const ANDROID_HOSTS = ['android-arm64']; // QVAC restricts Android builds to arm64-v8a
const IOS_HOSTS = ['ios-arm64', 'ios-arm64-simulator', 'ios-x64-simulator'];

const BUNDLE_PATH = path.join('.wdk-bundle', 'wdk-worklet.bundle.js');

/** Reads the bare-bundle header out of the generated JS module. */
function readBundleHeader(projectRoot) {
  const bundlePath = path.join(projectRoot, BUNDLE_PATH);
  if (!fs.existsSync(bundlePath)) {
    throw new Error(
      `WDK worklet bundle not found at ${bundlePath}. Run \`npx wdk-worklet-bundler generate\` (npm postinstall does this) before prebuild.`,
    );
  }
  // The file is `module.exports = "<bundle>"`; the bundle starts with
  // "<header length>\n<header JSON>".
  delete require.cache[bundlePath];
  const bundle = require(bundlePath);
  const newline = bundle.indexOf('\n');
  const length = Number(bundle.slice(0, newline));
  return JSON.parse(bundle.slice(newline + 1, newline + length));
}

/** Absolute paths of every addon binding the WDK bundle loads. */
function wdkAddonEntries(projectRoot) {
  const header = readBundleHeader(projectRoot);
  const entries = [];
  for (const [file, resolutions] of Object.entries(header.resolutions)) {
    // An addon import (`require.addon('.')`, or `'../..'` from a nested
    // binding file) resolves to a per-platform map of `linked:` URLs.
    const loadsAddon = Object.values(resolutions).some(
      (target) => target && typeof target === 'object' && JSON.stringify(target).includes('linked:'),
    );
    if (loadsAddon) entries.push(path.join(projectRoot, file));
  }
  return entries;
}

async function linkWdkAddons({ projectRoot, platform, log = console.log }) {
  if (platform === 'ios' && process.platform !== 'darwin') {
    log('⚠️  WDK: linking iOS addons needs macOS (bare-link codesigns frameworks); skipped.');
    return [];
  }

  const bareKitDir = path.dirname(require.resolve('react-native-bare-kit/package.json', { paths: [projectRoot] }));
  const out =
    platform === 'android'
      ? path.join(bareKitDir, 'android', 'src', 'main', 'addons')
      : path.join(bareKitDir, 'ios', 'addons');
  const hosts = platform === 'android' ? ANDROID_HOSTS : IOS_HOSTS;

  const entries = wdkAddonEntries(projectRoot);
  // bare-link is ESM-agnostic CJS; import() keeps this working either way.
  const { default: link } = await import('bare-link');

  // deferUnresolved: an addon with no prebuild for a host (bare-posix on
  // Android) is one the bundle never loads there, so skip it, as
  // wdk-worklet-bundler's own linker does.
  const written = [];
  for await (const resource of link(entries, { hosts, out, deferUnresolved: true })) written.push(resource);

  log(`🔗 WDK: Linked ${entries.length} worklet addons (${written.length} files) for ${hosts.join(', ')}`);
  return written;
}

module.exports = { linkWdkAddons, wdkAddonEntries };

if (require.main === module) {
  const platform = process.argv[2];
  if (platform !== 'android' && platform !== 'ios') {
    console.error('Usage: node modules/qvac/link-wdk-addons.js android|ios');
    process.exit(1);
  }
  linkWdkAddons({ projectRoot: process.cwd(), platform }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
