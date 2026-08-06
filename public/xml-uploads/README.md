# 📁 xml-uploads — Bot XML Files

This folder is where you place your trading bot XML strategy files.

## How to Add a New Bot

1. **Drop your `.xml` file** into this folder  
   e.g. `MY NEW BOT.xml`

2. **Add an entry to `bots.json`**:
   ```json
   {
     "name": "MY NEW BOT",
     "file": "MY NEW BOT.xml",
     "description": "Short description of what this bot does.",
     "difficulty": "Intermediate",
     "strategy": "My Strategy Name"
   }
   ```

3. **Refresh the app** — the bot card will appear automatically on the Trading Bots tab.

## Fields in bots.json

| Field | Required | Description |
|-------|----------|-------------|
| `name` | ✅ | Display name shown on the card |
| `file` | ✅ | Exact filename of the `.xml` file |
| `description` | ❌ | Card description text |
| `difficulty` | ❌ | `Beginner`, `Intermediate`, or `Advanced` |
| `strategy` | ❌ | Strategy label shown as a tag |

## How it Works

The app fetches `/xml-uploads/bots.json` at startup, then loads each listed `.xml` file.  
XML files are cached in the browser (IndexedDB + LZ compression) for faster subsequent loads.  
Clicking **⚡ LOAD PREMIUM BOT** imports the strategy directly into the Bot Builder workspace.
