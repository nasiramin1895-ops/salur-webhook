const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Tetapan Rahsia
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TOYYIBPAY_SECRET_KEY = process.env.TOYYIBPAY_SECRET_KEY; 

// Kategori kod yang anda berikan
const CATEGORY_CODE = "8h4pisjz"; 

// 1️⃣ PINTU MENERIMA BAYARAN (WEBHOOK - KALIS GET & POST)
app.all("/webhook", async (req, res) => {
  try {
    // Gabungkan data daripada Body (POST) dan Query (GET)
    const data = { ...req.query, ...req.body };
    console.log("\n📩 Mesej Masuk Dari ToyyibPay (Full Data):", data);

    const status = data.status_id || data.status;

    if (status === "1" || status === 1) {
      const orderId = data.order_id || data.billcode || "Tiada ID";
      const refNo = data.refno || data.transaction_id || "Tiada Ref";
      const amount = data.transaction_amount || data.amount || "0.00";
      
      // 🧮 PENGIRAAN BAHARU: Tolak caj FPX RM1.00 ToyyibPay
      const profit = (parseFloat(amount) - 1.00).toFixed(2);

      const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      const message = `💰 *BAYARAN SEBENAR BERJAYA! (Auto-Billing)*\n\n` +
                      `🏢 *Order ID:* ${orderId}\n` +
                      `📄 *Ref No:* ${refNo}\n` +
                      `💵 *Jumlah Bayaran:* RM ${amount}\n` +
                      `✨ *Net Profit (Tolak RM1):* *RM ${profit}*\n` +
                      `🚀 *Status:* Berjaya diproses oleh Salur Cloud!`;

      await axios.post(telegramUrl, {
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "Markdown"
      });

      console.log("✅ Notifikasi Telegram Berjaya Dihantar!");
    } else {
      console.log("⚠️ Status bayaran bukan '1'. Status diterima:", status);
    }
    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Ralat Webhook:", error.message);
    res.status(500).send("Error");
  }
});

// 2️⃣ PINTU CIPTA BIL AUTOMATIK
app.get("/bayar", async (req, res) => {
  try {
    const formData = new URLSearchParams();
    formData.append("userSecretKey", TOYYIBPAY_SECRET_KEY);
    formData.append("categoryCode", CATEGORY_CODE);
    formData.append("billName", "Sistem Salur (Ujian)");
    formData.append("billDescription", "Bayaran Ujian Auto-Billing Mr MNA");
    formData.append("billPriceSetting", "1");
    formData.append("billPayorInfo", "0");
    formData.append("billAmount", "100"); // RM1.00 (Dalam sen)
    formData.append("billReturnUrl", "https://t.me/BOTA_ANDA");
    
    // Callback URL (Webhook Render)
    formData.append("billCallbackUrl", "https://salur-webhook.onrender.com/webhook");
    
    formData.append("billExternalReferenceNo", "SALUR-" + Date.now());
    formData.append("billTo", "Pelanggan");
    formData.append("billEmail", "tiada@email.com");
    formData.append("billPhone", "0000000000");

    const response = await axios.post("https://toyyibpay.com/index.php/api/createBill", formData);

    if (response.data && response.data.length > 0) {
      const billCode = response.data[0].BillCode;
      const paymentUrl = `https://toyyibpay.com/${billCode}`;
      res.redirect(paymentUrl);
    } else {
      res.send("Gagal mencipta bil ToyyibPay.");
    }
  } catch (error) {
    console.error("❌ Ralat Cipta Bil:", error.message);
    res.send("Sistem ralat ketika mencipta bil.");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Salur Cloud Webhook aktif di port ${PORT}`);
});
