export const adfilterPlatformFlags = {
    android: 'adguard_app_android',
    chromium: 'adguard_ext_chromium_mv3',
    firefox: 'adguard_ext_firefox',
    ios: 'adguard_app_ios',
    linux: 'adguard_app_cli',
    mac: 'adguard_app_mac',
    safari: 'adguard_ext_safari',
    windows: 'adguard_app_windows',
};
export const platformNames = Object.keys(adfilterPlatformFlags);
export const dnsPlatformNames = ['mobile', 'desktop-server'];

export const configDefinitions = [
    {
        sourcePath: 'sources/adfilters.json',
        outputPath: 'adfilters.json',
        collectionName: 'lists',
        localDirectory: 'sources/adfilters',
        localFileSuffix: '.txt',
        allowedPlatforms: platformNames,
        platformFlags: adfilterPlatformFlags,
        requiredStringFields: ['title', 'description', 'homepage', 'expires'],
        optionalStringFields: [],
    },
    {
        sourcePath: 'sources/dnsfilters.json',
        outputPath: 'dnsfilters.json',
        collectionName: 'lists',
        localDirectory: 'sources/dnsfilters',
        localFileSuffix: '.txt',
        allowedPlatforms: dnsPlatformNames,
        requiredStringFields: ['title', 'description', 'homepage', 'expires'],
        optionalStringFields: [],
    },
    {
        sourcePath: 'sources/userscripts.json',
        outputPath: 'userscripts.json',
        collectionName: 'scripts',
        localDirectory: 'sources/userscripts',
        localFileSuffix: '.user.js',
        allowedPlatforms: platformNames,
        requiredStringFields: ['title', 'description', 'homepage'],
        optionalStringFields: [],
    },
];

export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const targetPattern = slugPattern;
