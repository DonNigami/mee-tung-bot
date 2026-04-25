/**
 * LINE Service
 * รับ event จาก LINE แล้วส่งต่อให้ message handler
 */
const line = require('@line/bot-sdk');
const { Readable } = require('stream');
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
    console.log(`🖼️  [${userId || 'unknown'}] Received image event, messageId: ${event.message.id}`);

    // ดึงรูปภาพจาก LINE API
    const imageResult = await lineClient.getMessageContent(event.message.id);
    console.log('📦 Image result type:', typeof imageResult, imageResult && imageResult.constructor && imageResult.constructor.name);

    let buffer;
    if (Buffer.isBuffer(imageResult)) {
      buffer = imageResult;
    } else if (imageResult instanceof Uint8Array) {
      buffer = Buffer.from(imageResult);
    } else if (typeof imageResult.pipe === 'function') {
      // Node.js ReadableStream
      buffer = await streamToBuffer(imageResult);
    } else if (imageResult && typeof imageResult.pipe === 'function') {
      buffer = await streamToBuffer(imageResult);
    } else {
      // fallback: treat as whatever we got
      buffer = Buffer.from(String(imageResult));
    }

    console.log(`📦 Image size: ${buffer.length} bytes`);
    const base64 = buffer.toString('base64');

    const mimeType = 'image/jpeg';

    const payload = await handleTextMessage(userId, null, {
      type: 'image',
      imageBase64: base64,
      mimeType,
      messageId: event.message.id,
    });

    return replyPayload(event.replyToken, payload);
  } catch (error) {
    console.error('❌ Image handle error:', error.message, error.stack);
    return replyPayload(event.replyToken, GENERAL_RESPONSES.error);
  }
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
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
