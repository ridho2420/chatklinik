// Pasien lama = nomornya sudah ada di sheet Booking. Mereka langsung ditangani admin.
const chat = $('Rapikan Pesan').first().json;
const baris = $('Baca Booking').all().map(i => i.json);

function nomorRapi(n) {
  let d = String(n ?? '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return d;
}
const kolomNomor = /(nomor|no\.?)\s*(hp|wa|telp|telepon|whatsapp)|^hp$|^wa$|whatsapp|telepon/i;
const kolomNama = /nama/i;

let pasien_lama = false;
let nama_di_sheet = '';
for (const b of baris) {
  for (const [k, v] of Object.entries(b)) {
    if (!kolomNomor.test(k)) continue;
    if (nomorRapi(v) === chat.nomor) {
      pasien_lama = true;
      const kn = Object.keys(b).find(x => kolomNama.test(x));
      nama_di_sheet = kn ? String(b[kn] ?? '') : '';
    }
  }
  if (pasien_lama) break;
}

return [{ json: { ...chat, pasien_lama, nama_di_sheet } }];
