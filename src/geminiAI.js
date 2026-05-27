export async function callGeminiAI(prompt, options = {}) {
    const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
    
    if (!GEMINI_API_KEY) {
        throw new Error('Gemini API key nije konfigurisan!');
    }

    const { temperature = 0.7, maxOutputTokens = 4000 } = options;

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature, maxOutputTokens }
                })
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Gemini API greška: ${errorData.error?.message || 'Nepoznata greška'}`);
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!content) {
            throw new Error('Gemini nije vratio odgovor');
        }

        return content;

    } catch (error) {
        console.error('Gemini AI Error:', error);
        throw error;
    }
}

export async function callGeminiJSON(prompt, options = {}) {
    const content = await callGeminiAI(prompt, options);
    
    console.log('Raw AI response:', content); // DEBUG
    
    try {
        // Ukloni markdown code blocks
        let jsonText = content.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
        
        // Ako počinje sa tekstom pre JSON-a, nađi prvi { ili [
        const firstBrace = jsonText.indexOf('{');
        const firstBracket = jsonText.indexOf('[');
        
        if (firstBrace > 0 || firstBracket > 0) {
            const start = Math.min(
                firstBrace >= 0 ? firstBrace : Infinity,
                firstBracket >= 0 ? firstBracket : Infinity
            );
            jsonText = jsonText.substring(start);
        }
        
        // Ukloni tekst posle JSON-a
        const lastBrace = jsonText.lastIndexOf('}');
        const lastBracket = jsonText.lastIndexOf(']');
        
        if (lastBrace >= 0 || lastBracket >= 0) {
            const end = Math.max(lastBrace, lastBracket);
            jsonText = jsonText.substring(0, end + 1);
        }
        
        // Parse JSON
        return JSON.parse(jsonText);
        
    } catch (parseError) {
        console.error('JSON Parse Error:', parseError);
        console.log('Attempted to parse:', content);
        throw new Error('AI nije vratio validan JSON. Raw odgovor: ' + content.substring(0, 200));
    }
}
