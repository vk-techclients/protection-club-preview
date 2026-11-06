/* Protection Club — lead capture on VK house rails.
 *
 * Shared by the "Message Us" interest-picker pop-up and the Contact page
 * quote form. Submissions POST directly to the Farm2Chef Supabase project
 * (public anon key, INSERT-only by RLS — the house intake pattern from
 * farm2chef-rebuild/src/lib/intake.js). NO Base44 backend function is
 * involved anywhere in this path.
 *
 * Store: public.lead (the house leads table the confirmation bridge polls).
 *   segment      = "protection-club"          (the client tag)
 *   source_page  = "protection-club-preview:popup" | ":contact-form"
 *   segment_data = { client, ref, service, property_type, zip, source, page }
 * The dedicated public.website_leads table is specced in
 * deploy/website-leads.sql (one dashboard paste); when it exists, flip
 * TABLE below and the segment_data shape carries over unchanged.
 *
 * The alert email is sent house-side by
 * tech-services/carlos-castro/alerts/protection_club_alerts.py — the
 * recipient lives THERE (one config line), not in this file.
 */
(function () {
  "use strict";

  var CONFIG = {
    SUPABASE_URL: "https://jlwxwyortlhslxoxwveb.supabase.co",
    ANON_KEY:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impsd3h3eW9ydGxoc2x4b3h3dmViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MTM5NjgsImV4cCI6MjEwODA4OTk2OH0.ffl-S4efjHt1DCZccfhXzU8An489aljtLSuFVrN5VfI",
    TABLE: "lead",
    CLIENT: "protection-club",
    SITE_TAG: "protection-club-preview",
  };

  var REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  function makeRef() {
    var out = "";
    for (var i = 0; i < 6; i++) {
      out += REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)];
    }
    return "PC-" + out;
  }

  function captureLead(fields) {
    var ref = makeRef();
    var payload = {
      name: fields.name || null,
      email: fields.email || null,
      phone: fields.phone || null,
      segment: CONFIG.CLIENT,
      source_page: CONFIG.SITE_TAG + ":" + fields.source,
      message: fields.note || null,
      segment_data: {
        client: CONFIG.CLIENT,
        ref: ref,
        service: fields.service || null,
        property_type: fields.propertyType || null,
        zip: fields.zip || null,
        source: fields.source,
        page: window.location.pathname,
      },
    };
    return fetch(CONFIG.SUPABASE_URL + "/rest/v1/" + CONFIG.TABLE, {
      method: "POST",
      headers: {
        apikey: CONFIG.ANON_KEY,
        Authorization: "Bearer " + CONFIG.ANON_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return ref;
    });
  }

  function wireLeadForm(form, opts) {
    if (!form) return;
    var errorBox = document.getElementById(opts.errorId);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (errorBox) errorBox.classList.remove("show");
      var fd = new FormData(form);
      // Honeypot: a filled trap field means a bot — fake success, send nothing.
      if (fd.get("company_fax")) {
        opts.onDone(makeRef());
        return;
      }
      var fields = {
        source: opts.source,
        service: (fd.get("service") || "").toString().trim(),
        name: (fd.get("name") || "").toString().trim(),
        phone: (fd.get("phone") || "").toString().trim(),
        email: (fd.get("email") || "").toString().trim(),
        propertyType: (fd.get("property_type") || "").toString().trim(),
        zip: (fd.get("zip") || "").toString().trim(),
        note: (fd.get("note") || "").toString().trim(),
      };
      if (!fields.name || !fields.phone) {
        if (errorBox) {
          errorBox.textContent =
            "We need your name and phone number so Carlos can call you back.";
          errorBox.classList.add("show");
        }
        return;
      }
      var btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      captureLead(fields)
        .then(function (ref) {
          opts.onDone(ref);
        })
        .catch(function () {
          if (btn) btn.disabled = false;
          if (errorBox) {
            errorBox.textContent =
              "Something went wrong sending that — nothing was saved. Please try again, or call us at (713) 253-6344 and we'll take it from there.";
            errorBox.classList.add("show");
          }
        });
    });
  }

  /* ---------------- Contact page form ---------------- */
  var contactForm = document.getElementById("contact-lead-form");
  if (contactForm) {
    // Pre-select the service when the interest picker (or a link) carried one.
    try {
      var preset =
        sessionStorage.getItem("pc_interest") ||
        new URLSearchParams(window.location.search).get("interest");
      var sel = contactForm.querySelector('select[name="service"]');
      if (preset && sel) {
        for (var i = 0; i < sel.options.length; i++) {
          if (sel.options[i].value === preset) sel.selectedIndex = i;
        }
      }
    } catch (e) {}
    wireLeadForm(contactForm, {
      source: "contact-form",
      errorId: "contact-form-error",
      onDone: function (ref) {
        contactForm.style.display = "none";
        var done = document.getElementById("contact-done");
        var refEl = document.getElementById("contact-done-ref");
        if (refEl) refEl.textContent = ref;
        if (done) {
          done.hidden = false;
          done.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      },
    });
  }

  /* ---------------- "Message Us" pop-up ---------------- */
  var backdrop = document.getElementById("msg-backdrop");
  if (!backdrop) return;
  var fab = document.getElementById("msg-fab");
  var stepPick = document.getElementById("msg-step-pick");
  var stepForm = document.getElementById("msg-step-form");
  var stepDone = document.getElementById("msg-step-done");
  var popupForm = document.getElementById("popup-lead-form");
  var serviceInput = document.getElementById("popup-service");
  var formTitle = document.getElementById("msg-form-title");

  function suppressed() {
    try {
      var until = Number(localStorage.getItem("pc_popup_suppress_until") || 0);
      return until > Date.now();
    } catch (e) {
      return false;
    }
  }
  function suppress7d() {
    try {
      localStorage.setItem(
        "pc_popup_suppress_until",
        String(Date.now() + 7 * 24 * 3600 * 1000)
      );
    } catch (e) {}
  }
  function showStep(which) {
    stepPick.hidden = which !== "pick";
    stepForm.hidden = which !== "form";
    stepDone.hidden = which !== "done";
  }
  function openPopup() {
    showStep("pick");
    backdrop.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function closePopup() {
    backdrop.classList.remove("open");
    document.body.style.overflow = "";
  }

  if (fab) fab.addEventListener("click", openPopup);
  document
    .getElementById("msg-close")
    .addEventListener("click", function () {
      suppress7d();
      closePopup();
    });
  document
    .getElementById("msg-dismiss")
    .addEventListener("click", function () {
      suppress7d();
      closePopup();
    });
  document
    .getElementById("msg-done-close")
    .addEventListener("click", function () {
      suppress7d();
      closePopup();
    });
  backdrop.addEventListener("click", function (ev) {
    if (ev.target === backdrop) {
      suppress7d();
      closePopup();
    }
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && backdrop.classList.contains("open")) closePopup();
  });
  document.getElementById("msg-back").addEventListener("click", function () {
    showStep("pick");
  });

  var pickRows = backdrop.querySelectorAll(".pick-row");
  Array.prototype.forEach.call(pickRows, function (row) {
    row.addEventListener("click", function () {
      var service = row.getAttribute("data-service");
      if (serviceInput) serviceInput.value = service;
      if (formTitle)
        formTitle.textContent = "Request a call back — " + service;
      try {
        sessionStorage.setItem("pc_interest", service);
      } catch (e) {}
      showStep("form");
    });
  });

  wireLeadForm(popupForm, {
    source: "popup",
    errorId: "popup-form-error",
    onDone: function (ref) {
      var refEl = document.getElementById("popup-done-ref");
      if (refEl) refEl.textContent = ref;
      showStep("done");
      suppress7d();
    },
  });

  /* Gentle auto-trigger (Lead Experience spec): ~20s OR 50% scroll,
     once per session, never on the Contact page, never while typing. */
  var isContact = window.location.pathname.indexOf("contact") !== -1;
  var alreadyShown = false;
  try {
    alreadyShown = sessionStorage.getItem("pc_popup_shown") === "1";
  } catch (e) {}
  if (!isContact && !alreadyShown && !suppressed()) {
    var fired = false;
    function maybeFire() {
      if (fired) return;
      var ae = document.activeElement;
      if (
        ae &&
        (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.tagName === "SELECT")
      )
        return;
      fired = true;
      try {
        sessionStorage.setItem("pc_popup_shown", "1");
      } catch (e) {}
      openPopup();
    }
    setTimeout(maybeFire, 20000);
    window.addEventListener(
      "scroll",
      function () {
        var h = document.documentElement;
        var max = h.scrollHeight - h.clientHeight;
        if (max > 0 && h.scrollTop / max >= 0.5) maybeFire();
      },
      { passive: true }
    );
  }
})();
