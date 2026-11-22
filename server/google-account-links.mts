import { createHash } from 'node:crypto';
export const googleLinkKey = (owner: string) => 'character-google:' + owner;
export const googleOwnerKey = (subject: string) =>
  'character-google-owner:' + createHash('sha256').update(subject).digest('hex');
