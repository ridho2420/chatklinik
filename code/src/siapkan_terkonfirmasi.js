// Prospek yang nomornya sudah tercatat di sheet Booking dianggap Terkonfirmasi.
// Hanya status Tanya-tanya dan Menunggu Konfirmasi yang diubah. Batal tidak disentuh.
const baris = $('Baca Prospek').all().map(i => i.json);
if (baris.some(b => b && b.error)) return [];
const barisBooking = $('Baca Booking').all().map(i => i.json);

function nomorRapi(n) {
  let d = String(n ?? '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return d;
}
const kolomNomor = /(nomor|no\.?)\s*(hp|wa|telp|telepon|whatsapp)|^hp$|^wa$|whatsapp|telepon/i;
const sudahBooking = new Set();
for (const b of barisBooking) {
  for (const [k, v] of Object.entries(b)) {
    if (kolomNomor.test(k) && nomorRapi(v).length >= 9) sudahBooking.add(nomorRapi(v));
  }
}

return baris
  .filter(b => b && b['Nomor WA'])
  .filter(b => ['Tanya-tanya', 'Menunggu Konfirmasi'].includes(String(b.Status ?? '').trim()))
  .filter(b => sudahBooking.has(nomorRapi(b['Nomor WA'])))
  .map(b => ({ json: { 'Nomor WA': String(b['Nomor WA']), 'Status': 'Terkonfirmasi' } }));
