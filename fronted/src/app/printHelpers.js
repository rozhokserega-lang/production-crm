export function waitForImages(root, timeoutMs = 8000) {
  if (!root) return Promise.resolve();
  const imgs = Array.from(root.querySelectorAll("img"));
  if (!imgs.length) return Promise.resolve();

  return Promise.all(
    imgs.map(
      (img) =>
        new Promise((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            resolve();
          };
          const timer = window.setTimeout(finish, timeoutMs);
          if (img.complete && img.naturalWidth > 0) {
            window.clearTimeout(timer);
            finish();
            return;
          }
          img.addEventListener(
            "load",
            () => {
              window.clearTimeout(timer);
              finish();
            },
            { once: true },
          );
          img.addEventListener(
            "error",
            () => {
              window.clearTimeout(timer);
              finish();
            },
            { once: true },
          );
        }),
    ),
  );
}

export function printWithPartialBodyClass(bodyClass = "workshop-partial-print") {
  document.body.classList.add(bodyClass);
  const cleanup = () => {
    document.body.classList.remove(bodyClass);
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
  window.setTimeout(cleanup, 1500);
}
