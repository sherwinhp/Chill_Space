const walletRoot = document.querySelector("[data-wallet-root]");

if (walletRoot) {
  const statusEl = document.getElementById("wallet-status");
  const amountInput = document.getElementById("wallet-amount-input");
  const balanceLabel = document.getElementById("wallet-balance-label");
  const presetButtons = document.querySelectorAll("[data-wallet-preset]");
  const topupConfirmButton = document.querySelector("[data-wallet-topup-confirm]");
  const topupTypeInputs = document.querySelectorAll("input[name='walletTopupType']");
  const stripePublishableKey = walletRoot.dataset.stripePublishableKey || "";
  const stripe = stripePublishableKey && window.Stripe ? window.Stripe(stripePublishableKey) : null;
  const stripeElements = stripe ? stripe.elements() : null;
  const stripeForm = document.querySelector("[data-wallet-stripe-form]");
  const cardBrandEl = document.querySelector("[data-wallet-card-brand]");
  const cardNameInput = document.querySelector("[data-wallet-card-name]");
  const cardEmailInput = document.querySelector("[data-wallet-card-email]");
  const cardCountryInput = document.querySelector("[data-wallet-card-country]");
  const cardPostalInput = document.querySelector("[data-wallet-card-postal]");
  const cardNumberMount = document.querySelector("#wallet-card-number");
  const cardExpiryMount = document.querySelector("#wallet-card-expiry");
  const cardCvcMount = document.querySelector("#wallet-card-cvc");
  let stripeCardNumberElement = null;
  let stripeCardExpiryElement = null;
  let stripeCardCvcElement = null;
  const stripeCardState = {
    numberComplete: false,
    expiryComplete: false,
    cvcComplete: false,
    error: null,
    brand: "unknown",
  };
  const netsModal = document.querySelector("[data-nets-modal]");
  const netsStatusEl = netsModal ? netsModal.querySelector("[data-nets-status]") : null;
  const netsQrImgEl = netsModal ? netsModal.querySelector("[data-nets-qr]") : null;
  const netsTimerEl = netsModal ? netsModal.querySelector("[data-nets-timer]") : null;
  const netsSpinnerEl = netsModal ? netsModal.querySelector("[data-nets-spinner]") : null;
  const netsCancelButtons = netsModal ? netsModal.querySelectorAll("[data-nets-cancel]") : [];
  let netsEventSource = null;
  let netsTimerInterval = null;
  let netsRemainingSeconds = 0;
  let netsTxnRetrievalRef = null;
  let netsCompleting = false;
  let netsCreatingQr = false;

  function formatMoney(cents) {
    return `$${(Number(cents || 0) / 100).toFixed(2)}`;
  }

  function getTopupAmount() {
    return amountInput ? amountInput.value : "";
  }

  function setStatus(message, color = "inherit") {
    if (!statusEl) return;
    statusEl.style.color = color;
    statusEl.textContent = message;
  }

  function parseTopupAmountCents() {
    const raw = getTopupAmount();
    if (!raw) return null;
    const value = String(raw).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
    const cents = Math.round(Number(value) * 100);
    if (!Number.isFinite(cents)) return null;
    return cents;
  }

  function getSelectedTopupType() {
    const selected = document.querySelector("input[name='walletTopupType']:checked");
    return selected ? selected.value : null;
  }

  function toggleStripeForm() {
    if (!stripeForm) return;
    const type = getSelectedTopupType();
    stripeForm.classList.toggle("is-hidden", type !== "stripe_card");
  }

  function updateCardBrand() {
    if (!cardBrandEl) return;
    if (stripeCardState.error) {
      cardBrandEl.textContent = stripeCardState.error.message || "Card details invalid";
      cardBrandEl.classList.add("is-invalid");
      return;
    }
    if (stripeCardState.brand && stripeCardState.brand !== "unknown") {
      cardBrandEl.textContent = `${stripeCardState.brand.toUpperCase()} detected`;
      cardBrandEl.classList.remove("is-invalid");
      return;
    }
    cardBrandEl.textContent = "";
    cardBrandEl.classList.remove("is-invalid");
  }

  function validateCardForm() {
    if (!stripe || !stripeCardNumberElement || !stripeCardExpiryElement || !stripeCardCvcElement) {
      return { ok: false, message: "Stripe card form is not ready." };
    }
    if (stripeCardState.error) {
      return { ok: false, message: stripeCardState.error.message || "Card details invalid." };
    }
    if (
      !stripeCardState.numberComplete ||
      !stripeCardState.expiryComplete ||
      !stripeCardState.cvcComplete
    ) {
      return { ok: false, message: "Please complete your card details." };
    }
    return { ok: true };
  }

  function normalizeCountryInput(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const upper = raw.toUpperCase();
    if (upper.length === 2) return upper;
    const normalized = upper.replace(/\s+/g, " ");
    const map = {
      SINGAPORE: "SG",
      "UNITED STATES": "US",
      USA: "US",
      "UNITED KINGDOM": "GB",
      UK: "GB",
      "GREAT BRITAIN": "GB",
      MALAYSIA: "MY",
      INDONESIA: "ID",
      THAILAND: "TH",
      VIETNAM: "VN",
      PHILIPPINES: "PH",
    };
    return map[normalized] || "";
  }

  function readJsonOrText(response) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return response.json();
    }
    return response.text().then((text) => ({ error: text }));
  }

  function formatCountdown(seconds) {
    const safeSeconds = Number.isFinite(Number(seconds)) ? Math.max(0, Number(seconds)) : 0;
    const m = Math.floor(safeSeconds / 60);
    const s = safeSeconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function stopNetsBackgroundWork() {
    if (netsEventSource) {
      netsEventSource.close();
      netsEventSource = null;
    }
    if (netsTimerInterval) {
      clearInterval(netsTimerInterval);
      netsTimerInterval = null;
    }
  }

  function resetNetsModalUi() {
    if (netsStatusEl) netsStatusEl.textContent = "Generating QR...";
    if (netsSpinnerEl) netsSpinnerEl.hidden = false;
    if (netsQrImgEl) {
      netsQrImgEl.hidden = true;
      netsQrImgEl.removeAttribute("src");
    }
    netsRemainingSeconds = 300;
    if (netsTimerEl) netsTimerEl.textContent = `Time remaining: ${formatCountdown(netsRemainingSeconds)}`;
    netsTxnRetrievalRef = null;
    netsCompleting = false;
  }

  function openNetsModal() {
    if (!netsModal) return;
    netsModal.hidden = false;
    netsModal.classList.add("is-open");
    netsModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("has-modal");
  }

  function closeNetsModal({ keepState = false } = {}) {
    stopNetsBackgroundWork();
    netsCreatingQr = false;
    if (!netsModal) return;
    netsModal.classList.remove("is-open");
    netsModal.setAttribute("aria-hidden", "true");
    netsModal.hidden = true;
    document.body.classList.remove("has-modal");
    if (!keepState) {
      resetNetsModalUi();
    }
  }

  function isNetsSuccessPayload(payload) {
    const responseCode =
      payload?.response_code ?? payload?.result?.response_code ?? payload?.result?.responseCode;
    const txnStatus =
      payload?.txn_status ?? payload?.result?.txn_status ?? payload?.result?.txnStatus;
    const normalizedTxnStatus =
      typeof txnStatus === "string" ? txnStatus.trim().toLowerCase() : txnStatus;
    return (
      String(responseCode) === "00" &&
      (Number(normalizedTxnStatus) === 1 ||
        normalizedTxnStatus === "success" ||
        normalizedTxnStatus === "completed")
    );
  }

  async function completeNetsTopup(txnRetrievalRef) {
    const response = await fetch("/wallet/topup/nets/qr/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txnRetrievalRef }),
    });
    const body = await readJsonOrText(response);
    if (!response.ok || !body || !body.success) {
      throw new Error(body?.error || "Unable to finalize NETS top-up.");
    }
    if (balanceLabel && Number.isFinite(Number(body.balanceCents))) {
      balanceLabel.textContent = formatMoney(body.balanceCents);
    }
    window.setTimeout(() => window.location.reload(), 600);
  }

  function startNetsTimer() {
    netsRemainingSeconds = 300;
    if (netsTimerEl) {
      netsTimerEl.textContent = `Time remaining: ${formatCountdown(netsRemainingSeconds)}`;
    }

    netsTimerInterval = setInterval(() => {
      netsRemainingSeconds -= 1;
      if (netsTimerEl) {
        netsTimerEl.textContent = `Time remaining: ${formatCountdown(netsRemainingSeconds)}`;
      }

      if (netsRemainingSeconds <= 0) {
        stopNetsBackgroundWork();
        if (netsStatusEl) {
          netsStatusEl.textContent = "Top-up failed. Please try again.";
        }
        if (netsSpinnerEl) netsSpinnerEl.hidden = true;
        closeNetsModal();
      }
    }, 1000);
  }

  function startNetsSse(txnRetrievalRef) {
    const safeRef = encodeURIComponent(String(txnRetrievalRef));
    netsEventSource = new EventSource(`/payments/nets/qr/stream/${safeRef}`);

    netsEventSource.addEventListener("message", async (event) => {
      if (!event?.data) return;
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (payload?.fail) {
        stopNetsBackgroundWork();
        if (netsStatusEl) {
          netsStatusEl.textContent =
            payload?.details || "NETS status check failed. Please close this window and try again.";
        }
        if (netsSpinnerEl) netsSpinnerEl.hidden = true;
        return;
      }

      if (isNetsSuccessPayload(payload) && !netsCompleting) {
        netsCompleting = true;
        stopNetsBackgroundWork();
        if (netsStatusEl) netsStatusEl.textContent = "Payment received. Completing top-up...";
        try {
          await completeNetsTopup(txnRetrievalRef);
        } catch (error) {
          netsCompleting = false;
          if (netsStatusEl) {
            netsStatusEl.textContent = error.message || "Unable to finalize NETS top-up.";
          }
        }
      }
    });

    netsEventSource.addEventListener("done", async (event) => {
      const result = String(event?.data || "").trim().toLowerCase();
      if (result !== "success") {
        stopNetsBackgroundWork();
        if (netsStatusEl) {
          netsStatusEl.textContent =
            result === "timeout"
              ? "NETS QR timed out. Please close this window and try again."
              : "NETS payment failed. Please close this window and try again.";
        }
        if (netsSpinnerEl) netsSpinnerEl.hidden = true;
        return;
      }

      if (netsCompleting) return;
      netsCompleting = true;
      stopNetsBackgroundWork();
      if (netsStatusEl) netsStatusEl.textContent = "Payment received. Completing top-up...";
      try {
        await completeNetsTopup(txnRetrievalRef);
      } catch (error) {
        netsCompleting = false;
        if (netsStatusEl) {
          netsStatusEl.textContent = error.message || "Unable to finalize NETS top-up.";
        }
      }
    });
  }

  async function startNetsQrPopup() {
    if (netsCreatingQr) return;
    const amountCents = parseTopupAmountCents();
    if (!amountCents || amountCents <= 0) {
      setStatus("Enter a valid top-up amount.", "red");
      return;
    }
    netsCreatingQr = true;

    resetNetsModalUi();
    openNetsModal();

    try {
      const response = await fetch("/wallet/topup/nets/qr/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: (amountCents / 100).toFixed(2) }),
      });
      const body = await readJsonOrText(response);
      if (!response.ok || !body || !body.qrCodeUrl || !body.txnRetrievalRef) {
        throw new Error(body?.error || "Unable to generate NETS QR.");
      }

      netsTxnRetrievalRef = body.txnRetrievalRef;
      if (netsStatusEl) {
        netsStatusEl.textContent = "Scan with your bank app to complete top-up.";
      }
      if (netsSpinnerEl) netsSpinnerEl.hidden = true;
      if (netsQrImgEl) {
        netsQrImgEl.src = body.qrCodeUrl;
        netsQrImgEl.hidden = false;
      }

      startNetsTimer();
      startNetsSse(netsTxnRetrievalRef);
    } catch (error) {
      if (netsStatusEl) {
        netsStatusEl.textContent = error.message || "Unable to generate NETS QR.";
      }
      if (netsSpinnerEl) netsSpinnerEl.hidden = true;
    } finally {
      netsCreatingQr = false;
    }
  }

  presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      presetButtons.forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      if (amountInput) {
        amountInput.value = button.dataset.amount || "5.00";
      }
    });
  });

  if (stripeElements && cardNumberMount && cardExpiryMount && cardCvcMount) {
    const baseStyle = {
      base: {
        color: "#1f2430",
        fontSize: "14px",
        fontFamily: "Space Grotesk, sans-serif",
        "::placeholder": {
          color: "#a0a4b0",
        },
      },
    };
    stripeCardNumberElement = stripeElements.create("cardNumber", { style: baseStyle });
    stripeCardExpiryElement = stripeElements.create("cardExpiry", { style: baseStyle });
    stripeCardCvcElement = stripeElements.create("cardCvc", { style: baseStyle });

    stripeCardNumberElement.mount(cardNumberMount);
    stripeCardExpiryElement.mount(cardExpiryMount);
    stripeCardCvcElement.mount(cardCvcMount);

    stripeCardNumberElement.on("change", (event) => {
      stripeCardState.numberComplete = event.complete;
      stripeCardState.error = event.error || null;
      stripeCardState.brand = event.brand || "unknown";
      updateCardBrand();
    });

    stripeCardExpiryElement.on("change", (event) => {
      stripeCardState.expiryComplete = event.complete;
      stripeCardState.error = event.error || stripeCardState.error;
      updateCardBrand();
    });

    stripeCardCvcElement.on("change", (event) => {
      stripeCardState.cvcComplete = event.complete;
      stripeCardState.error = event.error || stripeCardState.error;
      updateCardBrand();
    });
  }

  if (cardNameInput && walletRoot.dataset.userName) {
    cardNameInput.value = walletRoot.dataset.userName;
  }
  if (cardEmailInput && walletRoot.dataset.userEmail) {
    cardEmailInput.value = walletRoot.dataset.userEmail;
  }

  if (topupTypeInputs && topupTypeInputs.length) {
    topupTypeInputs.forEach((input) => {
      input.addEventListener("change", toggleStripeForm);
    });
    toggleStripeForm();
  }

  if (netsCancelButtons && netsCancelButtons.length) {
    netsCancelButtons.forEach((button) => {
      button.addEventListener("click", () => closeNetsModal());
    });
  }

  if (window.paypal) {
    window.paypal
      .Buttons({
        createOrder: async () => {
          setStatus("");
          const response = await fetch("/wallet/topup/paypal/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount: getTopupAmount() }),
          });
          const body = await response.json();
          if (!response.ok) {
            throw new Error(body.error || "Unable to start top-up.");
          }
          return body.id;
        },
        onApprove: async (data) => {
          try {
            const response = await fetch("/wallet/topup/paypal/capture", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderID: data.orderID }),
            });
            const body = await response.json();
            if (!response.ok || !body.success) {
              throw new Error(body.error || "Unable to complete top-up.");
            }
            setStatus("Top-up successful.", "green");
            if (balanceLabel && Number.isFinite(Number(body.balanceCents))) {
              balanceLabel.textContent = formatMoney(body.balanceCents);
            }
            window.setTimeout(() => window.location.reload(), 700);
          } catch (error) {
            setStatus(error.message || "Unable to complete top-up.", "red");
          }
        },
        onError: (error) => {
          setStatus(error.message || "PayPal top-up failed.", "red");
        },
      })
      .render("#wallet-paypal-button");
  } else {
    setStatus("PayPal SDK is unavailable. Please refresh the page.", "red");
  }

  if (topupConfirmButton) {
    topupConfirmButton.addEventListener("click", async () => {
      const type = getSelectedTopupType();
      if (!type) {
        setStatus("Select a top-up method.", "red");
        return;
      }
      const amountCents = parseTopupAmountCents();
      if (!amountCents || amountCents <= 0) {
        setStatus("Enter a valid top-up amount.", "red");
        return;
      }

      if (type === "paynow") {
        try {
          const response = await fetch("/wallet/topup/paynow/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount: (amountCents / 100).toFixed(2) }),
          });
          const body = await readJsonOrText(response);
          if (!response.ok || !body.paymentUrl) {
            throw new Error(body.error || "Unable to start PayNow top-up.");
          }
          window.location.href = body.paymentUrl;
        } catch (error) {
          setStatus(error.message || "Unable to start PayNow top-up.", "red");
        }
        return;
      }

      if (type === "grabpay") {
        try {
          const response = await fetch("/wallet/topup/grabpay/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount: (amountCents / 100).toFixed(2) }),
          });
          const body = await readJsonOrText(response);
          if (!response.ok || !body.url) {
            throw new Error(body.error || "Unable to start GrabPay top-up.");
          }
          window.location.href = body.url;
        } catch (error) {
          setStatus(error.message || "Unable to start GrabPay top-up.", "red");
        }
        return;
      }

      if (type === "nets") {
        await startNetsQrPopup();
        return;
      }

      if (type === "stripe_card") {
        try {
          if (!stripe) {
            throw new Error("Stripe is not configured on this page.");
          }
          const validation = validateCardForm();
          if (!validation.ok) {
            throw new Error(validation.message || "Invalid card details.");
          }
          const billingName = cardNameInput ? cardNameInput.value : "";
          const billingEmail = cardEmailInput ? cardEmailInput.value : "";
          const billingCountry = normalizeCountryInput(
            cardCountryInput ? cardCountryInput.value : ""
          );
          const billingPostal = cardPostalInput ? cardPostalInput.value : "";

          const paymentMethodResult = await stripe.createPaymentMethod({
            type: "card",
            card: stripeCardNumberElement,
            billing_details: {
              name: billingName || undefined,
              email: billingEmail || undefined,
              address: {
                country: billingCountry || undefined,
                postal_code: billingPostal || undefined,
              },
            },
          });

          if (paymentMethodResult.error) {
            throw new Error(
              paymentMethodResult.error.message || "Unable to create card payment."
            );
          }

          const response = await fetch("/wallet/topup/stripe/card/pay", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              payment_method_id: paymentMethodResult.paymentMethod.id,
              amount: (amountCents / 100).toFixed(2),
            }),
          });
          const body = await readJsonOrText(response);
          if (!response.ok) {
            throw new Error(body.error || "Stripe top-up failed.");
          }
          if (body.requiresAction && body.clientSecret) {
            const actionResult = await stripe.handleCardAction(body.clientSecret);
            if (actionResult.error) {
              throw new Error(actionResult.error.message || "Card authentication failed.");
            }
            const confirmResponse = await fetch("/wallet/topup/stripe/card/confirm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ payment_intent_id: actionResult.paymentIntent.id }),
            });
            const confirmBody = await readJsonOrText(confirmResponse);
            if (!confirmResponse.ok || !confirmBody.success) {
              throw new Error(confirmBody.error || "Stripe top-up failed.");
            }
            setStatus("Top-up successful.", "green");
            if (balanceLabel && Number.isFinite(Number(confirmBody.balanceCents))) {
              balanceLabel.textContent = formatMoney(confirmBody.balanceCents);
            }
            window.setTimeout(() => window.location.reload(), 700);
            return;
          }
          if (body.success) {
            setStatus("Top-up successful.", "green");
            if (balanceLabel && Number.isFinite(Number(body.balanceCents))) {
              balanceLabel.textContent = formatMoney(body.balanceCents);
            }
            window.setTimeout(() => window.location.reload(), 700);
            return;
          }
          throw new Error(body.error || "Stripe top-up failed.");
        } catch (error) {
          setStatus(error.message || "Stripe top-up failed.", "red");
        }
        return;
      }

      setStatus("Select a top-up method.", "red");
    });
  }

  const topupStatus = new URLSearchParams(window.location.search).get("topup");
  if (topupStatus) {
    const messageMap = {
      success: "Top-up completed.",
      failed: "Top-up was not completed.",
      cancel: "Top-up was canceled.",
      missing_reference: "Missing PayNow reference.",
      missing_intent: "Missing Stripe reference.",
      not_found: "Top-up request not found.",
      error: "Unable to verify top-up. Please try again.",
    };
    const message = messageMap[topupStatus] || "Top-up status updated.";
    setStatus(message, topupStatus === "success" ? "green" : "red");
  }
}
