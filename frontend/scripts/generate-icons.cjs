const sharp = require('sharp');
const path = require('path');

const src = path.join(__dirname, '..', 'public', 'logo.png');
const outDir = path.join(__dirname, '..', 'public');

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

// Logo contenido dentro de un cuadrado, fondo transparente (favicon).
async function makeContained(size, name) {
  const out = path.join(outDir, name);
  await sharp(src)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(out);
  console.log('Wrote', out);
}

// Logo centrado con padding sobre un fondo sólido (para maskable / apple).
async function makePadded(size, name, background, paddingRatio) {
  const pad = Math.round(size * paddingRatio);
  const logoSize = size - pad * 2;
  const logo = await sharp(src)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const out = path.join(outDir, name);
  await sharp({
    create: {
      width: size,
      height: size,
      channels: background.alpha === 1 ? 3 : 4,
      background,
    },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(out);
  console.log('Wrote', out);
}

(async () => {
  // Iconos "any maskable": logo rojo + texto negro sobre fondo blanco sólido.
  // Padding del 22% para que el logo quede dentro de la zona segura de las
  // máscaras circulares/cuadradas de Android (sin cortarse).
  await makePadded(192, 'icon-192.png', WHITE, 0.22);
  await makePadded(512, 'icon-512.png', WHITE, 0.22);

  // Apple touch icon (180x180, opaco, fondo blanco)
  await makePadded(180, 'apple-touch-icon.png', WHITE, 0.12);

  // Favicon (fondo transparente, sin padding) para la pestaña del navegador.
  await makeContained(48, 'favicon.png');
})();
