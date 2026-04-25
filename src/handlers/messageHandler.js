const { parseExpenseMessage } = require('../services/geminiService');
const { parseBillFromImage } = require('../services/geminiVisionService');
const { appendTransaction, getTransactions } = require('../services/transactionService');
const {
  GENERAL_RESPONSES,
  generateConfirmQuickReply,
  generateFlexSummary,
  generateMissingFieldReply,
  generateTransactionFlex,
  isAnalysisRequest,
  isGreeting,
  isHelpRequest,
  parseSummaryPeriod,
} = require('../messages');
const { shouldAutoSaveTransaction } = require('../utils/transactionRules');
const { clearPending, getPending, setPending } = require('../state/pendingConfirmations');

const CONFIRM_YES = ['ใช่', 'yes', 'ใช่ครับ', 'ใช่ค่ะ', 'ตกลง', 'ok', 'โอเค', 'ได้', 'บันทึก', 'ถูก', 'ถูกต้อง', '✅', '👍'];
const CONFIRM_NO = ['ไม่', 'no', 'ไม่ใช่', 'ไม่ถูก', 'ผิด', 'ยกเลิก', 'cancel', '❌', '👎'];

/**
 * Main entry point for all messages (text or image)
 * @param {string|null} userId - LINE user ID
 * @param {string|null} userMessage - text message (null if image)
 * @param {object|null} extra - extra data (e.g., image data)
 */
async function handleTextMessage(userId, userMessage, extra = null) {
  // ─── Image handling ───────────────────────────────
  if (extra && extra.type === 'image') {
    return handleImageMessage(userId, extra);
  }

  const pendingReply = await handlePendingConfirmation(userId, userMessage);
  if (pendingReply) return pendingReply;

  if (isGreeting(userMessage)) {
    return GENERAL_RESPONSES.greeting;
  }

  if (isHelpRequest(userMessage)) {
    return GENERAL_RESPONSES.help;
  }

  if (isAnalysisRequest(userMessage)) {
    return buildSummaryReply(userId, userMessage);
  }

  if (userMessage.length < 2) {
    return GENERAL_RESPONSES.help;
  }

  try {
    console.log(`📩 [${userId || 'unknown'}] "${userMessage}"`);
    const parsed = await parseExpenseMessage(userMessage);
    console.log('🤖 Gemini:', JSON.stringify(parsed));

    if (parsed.missing_fields && parsed.missing_fields.length > 0) {
      return generateMissingFieldReply(parsed.missing_fields, parsed);
    }

    const transactionData = toTransactionData(parsed);
    if (shouldAutoSaveTransaction(parsed, userMessage)) {
      return saveAndBuildReply(transactionData, userId);
    }

    if (userId) {
      setPending(userId, transactionData);
    }

    return generateConfirmQuickReply(transactionData);
  } catch (error) {
    console.error('❌ Error handling message:', error);
    return GENERAL_RESPONSES.error;
  }
}

/**
 * Handle image message (bill/receipt/slip)
 */
async function handleImageMessage(userId, imageData) {
  try {
    console.log(`🖼️  [${userId || 'unknown'}] Processing image...`);

    const parsed = await parseBillFromImage(imageData.imageBase64, imageData.mimeType);
    console.log('🤖 Gemini Vision:', JSON.stringify(parsed));

    // ถ้าอ่านบิลไม่ได้
    if (parsed.confidence === 0 || !parsed.item) {
      return {
        type: 'text',
        text: 'อ่านบิลไม่ได้ครับ 🙏 ลองถ่ายรูปใหม่ให้ชัดขึ้น หรือพิมพ์รายการมาได้เลย เช่น "กินข้าว 80"',
      };
    }

    // ถ้าไม่มี amount ให้ถาม
    if (parsed.amount === null || parsed.amount === undefined) {
      return {
        type: 'text',
        text: `📋 อ่านบิลได้แล้วครับ:\n\n🏪 รายการ: ${parsed.item}\n📅 วันที่: ${parsed.date}\n\nแต่ไม่เจอจำนวนเงินครับ — พิมพ์จำนวนเงินมาได้เลย เช่น "150" หรือ "บันทึก 150 บาท"`,
      };
    }

    const transactionData = toTransactionData(parsed);

    // ถ้า confidence สูง → บันทึกเลย
    if (parsed.confidence >= 0.7) {
      return saveAndBuildReply(transactionData, userId);
    }

    // confidence ต่ำ → ถามยืนยันก่อน
    if (userId) {
      setPending(userId, transactionData);
    }

    return generateConfirmQuickReply(transactionData);
  } catch (error) {
    console.error('❌ Image handle error:', error);
    return GENERAL_RESPONSES.error;
  }
}

async function handlePendingConfirmation(userId, userMessage) {
  if (!userId) return null;

  const pendingData = getPending(userId);
  if (!pendingData) return null;

  const normalizedMessage = userMessage.toLowerCase().trim();

  if (CONFIRM_YES.some((word) => normalizedMessage === word)) {
    clearPending(userId);
    return saveAndBuildReply(pendingData, userId);
  }

  if (CONFIRM_NO.some((word) => normalizedMessage === word)) {
    clearPending(userId);
    return 'ยกเลิกแล้วครับ ถ้าจะบันทึกใหม่ พิมพ์รายการมาได้เลย';
  }

  clearPending(userId);
  return null;
}

async function buildSummaryReply(userId, userMessage) {
  try {
    const { dateFrom, dateTo, label } = parseSummaryPeriod(userMessage);
    console.log(`📊 วิเคราะห์ ${label}: ${dateFrom} → ${dateTo}`);

    const rows = await getTransactions(userId, dateFrom, dateTo);
    if (rows === null) return GENERAL_RESPONSES.error;

    return generateFlexSummary(rows, label) || GENERAL_RESPONSES.noData;
  } catch (error) {
    console.error('❌ Analysis error:', error);
    return GENERAL_RESPONSES.error;
  }
}

async function saveAndBuildReply(transactionData, userId) {
  const result = await appendTransaction(transactionData, userId);
  if (result.success) {
    return generateTransactionFlex(transactionData);
  }

  console.error('❌ บันทึกไม่สำเร็จ:', result.error);
  return GENERAL_RESPONSES.error;
}

function toTransactionData(parsed) {
  return {
    item: parsed.item,
    amount: parsed.amount,
    category: parsed.category,
    type: parsed.type,
    date: parsed.date,
  };
}

module.exports = {
  handleTextMessage,
};
