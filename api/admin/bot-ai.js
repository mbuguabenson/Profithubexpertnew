'use strict';

const { GoogleGenAI } = require('@google/genai');

// Ensure you have VITE_GEMINI_API_KEY or GEMINI_API_KEY in your .env
// We'll fall back to checking the environment variables.
const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

// We initialize the client if we have a key
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

const SYSTEM_PROMPT = `You are an expert Deriv Bot builder AI. 
Your job is to generate a valid Blockly XML structure for a Deriv trading bot based on the user's prompt.
The XML MUST be a valid Blockly workspace representation, and it MUST have is_dbot="true" on the root <xml> element.
A basic Deriv bot requires these main blocks:
1. trade_definition (Trade parameters: market, submarket, symbol, trade type, stake/payout, duration)
2. before_purchase (Purchase conditions: e.g. Buy Call if RSI > 70)
3. after_purchase (Trade again logic, take profit, stop loss)

Always return the raw XML code, enclosed in \`\`\`xml and \`\`\` tags.
Do not include any explanation, only the XML block.
Make sure the blocks are properly connected.
If the prompt doesn't specify an indicator, just output a simple structure.`;

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!ai) {
        return res.status(500).json({ 
            error: 'Gemini API key is not configured on the server. Please set VITE_GEMINI_API_KEY in your environment.' 
        });
    }

    try {
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        console.log(\`[Bot AI] Generating bot for prompt: "\${prompt}"\`);

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash', // We can use gemini-2.5-flash for fast text generation
            contents: prompt,
            config: {
                systemInstruction: SYSTEM_PROMPT,
                temperature: 0.2, // Low temperature for more deterministic code generation
            }
        });

        const text = response.text;
        
        // Extract XML from the markdown block
        let xmlStr = text;
        const xmlMatch = text.match(/\`\`\`xml\\n([\\s\\S]*?)\`\`\`/);
        if (xmlMatch && xmlMatch[1]) {
            xmlStr = xmlMatch[1].trim();
        } else {
            // Strip any leading/trailing ticks just in case
            xmlStr = xmlStr.replace(/^\`\`\`(xml)?/i, '').replace(/\`\`\`$/g, '').trim();
        }

        return res.status(200).json({ xml: xmlStr });
    } catch (error) {
        console.error('[Bot AI] Error generating bot:', error);
        return res.status(500).json({ 
            error: 'Failed to generate bot strategy.', 
            details: error.message 
        });
    }
};
