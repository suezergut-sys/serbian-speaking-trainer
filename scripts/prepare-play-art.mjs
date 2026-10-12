// Deterministic HTML exports of the existing brand, captured at Console's sizes.
// This never replaces the app logo or generates an alternative identity.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
const root = new URL("../", import.meta.url);
const output = new URL("artifacts/google-play/", root);
mkdirSync(output, { recursive: true });
const logo = `data:image/png;base64,${readFileSync(new URL("frontend/src/assets/app-logo.png", root)).toString("base64")}`;
writeFileSync(new URL("icon.html", output), `<html><head><meta charset="utf-8"><style>html,body{margin:0;width:512px;height:512px;background:#fff}img{display:block;width:512px;height:512px;image-rendering:auto}</style></head><body><img src="${logo}" alt="SerboTalk"></body></html>`);
writeFileSync(new URL("feature.html", output), `<html><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:1024px;height:500px}body{font-family:Segoe UI,Arial,sans-serif;color:#eaf2ff;background:radial-gradient(ellipse at 80% 20%,#123b6d,#020914 70%);display:flex;align-items:center;padding:72px;gap:48px}.mark{width:184px;height:184px;border-radius:36px}.name{font-size:72px;font-weight:700;letter-spacing:-3px;line-height:1.1;margin:0}.name span{color:#40a4ff}p{font-size:28px;color:#88a6d2;line-height:1.45;margin:24px 0 0}.line{width:72px;height:4px;background:#45d6ff;margin-bottom:32px}</style></head><body><img class="mark" src="${logo}" alt=""><div><div class="line"></div><h1 class="name">Serbo<span>Talk</span></h1><p>Практика разговорного<br>сербского языка</p></div></body></html>`);
console.log("Prepared artifacts/google-play/icon.html (512×512), feature.html (1024×500).");
