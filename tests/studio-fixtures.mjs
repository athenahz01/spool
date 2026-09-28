export function memoryStudioStore() {
  const records = new Map();
  const budgets = new Map();
  return {
    list: async () => [...records.values()], get: async (id) => records.get(id), put: async (id, value) => { records.set(id, structuredClone(value)); },
    claim: async (id, value) => { if (records.has(id)) return false; records.set(id, structuredClone(value)); return true; },
    reserve: async (day, limit) => { const used = budgets.get(day) || 0; if (used >= limit) return false; budgets.set(day, used + 1); return true; },
    used: async (day) => budgets.get(day) || 0,
    releaseUnspent: async (id) => { if (records.get(id)?.status === 'pending') records.delete(id); }
  };
}
export const studioFixture = {
  captures: Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, status: 'ready', sourceCoverage: 'complete', intents: ['knowledge', 'script'], title: `AI workflow ${i}`, topic: `Agent workflow ${i}`, summary: 'Give each agent a small task and a clear handoff.', takeaways: ['Assign one job per agent.'], action: 'Test one small task.', creator: '@example', url: `https://www.instagram.com/reel/example${i}/`, transcriptStatus: 'ready', transcript: 'A long private transcript that must not go into the prompt. '.repeat(1000), hook: 'Your AI team needs a job description.' })),
  playbooks: [{ id: 'run-small-ai-team', title: 'Run a small AI team', outcome: 'Build useful agents.', sourceIds: ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7'] }]
};
export async function fakeStudioGenerate(kind, context) {
  const ids = context.sources.map((s) => s.id);
  const result = kind === 'series' ? { title: 'One useful AI helper', promise: 'Small, practical experiments for your first AI workflow.', episodes: ['Give the helper one job', 'Teach it what good looks like', 'Make the handoff explicit', 'Test the smallest useful version'].map((title, i) => ({ title, angle: `A practical demonstration of ${context.sources[i % ids.length].title}.`, payoff: 'One small experiment to try, with a clear way to check the result.', sourceIds: [ids[i % ids.length]] })) }
    : kind === 'research' ? { blocks: [{ text: 'Preview research note: check current official guidance before relying on a tool capability. This is simulated content, not real research.', citations: [{ title: 'Example official documentation', url: 'https://platform.claude.com/docs/en/home' }] }] }
    : { hooks: ['Before you build an AI team, give one helper a job.', 'More agents will not fix an unclear task.', 'Start with one task you can actually check.'], script: 'Before you build an AI team, give one helper a job.\n\nHere is a small experiment worth trying. Choose one repetitive task, write down the input it needs, and describe exactly what a useful result looks like.\n\nThen test that one step before adding another agent. If the result is vague, make the instructions more specific. A clear handoff matters more than the size of the team.\n\n[Add your own real example after trying this.]\n\nWhat is one task you would start with?', caption: 'One clear job is a useful place to start. Save this for your next small experiment.', shots: ['Open on the task written in a notebook.', 'Show the input and expected output side by side.'], factChecks: ['Try the workflow before claiming it worked for you.'], sourceIds: ids.slice(0, 2) };
  return { result, model: 'simulated-preview', usage: { input_tokens: 0, output_tokens: 0 } };
}
