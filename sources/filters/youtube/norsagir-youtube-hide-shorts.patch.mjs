export default {
    source: 'https://raw.githubusercontent.com/Norsagir/adguard-custom-filters/main/youtube-hide-shorts.txt',
    replacements: [
        {
            from: /^!(?=(?:\[\$path=[^\]]+\])?(?:m\.)?youtube\.com##)/gm,
            to: '',
        },
    ],
};
