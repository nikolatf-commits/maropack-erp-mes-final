import QRCode from "qrcode";

export async function generateQR(text) {
  try {
    return await QRCode.toDataURL(String(text || "MAROPACK"), {
      width: 180,
      margin: 1,
    });
  } catch (err) {
    console.error("QR greška:", err);
    return "";
  }
}
