// Menyiapkan satu baris catatan untuk Supabase: apa yang dilakukan bot terhadap chat ini.
const kiriman = $('Susun Kiriman').all().map(i => i.json);
const k = kiriman[0];

// Balasan dianggap terkirim kalau Fonnte tidak melaporkan gagal untuk pesan ke pasien.
let terkirim = false;
if (k.ada_kiriman && $('Kirim WhatsApp').isExecuted) {
  const hasil = $('Kirim WhatsApp').all().map(i => i.json);
  const urutanPasien = kiriman.findIndex(x => x.jenis === 'pasien');
  if (urutanPasien !== -1) {
    const h = hasil[urutanPasien] || {};
    terkirim = !h.error && h.status !== false && h.status !== 'false';
  }
}

return [{ json: {
  p_nomor: k.nomor,
  p_pesan_pasien: k.pesan_pasien || null,
  p_tindakan: k.log.tindakan,
  p_alasan: k.log.alasan,
  p_topik: k.log.topik,
  p_booking: k.log.booking,
  p_terkirim: terkirim,
} }];
