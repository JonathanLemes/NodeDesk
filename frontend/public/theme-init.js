// Applies the saved theme before first paint to avoid a light flash.
// Kept as an external file so the CSP can forbid inline scripts.
try {
  var t = localStorage.getItem("nodedesk.theme") || "system";
  if (t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches)) {
    document.documentElement.classList.add("dark");
  }
} catch (e) {}
