// Trust anchor for the signed preset-dictionary manifest. This public
// key is intentionally shipped with the app; the private key is a release
// secret and is never written to the repository.
export const DICTIONARY_PUBLIC_KEY = "6Upt+0nzwEWOl3LjokgwrNnEYKz9t+MrHCBsR+dC0As=";
export const DICTIONARY_BASE_URL = "./dictionary";
export const DICTIONARY_MANIFEST_PATH = "/dictionary/manifest.json";
export const DICTIONARY_SIGNATURE_PATH = "/dictionary/manifest.sig";
export const DICTIONARY_CORE_LIMIT_BYTES = 150 * 1024;
export const DICTIONARY_TOTAL_LIMIT_BYTES = 8 * 1024 * 1024;
