# Finance AI Bot

A Telegram bot that automatically extracts financial information from messages using Google's Gemini AI and stores it in a Supabase database.

## Features

- Processes incoming Telegram messages
- Uses Gemini AI to extract financial information
- Stores payment data in Supabase
- Provides immediate feedback on processed messages

## Prerequisites

- Node.js (v14 or higher)
- A Telegram Bot Token (get it from [@BotFather](https://t.me/botfather))
- A Google AI (Gemini) API key
- A Supabase account and project

## Setup

1. Clone the repository:

```bash
git clone https://github.com/yourusername/finance-ai.git
cd finance-ai
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file with your credentials:

```
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
GEMINI_API_KEY=your_gemini_api_key
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
```

4. Set up your Supabase database with the following schema:

```sql
create table payments (
  id serial primary key,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  value float4,
  description text,
  payed_at timestamp with time zone,
  category text,
  data jsonb
);
```

## Running the Application

Development mode:

```bash
npm run dev
```

Production mode:

```bash
npm start
```

## Usage

1. Start a chat with your bot on Telegram
2. Send a message containing financial information (e.g., "Paid $50 for groceries yesterday")
3. The bot will extract the information and store it in your database
4. You'll receive a confirmation message with the extracted details

## Example Messages

- "Spent $25.50 on lunch today"
- "Paid the electricity bill, $150"
- "Monthly rent payment $1200 for January"
