// Mengubah keputusan menjadi daftar pesan WhatsApp: satu untuk pasien, satu untuk admin.
const cfg = $('Pengaturan').first().json;
const k = $input.first().json;

const adminRapi = String(cfg.nomor_admin ?? '').replace(/\D/g, '');
const kiriman = [];
if (k.pesan_pasien) kiriman.push({ jenis: 'pasien', target: k.nomor, message: k.pesan_pasien });
if (k.pesan_admin && adminRapi.length >= 9) kiriman.push({ jenis: 'admin', target: adminRapi, message: k.pesan_admin });

const dasar = {
  nomor: k.nomor,
  pesan_pasien: k.pesan_pasien || '',
  log: k.log,
  ada_kiriman: kiriman.length > 0,
};
if (kiriman.length === 0) return [{ json: { ...dasar, jenis: '', target: '', message: '' } }];
return kiriman.map(x => ({ json: { ...dasar, ...x } }));
