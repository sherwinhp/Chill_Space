const walletRoot = document.querySelector("[data-wallet-root]");

if (walletRoot) {
  const statusEl = document.getElementById("wallet-status");
  const amountInput = document.getElementById("wallet-amount-input");
  const balanceLabel = document.getElementById("wallet-balance-label");
  const presetButtons = document.querySelectorAll("[data-wallet-preset]");

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

  presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      presetButtons.forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      if (amountInput) {
        amountInput.value = button.dataset.amount || "5.00";
      }
    });
  });

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
}
