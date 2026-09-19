/*
 * Purges unused Bootstrap 3 selectors out of the Bootswatch theme CSS files and
 * minifies the result. Run with: node tools/build-css.js
 *
 * Scope: only the six Bootswatch theme bundles (the "duplicated framework CSS"
 * called out in the performance review). styles.css/editor.css/font-awesome.css
 * are hand-authored/icon-font CSS and are left untouched.
 */
var fs = require("fs");
var path = require("path");
var PurgeCSS = require("purgecss").PurgeCSS;
var CleanCSS = require("clean-css");

var CSS_DIR = path.join(__dirname, "..", "public", "css");
var THEMES = ["cyborg", "flatly", "readable", "slate", "solar", "united"];

// PurgeCSS's glob matching needs forward slashes even on Windows.
function toGlobPath(segments) {
  return path.join.apply(path, segments).split(path.sep).join("/");
}

var CONTENT_GLOBS = [
  toGlobPath([__dirname, "..", "views", "**", "*.handlebars"]),
  toGlobPath([__dirname, "..", "public", "js", "scripts.js"]),
  toGlobPath([__dirname, "..", "public", "js", "editScripts.js"]),
  toGlobPath([__dirname, "..", "public", "js", "editor.js"])
];

// Bootstrap 3.3.7's JS plugins toggle these classes at runtime (modal, dropdown,
// collapse, carousel, tooltip/popover, tab, affix, alert, button). They never
// appear as literal text in the templates, so a static content scan can't see
// them; without this safelist PurgeCSS would strip the CSS for every interactive
// state (dropdowns that never open, modals that never fade in, etc).
var BOOTSTRAP_DYNAMIC_CLASSES = [
  "in", "fade", "open", "active", "disabled", "focus",
  "collapse", "collapsing", "collapsed",
  "dropdown-backdrop",
  "modal-open", "modal-backdrop", "modal-scrollable",
  "next", "prev", "left", "right", "top", "bottom",
  "tooltip", "tooltip-inner", "tooltip-arrow",
  "popover", "popover-title", "popover-content", "popover-arrow",
  "affix", "affix-top", "affix-bottom"
];

function purgeAndMinifyTheme(theme) {
  var filePath = path.join(CSS_DIR, theme + ".css");
  var originalSize = fs.statSync(filePath).size;

  return new PurgeCSS().purge({
    content: CONTENT_GLOBS,
    css: [filePath.split(path.sep).join("/")],
    safelist: {
      standard: BOOTSTRAP_DYNAMIC_CLASSES,
      deep: [/^in$/, /^open$/, /^active$/]
    }
  }).then(function(results) {
    var purgedCss = results[0].css;
    var minified = new CleanCSS({ level: 2 }).minify(purgedCss);
    if (minified.errors && minified.errors.length) {
      throw new Error("clean-css failed for " + theme + ": " + minified.errors.join("; "));
    }
    fs.writeFileSync(filePath, minified.styles + "\n");
    var newSize = fs.statSync(filePath).size;
    console.log(
      theme + ".css: " +
      Math.round(originalSize / 1024) + " KB -> " +
      Math.round(newSize / 1024) + " KB (" +
      Math.round((1 - newSize / originalSize) * 100) + "% smaller)"
    );
  });
}

Promise.all(THEMES.map(purgeAndMinifyTheme)).then(function() {
  console.log("Done.");
}).catch(function(err) {
  console.error("CSS build failed:", err);
  process.exit(1);
});
