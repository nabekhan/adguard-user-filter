export default {
    source: 'https://raw.githubusercontent.com/mchangrh/sb.js/main/docs/sb.user.js',
    replacements: [
        {
            from: '// @match        https://www.youtube.com/watch*',
            to: '// @match        https://*.youtube.com/*',
        },
    ],
};
