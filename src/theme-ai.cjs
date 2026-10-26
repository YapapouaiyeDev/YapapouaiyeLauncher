const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_MODELS = [
  'nvidia/nemotron-3-super-120b-a12b',
  'nvidia/nemotron-3.5-lightning-30b-a3b',
  'nvidia/llama-3.1-nemotron-70b-instruct',
  'deepseek-ai/deepseek-v4.1-flash',
  'moonshotai/kimi-k2.6',
  'z-ai/glm-5.3-flash',
  'openai/gpt-oss-20b',
  'google/gemma-4-31b-it',
  'google/gemma-3-12b-it',
  'mistralai/mistral-large-2-instruct',
  'mistralai/mistral-7b-instruct-v0.3',
  'mistralai/codestral-22b-instruct-v0.1'
];

async function generateThemeAi(payload, fetchImpl = fetch) {
  const apiKey = typeof payload?.apiKey === 'string' ? payload.apiKey.trim() : '';
  const prompt = typeof payload?.prompt === 'string' ? payload.prompt.trim() : '';
  const requestedModel = payload?.model || 'auto';
  if (!apiKey || apiKey.length > 1024 || /[\r\n]/.test(apiKey)) return { success: false, error: 'Clé API NVIDIA NIM invalide.' };
  if (!prompt || prompt.length > 100000) return { success: false, error: 'Demande vide ou trop longue.' };
  if (requestedModel !== 'auto' && !NVIDIA_MODELS.includes(requestedModel)) return { success: false, error: 'Choisissez un modèle NVIDIA proposé dans la liste.' };
  try {
    const signal = AbortSignal.timeout(120000);
    const models = requestedModel === 'auto' ? NVIDIA_MODELS : [requestedModel];
    for (const model of models) {
      const response = await fetchImpl(NVIDIA_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 1, top_p: 0.95, max_tokens: model.startsWith('nvidia/') ? 8192 : 4096, stream: false,
          ...(model.includes('nemotron-3') || model === 'google/gemma-4-31b-it' ? { chat_template_kwargs: { enable_thinking: false } } : {}),
          ...(model === 'moonshotai/kimi-k2.6' ? { chat_template_kwargs: { thinking: false } } : {}),
          ...(model === 'openai/gpt-oss-20b' ? { reasoning_effort: 'low' } : {})
        }),
        signal, redirect: 'error'
      });
      if (!response.ok) {
        // Try another NVIDIA text model only when the requested model is missing.
        if (response.status === 404) {
          await response.body?.cancel();
          if (requestedModel === 'auto') continue;
          return { success: false, error: 'Ce modèle NVIDIA est introuvable ou inaccessible avec votre clé (404). Choisissez « Automatique » ou un autre modèle.' };
        }
        const error = response.status === 401 || response.status === 403 ? 'Clé NVIDIA refusée : vérifiez la clé et l’accès au modèle.'
          : response.status === 429 ? 'Limite NVIDIA atteinte. Réessayez plus tard.'
            : `NVIDIA NIM est indisponible (HTTP ${response.status}). Réessayez.`;
        return { success: false, error };
      }
      const data = await response.json();
      const choice = data.choices?.[0];
      if (choice?.finish_reason === 'length') return { success: false, error: 'Réponse NVIDIA incomplète. Simplifiez votre demande et réessayez.' };
      if (typeof choice?.message?.content !== 'string' || !choice.message.content.trim()) return { success: false, error: 'NVIDIA a renvoyé une réponse vide.' };
      return { success: true, content: choice.message.content, model };
    }
    return { success: false, error: 'Aucun des modèles proposés n’est accessible avec cette clé NVIDIA (404). Vérifiez les accès de votre compte sur NVIDIA Build ou utilisez « Copier le prompt IA ».' };
  } catch (error) {
    return { success: false, error: ['TimeoutError', 'AbortError'].includes(error.name)
      ? 'NVIDIA met trop de temps à répondre. Réessayez.' : 'Connexion à NVIDIA NIM impossible. Vérifiez votre connexion.' };
  }
}

module.exports = { generateThemeAi, NVIDIA_MODELS };
