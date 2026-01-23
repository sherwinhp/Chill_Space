const tabs = document.querySelectorAll(".tab");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
  });
});

window.addEventListener("scroll", () => {
  const sections = Array.from(document.querySelectorAll("main .section")).filter(
    (section) => section.id
  );
  if (!sections.length) return;
  const offset = 120;
  let currentId = sections[0].id;
  sections.forEach((section) => {
    if (window.scrollY + offset >= section.offsetTop) {
      currentId = section.id;
    }
  });
  tabs.forEach((tab) => {
    const href = tab.getAttribute("href");
    tab.classList.toggle("active", href === `#${currentId}`);
  });
});
