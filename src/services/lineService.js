/**
 * LINE Service
 * รับ event จาก LINE แล้วส่งต่อให้ message handler
 */
const axios = require('axios');
const { config } = require('../config');
const { handleTextMessage } = require('../handlers/messageHandler');
const { GENERAL_RESPONSES } = require('../messages');

const LINE_API_BASE = 'https://api.line.me/v2';

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
    console.log(`🖼️  [${userId || 'unknown'}] Received image event, messageId: ${event.message.id}`);

    // ดึงรูปภาพจาก LINE API โดยตรงด้วย axios
    const response = await axios.get(
      `${LINE_API_BASE}/bot/message/${event.message.id}/content`,
      {
        headers: {
          Authorization: `Bearer ${config.line.channelAccessToken}`,
        },
        responseType: 'arraybuffer',
      }
    );

    const buffer = Buffer.from(response.data);
    const base64 = buffer.toString('base64');
    const mimeType = response.headers['content-type'] || 'image/jpeg';

    console.log(`📦 Image size: ${buffer.length} bytes, mime: ${mimeType}`);

    const payload = await handleTextMessage(userId, null, {
      type: 'image',
      imageBase64: base64,
      mimeType,
      messageId: event.message.id,
    });

    return replyPayload(event.replyToken, payload);
  } catch (error) {
    console.error('❌ Image handle error:', error.message);
    if (error.response) {
      console.error('   LINE API error:', error.response.status, error.response.statusText);
    }
    return replyPayload(event.replyToken, GENERAL_RESPONSES.error);
  }
}

async function replyPayload(replyToken, payload) {
  try {
    const line = require('@line/bot-sdk');
    const lineClient = new line.messagingApi.MessagingApiClient({
      channelAccessToken: config.line.channelAccessToken,
    });
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
