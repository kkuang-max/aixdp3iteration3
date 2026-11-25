"use client";
// A confirmation or sign-in link from Supabase that lands on the kiosk (customer) page belongs to the business side:
// send it on to /business, keeping the token, so the business is signed in there. (Supabase falls back to the Site URL,
// the kiosk, when the business address isn't in its list of allowed redirect URLs.)
import { useEffect } from "react";

export default function AuthBounce() {
  useEffect(() => {
    const { hash, search } = window.location;
    const fromAuth = /(^|[#&])(access_token|refresh_token|error_description)=/.test(hash) || /[?&](code|token_hash)=/.test(search);
    if (fromAuth) window.location.replace(`/business${search}${hash}`);
  }, []);
  return null;
}
