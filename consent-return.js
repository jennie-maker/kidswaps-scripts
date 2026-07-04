(function(){
  if (window.__ksConsentReturnWired) return;
  window.__ksConsentReturnWired = true;

  var ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqc29iaXZxeGV4Y25pd2lmeHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNzI4MjIsImV4cCI6MjA5MTk0ODgyMn0.IFtzADITLHrEhnc8oHfjzyulcxWySp0o3s6v8XTZ5VM";
  var FN_URL = "https://ajsobivqxexcniwifxzz.supabase.co/functions/v1/consent-log-write";

  var raw = null;
  try { raw = sessionStorage.getItem("ks_consent_pending"); } catch(e){}
  if (!raw) return;

  var payload;
  try { payload = JSON.parse(raw); } catch(e){ try { sessionStorage.removeItem("ks_consent_pending"); } catch(_){} return; }

  if (payload && payload.stashed_at && (Date.now() - payload.stashed_at > 3600000)) {
    try { sessionStorage.removeItem("ks_consent_pending"); } catch(e){}
    return;
  }

  var done = false;
  function tryWrite(){
    if (done) return;
    var ms = window.$memberstackDom;
    if (!ms) return;
    var token = "";
    try { token = ms.getMemberCookie ? (ms.getMemberCookie() || "") : ""; } catch(e){}
    if (!token) return;
    done = true;
    var body = {
      consent_type: payload.consent_type,
      terms_version: payload.terms_version,
      disclosure_text: payload.disclosure_text,
      plan_id: payload.plan_id || null,
      price_id: payload.price_id || null,
      email: payload.email || null,
      source: payload.source || "signup_page"
    };
    fetch(FN_URL, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type":"application/json", "apikey": ANON_KEY, "x-ms-token": token },
      body: JSON.stringify(body)
    }).then(function(r){
      if (r.ok) { try { sessionStorage.removeItem("ks_consent_pending"); } catch(e){} }
      else { done = false; }
    }).catch(function(){ done = false; });
  }

  function start(){
    var ms = window.$memberstackDom;
    if (!ms){ setTimeout(start, 150); return; }
    tryWrite();
    try { if (ms.onAuthChange) ms.onAuthChange(function(m){ if (m) tryWrite(); }); } catch(e){}
    var n = 0, iv = setInterval(function(){ n++; tryWrite(); if (done || n > 40) clearInterval(iv); }, 250);
  }
  start();
})();
