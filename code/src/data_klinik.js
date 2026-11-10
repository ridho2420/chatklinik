// Membaca salinan Data Klinik dari data table "Salinan Data Klinik" (diisi workflow Klinik - Perbarui Salinan Data).
// ada = true kalau keempat tab tersedia dan salinannya belum lebih dari 6 jam. Kalau false, workflow membaca Google Sheets langsung.
const baris = $input.all().map(i => i.json).filter(r => r && r.tab);
const out = { ada: false };
let tertua = Infinity;
for (const r of baris) {
  try {
    const isi = JSON.parse(r.isi || '[]');
    if (Array.isArray(isi)) out[r.tab] = isi;
  } catch (e) {
    // baris rusak diabaikan
  }
  const t = Date.parse(r.diperbarui);
  if (Number.isFinite(t)) tertua = Math.min(tertua, t);
}
const lengkap = Array.isArray(out.harga) && out.harga.length > 0
  && ['jadwal', 'promo', 'info'].every(t => Array.isArray(out[t]));
const segar = Number.isFinite(tertua) && Date.now() - tertua < 6 * 3600000;
out.ada = lengkap && segar;
out.diperbarui = Number.isFinite(tertua) ? new Date(tertua).toISOString() : '';
return [{ json: out }];
