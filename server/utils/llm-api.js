const callGroq = async (prompt) => {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
            model: "llama-3.1-8b-instant",
            messages: [{ role: "user", content: prompt }]
        })
    });
    if (!res.ok) throw new Error("Groq failed");
    const data = await res.json();
    return data.choices[0].message.content;
};

const callOpenRouter = async (prompt) => {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`
        },
        body: JSON.stringify({
            model: "openai/gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }]
        })
    });
    if (!res.ok) throw new Error("OpenRouter failed");
    const data = await res.json();
    return data.choices[0].message.content;
};

const callHuggingFace = async (prompt) => {
    const res = await fetch("https://api-inference.huggingface.co/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.HUGGINGFACE_API_KEY}`
        },
        body: JSON.stringify({
            model: "meta-llama/Meta-Llama-3-8B-Instruct",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 2048
        })
    });
    if (!res.ok) throw new Error("HuggingFace failed");
    const data = await res.json();
    return data.choices[0].message.content;
};

const callGemini = async (prompt) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    if (!res.ok) throw new Error("Gemini failed");
    const data = await res.json();
    return data.candidates[0].content.parts[0].text;
};

const callRaiden = async (prompt) => {
    const url = new URL("https://api.raiden.ovh/ai/generate");
    url.searchParams.set("model", "claude-sonnet-4");
    url.searchParams.set("text", prompt);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("Raiden failed");
    const data = await res.json();
    if (!data.success) throw new Error("Raiden success=false");
    return data.generated_text;
};

let currentApiIndex = 0;

async function CallAPI(input, targetModel = 'auto') {
    const apis = [
        { name: "raiden", fn: callRaiden },
        { name: "openrouter", fn: callOpenRouter },
        { name: "groq", fn: callGroq },
        { name: "gemini", fn: callGemini }
    ];
    
    let attempts = 0;
    const maxAttempts = apis.length;
    let failureLog = [];

    if (targetModel !== 'auto') {
        const api = apis.find(a => a.name === targetModel);
        if (api) {
            try {
                return await api.fn(input);
            } catch (error) {
                throw new Error(`${api.name} fails: ${error.message}`);
            }
        }
    }

    while (attempts < maxAttempts) {
        const api = apis[currentApiIndex];
        try {
            const response = await api.fn(input);
            return response; 
        } catch (error) {
            console.error(`${api.name} failed:`, error.message);
            failureLog.push(`${api.name} fails`);
            currentApiIndex = (currentApiIndex + 1) % apis.length;
            attempts++;
        }
    }

    throw new Error(`To much request please try after some time\n\nList of failures:\n${failureLog.join("\n")}`);
}

function buildAgentPrompt(agentRole, code, instructions) {
    const template = `${agentRole}\n\n## Code to Analyze\n\`\`\`\n${code}\n\`\`\`\n\n## Your Instructions\n${instructions}\n\nProvide a thorough, structured analysis. Include a confidence score (0-100) at the end.`;

    if (template.length <= 3000) {
        return template;
    }

    const overhead = template.length - code.length;
    const maxCodeLength = 3000 - overhead - 20;
    const truncatedCode = code.slice(0, maxCodeLength) + "\n[truncated]";

    return `${agentRole}\n\n## Code to Analyze\n\`\`\`\n${truncatedCode}\n\`\`\`\n\n## Your Instructions\n${instructions}\n\nProvide a thorough, structured analysis. Include a confidence score (0-100) at the end.`;
}

module.exports = {
    callGroq,
    callOpenRouter,
    callHuggingFace,
    callGemini,
    callRaiden,
    CallAPI,
    buildAgentPrompt
};
