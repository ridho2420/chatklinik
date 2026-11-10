// Merapikan data dari Fonnte supaya node berikutnya memakai nama field yang sama.
const cfg = $('Pengaturan').first().json;
const body = $('Webhook Fonnte').first().json.body || {};

function nomorRapi(n) {
  let d = String(n ?? '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return d;
}
function polos(t) {
  return String(t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function keMenit(jam) {
  const [h, m] = String(jam ?? '').split(/[:.]/).map(Number);
  return (h || 0) * 60 + (m || 0);
}

const pengirimAsli = String(body.sender ?? body.pengirim ?? '');
const nomor = nomorRapi(pengirimAsli);
let pesan = String(body.message ?? body.pesan ?? '').trim();
const nama = String(body.name ?? body.nama ?? '').trim();

// Foto, dokumen, atau pesan suara: bot tidak bisa menilainya, jadi nanti diteruskan ke admin.
const adaLampiran = Boolean(body.url || body.filename || body.extension);
const media = adaLampiran || /^non-?text message$/i.test(pesan);
if (/^non-?text message$/i.test(pesan)) pesan = '';

const dariGrup = body.isgroup === true || body.isgroup === 'true'
  || /@g\.us|-/.test(pengirimAsli);

let abaikan = false;
let alasan_abaikan = '';
if (dariGrup) { abaikan = true; alasan_abaikan = 'pesan grup'; }
else if (nomor.length < 9) { abaikan = true; alasan_abaikan = 'nomor pengirim tidak terbaca'; }
else if (!pesan && !media) { abaikan = true; alasan_abaikan = 'pesan kosong'; }
   else if (nomor === nomorRapi(cfg.nomor_admin)) { abaikan = true; alasan_abaikan = 'pesan dari admin'; }

// Jam sekarang menurut WIB, apa pun zona waktu servernya.
const jamWib = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date());
const menit = keMenit(jamWib);
const luar_jam = menit < keMenit(cfg.jam_buka) || menit >= keMenit(cfg.jam_tutup);

// Chat dari iklan dikenali dari kalimat pembuka yang terisi otomatis.
const kalimat = polos(cfg.kalimat_iklan);
const dari_iklan = kalimat.length > 0 && polos(pesan).includes(kalimat);

return [{
  json: {
    nomor, nama, pesan, media,
           id_pesan: (body.inboxid && String(body.inboxid) !== '0')
         ? String(body.inboxid)
         : (body.timestamp ? `${nomor}-${body.timestamp}` : ''),
    abaikan, alasan_abaikan,
    jam_wib: jamWib, luar_jam, dari_iklan,
  },
}];
