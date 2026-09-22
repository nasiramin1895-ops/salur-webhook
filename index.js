require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');

// ==========================================
// 1. KONFIGURASI ASAS
// ==========================================
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Untuk terima data Webhook dari ToyyibPay

const PORT = process.env.PORT || 3000;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID; // Letak Chat ID anda untuk terima laporan untung

// Inisialisasi Bot Telegram
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// ==========================================
// 2. KONFIGURASI DATABASE (POSTGRESQL RENDER)
// ==========================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Wajib untuk Render
  }
});

// Auto-Setup Jadual Database jika belum wujud
async function setupDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          telegram_id BIGINT,
          tarikh_daftar TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS access_keys (
          id SERIAL PRIMARY KEY,
          customer_id INT REFERENCES customers(id),
          access_key VARCHAR(255) UNIQUE NOT NULL,
          instance_id VARCHAR(255) UNIQUE NOT NULL,
          pakej VARCHAR(100),
          status VARCHAR(50) DEFAULT 'ACTIVE',
          dicipta_pada TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Database sedia digunakan!");
  } catch (err) {
    console.error("❌ Ralat setup database:", err);
  }
}
setupDatabase();

// ==========================================
// 3. KONFIGURASI E-MEL (NODEMAILER)
// ==========================================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ==========================================
// 4. ARAHAN BOT TELEGRAM (COMMANDS)
// ==========================================

// Arahan /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    `Selamat datang ke Sistem SaaS Kami! 🚀\n\n` +
    `Jika anda terlupa Access Key, anda boleh dapatkannya semula dengan menaip:\n` +
    `/recover e-mel_anda@gmail.com`
  );
});

// Arahan /recover <email>
bot.onText(/\/recover (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const inputEmail = match[1].trim().toLowerCase();

  // Validasi format e-mel
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(inputEmail)) {
    return bot.sendMessage(chatId, "❌ Format e-mel tidak sah. Contoh: `/recover nama@gmail.com`", { parse_mode: 'Markdown' });
  }

  try {
    const queryText = `
      SELECT c.email, a.access_key, a.instance_id, a.pakej 
      FROM customers c
      JOIN access_keys a ON c.id = a.customer_id
      WHERE LOWER(c.email) = $1 AND a.status = 'ACTIVE'
    `;
    const result = await pool.query(queryText, [inputEmail]);

    if (result.rows.length === 0) {
      return bot.sendMessage(chatId, "❌ E-mel tidak dijumpai atau tiada Access Key yang aktif.");
    }

    // Susun maklumat jika ada lebih dari 1 langganan
    let senaraiKeys = "";
    result.rows.forEach((row, index) => {
      senaraiKeys += `\n${index + 1}. Pakej: ${row.pakej || 'Standard'}\n   Instance ID: ${row.instance_id}\n   Access Key: ${row.access_key}\n`;
    });
    
    // Hantar E-mel
    await transporter.sendMail({
      from: `"Sokongan Sistem" <${process.env.EMAIL_USER}>`,
      to: inputEmail,
      subject: 'Pemulihan Access Key Anda',
      text: `Salam,\n\nBerikut adalah maklumat langganan anda yang masih aktif:\n${senaraiKeys}\n\nSila simpan dengan selamat. Terima kasih!`
    });

    // Sembunyikan e-mel untuk mesej Telegram
    const [name, domain] = inputEmail.split('@');
    const maskedEmail = `${name.substring(0, 2)}***@${domain}`;

    bot.sendMessage(chatId, `✅ Berjaya! Maklumat Access Key telah dihantar ke e-mel **${maskedEmail}**. Sila semak *Inbox* atau *Spam*.`, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error("Ralat Recover:", error);
    bot.sendMessage(chatId, "⚠️ Berlaku ralat sistem semasa cuba menghantar e-mel. Sila hubungi admin.");
  }
});


// ==========================================
// 5. SERVER EXPRESS & WEBHOOK TOYYIBPAY
// ==========================================

