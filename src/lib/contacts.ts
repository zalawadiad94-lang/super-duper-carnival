/**
 * Pick a person from the phone's address book.
 *
 * - Android app: the native shell (android-app MainActivity) exposes
 *   `SitekhataAndroid.pickContact()`, opens the system contact picker and
 *   answers through `window.__sitekhataContactPicked`. The picker grants access
 *   to the one chosen contact, so no contacts permission is needed.
 * - Browsers: the Contact Picker API (Chrome on Android), where available.
 */
export type PickedContact = { name: string; phone: string };

type NativeContacts = { pickContact?: () => void };
type ContactsManager = {
  select: (props: string[], options?: { multiple?: boolean }) => Promise<{ name?: string[]; tel?: string[] }[]>;
};

declare global {
  interface Window {
    __sitekhataContactPicked?: (result: PickedContact | null) => void;
  }
}

function nativeBridge(): NativeContacts | undefined {
  if (typeof window === "undefined") return undefined;
  const bridge = (window as unknown as { SitekhataAndroid?: NativeContacts }).SitekhataAndroid;
  return typeof bridge?.pickContact === "function" ? bridge : undefined;
}

function browserContacts(): ContactsManager | undefined {
  if (typeof navigator === "undefined") return undefined;
  const contacts = (navigator as unknown as { contacts?: ContactsManager }).contacts;
  return typeof contacts?.select === "function" ? contacts : undefined;
}

export function canPickContact(): boolean {
  return Boolean(nativeBridge() || browserContacts());
}

/** Resolves with the chosen contact, or null if the picker was cancelled. */
export async function pickContact(): Promise<PickedContact | null> {
  const bridge = nativeBridge();
  if (bridge?.pickContact) {
    return new Promise((resolve) => {
      window.__sitekhataContactPicked = (result) => {
        window.__sitekhataContactPicked = undefined;
        resolve(result && (result.name || result.phone) ? result : null);
      };
      bridge.pickContact!();
    });
  }
  const contacts = browserContacts();
  if (contacts) {
    const [first] = await contacts.select(["name", "tel"], { multiple: false });
    if (!first) return null;
    return { name: first.name?.[0]?.trim() ?? "", phone: first.tel?.[0]?.trim() ?? "" };
  }
  return null;
}
