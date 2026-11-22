"use client";

// Typing on a kiosk with no physical keyboard. When a visitor picks a field on a details form, this panel opens on
// the left of the screen:
//   • Type on your phone: a QR code opens the same form on their phone (/type/<code>); what they send there comes back
//     to the kiosk, which sends it on. Always shown; it says so when the site can't pass the details through.
//   • An on-screen keyboard: keys are pressed by holding a hand over them (like every kiosk button), a tap or a click.
//     It has email shortcuts, suggestions, and a number pad for phone numbers.

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import styles from "./kiosk.module.css";

export type FieldKind = "name" | "email" | "contact" | "company" | "questions";

const KEY_MS = 650; // hold over a key this long to press it (shorter than other buttons: typing needs many presses)
const DOMAINS = ["gmail.com", "outlook.com", "yahoo.com", "icloud.com", "hotmail.com"];
const NAMES = ["Alex", "Ana", "Andrew", "Chris", "Daniel", "David", "Emily", "Emma", "Grace", "Hannah", "James", "Jessica", "John", "Jordan", "Katherine", "Kevin", "Laura", "Maria", "Michael", "Olivia", "Rachel", "Ryan", "Sabrina", "Sam", "Sarah", "Sophia", "Taylor", "Thomas", "William", "Lee", "Kim", "Nguyen", "Patel", "Garcia", "Smith", "Johnson", "Brown", "Chen", "Wang", "Hu", "Kuang", "Cheng"];
const WORDS = ["about", "available", "battery", "bulk", "can", "compatible", "cost", "demo", "discount", "does", "how", "integration", "interested", "is", "it", "long", "much", "order", "price", "pricing", "quote", "sample", "shipping", "support", "the", "warranty", "what", "when", "with", "work", "would", "you", "your", "company", "inc", "labs", "studio", "university", "technologies", "group"];

const ROWS = ["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm"];

