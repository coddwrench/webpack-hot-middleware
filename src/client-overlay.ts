/*eslint-env browser*/

const clientOverlay = document.createElement("div");
clientOverlay.id = "webpack-hot-middleware-clientOverlay";
const styles: { [key: string]: string | number } = {
  background: "rgba(0,0,0,0.85)",
  color: "#e8e8e8",
  lineHeight: "1.6",
  whiteSpace: "pre",
  fontFamily: "Menlo, Consolas, monospace",
  fontSize: "13px",
  position: "fixed",
  zIndex: 9999,
  padding: "10px",
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  overflow: "auto",
  dir: "ltr",
  textAlign: "left",
};

const ansiHTML = require("ansi-html");
const colors: { [key: string]: string | Array<string> } = {
  reset: ["transparent", "transparent"],
  black: "181818",
  red: "ff3348",
  green: "3fff4f",
  yellow: "ffd30e",
  blue: "169be0",
  magenta: "f840b7",
  cyan: "0ad8e9",
  lightgrey: "ebe7e3",
  darkgrey: "6d7891",
};

const htmlEntities = require("html-entities");

function showProblems(type: string, lines: Array<string>) {
  clientOverlay.innerHTML = "";
  lines.forEach(function (msg: string) {
    msg = ansiHTML(htmlEntities.encode(msg));
    const div = document.createElement("div");
    div.style.marginBottom = "26px";
    div.innerHTML = problemType(type) + " in " + msg;
    clientOverlay.appendChild(div);
  });
  if (document.body) {
    document.body.appendChild(clientOverlay);
  }
}

function clear() {
  if (document.body && clientOverlay.parentNode) {
    document.body.removeChild(clientOverlay);
  }
}

function problemType(type: string) {
  const problemColors: { [key: string]: string } = {
    errors: colors.red as string,
    warnings: colors.yellow as string,
  };
  const color = problemColors[type] || colors.red;
  return (
    '<span style="background-color:#' +
    color +
    '; color:#000000; padding:3px 6px; border-radius: 4px;">' +
    type.slice(0, -1).toUpperCase() +
    "</span>"
  );
}

module.exports = function (options: { ansiColors: { [key: string]: string }, overlayStyles: { [key: string]: string } }) {
  for (const color in options.ansiColors) {
    if (color in colors) {
      colors[color] = options.ansiColors[color];
    }
    ansiHTML.setColors(colors);
  }

  for (const style in options.overlayStyles) {
    styles[style] = options.overlayStyles[style];
  }

  for (const key in styles) {
    (clientOverlay.style as any)[key] = styles[key];
  }

  return {
    showProblems: showProblems,
    clear: clear,
  };
};

module.exports.clear = clear;
module.exports.showProblems = showProblems;
