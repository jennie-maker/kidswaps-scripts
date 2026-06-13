# kidswaps-scripts
Hosted front-end scripts for kidswaps.com
## ⚠️ Public repo — front-end values only

This repo is PUBLIC (required for jsDelivr CDN hosting). Everything here ships
to the browser and is world-readable.

- ✅ OK to commit: front-end JS/CSS, the Supabase ANON key (public by design).
- ❌ NEVER commit: Supabase service_role key, Memberstack sk_ secret,
  OPERATOR_MEMBER_IDS, Stripe secret keys, or any sk_/service credential.

Those live ONLY in Supabase Edge Function secrets, never in front-end code.
