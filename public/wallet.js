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
  const stripeElementStyle = {
    base: {
      color: "#111827",
      fontFamily: '"Space Grotesk", "Segoe UI", sans-serif',
      fontSize: "14px",
      fontSmoothing: "antialiased",
      backgroundColor: "transparent",
      iconColor: "#1f2937",
      "::placeholder": { color: "#9aa1b1" },
    },
    invalid: { color: "#b42318", iconColor: "#b42318" },
  };
  const stripeElements = stripe
    ? stripe.elements({
        appearance: {
          theme: "flat",
          variables: {
            colorText: "#111827",
            colorTextPlaceholder: "#9aa1b1",
            colorBackground: "#ffffff",
            colorDanger: "#b42318",
            fontFamily: '"Space Grotesk", "Segoe UI", sans-serif',
            fontSizeBase: "14px",
          },
        },
      })
    : null;
  const cardNumberMount = document.getElementById("wallet-card-number-element");
  const cardExpiryMount = document.getElementById("wallet-card-expiry-element");
  const cardCvcMount = document.getElementById("wallet-card-cvc-element");
  const cardNumberElement =
    stripeElements && cardNumberMount
      ? stripeElements.create("cardNumber", {
          style: stripeElementStyle,
          placeholder: "1234 5678 9012 3456",
        })
      : null;
  const cardExpiryElement =
    stripeElements && cardExpiryMount
      ? stripeElements.create("cardExpiry", {
          style: stripeElementStyle,
          placeholder: "MM / YY",
        })
      : null;
  const cardCvcElement =
    stripeElements && cardCvcMount
      ? stripeElements.create("cardCvc", {
          style: stripeElementStyle,
          placeholder: "CVC",
        })
      : null;
  const cardForm = document.querySelector("[data-wallet-card-form]");
  const cardBrandEl = document.querySelector("[data-wallet-card-brand]");
  const cardBrandPill = document.querySelector("[data-wallet-card-brand-pill]");
  const cardNameInput = document.querySelector("[data-wallet-card-name]");
  const cardEmailInput = document.querySelector("[data-wallet-card-email]");
  const cardNumberInput = document.querySelector("[data-wallet-card-number]");
  const cardExpiryInput = document.querySelector("[data-wallet-card-expiry]");
  const cardCvcInput = document.querySelector("[data-wallet-card-cvc]");
  const cardCountryInput = document.querySelector("[data-wallet-card-country]");
  const cardPostalInput = document.querySelector("[data-wallet-card-postal]");
  let cardInputError = null;
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

  function toggleCardForm() {
    if (!cardForm) return;
    cardForm.classList.remove("is-hidden");
  }

  function setCardBrandMessage(message, isError = false) {
    if (!cardBrandEl) return;
    cardBrandEl.textContent = message || "";
    cardBrandEl.classList.toggle("is-invalid", Boolean(isError && message));
  }

  function formatBrandLabel(brand) {
    const labels = {
      visa: "Visa",
      mastercard: "Mastercard",
      amex: "Amex",
      discover: "Discover",
      jcb: "JCB",
      diners: "Diners",
      unionpay: "UnionPay",
    };
    return labels[brand] || "";
  }

  function setCardBrandPill(brand) {
    if (!cardBrandPill) return;
    const label = formatBrandLabel(brand);
    if (brand) {
      cardBrandPill.dataset.brand = brand;
    } else {
      delete cardBrandPill.dataset.brand;
    }
    cardBrandPill.textContent = label;
    cardBrandPill.classList.toggle("is-hidden", !label);
  }

  if (cardNumberElement && cardNumberMount) {
    cardNumberElement.mount(cardNumberMount);
  }
  if (cardExpiryElement && cardExpiryMount) {
    cardExpiryElement.mount(cardExpiryMount);
  }
  if (cardCvcElement && cardCvcMount) {
    cardCvcElement.mount(cardCvcMount);
  }

  if (cardNumberElement) {
    cardNumberElement.on("change", (event) => {
      if (event.error) {
        setCardBrandMessage(event.error.message, true);
        setCardBrandPill("");
        return;
      }
      if (event.brand && event.brand !== "unknown") {
        setCardBrandMessage("");
        setCardBrandPill(event.brand);
        return;
      }
      setCardBrandMessage("");
      setCardBrandPill("");
    });
  }

  function normalizeCardNumber(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function formatCardNumber(value) {
    const digits = normalizeCardNumber(value).slice(0, 19);
    const groups = [];
    for (let i = 0; i < digits.length; i += 4) {
      groups.push(digits.slice(i, i + 4));
    }
    return groups.join(" ");
  }

  function luhnCheck(number) {
    const digits = normalizeCardNumber(number);
    if (!digits) return false;
    let sum = 0;
    let shouldDouble = false;
    for (let i = digits.length - 1; i >= 0; i -= 1) {
      let digit = Number(digits[i]);
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  }

  function detectCardBrand(number) {
    const digits = normalizeCardNumber(number);
    if (!digits) return "unknown";
    if (/^4/.test(digits)) return "visa";
    if (/^(34|37)/.test(digits)) return "amex";
    if (/^5[1-5]/.test(digits)) return "mastercard";
    const first4 = Number(digits.slice(0, 4));
    if (Number.isFinite(first4) && first4 >= 2221 && first4 <= 2720) {
      return "mastercard";
    }
    if (/^6011/.test(digits) || /^65/.test(digits)) return "discover";
    const first3 = Number(digits.slice(0, 3));
    if (Number.isFinite(first3) && first3 >= 644 && first3 <= 649) return "discover";
    const first6 = Number(digits.slice(0, 6));
    if (Number.isFinite(first6) && first6 >= 622126 && first6 <= 622925) {
      return "discover";
    }
    return "unknown";
  }

  function formatExpiryInput(value) {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 4);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  function parseExpiryValue(value) {
    if (!value) return { month: null, year: null };
    const digits = String(value).replace(/\s/g, "");
    const match = digits.match(/^(\d{1,2})\/?(\d{2,4})$/);
    if (!match) return { month: null, year: null };
    return { month: match[1], year: match[2] };
  }

  function formatCvcInput(value) {
    return String(value || "")
      .replace(/\D/g, "")
      .slice(0, 4);
  }

  function setCardInputError(message) {
    cardInputError = message || null;
    updateCardBrand();
  }

  function updateCardBrand() {
    if (!cardBrandEl && !cardBrandPill) return;
    if (cardInputError) {
      setCardBrandMessage(cardInputError, true);
      setCardBrandPill("");
      return;
    }
    const brand = detectCardBrand(cardNumberInput ? cardNumberInput.value : "");
    if (brand && brand !== "unknown") {
      setCardBrandMessage("");
      setCardBrandPill(brand);
      return;
    }
    setCardBrandMessage("");
    setCardBrandPill("");
  }

  function validateCardForm() {
    if (!cardNumberInput || !cardExpiryInput || !cardCvcInput) {
      return { ok: false, message: "Card form is not ready." };
    }

    const number = normalizeCardNumber(cardNumberInput.value);
    if (!number) {
      setCardInputError("Card number is required.");
      return { ok: false, message: "Card number is required." };
    }

    const brand = detectCardBrand(number);
    const lengthByBrand = {
      visa: [13, 16, 19],
      mastercard: [16],
      amex: [15],
      discover: [16, 19],
    };
    if (!["visa", "mastercard", "amex", "discover"].includes(brand)) {
      setCardInputError("Unsupported card brand.");
      return { ok: false, message: "Unsupported card brand." };
    }
    if (!lengthByBrand[brand].includes(number.length)) {
      setCardInputError("Card number length is invalid.");
      return { ok: false, message: "Card number length is invalid." };
    }
    if (!luhnCheck(number)) {
      setCardInputError("Card number failed validation.");
      return { ok: false, message: "Card number failed validation." };
    }

    const expiryInput = cardExpiryInput.value || "";
    const { month, year } = parseExpiryValue(expiryInput);
    const monthNum = Number(month);
    let yearNum = Number(year);
    if (!Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) {
      setCardInputError("Expiry month is invalid.");
      return { ok: false, message: "Expiry month is invalid." };
    }
    if (!Number.isFinite(yearNum)) {
      setCardInputError("Expiry year is invalid.");
      return { ok: false, message: "Expiry year is invalid." };
    }
    if (yearNum < 100) {
      yearNum += 2000;
    }
    const expiryDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);
    if (expiryDate < new Date()) {
      setCardInputError("Card has expired.");
      return { ok: false, message: "Card has expired." };
    }

    const cvc = formatCvcInput(cardCvcInput.value);
    const expectedCvcLength = brand === "amex" ? 4 : 3;
    if (cvc.length !== expectedCvcLength) {
      setCardInputError("CVV length is invalid.");
      return { ok: false, message: "CVV length is invalid." };
    }

    setCardInputError(null);
    return {
      ok: true,
      number,
      brand,
      expMonth: monthNum,
      expYear: yearNum,
      cvc,
    };
  }

  function normalizeCountryInput(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const upper = raw.toUpperCase();
    const normalized = upper.replace(/\s+/g, " ").trim();
    if (normalized.length === 2) return normalized;
    const codeMatch = normalized.match(/\b([A-Z]{2})\b/);
    if (codeMatch) {
      return codeMatch[1];
    }
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

  function formatPostalForCountry(countryCode, value) {
    const raw = String(value || "");
    if (countryCode === "SG") {
      return raw.replace(/\D/g, "").slice(0, 6);
    }
    return raw.trim();
  }

  function validatePostalCode(countryCode, value) {
    const raw = String(value || "").trim();
    if (!raw) return { ok: true, value: "" };
    if (countryCode === "SG") {
      const digits = raw.replace(/\D/g, "");
      if (digits.length !== 6) {
        return { ok: false, message: "Singapore postal code must be 6 digits." };
      }
      return { ok: true, value: digits };
    }
    return { ok: true, value: raw };
  }

  function updatePostalRules() {
    if (!cardPostalInput) return;
    const countryCode = normalizeCountryInput(cardCountryInput ? cardCountryInput.value : "");
    if (countryCode === "SG") {
      cardPostalInput.inputMode = "numeric";
      cardPostalInput.pattern = "\\d{6}";
      cardPostalInput.placeholder = "e.g. 123456";
    } else {
      cardPostalInput.removeAttribute("inputmode");
      cardPostalInput.removeAttribute("pattern");
      cardPostalInput.placeholder = "Postal code";
    }
  }

  if (cardCountryInput) {
    cardCountryInput.addEventListener("input", updatePostalRules);
  }
  if (cardPostalInput) {
    cardPostalInput.addEventListener("input", () => {
      const countryCode = normalizeCountryInput(cardCountryInput ? cardCountryInput.value : "");
      const formatted = formatPostalForCountry(countryCode, cardPostalInput.value);
      if (formatted !== cardPostalInput.value) {
        cardPostalInput.value = formatted;
      }
    });
    updatePostalRules();
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

  if (cardNameInput && walletRoot.dataset.userName) {
    cardNameInput.value = walletRoot.dataset.userName;
  }
  if (cardEmailInput && walletRoot.dataset.userEmail) {
    cardEmailInput.value = walletRoot.dataset.userEmail;
  }

  if (cardNumberInput) {
    cardNumberInput.addEventListener("input", (event) => {
      event.target.value = formatCardNumber(event.target.value);
      setCardInputError(null);
      updateCardBrand();
    });
  }

  if (cardExpiryInput) {
    cardExpiryInput.addEventListener("input", (event) => {
      event.target.value = formatExpiryInput(event.target.value);
      setCardInputError(null);
    });
  }

  if (cardCvcInput) {
    cardCvcInput.addEventListener("input", (event) => {
      event.target.value = formatCvcInput(event.target.value);
      setCardInputError(null);
    });
  }

  if (topupTypeInputs && topupTypeInputs.length) {
    topupTypeInputs.forEach((input) => {
      input.addEventListener("change", () => {
        setStatus("");
      });
    });
    toggleCardForm();
  }

  if (netsCancelButtons && netsCancelButtons.length) {
    netsCancelButtons.forEach((button) => {
      button.addEventListener("click", () => closeNetsModal());
    });
  }

  if (window.paypal) {
    window.paypal
      .Buttons({
        fundingSource: window.paypal.FUNDING.PAYPAL,
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
      let type = getSelectedTopupType();
      const amountCents = parseTopupAmountCents();
      if (!amountCents || amountCents <= 0) {
        setStatus("Enter a valid top-up amount.", "red");
        return;
      }

      if (!type) {
        const hasCardInput =
          cardNumberInput && String(cardNumberInput.value || "").trim().length > 0;
        if (hasCardInput) {
          type = "stripe_card";
        } else {
          setStatus("Select a top-up method or enter card details.", "red");
          return;
        }
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
            throw new Error("Card payments are not available right now.");
          }
          if (!cardNumberElement) {
            throw new Error("Card input is not ready. Please refresh the page.");
          }
          const billingName = cardNameInput ? cardNameInput.value : "";
          const billingEmail = cardEmailInput ? cardEmailInput.value : "";
          const billingCountry = normalizeCountryInput(
            cardCountryInput ? cardCountryInput.value : ""
          );
          const postalCheck = validatePostalCode(
            billingCountry,
            cardPostalInput ? cardPostalInput.value : ""
          );
          if (!postalCheck.ok) {
            throw new Error(postalCheck.message);
          }
          const billingPostal = postalCheck.value;
          const paymentMethodResult = await stripe.createPaymentMethod({
            type: "card",
            card: cardNumberElement,
            billing_details: {
              name: billingName || undefined,
              email: billingEmail || undefined,
              address: {
                country: billingCountry || undefined,
                postal_code: billingPostal || undefined,
              },
            },
          });
          if (paymentMethodResult.error || !paymentMethodResult.paymentMethod) {
            throw new Error(
              paymentMethodResult.error?.message || "Card details are incomplete."
            );
          }
          const payload = {
            amount: (amountCents / 100).toFixed(2),
            payment_method_id: paymentMethodResult.paymentMethod.id,
            card_name: billingName,
            card_email: billingEmail,
            billing_country: billingCountry,
            postal_code: billingPostal,
          };

          const response = await fetch("/wallet/topup/stripe/card/pay", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const body = await readJsonOrText(response);
          if (!response.ok) {
            throw new Error(body.error || "Card top-up failed.");
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
              throw new Error(confirmBody.error || "Card top-up failed.");
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
          throw new Error(body.error || "Card top-up failed.");
        } catch (error) {
          setStatus(error.message || "Card top-up failed.", "red");
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
