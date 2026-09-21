const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Tetapan Rahsia
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TOYYIBPAY_SECRET_KEY = process.env.TOYYIBPAY_SECRET_KEY; 

// Kategori kod yang anda berikan tadi
const CATEGORY_CODE = "8h4pisjz"; 

// 1️⃣ PINTU MENERIMA BAYARAN (WEBHOOK)
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;
    console.log("\n📩 Mesej Masuk Dari ToyyibPay:", data);

    if (data.status_id === "1" || data.status_id === 1) {
      const orderId = data.order_id || "Tiada ID";
      const refNo = data.refno || "Tiada Ref";
      const amount = data.transaction_amount || "0.00";
      const profit = (parseFloat(amount) * 0.95).toFixed(2);

      const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      const message = `💰 *BAYARAN SEBENAR BERJAYA! (Auto-Billing)*\n\n` +
                      `🏢 *Order ID:* ${orderId}\n` +
                      `📄 *Ref No:* ${refNo}\n` +
                      `💵 *Jumlah Jualan:* RM ${amount}\n` +
                      `✨ *Net Profit (95%):* *RM ${profit}*\n` +
                      `🚀 *Status:* Berjaya diproses oleh Salur Cloud!`;

      await axios.post(telegramUrl, {
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "Markdown"
      });

      console.log("✅ Notifikasi Telegram Berjaya Dihantar!");
    }
    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Ralat Webhook:", error.message);
    res.status(500).send("Error");
  }
});

// 2️⃣ PINTU CIPTA BIL AUTOMATIK (FUNGSI BAHARU!)
app.get("/bayar", async (req, res) => {
  try {
    const formData = new URLSearchParams();
    formData.append("userSecretKey", TOYYIBPAY_SECRET_KEY);
    formData.append("categoryCode", CATEGORY_CODE);
    formData.append("billName", "Sistem Salur (Ujian)");
    formData.append("billDescription", "Bayaran Ujian Auto-Billing Mr MNA");
    formData.append("billPriceSetting", "1");
    formData.append("billPayorInfo", "0");
    formData.append("billAmount", "100"); // RM1.00 (Dalam nilai sen)
    formData.append("billReturnUrl", "https://t.me/BOTA_ANDA"); // Arahkan pelanggan ke Telegram selepas bayar
    
    // ⚡ INILAH DIA CALLBACK URL YANG DISEMBUNYIKAN! ⚡
    formData.append("billCallbackUrl", "https://salur-webhook.onrender.com/webhook");
    
    formData.append("billExternalReferenceNo", "SALUR-" + Date.now()); // Order ID unik
    formData.append("billTo", "Pelanggan Salur");
    formData.append("billEmail", "test@salur.my");
    formData.append("billPhone", "0123456789");

    const response = await axios.post("https://toyyibpay.com/index.php/api/createBill", formData);

    if (response.data && response.data.length > 0) {
      const billCode = response.data[0].BillCode;
      const paymentUrl = `https://toyyibpay.com/${billCode}`;
      
      // Bawa pelanggan terus ke skrin pembayaran ToyyibPay
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
