// `hashTextSync` is the only hash the tool-name generator needs: it runs at
// enumeration time on the main thread, where `await`ing WebCrypto for a
// non-cryptographic, disambiguation-only suffix would be pure overhead. An
// async SHA-256 variant (`hashText`) lived here unused for the same purpose
// and has been removed as dead code.
export function hashTextSync(value:string):string{let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16).padStart(8,'0').slice(0,6)}
