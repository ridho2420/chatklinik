const fs = require('fs');
const path = require('path');
// Menjalankan kode sebuah node seperti n8n: `nodes` = hasil node lain, `input` = item masuk.
function jalankan(file, { nodes = {}, input = [], tidakJalan = [] } = {}) {
  const kode = fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
  const bungkus = arr => arr.map(j => ({ json: j }));
  const $ = nama => {
    if (tidakJalan.includes(nama)) return { isExecuted: false, first() { throw new Error('node belum jalan: ' + nama); }, all() { throw new Error('node belum jalan: ' + nama); } };
    if (!(nama in nodes)) throw new Error('node tidak dikenal di tes: ' + nama);
    const items = bungkus(nodes[nama]);
    return { isExecuted: true, first: () => items[0], all: () => items };
  };
  const $input = { first: () => bungkus(input)[0], all: () => bungkus(input) };
  const fn = new Function('$', '$input', kode);
  return fn($, $input).map(i => i.json);
}
module.exports = { jalankan };
