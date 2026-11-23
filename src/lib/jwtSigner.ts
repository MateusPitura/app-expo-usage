import { KEYUTIL, KJUR, hextob64u } from 'jsrsasign';
import type { Rs256Signer } from './googleAuth';

/**
 * RS256 (RSASSA-PKCS1-v1_5 + SHA-256) using pure-JS jsrsasign, so it works in
 * Hermes without any native crypto module. Handles PKCS#8 ("BEGIN PRIVATE KEY")
 * keys, which is what Google service-account files contain.
 *
 * Wrapped in a setTimeout(0) so the heavy RSA key-parse does not block the
 * Hermes JS thread and freeze the UI.
 */
export const signRs256: Rs256Signer = (signingInput, privateKeyPem) =>
  new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        const key = KEYUTIL.getKey(privateKeyPem);
        const sig = new KJUR.crypto.Signature({ alg: 'SHA256withRSA' });
        sig.init(key);
        sig.updateString(signingInput);
        resolve(hextob64u(sig.sign()));
      } catch (e) {
        reject(e);
      }
    }, 0);
  });
