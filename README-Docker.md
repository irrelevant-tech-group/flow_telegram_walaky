# Docker Deployment for Walaky Telegram Bot

## Prerequisites

1. **Docker** and **Docker Compose** installed
2. **creds.json** file with Google API credentials
3. Environment variables configured

## Required Environment Variables

Create a `.env` file in the project root with the following variables:

```bash
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here

# Google Gemini AI Configuration
GEMINI_API_KEY=your_gemini_api_key_here

# Google Sheets Configuration
PRODUCTS_SHEET_ID=your_products_sheet_id_here
DESTINATION_SHEET_ID=your_destination_sheet_id_here

# Optional: Node environment
NODE_ENV=production
```

## Required Files

1. **creds.json**: Google API credentials file (should be placed in the project root)

## Deployment Options

### Option 1: Using Docker Compose (Recommended)

```bash
# Build and start the container
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the container
docker-compose down
```

### Option 2: Using Docker directly

```bash
# Build the image
docker build -t walaky-telegram-bot .

# Run the container
docker run -d \
  --name walaky-telegram-bot \
  --restart unless-stopped \
  -v $(pwd)/creds.json:/app/creds.json:ro \
  -e TELEGRAM_BOT_TOKEN=your_token \
  -e GEMINI_API_KEY=your_key \
  -e PRODUCTS_SHEET_ID=your_sheet_id \
  -e DESTINATION_SHEET_ID=your_dest_sheet_id \
  walaky-telegram-bot
```

## Development

For development with hot reload:

```bash
# Build development image
docker build --target development -t walaky-telegram-bot:dev .

# Run with volume mount for live code changes
docker run -it \
  --name walaky-telegram-bot-dev \
  -v $(pwd)/src:/app/src \
  -v $(pwd)/creds.json:/app/creds.json:ro \
  -e TELEGRAM_BOT_TOKEN=your_token \
  -e GEMINI_API_KEY=your_key \
  -e PRODUCTS_SHEET_ID=your_sheet_id \
  -e DESTINATION_SHEET_ID=your_dest_sheet_id \
  walaky-telegram-bot:dev npm run dev
```

## Health Check

The container includes a health check that runs every 30 seconds. You can check the container status with:

```bash
docker ps
```

## Troubleshooting

1. **Container exits immediately**: Check that all environment variables are set correctly
2. **Credentials error**: Ensure `creds.json` is present and properly mounted
3. **Build fails**: Make sure all source files are present and TypeScript compilation succeeds

## Security Notes

- The container runs as a non-root user (`botuser`)
- Credentials file is mounted as read-only
- Environment variables should be kept secure and not committed to version control 