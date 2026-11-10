// Menyiapkan satu baris untuk sheet Prospek & Booking.
// Aturan: bot hanya MEMAJUKAN status (Tanya-tanya -> Menunggu Konfirmasi).
// Status Batal dan Terkonfirmasi yang diisi admin tidak ditimpa, kecuali pasien Batal mengajukan booking baru.
const chat = $('Cek Pasien Lama').first().json;
const kiriman = $('Susun Kiriman').first().json;
const baris = $('Baca Prospek').all().map(i => i.json);

// Kalau sheet gagal dibaca, jangan menulis apa pun supaya tidak muncul baris ganda.
if (baris.some(b => b && b.error)) return [];

function nomorRapi(n) {
  let d = String(n ?? '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return d;
}
function teks(v) {
  const t = String(v ?? '').trim();
  return /^(null|undefined|-)$/i.test(t) ? '' : t;
}

const sekarang = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
}).format(new Date());

// Label dihitung oleh Google Sheets sendiri, jadi ikut berubah walau workflow tidak berjalan.
const LABEL = '=IF(INDIRECT("E"&ROW())<>"Menunggu Konfirmasi","",IF(INDIRECT("H"&ROW())="","",IF(NOW()-INDIRECT("H"&ROW())>1,"⚠️ Lewat 24 jam","")))';

const ada = baris.find(b => b && b['Nomor WA'] && nomorRapi(b['Nomor WA']) === chat.nomor);
const statusSekarang = ada ? teks(ada.Status) : '';
const log = kiriman.log || {};
const booking = log.booking || {};
const minta = log.tindakan === 'teruskan' && log.alasan === 'booking';
const perawatan = teks(log.perawatan) || teks(booking.perawatan);
const pesan = (chat.pesan || (chat.media ? '(mengirim foto atau berkas)' : '')).slice(0, 300);

// Pasien lama (nomornya sudah ada di sheet Booking): tidak ditambahkan sebagai prospek baru.
// Kalau sebelumnya prospek, statusnya otomatis menjadi Terkonfirmasi.
if (chat.pasien_lama) {
  if (!ada) return [];
  const out = { 'Nomor WA': chat.nomor, 'Terakhir Chat': sekarang, 'Pesan Terakhir': pesan };
  if (['', 'Tanya-tanya', 'Menunggu Konfirmasi'].includes(statusSekarang)) out['Status'] = 'Terkonfirmasi';
  return [{ json: out }];
}

const out = { 'Nomor WA': chat.nomor, 'Terakhir Chat': sekarang, 'Pesan Terakhir': pesan, 'Label': LABEL };
const namaBooking = teks(booking.nama);
const namaChat = teks(chat.nama_di_sheet) || teks(chat.nama);

if (!ada) {
  out['Nama'] = namaBooking || namaChat;
  out['Pertama Chat'] = sekarang;
  out['Perawatan'] = perawatan;
  out['Status'] = minta ? 'Menunggu Konfirmasi' : 'Tanya-tanya';
  if (minta) {
    out['Waktu Diminta'] = teks(booking.waktu);
    out['Diteruskan Pada'] = sekarang;
  }
  return [{ json: out }];
}

if (namaBooking) out['Nama'] = namaBooking;
else if (!teks(ada.Nama) && namaChat) out['Nama'] = namaChat;
if (perawatan) out['Perawatan'] = perawatan;

if (minta && statusSekarang !== 'Terkonfirmasi') {
  if (teks(booking.waktu)) out['Waktu Diminta'] = teks(booking.waktu);
  if (statusSekarang !== 'Menunggu Konfirmasi' || !teks(ada['Diteruskan Pada'])) {
    // Permintaan baru (termasuk dari pasien yang sebelumnya Batal): jam tunggu dimulai dari sekarang.
    out['Status'] = 'Menunggu Konfirmasi';
    out['Diteruskan Pada'] = sekarang;
  }
  // Kalau sudah Menunggu Konfirmasi, jam tunggu tidak di-reset supaya permintaan lama tetap terlihat menggantung.
} else if (!statusSekarang) {
  out['Status'] = 'Tanya-tanya';
}

return [{ json: out }];
