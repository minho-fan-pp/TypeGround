import OpenAI from "openai";
import { Logger, LogLevel } from "../utils/logMethods";
import { isQuotedUnionBySplit } from "../utils/tool";

declare global {
    var LLM_BASE_URL: string | undefined;
    var LLM_API_KEY: string | undefined;
    var LLM_MODEL: string | undefined;
}

const defaultLLMConfig = {
    baseURL: '',
    apiKey: '',
    model: "gpt-4.1",
};

function getLLMConfig() {
    return {
        baseURL: globalThis.LLM_BASE_URL ?? defaultLLMConfig.baseURL,
        apiKey: globalThis.LLM_API_KEY ?? defaultLLMConfig.apiKey,
        model: globalThis.LLM_MODEL ?? defaultLLMConfig.model,
    };
}
const logger = new Logger({
    level: LogLevel.DEBUG,
    format: "{time} [{level}] > {message}",
});
export class LLMAgent {
    private openai: OpenAI;
    private total_prompt: string = "";
    private basePrompt = "Next, you will be provided with a piece of TypeScript code slice. You will infer the variable type or function return type in TypeScript and fill in the type annotation in <mask>. Output just only the type ,which you infer, nothing else,\n";
    private example_prompt = "Example output: mask: string\n";
    constructor() {
        const { baseURL, apiKey } = getLLMConfig();
        this.openai = new OpenAI({ baseURL, apiKey });
    }
    async Generation(prompts: string[], CODE: string) {
        let totalPrompt = this.basePrompt + this.example_prompt;
        prompts.forEach(prompt => {
            totalPrompt += `${prompt}\n`;
        });
        totalPrompt += `The code you need to make a prediction is:\n${CODE}`;
        this.total_prompt = totalPrompt;
        const completion = await this.openai.chat.completions.create({
            messages: [{ role: "user", content: totalPrompt }],
            model: getLLMConfig().model,
            max_tokens: 50,
            temperature: 0.2,
            top_p: 0.3,
        });
        try {
            if (completion.choices.length > 0) {
                logger.info(`final return ans:${completion.choices[0]?.message.content}`);
                return completion.choices[0]?.message.content;
            }
            else
                return "output is empty";
        }
        catch (e) {
            return "output is empty";
        }
    }
    public async GenerationType(CODE: string, typePrompt: string[] = []) {
        if (CODE.length > 2048 * 5) {
            return "too long for CODE";
        }
        let extra_prompt = "The possible types analyzed from the import information are: ";
        for (const t of typePrompt) {
            extra_prompt = extra_prompt + "\n" + t;
        }
        let otherPrompt = typePrompt.length > 0 ? [extra_prompt] : [];
        let ans = await this.Generation(otherPrompt, CODE);
        let ansFix = ans?.replace("mask:", "");
        ansFix = ansFix?.replace("mask:", "");
        ansFix = ansFix?.replace("<mask>", "").replace("<mask>:", "");
        ansFix = ansFix?.replace("(mask)", "").replace("(mask):", "");
        return this.fixAns(ansFix);
    }
    private fixAns(ans: any): string {
        ans = ans.replace("mask:", "");
        ans = ans.replace("<mask>", "").replace("<mask>:", "");
        ans = ans.replace("(mask)", "").replace("(mask):", "");
        ans = ans.trim();
        ans = ans.replace("RefObject", "MutableRefObject");
        if (isQuotedUnionBySplit(ans)) {
            ans = "string";
        }
        if (ans == "any") {
            ans = "object";
        }
        else if (ans.startsWith("(") && ans.endsWith(")")) {
            ans = ans.slice(1, -1);
        }
        return ans;
    }
    public getTotalPrompt() {
        return this.total_prompt;
    }
}