/** "ada lovelace" → ["ada.lovelace", "adalovelace", "ada"] for email suggestions. */
function localParts(name: string) {
  const w = name.toLowerCase().replace(/[^a-z\s'-]/g, "").split(/\s+/).filter(Boolean);
  if (!w.length) return [];
  const out = w.length > 1 ? [`${w[0]}.${w[w.length - 1]}`, `${w[0]}${w[w.length - 1]}`, `${w[0][0]}${w[w.length - 1]}`, w[0]] : [w[0]];
  return [...new Set(out)];
}

function suggestionsFor(kind: FieldKind, value: string, name: string): { label: string; value: string }[] {
  const v = value;
  if (kind === "email" || (kind === "contact" && !/^[+\d(]/.test(v))) {
    const at = v.indexOf("@");
    if (at < 0) {
      // Before the @: suggest from the name they typed.
      return localParts(name).filter((p) => p.startsWith(v.toLowerCase())).slice(0, 3).map((p) => ({ label: `${p}@`, value: `${p}@` }));
    }
    const typed = v.slice(at + 1).toLowerCase();
    return DOMAINS.filter((d) => d.startsWith(typed) && d !== typed).slice(0, 4).map((d) => ({ label: `@${d}`, value: `${v.slice(0, at)}@${d}` }));
  }
  if (kind === "contact") return [];
  // Words: complete the last word being typed.
  const m = v.match(/(\S*)$/);
  const part = (m?.[1] ?? "").toLowerCase();
  if (!part) return [];
  const list = kind === "name" ? NAMES : WORDS;
  return list
    .filter((w) => w.toLowerCase().startsWith(part) && w.toLowerCase() !== part)
    .slice(0, 4)
    .map((w) => {
      const word = kind === "name" || kind === "company" ? w[0].toUpperCase() + w.slice(1) : w;
      return { label: word, value: v.slice(0, v.length - part.length) + word + " " };
    });
}

/** Names and companies get capital letters at the start of each word. */
function typeChar(kind: FieldKind, value: string, ch: string) {
  const startOfWord = !value || /\s$/.test(value);
  return value + ((kind === "name" || kind === "company") && startOfWord ? ch.toUpperCase() : ch);
}

function Key({ label, onPress, wide, accent, repeat, aria }: { label: React.ReactNode; onPress: () => void; wide?: number; accent?: boolean; repeat?: boolean; aria?: string }) {
  return (
    <button
      type="button"
      className={styles.key}
      data-dwell={KEY_MS}
      data-dwell-repeat={repeat ? "" : undefined}
      data-accent={accent ? "" : undefined}
      style={wide ? { flex: wide } : undefined}
      aria-label={aria}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
    >
      {label}
      <span className={styles.keyFill} aria-hidden="true" />
    </button>
  );
}

export function TypingPanel(props: {
  kind: FieldKind;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
  onClose: () => void;
  name: string; // what they typed as their name (for email suggestions)
  phoneUrl: string | null; // null: typing on a phone isn't available here (the row says so)
}) {
  const { kind, value, onChange } = props;
  const [pad, setPad] = useState<"auto" | "on" | "off">("auto"); // number pad: auto = on for a phone number
  const [qr, setQr] = useState("");
  const numeric = pad === "on" || (pad === "auto" && kind === "contact" && /^[+\d(]/.test(value));
  const email = kind === "email" || (kind === "contact" && !numeric);
  const suggestions = useMemo(() => suggestionsFor(kind, value, props.name), [kind, value, props.name]);

  useEffect(() => {
    let live = true;
    if (props.phoneUrl) QRCode.toString(props.phoneUrl, { type: "svg", margin: 1, color: { dark: "#131826", light: "#ffffff" } }).then((s) => live && setQr(s));
    return () => { live = false; };
  }, [props.phoneUrl]);

  const add = (ch: string) => onChange(typeChar(kind, value, ch));
  const back = () => onChange(value.slice(0, -1));

  return (
    <div className={styles.typingPanel} role="dialog" aria-label={`Type ${props.label}`}>
      <div className={styles.phoneRow} data-off={props.phoneUrl ? undefined : ""}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <span className={styles.phoneQr} aria-hidden="true">{props.phoneUrl && qr && <img src={`data:image/svg+xml;utf8,${encodeURIComponent(qr)}`} alt="" />}</span>
        <span className={styles.phoneText}>
          <b>TYPE ON YOUR PHONE</b>
          {props.phoneUrl ? (
            <span>Scan to fill this in on your own phone. It sends from there, and the screen updates.</span>
          ) : (
            <span>Not available on this kiosk right now.</span>
          )}
          <small>Or use the keyboard below.</small>
        </span>
      </div>
      <div className={styles.typingHead}>
        <span>{props.label.toUpperCase()}</span>
        <button type="button" className={styles.typingClose} data-dwell={KEY_MS} onClick={props.onClose} aria-label="Close the keyboard">×<span className={styles.keyFill} aria-hidden="true" /></button>
      </div>
      <div className={styles.suggestRow}>
        {suggestions.map((s) => <Key key={s.label} label={s.label} onPress={() => onChange(s.value)} />)}
        {!suggestions.length && <span className={styles.suggestEmpty}>{email ? "Suggestions appear as you type" : numeric ? "Phone number" : "Suggestions appear as you type"}</span>}
      </div>
      {numeric ? (
        <div className={styles.numPad}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "0", "-"].map((c) => <Key key={c} label={c} onPress={() => onChange(value + c)} />)}
          <Key label="( )" onPress={() => onChange(value + (value.includes("(") && !value.includes(")") ? ")" : "("))} aria="Bracket" />
          <Key label="space" onPress={() => onChange(value + " ")} />
          <Key label="⌫" repeat onPress={back} aria="Delete" />
        </div>
      ) : (
        <div className={styles.keyRows}>
          {email && (
            <div className={styles.keyRow}>
              {["@", ".", "_", "-", ".com"].map((c) => <Key key={c} label={c} onPress={() => onChange(value + c)} accent />)}
              {DOMAINS.slice(0, 2).map((d) => <Key key={d} label={`@${d.split(".")[0]}`} onPress={() => onChange(value.replace(/@.*$/, "") + `@${d}`)} accent wide={1.6} aria={`@${d}`} />)}
            </div>
          )}
          {ROWS.slice(email ? 0 : kind === "questions" || kind === "company" ? 0 : 1).map((row) => (
            <div key={row} className={styles.keyRow}>
              {row.split("").map((c) => <Key key={c} label={c} onPress={() => add(c)} />)}
              {row === "zxcvbnm" && <Key label="⌫" repeat onPress={back} wide={1.6} aria="Delete" />}
            </div>
          ))}
          <div className={styles.keyRow}>
            {kind === "contact" || kind === "email" ? <Key label="123" onPress={() => setPad("on")} wide={1.3} aria="Number pad" /> : <Key label="'" onPress={() => add("'")} />}
            {kind === "questions" && <Key label="," onPress={() => add(",")} />}
            <Key label="space" onPress={() => add(" ")} wide={4} />
            {kind === "questions" && <Key label="?" onPress={() => add("?")} />}
            <Key label="NEXT →" onPress={props.onNext} wide={2} accent />
          </div>
        </div>
      )}
      {numeric && (
        <div className={styles.keyRow}>
          <Key label="ABC" onPress={() => setPad("off")} wide={1.3} aria="Letters" />
          <Key label="NEXT →" onPress={props.onNext} wide={2} accent />
        </div>
      )}
    </div>
  );
}
