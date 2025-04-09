require("dotenv").config();
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { createClient } = require("@supabase/supabase-js");

// Initialize Express
const app = express();
const port = process.env.PORT || 3000;

// Initialize Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Prompt template for Gemini
const EXTRACTION_PROMPT = `You are a financial data extraction assistant. Your task is to extract financial information from messages and return it in a specific JSON format.

When given a message, analyze it and extract:
- Payment amount (in numbers)
- Payment description
- Category (e.g., food, transport, utilities)
- Date (if mentioned)

IMPORTANT: You must ONLY return a valid JSON object with the following structure:
{
  "value": <number>,
  "description": "<string>",
  "category": "<string>",
  "payed_at": "<ISO date string or null>",
  "data": {}
}

If no financial information is found, return exactly: {"value": null, "description": null, "category": null, "payed_at": null, "data": {}}

DO NOT include any additional text, explanations, or formatting - ONLY the JSON object.
`;

// Handle incoming messages
bot.on("message", async (msg) => {
  try {
    // Generate response from Gemini
    const prompt = EXTRACTION_PROMPT + "\n\nMessage to analyze: " + msg.text;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    console.log("Gemini response:", text);

    let financialData;
    try {
      financialData = JSON.parse(text);
    } catch (e) {
      console.error("Failed to parse Gemini response:", e);
      console.error("Raw response:", text);
      await bot.sendMessage(
        msg.chat.id,
        "Sorry, I couldn't understand the financial information in your message."
      );
      return;
    }

    if (financialData && financialData.value !== null) {
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
          msg.chat.id,
          "Sorry, there was an error saving your payment information."
        );
        return;
      }

      await bot.sendMessage(
        msg.chat.id,
        `✅ Payment recorded!\n\n` +
          `Amount: $${financialData.value}\n` +
          `Description: ${financialData.description}\n` +
          `Category: ${financialData.category}` +
          (financialData.payed_at
            ? `\nDate: ${new Date(financialData.payed_at).toLocaleDateString()}`
            : "")
      );
    } else {
      await bot.sendMessage(
        msg.chat.id,
        "I couldn't find any payment information in your message. Please make sure to include an amount and description."
      );
    }
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
