# Anonymous Group Chat

Aplikasi web obrolan anonim real-time (Node.js, Express, WebSocket, React, Tailwind CSS).

## 🚀 Fitur
- **100% Anonim**: Tanpa registrasi, tanpa email, tanpa database (pesan hanya di RAM server).
- **Profil Warna**: Setiap peserta memiliki lingkaran warna profil yang unik.
- **Pesan Suara & Foto**: Mendukung kirim teks, rekaman suara, dan gambar dengan preview aman.
- **Real-time Live**: Menggunakan WebSocket dengan sinkronisasi instan dan indikator mengetik.

---

## 🛠️ Cara Menjalankan Secara Lokal
```bash
# 1. Install dependensi
npm install

# 2. Jalankan server dev
npm run dev

# Buka http://localhost:3000 di browser
```

---

## 🌐 Cara Deploy ke Cloud (Render.com / Railway)

1. **Upload ke GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<username-kamu>/<nama-repo>.git
   git push -u origin main
   ```

2. **Hubungkan ke Render.com (Gratis):**
   - Buka **[Render.com](https://render.com)** dan buat akun.
   - Pilih **New +** > **Web Service**.
   - Hubungkan ke repository GitHub kamu.
   - Atur pengaturan:
     - **Environment:** `Node`
     - **Build Command:** `npm install && npm run build`
     - **Start Command:** `npm run start`
   - Klik **Deploy Web Service**.
