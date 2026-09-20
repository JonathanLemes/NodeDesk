// Applies the saved theme before first paint to avoid a light flash.
// Kept as an external file so the CSP can forbid inline scripts.
try {
  var t = localStorage.getItem("nodedesk.theme") || "system";
  var dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  if (dark) document.documentElement.classList.add("dark");
  // iOS reads this at launch. A non-translucent bar keeps the home-screen app's WebView flush with the
  // bottom of the screen (with black-translucent iOS 26 leaves a band there, WebKit bug 301108).
  var bar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (bar) bar.setAttribute("content", dark ? "black" : "default");
} catch (e) {}
