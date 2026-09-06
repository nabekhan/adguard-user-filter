export const configDefinitions = [
    {
        sourcePath: 'config/filter.json',
        outputPath: 'filters/config.json',
        collectionName: 'lists',
        localDirectory: 'sources/filters',
        localFileSuffix: '.txt',
        requiredStringFields: ['title', 'description', 'homepage', 'expires'],
        optionalStringFields: [],
    },
    {
        sourcePath: 'config/userscripts.json',
        outputPath: 'userscripts/config.json',
        collectionName: 'scripts',
        localDirectory: 'sources/userscripts',
        localFileSuffix: '.user.js',
        requiredStringFields: ['title', 'description', 'homepage'],
        optionalStringFields: ['requires'],
    },
];

export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const websitePattern = slugPattern;
