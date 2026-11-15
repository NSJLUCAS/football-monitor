// Project names and notes are public, and the owner keeps addresses out of them. These patterns find
// what reads as one, and leave alone what only looks close: times (04:00), file names (acme.sh, Node.js).
const LINK = /\b[a-z][a-z0-9+.-]*:\/\//i
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/
// A host with a letter in it, then a port: db:5432, localhost:8080; a clock time has no letter.
const HOST_PORT = /\b[a-z0-9-]*[a-z][a-z0-9.-]*:\d{2,5}\b/i
const BARE_PORT = /(?:^|[\s(（，,、]):\d{2,5}\b/
const TLDS =
  'com|net|org|cn|io|dev|me|top|xyz|app|cc|co|info|site|online|cloud|tech|vip|club|link|pro|biz|us|uk|jp|hk|tw|de|sg|ru|fr|ai|tv|so|ltd|work|life|live|fun|shop|store|space|website|host|icu|ink|wiki|blog|run|page|im|in'
const DOMAIN = new RegExp(`\\b[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:${TLDS})\\b`, 'i')

export const looksLikeAddress = (text: string) =>
  [LINK, IPV4, HOST_PORT, BARE_PORT, DOMAIN].some((pattern) => pattern.test(text))
