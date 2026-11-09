import { create } from 'zustand';
import { loadModel, unloadModel, completion, LLAMA_3_2_1B_INST_Q4_0 } from '@qvac/sdk';

/**
 * On-device wallet assistant, powered by QVAC (@qvac/sdk).
 *
 * QVAC runs llama.cpp inside its OWN Bare worklet (react-native-bare-kit),
 * separate from the WDK wallet worklet. The two never talk to each other:
 * the assistant only sees the read-only wallet summary that the screen puts
 * into the system prompt (see walletContext.ts). It cannot sign or send.
 *
 * Model: Llama 3.2 1B Instruct, Q4_0 (~770 MB). It is downloaded once on
 * first use (QVAC caches it in the app's document directory), then every
 * prompt runs fully offline on the phone.
 */

export type ModelStatus = 'idle' | 'downloading' | 'loading' | 'ready' | 'error';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AssistantState {
  status: ModelStatus;
  /** 0–100 while status === 'downloading'. */
  progress: number;
  downloadedMb: number;
  totalMb: number;
  error: string | null;
  modelId: string | null;
  messages: ChatMessage[];
  generating: boolean;

  loadModel: () => Promise<void>;
  unloadModel: () => Promise<void>;
  ask: (question: string, systemPrompt: string) => Promise<void>;
  clearChat: () => void;
}

const MAX_HISTORY_MESSAGES = 8; // keeps the prompt inside a 1B model's comfortable context

const mb = (bytes: number | undefined) => (bytes ? bytes / 1e6 : 0);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useAssistant = create<AssistantState>((set, get) => ({
  status: 'idle',
  progress: 0,
  downloadedMb: 0,
  totalMb: 0,
  error: null,
  modelId: null,
  messages: [],
  generating: false,

  loadModel: async () => {
    const { status } = get();
    if (status === 'ready' || status === 'downloading' || status === 'loading') return;

    set({ status: 'loading', error: null, progress: 0 });
    try {
      const modelId = await loadModel({
        modelSrc: LLAMA_3_2_1B_INST_Q4_0,
        modelConfig: { ctx_size: 2048 },
        onProgress: (p) => {
          // Fires only while the weights are being downloaded; once they
          // are cached locally the load goes straight to 'ready'.
          set({
            status: 'downloading',
            progress: p.percentage ?? 0,
            downloadedMb: mb(p.downloaded),
            totalMb: mb(p.total),
          });
        },
      });
      set({ status: 'ready', modelId });
    } catch (error) {
      set({ status: 'error', error: errorMessage(error) });
    }
  },

  unloadModel: async () => {
    const { modelId } = get();
    if (!modelId) return;
    try {
      // clearStorage: false keeps the downloaded weights for next time.
      await unloadModel({ modelId, clearStorage: false });
    } finally {
      set({ status: 'idle', modelId: null, generating: false });
    }
  },

  ask: async (question, systemPrompt) => {
    const { modelId, messages, generating } = get();
    if (!modelId || generating) return;

    const userMessage: ChatMessage = { role: 'user', content: question };
    const prior = [...messages, userMessage].slice(-MAX_HISTORY_MESSAGES);
    set({ messages: [...messages, userMessage, { role: 'assistant', content: '' }], generating: true });

    const appendToReply = (text: string) =>
      set((state) => {
        const next = state.messages.slice();
        const last = next[next.length - 1];
        next[next.length - 1] = { ...last, content: last.content + text };
        return { messages: next };
      });

    try {
      const run = completion({
        modelId,
        history: [{ role: 'system', content: systemPrompt }, ...prior],
        stream: true,
      });
      for await (const token of run.tokenStream) appendToReply(token);
    } catch (error) {
      appendToReply(`\n\n⚠️ ${errorMessage(error)}`);
    } finally {
      set({ generating: false });
    }
  },

  clearChat: () => set({ messages: [] }),
}));
