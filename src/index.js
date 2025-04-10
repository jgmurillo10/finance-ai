require("dotenv").config();
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const { GoogleGenAI, Type } = require("@google/genai");
const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");

// Initialize Express
const app = express();
const port = process.env.PORT || 3000;

// Initialize Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Define the response schema for financial data
const FINANCIAL_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    value: {
      type: Type.NUMBER,
      description: "The payment amount as a number",
      nullable: false,
    },
    description: {
      type: Type.STRING,
      description: "Brief description of what the payment was for",
      nullable: false,
    },
    category: {
      type: Type.STRING,
      description: "Category of the expense (e.g., food, transport, utilities)",
      nullable: false,
    },
    payed_at: {
      type: Type.STRING,
      description: "Payment date in ISO format",
      format: "date-time",
      nullable: true,
    },
    data: {
      type: Type.OBJECT,
      description: "Additional relevant information",
      properties: {
        location: {
          type: Type.STRING,
          description: "Place where the payment was made",
          nullable: true,
        },
        merchant: {
          type: Type.STRING,
          description: "Name of the merchant or service provider",
          nullable: true,
        },
        payment_method: {
          type: Type.STRING,
          description: "Method of payment (e.g., cash, card, transfer)",
          nullable: true,
        },
        notes: {
          type: Type.STRING,
          description: "Any additional notes or comments",
          nullable: true,
        },
      },
      nullable: true,
    },
  },
  required: ["value", "description", "category"],
  propertyOrdering: ["value", "description", "category", "payed_at", "data"],
};

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Prompt template for Gemini
const EXTRACTION_PROMPT = `Extract financial information from the input.

For images, look for receipts, invoices, or any text containing payment information.
For text messages, analyze the content for payment details.

Focus on extracting:
- Payment amount (in numbers)
- Payment description
- Category (e.g., food, transport, utilities)
- Date (if mentioned)
- Additional details like location, merchant, payment method, or any relevant notes`;

// Function to process financial data
async function processFinancialData(financialData, chatId) {
  if (financialData && financialData.value !== null) {
    // Set current date as fallback for payed_at if not provided
    if (!financialData.payed_at) {
      financialData.payed_at = new Date().toISOString();
    }

    // Store in Supabase
    const { data, error } = await supabase.from("payments").insert([
      {
        value: financialData.value,
        description: financialData.description,
        category: financialData.category,
        payed_at: financialData.payed_at,
        data: financialData.data,
      },
    ]);

    if (error) {
      console.error("Supabase error:", error);
      await bot.sendMessage(
        chatId,
        "Sorry, there was an error saving your payment information."
      );
      return;
    }

    // Build response message
    let responseMessage =
      `✅ Payment recorded!\n\n` +
      `Amount: $${financialData.value}\n` +
      `Description: ${financialData.description}\n` +
      `Category: ${financialData.category}\n` +
      `Date: ${new Date(financialData.payed_at).toLocaleDateString()}`;

    if (financialData.data) {
      if (financialData.data.location) {
        responseMessage += `\nLocation: ${financialData.data.location}`;
      }
      if (financialData.data.merchant) {
        responseMessage += `\nMerchant: ${financialData.data.merchant}`;
      }
      if (financialData.data.payment_method) {
        responseMessage += `\nPayment Method: ${financialData.data.payment_method}`;
      }
      if (financialData.data.notes) {
        responseMessage += `\nNotes: ${financialData.data.notes}`;
      }
    }

    await bot.sendMessage(chatId, responseMessage);
  } else {
    await bot.sendMessage(
      chatId,
      "I couldn't find any payment information in your message. Please make sure to include an amount and description."
    );
  }
}

// Function to convert image to base64
async function getImageAsBase64(url) {
  const response = await axios.get(url, { responseType: "arraybuffer" });
  return Buffer.from(response.data).toString("base64");
}

// Handle incoming messages
bot.on("message", async (msg) => {
  try {
    let contents;

    // Check if the message contains a photo
    if (msg.photo) {
      // Get the file path of the largest photo (last in array)
      const photo = msg.photo[msg.photo.length - 1];
      const fileInfo = await bot.getFile(photo.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;

      // Convert image to base64
      const imageBase64 = await getImageAsBase64(fileUrl);

      // Create content with image
      contents = [
        EXTRACTION_PROMPT,
        {
          inlineData: {
            data: imageBase64,
            mimeType: "image/jpeg",
          },
        },
      ];
    } else if (msg.text) {
      // Handle text messages
      contents = EXTRACTION_PROMPT + "\n\nMessage to analyze: " + msg.text;
    } else {
      await bot.sendMessage(
        msg.chat.id,
        "Please send a text message or an image containing payment information."
      );
      return;
    }

    // Generate content with structured output
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: FINANCIAL_SCHEMA,
      },
    });

    console.log("Gemini response:", response.text);

    let financialData;
    try {
      financialData = JSON.parse(response.text);
    } catch (e) {
      console.error("Failed to parse Gemini response:", e);
      console.error("Raw response:", response.text);
      await bot.sendMessage(
        msg.chat.id,
        "Sorry, I couldn't understand the financial information in your message."
      );
      return;
    }

    await processFinancialData(financialData, msg.chat.id);
  } catch (error) {
    console.error("Error processing message:", error);
    await bot.sendMessage(
      msg.chat.id,
      "Sorry, there was an error processing your message."
    );
  }
});

// Start Express server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
