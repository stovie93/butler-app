const { withAppBuildGradle } = require('expo/config-plugins');

// Expo prebuild regenerates android/ from the template, which signs release
// builds with the DEBUG keystore. This plugin rewires the release build type to
// a real key: if release-signing.properties exists at the repo root (gitignored,
// alongside release.keystore) it is used; otherwise the debug fallback stays,
// so building from source works with zero setup.
//
// release-signing.properties:
//   storeFile=release.keystore        (path relative to the repo root)
//   storePassword=...
//   keyAlias=butler
//   keyPassword=...

const RELEASE_CONFIG = `
        release {
            def signingProps = new Properties()
            def signingPropsFile = rootProject.file('../release-signing.properties')
            if (signingPropsFile.exists()) {
                signingPropsFile.withInputStream { signingProps.load(it) }
                storeFile rootProject.file('../' + signingProps.getProperty('storeFile'))
                storePassword signingProps.getProperty('storePassword')
                keyAlias signingProps.getProperty('keyAlias')
                keyPassword signingProps.getProperty('keyPassword')
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (gradle.includes('release-signing.properties')) return cfg; // already applied

    // Point the release BUILD TYPE at the release config when the properties
    // file exists. Must run before the signingConfigs insertion below so the
    // first `release {` in the file is still the build type ([^}] keeps the
    // match inside one block — the debug build type's identical line is safe).
    const buildTypeRewired = gradle.replace(
      /(release\s*\{[^}]*?)signingConfig signingConfigs\.debug/,
      "$1signingConfig rootProject.file('../release-signing.properties').exists() ? signingConfigs.release : signingConfigs.debug",
    );
    // Register the release signing config next to the template's debug one.
    const configAdded = buildTypeRewired.replace('signingConfigs {', `signingConfigs {${RELEASE_CONFIG}`);

    if (buildTypeRewired === gradle || configAdded === buildTypeRewired) {
      throw new Error(
        'withReleaseSigning: app/build.gradle did not match the expected template — update plugins/withReleaseSigning.js',
      );
    }
    cfg.modResults.contents = configAdded;
    return cfg;
  });
};
