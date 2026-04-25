/**
 * Gemini Vision Service
 * อ่านบิล/สลิป/ใบเสร็จ จากรูปภาพ
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { config } = require('../config');
const { getToday, getYesterday } = require('../utils/dateParser');

// ─── Initialize Gemini ─────────────────────────────────
const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

const model = genAI.getGenerativeModel({
  model: 'gemini-2.0-flash',
  generationConfig: {
    responseMimeType: 'application/json',
    temperature: 0.1,
  },
});

/**
 * อ่านข้อมูลจากบิล/สลิป ด้วย Gemini Vision
 * @param {string} imageBase64 - base64 encoded image
 * @param {string} mimeType - image mime type (image/jpeg, image/png, etc)
 * @returns {object} parsed bill data
 */
async function parseBillFromImage(imageBase64, mimeType = 'image/jpeg') {
  try {
    const today = getToday();
    const yesterday = getYesterday();

    const prompt = `คุณเป็นระบบอ่านบิล/ใบเสร็จ/สลิป ภาษาไทย ตอบเป็น JSON เท่านั้น

ข้อมูลที่ต้องอ่าน:
1. "item" - ชื่อรายการหรือชื่อร้านค้า (ถ้าไม่มีให้ใช้ "บิลทั่วไป")
2. "amount" - จำนวนเงินรวม (ตัวเลขเท่านั้น ถ้าไม่มีให้เป็น null)
3. "type" - "รายรับ" หรือ "รายจ่าย" (ดูจากประเภทบิล เช่น ใบเสร็จ/บิล = รายจ่าย, สลิปเงินเดือน/โอนเงินเข้า = รายรับ)
4. "category" - หมวดหมู่: อาหาร, เดินทาง, ที่พัก, ค่าน้ำค่าไฟ, ช้อปปิ้ง, สุขภาพ, การศึกษา, บันเทิง, เงินเดือน, โบนัส, งานเสริม, ขายของ, ของขวัญ, อื่นๆ
5. "date" - วันที่ในบิล (format YYYY-MM-DD ถ้าไม่มีให้ใช้ ${today})
6. "confidence" - ความมั่นใจ 0.0-1.0

กฎ:
- ถ้าเป็นบิลร้านอาหาร/ซูเปอร์มาร์เก็ต/ร้านสะดวกซื้อ → รายจ่าย หมวดอาหาร
- ถ้าเป็นบิลค่าน้ำ/ค่าไฟ/ค่าโทรศัพท์/ค่าเน็ต → รายจ่าย หมวดค่าน้ำค่าไฟ
- ถ้าเป็นบิลค่ารถ/ค่าน้ำมัน/ตั๋ว → รายจ่าย หมวดเดินทาง
- ถ้าเป็นสลิปเงินเดือน/โอนเงินเข้า → รายรับ หมวดเงินเดือน
- ถ้าเป็นใบเสร็จรับเงิน/พ้กเงินสด → รายรับ หมวดอื่นๆ
- ถ้าบิลมี vat หรือ service charge ให้ดึงยอดรวมทั้งหมด ไม่ใช่ยอดย่อย
- ถ้าอ่านไม่ออกให้ confidence = 0.3

JSON schema:
{
  "item": "ชื่อรายการ/ร้าน",
  "amount": 150.00,
  "type": "รายรับ หรือ รายจ่าย",
  "category": "หมวดหมู่",
  "date": "YYYY-MM-DD",
  "confidence": 0.85,
  "missing_fields": []
}`;

    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: imageBase64,
              },
            },
            { text: prompt },
          ],
        },
      ],
    });

    const responseText = result.response.text();
    const parsed = JSON.parse(responseText);
    return parsed;
  } catch (error) {
    console.error('❌ Gemini Vision Error:', error.message);
    return {
      item: 'บิลทั่วไป',
      amount: null,
      type: 'รายจ่าย',
      category: 'อื่นๆ',
      date: getToday(),
      confidence: 0,
      missing_fields: ['amount'],
      error: error.message,
    };
  }
}

module.exports = { parseBillFromImage };
