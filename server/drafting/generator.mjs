/** Fixed provider adapter. Never executes source content or generated instructions. */
import { InputError, fields } from '../workflow-input.mjs';
import { RULES_ENGINE, DRAFTING_INSTRUCTIONS, PROMPT_VERSION, PROMPT_DIGEST, OUTPUT_SCHEMA, normalizeSource, validateGenerated } from './contracts.mjs';

const fail = (code, message, status = 503) => { throw new InputError(code, message, status); };
export function loadDraftingConfig(env = process.env) {
    const enabled = env.QIVVERA_DRAFTING_ENABLED === 'true', openaiEnabled = env.QIVVERA_DRAFTING_OPENAI_ENABLED === 'true';
    if (openaiEnabled && !enabled) throw new Error('DRAFTING_OPENAI_REQUIRES_DRAFTING');
    if (!openaiEnabled) return Object.freeze({ enabled, openaiEnabled: false });
    const model = env.QIVVERA_DRAFTING_OPENAI_MODEL, apiKey = env.QIVVERA_DRAFTING_OPENAI_API_KEY;
    if (typeof model !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(model)) throw new Error('DRAFTING_MODEL_REQUIRED');
    if (typeof apiKey !== 'string' || !/^[A-Za-z0-9._-]{16,512}$/.test(apiKey)) throw new Error('DRAFTING_PROVIDER_CREDENTIAL_REQUIRED');
    return Object.freeze({ enabled, openaiEnabled, model, apiKey });
}
export function extractExplicitClauses(sourceText) {
    const source = normalizeSource(sourceText), suggestions = [], warnings = new Set(), seen = new Set();
    const normative = /\b(?:must|shall|required\s+to|may\s+not|prohibited\s+from)\b/i;
    source.split('\n').forEach((line, i) => {
        const quote = line.trim();
        if (!normative.test(quote)) return;
        if (quote.length > 1200) { warnings.add('LONG_CLAUSES_SKIPPED'); return; }
        const key = quote;
        if (seen.has(key)) return;
        seen.add(key);
        if (suggestions.length === 8) { warnings.add('LIMIT_REACHED'); return; }
        suggestions.push({ statement: quote, quote, startLine: i + 1, endLine: i + 1 });
    });
    return validateGenerated(source, { engine: RULES_ENGINE, suggestions, warnings: [...warnings] }, 'rules');
}

export async function generateDrafts(sourceText, method, config = {}) {
    const source = normalizeSource(sourceText);
    if (method === 'rules') return extractExplicitClauses(source);
    if (method !== 'openai' || config.openaiEnabled !== true || !config.apiKey || !config.model)
        fail('DRAFTING_PROVIDER_UNAVAILABLE', 'AI drafting is not configured. Ask the workspace operator, or explicitly choose built-in clauses.');
    // The fetch override is constructor-only test injection. It is never accepted from an API body.
    const fetchFn = config.fetchFn ?? fetch;
    const controller = new AbortController(), timeoutMs = 15000;
    let timedOut = false, reader;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    timer.unref?.();
    const request = { model: config.model, store: false, background: false, stream: false,
        instructions: DRAFTING_INSTRUCTIONS,
        input: [{ role: 'user', content: [{ type: 'input_text', text: JSON.stringify({ sourceLines: source.split('\n').map((text, i) => ({ line: i + 1, text })) }) }] }],
        tools: [], max_output_tokens: 3000,
        text: { format: { type: 'json_schema', name: 'qivvera_obligation_drafts', strict: true, schema: OUTPUT_SCHEMA } } };
    try {
        const response = await fetchFn('https://api.openai.com/v1/responses', { method: 'POST', redirect: 'manual', signal: controller.signal,
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${config.apiKey}` }, body: JSON.stringify(request) });
        if (response.status !== 200) {
            await response.body?.cancel();
            if (response.status === 429) fail('DRAFTING_PROVIDER_RATE_LIMITED', 'The AI provider limited this request. Check the saved run before explicitly trying later.', 429);
            if ([401, 403].includes(response.status)) fail('DRAFTING_PROVIDER_ACCESS_FAILED', 'The configured AI provider access is unavailable. Contact the workspace operator.');
            fail('DRAFTING_PROVIDER_UNAVAILABLE', 'The AI provider could not complete this request. No candidates were created.');
        }
        if (!response.headers.get('content-type')?.includes('application/json') || Number(response.headers.get('content-length') ?? 0) > 131072) {
            await response.body?.cancel(); fail('DRAFTING_PROVIDER_INVALID_RESPONSE', 'The AI provider returned an unsupported response.', 502);
        }
        reader = response.body?.getReader();
        if (!reader) fail('DRAFTING_PROVIDER_INVALID_RESPONSE', 'The AI provider returned no response body.', 502);
        const chunks = []; let bytes = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.length;
            if (bytes > 131072) { await reader.cancel(); fail('DRAFTING_PROVIDER_INVALID_RESPONSE', 'The AI provider response exceeded the supported limit.', 502); }
            chunks.push(Buffer.from(value));
        }
        let raw;
        try { raw = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { fail('DRAFTING_PROVIDER_INVALID_RESPONSE', 'The AI provider returned invalid JSON.', 502); }
        if (raw.status === 'incomplete') fail('DRAFTING_PROVIDER_INCOMPLETE', 'The AI response was incomplete. Review the source manually or explicitly request another run.', 502);
        if (raw.status !== 'completed' || !Array.isArray(raw.output)) fail('DRAFTING_PROVIDER_INVALID_RESPONSE', 'The AI provider did not return a completed result.', 502);
        const contents = [];
        for (const item of raw.output) {
            if (item.type === 'reasoning') continue;
            if (item.type !== 'message' || item.role !== 'assistant' || item.status !== 'completed' || !Array.isArray(item.content))
                fail('DRAFTING_PROVIDER_INVALID_RESPONSE', 'The AI provider returned an unsupported output type.', 502);
            for (const part of item.content) {
                if (part.type === 'refusal') fail('DRAFTING_PROVIDER_REFUSED', 'The AI provider declined this source. No candidates were created.', 502);
                if (part.type !== 'output_text' || typeof part.text !== 'string') fail('DRAFTING_PROVIDER_INVALID_RESPONSE', 'The AI provider returned unsupported content.', 502);
                contents.push(part.text);
            }
        }
        if (contents.length !== 1 || contents[0].length > 30000) fail('DRAFTING_PROVIDER_INVALID_RESPONSE', 'The AI provider returned an unexpected result shape.', 502);
        let output;
        try { output = JSON.parse(contents[0]); fields(output, ['suggestions']); }
        catch { fail('DRAFTING_PROVIDER_INVALID_RESPONSE', 'The AI provider did not return the required drafting object.', 502); }
        return validateGenerated(source, { suggestions: output.suggestions, warnings: [], engine: {
            method: 'openai', id: 'openai-responses', version: '1.0.0', provider: 'openai',
            requestedModel: config.model, model: raw.model, responseId: raw.id, promptVersion: PROMPT_VERSION, promptDigest: PROMPT_DIGEST,
        } }, 'openai');
    } catch (e) {
        if (e instanceof InputError) throw e;
        if (timedOut || e?.name === 'TimeoutError' || e?.name === 'AbortError') fail('DRAFTING_PROVIDER_TIMEOUT', 'The AI request timed out. Its saved run will show failure; it is not retried automatically.');
        fail('DRAFTING_PROVIDER_UNAVAILABLE', 'The AI provider could not be reached. No candidates were created.');
    } finally {
        clearTimeout(timer);
        reader?.releaseLock();
    }
}