// Endpoint ujian untuk pastikan server berjalan
app.get('/', (req, res) => {
  res.send('Sistem SaaS & Webhook Beroperasi dengan Cemerlang! 🚀');
});

// Webhook / Callback dari ToyyibPay
app.post('/webhook', async (req, res) => {
  try {
    // 1. Terima data dari ToyyibPay
    // Nota: Sesuaikan 'req.body' ini mengikut payload sebenar yang dihantar sistem / ToyyibPay anda.
    const status_id = req.body.status_id; 
    const order_id = req.body.order_id; // Biasanya kita letak chat_id dalam order_id semasa cipta bil
    const transaction_amount = parseFloat(req.body.amount || req.body.transaction_amount || 0); 
    const billEmail = req.body.billEmail || req.body.email || "tiada_emel@sistem.com"; // Emel pelanggan
    const namaPakej = req.body.pakej || "Pakej Dinamik"; // Dihantar melalui parameter / bil

    // status_id = 1 bermaksud Bayaran Berjaya di ToyyibPay
    if (status_id === '1' || status_id === 1) {
      
      // 2. Auto-Provisioning (Jana Instance ID & Access Key)
      const instanceId = "INST-" + Math.random().toString(36).substring(2, 8).toUpperCase();
      const accessKey = "AK-" + Math.random().toString(36).substring(2, 12).toUpperCase();

      // 3. Simpan ke Database (PostgreSQL)
      // Simpan/Update Pelanggan
      const custResult = await pool.query(`
        INSERT INTO customers (email, telegram_id) 
        VALUES ($1, $2) 
        ON CONFLICT (email) DO UPDATE SET telegram_id = EXCLUDED.telegram_id
        RETURNING id
      `, [billEmail, order_id]);

      const customerId = custResult.rows[0].id;

      // Simpan Access Key
      await pool.query(`
        INSERT INTO access_keys (customer_id, access_key, instance_id, pakej, status) 
        VALUES ($1, $2, $3, $4, 'ACTIVE')
      `, [customerId, accessKey, instanceId, namaPakej]);

      // 4. Hantar Produk ke Pelanggan di Telegram
      const mesejPelanggan = `🎉 *Bayaran Berjaya!*\n\nTerima kasih kerana melanggan ${namaPakej}.\n\n` +
                             `🖥️ *Instance ID:* \`${instanceId}\`\n` +
                             `🔑 *Access Key:* \`${accessKey}\`\n\n` +
                             `Sila simpan maklumat ini. Jika hilang, anda boleh taip /recover ${billEmail}`;
                             
      bot.sendMessage(order_id, mesejPelanggan, { parse_mode: 'Markdown' });

      // 5. Pengiraan Keuntungan & Laporan kepada Admin
      // Tolak RM1.00 (Caj FPX ToyyibPay)
      const untungBersih = transaction_amount - 1.00;

      if (ADMIN_CHAT_ID) {
        const mesejAdmin = `💰 *JUALAN BARU MASUK!*\n\n` +
                           `📦 Pakej: ${namaPakej}\n` +
                           `💵 Bayaran Pelanggan: RM ${transaction_amount.toFixed(2)}\n` +
                           `🏦 Caj FPX: RM 1.00\n` +
                           `✅ *Untung Bersih: RM ${untungBersih.toFixed(2)}*\n\n` +
                           `📧 E-mel: ${billEmail}`;
        
        bot.sendMessage(ADMIN_CHAT_ID, mesejAdmin, { parse_mode: 'Markdown' });
      }

      console.log(`✅ Transaksi Berjaya diproses untuk ${billEmail}`);
      res.status(200).send("OK");

    } else {
      // Bayaran gagal atau pending
      console.log(`⚠️ Status Bayaran Gagal/Pending: ${status_id}`);
      res.status(400).send("Bayaran tidak berjaya");
    }
    
  } catch (err) {
    console.error("❌ Ralat pada Webhook:", err);
    res.status(500).send("Internal Server Error");
  }
});

// Mulakan Server
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di port ${PORT}`);
});
