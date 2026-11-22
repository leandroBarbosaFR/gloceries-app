#!/usr/bin/env node
/**
 * Composes App Store screenshots (6.9" iPhone, 1320 × 2868 px) from raw simulator captures.
 * Usage: node store/compose-screenshots.mjs   (requires Google Chrome; raw captures in store/screenshots/raw/<fr|en>)
 * Raw captures come from the screenshot-mode build: see store/README.md.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WIDTH = 1320;
const HEIGHT = 2868;

const SLIDES = {
  fr: [
    { file: '1-list', title: 'Une liste partagée<br>par <em>toute la famille</em>', subtitle: 'Synchronisée en temps réel, même hors ligne.' },
    {
      file: '2-store',
      title: '<em>Psst !</em> Un rappel<br>près du magasin',
      subtitle: 'Une seule notification, avec ce qu’il reste à acheter.',
      notification: {
        app: 'PSST!',
        when: 'maintenant',
        title: 'Psst ! Marché Frais Bastille est tout près',
        body: '5 articles à acheter : Lait demi-écrémé (×2), Pain complet, Œufs bio et 2 autres.',
      },
    },
    { file: '3-stores', title: 'Vos supermarchés,<br><em>à portée de main</em>', subtitle: 'Itinéraire avec Plans, Google Maps ou Waze.' },
    { file: '4-settings', title: 'Votre position reste<br><em>sur votre iPhone</em>', subtitle: 'Rappels facultatifs, réglables à tout moment. Sans publicité.' },
  ],
  en: [
    { file: '1-list', title: 'One shared list<br>for <em>the whole family</em>', subtitle: 'Synced in real time, even offline.' },
    {
      file: '2-store',
      title: '<em>Psst!</em> A reminder<br>near the store',
      subtitle: 'One notification with everything left to buy.',
      notification: {
        app: 'PSST!',
        when: 'now',
        title: 'Psst! Fresh Market Camden is nearby',
        body: '5 items to buy: Semi-skimmed milk (×2), Wholemeal bread, Free-range eggs and 2 more.',
      },
    },
    { file: '3-stores', title: 'Your supermarkets,<br><em>close at hand</em>', subtitle: 'Directions with Apple Maps, Google Maps or Waze.' },
    { file: '4-settings', title: 'Your location stays<br><em>on your iPhone</em>', subtitle: 'Optional reminders you control. No ads.' },
  ],
  pt: [
    { file: '1-list', title: 'Uma lista compartilhada<br>com <em>toda a família</em>', subtitle: 'Sincronizada em tempo real, até offline.' },
    {
      file: '2-store',
      title: '<em>Psst!</em> Um lembrete<br>perto do mercado',
      subtitle: 'Uma única notificação com o que falta comprar.',
      notification: {
        app: 'PSST!',
        when: 'agora',
        title: 'Psst! Mercado Fresco Pinheiros está pertinho',
        body: '5 itens para comprar: Leite integral (×2), Pão de forma, Ovos caipiras e mais 2.',
      },
    },
    { file: '3-stores', title: 'Seus supermercados<br><em>ao seu alcance</em>', subtitle: 'Rotas com Apple Maps, Google Maps ou Waze.' },
    { file: '4-settings', title: 'Sua localização fica<br><em>no seu iPhone</em>', subtitle: 'Lembretes opcionais, do seu jeito. Sem anúncios.' },
  ],
};

function page(slide, rawDir) {
  const shot = `file://${join(rawDir, `${slide.file}.png`)}`;
  const icon = `file://${join(root, 'assets/icon.png')}`;
  const notification = slide.notification
    ? `<div class="notif">
         <img class="notif-icon" src="${icon}">
         <div class="notif-text">
           <div class="notif-head"><span>${slide.notification.app}</span><span>${slide.notification.when}</span></div>
           <div class="notif-title">${slide.notification.title}</div>
           <div class="notif-body">${slide.notification.body}</div>
         </div>
       </div>`
    : '';
  return `<!doctype html><html lang="${slide.lang}"><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
    body {
      font-family: -apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif;
      background: radial-gradient(1200px 900px at 20% 0%, #DCEBE0 0%, rgba(220,235,224,0) 70%),
                  linear-gradient(180deg, #EEF4EF 0%, #FAF8F3 55%, #F3EFE5 100%);
      color: #1D2A23; position: relative;
    }
    .caption { position: absolute; top: 150px; left: 100px; right: 100px; text-align: center; }
    h1 { font-size: 96px; line-height: 1.06; font-weight: 800; letter-spacing: -2px; }
    h1 em { font-style: normal; color: #2F6B4F; }
    p { margin-top: 34px; font-size: 46px; line-height: 1.3; color: #55645B; font-weight: 500; }
    .device {
      position: absolute; left: 50%; top: 640px; transform: translateX(-50%);
      width: 1010px; padding: 18px; border-radius: 150px; background: #1D2A23;
      box-shadow: 0 60px 120px rgba(29, 42, 35, 0.28), 0 0 0 3px #3a4a41 inset;
    }
    .device img { display: block; width: 100%; border-radius: 134px; }
    .notif {
      position: absolute; left: 50%; top: 830px; transform: translateX(-50%); width: 1080px;
      display: flex; gap: 32px; align-items: flex-start; padding: 36px 40px;
      background: rgba(255, 255, 255, 0.94); border-radius: 56px;
      box-shadow: 0 40px 90px rgba(29, 42, 35, 0.30); backdrop-filter: blur(20px);
    }
    .notif-icon { width: 112px; height: 112px; border-radius: 26px; flex-shrink: 0; }
    .notif-text { flex: 1; }
    .notif-head { display: flex; justify-content: space-between; font-size: 30px; color: #6F7C74; font-weight: 600; letter-spacing: 0.5px; }
    .notif-title { margin-top: 8px; font-size: 40px; font-weight: 700; line-height: 1.2; }
    .notif-body { margin-top: 6px; font-size: 38px; line-height: 1.3; color: #1D2A23; }
  </style></head><body>
    <div class="caption"><h1>${slide.title}</h1><p>${slide.subtitle}</p></div>
    <div class="device"><img src="${shot}"></div>
    ${notification}
  </body></html>`;
}

for (const [lang, slides] of Object.entries(SLIDES)) {
  const rawDir = join(root, 'store/screenshots/raw', lang);
  const outDir = join(root, 'store/screenshots/iphone-6.9', lang);
  mkdirSync(outDir, { recursive: true });
  for (const slide of slides) {
    const raw = join(rawDir, `${slide.file}.png`);
    if (!existsSync(raw)) throw new Error(`Missing raw capture: ${raw}`);
    const htmlPath = join(outDir, `.${slide.file}.html`);
    writeFileSync(htmlPath, page({ ...slide, lang }, rawDir));
    const output = join(outDir, `${slide.file}.png`);
    execFileSync(chrome, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      '--allow-file-access-from-files', '--default-background-color=FAF8F3FF',
      `--window-size=${WIDTH},${HEIGHT}`, `--screenshot=${output}`, `file://${htmlPath}`,
    ], { stdio: 'ignore' });
    execFileSync('rm', [htmlPath]);
    console.log(`✔ ${output}`);
  }
}
