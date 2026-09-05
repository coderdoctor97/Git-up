// AI Service - central abstraction for all AI calls
// Rest of Git-Up calls generateAI() rather than directly fetch or puter.ai.chat

import { AIProvider } from './provider-state.js';
import * as customProvider from './custom-provider.js';
import * as puterProvider from './puter-provider.js';
import { getPuter } from './puter-loader.js';

export { AIProvider };

// Normalized request shape:
// {
//   type: 'analyze' | 'insight' | 'recover' | 'chat',
//   repoUrl, expertise, mode, question, baseMode, session, failedStepId, errorText, etc
//   prompt?, messages?, systemPrompt?, model?, temperature?, maxTokens?
// }

// For custom provider, we delegate to server endpoints with config
// For puter provider, we call puter directly with file context if needed

let cachedContext = null;

async function fetchRepoContext(repoUrl) {
  // Fetch repo context from server - includes metadata and files with content for puter
  try {
    const response = await fetch('/api/puter-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl }),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload.ok) return null;
    return payload.context;
  } catch {
    return null;
  }
}

export async function generateAI(request, { activeProvider, customSettings, puterConnected } = {}) {
  const provider = activeProvider || AIProvider.CUSTOM;

  if (provider === AIProvider.PUTER) {
    // Puter provider - browser-side
    if (!puterConnected) throw new Error('Free AI not connected');
    
    // Check if puter SDK available and signed in
    const puter = getPuter();
    if (!puter) throw new Error('Puter SDK not loaded');

    // Route by type
    if (request.type === 'analyze') {
      // For analyze, we need repo context
      let context = request.context || cachedContext;
      if (!context || context.repo?.canonicalUrl !== request.repoUrl) {
        context = await fetchRepoContext(request.repoUrl);
        if (context) cachedContext = context;
      }
      if (!context) {
        // Fallback: use minimal context from request
        context = {
          repo: { canonicalUrl: request.repoUrl },
          metadata: {},
          files: [],
        };
      }
      return await puterProvider.generateGuide(context, request.expertise);
    }

    if (request.type === 'insight') {
      let context = request.context;
      if (!context) {
        context = await fetchRepoContext(request.repoUrl);
      }
      if (!context) context = { repo: { canonicalUrl: request.repoUrl }, metadata: {}, files: [] };
      return await puterProvider.generateInsight(context, request.mode, request.question, request.baseMode, request.session);
    }

    if (request.type === 'recover') {
      let context = request.context;
      if (!context) {
        context = await fetchRepoContext(request.repoUrl);
      }
      if (!context) context = { repo: { canonicalUrl: request.repoUrl }, metadata: {}, files: [] };
      // Merge recovery specific fields
      const fullContext = {
        ...context,
        failedStep: request.failedStep,
        errorText: request.errorText,
        remainingSteps: request.remainingSteps,
        completedSteps: request.completedSteps,
        requirements: request.requirements,
      };
      return await puterProvider.generateRecovery(fullContext);
    }

    if (request.type === 'chat' || request.prompt || request.messages) {
      return await puterProvider.chat(request);
    }

    throw new Error('Unknown AI request type for Puter provider');
  }

  if (provider === AIProvider.CUSTOM) {
    // Custom provider - server-side handling with config
    // This is handled by existing fetch logic in app.js, but we provide wrapper
    if (!customProvider.hasCustomConfig(customSettings)) {
      throw new Error('Custom API not configured');
    }
    // For custom, the caller should use server endpoints with config
    // We return null to indicate server handling
    return null;
  }

  throw new Error('No AI provider configured');
}

// Helper to check if we should use puter for a given activeProvider
export function shouldUsePuter(activeProvider, puterConnected) {
  return activeProvider === AIProvider.PUTER && puterConnected;
}

export function shouldUseCustom(activeProvider, customSettings) {
  return activeProvider === AIProvider.CUSTOM && customProvider.hasCustomConfig(customSettings);
}
