/**
 * LINE Service
 * รับ event จาก LINE แล้วส่งต่อให้ message handler
 */
const line = require('@line/bot-sdk');
const { config } = require('../config');
const { handleTextMessage } = require('../handlers/messageHandler');
const { GENERAL_RESPONSES } = require('../messages');

const lineClient = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.line.channelAccessToken,
});

async function handleEvent(event) {
  if (event.type !== 'message') return null;

  const userId = event.source?.userId || null;

  if (event.message.type === 'text') {
    const userMessage = event.message.text.trim();
    const payload = await handleTextMessage(userId, userMessage);
    return replyPayload(event.replyToken, payload);
  }

  if (event.message.type === 'image') {
    return handleImageEvent(event, userId);
  }

  return replyPayload(event.replyToken, GENERAL_RESPONSES.notText);
}

async function handleImageEvent(event, userId) {
  try {
    console.log(`🖼️  [${userId || 'unknown'}] Received image event`);

    // ดึงรูปภาพจาก LINE API (returns ReadableStream in Node.js)
    const imageStream = await lineClient.getMessageContent(event.message.id);

    // แปลง stream เป็น buffer
    const chunks = [];
    for await (const chunk of imageStream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const base64 = buffer.toString('base64');

    // ตรวจสอบ mime type — LINE ส่งเป็น JPEG หรือ PNG
    const mimeType = 'image/jpeg';

    // ส่งให้ message handler ประมวลผล
    const payload = await handleTextMessage(userId, null, {
      type: 'image',
      imageBase64: base64,
      mimeType,
      messageId: event.message.id,
    });

    return replyPayload(event.replyToken, payload);
  } catch (error) {
    console.error('❌ Image handle error:', error.message);
    return replyPayload(event.replyToken, GENERAL_RESPONSES.error);
  }
}

async function replyPayload(replyToken, payload) {
  try {
    const message = typeof payload === 'string' ? { type: 'text', text: payload } : payload;
    return await lineClient.replyMessage({
      replyToken,
      messages: [message],
    });
  } catch (error) {
    if (error.originalError && error.originalError.response) {
      console.error('❌ LINE reply error:', JSON.stringify(error.originalError.response.data, null, 2));
    } else {
      console.error('❌ LINE reply error:', error.message);
    }
    return null;
  }
}

module.exports = {
  handleEvent,
  replyPayload,
};
