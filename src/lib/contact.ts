/** Email obfuscated at rest — decoded only on user intent (hover/focus/click). */
const EMAIL_B64 = 'c2ViYXN0aWFuby5nZWxtZXR0aUBnbWFpbC5jb20=';

export function decodeEmail(): string {
  return atob(EMAIL_B64);
}

export function mailtoHref(): string {
  return `mailto:${decodeEmail()}`;
}
