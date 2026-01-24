(() => {
  const STACK_CLASS = "toast-stack";

  function getStack() {
    let stack = document.querySelector(`.${STACK_CLASS}`);
    if (!stack) {
      stack = document.createElement("div");
      stack.className = STACK_CLASS;
      document.body.appendChild(stack);
    }
    return stack;
  }

  window.showToast = (message, type = "info") => {
    if (!message) return;
    const stack = getStack();
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    stack.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add("show");
    });

    const removeToast = () => {
      toast.classList.remove("show");
      toast.addEventListener(
        "transitionend",
        () => {
          toast.remove();
        },
        { once: true }
      );
    };

    setTimeout(removeToast, 2200);
  };
})();
