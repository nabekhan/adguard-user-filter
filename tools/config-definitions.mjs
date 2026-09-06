export const filterPlatformFlags = {
    android: 'adguard_app_android',
    chromium: 'adguard_ext_chromium_mv3',
    firefox: 'adguard_ext_firefox',
    ios: 'adguard_app_ios',
    linux: 'adguard_app_cli',
    mac: 'adguard_app_mac',
    safari: 'adguard_ext_safari',
    windows: 'adguard_app_windows',
};
export const platformNames = Object.keys(filterPlatformFlags);

export const configDefinitions = [
    {
        sourcePath: 'config/filter.json',
        outputPath: 'filters/config.json',
        collectionName: 'lists',
        localDirectory: 'sources/filters',
        localFileSuffix: '.txt',
        allowedPlatforms: platformNames,
        platformFlags: filterPlatformFlags,
        requiredStringFields: ['title', 'description', 'homepage', 'expires'],
        optionalStringFields: [],
    },
    {
        sourcePath: 'config/userscripts.json',
        outputPath: 'userscripts/config.json',
        collectionName: 'scripts',
        localDirectory: 'sources/userscripts',
        localFileSuffix: '.user.js',
        allowedPlatforms: platformNames,
        requiredStringFields: ['title', 'description', 'homepage'],
        optionalStringFields: ['requires'],
    },
];

export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const websitePattern = slugPattern;
