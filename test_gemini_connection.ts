import { GoogleGenAI } from "@google/genai";

async function testGemini() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("Error: GEMINI_API_KEY environment variable is not set.");
        process.exit(1);
    }

    const ai = new GoogleGenAI({ apiKey });
    const modelName = "gemini-3-flash-preview";

    console.log(`Testing connection to model: ${modelName}...`);

    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: [{ role: "user", parts: [{ text: "Hello! Which model are you?" }] }],
        });

        const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log("Success! Response received:");
        console.log(text);
    } catch (error: any) {
        console.error("Error generating content:", error.message);
        if (error.response) {
            console.error("Response data:", JSON.stringify(error.response.data, null, 2));
        }
        process.exit(1);
    }
}

testGemini();
