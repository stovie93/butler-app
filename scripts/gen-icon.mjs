// Generates the Butler app icon set from a single robot/butler glyph.
// Run: node scripts/gen-icon.mjs   (requires the dev dependency `sharp`)
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");

const BG = "#0e1116";
const ACCENT = "#4f8cff";
const EYE = "#0e1116";

// Robot/butler head, drawn centered around (512,512) in a 1024 box.
function glyph(headColor, eyeColor) {
  return `
    <line x1="512" y1="300" x2="512" y2="236" stroke="${headColor}" stroke-width="22" stroke-linecap="round"/>
    <circle cx="512" cy="220" r="34" fill="${headColor}"/>
    <rect x="276" y="300" width="472" height="420" rx="74" fill="${headColor}"/>
    <circle cx="416" cy="478" r="58" fill="${eyeColor}"/>
    <circle cx="608" cy="478" r="58" fill="${eyeColor}"/>
    <circle cx="437" cy="458" r="18" fill="#ffffff" opacity="0.85"/>
    <circle cx="629" cy="458" r="18" fill="#ffffff" opacity="0.85"/>
    <path d="M 432 600 Q 512 666 592 600" stroke="${eyeColor}" stroke-width="26" fill="none" stroke-linecap="round"/>
    <path d="M 512 770 L 424 732 L 424 808 Z" fill="${headColor}"/>
    <path d="M 512 770 L 600 732 L 600 808 Z" fill="${headColor}"/>
    <rect x="492" y="752" width="40" height="38" rx="10" fill="${headColor}"/>
  `;
}

function wrap(scale, inner) {
  return `<g transform="translate(512 512) scale(${scale}) translate(-512 -512)">${inner}</g>`;
}

function svgColored({ bg, scale }) {
  const background = bg ? `<rect width="1024" height="1024" rx="0" fill="${bg}"/>` : "";
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${background}${wrap(scale, glyph(ACCENT, EYE))}</svg>`,
  );
}

// Monochrome: white silhouette with eye/smile knocked out, transparent bg.
function svgMono(scale) {
  const maskBody = `
    <line x1="512" y1="300" x2="512" y2="236" stroke="white" stroke-width="22" stroke-linecap="round"/>
    <circle cx="512" cy="220" r="34" fill="white"/>
    <rect x="276" y="300" width="472" height="420" rx="74" fill="white"/>
    <path d="M 512 770 L 424 732 L 424 808 Z" fill="white"/>
    <path d="M 512 770 L 600 732 L 600 808 Z" fill="white"/>
    <rect x="492" y="752" width="40" height="38" rx="10" fill="white"/>
    <circle cx="416" cy="478" r="58" fill="black"/>
    <circle cx="608" cy="478" r="58" fill="black"/>
    <path d="M 432 600 Q 512 666 592 600" stroke="black" stroke-width="26" fill="none" stroke-linecap="round"/>
  `;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
      <defs><mask id="m"><rect width="1024" height="1024" fill="black"/>${wrap(scale, maskBody)}</mask></defs>
      <rect width="1024" height="1024" fill="white" mask="url(#m)"/>
    </svg>`,
  );
}

async function png(svg, size, out) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(join(ASSETS, out));
  console.log("wrote", out);
}

async function solid(color, size, out) {
  await sharp({ create: { width: size, height: size, channels: 4, background: color } })
    .png()
    .toFile(join(ASSETS, out));
  console.log("wrote", out);
}

await png(svgColored({ bg: BG, scale: 0.9 }), 1024, "icon.png");
await png(svgColored({ bg: null, scale: 0.66 }), 1024, "android-icon-foreground.png");
await png(svgColored({ bg: null, scale: 0.52 }), 1024, "splash-icon.png");
await png(svgMono(0.66), 1024, "android-icon-monochrome.png");
await solid(BG, 1024, "android-icon-background.png");
await png(svgColored({ bg: BG, scale: 0.86 }), 48, "favicon.png");
console.log("done");
